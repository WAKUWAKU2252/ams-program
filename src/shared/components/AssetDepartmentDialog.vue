<script setup lang="ts">
/**
 * กล่องแก้ "แผนกที่ดูแล" - เปิดซ้อนบนกล่องรายละเอียด (AppAssetDetail)
 *
 * ── ทำไมถึงมีกล่องนี้ได้ตอนนี้ แต่มีไม่ได้ก่อน 0027
 *
 * ก่อนแยกคอลัมน์ asset.departmentId ถูก sync ทับทุกรอบด้วยค่าจาก AssetClass ปุ่มแก้แผนก
 * ตอนนั้นจึงเป็นปุ่มที่ **กดแล้วค่าหายเงียบ ๆ ในรอบ sync ถัดไป** ซึ่งแย่กว่าไม่มีปุ่ม
 * ตอนนี้ SAP เป็นเจ้าของ costCenterId แทน ส่วน departmentId เป็นของ AMS ฝ่ายเดียว
 *
 * ★ กล่องนี้แก้ได้แค่ "แผนกที่ดูแล" - **ห้ามเพิ่มช่องแก้ศูนย์ต้นทุนเข้ามา** อันนั้นมาจาก
 *   ท่อน 3 ของ AssetClass ที่ SAP ทับทุกรอบ แก้ที่นี่ไปก็หาย ต้องไปแก้ที่ SAP
 *
 * ── ทำไมกล่องนี้ยิง PATCH เอง
 *
 * เหมือน AssetWarrantyDialog/AssetImageDialog: "แก้ค่าอะไร" กับ "บันทึกยังไง" เป็นเรื่อง
 * เดียวกันของเส้นนี้ ผู้เรียกมีหน้าที่แค่โหลดรายละเอียดใหม่หลังได้ event saved
 *
 * ★ role AUDIT ยิงเส้นนี้ไม่ได้ (auditScopeGuard allowlist มีแค่ /location) หน้า Audit
 *   จึงไม่ส่ง editableDepartment มา - ปุ่มที่กดแล้ว 403 คือปุ่มที่ไม่ควรมี
 */
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/shared/services/httpClient'
import { updateAssetDepartment } from '@/shared/services/asset.service'
import { listDepartments, type DepartmentOption } from '@/shared/services/master.service'

const props = defineProps<{
  open: boolean
  /** ชิ้นที่จะแก้ - null = ยังไม่มีข้อมูล กล่องไม่ควรถูกเปิด */
  assetId: number | null
  /**
   * บริษัทของชิ้นนี้ - ใช้กรองตัวเลือก **บังคับ**
   *
   * ★ fk_asset_department เป็น composite FK บน (departmentId, companyCode) ตั้งแต่ 0026
   *   แผนกข้ามบริษัทบันทึกไม่ผ่าน (backend ตอบ 400 พร้อมบอกว่าเป็นของบริษัทไหน)
   *   ตัวเลือกที่เลือกแล้วเซฟไม่ได้ต้องไม่โผล่ให้เลือกตั้งแต่แรก - รหัสแผนกซ้ำกันข้ามบริษัท
   *   จริง ('110' มีทั้ง UBA/UBP/MIG คนละแผนกกัน) ลิสต์รวมจึงเลือกถูกไม่ได้ด้วยซ้ำ
   */
  companyCode: string
  /** ค่าปัจจุบัน - null = ยังไม่ระบุแผนก (ของเกือบทั้งทะเบียนหลังล้างค่าตั้งต้นทิ้ง) */
  departmentId?: number | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** บันทึกสำเร็จแล้ว - ผู้เรียกต้องโหลดรายละเอียดใหม่ให้ค่าบนจอตรงกับของจริง */
  (e: 'saved'): void
}>()

const saving = ref(false)
const loading = ref(false)
const error = ref('')
const options = ref<DepartmentOption[]>([])
const search = ref('')
/** '' = ยังไม่ระบุแผนก - เก็บเป็น string เพราะค่าจาก radio/ปุ่มเป็น string เสมอ */
const selected = ref('')

/**
 * โหลดตัวเลือกทุกครั้งที่เปิด ไม่ใช่ครั้งเดียวตอน mount
 *
 * กล่องนี้ไม่ถูก unmount ตอนปิด (สลับคลาส modal-open เอา) และ companyCode เปลี่ยนได้
 * ระหว่างที่ยังไม่ปิดหน้า - เคสจริงคือหน้า QR ที่สแกนชิ้นของอีกบริษัทต่อทันที
 * ถ้าโหลดครั้งเดียว ลิสต์จะเป็นของบริษัทก่อนหน้าแล้วทุกตัวเลือกเซฟไม่ผ่าน
 */
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    selected.value = props.departmentId == null ? '' : String(props.departmentId)
    search.value = ''
    error.value = ''
    loading.value = true
    try {
      options.value = await listDepartments({ companyCode: props.companyCode })
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'โหลดรายชื่อแผนกไม่สำเร็จ'
      options.value = []
    } finally {
      loading.value = false
    }
  },
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? options.value.filter((d) => d.name.toLowerCase().includes(q)) : options.value
})

/** ไม่มีอะไรเปลี่ยน = ไม่ต้องยิง (backend ก็ตัดทิ้งอยู่แล้ว ที่นี่กันไม่ให้กดได้ตั้งแต่แรก) */
const unchanged = computed(
  () => selected.value === (props.departmentId == null ? '' : String(props.departmentId)),
)

async function submit() {
  const id = props.assetId
  if (!id || saving.value || unchanged.value) return

  saving.value = true
  error.value = ''
  try {
    // '' → null = ถอนกลับเป็น "ยังไม่ระบุแผนก" (backend รับ null ตรง ๆ)
    await updateAssetDepartment(id, selected.value ? Number(selected.value) : null)
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'บันทึกแผนกไม่สำเร็จ ลองใหม่อีกครั้ง'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- ⚠️ z ต้องมากกว่า 1000 ด้วยเหตุผลเดียวกับ AssetWarrantyDialog - เปิดซ้อนบน .modal
         ของ daisyUI (z-index:999) และ "รูปเต็มจอ" ของ AppAssetDetail (z-[1000]) -->
    <div
      class="modal z-[1100] backdrop-blur-sm"
      :class="{ 'modal-open': open }"
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-box flex max-w-md flex-col gap-3">
        <h3 class="text-lg font-semibold">แผนกที่ดูแล</h3>

        <label class="input input-sm flex w-full items-center gap-2">
          <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
          <input v-model="search" type="search" class="grow" placeholder="ค้นชื่อแผนก" />
        </label>

        <div v-if="loading" class="py-6 text-center">
          <span class="loading loading-spinner loading-sm" />
        </div>

        <ul v-else class="max-h-64 overflow-y-auto">
          <!-- ตัวเลือก "ยังไม่ระบุ" ต้องอยู่ในลิสต์ ไม่ใช่ปุ่มลบแยก - การถอนกลับเป็นค่าว่าง
               คือการเลือกค่าหนึ่ง ไม่ใช่การทำลายข้อมูล (backend รับ null ตรง ๆ) -->
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-btn px-2 py-2 text-left text-sm hover:bg-base-200"
              :class="{ 'bg-primary/10 font-medium': selected === '' }"
              @click="selected = ''"
            >
              <Icon
                :icon="selected === '' ? 'lucide:check' : 'lucide:minus'"
                class="size-4 shrink-0"
                :class="selected === '' ? 'text-primary' : 'opacity-0'"
              />
              <span class="italic text-base-content/60">ยังไม่ระบุแผนก</span>
            </button>
          </li>
          <li v-for="d in filtered" :key="d.id">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-btn px-2 py-2 text-left text-sm hover:bg-base-200"
              :class="{ 'bg-primary/10 font-medium': selected === String(d.id) }"
              @click="selected = String(d.id)"
            >
              <Icon
                :icon="selected === String(d.id) ? 'lucide:check' : 'lucide:minus'"
                class="size-4 shrink-0"
                :class="selected === String(d.id) ? 'text-primary' : 'opacity-0'"
              />
              <span class="truncate">{{ d.name }}</span>
            </button>
          </li>
          <li v-if="!filtered.length" class="px-2 py-3 text-xs text-base-content/50">
            ไม่พบแผนกที่ตรงกับคำค้น
          </li>
        </ul>

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
            :disabled="saving || loading || unchanged"
            :title="unchanged ? 'ยังไม่ได้เปลี่ยนอะไร' : 'บันทึกแผนก'"
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
