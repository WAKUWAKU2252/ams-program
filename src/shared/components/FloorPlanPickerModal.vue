<script setup lang="ts">
/**
 * กล่องเลือกสถานที่บนผัง - เปิดซ้อนบนกล่องกรอกสินทรัพย์
 *
 * ★ ต้องปักหมุดเสมอถึงจะยืนยันได้ - "รู้ห้องแต่ไม่รู้จุด" ถูกตัดออกจากทางเดินนี้ทั้งหมด
 *
 * เดิมกล่องนี้ยืนยันได้ตั้งแต่เลือกห้อง หมุดเป็นของเสริม ผลคือของส่วนใหญ่จบที่ "รู้ห้อง"
 * ซึ่งตอบคำถามของคนเดินตรวจไม่ได้เลยในห้องคลังที่มีของเป็นร้อยชิ้น - และเมื่อค่าเริ่มต้น
 * คือไม่ปัก ก็ไม่มีใครกลับมาปักย้อนหลัง สถานะนั้นจึงค้างถาวร
 *
 * สองท่าที่ยังทำได้เหมือนเดิม ต่างกันแค่ท่าแรกยังยืนยันไม่ได้จนกว่าจะปักหมุด:
 *   คลิกห้อง (บนผังหรือในลิสต์) = เล็งห้องไว้ก่อน ยังไม่พอที่จะยืนยัน
 *   ลากหมุดจากมุมขวาบนมาวางบนห้อง = ได้ทั้งห้องและจุดพร้อมกัน จบในท่าเดียว
 *
 * ยังแยกสองท่าอยู่ (ไม่ทำให้คลิก = ปักหมุด) เพราะคนที่แค่ไล่ดูว่าห้องไหนอยู่ตรงไหนจะปัก
 * หมุดค้างโดยไม่ตั้งใจทุกครั้ง - บังคับที่ "ปุ่มยืนยัน" ไม่ใช่ที่ "การคลิก"
 *
 * ★ ใช้ FloorPlanMap ตัวเดียวกับหน้าเต็ม ไม่ก๊อป - ผังใหญ่/เล็กต่างกันแค่ขนาดกรอบ
 *   ตรรกะซูม/เลื่อน/พิกัดเหมือนกันทุกอย่าง ก๊อปเมื่อไหร่คือมีสองที่ให้แก้เวลาพิกัดเพี้ยน
 */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { listFloorPlans, type FloorPlan, type FloorPlanRoom } from '@/shared/services/master.service';
import FloorPlanMap from './FloorPlanMap.vue';
import FloorPlanRoomList from './FloorPlanRoomList.vue';

const props = defineProps<{
  open: boolean;
  /** ค่าที่ฟอร์มถืออยู่ - เปิดกล่องมาแล้วต้องเห็นของเดิมที่เคยเลือกไว้ */
  subLocationId: number | null;
  posX: number | null;
  posY: number | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (
    e: 'confirm',
    value: {
      subLocationId: number;
      /** ไม่ nullable แล้ว - กล่องนี้ยืนยันไม่ได้ถ้าไม่มีหมุด ฝั่งฟอร์มจึงไม่ต้องเผื่อ null */
      posX: number;
      posY: number;
      /** ส่งห้องกลับไปด้วยเพื่อให้ฟอร์มโชว์ ตึก/ชั้น/ห้อง ได้ทันทีโดยไม่ต้องยิงผังซ้ำ */
      room: FloorPlanRoom;
    },
  ): void;
}>();

const plans = ref<FloorPlan[]>([]);
const activeKey = ref('');
const selectedId = ref<number | null>(null);
const pin = ref<{ x: number; y: number } | null>(null);
const loading = ref(false);
const error = ref('');
const warn = ref('');

const activePlan = computed(() => plans.value.find((p) => p.planKey === activeKey.value) ?? null);
const planSrc = computed(() =>
  activePlan.value ? `${import.meta.env.BASE_URL}floorplans/${activePlan.value.planKey}.png` : '',
);
const selectedRoom = computed<FloorPlanRoom | null>(
  () => activePlan.value?.rooms.find((r) => r.id === selectedId.value) ?? null,
);

const mapRef = useTemplateRef<{ focus: (id: number | null) => void }>('mapRef');

/**
 * ห้องที่ฟอร์มถืออยู่อาจอยู่คนละชั้นกับแท็บแรก - ต้องเด้งไปชั้นของมันตอนเปิด
 *
 * ★ ต้องสั่ง focus เองด้วย ไม่ใช่แค่ตั้งค่าแล้วหวังให้แผนที่เล็งตาม
 *
 * กล่องนี้ไม่ถูก unmount ตอนปิด (เป็น .modal ที่สลับคลาส modal-open เอา ไม่ได้ v-if)
 * FloorPlanMap ข้างในจึงอยู่ยาว พร้อม nat/k/tx/ty ที่ค้างจากรอบก่อน — เปิดกล่องเดิมซ้ำ
 * ด้วยห้องเดิม selectedId ไม่เปลี่ยน watch ของมันจึงไม่ยิง และ src ก็เท่าเดิม onImageLoad
 * ก็ไม่ยิง ผลคือแผนที่ค้างมุมเดิมที่ผู้ใช้เลื่อนทิ้งไว้ หมุดถูกวาดจริงแต่อยู่นอกกรอบสายตา
 *
 * nextTick เพราะ activeKey ที่เพิ่งตั้งอาจทำให้ FloorPlanMap เพิ่งถูกสร้าง (v-if="activePlan")
 * — ref ยังไม่ผูกในจังหวะเดียวกัน และถ้าเป็นรอบที่มันเพิ่งสร้างจริง onImageLoad จะเล็งให้
 * อีกทางอยู่แล้ว เรียกซ้ำไม่เสียหาย (สั่งเล็งที่เดียวกันสองครั้ง)
 */
function syncFromProps() {
  selectedId.value = props.subLocationId;
  pin.value = props.posX != null && props.posY != null ? { x: props.posX, y: props.posY } : null;
  warn.value = '';

  const owner = plans.value.find((p) => p.rooms.some((r) => r.id === props.subLocationId));
  activeKey.value = owner?.planKey ?? plans.value[0]?.planKey ?? '';

  void nextTick(() => mapRef.value?.focus(selectedId.value));
}

async function load() {
  if (plans.value.length) return syncFromProps();
  loading.value = true;
  error.value = '';
  try {
    plans.value = await listFloorPlans();
    if (!plans.value.length) error.value = 'ยังไม่มีผังชั้นที่ตีขอบเขตห้องไว้';
    syncFromProps();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'โหลดผังไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
}

watch(() => props.open, (open) => { if (open) void load(); }, { immediate: true });

function switchPlan(key: string) {
  if (key === activeKey.value) return;
  activeKey.value = key;
  // ห้ามให้ห้อง/หมุดของชั้นเดิมค้างข้ามชั้น - พิกัดเป็นของผังคนละใบ
  selectedId.value = null;
  pin.value = null;
}

function onSelectRoom(id: number | null) {
  if (id === selectedId.value) return;
  selectedId.value = id;
  // เปลี่ยนห้อง = หมุดเดิมใช้ไม่ได้แล้ว (กติกาเดียวกับที่ backend ล้างให้ตอน PATCH)
  pin.value = null;
  warn.value = '';
}

/**
 * ลากหมุดมาวางบนห้อง - ท่าเดียวตอบทั้ง "ห้องไหน" และ "ตรงไหนในห้อง"
 *
 * ห้องมาจากจุดที่วางจริง ไม่ใช่ห้องที่เลือกค้างไว้ก่อนหน้า ผู้ใช้จึงลากทีเดียวจบได้
 * โดยไม่ต้องไปกดเลือกห้องในลิสต์ก่อน
 */
function onPlace(value: { x: number; y: number; roomId: number }) {
  selectedId.value = value.roomId;
  pin.value = { x: value.x, y: value.y };
  warn.value = '';
}

/** เหตุผลที่ปุ่มยืนยันยังกดไม่ได้ - ปุ่มจางเฉย ๆ คือที่มาของคำถาม "ทำไมกดไม่ได้" ทุกครั้ง */
const confirmHint = computed(() => {
  if (!selectedRoom.value) return 'เลือกห้องก่อน แล้วลากหมุด 📍 จากมุมขวาบนมาวางในห้อง';
  if (!pin.value) return 'ต้องปักหมุดก่อน - ลากหมุด 📍 จากมุมขวาบนของผังมาวางในห้องที่เลือก';
  return 'ใช้ห้องและจุดที่ปักไว้';
});

function confirm() {
  const room = selectedRoom.value;
  // เช็คหมุดด้วย ไม่ใช่แค่ห้อง - ปุ่มถูก disable ไว้แล้วก็จริง แต่ที่นี่คือด่านที่ทำให้
  // ชนิดของ payload เป็น number จริง (ไม่ใช่ number | null) โดยไม่ต้อง cast
  if (!room || !pin.value) return;
  emit('confirm', {
    subLocationId: room.id,
    posX: pin.value.x,
    posY: pin.value.y,
    room,
  });
  emit('update:open', false);
}
</script>

<template>
  <Teleport to="body">
    <!-- ⚠️ z ต้องมากกว่า 999 - daisyUI ตั้ง .modal ไว้ที่ z-index:999 เขียน z-[60] แล้วกล่องนี้
         จะไปอยู่ "ข้างหลัง" กล่องกรอกสินทรัพย์ทันที (เจอมาแล้ว) ทั้งคู่ teleport ไป body
         เหมือนกัน ลำดับใน DOM จึงไม่พอตัดสินว่าใครทับใคร ต้องระบุ z ให้ชนะตรง ๆ -->
    <div class="modal z-[1000] py-10 backdrop-blur-sm" :class="{ 'modal-open': open }" role="dialog" aria-modal="true">
      <div class="modal-box flex h-[80vh] max-h-none w-11/12 max-w-5xl flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold">เลือกสถานที่บนผัง</h3>
            <p class="text-sm text-base-content/60">
              คลิกเลือกห้อง แล้ว<span class="font-medium">ต้องปักหมุด</span>
              <span class="font-medium">📍</span> จากมุมขวาบนมาวางบนห้องด้วย จึงจะยืนยันได้
            </p>
          </div>
          <div v-if="plans.length" role="tablist" class="tabs tabs-box">
            <button
              v-for="plan in plans"
              :key="plan.planKey"
              role="tab"
              class="tab"
              :class="plan.planKey === activeKey ? 'tab-active' : ''"
              @click="switchPlan(plan.planKey)"
            >
              ชั้น {{ plan.floor ?? plan.planKey }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="flex flex-1 items-center justify-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
        <div v-else-if="error" role="alert" class="alert alert-error"><span>{{ error }}</span></div>

        <div v-else class="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[16rem_1fr]">
          <FloorPlanRoomList
            :rooms="activePlan?.rooms ?? []"
            :selected-id="selectedId"
            @select="onSelectRoom"
          />

          <div class="flex min-h-0 flex-col gap-2">
            <div class="min-h-0 flex-1">
              <FloorPlanMap
                v-if="activePlan"
                ref="mapRef"
                :src="planSrc"
                :rooms="activePlan.rooms"
                :selected-id="selectedId"
                :pinnable="true"
                :pin="pin"
                @select="onSelectRoom"
                @place="onPlace"
                @place-outside="warn = 'ไม่สามารถวางหมุดตรงนั้นได้ ต้องวางลงในขอบเขตของห้อง'"
              />
            </div>

            <div v-if="warn" role="alert" class="alert alert-warning alert-soft py-2">
              <span class="text-sm">{{ warn }}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-3">
          <div class="min-w-0 text-sm">
            <template v-if="selectedRoom">
              <p class="truncate font-medium">{{ selectedRoom.room ?? selectedRoom.code }}</p>
              <!-- "ยังไม่ได้ปักหมุด" ต้องอ่านเป็นงานที่ค้างอยู่ ไม่ใช่สถานะที่ยอมรับได้ -->
              <p class="truncate" :class="pin ? 'text-base-content/60' : 'text-warning'">
                {{ selectedRoom.locationName }} · {{ selectedRoom.code }} ·
                {{ pin ? 'ปักหมุดแล้ว' : 'ยังไม่ได้ปักหมุด' }}
              </p>
            </template>
            <p v-else class="text-base-content/60">ยังไม่ได้เลือกห้อง</p>
          </div>

          <div class="flex flex-wrap gap-2">
            <!-- ถอนหมุดแล้วยืนยันไม่ได้จนกว่าจะปักใหม่ (ปุ่มขวาจะจางลงทันที) — ยังต้องมีปุ่มนี้
                 เพราะการปักผิดที่แล้วอยากเริ่มใหม่ ไม่เหมือนกับการลากทับซึ่งต้องเล็งให้ตรงในครั้งเดียว -->
            <button v-if="pin" class="btn btn-sm" @click="pin = null">ถอนหมุด</button>
            <button class="btn btn-sm" @click="emit('update:open', false)">ยกเลิก</button>
            <button
              class="btn btn-sm btn-primary"
              :disabled="!selectedId || !pin"
              :title="confirmHint"
              @click="confirm"
            >
              ใช้ตำแหน่งนี้
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
