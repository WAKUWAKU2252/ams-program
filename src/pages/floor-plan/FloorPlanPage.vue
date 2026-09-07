<script setup lang="ts">
/**
 * หน้าแผนผังโรงงาน - เลือกชั้น แล้วคลิกห้องบนผังหรือเลือกจากลิสต์ข้าง ๆ
 *
 * โหลดผังทุกชั้นทีเดียวตอนเปิดหน้า (ทั้งไซต์ 57 ห้อง ไม่กี่ KB) แล้วสลับชั้นบนจอได้ทันที
 * ไม่ต้องรอโหลดใหม่ - ส่วนไฟล์ภาพผังโหลดตอนสลับชั้นครั้งแรกแล้วเบราว์เซอร์ cache ให้เอง
 *
 * ความสูงอิง viewport ไม่ใช่ h-full: <main> ของ MainLayout ไม่ได้กำหนดความสูงไว้ h-full
 * เลยไปอ้างกับ parent ที่สูงตามเนื้อหา แล้ว flex-1 ของแผนที่จะพองเป็นพันกว่า px จนผัง
 * ไปโผล่ใต้ขอบจอ (เจอมาแล้วตอนเปิดหน้าครั้งแรก)
 */
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue';
import { listFloorPlans, type FloorPlan } from '@/shared/services/master.service';
import type { RoomAsset } from '@/shared/services/asset.service';
import { categoryIcon } from '@/shared/utils/category-icon';
import FloorPlanMap from '@/shared/components/FloorPlanMap.vue';
// dropdown ไม่ใช่ FloorPlanRoomList ที่กางค้าง - ตัวนั้นยังใช้อยู่ใน FloorPlanPickerModal
// ซึ่งเลือกห้องเป็นงานหลัก (เหตุผลเต็มอยู่หัว FloorPlanRoomSelect.vue)
import FloorPlanRoomSelect from './components/FloorPlanRoomSelect.vue';
import FloorPlanRoomDetail from './components/FloorPlanRoomDetail.vue';
import FloorPlanAssetList from './components/FloorPlanAssetList.vue';
import AssetDetailModal from '@/shared/components/AssetDetailModal.vue';

// ลิสต์ของในห้อง - หน้านี้สั่งให้มันโหลดใหม่เองได้ (ดูเหตุผลที่ AssetDetailModal ท้ายไฟล์)
const assetListRef = useTemplateRef<{ reload: () => Promise<void> }>('assetListRef');

const plans = ref<FloorPlan[]>([]);
const activeKey = ref<string>('');
const selectedId = ref<number | null>(null);
const loading = ref(true);
const error = ref('');
const activePlan = computed(() => plans.value.find((p) => p.planKey === activeKey.value) ?? null);

// ของในห้องที่เลือก - โหลดโดย FloorPlanAssetList แล้วส่งขึ้นมา หน้านี้ใช้ต่อเพื่อวาดหมุดบนผัง
//
// ★ ชุดนี้โตขึ้นทีละ 50 ตามที่ผู้ใช้เลื่อนลิสต์ลงไป ไม่ใช่ของทั้งห้องตั้งแต่แรก - หมุดบนผัง
//   จึงเพิ่มตามลิสต์ ซึ่งเป็นสิ่งที่ต้องการ: ห้องคลังที่มีของ 300 ชิ้นถ้าโปรยหมุดครบทีเดียว
//   จะทับกันจนคลิกไม่ถูก
const roomAssets = ref<RoomAsset[]>([]);

/**
 * ชิ้นที่เลือกอยู่ - คลิกหมุดบนผังแล้วลิสต์เลื่อนไปหา / คลิกการ์ดในลิสต์แล้วหมุดกระพริบ
 *
 * เก็บเป็น id ไม่ใช่ทั้ง object เพราะสองทางเข้ามาจากคนละที่ (ผังรู้แค่ id ส่วนลิสต์มีของครบ)
 * และค่าที่เก็บต้องเทียบกับ activePinId ของแผนที่ได้ตรง ๆ
 */
const activeAssetId = ref<number | null>(null);

// modal รายละเอียด - ใช้ AssetDetailModal ตัวเดียวกับหน้าทะเบียน/My asset/Audit ไม่เขียนของตัวเอง
const detailOpen = ref(false);
const detailItem = ref<RoomAsset | null>(null);

/** กดการ์ดในลิสต์ = เปิดรายละเอียด และถือว่าชิ้นนั้นถูกเลือก (หมุดบนผังจะเด้งตาม) */
function openDetail(asset: RoomAsset) {
  activeAssetId.value = asset.id;
  detailItem.value = asset;
  detailOpen.value = true;
}

/** เฉพาะชิ้นที่ปักหมุดไว้แล้ว - ชิ้นที่รู้แค่ว่าอยู่ห้องนี้ไม่มีพิกัดให้วาด */
const assetPins = computed(() =>
  roomAssets.value
    .filter((a): a is RoomAsset & { posX: number; posY: number } => a.posX !== null && a.posY !== null)
    .map((a) => ({
      id: a.id,
      x: a.posX,
      y: a.posY,
      icon: categoryIcon(a.categoryName),
      // tooltip: เลขสินทรัพย์มาก่อนเสมอ (คนตามหาของจำเลข) แล้วต่อด้วยคำอธิบายถ้ามี
      label: [a.assetNumber ?? `#${a.id}`, a.description].filter(Boolean).join(" · "),
    })),
);

/** BASE_URL เผื่อกรณี deploy ใต้ sub-path - ต่อ path ตรง ๆ จะ 404 ทันทีที่ base ไม่ใช่ "/" */
const planSrc = computed(() =>
  activePlan.value ? `${import.meta.env.BASE_URL}floorplans/${activePlan.value.planKey}.png` : '',
);

const selectedRoom = computed(
  () => activePlan.value?.rooms.find((r) => r.id === selectedId.value) ?? null,
);

// เปลี่ยนห้อง = ชิ้นที่เลือกไว้เป็นของห้องเก่า ต้องล้างทิ้ง ไม่งั้นหมุดในห้องใหม่จะมีอันหนึ่ง
// เด้งค้างอยู่เฉย ๆ ถ้าบังเอิญ id ตรงกัน (หรือไม่มีอะไรเด้งเลยแต่ลิสต์ยังคิดว่ามีตัวที่เลือกอยู่)
watch(selectedId, () => {
  activeAssetId.value = null;
});

function switchPlan(key: string) {
  if (key === activeKey.value) return;
  activeKey.value = key;
  // ห้องที่เลือกอยู่เป็นของชั้นเดิม ถ้าไม่ล้างจะค้างเป็นชื่อห้องที่ไม่มีอยู่บนผังใบใหม่
  selectedId.value = null;
}

onMounted(async () => {
  try {
    plans.value = await listFloorPlans();
    activeKey.value = plans.value[0]?.planKey ?? '';
    if (!plans.value.length) error.value = 'ยังไม่มีผังชั้นที่ตีขอบเขตห้องไว้';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'โหลดผังไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
});

</script>

<template>
  <!-- ★ ล็อกความสูงเท่าจอเฉพาะ lg ขึ้นไป (lg:h-…) ห้ามล็อกบนมือถือ
       จอเล็ก grid ยุบเหลือคอลัมน์เดียว แผนที่กับลิสต์ของจึงมาเรียงต่อกันในกล่องที่สูงเท่า
       viewport พอดี - แผนที่มี min-h-[26rem] กินไปเกือบหมด ลิสต์เหลือความสูงไม่ถึง 100px
       แล้วเลื่อนดูของทั้งห้องในช่องแค่นั้น (อาการเดียวกับที่เจอในหน้า Audit)
       บนมือถือปล่อยให้หน้ายาวแล้วเลื่อนทั้งหน้าตามปกติ - เป็นท่าที่คนใช้มือถือคุ้นอยู่แล้ว -->
  <div class="flex min-h-0 flex-col gap-4 bg-base-100 px-4 py-6 md:px-10 lg:h-[calc(100dvh-3.5rem)] lg:min-h-[34rem] lg:px-20">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold sm:text-4xl">Asset Location Map</h1>
        <p class="text-base-content/70">แผนผังโรงงานเลือกห้องจากลิสต์หรือคลิกบนผัง</p>
      </div>

      <div v-if="plans.length" role="tablist" class="tabs tabs-box">
        <button v-for="plan in plans" :key="plan.planKey" role="tab" class="tab w-[80px]"
          :class="plan.planKey === activeKey ? 'tab-active' : ''" @click="switchPlan(plan.planKey)">
          ชั้น {{ plan.floor ?? plan.planKey }}

        </button>
      </div>
    </div>

    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <div v-else-if="error" role="alert" class="alert alert-error">
      <span>{{ error }}</span>
    </div>

    <div v-else class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_30rem] mt-6">
      <div class="flex min-h-0 flex-col gap-3">
        <!-- มือถือ: ความสูงคงที่ 60% ของจอ (พอเห็นผังแต่ยังเหลือที่ให้ของข้างล่าง)
             lg: กลับไปกินที่ที่เหลือทั้งหมดเหมือนเดิม -->
        <div class="h-[60dvh] min-h-[20rem] lg:h-auto lg:min-h-[26rem] lg:flex-1">
          <!-- active-pin-id ทำให้หมุดของชิ้นที่เลือกเด้งค้างไว้ - ในห้องคลังที่หมุดอยู่ติดกัน
               สีอย่างเดียวแยกไม่ออกว่าอันไหนคือชิ้นที่เพิ่งกดจากลิสต์ -->
          <FloorPlanMap v-if="activePlan" :src="planSrc" :rooms="activePlan.rooms" :selected-id="selectedId" :asset-pins="assetPins"
            :active-pin-id="activeAssetId"
            @select="selectedId = $event" @select-asset="activeAssetId = $event" />
        </div>

        <FloorPlanRoomDetail v-if="selectedRoom" :room="selectedRoom" @clear="selectedId = null" />

      </div>
      <!-- ★ ตัวเลือกห้องกับลิสต์ของต้องอยู่ในช่อง grid เดียวกัน ไม่ใช่สองลูกแยกกัน
           grid นี้มีสองคอลัมน์ ลูกตัวที่สามจะตกไปขึ้นแถวใหม่ใต้แผนที่ (ของเดิมเป็นแบบนั้น
           ลิสต์ของเลยไปโผล่ใต้ผังแทนที่จะอยู่ข้าง ๆ) — ห่อคู่นี้ไว้ด้วยกันจึงได้ทั้ง
           "dropdown อยู่เหนือลิสต์" และช่องขวาที่ไม่ล้น

           คลิกหมุด → activeAssetId เปลี่ยน → ลิสต์เลื่อนไปหาและไฮไลต์ให้เอง
           คลิกการ์ด → เปิด modal รายละเอียด (คนละคำสั่งกัน กดหมุดไม่เปิด modal
           เพราะบนผังคนกำลังกวาดหาของ การเด้ง modal ทุกครั้งที่แตะหมุดจะขวางมากกว่าช่วย) -->
      <div class="flex min-h-0 flex-col gap-3">
        <FloorPlanRoomSelect
          :rooms="activePlan?.rooms ?? []"
          :selected-id="selectedId"
          @select="selectedId = $event"
        />

        <!-- flex-1 ต้องใส่ตรงนี้ ไม่ใช่ในไฟล์ลูก: เดิมมันเป็นลูกของ grid ที่ยืดให้เอง
             พอย้ายมาอยู่ใน flex column แล้วต้องบอกเองว่าใครกินที่เหลือ -->
        <FloorPlanAssetList
          ref="assetListRef"
          class="min-h-0 flex-1"
          :room="selectedRoom"
          :active-asset-id="activeAssetId"
          @loaded="roomAssets = $event"
          @open="openDetail"
        />
      </div>
    </div>

    <!-- mount ค้างไว้ตลอด v-model คุมแค่การแสดงผล - AppAssetDetail ไม่ยิง API จนกว่าจะเปิดจริง

         ★ หน้านี้ต้องโหลดลิสต์ใหม่เมื่อที่ตั้งถูกแก้ ต่างจากหน้าตารางอื่น: ที่นี่ผังข้างหลัง
           modal วาดหมุดของ "ห้องที่เลือกอยู่" ถ้าคนย้ายชิ้นไปห้องอื่นแล้วไม่โหลดใหม่ หมุด
           จะยังค้างอยู่ที่เดิมบนผัง = แผนที่โกหกทันทีหลังกดบันทึก -->
    <AssetDetailModal
      v-model="detailOpen"
      :item="detailItem"
      editable-location
      editable-image
      @updated="assetListRef?.reload()"
    />
  </div>
</template>
