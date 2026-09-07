<script setup lang="ts">
/**
 * เลือกห้องแบบ dropdown - หัวของคอลัมน์ขวา วางเหนือลิสต์สินทรัพย์
 *
 * ── ทำไมไม่แก้ FloorPlanRoomList ให้เป็น dropdown แทนที่จะเพิ่มไฟล์
 *
 * ตัวนั้นถูกใช้อยู่สองที่: หน้าแผนผังเต็ม (ตัวนี้มาแทน) กับ FloorPlanPickerModal ซึ่งเป็น
 * กล่องเลือกห้อง+ปักหมุดตอนกรอกสินทรัพย์ - ในกล่องนั้นการเลือกห้องคือ "งานหลัก" ของทั้ง
 * หน้าจอ ลิสต์ที่กางค้างข้างผังจึงถูกแล้ว ยุบเป็น dropdown = เพิ่มคลิกให้งานที่ทำบ่อยที่สุด
 *
 * ต่างกับหน้าแผนผังเต็มที่ "งานหลัก" คือดูของในห้อง ลิสต์ห้องเป็นแค่ทางเข้า กินพื้นที่
 * คอลัมน์ค้างไว้ทั้งที่ใช้ครั้งเดียวตอนเข้าห้อง
 *
 * ── โครง ul ตึก / li ห้อง ยกมาจาก FloorPlanRoomList ทั้งก้อน
 *
 * "ตึก" คือ asset_location คนละแถว (UBIS-ตึก 1/2/3, UBIS-นอกตึก) มาทาง room.locationName
 * ไม่ใช่คอลัมน์ของห้องเอง - จัดกลุ่มฝั่งนี้เพราะ API คืนมาเป็นลิสต์แบน
 *
 * ── ใช้ popover API + anchor positioning ตาม AppEmployeeSelect ไม่ใช่ details/summary
 *
 * เหตุผลเดียวกับที่นั่น: popover อยู่ top layer จึงไม่ถูก ancestor ที่มี overflow ตัดขอบ
 * (คอลัมน์นี้มี overflow-y-auto ของลิสต์สินทรัพย์อยู่ข้างล่าง) และเป็นรูปแบบเดียวกับ
 * dropdown ตัวอื่นในระบบ ไม่ต้องมีของสามแบบให้ดูแล
 */
import { computed, ref, useId } from 'vue';
import { Icon } from '@iconify/vue';
import type { FloorPlanRoom } from '@/shared/services/master.service';

const props = defineProps<{
  rooms: FloorPlanRoom[];
  selectedId: number | null;
}>();

const emit = defineEmits<{
  (e: 'select', id: number): void;
}>();

const uid = useId();
const popoverId = `roomselect-${uid}`;
const anchorName = `--roomselect-${uid}`;

const popoverRef = ref<HTMLElement | null>(null);
const search = ref('');
const roomRefs = ref<Record<number, HTMLElement>>({});

function setRoomRef(id: number, el: Element | null) {
  if (el instanceof HTMLElement) roomRefs.value[id] = el;
}

const selectedRoom = computed(
  () => props.rooms.find((r) => r.id === props.selectedId) ?? null,
);

/**
 * จุดกึ่งกลางของห้องบนผัง + ความสูงของมัน — ทุกค่าเป็นสัดส่วนของภาพ 0–1 เหมือน polygon
 *
 * polygon ที่ trace ไว้เป็นสี่เหลี่ยมทุกห้อง (วัดแล้ว 4 จุดเป๊ะทั้ง 57 ห้อง) แต่ไม่ผูกกับ
 * จำนวนจุด เผื่อวันหลัง trace เป็นรูปหลายเหลี่ยม
 *
 * ห้องที่ไม่มีจุดเลยเป็นไปไม่ได้ผ่าน API (findFloorPlans กรอง polygon IS NOT NULL) แต่
 * อาร์เรย์ว่างยังผ่านตัวกรองนั้นได้ — หาร 0 จะได้ NaN ซึ่งพิษกับ comparator ของ sort
 * (ลำดับจะเพี้ยนทั้งชุดแบบคาดเดาไม่ได้) จึงกันไว้ให้ตกไปเป็น 0 แทน
 */
function metrics(polygon: [number, number][]) {
  if (!polygon.length) return { cx: 0, cy: 0, height: 0 };
  let sx = 0;
  let sy = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    sx += x;
    sy += y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { cx: sx / polygon.length, cy: sy / polygon.length, height: maxY - minY };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * [ชื่อตึก, ห้องในตึกนั้น][] — จัดกลุ่มตามตึก แล้วเรียง "ซ้ายบน → ขวาล่าง" ภายในแต่ละตึก
 *
 * ── ทำไมต้องเรียงเอง ไม่ใช้ลำดับที่ API ส่งมา
 *
 * API เรียงตาม assetSubLocation.code ซึ่งเป็นรหัสทางทะเบียน ไม่เกี่ยวกับตำแหน่งบนผังเลย
 * (B101-CAF อยู่ล่างสุดของผังแต่ขึ้นเป็นห้องแรกเพราะ CAF มาก่อน CL ตามตัวอักษร) คนที่กด
 * ปุ่มถัดไปขณะยืนดูผังอยู่จึงถูกพากระโดดไปมาแทนที่จะไล่ทีละแถว
 *
 * ── เรียงด้วย (y, x) ดิบ ๆ ไม่ได้ ต้องจัดแถวก่อน
 *
 * ห้องในแถวเดียวกันไม่ได้อยู่ระดับ y เท่ากันเป๊ะ (ต่างกันหลักพันส่วน) เรียงตรง ๆ แล้ววัดกับ
 * ผังจริงพบว่าสลับลำดับถอยกลับไปทางซ้ายทั้งที่ยังอยู่แถวเดิม 9 จุด
 *
 * band = ความสูงห้อง "ค่ากลาง" ของตึกนั้น ไม่ใช่ค่าคงที่: ตึกที่ห้องใหญ่ (B3 ~0.042) กับ
 * ตึกที่ห้องเล็ก (B1 ~0.025) ต้องใช้เกณฑ์คนละขนาด ใช้ค่ากลางแทนค่าเฉลี่ยเพราะห้องโซนผลิต
 * ที่สูงกว่าชาวบ้าน 10 เท่าจะดึงค่าเฉลี่ยจนแถวกว้างเกินจริง
 *
 * ── ต้นทุน: วัดแล้ว 0.0116 ms ต่อรอบสำหรับผังที่ห้องเยอะสุด (37 ห้อง)
 *
 * และ computed แคชให้อยู่แล้ว — คิดใหม่เฉพาะตอน props.rooms เปลี่ยน คือตอนสลับชั้น
 * ไม่ใช่ทุก render ไม่ใช่ทุกครั้งที่กดปุ่มถัดไป
 */
const orderedGroups = computed<[string, FloorPlanRoom[]][]>(() => {
  const byBuilding = new Map<string, FloorPlanRoom[]>();
  for (const room of props.rooms) {
    const list = byBuilding.get(room.locationName);
    if (list) list.push(room);
    else byBuilding.set(room.locationName, [room]);
  }

  // ลำดับของ "ตึก" ปล่อยตามที่ API ส่งมา (เรียงด้วย assetLocation.code) — ที่ตกลงกันคือ
  // เรียงเชิงพื้นที่ภายในตึก ไม่ใช่ข้ามตึก ตึกจึงควรอยู่ในลำดับทางทะเบียนที่นิ่งกว่า
  return [...byBuilding.entries()].map(([building, list]) => {
    const m = new Map(list.map((r) => [r.id, metrics(r.polygon)]));
    const band = median([...m.values()].map((v) => v.height));

    const sorted = [...list].sort((a, b) => {
      const ma = m.get(a.id)!;
      const mb = m.get(b.id)!;
      // band = 0 เกิดได้ถ้าห้องทั้งตึกไม่มีความสูง (polygon ว่าง) — หารไม่ได้ ตกไปเรียง
      // ตาม y ตรง ๆ ซึ่งยังดีกว่าปล่อยให้เป็น NaN แล้วลำดับพังทั้งกลุ่ม
      if (band <= 0) return ma.cy - mb.cy || ma.cx - mb.cx;
      return Math.round(ma.cy / band) - Math.round(mb.cy / band) || ma.cx - mb.cx;
    });

    return [building, sorted] as [string, FloorPlanRoom[]];
  });
});

/**
 * ลิสต์แบนตามลำดับที่ตาเห็น — ปุ่มถัดไป/ก่อนหน้าเดินบนตัวนี้
 *
 * ★ มาจาก orderedGroups ตัวเดียวกับที่ลิสต์ใช้วาด ปุ่มกับลิสต์จึงเรียงเหมือนกันโดยโครงสร้าง
 *   ไม่ใช่เพราะบังเอิญตรงกัน (ของเดิมเดินบน props.rooms แล้วอาศัยว่า ORDER BY ฝั่ง API
 *   เรียงมาให้พอดี ซึ่งพังเงียบทันทีที่มีคนแก้คิวรี — ตอนนี้ตัดความผูกพันนั้นทิ้งแล้ว)
 */
const orderedRooms = computed(() => orderedGroups.value.flatMap(([, list]) => list));

/** กรองด้วยคำค้นโดยคงลำดับเดิม — ตึกที่ไม่เหลือห้องเลยหายไปทั้งกลุ่ม */
const grouped = computed<[string, FloorPlanRoom[]][]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return orderedGroups.value;

  return orderedGroups.value
    .map(
      ([building, list]) =>
        [
          building,
          list.filter(
            (r) =>
              r.code.toLowerCase().includes(q) ||
              (r.room ?? '').toLowerCase().includes(q) ||
              r.locationName.toLowerCase().includes(q),
          ),
        ] as [string, FloorPlanRoom[]],
    )
    .filter(([, list]) => list.length > 0);
});

function select(id: number) {
  emit('select', id);
  popoverRef.value?.hidePopover();
}

/**
 * ตอนกางออก: ล้างคำค้นเก่า แล้วเลื่อนไปหาห้องที่เลือกอยู่
 *
 * ทั้งไซต์มี 57 ห้องกระจายหลายตึก ถ้าเปิดมาแล้วอยู่บนสุดเสมอ คนที่กำลังดูห้องหนึ่งอยู่
 * ต้องไล่หาเองทุกครั้งว่าตอนนี้ยืนอยู่ตรงไหนของลิสต์
 *
 * ต้องทำตอน toggle ไม่ใช่ watch(selectedId): ระหว่างที่ popover ปิดอยู่มันเป็น display:none
 * scrollIntoView จึงไม่มีผลอะไรเลย
 */
function onToggle(e: Event) {
  if ((e as ToggleEvent).newState !== 'open') return;
  search.value = '';
  // รอให้ v-if/v-for ของลิสต์ที่เพิ่งกางวาดเสร็จก่อนค่อยเลื่อน
  requestAnimationFrame(() => {
    if (props.selectedId === null) return;
    roomRefs.value[props.selectedId]?.scrollIntoView({ block: 'nearest' });
  });
}
/**
 * ── เดินห้องถัดไป/ก่อนหน้า ตามลำดับซ้ายบน → ขวาล่างภายในตึก
 *
 * ★ ไม่สนคำค้น: ช่องค้นมีผลแค่กับลิสต์ในกล่องที่กางอยู่ ส่วนปุ่มคู่นี้อยู่นอกกล่องและใช้
 *   ตอนกล่องปิด (onToggle ล้างคำค้นทุกครั้งที่กางอยู่แล้ว) เดินทั้งชั้นจึงเป็นสิ่งที่ต้องการ
 *   — orderedRooms เป็นชุดที่ยังไม่ผ่านตัวกรอง ต่างจาก grouped ที่ลิสต์ใช้
 *
 * ★ ข้ามตึกได้เมื่อเดินจนสุดตึกหนึ่ง: orderedRooms ต่อทุกตึกเรียงกันเป็นเส้นเดียว ปุ่มจึง
 *   พาไล่ได้ครบทั้งชั้นโดยไม่ต้องกลับไปเปิด dropdown เลือกตึกใหม่เอง
 */
const selectedIndex = computed(() =>
  props.selectedId === null ? -1 : orderedRooms.value.findIndex((r) => r.id === props.selectedId),
);

// ปิดปุ่มที่หัว/ท้ายลิสต์ด้วย ไม่ใช่แค่ตอนยังไม่ได้เลือกห้อง — ปุ่มที่กดได้แต่ไม่เกิดอะไรขึ้น
// ทำให้คนกดซ้ำเพราะคิดว่าคลิกไม่โดน
const canPrev = computed(() => selectedIndex.value > 0);
const canNext = computed(
  () => selectedIndex.value !== -1 && selectedIndex.value < orderedRooms.value.length - 1,
);

/** รวมสองทิศไว้ที่เดียว ไม่แยกเป็น nextRoom/prevRoom — กันสองตัวหลุดจากกันเวลาแก้ */
function step(delta: 1 | -1) {
  if (selectedIndex.value === -1) return;
  const target = orderedRooms.value[selectedIndex.value + delta];
  if (!target) return;
  select(target.id);
}
</script>

<template>
  <!-- ★ สามคอลัมน์ทุกขนาดจอ ไม่ใส่ md: — ปุ่มกว้างแค่ 3rem ต่อข้าง เหลือให้ตัวเลือกห้อง
       เกิน 15rem แม้บนจอ 375px ถ้าใส่ md: ไว้ ต่ำกว่านั้นจะกลายเป็น grid คอลัมน์เดียว
       แล้วปุ่ม/ช่องเลือกจะเรียงซ้อนกันสามชั้นเต็มความกว้าง

       ★ กล่อง popover เป็นลูกตัวที่ 4 ของ grid สามคอลัมน์ แต่ไม่ดันปุ่ม next ตกแถว:
       daisyUI ตั้ง .dropdown[popover] ให้เป็น display:none ตอนปิด และ position:fixed
       ตลอดเวลา — ทั้งสองสถานะไม่นับเป็น grid item จึงเหลือของในผังจริงแค่สามชิ้น
       (อย่าย้ายมันออกไปนอก div นี้ ต้องอยู่ถัดจากปุ่มที่กางมันเพื่อให้ลำดับ tab ถูก) -->
  <div class="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      aria-label="ห้องก่อนหน้า"
      :disabled="!canPrev"
      @click="step(-1)"
    >
      <Icon icon="lucide:chevron-left" />
    </button>

    <!-- ไม่ใส่ max-w: คอลัมน์กลางเป็น 1fr อยู่แล้ว การจำกัดความกว้างซ้ำทำให้เหลือช่องว่าง
         ค้างข้างปุ่ม next เฉย ๆ ส่วน truncate ก็ไม่ต้อง — .input ของ daisyUI เป็น flex
         text-overflow จึงไม่มีผลกับมัน ตัวที่ตัดข้อความจริงคือ span ข้างในที่มี truncate อยู่ -->
    <button
      type="button"
      class="input w-full cursor-pointer text-left truncate"
      :popovertarget="popoverId"
      :style="{ anchorName }"
    >
      <Icon icon="lucide:map-pin" class="opacity-60" />
      <span class="grow truncate" :class="{ 'text-base-content/40': !selectedRoom }">
        <template v-if="selectedRoom">
          {{ selectedRoom.locationName }} · {{ selectedRoom.room ?? selectedRoom.code }}
        </template>
        <template v-else>เลือกห้อง</template>
      </span>
      <Icon icon="lucide:chevron-down" class="opacity-60" />
    </button>

    <div
      :id="popoverId"
      ref="popoverRef"
      popover
      class="dropdown w-80 rounded-box bg-base-100 p-2 shadow-lg"
      :style="{ positionAnchor: anchorName }"
      @toggle="onToggle"
    >
      <label class="input input-sm w-full">
        <Icon icon="lucide:search" class="opacity-60" />
        <input v-model="search" type="search" placeholder="ค้นชื่อห้อง / รหัส / ตึก" />
      </label>

      <!-- max-h + overflow: 57 ห้องยาวเกินจอ ปล่อยไว้ popover จะสูงจนล้นออกนอกหน้าต่าง -->
      <ul class="menu menu-sm max-h-80 w-full flex-nowrap overflow-y-auto px-0">
        <li v-for="[building, list] in grouped" :key="building">
          <h2 class="menu-title">{{ building }} ({{ list.length }})</h2>

          <ul>
            <li v-for="room in list" :key="room.id">
              <button
                :ref="(el) => setRoomRef(room.id, el as Element | null)"
                :class="{ 'menu-active': room.id === selectedId }"
                @click="select(room.id)"
              >
                <span class="truncate">{{ room.room ?? room.code }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>

      <p v-if="!grouped.length" class="px-2 py-3 text-center text-sm text-base-content/50">
        ไม่พบห้องที่ค้น
      </p>
    </div>

    <button
      type="button"
      class="btn btn-ghost btn-sm"
      aria-label="ห้องถัดไป"
      :disabled="!canNext"
      @click="step(1)"
    >
      <Icon icon="lucide:chevron-right" />
    </button>
  </div>
</template>
