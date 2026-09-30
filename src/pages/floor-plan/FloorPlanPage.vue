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
import { listFloorPins, type FloorPin, type RoomAsset } from '@/shared/services/asset.service';
import { categoryIcon } from '@/shared/utils/category-icon';
import FloorPlanMap from '@/shared/components/FloorPlanMap.vue';
// dropdown ไม่ใช่ FloorPlanRoomList ที่กางค้าง - ตัวนั้นยังใช้อยู่ใน FloorPlanPickerModal
// ซึ่งเลือกห้องเป็นงานหลัก (เหตุผลเต็มอยู่หัว FloorPlanRoomSelect.vue)
import FloorPlanRoomSelect from './components/FloorPlanRoomSelect.vue';
import FloorPlanRoomDetail from './components/FloorPlanRoomDetail.vue';
import FloorPlanAssetList from './components/FloorPlanAssetList.vue';
import AssetDetailModal from '@/shared/components/AssetDetailModal.vue';
import TopicCard from '@/shared/components/TopicCard.vue';

// ลิสต์ของในห้อง - หน้านี้สั่งให้มันโหลดใหม่เองได้ (ดูเหตุผลที่ AssetDetailModal ท้ายไฟล์)
const assetListRef = useTemplateRef<{ reload: () => Promise<void> }>('assetListRef');
// แผนที่ - ใช้สั่งถอยไปดูทั้งผังตอนกลับเข้าโหมด "ทุกห้อง" (ดู watch(selectedId))
const mapRef = useTemplateRef<{ fit: () => void }>('mapRef');

const plans = ref<FloorPlan[]>([]);
const activeKey = ref<string>('');
/** ห้องที่เลือก - null = ตัวเลือก "ทุกห้อง" ของชั้นที่เปิดอยู่ (ดูหัว FloorPlanRoomSelect.vue) */
const selectedId = ref<number | null>(null);
const loading = ref(true);
const error = ref('');
const activePlan = computed(() => plans.value.find((p) => p.planKey === activeKey.value) ?? null);

// ── หมุดบนผังมาจากหมุดทั้งชั้นเสมอ (floorPins จาก GET /assets/pins) ทั้งสองโหมด
//
// ทุกห้อง   → floorPins ทั้งชุด
// เลือกห้อง  → floorPins กรองเหลือห้องนั้น
//
// ★ เดิมโหมดห้องเดียววาดหมุดจากลิสต์ (roomAssets) ซึ่งโตทีละ 50 ตามที่ผู้ใช้เลื่อน - พอมีโหมด
//   ทุกห้องแล้วอาการจะแปลกทันที: ห้องที่มีหมุด 120 อัน ตอนดูทุกห้องเห็นครบ พอคลิกเข้าห้อง
//   หมุดหายเหลือ 50 แล้วค่อย ๆ งอกตามการเลื่อน - เหตุผลเดิม ("โปรยครบทีเดียวจะทับกัน")
//   ใช้ไม่ได้แล้วเพราะโหมดทุกห้องก็โปรยครบอยู่ดี
//
// roomAssets (ลิสต์ที่โหลดทีละ 50) เหลือหน้าที่สองอย่าง: บอกว่าชิ้นไหนมีการ์ดให้ไฮไลต์แล้ว
// (ดู onSelectAsset/onRoomAssetsLoaded) และเป็นทางถอยตอนโหลดหมุดทั้งชั้นไม่ขึ้น (ดู pinSource)
//   (วัด 2026-09-30: ทั้งไซต์ปักหมุด 27 ชิ้น ชั้นที่เยอะสุด 17 ห้องที่เยอะสุด 5)
const roomAssets = ref<RoomAsset[]>([]);
const floorPins = ref<FloorPin[]>([]);
const pinsError = ref('');
/** กันผลของชั้นเก่ามาทับชั้นใหม่ - ผู้ใช้สลับแท็บชั้นรัว ๆ ได้ (แนวเดียวกับ latest ในลิสต์) */
let pinsToken = 0;

async function loadFloorPins() {
  const key = activeKey.value;
  const token = ++pinsToken;
  pinsError.value = '';
  if (!key) {
    floorPins.value = [];
    return;
  }
  try {
    const pins = await listFloorPins(key);
    if (token === pinsToken) floorPins.value = pins;
  } catch (e) {
    if (token !== pinsToken) return;
    floorPins.value = [];
    pinsError.value = e instanceof Error ? e.message : 'โหลดหมุดทั้งชั้นไม่สำเร็จ';
  }
}

// สลับชั้น = ล้างหมุดชั้นเดิมทันที ไม่รอ response - ไม่งั้นหมุดชั้น 1 จะค้างอยู่บนภาพผังชั้น 2
// ระหว่างรอ (พิกัดเป็นสัดส่วนของภาพ มันจึงวาดได้ "ถูกที่" บนผังผิดใบโดยไม่มีอะไรฟ้อง)
watch(activeKey, () => {
  floorPins.value = [];
  void loadFloorPins();
});

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

/**
 * คลิกหมุดจากโหมดทุกห้อง - รอให้ลิสต์ของห้องนั้นโหลดหน้าแรกเสร็จก่อนค่อยตัดสินใจ
 *
 * ไม่ใช่ ref เพราะไม่มีอะไรบนจอผูกกับมัน เป็นแค่ "งานค้าง" ระหว่างสองจังหวะ
 */
let pendingPin: FloorPin | null = null;

/**
 * คลิกหมุดบนผัง
 *
 * เลือกห้องอยู่ → ชิ้นนั้นมีการ์ดในลิสต์แล้ว = ไฮไลต์ / ลิสต์ยังโหลดไม่ถึง = เปิดกล่องรายละเอียด
 * ทุกห้อง     → สลับไปห้องของหมุดนั้นก่อน แล้วรอหน้าแรกของลิสต์ (ดู onRoomAssetsLoaded)
 *
 * ★ โหมดห้องเดียวต้องเช็คว่ามีการ์ดก่อน ไม่ใช่ตั้ง activeAssetId ทื่อ ๆ: หมุดวาดครบทั้งห้อง
 *   แต่ลิสต์โหลดทีละ 50 - หมุดของชิ้นที่ 51 ขึ้นไปจะไม่มีการ์ดให้เลื่อนไปหา คลิกแล้วเงียบ
 * ★ ตั้ง activeAssetId ทันทีในโหมดทุกห้องไม่ได้: watch(selectedId) ล้างมันทิ้งทุกครั้งที่
 *   เปลี่ยนห้อง และถึงรอดมาได้ ลิสต์ก็ยังไม่มีการ์ดให้เลื่อนไปหา
 */
function onSelectAsset(id: number) {
  if (selectedId.value !== null) {
    if (roomAssets.value.some((a) => a.id === id)) {
      activeAssetId.value = id;
      return;
    }
    const pin = floorPins.value.find((p) => p.id === id);
    if (pin) openDetail(pin);
    return;
  }
  const pin = floorPins.value.find((p) => p.id === id);
  if (!pin) return;
  pendingPin = pin;
  selectedId.value = pin.subLocationId;
}

/**
 * ลิสต์ของในห้องโหลดเสร็จ - เก็บไว้เช็คว่าชิ้นไหนมีการ์ดแล้ว และปิดงานค้างจากการคลิกหมุดในโหมดทุกห้อง
 *
 * ชิ้นที่คลิกอยู่ในหน้าแรก → ไฮไลต์การ์ดแล้วลิสต์เลื่อนไปหาเอง
 * ไม่อยู่ (ห้องที่มีหมุดเกิน 50 / เพิ่งมีคนย้ายชิ้นนั้นออก) → เปิดกล่องรายละเอียดแทน
 *   จะได้ไม่คลิกแล้วเงียบ - FloorPin เป็น RoomAsset ครบทุกช่องจึงส่งเข้ากล่องได้ตรง ๆ
 *
 * ★ ตัดสินที่ page === 1 เท่านั้น: page 0 คือจังหวะล้างลิสต์ตอนเปลี่ยนห้องซึ่งยังว่างอยู่
 *   ถ้าตัดสินตรงนั้นจะเปิดกล่องทุกครั้งที่คลิกหมุด
 */
function onRoomAssetsLoaded(assets: RoomAsset[], page: number) {
  roomAssets.value = assets;
  if (!pendingPin || page !== 1) return;
  const pin = pendingPin;
  pendingPin = null;
  if (assets.some((a) => a.id === pin.id)) activeAssetId.value = pin.id;
  else openDetail(pin);
}

/**
 * หมุดที่วาดบนผัง - หมุดทั้งชั้นเสมอ เลือกห้องอยู่ก็กรองเหลือห้องนั้น (ดูหัวไฟล์ส่วน floorPins)
 *
 * ★ หมุดทั้งชั้นโหลดไม่ขึ้น (pinsError) ในโหมดห้องเดียว → ถอยไปวาดจากลิสต์ของห้องแทน
 *   ได้ไม่ครบถ้าห้องมีเกิน 50 แต่ยังดีกว่าผังโล่งทั้งที่ลิสต์ข้าง ๆ มีของที่ปักหมุดไว้
 */
const pinSource = computed<RoomAsset[]>(() => {
  const room = selectedId.value;
  if (room === null) return floorPins.value;
  if (pinsError.value) return roomAssets.value;
  return floorPins.value.filter((p) => p.subLocationId === room);
});

/** เฉพาะชิ้นที่ปักหมุดไว้แล้ว - ชิ้นที่รู้แค่ว่าอยู่ห้องนี้ไม่มีพิกัดให้วาด */
const assetPins = computed(() =>
  pinSource.value
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
//
// ★ งานค้างจากการคลิกหมุดล้างเฉพาะเมื่อไปห้องอื่นที่ไม่ใช่ห้องของหมุด - onSelectAsset
//   เป็นคนเปลี่ยนห้องเอง watcher นี้จึงวิ่งตามหลังมันทุกครั้ง ล้างทิ้งตรง ๆ = งานหายก่อนเริ่ม
//
// ★ กลับมาที่ทุกห้อง (เลือกจาก dropdown / คลิกห้องเดิมซ้ำ / ปิดรายละเอียดห้อง) ต้องถอยไปดู
//   ทั้งผัง - แผนที่ซูมตามห้องเองอยู่แล้ว แต่ตอนห้องเป็น null มันไม่ขยับ จะค้างซูมอยู่ที่
//   ห้องเดิมทั้งที่ตอนนี้หมุดทั้งชั้นโผล่มาแล้ว ส่วนใหญ่จึงอยู่นอกกรอบสายตา
watch(selectedId, (id) => {
  activeAssetId.value = null;
  if (pendingPin && pendingPin.subLocationId !== id) pendingPin = null;
  if (id === null) mapRef.value?.fit();
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
  <!-- ★ px-20 ขยับไปเริ่มที่ xl ไม่ใช่ lg - หน้านี้แบ่งสองคอลัมน์ตั้งแต่ lg (1024px) ซึ่งบน
       iPad แนวนอนเหลือเนื้อที่จริงแค่ 768px หลังหัก drawer ที่เปิดค้าง (w-64) ขอบซ้ายขวา
       ข้างละ 5rem จึงกินไป 160px จากนั้นอีก 480px เป็นของคอลัมน์ขวา เหลือให้ผัง ~110px
       ที่ xl (1280px) ขึ้นไปยังกว้างเหลือเฟือ ขอบกว้างจึงยังอ่านสบายเหมือนเดิม -->
  <div class="flex min-h-0 flex-col gap-4 bg-base-100 px-4 py-6 md:px-10 lg:h-[calc(100dvh-3.5rem)] lg:min-h-[34rem] xl:px-20">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <TopicCard value="floor-plan" />

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

    <div v-else-if="error" role="alert" class="alert alert-error alert-soft">
      <span>{{ error }}</span>
    </div>

    <!-- ★ **ต้องเป็น minmax(0,1fr) ห้ามเขียน 1fr เฉย ๆ**
         `1fr` ย่อมาจาก `minmax(auto,1fr)` = "ห้ามเล็กกว่าเนื้อหาข้างใน" ผังเป็นรูปที่มี
         ความกว้างขั้นต่ำของตัวเอง คอลัมน์ซ้ายจึงไม่ยอมหดตามจอ แต่ไปดันให้ทั้ง grid ล้น
         ออกนอกกรอบแทน (อาการ "ลดจอแล้วฝั่งซ้ายไม่ลดตาม") minmax(0,…) ปลดพื้นนั้นทิ้ง
         แล้วคอลัมน์ถึงจะหดได้จริง - min-w-0 ที่ลูกทั้งสองตัวคือด่านเดียวกันอีกชั้น
         เพราะ flex/grid item มี min-width:auto เป็นค่าตั้งต้นเหมือนกัน

         ★ ความกว้างคอลัมน์ขวาไล่เป็นสามขั้น ไม่ใช่ 30rem ตายตัวตั้งแต่ lg - 30rem บนจอ
           1024px คือ 2 ใน 3 ของเนื้อที่ทั้งหมด เหลือให้ "ผังชั้น" ซึ่งเป็นของหลักของหน้านี้
           แคบกว่าลิสต์ที่อยู่ข้าง ๆ มัน -->
    <div
      v-else
      class="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_26rem] 2xl:grid-cols-[minmax(0,1fr)_30rem]"
    >
      <div class="flex min-h-0 min-w-0 flex-col gap-3">
        <!-- มือถือ: ความสูงคงที่ 60% ของจอ (พอเห็นผังแต่ยังเหลือที่ให้ของข้างล่าง)
             lg: กลับไปกินที่ที่เหลือทั้งหมดเหมือนเดิม -->
        <div class="h-[60dvh] min-h-[20rem] lg:h-auto lg:min-h-[26rem] lg:flex-1">
          <!-- active-pin-id ทำให้หมุดของชิ้นที่เลือกเด้งค้างไว้ - ในห้องคลังที่หมุดอยู่ติดกัน
               สีอย่างเดียวแยกไม่ออกว่าอันไหนคือชิ้นที่เพิ่งกดจากลิสต์ -->
          <FloorPlanMap v-if="activePlan" ref="mapRef" :src="planSrc" :rooms="activePlan.rooms" :selected-id="selectedId" :asset-pins="assetPins"
            :active-pin-id="activeAssetId"
            @select="selectedId = $event" @select-asset="onSelectAsset" />
        </div>

        <!-- หมุดทั้งชั้นโหลดไม่ขึ้นต้องบอกทั้งสองโหมด - ทุกห้องผังจะโล่งจนอ่านได้ว่า "ไม่มีใครปักหมุด"
             ส่วนห้องเดียวถอยไปวาดจากลิสต์ ซึ่งได้ไม่ครบถ้าห้องมีเกิน 50 (ดู pinSource) -->
        <div v-if="pinsError" role="alert" class="alert alert-error alert-soft py-2">
          <span class="text-sm">{{ pinsError }}</span>
          <button type="button" class="btn btn-ghost btn-xs" @click="loadFloorPins">ลองใหม่</button>
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
      <div class="flex min-h-0 min-w-0 flex-col gap-3">
        <FloorPlanRoomSelect
          :rooms="activePlan?.rooms ?? []"
          :selected-id="selectedId"
          :floor-label="activePlan?.floor ?? activePlan?.planKey"
          @select="selectedId = $event"
        />

        <!-- flex-1 ต้องใส่ตรงนี้ ไม่ใช่ในไฟล์ลูก: เดิมมันเป็นลูกของ grid ที่ยืดให้เอง
             พอย้ายมาอยู่ใน flex column แล้วต้องบอกเองว่าใครกินที่เหลือ -->
        <FloorPlanAssetList
          ref="assetListRef"
          class="min-h-0 flex-1"
          :room="selectedRoom"
          :active-asset-id="activeAssetId"
          @loaded="onRoomAssetsLoaded"
          @open="openDetail"
        />
      </div>
    </div>

    <!-- mount ค้างไว้ตลอด v-model คุมแค่การแสดงผล - AppAssetDetail ไม่ยิง API จนกว่าจะเปิดจริง

         ★ หน้านี้ต้องโหลดลิสต์ใหม่เมื่อที่ตั้งถูกแก้ ต่างจากหน้าตารางอื่น: ที่นี่ผังข้างหลัง
           modal วาดหมุดของ "ห้องที่เลือกอยู่" ถ้าคนย้ายชิ้นไปห้องอื่นแล้วไม่โหลดใหม่ หมุด
           จะยังค้างอยู่ที่เดิมบนผัง = แผนที่โกหกทันทีหลังกดบันทึก
           หมุดทั้งชั้นก็ต้องโหลดใหม่ด้วยเหตุผลเดียวกัน - กดกลับไปทุกห้องแล้วต้องเห็นหมุดที่ใหม่ -->
    <AssetDetailModal
      v-model="detailOpen"
      :item="detailItem"
      editable-location
      editable-image
      editable-holder
      editable-warranty
      editable-department
      @updated="assetListRef?.reload(); loadFloorPins()"
    />
  </div>
</template>
