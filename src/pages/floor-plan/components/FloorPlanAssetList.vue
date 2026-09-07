<script setup lang="ts">
/**
 * รายการสินทรัพย์ในห้องที่เลือก - คอลัมน์ขวาของหน้าแผนผัง
 *
 * โหลดใหม่ทุกครั้งที่เปลี่ยนห้อง ไม่โหลดล่วงหน้าทั้งชั้น: ผู้ใช้ดูทีละห้อง และของในห้อง
 * เปลี่ยนได้ตลอดเวลา (คนอื่นย้ายของอยู่) โหลดตอนเลือกจึงได้ของสดกว่าและไม่ดึงทิ้ง 57 ห้อง
 *
 * ── โหลดทีละหน้า (หน้าละ 50) แทนการดึงทีเดียวแล้วตัดที่ 200
 *
 * ของเดิมตัดที่ 200 แล้วขึ้นข้อความว่า "เห็นไม่ครบ" ซึ่งแปลว่าชิ้นที่ 201 เป็นต้นไปเปิด
 * ไม่ได้เลย ทั้งในลิสต์และบนผัง (หมุดวาดจาก items ชุดเดียวกันที่ส่งขึ้นไป)
 *
 * ★ ตัวกระตุ้นคือ IntersectionObserver ที่ก้อนท้ายลิสต์ ไม่ใช่ event scroll - ลิสต์นี้อยู่ใน
 *   กรอบที่สูงไม่เท่ากันในแต่ละจอ การคำนวณ scrollTop + clientHeight เองพลาดง่ายเมื่อมี
 *   ของสูงไม่เท่ากันปนกัน (การ์ดที่มีป้ายหลายอันสูงกว่าปกติ) ตัว observer ถามเบราว์เซอร์ตรง ๆ
 *
 * ★ กันผลลัพธ์เก่าทับใหม่: ผู้ใช้คลิกห้องรัว ๆ ได้ ถ้าไม่เช็คว่า response ที่กลับมาเป็นของ
 *   ห้องที่กำลังดูอยู่จริง ลิสต์จะโชว์ของห้องที่คลิกก่อนหน้าโดยไม่มีอะไรฟ้อง
 */
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { listAssetsInRoom, type RoomAsset } from '@/shared/services/asset.service';
import { fileBlobUrl } from '@/shared/services/attachment.service';
import type { FloorPlanRoom } from '@/shared/services/master.service';
import { categoryIcon } from '@/shared/utils/category-icon';

const props = defineProps<{
  room: FloorPlanRoom | null;
  /**
   * ชิ้นที่ถูกเลือกอยู่ (คลิกมาจากหมุดบนผัง) - ไฮไลต์การ์ดแล้วเลื่อนลิสต์ไปหา
   *
   * ★ ต้องเป็นชิ้นที่โหลดมาแล้วเสมอ ซึ่งจริงโดยโครงสร้าง: หมุดบนผังวาดจาก items ที่
   *   component นี้ส่งขึ้นไป จึงไม่มีทางมีหมุดของชิ้นที่ยังไม่อยู่ในลิสต์
   */
  activeAssetId?: number | null;
}>();

// ส่งรายการที่โหลดได้ขึ้นไปให้หน้าแม่ เพื่อเอาไปวาดหมุดบนผัง - โหลดที่เดียวใช้สองที่
// ไม่ให้แผนที่ยิง API ซ้ำเอง (จะกลายเป็นสองคำขอต่อการคลิกห้องหนึ่งครั้ง)
// ส่งชุด "ที่สะสมมาแล้วทั้งหมด" ทุกครั้งที่โหลดหน้าใหม่ หมุดจึงเพิ่มขึ้นตามลิสต์
const emit = defineEmits<{
  (e: 'loaded', assets: RoomAsset[]): void;
  /** กดการ์ด = ขอเปิดรายละเอียดชิ้นนั้น - หน้าแม่เป็นคนถือ modal (แพทเทิร์นเดียวกับหน้าทะเบียน) */
  (e: 'open', asset: RoomAsset): void;
}>();

const items = ref<RoomAsset[]>([]);
const total = ref(0);
const hasMore = ref(false);
/** โหลดหน้าแรก - ขึ้น skeleton ทั้งลิสต์ */
const loading = ref(false);
/** โหลดหน้าถัดไป - ลิสต์เดิมยังอยู่ ขึ้นแถบเล็ก ๆ ท้ายลิสต์แทน */
const loadingMore = ref(false);
const error = ref('');
let page = 0;

const scroller = ref<HTMLElement | null>(null);
const sentinel = ref<HTMLElement | null>(null);

/** id ของห้องที่ยิงไปล่าสุด - ใช้ทิ้ง response ที่มาช้ากว่าการคลิกครั้งถัดไป */
let latest = 0;

/**
 * imageId -> blob URL - /uploads/:id/file อยู่หลัง authGuard ใส่ src ตรง ๆ จะโดน 401
 *
 * แพทเทิร์นเดียวกับ AssetTable ของหน้าทะเบียน: ยิงทีละใบแบบไม่รอกัน ใบที่พังไม่ลากใบอื่น
 * ตาย (ไฟล์ถูกลบจาก disk แต่ imageId ยังอยู่เป็นเคสที่เกิดจริง) แล้วตกไปใช้ไอคอนหมวดแทน
 *
 * ★ ที่ทำได้เพราะโหลดทีละ 50 - คอมเมนต์เดิมตรงนี้เขียนไว้ว่าไม่เอารูปเพราะห้องคลังจะ
 *   กลายเป็นร้อยคำขอต่อการคลิกห้องหนึ่งครั้ง ซึ่งจริงตอนที่ดึงทีเดียว 200 ชิ้น
 *   ตอนนี้เพดานต่อรอบคือ 50 และรอบถัดไปเกิดเมื่อผู้ใช้เลื่อนลงไปดูเองเท่านั้น
 */
const imageUrls = ref<Record<string, string>>({});

function loadImages(list: RoomAsset[]) {
  for (const item of list) {
    if (!item.imageId || imageUrls.value[item.imageId]) continue;
    const id = item.imageId;
    void fileBlobUrl(id)
      .then((url) => {
        imageUrls.value[id] = url;
      })
      .catch(() => {
        // ปล่อยว่างไว้ ให้ template ขึ้นไอคอนหมวดแทน
      });
  }
}

/** คืน blob URL ทั้งหมดแล้วล้างแมป - เรียกตอนเปลี่ยนห้องและตอนออกจากหน้า */
function releaseImages() {
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url);
  imageUrls.value = {};
}

async function loadNext() {
  const roomId = props.room?.id ?? null;
  if (!roomId || loading.value || loadingMore.value) return;
  if (page > 0 && !hasMore.value) return;

  const token = latest;
  const next = page + 1;
  if (next === 1) loading.value = true;
  else loadingMore.value = true;

  try {
    const res = await listAssetsInRoom(roomId, next);
    // ห้องเปลี่ยนไประหว่างรอ - ทิ้งผลชุดนี้ทั้งก้อน ไม่งั้นของห้องเก่าจะไปต่อท้ายห้องใหม่
    if (token !== latest) return;

    page = res.page;
    total.value = res.total;
    hasMore.value = res.hasMore;
    items.value = next === 1 ? res.items : [...items.value, ...res.items];
    loadImages(res.items);
    emit('loaded', items.value);
  } catch (e) {
    if (token !== latest) return;
    error.value = e instanceof Error ? e.message : 'โหลดรายการสินทรัพย์ไม่สำเร็จ';
  } finally {
    if (token === latest) {
      loading.value = false;
      loadingMore.value = false;
    }
  }

  /**
   * ★ ถามซ้ำว่า sentinel ยังอยู่ในกรอบไหม - ขาดตรงนี้แล้วลิสต์จะค้างที่หน้าเดียว
   *
   * IntersectionObserver ยิง callback เฉพาะตอน "เปลี่ยนสถานะ" ไม่ใช่ตอนที่ยังอยู่ในกรอบ
   * ถ้ากรอบสูงกว่าของ 50 ชิ้น (จอใหญ่ / ห้องที่ของหน้าแรกไม่เต็มความสูง) sentinel จะยัง
   * อยู่ในกรอบเหมือนเดิมหลังโหลดเสร็จ = ไม่มีการเปลี่ยนสถานะ = ไม่มีใครเรียกหน้าถัดไปอีกเลย
   *
   * unobserve แล้ว observe ใหม่บังคับให้เบราว์เซอร์รายงานสถานะปัจจุบันอีกรอบ - ยังอยู่ในกรอบ
   * ก็โหลดต่อจนเต็ม พ้นกรอบไปแล้วก็เงียบ (และของหมดเมื่อไหร่ v-if ถอด sentinel ทิ้งเอง)
   */
  await nextTick();
  const el = sentinel.value;
  if (observer && el && hasMore.value && token === latest) {
    observer.unobserve(el);
    observer.observe(el);
  }
}

/**
 * ล้างลิสต์แล้วโหลดห้องปัจจุบันใหม่ตั้งแต่หน้าแรก
 *
 * แยกออกมาจาก watch เพื่อให้หน้าแม่สั่งได้ด้วย (defineExpose ท้ายไฟล์) - จำเป็นตั้งแต่มี
 * ปุ่มแก้ที่ตั้งในกล่องรายละเอียด: ย้ายชิ้นไปห้องอื่นแล้ว props.room ไม่ได้เปลี่ยน watch
 * จึงไม่ยิง ลิสต์กับหมุดบนผังจะค้างแสดงชิ้นนั้นในห้องเดิมต่อไปจนกว่าจะคลิกห้องอื่นแล้วกลับมา
 */
async function reload() {
  latest++;
  items.value = [];
  total.value = 0;
  hasMore.value = false;
  error.value = '';
  page = 0;
  releaseImages();
  emit('loaded', []);
  if (!props.room?.id) return;
  await loadNext();
}

watch(() => props.room?.id ?? null, reload, { immediate: true });

defineExpose({ reload });

/**
 * ตัวเฝ้าท้ายลิสต์ - ผูกกับกรอบที่เลื่อนจริง ไม่ใช่ viewport
 *
 * root ต้องเป็น scroller ไม่งั้น observer จะวัดกับหน้าจอทั้งหน้า แล้วในกรณีที่กรอบนี้สั้น
 * กว่าจอ (ห้องที่มีของไม่กี่ชิ้น) sentinel จะถูกนับว่า "เห็นแล้ว" ตลอดเวลาแล้วยิงรัวจนหมดห้อง
 * ทั้งที่ผู้ใช้ยังไม่ได้เลื่อนอะไรเลย
 *
 * ★ rootMargin เผื่อไว้ 200px - เริ่มโหลดก่อนถึงก้นลิสต์นิดหน่อย ผู้ใช้จะไม่เห็นรอยสะดุด
 */
let observer: IntersectionObserver | null = null;

watch(sentinel, (el) => {
  observer?.disconnect();
  observer = null;
  if (!el) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNext();
    },
    { root: scroller.value, rootMargin: '200px' },
  );
  observer.observe(el);
});

onUnmounted(() => {
  observer?.disconnect();
  // blob URL ค้างใน memory จนกว่าจะ revoke - ออกจากหน้าแล้วไม่มีใครใช้ต่อ
  releaseImages();
});

/**
 * เลื่อนลิสต์ไปหาชิ้นที่ถูกเลือกจากผัง
 *
 * block: 'nearest' ไม่ใช่ 'center' - ถ้าการ์ดนั้นอยู่ในกรอบอยู่แล้วจะไม่เลื่อนอะไรเลย
 * (คนที่คลิกหมุดของชิ้นที่ตัวเองเพิ่งอ่านอยู่ ไม่ควรโดนลิสต์กระตุกใส่)
 */
watch(
  () => props.activeAssetId ?? null,
  async (id) => {
    if (id === null) return;
    await nextTick();
    scroller.value
      ?.querySelector(`[data-asset-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
);

/**
 * ป้ายสถานะการใช้งาน - Active / Inactive เท่านั้น (SAP เป็นเจ้าของ)
 *
 * ★ เคยมีสาขา `lifecycle === 'DRAFT'` ที่คืนป้าย "ยังไม่ออกเลข" อยู่ตรงนี้ - เป็นโค้ดที่
 *   ไม่มีวันทำงานเพราะ /assets/by-room คืนเฉพาะ REGISTERED มาตลอด (docstring ฝั่ง backend
 *   เขียนไว้กลับกันจนไม่มีใครเห็น) ตัดสินใจแล้วว่าเอาแค่ REGISTERED จึงถอดสาขานั้นทิ้ง
 *   และถอด lifecycle ออกจาก RoomAsset ไปด้วย
 */
function badge(asset: RoomAsset) {
  return { text: asset.status || 'ในทะเบียน', cls: 'badge-ghost' };
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="font-semibold">สินทรัพย์ในห้อง</h2>
      <span v-if="room && !loading" class="text-sm text-base-content/60">
        {{ total }} ชิ้น
      </span>
    </div>

    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="!room" class="rounded-box border border-dashed border-base-300 p-6 text-center">
        <Icon icon="lucide:mouse-pointer-click" class="mx-auto size-6 opacity-40" />
        <p class="mt-2 text-sm text-base-content/60">เลือกห้องบนผังเพื่อดูของในห้อง</p>
      </div>

      <div v-else-if="loading" class="flex flex-col gap-2">
        <div v-for="n in 6" :key="n" class="skeleton h-24 w-full"></div>
      </div>

      <div v-else-if="error" role="alert" class="alert alert-error alert-soft">
        <span class="text-sm">{{ error }}</span>
      </div>

      <div v-else-if="!items.length" class="rounded-box border border-dashed border-base-300 p-6 text-center">
        <Icon icon="lucide:package-open" class="mx-auto size-6 opacity-40" />
        <p class="mt-2 text-sm text-base-content/60">ยังไม่มีสินทรัพย์ที่ระบุว่าอยู่ห้องนี้</p>
      </div>

      <div v-else class="flex flex-col gap-2">
        <!-- ★ เป็น <button> ไม่ใช่ <article> ที่มี @click - กดด้วยคีย์บอร์ดได้และ screen reader
             อ่านออกว่ากดได้ (การ์ดที่กดได้แต่ไม่ใช่ปุ่มคือของที่คนใช้คีย์บอร์ดเข้าไม่ถึงเลย) -->
        <button
          v-for="asset in items"
          :key="asset.id"
          :data-asset-id="asset.id"
          type="button"
          class="card w-full border bg-base-100 text-left transition-colors hover:border-primary/50"
          :class="
            activeAssetId === asset.id
              ? 'border-primary ring-2 ring-primary/30'
              : 'border-base-300'
          "
          @click="emit('open', asset)"
        >
          <div class="card-body flex-row gap-3 p-3">
            <!--
              รูปจริงของชิ้นนั้น ตกไปใช้ไอคอนหมวดเมื่อไม่มีรูปหรือโหลดรูปไม่สำเร็จ
              (/uploads/:id/file อยู่หลัง authGuard จึงต้องดึงเป็น blob ก่อน - ดู imageUrls)
            -->
            <!-- grid-rows-1: กันรูปที่สูงกว่ากล่องล้นออกไปแล้วโดนเฉือนเหลือแค่ส่วนบน
                 (วัดแล้ว: กล่อง 48px แต่รูปสูง 86px) - เหตุผลเต็มอยู่ที่ AppAssetDetail.vue -->
            <div
              class="grid grid-rows-1 size-12 shrink-0 place-items-center overflow-hidden rounded bg-base-200 text-base-content/70"
              :title="asset.categoryName ?? 'ยังไม่ระบุหมวด'"
            >
              <img
                v-if="asset.imageId && imageUrls[asset.imageId]"
                :src="imageUrls[asset.imageId]"
                :alt="asset.description ?? asset.assetNumber ?? 'รูปสินทรัพย์'"
                class="size-full object-cover"
              />
              <Icon v-else :icon="categoryIcon(asset.categoryName)" class="size-6" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <span class="truncate font-mono text-sm font-semibold text-primary">
                  {{ asset.assetNumber ?? '- ยังไม่มีเลขสินทรัพย์ -' }}
                </span>
                <span class="badge badge-sm shrink-0" :class="badge(asset).cls">
                  {{ badge(asset).text }}
                </span>
              </div>

              <p class="truncate text-sm" :title="asset.description ?? ''">
                {{ asset.description || 'ไม่มีคำอธิบาย' }}
              </p>

              <div class="mt-1 flex flex-wrap items-center gap-1">
                <span v-if="asset.categoryName" class="badge badge-sm badge-ghost">
                  {{ asset.categoryName }}
                </span>
                <span v-if="asset.departmentName" class="badge badge-sm badge-ghost">
                  {{ asset.departmentName }}
                </span>
                <span v-if="asset.holderName" class="badge badge-sm badge-ghost">
                  {{ asset.holderName }}
                </span>
                <!-- บอกให้รู้ว่าชิ้นไหนหาบนผังเจอ ชิ้นไหนรู้แค่ว่าอยู่ห้องนี้ -->
                <span
                  v-if="asset.posX !== null"
                  class="badge badge-sm badge-soft badge-primary gap-1"
                  title="ปักหมุดบนผังแล้ว"
                >
                  <Icon icon="lucide:crosshair" class="size-3" />
                  บนผัง
                </span>
              </div>
            </div>
          </div>
        </button>

        <!-- ตัวเฝ้าท้ายลิสต์ - ต้องอยู่ใน DOM ตอนยังมีหน้าถัดไปเท่านั้น
             ถ้าปล่อยค้างไว้ observer จะยิง loadNext() ทุกครั้งที่เลื่อนถึงก้น ทั้งที่ของหมดแล้ว
             (loadNext กันไว้อีกชั้นด้วย hasMore แต่ไม่มีเหตุให้ต้องเรียกตั้งแต่แรก) -->
        <div v-if="hasMore" ref="sentinel" class="py-2 text-center">
          <span v-if="loadingMore" class="loading loading-spinner loading-sm"></span>
          <span v-else class="text-xs text-base-content/50">เลื่อนลงเพื่อดูต่อ</span>
        </div>

        <p v-else-if="total > 0" class="py-2 text-center text-xs text-base-content/50">
          ครบทั้ง {{ total }} ชิ้นในห้องนี้แล้ว
        </p>
      </div>
    </div>
  </div>
</template>
