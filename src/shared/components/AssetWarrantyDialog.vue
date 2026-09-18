<script setup lang="ts">
/**
 * กล่องแก้ระยะประกัน - เปิดซ้อนบนกล่องรายละเอียด (AppAssetDetail)
 *
 * ── ทำไมเป็นกล่องแยก ไม่ใช่ฟอร์มกางในบรรทัด
 *
 * ตัวเลือกวันที่ต้องมีที่ให้ปฏิทินกางออกมา และกล่องรายละเอียดเป็นรายการ dl ที่แน่นอยู่แล้ว
 * ฟอร์มที่แทรกกลางรายการดันบรรทัดข้างล่างเลื่อนทุกครั้งที่เปิด/ปิด แล้วคนที่กำลังอ่าน
 * ค่าอื่นอยู่ต้องไล่หาใหม่ - โครงเดียวกับ AssetImageDialog ที่เปิดจากที่เดียวกัน
 *
 * ── ทำไมกล่องนี้เป็นคนยิง PATCH เอง ไม่ใช่ส่งค่ากลับให้ผู้เรียก
 *
 * เหมือน AssetImageDialog: "แก้ค่าอะไร" กับ "บันทึกยังไง" เป็นเรื่องเดียวกันของเส้นนี้
 * ผู้เรียกมีหน้าที่แค่โหลดรายละเอียดใหม่หลังได้ event saved
 *
 * ★ role AUDIT ยิงเส้นนี้ไม่ได้ (auditScopeGuard allowlist มีแค่ /location) หน้า Audit
 *   จึงไม่ส่ง editableWarranty มาตั้งแต่แรก - ปุ่มที่กดแล้ว 403 คือปุ่มที่ไม่ควรมี
 */
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppDatePicker from './AppDatePicker.vue'
import { ApiError } from '@/shared/services/httpClient'
import { updateAssetWarranty } from '@/shared/services/asset.service'

const props = defineProps<{
  open: boolean
  /** ชิ้นที่จะแก้ - null = ยังไม่มีข้อมูล กล่องไม่ควรถูกเปิด */
  assetId: number | null
  /** ค่าปัจจุบันจากรายละเอียด (ISO เต็ม) - null = ยังไม่เคยกรอก */
  warrantyStartDate?: string | null
  warrantyEndDate?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** บันทึกสำเร็จแล้ว - ผู้เรียกต้องโหลดรายละเอียดใหม่ให้ค่าบนจอตรงกับของจริง */
  (e: 'saved'): void
}>()

const saving = ref(false)
const error = ref('')
/** เก็บเป็น 'YYYY-MM-DD' ตามรูปที่ AppDatePicker ใช้ - แปลงตอนเปิด/ตอนส่งที่เดียว */
const form = ref({ start: '', end: '' })

/** ISO → 'YYYY-MM-DD' (สูตรเดียวกับ toDateInput ใน AssetFormDialog) */
const toDateInput = (iso: string | null | undefined) => iso?.slice(0, 10) ?? ''

/**
 * เติมค่าปัจจุบันทุกครั้งที่เปิดใหม่ - กล่องนี้ไม่ถูก unmount ตอนปิด (สลับคลาส modal-open เอา)
 * ถ้าไม่เติมใหม่ ค่าที่กรอกค้างจากชิ้นก่อนจะโผล่เป็นค่าของชิ้นถัดไป แล้วกดบันทึกทับได้
 * โดยไม่มีอะไรเตือน (เคสจริงของหน้า QR ที่สแกนชิ้นถัดไปทั้งที่หน้ายังเปิดอยู่)
 */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = {
      start: toDateInput(props.warrantyStartDate),
      end: toDateInput(props.warrantyEndDate),
    }
    error.value = ''
  },
)

/**
 * ช่วงกลับหัว - ปุ่มจางตั้งแต่แรก ไม่ใช่รอ server ตอบว่าผิด
 *
 * backend กันไว้อีกชั้นอยู่แล้ว และเทียบกับ "ค่าหลังบันทึก" ไม่ใช่แค่ค่าที่ส่งมา
 * (ดู updateWarranty) - ที่นี่มีไว้บอกผู้ใช้ก่อนกด ไม่ใช่แทนด่านนั้น
 */
const rangeInvalid = computed(() => {
  const { start, end } = form.value
  return !!start && !!end && end < start
})

/** ไม่มีอะไรเปลี่ยน = ไม่ต้องยิง - PATCH ที่เขียนค่าเดิมทับตัวเองทำให้ updatedAt ขยับเปล่า ๆ */
const unchanged = computed(
  () =>
    form.value.start === toDateInput(props.warrantyStartDate) &&
    form.value.end === toDateInput(props.warrantyEndDate),
)

async function submit() {
  const id = props.assetId
  if (!id || saving.value || rangeInvalid.value || unchanged.value) return

  saving.value = true
  error.value = ''
  try {
    // ★ ช่องว่าง → null ไม่ใช่ '' - backend แยก "ไม่ได้แก้" (ไม่ส่ง key) กับ "ล้างทิ้ง" (null)
    //   ส่ง '' ไปจะกลายเป็นสตริงว่างที่ pg ตีความเป็นวันที่ไม่ได้
    await updateAssetWarranty(id, {
      warrantyStartDate: form.value.start || null,
      warrantyEndDate: form.value.end || null,
    })
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'บันทึกระยะประกันไม่สำเร็จ ลองใหม่อีกครั้ง'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- ⚠️ z ต้องมากกว่า 1000 ด้วยเหตุผลเดียวกับ AssetImageDialog - กล่องนี้เปิดซ้อนบน
         .modal ของ daisyUI (z-index:999) และ "รูปเต็มจอ" ของ AppAssetDetail (z-[1000])
         ทั้งหมด teleport ไป body เหมือนกัน ลำดับใน DOM จึงไม่พอตัดสินว่าใครทับใคร -->
    <div
      class="modal z-[1100] backdrop-blur-sm"
      :class="{ 'modal-open': open }"
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-box flex max-w-md flex-col gap-3">
        <h3 class="text-lg font-semibold">แก้ไขระยะประกัน</h3>

        <!-- ★ ปฏิทินกางลงมาต้องมีที่ - กล่องนี้จึงไม่ตั้ง overflow-hidden และไม่บีบความสูง
             (ต่างจากกล่องรูปที่ต้องจำกัดความสูงเพราะรูปใหญ่) -->
        <div class="flex flex-col gap-3 sm:flex-row">
          <label class="form-control flex-1 text-left">
            <span class="mb-1 text-xs text-base-content/60">วันเริ่มประกัน</span>
            <AppDatePicker
              v-model="form.start"
              placeholder="เลือกวันเริ่ม"
              :max="form.end || undefined"
              :disabled="saving"
            />
          </label>
          <label class="form-control flex-1 text-left">
            <span class="mb-1 text-xs text-base-content/60">วันสิ้นสุดประกัน</span>
            <AppDatePicker
              v-model="form.end"
              placeholder="เลือกวันสิ้นสุด"
              :min="form.start || undefined"
              :disabled="saving"
            />
          </label>
        </div>

        <!-- ★ ต้องบอกว่าล้างช่องทิ้งได้ - ไม่งั้นคนที่กรอกผิดจะพยายามหาปุ่มลบที่ไม่มี
             (backend รับ null เพื่อล้างค่าโดยตรง ต่างจากเส้นรูปที่ตั้งใจไม่ให้ถอดออก) -->
        <p class="text-left text-xs text-base-content/50">
          เว้นว่างไว้ได้ถ้ายังไม่รู้ระยะประกัน หรือถ้าต้องการล้างค่าที่เคยกรอกไว้
        </p>

        <p v-if="rangeInvalid" class="text-left text-xs text-error">
          วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม
        </p>

        <div v-if="error" role="alert" class="alert alert-error alert-soft py-2">
          <Icon icon="mdi:alert-circle-outline" class="size-5 shrink-0" />
          <span class="text-sm">{{ error }}</span>
        </div>

        <div class="modal-action mt-0">
          <button type="button" class="btn" :disabled="saving" @click="emit('update:open', false)">
            ยกเลิก
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saving || rangeInvalid || unchanged"
            :title="unchanged ? 'ยังไม่ได้เปลี่ยนอะไร' : 'บันทึกระยะประกัน'"
            @click="submit"
          >
            <span v-if="saving" class="loading loading-spinner loading-xs" />
            ยืนยัน
          </button>
        </div>
      </div>

      <div class="modal-backdrop" @click="!saving && emit('update:open', false)"></div>
    </div>
  </Teleport>
</template>
