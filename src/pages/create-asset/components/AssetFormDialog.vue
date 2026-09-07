<script setup lang="ts">

import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import { createAsset, getAsset, updateAsset, type AssetFormPayload } from '@/shared/services/asset.service'
import { ApiError } from '@/shared/services/httpClient'
import type { AssetFormTarget } from '@/shared/types/asset-form'
import type { DepartmentOption, FloorPlanRoom, LocationOption, SubLocationOption } from '@/shared/services/master.service'
import FloorPlanPickerModal from '@/shared/components/FloorPlanPickerModal.vue'
import AppDatePicker from '@/shared/components/AppDatePicker.vue'
import AppEmployeeSelect from '@/shared/components/AppEmployeeSelect.vue'
import { uploadModuleFiles, fileBlobUrl, deleteUploadedFile } from '@/shared/services/attachment.service'
import { rejectRoleLabel } from '@/shared/utils/reject-role'

const props = withDefaults(
  defineProps<{
    open: boolean
    requestId: number
    target: AssetFormTarget | null
    editable?: boolean
    locations?: LocationOption[]
    subLocations?: SubLocationOption[]
    departments?: DepartmentOption[]
    brand?: string
    model?: string
  }>(),
  {
    editable: true,
    locations: () => [],
    subLocations: () => [],
    departments: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
}>()

const isEdit = computed(() => props.target?.assetId != null)

/**
 * ชิ้นนี้ถูกตีกลับอยู่ไหม - ถ้าใช่ ต้องบอกว่า "ใครสั่งให้แก้ และให้แก้อะไร" คาไว้บนฟอร์ม
 *
 * ผู้ขอเปิดกล่องนี้มาเพื่อแก้ตามที่ถูกตีกลับพอดี ถ้าเหตุผลอยู่แต่ในตารางข้างนอก เขาต้องปิด
 * กล่องกลับไปอ่านแล้วเปิดใหม่ทุกครั้งที่ลืม - ซึ่งคือทุกครั้งที่ตีกลับมาหลายข้อ
 *
 * role บอกว่าต้องแก้คนละแบบ: ตีกลับทั้งใบ (หัวหน้า) ต้องกดส่งใหม่หลังแก้
 * ส่วนตีกลับรายชิ้น (บัญชี) แค่แก้ชิ้นนั้นแล้วมันกลับเข้าคิวเอง
 */
const rejection = computed(() => {
  const t = props.target
  if (!t?.rejectReason && !t?.rejectedByName) return null
  return {
    by: t.rejectedByName?.trim() || 'ไม่ทราบชื่อผู้กด',
    // ใช้ตัวแปลตัวเดียวกับ note ในตาราง (utils/reject-role) - ถ้าแยกกันนิยาม วันที่เพิ่ม
    // role ใหม่จะแปลที่เดียวแล้วอีกที่โชว์ค่าดิบ โดยไม่มีอะไรฟ้อง
    role: rejectRoleLabel(t.rejectedRole),
    reason: t.rejectReason?.trim() || 'ไม่ได้ระบุเหตุผล',
  }
})

const form = ref({
  description: props.target?.itemDescription || '',
  serialNumber: '',
  assetClass: '',
  acquisitionCost: 0,
  locationId: 0,
  subLocationId: 0,
  posX: null as number | null,
  posY: null as number | null,
  employeeId: 0,
  warrantyStartDate: '',
  warrantyEndDate: '',
  departmentId: 0,
  imageId: '',
})

// ── ช่องราคาทุน ─────────────────────────────────────────────────────────────
// form.acquisitionCost เป็น "ตัวเลข" เสมอ (payload กับ AssetFormTarget ประกาศเป็น number)
// ส่วน costText คือข้อความที่โชว์ในช่อง แยกกันเพราะสองอย่างนี้ต้องการคนละอย่าง:
//   - ระหว่างพิมพ์ ต้องปล่อยให้พิมพ์ "1500." หรือ "" ค้างไว้ได้ ไม่งั้นเคอร์เซอร์กระโดดทุกตัวอักษร
//   - พอออกจากช่อง ต้องกลับมาเป็นทศนิยม 2 ตำแหน่งเสมอ
//
// ★ ต้องประกาศไว้เหนือ watch ที่ตั้งค่า form (ข้างล่าง) - watch ตัวนั้นทำงานทันทีตอน setup
//   ถ้าประกาศทีหลังจะชน temporal dead zone ของ const แล้วกล่องพังตั้งแต่เปิด
const costText = ref('0.00')

// costText คือแหล่งความจริงของ "สิ่งที่อยู่ในช่อง" ส่วน form.acquisitionCost เดินตามมัน
// ผูกทางเดียวแบบนี้ ไม่ใช่ :value + @input สองทาง เพราะสองทางแล้วรอบไหนที่ค่าที่แปลงกลับ
// ออกมาเท่าเดิม Vue จะไม่ patch DOM ให้ (ค่า prop ไม่เปลี่ยน) ช่องเลยค้างเลขที่พิมพ์ไว้ดิบ ๆ
watch(costText, (raw) => {
  // ตัดคอมมาหลักพันเผื่อคนก๊อปค่ามาจาก Excel - พิมพ์ไม่เป็นเลขถือเป็น 0
  // ไม่เด้ง error ระหว่างพิมพ์ เพราะ "" กับ "1500." เป็นสถานะกลางที่เกิดตลอดเวลา
  const parsed = Number(raw.replace(/,/g, ''))
  form.value.acquisitionCost = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
})

/** ดึงเลขในฟอร์มมาแสดงเป็น .00 - เรียกทุกครั้งที่ตั้งค่า form ใหม่ ไม่งั้นช่องค้างค่าของชิ้นก่อนหน้า */
function syncCostText() {
  costText.value = form.value.acquisitionCost.toFixed(2)
}

/** ปัดเป็น 2 ตำแหน่งตอนออกจากช่อง - ระหว่างพิมพ์ปล่อยตามที่พิมพ์ ไม่งั้นเคอร์เซอร์กระโดด */
function onCostBlur() {
  syncCostText()
}

const saving = ref(false)
const error = ref('')
const imagePreview = ref('')
const isUploadingImage = ref(false)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
// ★ เฉพาะรูปที่ "เพิ่งอัปในรอบนี้และยังไม่ได้บันทึก" - ใช้ตัดสินว่าปิดฟอร์มแล้วต้องลบทิ้งไหม
//   รูปเดิมของชิ้นที่โหลดมาแก้ ห้ามใส่ในนี้ ไม่งั้นกดยกเลิกแล้วรูปที่บันทึกไว้จะหายไปด้วย
const uploadedImageId = ref('')
// โหลดรายละเอียดของชิ้นเดิมอยู่ (เฉพาะตอนกดแก้ไข)
const loadingDetail = ref(false)
// ── ตำแหน่งบนผัง (0023) ─────────────────────────────────────────────────────
// เลิกใช้ dropdown sub-location แล้ว: ตั้งแต่ 0022 ห้องห้อยอยู่กับ "ตึก" ไม่ใช่สถานที่ทาง
// บัญชีที่ผู้ใช้เลือกในช่อง Location ตัวกรองเดิม (s.locationId === form.locationId) จึงคืน
// ลิสต์ว่างทุกครั้ง = เลือกห้องไม่ได้เลย ตอนนี้เลือกจากผังในกล่องแยกแทน
const pickerOpen = ref(false)

/**
 * ดูรูปเต็มจอ - โครงเดียวกับกล่องรายชิ้นของ Asset Request
 *
 * ในกล่องนี้รูปถูกครอบ (object-cover) เพื่อให้บล็อกรูปสูงเท่ากับคอลัมน์ข้าง ๆ ซึ่งเฉือน
 * ขอบภาพทิ้ง - คนที่ต้องอ่าน S/N บนตัวเครื่องจากรูปที่เพิ่งถ่ายมาจึงต้องมีทางดูแบบไม่ถูกเฉือน
 */
const lightboxOpen = ref(false)

/**
 * ห้องที่เลือกไว้ เก็บแค่ที่ต้องโชว์
 *
 * ไม่ใช้ FloorPlanRoom ทั้งก้อนเพราะสองทางที่ค่านี้มาได้ให้ข้อมูลไม่เท่ากัน: กล่องเลือกผัง
 * ส่งห้องเต็ม ๆ มา ส่วนตอนเปิดแก้ของเดิมได้มาจาก relation ของ GET /assets/:id ซึ่งไม่มี polygon
 */
const pickedRoom = ref<{
  locationName: string | null
  floor: string | null
  room: string | null
  code: string
} | null>(null)

/**
 * ระบุห้องไว้แต่ยังไม่มีหมุด - ที่นี่ใช้บอกสถานะเฉย ๆ **ไม่ได้กันการบันทึก**
 *
 * การบังคับปักหมุดอยู่ที่ปุ่มยืนยันของ FloorPlanPickerModal ที่เดียว - เอามากันซ้ำที่ปุ่ม
 * บันทึกด้วยจะล็อกของเก่าที่บันทึกไว้ก่อนกติกานี้ไปทั้งชุด (แก้ช่องอื่นก็ไม่ได้จนกว่าจะไป
 * ปักหมุดให้ก่อน) ซึ่งเกินกว่าที่ตั้งใจ - กติกาใหม่มีไว้กันของใหม่ ไม่ใช่ย้อนไปบังคับของเดิม
 */
const missingPin = computed(() => form.value.subLocationId > 0 && form.value.posX == null)

/**
 * สถานที่ที่เลือกอยู่ "นอกผังของไซต์นี้" ไหม (ต่างประเทศ/สาขาอื่น)
 *
 * ถ้าใช่ ทั้งบล็อก "ตำแหน่งบนผัง" หายไปเลย ไม่ใช่แค่เลิกบังคับ — ผังที่มีคือของไซต์นี้
 * ห้องทุกห้องในนั้นเป็นห้องของที่นี่ ปล่อยให้เลือกได้คือเชิญให้กรอกข้อมูลที่ผิดตั้งแต่ต้น
 * (backend ปฏิเสธอยู่แล้วด้วย assertPlacementUsable — ตรงนี้กันไม่ให้เดินไปเจอ error)
 */
const outPlan = computed(
  () => props.locations.find((l) => l.id === form.value.locationId)?.outPlan ?? false,
)

/**
 * สถานที่นอกผัง แต่ยังมีห้อง/หมุดค้างอยู่ — ต้องล้างก่อนถึงจะบันทึกได้
 *
 * ★ ไม่ล้างให้เองโดยอัตโนมัติ (เคยเขียนเป็น watch แล้วเรียก clearPlace ทันที) เพราะเคส
 *   ที่เจอบ่อยที่สุดคือ "เปิดของเก่าขึ้นมาแก้คำอธิบาย" — ของที่บันทึกไว้ตั้งแต่ก่อนมีธง
 *   outPlan จะมีห้อง+หมุดค้างอยู่ พอเปิดฟอร์ม outPlan พลิกเป็น true ทันที ห้องที่บัญชี
 *   กรอกไว้จะถูกล้างเงียบ ๆ ตั้งแต่วินาทีแรก แล้วหายจริงตอนกดบันทึกอะไรก็ตาม
 *   โดยที่บล็อกตำแหน่งถูกซ่อนไปแล้ว — ไม่มีใครเห็นด้วยซ้ำว่าเพิ่งเสียอะไรไป
 *
 * ให้ขึ้นเตือนพร้อมปุ่มล้างแทน: การลบข้อมูลที่คนอื่นกรอกไว้ต้องเป็นการตัดสินใจของผู้ใช้
 * ไม่ใช่ผลข้างเคียงของการเปิดกล่อง
 */
const outPlanConflict = computed(
  () => outPlan.value && (form.value.subLocationId > 0 || form.value.posX != null),
)

/** ข้อความสรุปใต้ปุ่ม - ตึกมาจากห้อง ไม่ได้เก็บซ้ำบน asset (derive อย่างเดียว) */
const placeLabel = computed(() => {
  const r = pickedRoom.value
  if (!r) return ''
  const where = [r.locationName, r.floor ? `ชั้น ${r.floor}` : null, r.room ?? r.code]
    .filter(Boolean)
    .join(' · ')
  return missingPin.value ? `${where} ยังไม่ได้ปักหมุด` : `${where} ปักหมุดแล้ว`
})

function onPlacePicked(value: {
  subLocationId: number
  posX: number
  posY: number
  room: FloorPlanRoom
}) {
  form.value.subLocationId = value.subLocationId
  form.value.posX = value.posX
  form.value.posY = value.posY
  pickedRoom.value = {
    locationName: value.room.locationName,
    floor: value.room.floor,
    room: value.room.room,
    code: value.room.code,
  }
}

function clearPlace() {
  form.value.subLocationId = 0
  // หมุดต้องหายไปพร้อมห้องเสมอ - ck_asset_pos_needs_sub_location ที่ DB ปฏิเสธพิกัดลอย ๆ
  form.value.posX = null
  form.value.posY = null
  pickedRoom.value = null
}
onBeforeUnmount(() => {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  discardPendingImage()
})

/**
 * ทิ้งรูปที่อัปแล้วแต่ยังไม่ได้ผูกกับ asset - เรียกตอนปิดฟอร์มโดยไม่บันทึก
 *
 * ไม่ต้องรอผลและไม่ต้องแจ้ง error: ต่อให้ลบไม่สำเร็จ ไฟล์ก็แค่กลายเป็นกำพร้าซึ่ง
 * cleanupOrphans ฝั่ง backend กวาดให้เองใน 24 ชม. (ทำตรงนี้แค่ไม่ให้กองไว้เปล่า ๆ)
 */
function discardPendingImage() {
  if (!uploadedImageId.value) return
  deleteUploadedFile(uploadedImageId.value).catch(() => { })
  uploadedImageId.value = ''
}

// หน้านี้ไม่กรอก category/uom - สองตัวนั้นอยู่ที่ OITM ของ SAP ไม่ได้อยู่บน PO
// ถูกถอดออกจาก createAssetBody และทำเป็น nullable แล้วใน migration 0007
const masterMissing = computed(() => !props.locations.length)
const hasImage = computed(() => !!uploadedImageId.value || !!form.value.imageId)

/**
 * ช่องบังคับของ "ของใหม่" - คืนข้อความชี้ช่องแรกที่ยังไม่ครบ ('' = ครบแล้ว)
 *
 * ห้อง + หมุด + รูป บังคับตอนสร้างตั้งแต่กติกาใหม่ (createAssetBody บังคับอีกชั้นที่ backend)
 * ของที่ไม่มีห้องและไม่มีหมุดคือของที่คนเดินตรวจนับหาไม่เจอ ส่วนรูปคือสิ่งเดียวที่คนหน้างาน
 * ใช้ยืนยันว่าของตรงหน้าคือชิ้นเดียวกับในทะเบียน
 *
 * ★ เช็ค isEdit ก่อนเสมอ - บังคับเฉพาะของใหม่ ของเก่าที่บันทึกไว้ก่อนกติกานี้ (และของที่
 *   sync มาจาก SAP) ต้องแก้ช่องอื่นได้โดยไม่ถูกล็อกให้ไปเติมสามช่องนี้ก่อน หลักเดียวกับ
 *   ที่ missingPin เขียนไว้: กติกาใหม่มีไว้กันของใหม่ ไม่ใช่ย้อนไปบังคับของเดิม
 *
 * ★ เรียงตามลำดับที่ผู้ใช้ต้องไปทำจริง (สถานที่ -> ห้อง -> หมุด -> รูป) บอกทีละช่อง
 *   ไม่ใช่รวบว่า "กรอกไม่ครบ" - คนกดต้องรู้ว่าต้องไปมองตรงไหนต่อ
 */
const missingForCreate = computed(() => {
  if (isEdit.value) return ''
  const f = form.value
  // locationId เป็น FK NOT NULL ที่ DB และ backend บังคับ minimum: 1 อยู่แล้ว
  if (f.locationId <= 0) return 'ต้องเลือกสถานที่ (Location) ก่อนจึงจะบันทึกได้'
  // สถานที่นอกผังไม่มีห้องให้เลือกและไม่มีจุดให้ปัก — ข้ามสองด่านนี้ไป (ดู outPlan)
  if (!outPlan.value) {
    if (f.subLocationId <= 0) return 'ต้องเลือกห้องจากผังก่อนจึงจะบันทึกได้'
    if (f.posX == null || f.posY == null) return 'ต้องปักหมุดตำแหน่งบนผังก่อนจึงจะบันทึกได้'
  }
  if (!hasImage.value) return 'ต้องแนบรูปถ่ายของชิ้นนี้ก่อนจึงจะบันทึกได้'
  return ''
})

const canSave = computed(() => {
  if (!props.editable || saving.value || isUploadingImage.value) return false
  // ★ ห้ามบันทึกระหว่างโหลดของเดิม - ตอนนั้นฟอร์มยังเป็นค่าว่างที่รีเซ็ตไว้
  //   กดแล้วจะ PATCH ทับสถานที่/ผู้ถือครอง/ประกันที่บันทึกไว้ให้หายหมด
  if (loadingDetail.value) return false
  // ปล่อยให้กดได้ทั้งที่ยังไม่ครบ = ได้ 422 กลับมาแทนที่จะกันไว้ตั้งแต่ปุ่ม
  // ค้างห้อง/หมุดไว้กับสถานที่นอกผัง = backend ปฏิเสธแน่นอน กันที่ปุ่มดีกว่าปล่อยไปเจอ 400
  if (outPlanConflict.value) return false
  if (missingForCreate.value) return false
  return true
})

/**
 * เหตุผลที่ปุ่มบันทึกยังกดไม่ได้ - โชว์เป็น title ของปุ่ม แบบเดียวกับกล่องรายชิ้นของ Asset Request
 *
 * ปุ่มจางเฉย ๆ โดยไม่บอกเหตุผลคือที่มาของคำถาม "กดไม่ได้" ทุกครั้ง โดยเฉพาะเคสที่ช่องที่ขาด
 * (สถานที่/หมุด/รูป) อยู่คนละคอลัมน์กับปุ่ม - คนกดไม่รู้ด้วยซ้ำว่าต้องไปมองตรงไหน
 */
const saveHint = computed(() => {
  if (!props.editable) return 'ใบนี้ไม่ได้อยู่ในสถานะที่แก้ไขได้'
  if (loadingDetail.value) return 'กำลังโหลดข้อมูลเดิม - รอสักครู่ก่อนบันทึก'
  if (isUploadingImage.value) return 'กำลังอัปโหลดรูป'
  if (outPlanConflict.value) return 'สถานที่นี้อยู่นอกพื้นที่ผัง ต้องล้างห้องและหมุดที่ผูกไว้ก่อน'
  if (missingForCreate.value) return missingForCreate.value
  return isEdit.value ? 'บันทึกการแก้ไขของชิ้นนี้' : 'บันทึกรายละเอียดของชิ้นนี้'
})

/** ป้ายบนหัวกล่อง - บอกว่ากล่องนี้กำลังทำอะไรอยู่ (สร้าง/แก้ไข/อ่านอย่างเดียว) */
const modeBadge = computed(() => {
  if (!props.editable)
    return { label: 'อ่านอย่างเดียว', icon: 'lucide:lock', class: 'badge-neutral badge-soft' }
  return isEdit.value
    ? { label: 'แก้ไข', icon: 'mdi:pencil-outline', class: 'badge-info badge-soft' }
    : { label: 'กรอกใหม่', icon: 'mdi:plus-circle-outline', class: 'badge-primary badge-soft' }
})

/** backend คืน ISO เต็ม ('2026-08-13T00:00:00.000Z') แต่ AppDatePicker ใช้ 'YYYY-MM-DD' */
const toDateInput = (iso: string | null) => iso?.slice(0, 10) ?? ''

watch(
  () => [props.open, props.target] as const,
  async ([open, target]) => {
    if (!open || !target) return
    error.value = ''
    uploadError.value = ''
    uploadedImageId.value = ''
    // เปิดชิ้นใหม่ทั้งทีต้องเริ่มที่ฟอร์ม ไม่ใช่ค้างอยู่บนรูปเต็มจอของชิ้นก่อนหน้า
    lightboxOpen.value = false
    if (imagePreview.value) {
      URL.revokeObjectURL(imagePreview.value)
      imagePreview.value = ''
    }

    // ตั้งค่าจาก target ก่อนเสมอ - ทั้งกรณีสร้างใหม่ และเป็นค่าตั้งต้นระหว่างรอโหลดของเดิม
    // (ถ้าไม่ล้างก่อน ค่าของชิ้นที่เปิดดูรอบก่อนจะค้างให้เห็นชั่ววินาที แล้วดูเหมือนกรอกไว้แล้ว)
    form.value = {
      description: target.itemDescription || '',
      serialNumber: target.serialNumber ?? '',
      assetClass: '',
      acquisitionCost: target.acquisitionCost,
      locationId: 0,
      subLocationId: 0,
      posX: null,
      posY: null,
      employeeId: 0,
      warrantyStartDate: '',
      warrantyEndDate: '',
      departmentId: 0,
      imageId: '',
    }
    syncCostText()
    pickedRoom.value = null

    if (target.assetId == null) return

    // ── โหมดแก้ไข: ดึงของที่บันทึกไว้จริงมาเติม ─────────────────────────────
    // target มีแค่ข้อมูลที่ตารางรู้ (คำอธิบาย/serial/ราคา) - สถานที่ ผู้ถือครอง ประกัน รูป
    // อยู่ในแถว asset เท่านั้น ไม่ดึงมาจะเห็นฟอร์มว่างแล้วเข้าใจผิดว่ายังไม่เคยกรอก
    loadingDetail.value = true
    const assetId = target.assetId
    try {
      const detail = await getAsset(assetId)

      // เปลี่ยนช่องระหว่างรอ fetch ได้ (ผู้ใช้ปิดแล้วเปิดชิ้นอื่น) - ถ้าไม่เช็ค
      // ข้อมูลของชิ้นเก่าจะมาทับสิ่งที่กำลังดูอยู่
      if (props.target?.assetId !== assetId) return

      form.value = {
        description: detail.description ?? '',
        serialNumber: detail.serialNumber ?? '',
        assetClass: detail.assetClass ?? '',
        // ทะเบียนเก่าบางชิ้นไม่มีราคาทุน (null) - ช่องกรอกรับ null ไม่ได้ ตกเป็น 0 แล้วโชว์ 0.00
        acquisitionCost: detail.acquisitionCost ?? 0,
        locationId: detail.locationId,
        subLocationId: detail.subLocationId ?? 0,
        posX: detail.posX,
        posY: detail.posY,
        employeeId: detail.employeeId ?? 0,
        warrantyStartDate: toDateInput(detail.warrantyStartDate),
        warrantyEndDate: toDateInput(detail.warrantyEndDate),
        departmentId: detail.departmentId ?? 0,
        imageId: detail.imageId ?? '',
      }
      syncCostText()
      pickedRoom.value = detail.subLocation
        ? {
          locationName: detail.subLocation.location?.name ?? null,
          floor: detail.subLocation.floor,
          room: detail.subLocation.room,
          code: detail.subLocation.code,
        }
        : null

      // ★ ไม่เซ็ต uploadedImageId - รูปนี้ผูกกับ asset แล้ว ถ้าใส่ไว้ กดยกเลิกจะไปลบของจริง
      if (detail.imageId) {
        try {
          imagePreview.value = await fileBlobUrl(detail.imageId)
        } catch {
          // โหลดรูปไม่ขึ้นไม่ควรทำให้แก้ข้อมูลอื่นไม่ได้ - ปล่อยให้ขึ้น spinner ค้างแทน
          uploadError.value = 'โหลดรูปที่แนบไว้ไม่สำเร็จ'
        }
      }
    } catch (e) {
      error.value =
        e instanceof ApiError ? e.message : 'โหลดข้อมูลเดิมไม่สำเร็จ - แก้ไขตอนนี้อาจทับข้อมูลที่มีอยู่'
    } finally {
      loadingDetail.value = false
    }
  },
  { immediate: true },
)

function close() {
  if (saving.value) return
  // ปิดทั้งที่ยังไม่บันทึก = รูปที่อัปไว้ไม่มีวันถูกผูกกับ asset ไหน ทิ้งไปเลย
  discardPendingImage()
  lightboxOpen.value = false
  emit('update:open', false)
}

// ESC ปิดทีละชั้นจากบนลงล่าง - ไม่งั้นกดครั้งเดียวปิดพรวดทั้งรูปเต็มจอและฟอร์มที่กรอกค้างไว้
// (กล่องเลือกผังไม่มี handler ของตัวเอง ต้องปิดให้จากตรงนี้ ไม่ใช่ปล่อยให้ทะลุไปปิดฟอร์ม)
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (lightboxOpen.value) lightboxOpen.value = false
  else if (pickerOpen.value) pickerOpen.value = false
  else close()
}

// ไม่ต้องล็อก scroll เอง - daisyUI ทำให้แล้วผ่าน :root:has(.modal.modal-open)
// (ล็อกที่ :root พร้อม scrollbar-gutter: stable ล็อกเองที่ body จะทำให้หน้าเลื่อนเพราะ scrollbar หาย)
watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

// ─── Image Upload Handlers ───────────────────────────────────────────────────

// ต้องตรงกับ RULES.ASSET_IMG ฝั่ง backend (upload.service.ts) - เช็คสองชั้นโดยตั้งใจ:
// ที่นี่เพื่อบอกผู้ใช้ทันทีโดยไม่ต้องรอส่งไฟล์ 5MB ขึ้นไปแล้วค่อยรู้ว่าไม่ผ่าน
// ที่ backend เพราะ client เชื่อไม่ได้ (ยิง API ตรงข้าม UI ได้เสมอ)
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** จุดเดียวที่อัปรูป - ทั้งปุ่มเลือกไฟล์และการลากมาวางเรียกตัวนี้ */
async function uploadImage(file: File) {
  if (!IMAGE_MIME.includes(file.type)) {
    uploadError.value = 'รับเฉพาะไฟล์ JPG, PNG หรือ WebP'
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    uploadError.value = `ไฟล์ใหญ่เกินไป (สูงสุด ${IMAGE_MAX_BYTES / 1024 / 1024} MB)`
    return
  }

  uploadError.value = ''
  isUploadingImage.value = true

  // ตัวเก่าต้องถูกลบ "หลัง" ตัวใหม่ขึ้นสำเร็จ - ลบก่อนแล้วอัปพัง จะเหลือฟอร์มที่ไม่มีรูปเลย
  // ทั้งที่ผู้ใช้แค่อยากเปลี่ยนรูป (ของเดิมหายไปโดยไม่ได้ตั้งใจและกู้ไม่ได้)
  const previous = uploadedImageId.value

  try {
    const { files } = await uploadModuleFiles('ASSET_IMG', [file])
    const uploaded = files[0]
    // backend คืน array - ถ้าว่างแปลว่าสัญญาไม่ตรงกัน ต้องรู้ ไม่ใช่เงียบแล้วปล่อยฟอร์มค้าง
    if (!uploaded) throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับ id ไฟล์กลับมา')

    uploadedImageId.value = uploaded.id
    form.value.imageId = uploaded.id

    // endpoint อยู่หลัง authGuard ใส่ URL ตรง ๆ ใน <img src> จะได้ 401 - fileBlobUrl แนบ token ให้
    const nextPreview = await fileBlobUrl(uploaded.id)
    if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
    imagePreview.value = nextPreview

    if (previous) {
      // ลบไม่สำเร็จไม่ใช่เรื่องที่ผู้ใช้ต้องรับรู้ - รูปใหม่ขึ้นแล้ว ส่วนตัวเก่ากลายเป็นกำพร้า
      // ซึ่ง cleanupOrphans ฝั่ง backend กวาดให้เองใน 24 ชม.
      deleteUploadedFile(previous).catch(() => { })
    }
  } catch (e) {
    uploadError.value = e instanceof ApiError ? e.message : 'อัปโหลดรูปไม่สำเร็จ'
  } finally {
    isUploadingImage.value = false
    // เคลียร์ค่าใน input - ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่เกิด change event (ค่าไม่เปลี่ยน)
    if (fileInput.value) fileInput.value.value = ''
  }
}

function handleImageSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void uploadImage(file)
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (!props.editable || isUploadingImage.value) return

  const file = event.dataTransfer?.files?.[0]
  if (file) void uploadImage(file)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

async function removeImage() {
  if (uploadedImageId.value) {
    try {
      await deleteUploadedFile(uploadedImageId.value)
    } catch (e) {
      console.error('ลบรูปไม่สำเร็จ:', e)
    }
  }
  uploadedImageId.value = ''
  form.value.imageId = ''
  if (imagePreview.value) {
    URL.revokeObjectURL(imagePreview.value)
    imagePreview.value = ''
  }
  if (fileInput.value) fileInput.value.value = ''
}

// ─── Form Payload Builder ────────────────────────────────────────────────────

// ช่องที่เว้นว่างต้องส่ง undefined ไม่ใช่ '' หรือ 0 - คอลัมน์เป็น nullable
// ส่ง '' ไปจะได้ค่าสตริงว่างที่แยกไม่ออกจาก "ยังไม่กรอก" ส่วน 0 ไม่ผ่าน minimum: 1 ของ backend
//
// imageId เป็นข้อยกเว้นเดียว - ตอนแก้ไขต้องส่ง null ไม่ใช่ undefined เมื่อผู้ใช้กดลบรูป
// undefined = "ไม่ได้แก้ช่องนี้" ซึ่ง backend จะไม่แตะคอลัมน์ แล้วรูปเดิมยังผูกอยู่
// (ฝั่ง create รับ null ไม่ได้ - ไม่มีรูปก็แค่ไม่ส่ง key มา จึงต้องแยกสองโหมด)
// overload: โหมด update คืนชนิดที่ imageId เป็น null ได้ / โหมด create คืนชนิดที่เป็นไม่ได้
// - ให้ compiler บังคับความต่างนี้แทนที่จะพึ่งว่าคนอ่านคอมเมนต์แล้วจำได้
function buildPayload(forUpdate: true): AssetFormPayload
function buildPayload(forUpdate: false): AssetFormPayload & { imageId?: string }
function buildPayload(forUpdate: boolean): AssetFormPayload {
  const f = form.value
  const text = (v: string) => v.trim() || undefined
  const id = (v: number) => (v > 0 ? v : undefined)
  const uuid = (v: string) => v || (forUpdate ? null : undefined)
  // ช่องข้อความที่ "ลบทิ้งได้" - ตอนแก้ไขต้องส่ง null ไม่ใช่ undefined เมื่อผู้ใช้ล้างช่อง
  // (undefined = ไม่ได้แก้ backend ไม่แตะคอลัมน์ แล้วค่าเดิมจะยังอยู่แบบเงียบ ๆ)
  // ฝั่ง create ยังเป็น undefined เหมือนเดิม - ไม่มีค่าก็แค่ไม่ส่ง key มา
  const clearable = (v: string) => v.trim() || (forUpdate ? null : undefined)
  /**
   * หมุด - ต้องแยกสองโหมดเหมือน clearable ไม่ใช่ส่งค่าดิบ
   *
   * createAssetBody รับ `t.Optional(t.Number())` เฉย ๆ **ไม่รับ null** ส่วน updateAssetBody
   * รับ null ได้ (= ถอนหมุด) การส่ง f.posX ดิบ ๆ จึงยิง null เข้า POST ทุกครั้งที่ยังไม่ได้
   * ปักหมุด แล้วได้ 422 "posX: Expected number" กลับมาโดยที่ตัวฟอร์มไม่มีอะไรผิดเลย
   * (เคสที่เจอบ่อยสุดคือสร้างชิ้นใหม่โดยไม่เลือกห้อง ซึ่งเป็นทางปกติ)
   */
  const pos = (v: number | null) => (v == null ? (forUpdate ? null : undefined) : v)
  /**
   * ห้อง - ต้องแยกสองโหมดเหมือน pos ข้างบน ใช้ id() เฉย ๆ ไม่ได้
   *
   * id() แปลง 0 เป็น undefined ซึ่ง JSON.stringify ตัดทิ้ง แปลว่าปุ่ม "ล้าง" ส่งแต่
   * posX/posY = null ไปโดยไม่มี subLocationId ติดไปด้วย backend จึงเห็นว่า "ไม่ได้แก้ช่องนี้"
   * แล้วไม่แตะคอลัมน์ - ผลคือหมุดหายแต่ห้องยังอยู่ใน DB พอเปิดกล่องใหม่ getAsset คืนห้อง
   * เดิมกลับมา เหมือนกดล้างแล้วไม่มีอะไรเกิดขึ้น
   *
   * ฝั่ง create ยังเป็น undefined เหมือนเดิม - createAssetBody บังคับให้มีห้องอยู่แล้ว
   */
  const room = (v: number) => (v > 0 ? v : forUpdate ? null : undefined)

  return {
    description: text(f.description),
    serialNumber: clearable(f.serialNumber),
    assetClass: text(f.assetClass),
    locationId: id(f.locationId),
    subLocationId: room(f.subLocationId),
    posX: pos(f.posX),
    posY: pos(f.posY),
    departmentId: id(f.departmentId),
    employeeId: id(f.employeeId),
    warrantyStartDate: text(f.warrantyStartDate),
    warrantyEndDate: text(f.warrantyEndDate),
    acquisitionCost: f.acquisitionCost,
    imageId: uuid(f.imageId),
  }
}
async function onSave() {
  const target = props.target
  if (!target || saving.value || isUploadingImage.value) return

  // ห้ามบันทึกถ้ายังมี error ตรง upload
  if (uploadError.value) {
    error.value = 'กรุณาตรวจสอบรูปภาพก่อนบันทึก'
    return
  }

  saving.value = true
  error.value = ''

  try {
    if (target.assetId != null) {
      await updateAsset(target.assetId, buildPayload(true))
    } else {
      // ── ของใหม่ต้องครบ: สถานที่ + ห้อง + หมุด + รูป ──────────────────────
      //
      // ปุ่มถูกปิดด้วย canSave อยู่แล้ว ตรงนี้เป็นด่านสำรอง (กด Enter ในฟอร์มก็มาถึงได้)
      // และเป็นตัวที่ทำให้ TS รู้ว่าสี่ช่องนี้ไม่ null ตอนสร้าง แทนการโปรย ! ทิ้งไว้
      // ★ ห้อง/หมุดบังคับเฉพาะสถานที่ที่อยู่ในผัง — สถานที่นอกผังไม่มีให้กรอกตั้งแต่ต้น
      //   (กติกาเดียวกับ assertPlacementUsable ฝั่ง backend ซึ่งเป็นด่านจริง)
      const { locationId, subLocationId, posX, posY, imageId } = form.value
      const placeOk = outPlan.value
        ? subLocationId <= 0 && posX == null && posY == null
        : subLocationId > 0 && posX != null && posY != null
      if (locationId <= 0 || !placeOk || !imageId) {
        error.value = missingForCreate.value || 'กรอกข้อมูลที่จำเป็นให้ครบก่อนบันทึก'
        return
      }
      await createAsset({
        ...buildPayload(false),
        requestId: props.requestId,
        grpoLineId: target.grpoLineId,
        unitNo: target.unitNo,
        // ส่งจากตัวแปรที่แคบชนิดแล้วข้างบน - buildPayload คืนชนิดกว้าง (optional/null ได้)
        // ตามที่ฝั่ง PATCH ต้องการ ซึ่งไม่ตรงกับที่ createAssetBody ต้องการ
        locationId,
        // สถานที่นอกผัง = ไม่ส่งสามช่องนี้เลย (undefined) ไม่ใช่ส่ง 0/null
        subLocationId: subLocationId > 0 ? subLocationId : undefined,
        posX: posX ?? undefined,
        posY: posY ?? undefined,
        imageId,
      })
    }

    // บันทึกสำเร็จ - ไม่ต้องลบรูป เพราะรูปถูกผูกกับ asset แล้ว
    uploadedImageId.value = ''
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ โปรดลองอีกครั้ง'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal backdrop-blur-sm" :class="{ 'modal-open': open }" role="dialog" aria-modal="true">
      <!-- p-0 + flex-col: หัวกล่องกับแถวปุ่มตรึงไว้ ให้เลื่อนเฉพาะเนื้อหาตรงกลาง - โครงเดียวกับ
           กล่อง "จัดการสินทรัพย์รายชิ้น" ของ Asset Request เพราะเป็นงานคู่กันบนชิ้นเดียวกัน
           (ผู้ขอกรอกในกล่องนี้ บัญชีตรวจในกล่องนั้น) คนละหน้าตากันแล้วต้องเรียนรู้สองรอบ
           ฟอร์มนี้สูงเกินจอโน้ตบุ๊กเสมอ ถ้าปล่อยทั้งกล่องเลื่อน ปุ่มบันทึกจะหลุดจอตลอดเวลาที่กรอก -->
      <div v-if="target" class="modal-box flex max-h-[88dvh] max-w-4xl flex-col overflow-hidden p-0">
        <!-- ── หัวกล่อง: ชิ้นไหน + กล่องนี้กำลังทำอะไร (ตรึงบน) -->
        <div class="flex items-start justify-between gap-3 border-b border-base-300 px-5 py-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="grid size-10 shrink-0 place-items-center rounded-box bg-base-200">
              <Icon icon="mdi:cube-scan" class="size-5 opacity-70" />
            </div>
            <div class="min-w-0 text-left">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg leading-tight font-semibold">
                  {{ isEdit ? 'แก้ไขรายละเอียดสินทรัพย์' : 'กรอกรายละเอียดสินทรัพย์' }}
                </h3>
                <span class="badge badge-sm gap-1" :class="modeBadge.class">
                  <Icon :icon="modeBadge.icon" class="size-3.5" />
                  {{ modeBadge.label }}
                </span>
              </div>
              <!-- ป้ายอ้างอิงชุดเดียวกับกล่องของบัญชี - เลขใบ/รอบรับของ/ชิ้นที่ อ่านตรงกันทั้งสองฝั่ง
                   เวลาคุยกันว่า "ชิ้น 3.2 ของ GRPO ไหน" จะได้ชี้ที่เดียวกัน -->
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="badge badge-neutral badge-soft badge-sm gap-1 font-mono">
                  <Icon icon="mdi:file-document-outline" class="size-3.5" />#{{ requestId }}
                </span>
                <span class="badge badge-soft badge-sm gap-1 font-mono">
                  <Icon icon="mdi:truck-delivery-outline" class="size-3.5" />GRPO {{ target.grpoNo }}
                </span>
                <span class="badge badge-ghost badge-sm gap-1 font-mono">
                  ชิ้นที่ {{ target.poLine }}.{{ target.unitNo }}
                </span>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label="ปิด" :disabled="saving"
            @click="close">
            <Icon icon="mdi:close" class="size-5" />
          </button>
        </div>

        <!-- ── เนื้อหา (ส่วนที่เลื่อนได้) -->
        <div class="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-left">
          <!-- แก้ไม่ได้ = ต้องบอกในกล่อง ไม่ใช่แค่ทำให้ช่องจาง - คนเห็นช่องจางโดยไม่มีคำอธิบาย
               จะนึกว่าระบบพัง แล้วกดซ้ำ/รีเฟรชหน้าไปเรื่อย ๆ -->
          <div v-if="!editable" role="alert" class="alert alert-warning alert-soft items-start">
            <Icon icon="lucide:lock" class="size-5 shrink-0" />
            <span class="text-sm">ใบนี้ไม่ได้อยู่ในสถานะที่แก้ไขได้ - เปิดดูได้อย่างเดียว</span>
          </div>

          <!-- ── ชิ้นนี้ถูกตีกลับ: ใครสั่ง และให้แก้อะไร
               ขึ้นก่อนฟอร์มเพราะนี่คือโจทย์ของการเปิดกล่องนี้ และต้องอ่านได้ตลอดเวลาที่กรอก
               ไม่ใส่ truncate/บรรทัดเดียว - เหตุผลตีกลับยาวได้และตัดทิ้งไม่ได้สักคำ -->
          <div v-if="rejection" role="alert" class="alert alert-warning alert-soft items-start">
            <Icon icon="mdi:undo-variant" class="size-5 shrink-0" />
            <div class="min-w-0">
              <div class="text-sm font-medium">
                ถูกตีกลับโดยคุณ {{ rejection.by }}
                <span v-if="rejection.role" class="font-normal opacity-70">· {{ rejection.role }}</span>
              </div>
              <div class="mt-0.5 text-sm break-words whitespace-pre-line">
                เหตุผล: {{ rejection.reason }}
              </div>
            </div>
          </div>

          <!-- โหลดของเดิมอยู่ - ต้องบอก ไม่งั้นผู้ใช้เห็นฟอร์มว่างแล้วเริ่มพิมพ์ทับ
               แล้วค่าที่โหลดมาจะเด้งมาทับสิ่งที่เพิ่งพิมพ์ -->
          <div v-if="loadingDetail" role="alert" class="alert alert-info alert-soft items-start">
            <span class="loading loading-spinner loading-sm shrink-0"></span>
            <span class="text-sm">กำลังโหลดข้อมูลที่บันทึกไว้...</span>
          </div>

          <!-- ไม่มีสถานที่ให้เลือกเลย = กรอกชิ้นใหม่ไม่ได้ (locationId เป็น FK บังคับ)
               ปุ่มบันทึกจะจางโดยที่ผู้ใช้หาไม่เจอว่าขาดอะไร ถ้าไม่บอกตรงนี้ -->
          <div v-if="masterMissing" role="alert" class="alert alert-error alert-soft items-start">
            <Icon icon="mdi:alert-circle-outline" class="size-5 shrink-0" />
            <span class="text-sm">
              โหลดรายการสถานที่ไม่สำเร็จ - เลือกสถานที่ไม่ได้ ลองรีเฟรชหน้าอีกครั้ง
            </span>
          </div>

          <!-- รายการที่สั่งมาจาก PO - อ่านอย่างเดียว เป็นตัวยืนยันว่ากรอกถูกชิ้น -->


          <!-- ── รูป | ข้อมูลของตัวเครื่อง - กรอกโดยเห็นรูปที่เพิ่งถ่ายอยู่ข้าง ๆ
               S/N กับรายละเอียดถูกอ่านจากรูปนั้นเอง ถ้าอยู่คนละหน้าจอต้องเลื่อนสลับทุกตัวอักษร -->
          <div class="grid gap-4 md:grid-cols-8">
            <!-- ── รูปถ่าย -->
            <div class="flex flex-col rounded-box border border-base-300 bg-base-200/60 p-3 md:col-span-3">
              <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60">
                <Icon icon="lucide:camera" class="size-4" />
                รูปถ่าย<span v-if="!isEdit" class="ml-0.5 text-error">*</span>
              </div>

              <!-- ยังไม่มีรูป: โซนลากวาง -->
              <div v-if="!hasImage"
                class="mt-2 flex-1 rounded-box border-2 border-dashed border-base-content/20 bg-base-100 transition-colors hover:border-primary/50 hover:bg-primary/5"
                @dragover="handleDragOver" @drop="handleDrop">
                <label
                  class="flex h-full min-h-44 cursor-pointer flex-col items-center justify-center gap-2 p-4 text-center">
                  <Icon icon="lucide:image-plus" class="size-10 opacity-40" />
                  <p class="text-sm font-semibold">ลากรูปมาวางหรือคลิกเพื่อเลือก</p>
                  <p class="text-xs opacity-60">JPG, PNG หรือ WebP (สูงสุด 5 MB)</p>
                  <input ref="fileInput" type="file" class="hidden" accept="image/jpeg,image/png,image/webp"
                    :disabled="isUploadingImage || !editable" @change="handleImageSelect" />
                </label>
              </div>

              <!-- มีรูปแล้ว: กดที่รูปเพื่อดูเต็มจอ (object-cover ตรงนี้เฉือนขอบ จึงต้องมีทางดูแบบเต็ม) -->
              <!-- ไม่มี md:col-span-* ตรงนี้ - พ่อของมันคือกล่องรูป ไม่ใช่ grid 8 คอลัมน์
                   ข้างนอก (ของเดิมมี col-span-5 ค้างไว้จากผังเก่า ซึ่งไม่มีผลแต่ชวนเข้าใจผิด) -->
              <div v-else class="mt-2 flex flex-1 flex-col gap-2">
                <div class="relative min-h-44 flex-1 overflow-hidden rounded-box bg-base-300">
                  <button v-if="imagePreview" type="button"
                    class="group absolute inset-0 block h-full w-full cursor-zoom-in" title="กดเพื่อดูรูปเต็มจอ"
                    :class="{ 'border-2 border-error': !isEdit }"
                    @click="lightboxOpen = true">
                    <img :src="imagePreview" alt="รูปสินทรัพย์"
                      class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                    <span
                      class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Icon icon="lucide:maximize-2" class="size-3.5" />
                      กดเพื่อดูเต็มจอ
                    </span>
                  </button>
                  <div v-else class="absolute inset-0 grid place-items-center">
                    <span class="loading loading-spinner loading-lg"></span>
                  </div>
                  <!-- จอสัมผัสไม่มี hover ป้ายข้างล่างจึงไม่โผล่ ต้องมีสัญลักษณ์ค้างไว้ -->
                  <span v-if="imagePreview"
                    class="pointer-events-none absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-base-100/80 text-base-content shadow-sm backdrop-blur-sm">
                    <Icon icon="lucide:maximize-2" class="size-3.5" />
                  </span>
                </div>

                <!-- ปุ่มจัดการรูปเป็นแถวใต้รูป ไม่ใช่กากบาทลอยทับมุมรูป - ปุ่มลบที่ทับรูปอยู่
                     กดโดนง่ายตอนตั้งใจจะกดดูรูป และรูปที่ลบไปแล้วเอากลับไม่ได้ ต้องเดินไปถ่ายใหม่ -->
                <div v-if="editable" class="flex gap-2">
                  <label class="btn btn-sm flex-1" :class="{ 'btn-disabled': isUploadingImage }">
                    <Icon icon="lucide:refresh-cw" class="size-4" />
                    เปลี่ยนรูป
                    <input ref="fileInput" type="file" class="hidden" accept="image/jpeg,image/png,image/webp"
                      :disabled="isUploadingImage" @change="handleImageSelect" />
                  </label>
                  <button type="button" class="btn btn-sm btn-error btn-soft" :disabled="isUploadingImage"
                    @click="removeImage">
                    <Icon icon="lucide:trash-2" class="size-4" />
                    ลบรูป
                  </button>
                </div>
              </div>

              <div v-if="isUploadingImage" class="mt-2 flex items-center gap-2 text-sm">
                <span class="loading loading-spinner loading-sm"></span>
                <span>กำลังอัปโหลด...</span>
              </div>
              <div v-else-if="uploadError" role="alert" class="alert alert-error alert-soft mt-2 py-2">
                <Icon icon="lucide:alert-circle" class="size-4 shrink-0" />
                <span class="text-sm">{{ uploadError }}</span>
              </div>
            </div>

            <!-- ── ข้อมูลของตัวเครื่อง -->
            <div class="flex flex-col rounded-box border border-base-300 bg-base-200/60 p-3 md:col-span-5">
              <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60">
                <Icon icon="mdi:barcode" class="size-4" />
                ข้อมูลตัวเครื่อง
              </div>

              <!-- ── ผังช่องกรอก: 2 คอลัมน์ ────────────────────────────────────
                   รายละเอียด            (เต็มแถว - ข้อความยาวสุดในกล่องนี้)
                   Serial number | ราคาทุนต่อชิ้น
                   เริ่มประกัน    | สิ้นสุดประกัน   (คู่กันเสมอ ต้องอยู่ติดกัน)

                   ★ หนึ่งช่อง = หนึ่ง <fieldset> ที่มี <legend> เป็นลูกตัวแรก
                     <legend> ใช้นอก <fieldset> ไม่ได้ตามสเปก HTML - ของเดิมมี legend
                     ลอยอยู่ใน <div> เปล่า ๆ สามตัว ซึ่งเบราว์เซอร์จัดระยะให้คนละแบบกับ
                     ช่องที่อยู่ใน fieldset จริง ป้ายเลยไม่ตรงแนวกันทั้งกล่อง
                   ★ gap-y-1 ไม่ใช่ gap-4: .fieldset ของ daisyUI มี padding แนวตั้งในตัว
                     อยู่แล้ว ใส่ gap ใหญ่ซ้ำจะกลายเป็นช่องว่างสองเท่าระหว่างแถว -->
              <div class="mt-1 grid gap-x-4 gap-y-1 md:grid-cols-2">
                <fieldset class="fieldset md:col-span-2">
                  <legend class="fieldset-legend">รายละเอียด</legend>
                  <input v-model="form.description" type="text" class="input w-full" maxlength="100"
                    :placeholder="target.itemDescription || 'รายละเอียด'" :disabled="!editable" />
                </fieldset>

                <fieldset class="fieldset ">
                  <legend class="fieldset-legend">Serial number</legend>
                  <input v-model="form.serialNumber" type="text" class="input w-full font-mono" maxlength="100"
                    placeholder="เลขเครื่อง" :disabled="!editable" />
                </fieldset>

                <fieldset class="fieldset">
                  <legend class="fieldset-legend">ราคาทุนต่อชิ้น</legend>
                  <!-- type="text" ไม่ใช่ number: input[type=number] ตัดศูนย์ท้ายทิ้งเสมอ
                       พิมพ์ 1500.00 แล้วมันจะโชว์ 1500 - บังคับ .00 ไม่ได้เลยถ้ายังใช้ number
                       inputmode="decimal" ทำให้มือถือยังขึ้นแป้นตัวเลขให้เหมือนเดิม -->
                  <label class="input w-full">
                    <input v-model="costText" type="text" inputmode="decimal" class="w-full tabular-nums"
                      :disabled="!editable" @blur="onCostBlur" />
                    <span class="label">฿</span>
                  </label>
                </fieldset>

                <fieldset class="fieldset">
                  <legend class="fieldset-legend">เริ่มระยะประกัน</legend>
                  <AppDatePicker v-model="form.warrantyStartDate" placeholder="วันเริ่มประกัน"
                    :max="form.warrantyEndDate || undefined" :disabled="!editable" />
                </fieldset>

                <fieldset class="fieldset">
                  <legend class="fieldset-legend">สิ้นสุดระยะประกัน</legend>
                  <!-- min = วันเริ่ม → เลือกวันสิ้นสุดก่อนวันเริ่มไม่ได้ตั้งแต่ในปฏิทิน -->
                  <AppDatePicker v-model="form.warrantyEndDate" placeholder="วันสิ้นสุดประกัน"
                    :min="form.warrantyStartDate || undefined" :disabled="!editable" />
                </fieldset>
              </div>
            </div>
          </div>

          <!-- ── ที่อยู่ของชิ้นนี้ | ใครดูแล - สองแกนคนละเรื่อง แยกกล่องกันชัด ๆ
               (ของกลางอย่างห้องประชุมมีแผนกที่รับผิดชอบแต่ไม่มีผู้ถือครอง) -->
          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-box border border-base-300 bg-base-200/60 p-3 md:col-span-1">
              <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60">
                <Icon icon="mdi:account-outline" class="size-4" />
                ผู้รับผิดชอบ
              </div>

              <!-- หนึ่งช่อง = หนึ่ง fieldset - ★ <fieldset> มี <legend> ได้ตัวเดียวเท่านั้น
                   (ตัวแรกเป็น caption ของกล่อง) ตัวที่สองเป็นแค่ block ธรรมดาที่เบราว์เซอร์
                   จัดระยะคนละแบบ ป้ายจึงไม่ตรงแนวกับช่องอื่น -->
              <fieldset class="fieldset">
                <!-- บันทึกลง asset.departmentId ตั้งแต่ 0008 - คนละแกนกับผู้ถือครองข้างล่าง
                     ของกลาง (ห้องประชุม/โรงอาหาร) ไม่มีเจ้าของแต่ยังระบุแผนกที่รับผิดชอบได้ -->
                <legend class="fieldset-legend">Department</legend>
                <select v-model.number="form.departmentId" class="select w-full"
                  :disabled="!editable || !departments.length">
                  <option :value="0">- ไม่ระบุ -</option>
                  <option v-for="d in departments" :key="d.id" :value="d.id">
                    {{ d.departmentId }} - {{ d.name }}
                  </option>
                </select>
              </fieldset>

              <fieldset class="fieldset">
                <legend class="fieldset-legend">ผู้ถือครอง</legend>
                <AppEmployeeSelect v-model="form.employeeId" :disabled="!editable" />
                <p class="label flex items-start gap-1.5 whitespace-normal">
                  <Icon icon="mdi:information-outline" class="mt-0.5 size-4 shrink-0" />
                  <span>เว้นว่างได้ถ้าเป็นของกลางที่ไม่มีเจ้าของประจำ</span>
                </p>
              </fieldset>
            </div>


            <div class="rounded-box border border-base-300 bg-base-200/60 p-3 md:col-span-1">
              <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60">
                <Icon icon="mdi:map-marker-outline" class="size-4" />
                สถานที่
              </div>

              <fieldset class="fieldset">
                <legend class="fieldset-legend">
                  Location<span v-if="!isEdit" class="ml-0.5 text-error">*</span>
                </legend>
                <select v-model.number="form.locationId" class="select w-full"
                  :class="{ 'select-error': !isEdit && form.locationId <= 0 }"
                  :disabled="!editable || !locations.length">
                  <option :value="0" disabled>- เลือกสถานที่ -</option>
                  <option v-for="l in locations" :key="l.id" :value="l.id">{{ l.name }}</option>
                </select>
              </fieldset>

              <!-- สถานที่นอกผัง: ไม่มีบล็อกให้เลือกห้อง/ปักหมุดเลย ไม่ใช่แค่เลิกบังคับ
                   ผังที่มีเป็นของไซต์นี้ ห้องทุกห้องในนั้นเป็นห้องที่นี่ — ปล่อยให้เลือกได้
                   คือเชิญให้กรอกข้อมูลที่ผิดตั้งแต่ต้น (backend ก็ปฏิเสธอยู่แล้ว) -->
              <template v-if="outPlan">
                <!-- ★ มีของค้างอยู่ = เตือนพร้อมปุ่มล้าง ไม่ล้างให้เอง
                     เคสจริงคือเปิดของเก่าที่บันทึกไว้ก่อนมีธง outPlan ขึ้นมาแก้ช่องอื่น
                     ถ้าล้างเงียบ ๆ ห้องที่บัญชีกรอกไว้จะหายไปโดยไม่มีใครเห็น -->
                <div
                  v-if="outPlanConflict"
                  role="alert"
                  class="alert alert-warning alert-soft items-start"
                >
                  <Icon icon="mdi:alert-outline" class="mt-0.5 size-5 shrink-0" />
                  <div class="min-w-0 space-y-2">
                    <p class="text-sm">
                      สถานที่นี้อยู่นอกพื้นที่ผัง แต่ชิ้นนี้ยังผูกอยู่กับ
                      <span class="font-medium">{{ placeLabel || 'ห้องบนผัง' }}</span>
                      ต้องล้างก่อนจึงจะบันทึกได้
                    </p>
                    <button type="button" class="btn btn-sm" :disabled="!editable" @click="clearPlace">
                      <Icon icon="lucide:x" class="size-4" />
                      ล้างห้องและหมุด
                    </button>
                  </div>
                </div>

                <div
                  v-else
                  class="flex items-start gap-2 rounded-box border border-dashed border-base-300 px-3 py-3 text-sm text-base-content/70"
                >
                  <Icon icon="lucide:plane" class="mt-0.5 size-4 shrink-0" />
                  <span>สถานที่นี้อยู่นอกพื้นที่ผัง ไม่ต้องระบุห้องและไม่ต้องปักหมุด</span>
                </div>
              </template>

              <fieldset v-else class="fieldset">
                <legend class="fieldset-legend">
                  ตำแหน่งบนผัง<span v-if="!isEdit" class="ml-0.5 text-error">*</span>
                </legend>
                <div class="flex flex-wrap items-center gap-2">
                  <button type="button" class="btn btn-sm" :disabled="!editable" @click="pickerOpen = true">
                    <Icon icon="lucide:map-pin" class="size-4" />
                    {{ form.subLocationId ? 'เปลี่ยนตำแหน่ง' : 'เลือกจากผัง' }}
                  </button>
                  <!-- ล้างได้เฉพาะตอนที่มีอะไรให้ล้าง - ปุ่มที่กดแล้วไม่เกิดอะไรคือปุ่มที่ทำให้ลังเล -->
                  <button v-if="form.subLocationId" type="button" class="btn btn-ghost btn-sm" :disabled="!editable"
                    @click="clearPlace">
                    <Icon icon="lucide:x" class="size-4" />
                    ล้าง
                  </button>
                </div>
                <!-- ติ๊กเขียวเฉพาะตอนครบจริง - ของที่ยังไม่ปักหมุดขึ้นเขียวจะอ่านว่า "เรียบร้อยแล้ว"
                     ทั้งที่ปุ่มบันทึกถูกล็อกอยู่ด้วยเหตุนี้พอดี -->
                <p v-if="placeLabel" class="label flex items-start gap-1.5 whitespace-normal"
                  :class="missingPin ? 'text-warning' : ''">
                  <Icon :icon="missingPin ? 'mdi:alert-outline' : 'mdi:check-circle-outline'"
                    class="mt-0.5 size-4 shrink-0" :class="missingPin ? '' : 'text-success'" />
                  <span>{{ placeLabel }}</span>
                </p>
                <p v-else class="label flex items-start gap-1.5 whitespace-normal"
                  :class="isEdit ? '' : 'text-error'">
                  <Icon :icon="isEdit ? 'mdi:information-outline' : 'mdi:alert-circle-outline'"
                    class="mt-0.5 size-4 shrink-0" />
                  <span v-if="isEdit">ยังไม่ได้ระบุ ชั้น/ห้องมาจากผังโรงงาน</span>
                  <span v-else>ต้องเลือกห้องและปักหมุดก่อนบันทึก </span>
                </p>
              </fieldset>
            </div>
          </div>

          <div v-if="error" role="alert" class="alert alert-error alert-soft items-start">
            <Icon icon="lucide:circle-alert" class="size-5 shrink-0" />
            <span class="text-sm">{{ error }}</span>
          </div>
        </div>

        <!-- ── แถวปุ่ม (ตรึงล่าง) - บันทึกต้องกดได้ตลอดโดยไม่ต้องเลื่อนกลับลงมาสุด
             title บอกเหตุผลที่ยังกดไม่ได้ แบบเดียวกับปุ่มยืนยันของกล่องรายชิ้น -->
        <div class="flex items-center justify-end gap-2 border-t border-base-300 bg-base-100 px-5 py-3">
          <button type="button" class="btn btn-ghost" :disabled="saving" @click="close">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="!canSave" :title="saveHint" @click="onSave">
            <span v-if="saving" class="loading loading-spinner loading-xs"></span>
            <Icon v-else icon="mdi:content-save-outline" class="size-4" />
            {{ isEdit ? 'บันทึกการแก้ไข' : 'บันทึก' }}
          </button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>

    <!-- กล่องเลือกผัง teleport ไป body เหมือนกล่องนี้ และตั้ง z สูงกว่า จึงซ้อนบนได้จริง
         ★ ต้องอยู่นอก .modal-box - ตอนนี้กล่องเป็น overflow-hidden แล้ว ถ้ายังซ้อนอยู่ข้างใน
         จะถูกตัดตามขอบกล่อง -->
    <FloorPlanPickerModal v-model:open="pickerOpen" :sub-location-id="form.subLocationId || null" :pos-x="form.posX"
      :pos-y="form.posY" @confirm="onPlacePicked" />

    <!-- ── รูปเต็มจอ - object-contain ไม่เฉือนอะไรทิ้ง เพราะนี่คือโหมดที่ใช้ซูมอ่าน S/N บนตัวเครื่อง
         กดที่ไหนก็ปิดแล้วกลับมาที่ฟอร์มเดิม / z สูงกว่า .modal ของ daisyUI เพราะซ้อนบนกล่องที่ยังเปิด -->
    <div v-if="lightboxOpen && imagePreview"
      class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4" role="dialog"
      aria-label="รูปสินทรัพย์ขนาดเต็ม" @click="lightboxOpen = false">
      <img :src="imagePreview" alt="รูปสินทรัพย์ขนาดเต็ม" class="max-h-full max-w-full rounded object-contain" />
      <button type="button" class="btn btn-circle btn-sm absolute top-4 right-4" aria-label="ปิดรูป"
        @click.stop="lightboxOpen = false">
        <Icon icon="mdi:close" class="size-5" />
      </button>
    </div>
  </Teleport>
</template>
