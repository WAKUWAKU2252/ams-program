<script setup lang="ts">
// ผังบอกที่ตั้งของสินทรัพย์ชิ้นหนึ่ง - ใช้ทั้งใน modal และในหน้าเต็ม
//
// แยกไฟล์ออกมาเพราะสองที่นั้นวาง "กล่องผัง" ไว้คนละตำแหน่ง (modal = ข้างรูปในหัว /
// หน้า QR = เต็มความกว้างข้างล่าง) แต่ตรรกะว่าจะวาดอะไรเหมือนกันเป๊ะ - ถ้าเขียนซ้ำสองชุด
// ใน template เดียวกัน วันหลังแก้ทีเดียวจะลืมอีกชุดแน่ ๆ
//
// component นี้รู้แค่ "ชิ้นนี้ + ผังทั้งหมด" แล้วตัดสินใจเองว่าจะขึ้นผังหรือขึ้นข้อความบอก
// ส่วนขนาดกล่องเป็นเรื่องของคนเรียก (ส่งมาทาง mapClass)
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import FloorPlanMap from '@/shared/components/FloorPlanMap.vue'
import type { FloorPlan } from '@/shared/services/master.service'
import { categoryIcon } from '@/shared/utils/category-icon'

/**
 * ของที่ต้องรู้เพื่อวาดหมุดหนึ่งอัน - ไม่ผูกกับ AssetByNumberDetail ทั้งก้อน
 *
 * เดิมรับ AssetByNumberDetail ตรง ๆ ซึ่งใช้ได้เฉพาะกับหน้าที่ยิง /assets/by-number
 * พอกล่องรายชิ้นใน Asset Request จะใช้ผังเดียวกัน (ข้อมูลมาจาก /assets/slots คนละรูป
 * แต่มีครบทุกช่องที่ตรงนี้ต้องใช้) ก็ต้องเลือกระหว่างก๊อป component หรือ cast ทิ้ง type
 * ทั้งสองทางแย่กว่าการประกาศให้ตรงกับที่ใช้จริง - AssetByNumberDetail ยังส่งเข้ามาได้เหมือนเดิม
 */
// ไม่ใส่ export - <script setup> คอมไพล์ไม่ผ่านถ้ามี ES export (รวม type ด้วย)
// ผู้เรียกส่ง object ที่มีครบตามนี้เข้ามาได้เลย TS เช็คให้เองแบบ structural
interface AssetMapTarget {
  id: number
  assetNumber: string | null
  description: string | null
  /** ใช้เลือกไอคอนของหมุด */
  categoryName: string | null
  /** true = สถานที่ทางบัญชีของชิ้นนี้อยู่นอกผังของไซต์นี้ (ต่างประเทศ/สาขาอื่น) */
  locationOutPlan?: boolean
  subLocationId: number | null
  planKey: string | null
  posX: number | null
  posY: number | null
}

const props = withDefaults(
  defineProps<{
    detail: AssetMapTarget | null
    plans: FloorPlan[]
    /** คลาสความสูงของกรอบผัง - FloorPlanMap ต้องการความสูงจริงเป็น px (ดูหมายเหตุข้างล่าง) */
    mapClass?: string
  }>(),
  { mapClass: 'h-64 w-full' },
)

/** ผังใบที่ห้องของชิ้นนี้อยู่ */
const assetPlan = computed(
  () => props.plans.find((p) => p.planKey === props.detail?.planKey) ?? null,
)

/** ห้องของชิ้นนี้บนผังใบนั้น - null ได้แม้ planKey ตรง (ห้องที่ยังไม่ได้ตีขอบเขต) */
const assetRoom = computed(
  () => assetPlan.value?.rooms.find((r) => r.id === props.detail?.subLocationId) ?? null,
)

/** BASE_URL เผื่อ deploy ใต้ sub-path - ต่อ path ตรง ๆ จะ 404 ทันทีที่ base ไม่ใช่ "/" */
const planSrc = computed(() =>
  assetPlan.value ? `${import.meta.env.BASE_URL}floorplans/${assetPlan.value.planKey}.png` : '',
)

/** หมุดของชิ้นนี้ - ชิ้นเดียว ไม่วาดของทั้งห้อง (ที่นี่ตอบเรื่องชิ้นนี้ชิ้นเดียว) */
const assetPins = computed(() => {
  const d = props.detail
  if (!d || d.posX === null || d.posY === null) return []
  return [
    {
      id: d.id,
      x: d.posX,
      y: d.posY,
      icon: categoryIcon(d.categoryName),
      label: [d.assetNumber, d.description].filter(Boolean).join(' · '),
    },
  ]
})

/**
 * ผังบอกอะไรได้แค่ไหน - สี่สถานะ ไม่ใช่มี/ไม่มี
 *
 * แยกให้ครบเพราะ "ไม่ขึ้นผัง" มีสาเหตุคนละเรื่องและแก้คนละทาง: ไม่ระบุห้อง = ไปกรอกทะเบียน
 * ห้องไม่มีขอบเขต = ไปตีขอบเขตในผัง ส่วนไม่มีหมุด = ยังพาไปถึงห้องได้อยู่ ไม่ต้องแก้อะไร
 */
const mapState = computed<'pinned' | 'room' | 'no-plan' | 'out-plan' | 'unknown'>(() => {
  const d = props.detail
  // ★ ต้องมาก่อน unknown — สองสถานะนี้มี subLocationId เป็น null เหมือนกันเป๊ะ แต่คนละเรื่อง
  //   out-plan = ถูกต้องสมบูรณ์แล้ว ไม่มีอะไรให้ทำต่อ / unknown = งานค้างที่ต้องมีคนไปเติม
  //   ขึ้นข้อความเดียวกันเมื่อไหร่ = ไล่ตามงานที่ค้างจริงไม่ได้อีกเลย
  if (d?.locationOutPlan) return 'out-plan'
  if (!d?.subLocationId) return 'unknown'
  if (!assetRoom.value) return 'no-plan'
  return d.posX !== null ? 'pinned' : 'room'
})

/** ข้อความของสามสถานะที่วาดผังไม่ได้ — แยกออกมาเพราะ template ซ้อน ternary สามชั้นแล้วอ่านไม่ออก */
const emptyState = computed(() => {
  if (mapState.value === 'out-plan') {
    return { icon: 'lucide:plane', text: 'ชิ้นนี้อยู่นอกพื้นที่ผัง จึงไม่มีตำแหน่งบนแผนที่' }
  }
  if (mapState.value === 'no-plan') {
    return { icon: 'lucide:pencil-ruler', text: 'ห้องนี้ยังไม่ได้ตีขอบเขตลงผัง จึงชี้บนแผนที่ไม่ได้' }
  }
  return { icon: 'lucide:map-pin-off', text: 'ทะเบียนยังไม่ระบุว่าชิ้นนี้อยู่ห้องไหน' }
})
</script>

<template>
  <!-- ★ กรอบต้องมีความสูงจริงเป็น px - FloorPlanMap คำนวณ fit จาก clientHeight
       ถ้าได้ 0 (เช่นวางใน flex ที่ไม่ได้กำหนดความสูง) มันจะได้สเกล 0 แล้วขึ้นเป็น
       กล่องเปล่าโดยไม่มี error อะไรเลย -->
  <div v-if="mapState === 'pinned' || mapState === 'room'" class="relative" :class="mapClass">
    <!-- selected-id = ห้องของชิ้นนี้ → แผนที่ซูมไปไฮไลต์ห้องให้เอง
         active-pin-id ทำให้หมุดของชิ้นนี้เต้นค้างพร้อมป้ายชื่อ (ไม่ต้องเอาเมาส์จ่อ) -->
    <FloorPlanMap
      v-if="assetPlan && detail"
      :src="planSrc"
      :rooms="assetPlan.rooms"
      :selected-id="detail.subLocationId"
      :asset-pins="assetPins"
      :active-pin-id="mapState === 'pinned' ? detail.id : null"
    />

    <!-- ── "รู้ห้อง แต่ยังไม่ปักหมุด" ────────────────────────────────────────
         สองสถานะนี้หน้าตาต่างกันแค่ "มีหมุดกับไม่มีหมุด" ซึ่งคนดูแยกไม่ออกเลยถ้าไม่บอก:
         เห็นห้องถูกไฮไลต์แล้วเข้าใจว่านั่นคือตำแหน่งของชิ้นนั้น ทั้งที่ระบบรู้แค่ว่า
         "อยู่ในห้องนี้" — ห้องคลังที่มีของเป็นร้อยชิ้นจะพาไปผิดความคาดหวังทันที
         (ลิสต์ในหน้า Audit ติดป้าย "รู้ห้อง" ไว้อยู่แล้ว ตรงนี้ต้องพูดตรงกัน)

         ★ absolute + pointer-events-none: ไม่กินความสูงของกรอบ (โหมด modal กรอบถูก
           ล็อกด้วย flex-1 อยู่) และไม่บังการลาก/ซูมแผนที่ที่อยู่ข้างใต้
         ★ วางล่างซ้าย - มุมขวาบนเป็นที่ของปุ่ม +/−/ดูทั้งผัง ของ FloorPlanMap -->
    <div
      v-if="mapState === 'room'"
      class="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-base-100/90 px-2.5 py-1 text-xs text-base-content/70 shadow-sm ring-1 ring-base-300"
    >
      <Icon icon="lucide:scan-search" class="size-3.5 shrink-0" />
      ยังไม่ได้ปักหมุด
    </div>
  </div>

  <!-- ไม่ขึ้นผังมีสามสาเหตุคนละเรื่อง ต้องบอกให้ตรงตัว ไม่ใช่กล่องว่างเงียบ ๆ
       (อยู่นอกผัง = จบแล้ว / ห้องยังไม่ตีขอบเขต = ไปตีขอบเขต / ไม่ระบุห้อง = ไปกรอกทะเบียน) -->
  <div
    v-else
    class="flex items-center gap-2 rounded-box border border-dashed border-base-300 px-3 py-4 text-xs text-base-content/60"
  >
    <Icon :icon="emptyState.icon" class="size-4 shrink-0" />
    <span>{{ emptyState.text }}</span>
  </div>
</template>
