<script setup lang="ts">
/**
 * กล่องส่งคำขอแก้ทะเบียน - ย้ายสถานที่ / เปลี่ยนผู้ครอบครอง
 *
 * ── ★ กล่องเดียวครอบสองชนิด ไม่แยกสองไฟล์
 *
 * โครงเหมือนกันทั้งหมด (เลือกปลายทาง + เหตุผล + ส่ง) ต่างกันแค่ช่องเลือกปลายทางเป็นอะไร
 * แยกไฟล์แล้วต้องดูแลเหตุผล/ปุ่ม/การจัดการ error คู่ขนานสองชุดที่ drift กันได้เงียบ ๆ
 *
 * ── ★★ นี่คือ "คำขอ" ไม่ใช่ "การแก้"
 *
 * กดส่งแล้วทะเบียนยังไม่เปลี่ยน - บัญชีต้องไป key ที่ SAP แล้วกดยืนยันก่อน ข้อความบนกล่อง
 * ต้องบอกเรื่องนี้ให้ชัด ไม่งั้นผู้ใช้จะปิดกล่องแล้วคาดว่าค่าบนจอเปลี่ยนทันที แล้วกดซ้ำ
 */
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppEmployeeSelect from './AppEmployeeSelect.vue'
import { ApiError } from '@/shared/services/httpClient'
import { listLocations, type LocationOption } from '@/shared/services/master.service'
import { submitChangeRequest, type ChangeKind } from '@/shared/services/assetChangeRequest.service'

const props = defineProps<{
  open: boolean
  kind: ChangeKind
  assetId: number | null
  /** ค่าปัจจุบัน - เอาไว้เล่าให้เห็นว่ากำลังขอเปลี่ยนจากอะไร */
  currentLocationName?: string | null
  currentHolderName?: string | null
  currentEmployeeId?: number | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** ส่งคำขอสำเร็จ - ผู้เรียกต้องโหลด "ใบค้างของชิ้นนี้" ใหม่เพื่อปิดปุ่ม */
  (e: 'submitted'): void
}>()

const saving = ref(false)
const error = ref('')
const reason = ref('')

/** 0 = ไม่ระบุผู้ครอบครอง - รูปที่ AppEmployeeSelect ใช้ (มันไม่รับ null) */
const pickedEmployee = ref(0)
const pickedLocation = ref(0)
const locations = ref<LocationOption[]>([])
const loadingLocations = ref(false)

const isMove = computed(() => props.kind === 'LOCATION')

const title = computed(() => (isMove.value ? 'ขอย้ายสถานที่' : 'ขอเปลี่ยนผู้ครอบครอง'))

const currentText = computed(() =>
  isMove.value
    ? (props.currentLocationName ?? 'ยังไม่ระบุ')
    : (props.currentHolderName ?? 'ไม่มีผู้ถือครอง'),
)

/**
 * ★ ปลายทางต้องต่างจากค่าปัจจุบัน - backend ปฏิเสธอยู่แล้ว แต่บอกตั้งแต่ก่อนกดดีกว่า
 *   ให้กดแล้วเจอ error (ผู้ใช้จะไม่รู้ว่าพลาดตรงไหนถ้าเห็นแต่ข้อความสีแดง)
 * ★ ฝั่งผู้ครอบครอง 0 เป็นค่าที่ใช้ได้จริง (= ขอให้ว่าง) จึงเทียบกับ currentEmployeeId
 *   ไม่ใช่เช็คว่า "เลือกหรือยัง"
 */
const canSubmit = computed(() => {
  if (!props.assetId || !reason.value.trim()) return false
  return isMove.value
    ? pickedLocation.value > 0
    : pickedEmployee.value !== (props.currentEmployeeId ?? 0)
})

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    error.value = ''
    reason.value = ''
    pickedEmployee.value = props.currentEmployeeId ?? 0
    pickedLocation.value = 0

    if (!isMove.value || locations.value.length) return
    loadingLocations.value = true
    try {
      // ★ ไม่กรอง outPlan ทิ้ง - ของที่ส่งไปต่างประเทศ/สาขาอื่นเป็นปลายทางที่ถูกต้อง
      //   ตัวที่ backend ปฏิเสธคือ "ตึก" (isPlanArea) ซึ่ง /master/locations ไม่คืนมาอยู่แล้ว
      locations.value = await listLocations()
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'โหลดรายการสถานที่ไม่สำเร็จ'
    } finally {
      loadingLocations.value = false
    }
  },
)

function close() {
  emit('update:open', false)
}

async function save() {
  if (!props.assetId || !canSubmit.value) return
  saving.value = true
  error.value = ''
  try {
    await submitChangeRequest({
      assetId: props.assetId,
      kind: props.kind,
      ...(isMove.value
        ? { toLocationId: pickedLocation.value }
        : // 0 บน AppEmployeeSelect = "ไม่ระบุ" ซึ่งฝั่ง API คือ null (ขอให้ว่าง)
          { toEmployeeId: pickedEmployee.value === 0 ? null : pickedEmployee.value }),
      reason: reason.value.trim(),
    })
    emit('submitted')
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'ส่งคำขอไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog class="modal" :open="open" @close="close">
    <div class="modal-box max-w-lg">
      <h3 class="flex items-center gap-2 text-base font-semibold">
        <Icon :icon="isMove ? 'lucide:map-pin' : 'lucide:user-round'" class="text-lg" />
        {{ title }}
      </h3>

      <!-- ★ ต้องบอกตั้งแต่บรรทัดแรกว่านี่คือ "คำขอ" - ดูเหตุผลที่หัวไฟล์ -->
      <p class="mt-1 text-xs text-base-content/60">
        ส่งแล้วทะเบียนยังไม่เปลี่ยน — บัญชีจะบันทึกที่ SAP แล้วกดยืนยันให้อีกที
      </p>

      <div class="mt-4 space-y-4">
        <div class="rounded-box bg-base-200 px-3 py-2 text-sm">
          <span class="text-base-content/60">ปัจจุบัน:</span>
          <span class="ml-1 font-medium">{{ currentText }}</span>
        </div>

        <label class="form-control">
          <span class="label-text mb-1 block text-sm">
            {{ isMove ? 'สถานที่ปลายทาง' : 'ผู้ครอบครองคนใหม่' }}
          </span>

          <select
            v-if="isMove"
            v-model.number="pickedLocation"
            class="select select-bordered w-full"
            :disabled="loadingLocations || saving"
          >
            <option :value="0" disabled>
              {{ loadingLocations ? 'กำลังโหลด...' : 'เลือกสถานที่' }}
            </option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
          </select>

          <AppEmployeeSelect v-else v-model="pickedEmployee" :disabled="saving" />

          <span v-if="!isMove" class="mt-1 text-xs text-base-content/60">
            เว้นว่างไว้ = ขอให้ไม่มีผู้ถือครอง
          </span>
        </label>

        <label class="form-control">
          <span class="label-text mb-1 block text-sm">เหตุผล</span>
          <textarea
            v-model="reason"
            class="textarea textarea-bordered w-full"
            rows="3"
            maxlength="500"
            placeholder="บัญชีใช้ข้อมูลนี้ตัดสินใจก่อนบันทึกที่ SAP"
            :disabled="saving"
          ></textarea>
        </label>

        <div v-if="error" role="alert" class="mt-2 alert alert-error alert-soft text-sm">
          {{ error }}
        </div>
      </div>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="close">
          ยกเลิก
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!canSubmit || saving"
          @click="save"
        >
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          ส่งคำขอ
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button @click="close">close</button>
    </form>
  </dialog>
</template>
