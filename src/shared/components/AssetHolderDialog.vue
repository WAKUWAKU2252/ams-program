<script setup lang="ts">
/**
 * กล่องเปลี่ยนผู้ครอบครอง - เปิดซ้อนบนกล่องรายละเอียด (AppAssetDetail)
 *
 * โครงเดียวกับ AssetWarrantyDialog/AssetImageDialog ที่เปิดจากที่เดียวกัน: กล่องนี้ยิง PATCH
 * เองแล้ว emit 'saved' ให้ผู้เรียกไปโหลดรายละเอียดใหม่ - "แก้ค่าอะไร" กับ "บันทึกยังไง"
 * เป็นเรื่องเดียวกันของเส้นนี้ ไม่ควรแยกให้ผู้เรียกต้องรู้ทั้งสองอย่าง
 *
 * ── ★★ ทำไมช่องนี้ถึงแก้ได้ ทั้งที่ช่องอื่นของแถว SAP_LEGACY แก้ไม่ได้
 *
 * `OITM.Employee` ไม่มีใครไปอัปเดตหลังตั้งสินทรัพย์ครั้งแรก ค่าที่ sync มาจึงค้างอยู่ที่
 * ผู้ครอบครองคนแรกตลอดกาล ส่วนของจริงย้ายมือกันหน้างานเรื่อย ๆ - เจ้าของข้อมูลคือคนที่
 * รักษาให้มันจริงอยู่เสมอ ซึ่งคือ AMS ไม่ใช่ SAP จึงถอด employeeId ออกจาก set: ของ
 * connector แล้วยกกรรมสิทธิ์ช่องนี้มาให้ AMS ทั้งช่อง (ทรงเดียวกับ locationId)
 *
 * ★ role AUDIT ยิงเส้นนี้ไม่ได้ (auditScopeGuard allowlist มีแค่ /location) หน้า Audit
 *   จึงไม่ส่ง editableHolder มาตั้งแต่แรก - ปุ่มที่กดแล้ว 403 คือปุ่มที่ไม่ควรมี
 */
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppEmployeeSelect from './AppEmployeeSelect.vue'
import { ApiError } from '@/shared/services/httpClient'
import { updateAssetHolder } from '@/shared/services/asset.service'

const props = defineProps<{
  open: boolean
  /** ชิ้นที่จะแก้ - null = ยังไม่มีข้อมูล กล่องไม่ควรถูกเปิด */
  assetId: number | null
  /** ผู้ครอบครองปัจจุบัน - null = ยังไม่ระบุ */
  employeeId?: number | null
  /** ชื่อที่โชว์อยู่ตอนนี้ ใช้เล่าให้เห็นว่ากำลังเปลี่ยนจากใคร */
  holderName?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** บันทึกสำเร็จแล้ว - ผู้เรียกต้องโหลดรายละเอียดใหม่ให้ค่าบนจอตรงกับของจริง */
  (e: 'saved'): void
}>()

const saving = ref(false)
const error = ref('')
/** 0 = ไม่ระบุผู้ครอบครอง - รูปที่ AppEmployeeSelect ใช้ (มันไม่รับ null) */
const picked = ref(0)

/**
 * เติมค่าปัจจุบันทุกครั้งที่เปิดใหม่ - กล่องนี้ไม่ถูก unmount ตอนปิด (สลับคลาส modal-open เอา)
 * ถ้าไม่เติมใหม่ คนที่เลือกค้างจากชิ้นก่อนจะโผล่เป็นค่าของชิ้นถัดไป แล้วกดบันทึกทับได้
 * โดยไม่มีอะไรเตือน (เหตุผลเดียวกับ AssetWarrantyDialog)
 */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    picked.value = props.employeeId ?? 0
    error.value = ''
  },
)

/** ไม่มีอะไรเปลี่ยน = ปุ่มบันทึกไม่ต้องกดได้ (backend ก็ไม่เขียนประวัติให้อยู่แล้ว) */
const unchanged = computed(() => picked.value === (props.employeeId ?? 0))

async function save() {
  const id = props.assetId
  if (id === null || saving.value || unchanged.value) return

  saving.value = true
  error.value = ''
  try {
    // 0 ของ AppEmployeeSelect = "ไม่ระบุ" ซึ่งฝั่ง API คือ null - แปลงที่เดียวตรงนี้
    await updateAssetHolder(id, picked.value > 0 ? picked.value : null)
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'บันทึกผู้ครอบครองไม่สำเร็จ ลองใหม่อีกครั้ง'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- ★ Teleport to body - กล่องนี้ถูกเปิดจาก AppAssetDetail ซึ่งอยู่ใน modal อีกชั้นหนึ่ง
       ถ้าปล่อยไว้ในที่เดิม stacking context ของ modal ชั้นนอกจะกดมันไว้ข้างหลัง -->
  <Teleport to="body">
    <div class="modal" :class="{ 'modal-open': open }" role="dialog">
      <div class="modal-box max-w-sm">
        <h3 class="text-base font-semibold">เปลี่ยนผู้ครอบครอง</h3>

        <!-- เล่าว่ากำลังเปลี่ยนจากใคร - คนที่เปิดกล่องมาจากตารางอาจจำไม่ได้ว่าชิ้นไหน -->
        <p class="mt-1 text-xs text-base-content/60">
          ตอนนี้:
          <span :class="holderName ? 'font-medium text-base-content' : ''">
            {{ holderName || 'ทะเบียนยังไม่ระบุ' }}
          </span>
        </p>

        <div class="mt-4">
          <AppEmployeeSelect v-model="picked" :disabled="saving" />
        </div>

        <!-- ★ บอกตรง ๆ ว่า "ไม่ระบุ" เป็นคำตอบที่ใช้ได้ ไม่ใช่การล้างข้อมูลทิ้ง
             ของกลางในห้องประชุมหรือของที่คนลาออกแล้วยังไม่ส่งมอบ ไม่มีผู้ครอบครองจริง ๆ -->
        <p class="mt-2 text-xs text-base-content/50">
          เว้นว่างได้ถ้าตอนนี้ไม่มีใครถือครอง
        </p>

        <p v-if="error" class="mt-3 text-sm text-error">{{ error }}</p>

        <div class="modal-action">
          <button type="button" class="btn" :disabled="saving" @click="emit('update:open', false)">
            ยกเลิก
          </button>
          <button
            type="button"
            class="btn btn-primary gap-1.5"
            :disabled="saving || unchanged"
            @click="save"
          >
            <span v-if="saving" class="loading loading-spinner loading-xs" />
            <Icon v-else icon="lucide:check" class="size-4" />
            บันทึก
          </button>
        </div>
      </div>

      <!-- กดพื้นหลังเพื่อปิด - ทรงเดียวกับกล่องอื่นในหน้านี้ -->
      <div class="modal-backdrop" @click="saving || emit('update:open', false)"></div>
    </div>
  </Teleport>
</template>
