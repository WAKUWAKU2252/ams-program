<script setup lang="ts">
// เนื้อรายละเอียดสินทรัพย์รายชิ้น - **ตัวเดียวที่วาดหน้าตานี้ทั้งระบบ**
//
// ── ทำไมแยกออกมาจาก AssetDetailModal ────────────────────────────────────────────────
//
// ของชิ้นเดียวกันถูกเปิดดูจากสองบริบทที่ต่างกันสิ้นเชิง:
//   · ในแอป       → AssetDetailModal.vue ครอบเป็น modal (ทะเบียน / My asset / Audit)
//   · จากสติกเกอร์ → AssetByNumber.vue เป็นหน้าเต็มใต้ BlankLayout ไม่ต้องล็อกอิน
//
// เดิมสองทางนั้นเป็นโค้ดคนละชุดที่วาดข้อมูลชุดเดียวกัน แล้วก็เริ่มเพี้ยนจากกันจริง ๆ
// (หน้า QR ไม่มีผังที่ตั้ง ป้ายสถานะคนละสูตร ลำดับข้อมูลคนละแบบ) - ของชิ้นเดียวกันต้อง
// หน้าตาเดียวกันไม่ว่าเปิดมาจากทางไหน ไม่งั้นคนอ่านสองหน้าได้คำตอบคนละอย่าง
//
// component นี้จึงไม่รู้จัก modal เลย: ไม่มีปุ่มปิด ไม่มี backdrop ไม่มี Escape
// ใครครอบก็จัดการเรื่องนั้นเอง
//
// ── ยิง API เอง ไม่ใช้ข้อมูลจากแถวที่ส่งมา ──────────────────────────────────
//
// แถวในตารางมียอดบัญชีแค่ปีกับมูลค่าคงเหลือ ส่วนราคาทุน ค่าเสื่อมสะสม อายุการใช้งาน
// วิธีคิดค่าเสื่อม อยู่ในผลของ /assets/by-number เท่านั้น - item ที่ส่งเข้ามาใช้วาดหัว
// ไปก่อนระหว่างรอ จอจะได้ไม่กระพริบเป็นว่าง (หน้า QR ไม่มีของพวกนี้ ส่งแค่เลขก็พอ)
import { computed, ref, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import QRCode from 'qrcode'
import AppAssetLocationMap from './AppAssetLocationMap.vue'
import FloorPlanPickerModal from './FloorPlanPickerModal.vue'
import AssetImageDialog from './AssetImageDialog.vue'
import { getAssetByNumber, updateAssetLocation } from '@/shared/services/asset.service'
import type { AssetByNumberDetail } from '@/shared/services/asset.service'
import { listFloorPlans, type FloorPlan } from '@/shared/services/master.service'
import { fileBlobUrl } from '@/shared/services/attachment.service'
import { ApiError } from '@/shared/services/httpClient'
import { formatDate, formatDateTime } from '@/shared/utils/date'
import { formatMoney, formatMonths, showRawMonths } from '@/shared/utils/money'

/**
 * รูปย่อที่สุดที่ component ต้องใช้เพื่อไปดึงรายละเอียดมาเอง
 *
 * ★ ตั้งใจให้เป็น interface กว้าง ๆ ไม่ผูกกับ InventoryItem - แถวจากคนละหน้าคนละชนิดกัน
 *   (InventoryItem ของทะเบียน / MyAssetItem ของ My asset) แต่ทุกตัวมีสองช่องนี้ครบ
 *   TypeScript เทียบโครงสร้าง ส่งเข้ามาได้เลยโดยไม่ต้อง map
 *   ส่วนหน้า QR ประกอบเองจาก route param สองตัวก็พอ
 *
 * ★ companyCode จำเป็นคู่กับ assetNumber เสมอ - เลขซ้ำกันข้ามบริษัทจริง 24 ตัว
 */
export interface AssetRef {
  companyCode: string
  /** null = ยังไม่ออกเลข (ยังไม่ลงทะเบียน) - เปิดรายละเอียดไม่ได้ */
  assetNumber: string | null
  description?: string | null
  status?: string
  imageId?: string | null
}

const props = withDefaults(
  defineProps<{
    item: AssetRef | null
    /**
     * URL ที่ฝังใน QR ของสติกเกอร์ชิ้นนี้ - ส่งมาเมื่อหน้านั้นมีค่านี้อยู่แล้ว (My asset)
     *
     * ★ วาดจากค่านี้เท่านั้น ห้ามประกอบเองจาก assetNumber - ค่าที่เก็บคือค่าที่ตรงกับ
     *   สติกเกอร์ที่พิมพ์แปะไปแล้ว ถ้าจอประกอบเอง วันที่โดเมนเปลี่ยน จอจะโชว์ QR ที่พาไป
     *   คนละที่กับของจริงบนเครื่อง โดยไม่มีอะไรฟ้อง
     *
     * ★ หน้าที่เปิดจากการสแกน QR ไม่ต้องส่ง - คนที่มาถึงหน้านั้นสแกนไปแล้ว
     */
    qrCode?: string | null
    /**
     * "ตอนนี้มองเห็นอยู่ไหม" - false = ไม่ต้องโหลดอะไรเลย
     *
     * ★ จำเป็นเพราะ AssetDetailModal ถูก mount ค้างไว้ในทุกหน้าที่ใช้มัน (v-model คุมแค่การแสดงผล)
     *   ถ้าโหลดตั้งแต่ mount ทุกคนจะจ่ายค่า API ทั้งที่ยังไม่เคยกดดูสักชิ้น
     *   หน้าเต็มอย่าง AssetByNumber ไม่ต้องส่ง - ค่าตั้งต้นคือ true
     */
    active?: boolean
    /**
     * ที่ทางของผังบอกที่ตั้ง - ต่างกันแค่ตรงนี้จุดเดียวระหว่างสองบริบท
     *
     *   'modal' (ค่าตั้งต้น) ผังอยู่ในคอลัมน์ขวาของหัว ข้างรูป - AssetDetailModal ใช้
     *   'page'              ผังลงไปเป็น section เต็มความกว้างข้างล่าง และหัวเรียงบนล่าง
     *                       เมื่อจอแคบ - AssetByNumber (ปลายทาง QR) ใช้ เพราะเปิดบน
     *                       มือถือเป็นหลัก ผังกว้าง 10rem ข้างรูปนั้นอ่านไม่ออก
     */
    layout?: 'modal' | 'page'
    /**
     * โชว์ปุ่มแก้ที่ตั้งบนผังหรือไม่ - ต้องเปิดเองรายหน้า
     *
     * ★ ค่าตั้งต้นต้องเป็น false ห้ามเป็น true
     *
     * component นี้ถูกใช้บนหน้าที่คนสแกน QR เปิดโดย **ไม่ต้องล็อกอิน** ด้วย (AssetByNumberPage
     * ใต้ BlankLayout) ถ้าตั้งต้นเป็นเปิด ช่างที่มาซ่อม/ผู้รับเหมาที่สแกนสติกเกอร์จะย้ายที่ตั้ง
     * ของชิ้นนั้นได้ทันที - และ PATCH /assets/:id/location อยู่หลัง authGuard อยู่แล้ว
     * เขาจึงได้แค่ปุ่มที่กดแล้ว 401 เด้งไป /login ซึ่งเป็นอาการที่หน้านั้นตั้งใจกันไว้แต่แรก
     *
     * ★ หน้า Audit ตั้งใจไม่เปิด - คนตรวจนับต้องบันทึกว่า "เจอของตรงไหน" ผ่านทางเดินของ
     *   การตรวจนับ ไม่ใช่แก้ทะเบียนกลางคันจากในกล่องรายละเอียด
     */
    editableLocation?: boolean
    /**
     * เปิดให้แนบ/เปลี่ยนรูปสินทรัพย์จากกล่องนี้หรือไม่
     *
     * ★ ค่าตั้งต้นต้องเป็น false ด้วยเหตุผลเดียวกับ editableLocation - หน้า QR
     *   (AssetByNumberPage) เปิดได้โดยไม่ต้องล็อกอิน คนที่สแกนสติกเกอร์ต้องไม่มีทาง
     *   เปลี่ยนรูปของชิ้นนั้น
     *
     * ★ แยกตัวกับ editableLocation ไม่รวมเป็น prop เดียว - สองอย่างนี้เป็นคนละการตัดสินใจ
     *   (หน้า Audit ปิดที่ตั้งไว้เพราะคนตรวจนับต้องบันทึกว่าเจอของตรงไหนผ่านทางเดินของ
     *   การตรวจนับ ซึ่งเป็นเหตุผลที่ไม่เกี่ยวกับรูปเลย) รวมเมื่อไหร่คือมัดสองเรื่องที่
     *   เปลี่ยนคนละจังหวะไว้ด้วยกัน
     */
    editableImage?: boolean
  }>(),
  { qrCode: null, active: true, layout: 'modal', editableLocation: false, editableImage: false },
)

const emit = defineEmits<{
  /** ที่ตั้งถูกบันทึกแล้ว - หน้าที่วาดหมุด/คอลัมน์ห้องอยู่ต้องโหลดของตัวเองใหม่ */
  updated: []
}>()

const detail = ref<AssetByNumberDetail | null>(null)
const loading = ref(false)
const loadError = ref('')
const imageUrl = ref('')

/**
 * รูปเต็มจอ - แพทเทิร์นเดียวกับ AssetFormDialog / AssetRequestForm
 *
 * กล่องรูปด้านบนเป็น object-cover ซึ่งเฉือนขอบทิ้งเสมอ (ตั้งใจ - ต้องเต็มกรอบ ไม่มีพื้นโล่ง)
 * คนที่ยืนอยู่หน้าเครื่องจึงต้องมีทางเห็นรูปแบบไม่ถูกเฉือนไว้เทียบ S/N บนตัวเครื่องจริง
 * ตรงนั้นเป็น object-contain ในโหมดเต็มจอ ไม่ใช่การเปลี่ยนกล่องด้านบนให้เป็น contain
 */
const lightboxOpen = ref(false)

/** 404 ต้องแยกจาก error อื่น: "สแกนติดแต่ไม่มีในระบบ" กับ "ระบบมีปัญหา" แก้คนละทาง */
const notFound = ref(false)

const currentYear = new Date().getFullYear()

/** ตัวเลขบัญชีที่ค้างปีเก่า ต้องติดป้ายเตือน ไม่งั้นคนอ่านเลขปี 2022 เป็นมูลค่าวันนี้ */
const isStale = computed(
  () => !!detail.value?.accounting && detail.value.accounting.fiscalYear !== currentYear,
)

/**
 * บริษัทเจ้าของชิ้น - ต้องขึ้นบนหน้าจอทั้งสองบริบท
 *
 * ★ เลขสินทรัพย์ซ้ำกันข้ามบริษัทจริง 24 ตัว หน้าที่โชว์แต่เลขจึงตอบไม่ได้ว่ากำลังดูชิ้นไหน
 *   ในสองชิ้นที่เลขตรงกัน - หนักสุดคือปลายทาง QR ที่คนสแกนมาถึงโดยไม่ได้เลือกบริษัทเอง
 *
 * ★ ตกไปใช้ค่าจาก item ระหว่างรอ API - ให้ป้ายขึ้นตั้งแต่เฟรมแรกเหมือน assetNumber
 *   ไม่ใช่โผล่ทีหลังจนหัวข้อขยับ (ค่าทั้งสองตรงกันเสมอ คิวรีฝั่ง backend กรองด้วยมัน)
 *
 * ★ โชว์เป็นรหัส ไม่ใช่ชื่อเต็มจาก /master/companies - เส้นนั้นอยู่หลัง authGuard
 *   แต่ component นี้ถูกใช้บนหน้า QR ที่เปิดโดยไม่ล็อกอิน ยิงไปจะได้ 401 แล้ว httpClient
 *   เด้งไป /login ทันที (อาการ "สแกน QR แล้วติด authen" ที่ไฟล์นี้เตือนไว้ข้างบน)
 *   - และวันนี้ชื่อบริษัทกับรหัสเป็นค่าเดียวกันอยู่แล้ว (UBA/UBP/MIG)
 */
const companyLabel = computed(() => detail.value?.companyCode ?? props.item?.companyCode ?? '')

function revokeImage() {
  // ปิดรูปเต็มจอไปด้วย - ค้างไว้แล้ว src ที่มันชี้อยู่จะกลายเป็น blob ที่ถูก revoke ไปแล้ว
  // (เกิดจริงตอนคนสแกนชิ้นถัดไปทั้งที่ยังเปิดรูปเต็มจอของชิ้นเดิมค้างอยู่)
  lightboxOpen.value = false
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
}

async function load() {
  const item = props.item
  if (!item) return

  loading.value = true
  loadError.value = ''
  notFound.value = false
  detail.value = null
  revokeImage()

  // ยังไม่ออกเลข = ไม่มีกุญแจให้ไปถามรายละเอียด ต้องบอกตรง ๆ ไม่ใช่ปล่อยหมุนค้าง
  // (เกิดได้กับของที่ยังเป็น DRAFT - หน้าที่ลิสต์เฉพาะ REGISTERED จะไม่เจอเคสนี้)
  if (!item.assetNumber) {
    loading.value = false
    loadError.value = 'ชิ้นนี้ยังไม่มีเลขสินทรัพย์ จึงยังเปิดรายละเอียดไม่ได้'
    return
  }

  try {
    detail.value = await getAssetByNumber(item.companyCode, item.assetNumber)
  } catch (e) {
    notFound.value = e instanceof ApiError && e.status === 404
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายละเอียดไม่สำเร็จ'
  } finally {
    loading.value = false
  }

  // รูปโหลดแยกและพังได้โดยไม่ลากทั้งหน้าตาย - ไฟล์ถูกลบจาก disk แต่ imageId ยังอยู่
  // เป็นเคสที่เกิดจริง (กติกาเดียวกับ thumbnail ใน AssetTable)
  const imageId = detail.value?.imageId ?? item.imageId
  if (imageId) {
    try {
      imageUrl.value = await fileBlobUrl(imageId)
    } catch {
      // ปล่อยว่าง ให้ template ขึ้นไอคอนแทน
    }
  }
}

// ── ผังบอกที่ตั้ง: โหลดผังทั้งไซต์ครั้งเดียวแล้วคาไว้ ───────────────────────
//
// ตัววาดอยู่ที่ AppAssetLocationMap ที่นี่มีแค่การโหลดข้อมูลผัง เพราะต้องใช้ร่วมกัน
// ทั้งสองโหมด (modal วางผังในหัว / page วางล่าง) และโหลดซ้ำสองรอบไม่มีประโยชน์
//
// ★ **ต้องประกาศเหนือ watch ที่เรียก ensurePlans()** - watch ตัวนั้นเป็น immediate
//   จึงทำงานตั้งแต่ตอน setup ถ้า `let plansLoaded` อยู่ใต้มัน ตัวแปรยังอยู่ใน temporal
//   dead zone แล้วจะได้ ReferenceError: Cannot access 'plansLoaded' before
//   initialization ทันทีที่ component ถูกสร้าง (ตัว function ถูก hoist ขึ้นมาก็จริง
//   แต่ let/const ที่มันปิดทับไม่ถูก hoist ตามไปด้วย - และ tsc/build จับไม่ได้
//   เพราะเป็น error ตอนรัน ไม่ใช่ตอนคอมไพล์)
//
// ★ /master/floor-plans ต้องเปิดสาธารณะ (ไม่มี authGuard) เพราะ component นี้ถูกใช้บน
//   หน้าที่คนสแกน QR เปิดโดยไม่ล็อกอิน - ถ้าเส้นนั้นกลับไปอยู่หลัง guard เมื่อไหร่
//   หน้า QR จะได้ 401 แล้ว httpClient จะเด้งไป /login ทันที (อาการเดิมที่เพิ่งแก้ไป)
const plans = ref<FloorPlan[]>([])
let plansLoaded = false

async function ensurePlans() {
  if (plansLoaded) return
  plansLoaded = true
  try {
    plans.value = await listFloorPlans()
  } catch {
    // ผังโหลดไม่ได้ไม่ควรลากทั้งหน้าตาย - ที่ตั้งยังอ่านเป็นข้อความได้จากส่วนข้อมูล
    // ข้างล่าง ปล่อยให้ AppAssetLocationMap ขึ้นกล่องบอกแทน
    plansLoaded = false
  }
}

// ── แก้ที่ตั้งจากในกล่องรายละเอียด (editableLocation) ────────────────────────
//
// ★ นี่คือทางเดียวที่ของ "ลงทะเบียนแล้ว" จะมีที่ตั้งได้ - กล่องกรอกในใบคำขอแตะได้เฉพาะ
//   ของที่ยังเป็น DRAFT ส่วน PATCH /assets/:id ปฏิเสธ REGISTERED ทั้งก้อน
//   (วัด 2026-09-07: REGISTERED 3,518 ชิ้น มี 3,491 ชิ้นที่ยังไม่ระบุห้องเลย)
const pickerOpen = ref(false)
const savingLocation = ref(false)
const locationError = ref('')

/**
 * โชว์ปุ่ม/ต่อกล่องเลือกสถานที่หรือไม่ - สามเงื่อนไข ไม่ใช่แค่ prop
 *
 *   editableLocation  หน้านั้นเปิดให้แก้ไหม (Audit กับหน้า QR ไม่เปิด)
 *   detail            ต้องมีก่อน - ปุ่มใช้ detail.id ยิง PATCH และใช้ค่าเดิมไปปักหมุดตั้งต้น
 *   !locationOutPlan  ★ ของที่สถานที่ทางบัญชีอยู่นอกผังไซต์นี้ (ต่างประเทศ/สาขาอื่น)
 *
 * ★ เงื่อนไขที่สามกันปุ่มที่กดแล้วพังแน่นอน: backend มี assertPlacementUsable ที่ปฏิเสธ
 *   การผูกห้อง/หมุดเข้ากับสถานที่นอกผังเสมอ ปล่อยให้กดได้ = ผู้ใช้เลือกห้อง ปักหมุด กดยืนยัน
 *   แล้วค่อยเจอ error ตอนท้าย ทั้งที่ตอบได้ตั้งแต่ก่อนเปิดกล่อง
 *   (ผังข้างล่างขึ้นข้อความ "ชิ้นนี้อยู่นอกพื้นที่ผัง" อยู่แล้ว การไม่มีปุ่มจึงอ่านแล้วเข้าใจ)
 */
const canEditLocation = computed(
  () => props.editableLocation && !!detail.value && !detail.value.locationOutPlan,
)

// ── แนบ/เปลี่ยนรูป (editableImage) ──────────────────────────────────────────
//
// สองทางเข้า ปลายทางเดียวกัน:
//   ไม่มีรูป → กดที่กล่องรูปเปล่า
//   มีรูปแล้ว → เปิดรูปเต็มจอ แล้วกดปุ่มดินสอข้างปุ่มกากบาท
//
// ★ ต้องมี detail ก่อน - กล่องต้องใช้ detail.id ยิง PATCH
const imageDialogOpen = ref(false)
const canEditImage = computed(() => props.editableImage && !!detail.value)

/**
 * เปิดกล่องแก้รูปจากในรูปเต็มจอ - ต้องปิดรูปเต็มจอก่อน
 *
 * ทั้งสองตัว teleport ไป body และรูปเต็มจอกิน Escape ไว้ (ชั้น capture) ถ้าเปิดซ้อนกัน
 * กด Escape จะไปโดนตัวล่างแทนกล่องที่อยู่บนสุด แล้วผู้ใช้จะปิดกล่องแก้รูปไม่ได้
 */
function openImageDialogFromLightbox() {
  lightboxOpen.value = false
  imageDialogOpen.value = true
}

/** บันทึกรูปแล้ว - โหลดใหม่ทั้งก้อนเพื่อให้ imageId กับ blob ของรูปตรงกับของจริง */
async function onImageSaved() {
  await load()
  emit('updated')
}

/**
 * ยืนยันจากกล่องเลือกสถานที่ - กล่องนั้นการันตีแล้วว่ามีทั้งห้องและหมุด
 *
 * ★ โหลดใหม่ทั้งก้อนหลังบันทึก ไม่ patch ค่าใน detail เอง
 *
 * ห้องใหม่อาจอยู่คนละชั้นกับเดิม ซึ่งเปลี่ยน planKey ด้วย - ถ้าเขียนทับแค่สามช่องที่ส่งไป
 * ผังจะยังวาดด้วยใบเดิมแล้วหมุดไปโผล่ผิดชั้นโดยไม่มีอะไรฟ้อง (พิกัดเป็นสัดส่วนของภาพ
 * มันจึงวาดได้เสมอไม่ว่าจะเป็นผังใบไหน) ยิงซ้ำหนึ่งครั้งแลกกับความถูกต้องคุ้มกว่ามาก
 */
async function onPickLocation(value: { subLocationId: number; posX: number; posY: number }) {
  const id = detail.value?.id
  if (!id || savingLocation.value) return

  savingLocation.value = true
  locationError.value = ''
  try {
    await updateAssetLocation(id, {
      subLocationId: value.subLocationId,
      posX: value.posX,
      posY: value.posY,
    })
    await load()
    // หน้าที่วาดหมุดของทั้งห้องอยู่ (แผนผัง) ต้องรู้ด้วย ไม่งั้นผังข้างหลัง modal ยังโชว์
    // ชิ้นนี้ค้างอยู่ห้องเดิม - ตัว modal เองอัปเดตแล้วจากการ load() ข้างบน
    emit('updated')
  } catch (e) {
    locationError.value =
      e instanceof ApiError ? e.message : 'บันทึกที่ตั้งไม่สำเร็จ ลองใหม่อีกครั้ง'
  } finally {
    savingLocation.value = false
  }
}

// โหลดเมื่อ "เริ่มมองเห็น" หรือ "ของที่ชี้อยู่เปลี่ยน" - อย่างหลังคือเคสของหน้า QR
// ที่คนสแกนชิ้นถัดไปทั้งที่ยังเปิดหน้าเดิมค้างอยู่ (เปลี่ยนแค่ route param component
// ไม่ถูกสร้างใหม่ ถ้าไม่ watch จอจะค้างข้อมูลชิ้นเดิมทั้งที่ URL เปลี่ยนแล้ว)
watch(
  () => [props.active, props.item?.companyCode, props.item?.assetNumber] as const,
  ([active]) => {
    if (!active) {
      revokeImage()
      return
    }
    void ensurePlans()
    void load()
  },
  { immediate: true },
)

onUnmounted(revokeImage)

// ── ESC ปิดรูปเต็มจอก่อน ไม่ใช่ปิด modal ที่อยู่ข้างล่าง ──────────────────────
//
// ★ ต้องเป็นชั้น capture - AssetDetailModal (เปลือก modal) ก็ผูก keydown ไว้ที่ document เหมือนกัน
//   และผูกไว้ "ก่อน" เสมอ (ตั้งแต่ตอนเปิด modal ส่วนของเราเพิ่งผูกตอนกดดูรูป) listener
//   ชั้น bubble ยิงตามลำดับที่ผูก ของมันจึงยิงก่อน แล้ว stopPropagation ของเราไม่ทัน
//   = กด ESC ทีเดียวปิดพรวดทั้งรูปเต็มจอและ modal - ชั้น capture ยิงก่อน bubble ทั้งหมด
//   จึงเป็นที่เดียวที่กันได้จริง (หน้า QR ไม่มี modal ครอบ แต่ต้องใช้โค้ดชุดเดียวกัน)
function onLightboxKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  lightboxOpen.value = false
}

// ผูกเฉพาะตอนเปิดจริง - component นี้ mount ค้างอยู่ในหลายหน้า (ดูคอมเมนต์ที่ AssetDetailModal)
// ผูกค้างไว้ = กิน ESC ของคนอื่นทั้งแอปโดยที่ตัวเองไม่ได้เปิดอะไรอยู่
watch(lightboxOpen, (open) => {
  if (open) document.addEventListener('keydown', onLightboxKeydown, true)
  else document.removeEventListener('keydown', onLightboxKeydown, true)
})

onUnmounted(() => document.removeEventListener('keydown', onLightboxKeydown, true))

// ── QR ของชิ้นที่เปิดดูอยู่ ──────────────────────────────────────────────────
//
// errorCorrectionLevel 'M' (กู้ได้ ~15%) - ต้องเป็นค่าเดียวกันทั้งระบบ (AssetRequestForm
// ใช้ค่านี้) ไม่งั้น QR ของชิ้นเดียวกันที่วาดจากคนละหน้าจะหน้าตาไม่เหมือนกัน
const qrDataUrl = ref('')

watch(
  () => (props.active ? props.qrCode : null),
  async (value) => {
    if (!value) {
      qrDataUrl.value = ''
      return
    }
    try {
      qrDataUrl.value = await QRCode.toDataURL(value, {
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M',
      })
    } catch {
      // วาดไม่ได้ก็ไม่โชว์รูป แต่ข้อความ URL ยังอยู่ให้ก๊อปไปใช้ต่อได้
      qrDataUrl.value = ''
    }
  },
  { immediate: true },
)

// ป้ายสถานะ - ชุดเดียวกับ AssetTable คีย์ต้องตรง enum asset_status ของ DB
const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-success',
  Inactive: 'badge',
}
const statusBadge = (s: string) => STATUS_BADGE[s] ?? 'badge-ghost'
const statusLabel = (s: string) => s

/**
 * ระยะประกันเป็นข้อความบรรทัดเดียว - สองคอลัมน์นี้ nullable อิสระจากกัน จึงมี 4 กรณีจริง
 * ปล่อยให้ template เขียน v-if ซ้อนกันเองแล้วจะได้ "- – 31/12/2570" ในกรณีที่มีแต่วันจบ
 * (สูตรเดียวกับ warrantyText() ใน AssetRequestForm.vue)
 */
const warrantyText = computed(() => {
  const start = detail.value?.warrantyStartDate ?? null
  const end = detail.value?.warrantyEndDate ?? null
  if (!start && !end) return '-'
  if (start && end) return formatDate(start) + ' – ' + formatDate(end)
  return start ? 'เริ่ม ' + formatDate(start) : 'ถึง ' + formatDate(end!)
})

/**
 * ประกันหมดแล้วหรือยัง - ตอบได้เฉพาะเมื่อมีวันสิ้นสุด
 *
 * null = บอกไม่ได้ (ไม่ได้กรอกวันจบไว้) ซึ่งคนละเรื่องกับ "ยังไม่หมด" จึงไม่ยุบเป็น boolean
 * เทียบที่ต้นวันของวันนี้ - ประกันที่หมด "วันนี้" ยังเคลมได้ทั้งวัน ไม่ควรขึ้นแดงตั้งแต่เช้า
 */
const warrantyExpired = computed<boolean | null>(() => {
  const end = detail.value?.warrantyEndDate
  if (!end) return null
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return endDate < today
})

/**
 * ตัวอักษรแรกของชื่อผู้ครอบครอง - ใช้เป็นวงกลมแทนรูป (ระบบไม่มีรูปพนักงาน)
 *
 * ★ ตัดด้วย Array.from ไม่ใช่ name[0] - [0] คืน UTF-16 code unit ตัวเดียว ตัวอักษร
 *   ที่เป็น surrogate pair (อีโมจิ/อักษรนอก BMP ที่หลุดมาในชื่อได้) จะแตกครึ่ง
 *   กลายเป็น � ส่วนภาษาไทยใช้ได้ปกติ เพราะชื่อขึ้นต้นด้วยพยัญชนะ ไม่ใช่สระ/วรรณยุกต์
 *   ที่ต้องเกาะตัวอื่น
 */
const holderInitial = computed(() => {
  const name = detail.value?.holderName?.trim()
  return name ? (Array.from(name)[0] ?? '').toUpperCase() : ''
})

/** หัววาดจากแถวก่อน แล้วค่อยทับด้วยผลจาก API เมื่อมาถึง */
const head = computed(() => ({
  assetNumber: detail.value?.assetNumber ?? props.item?.assetNumber ?? '',
  description: detail.value?.description ?? props.item?.description ?? null,
  status: detail.value?.status ?? props.item?.status ?? '',
}))

// ให้คนครอบสั่งโหลดใหม่ได้ - ปุ่ม "ลองใหม่" ของหน้า QR อยู่นอก component นี้
defineExpose({ reload: load })
</script>

<template>
  <div>
    <!-- ── หัว: รูป + เลข + สถานะ ───────────────────────────────────────
         modal = รูปชิดซ้าย ผังอยู่ในคอลัมน์ขวาใต้ป้าย (เหมือนเดิม จอกว้างพอ)
         page  = รูปวางบนเต็มความกว้างเมื่อจอแคบ ผังย้ายลงไปเป็น section ข้างล่าง
                 (หน้านี้เปิดจากการสแกนสติกเกอร์ = จอมือถือเสมอ บังคับรูป 16rem นั่งข้าง
                  ข้อความบนจอ 375px จะเหลือที่ให้ข้อความไม่ถึง 10rem แล้วบีบจนอ่านไม่ออก) -->
    <div
      class="flex gap-4 text-left"
      :class="layout === 'page' ? 'flex-col sm:flex-row sm:items-start' : 'items-start'"
    >
      <!-- ★ grid-rows-1 ไม่ใช่ของประดับ - ไม่มีมันรูปที่ "สูงกว่ากล่อง" จะล้นออกไปแล้วโดน
           overflow-hidden เฉือน เหลือให้เห็นแค่ส่วนบนของรูป (อาการ "รูปมาไม่ครบครึ่งเดียว"
           บนมือถือ)

           สาเหตุ: กล่องนี้เป็น grid ที่ไม่ได้ประกาศ row ไว้ row จึงเป็น auto = ใหญ่ตามลูก
           ส่วนลูกเป็น img ที่ขอ height:100% ของ row นั้นอีกที เจอกันเข้าแบบนี้ browser
           ตัดวงจรด้วยการให้ height:100% กลายเป็น auto แล้วคำนวณจากอัตราส่วนรูปแทน
           - รูป 217x389 ในกล่องกว้าง 343px จึงกลายเป็นสูง 615px ทั้งที่กล่องสูง 192px
           (align-content:stretch ช่วยได้เฉพาะตอน row "เล็กกว่า" กล่อง รูปแนวนอนอย่าง
            938x232 จึงพอดีกล่องปกติ - นี่คือเหตุผลที่มันเป็น "บางรูป" ไม่ใช่ทุกรูป)

           grid-rows-1 = grid-template-rows: minmax(0,1fr) ทำให้ row มีขนาดแน่นอนเท่ากล่อง
           ก่อน (กล่องสูงตายตัวทั้งสองโหมด) height:100% ของ img จึงมีตัวตั้งให้อ้างอิงจริง
           แล้ว object-cover ถึงจะทำงานตามที่ตั้งใจ - ไอคอนตอนไม่มีรูปยังกลางกล่องเหมือนเดิม

           ⚠️ กล่องรูปย่อที่ AssetTable.vue / FloorPlanAssetList.vue เขียนแพตเทิร์นเดียวกัน
              (grid + place-items-center + img size-full) จึงเป็นอาการเดียวกัน วัดแล้วได้
              44px -> 79px และ 48px -> 86px ถ้าจะแก้ต้องเติม grid-rows-1 แบบเดียวกัน -->
      <!-- ★ ไม่มีรูป + จอแคบ = กล่องเตี้ยลง (h-48 -> h-24)
           หน้า QR เปิดบนมือถือเป็นหลัก กล่องเปล่าสูง 192px กินจอแรกไปเกือบ 1/4 เพื่อโชว์
           ไอคอน "ไม่มีรูป" อันเดียว ทั้งที่สิ่งที่คนสแกนมาต้องการเห็นก่อนคือเลขสินทรัพย์
           กับที่ตั้ง - ยังเหลือความสูงพอให้กดแนบรูปได้ (เป้ากดใหญ่กว่า 44px ตามเกณฑ์)
           ★ ไม่ซ่อนทั้งกล่อง: ปุ่มแนบรูปอยู่ในนี้ ซ่อนแล้วคนที่อยากเติมรูปจะไม่มีทางเข้า
           ★ sm: ขึ้นไปและโหมด modal ใช้ขนาดเดิมทุกอย่าง - desktop ไม่กระทบ -->
      <div
        class="grid grid-rows-1 shrink-0 place-items-center overflow-hidden rounded-lg bg-base-200"
        :class="
          layout === 'page'
            ? imageUrl
              ? 'h-48 w-full sm:size-56'
              : 'h-24 w-full sm:size-56'
            : 'size-64'
        "
      >
        <!-- กดที่รูปเพื่อดูเต็มจอ - ปุ่มเป็นลูกของ grid แทนรูป จึงยังได้ความสูงจาก
             grid-rows-1 เหมือนเดิม แล้วรูปข้างในเกาะความสูงของปุ่มต่ออีกชั้น -->
        <button v-if="imageUrl" type="button" class="group relative size-full cursor-zoom-in"
          title="กดเพื่อดูรูปเต็มจอ" @click="lightboxOpen = true">
          <img :src="imageUrl" :alt="head.description ?? head.assetNumber"
            class="size-full object-cover transition-transform duration-200 group-hover:scale-105" />
          <span
            class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Icon icon="lucide:maximize-2" class="size-3.5" />
            กดเพื่อดูเต็มจอ
          </span>
          <!-- จอสัมผัสไม่มี hover ป้ายข้างบนจึงไม่มีวันโผล่ - หน้านี้เปิดบนมือถือเป็นหลัก
               ต้องมีสัญลักษณ์ค้างไว้ ไม่งั้นไม่มีอะไรบอกว่ารูปกดได้ -->
          <span
            class="pointer-events-none absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-base-100/80 text-base-content shadow-sm backdrop-blur-sm">
            <Icon icon="lucide:maximize-2" class="size-3.5" />
          </span>
        </button>
        <!-- ── ยังไม่มีรูป ────────────────────────────────────────────────────
             เปิดให้แก้ = กล่องเปล่ากลายเป็นปุ่มทั้งกล่อง (เป้าใหญ่ กดง่ายบนมือถือ)
             ไม่เปิด = ไอคอนเฉย ๆ เหมือนเดิม ไม่ใช่ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น -->
        <button
          v-else-if="canEditImage"
          type="button"
          class="group grid size-full grid-rows-1 place-items-center gap-1 transition-colors hover:bg-base-300"
          title="กดเพื่อแนบรูปสินทรัพย์"
          @click="imageDialogOpen = true"
        >
          <span class="flex flex-col items-center gap-1.5 text-base-content/40 group-hover:text-base-content/70">
            <Icon icon="lucide:image-plus" class="size-8" />
            <span class="text-xs">แนบรูป</span>
          </span>
        </button>

        <Icon v-else icon="mdi:image-off-outline" class="size-7 opacity-30" />
      </div>

      <!-- โหมด modal ล็อกความสูงเท่ารูป (h-64) แล้วให้ผังข้างในกินที่ที่เหลือด้วย flex-1
           ขอบล่างคอลัมน์นี้จึงจบพอดีเส้นเดียวกับขอบล่างรูปเสมอ ไม่ว่าหัวข้อจะขึ้นกี่บรรทัด
           - โหมด page ไม่ต้องล็อก เพราะผังไม่ได้อยู่ในนี้แล้ว ปล่อยสูงตามเนื้อหาตรงกว่า -->
      <div class="flex w-full min-w-0 flex-col" :class="layout === 'page' ? 'gap-1.5' : 'h-64'">
        <h3 class="font-mono text-lg font-semibold break-all">{{ head.assetNumber }}</h3>
        <p class="text-sm text-base-content/70">{{ head.description ?? '-' }}</p>

        <!-- flex-wrap + w-full: ป้ายกางเต็มความกว้างฝั่งขวาแล้วขึ้นบรรทัดใหม่เอง
             ไม่ใช่ไหลออกนอกกรอบเป็นแถวเดียวยาว ๆ อย่างเดิม (ชื่อคน/ชื่อแผนกยาวได้มาก) -->
        <div class="mt-1.5 flex w-full flex-wrap items-center gap-1.5">
          <span v-if="head.status" class="badge badge-sm " :class="statusBadge(head.status)">
            {{ statusLabel(head.status) }}
          </span>
          <span v-if="companyLabel" class="badge badge-sm badge-neutral">
            {{ companyLabel }}
          </span>
          <span v-if="detail?.categoryName" class="badge badge-sm badge">
            {{ detail.categoryName }}
          </span>

        </div>

        <!-- ── ผู้ครอบครอง (เฉพาะโหมด page) ─────────────────────────────────
             แยกออกจากแถว badge เป็นกล่องของตัวเอง เพราะมันคนละชนิดข้อมูลกับที่เหลือ:
             สถานะ/หมวด/แผนกเป็น "ป้ายจัดกลุ่ม" ที่อ่านผ่าน ๆ ได้ ส่วนอันนี้คือ "คน" ที่
             คนหน้างานต้องอ่านให้ชัดแล้วเดินไปหาจริง ๆ - ปนอยู่ในแถวเดียวกันแล้วชื่อคน
             จะกลายเป็นป้ายที่สี่ที่ตากวาดข้าม
             ★ ขึ้นแม้ตอนไม่มีข้อมูล - "ไม่มีใครถือ" เป็นคำตอบที่คนตรวจนับต้องรู้
               ไม่ใช่ช่องที่หายไปเฉย ๆ (ต่างจาก badge ใน modal ที่ซ่อนไปเมื่อไม่มีค่า) -->
        <div
          v-if="layout === 'page'"
          class="mt-2 flex w-full items-center gap-2.5 rounded-box border border-base-300 bg-base-200/50 px-3 py-2"
        >
          <div
            class="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
            :class="
              detail?.holderName
                ? 'bg-primary/10 text-primary'
                : 'bg-base-300 text-base-content/40'
            "
          >
            <!-- ตัวอักษรแรกของชื่อ - ชื่อไทยขึ้นต้นด้วยพยัญชนะเสมอ ตัดด้วย code point
                 ไม่ใช่ [0] เพื่อไม่ให้ตัวที่เป็น surrogate pair แตกครึ่ง -->
            <Icon  icon="lucide:user-round" class="size-4" />
          </div>

          <div class="min-w-0">
            <p class="text-[0.65rem] font-medium tracking-wide text-base-content/50 uppercase">
              ผู้ครอบครอง
            </p>
            <p
              class="truncate text-sm"
              :class="detail?.holderName ? 'font-medium' : 'text-base-content/50'"
              :title="detail?.holderName ?? ''"
            >
              {{ detail?.holderName || 'ทะเบียนยังไม่ระบุ' }}
            </p>
          </div>
        </div>

        <!-- ผังใน modal อยู่ที่เดิม: ในคอลัมน์ขวา กินที่ที่เหลือจนจบเส้นเดียวกับรูป
             ★ min-h-0 จำเป็นทุกชั้นที่เป็น flex-1 - flex item มี min-height:auto เป็น
               ค่าตั้งต้น ("ห้ามหดเล็กกว่าเนื้อหา") ลูกจึงดันพ่อให้สูงเกิน h-64 แทนที่จะ
               หดตัวเอง = ล้นใต้รูปทั้งที่ใส่ flex-1 แล้ว -->
        <div v-if="layout === 'modal'" class="mt-3 flex min-h-0 w-full flex-1 flex-col gap-1.5">
          <div class="flex shrink-0 items-center gap-1.5 text-xs text-base-content/60">
            <Icon icon="lucide:map-pin" class="size-3.5" />
            <span class="truncate">
              {{ detail?.subLocationName || detail?.locationName || 'ที่ตั้ง' }}
            </span>

            <!-- ปุ่มอยู่ในแถวป้าย ไม่ใช่ทับบนผัง - มุมขวาบนของผังเป็นที่ของปุ่ม +/−/ดูทั้งผัง
                 ของ FloorPlanMap อยู่แล้ว (ทับเมื่อไหร่คือกดชนกันบนมือถือ)
                 ★ ต้องมี detail ก่อน - ปุ่มต้องใช้ detail.id ยิง PATCH และค่าเดิมไปปักหมุด -->
            <button
              v-if="canEditLocation && detail"
              type="button"
              class="btn btn-ghost btn-xs ml-auto shrink-0 gap-1"
              :disabled="savingLocation"
              @click="pickerOpen = true"
            >
              <span v-if="savingLocation" class="loading loading-spinner loading-xs" />
              <Icon v-else icon="lucide:map-pin-plus" class="size-3.5" />
              {{ detail.subLocationId ? 'แก้ที่ตั้ง' : 'ระบุที่ตั้ง' }}
            </button>
          </div>

          <AppAssetLocationMap
            :detail="detail"
            :plans="plans"
            map-class="min-h-0 w-full flex-1"
          />

          <div v-if="locationError" role="alert" class="alert alert-error alert-soft shrink-0 py-1.5">
            <span class="text-xs">{{ locationError }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── เนื้อหา ─────────────────────────────────────────────────────
         min-h กันกล่องกระโดดตอนสลับจากตัวหมุนเป็นเนื้อหาจริง -->
    <div class="min-h-[18rem] py-4 text-left">
      <div v-if="loading" class="flex h-72 items-center justify-center">
        <span class="loading loading-spinner loading-lg" />
      </div>

      <!-- สแกนติดแต่ไม่มีในทะเบียน - ต้องบอกเลขที่สแกนได้ด้วย ไม่งั้นคนหน้างานรายงานต่อไม่ได้
           และต้องแยกจาก error อื่นให้ชัด เพราะสองอย่างนี้แก้คนละทางกันสิ้นเชิง -->
      <div v-else-if="notFound" class="py-12 text-center">
        <Icon icon="mdi:tag-off-outline" class="mx-auto size-14 text-warning opacity-70" />
        <h1 class="mt-3 text-xl font-semibold">ไม่พบสินทรัพย์เลขนี้ในระบบ</h1>
        <p class="mt-1 font-mono text-sm break-all opacity-70">{{ item?.assetNumber }}</p>
        <button class="btn btn-sm mt-4" @click="load()">ลองใหม่</button>
      </div>

      <div v-else-if="loadError" role="alert" class="alert alert-error alert-soft">
        <Icon icon="mdi:alert-circle-outline" class="size-5" />
        <span>{{ loadError }}</span>
        <button v-if="item" class="btn btn-sm" @click="load()">ลองใหม่</button>
      </div>

      <div v-else-if="detail" class="space-y-5">
        <!-- ── ผัง (เฉพาะโหมด page) ─────────────────────────────────────────
             เต็มความกว้างข้างล่างหัว ไม่ใช่บีบอยู่ข้างรูป - บนมือถือผังกว้าง 10rem
             ซูมยังไงก็อ่านไม่ออก และนี่คือคำถามหลักของคนที่เพิ่งสแกนสติกเกอร์
             (ใน modal ผังยังอยู่ในหัวเหมือนเดิม จอกว้างพออยู่แล้ว) -->
        <section v-if="layout === 'page'">
          <h4
            class="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-base-content uppercase"
          >
            <Icon icon="lucide:map-pin" class="size-3.5" />
            ที่ตั้ง
            <span class="ml-1 normal-case opacity-60">
              {{ detail.subLocationName || detail.locationName }}
            </span>

            <!-- โหมด page คือหน้าปลายทาง QR ซึ่งส่ง editableLocation มาเป็น false เสมอ
                 (คนสแกนยังไม่ได้ล็อกอิน) ปุ่มจึงไม่เคยขึ้นจริงวันนี้ - เขียนไว้เพื่อให้
                 สองโหมดมีความสามารถเท่ากัน ใครเปิด prop ให้หน้าเต็มวันหลังจะได้ไม่ต้องมาไล่เติม -->
            <button
              v-if="canEditLocation"
              type="button"
              class="btn btn-ghost btn-xs ml-auto shrink-0 gap-1 normal-case"
              :disabled="savingLocation"
              @click="pickerOpen = true"
            >
              <span v-if="savingLocation" class="loading loading-spinner loading-xs" />
              <Icon v-else icon="lucide:map-pin-plus" class="size-3.5" />
              {{ detail.subLocationId ? 'แก้ที่ตั้ง' : 'ระบุที่ตั้ง' }}
            </button>
          </h4>

          <AppAssetLocationMap :detail="detail" :plans="plans" map-class="h-64 w-full sm:h-80" />

          <div v-if="locationError" role="alert" class="alert alert-error alert-soft mt-2 py-1.5">
            <span class="text-xs">{{ locationError }}</span>
          </div>
        </section>

        <!-- ข้อมูลของชิ้น -->
        <section>
          <h4 class="mb-2 text-xs font-bold tracking-wide text-base-content uppercase">
            ข้อมูลสินทรัพย์
          </h4>
          <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">เลขเครื่อง (S/N)</dt>
              <dd class="font-mono">{{ detail.serialNumber ?? '-' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">หน่วยนับ</dt>
              <dd>{{ detail.uom ?? '-' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">แผนก</dt>
              <dd>{{ detail.departmentName ?? '-' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">ผู้ครอบครอง</dt>
              <dd>{{ detail.holderName ?? '-' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">Asset class</dt>
              <dd>{{ detail.assetClass ?? '-' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <!-- ★ ตรงนี้เคยเป็น "วันที่ตั้งหนี้" (วันใบกำกับใบแรก) - ถอดออกเพราะตอบอะไร
                   ไม่ได้จริง: ของที่วางบิลหลายงวดได้แค่วันของงวดแรก และมีค่าแค่ 52% ของ
                   ทะเบียน (อีก 48% ขึ้นทะเบียนผ่านเอกสารสินทรัพย์ ACQ1 ไม่มีใบกำกับเลย)
                   ★ sapCreatedDate = OITM.CreateDate มีครบเกือบ 100% และตอบได้จริงว่า
                     "ของชิ้นนี้เข้าทะเบียน SAP เมื่อไหร่" - คนละตัวกับ createdAt ซึ่งเป็น
                     วันที่แถวถูก sync เข้ามาใน AMS (ของที่ลงทะเบียนปี 2017 มี createdAt
                     เป็นปี 2026 ทั้งชุด) -->
              <dt class="text-base-content/60">วันที่ลงทะเบียน</dt>
              <dd>{{ formatDate(detail.sapCreatedDate) }}</dd>
            </div>
            <!-- ถอด "ราคาที่ได้มา" ออกแล้ว - มันคือยอดรวมบรรทัดใบกำกับซึ่งเพี้ยนเป็นเท่าตัว
                 เมื่อรหัสเดียวอยู่หลายบรรทัด และวางอยู่เหนือ "ราคาทุน" ที่เป็นคนละเลข
                 ทำให้คนอ่านไม่รู้ว่าจะเชื่ออันไหน - ราคาที่ถูกคือ "ราคาทุน" ในส่วน
                 มูลค่าทางบัญชีข้างล่าง (ครอบ 99.4% ของทะเบียน) -->
                             <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">สถานที่จาก SAP</dt>
              <dd>{{ detail.locationName?? '-' }}</dd>
            </div>
            <div class="flex justify-between gap-1 ">
              <dt class="text-base-content/60">ระยะประกัน</dt>
              <dd class="flex items-center gap-2">
                <span>{{ warrantyText }}</span>
                <span v-if="warrantyExpired !== null" class="badge badge-xs"
                  :class="warrantyExpired ? 'badge-error' : 'badge-success'">
                  {{ warrantyExpired ? 'หมดประกันแล้ว' : 'อยู่ในประกัน' }}
                </span>
              </dd>
            </div>
          </dl>
        </section>



        <!-- มูลค่าทางบัญชี -->
        <section>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <h4 class="text-xs font-semibold tracking-wide text-base-content uppercase">
              มูลค่าทางบัญชี
            </h4>
            <span v-if="detail.accounting" class="badge badge-xs"
              :class="isStale ? 'badge-warning ' : 'badge-ghost'">
              ปีบัญชี {{ detail.accounting.fiscalYear }}
            </span>
            <!-- ★ ป้ายนี้ห้ามตัดทิ้ง - 25% ของทะเบียนเป็นตัวเลขของปีเก่า (วัด 2026-08-20)
                 ถ้าไม่บอก คนจะอ่านยอดปี 2022 เป็นมูลค่าของวันนี้ -->

          </div>

          <p v-if="!detail.accounting" class="text-sm text-base-content/50">
            SAP ยังไม่มียอดบัญชีของชิ้นนี้
          </p>

          <dl v-else class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">ราคาทุน</dt>
              <dd class="tabular-nums">{{ formatMoney(detail.accounting.bookedCost) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">ค่าเสื่อมสะสม</dt>
              <dd class="tabular-nums">
                {{ formatMoney(detail.accounting.accumulatedDepreciation) }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">มูลค่าคงเหลือ</dt>
              <dd class="tabular-nums">{{ formatMoney(detail.accounting.netBookValue) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">มูลค่าซาก</dt>
              <dd class="tabular-nums">{{ formatMoney(detail.accounting.salvageValue) }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">อายุการใช้งาน</dt>
              <dd>
                {{ formatMonths(detail.accounting.usefulLifeMonths) }}
                <span v-if="showRawMonths(detail.accounting.usefulLifeMonths)" class="text-base-content/60">
                  ({{ detail.accounting.usefulLifeMonths }} เดือน)
                </span>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">อายุคงเหลือ</dt>
              <dd>
                {{ formatMonths(detail.accounting.remainingLifeMonths) }}
                <span v-if="showRawMonths(detail.accounting.remainingLifeMonths)" class="text-base-content/60">
                  ({{ detail.accounting.remainingLifeMonths }} เดือน)
                </span>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">วิธีคิดค่าเสื่อม</dt>
              <dd>{{ detail.accounting.depreciationMethod ?? '-' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-base-content/60">ช่วงคิดค่าเสื่อม</dt>
              <dd>
                {{ formatDate(detail.accounting.depreciationStart) }} –
                {{ formatDate(detail.accounting.depreciationEnd) }}
              </dd>
            </div>
            <div class="flex justify-between gap-3 sm:col-span-2">
              <dt class="text-primary ">ข้อมูลจาก SAP ล่าสุด</dt>
              <dd class="text-primary ">{{ formatDateTime(detail.accounting.syncedAt) }}</dd>
            </div>
          </dl>
        </section>

        <!-- ── QR สำหรับติดตัวเครื่อง ────────────────────────────────────
             โผล่เฉพาะหน้าที่ส่ง qrCode เข้ามา และเฉพาะชิ้นที่มีค่านั้นจริง
             (ไม่มีเลข = ไม่มี QR = ไม่มีอะไรให้ชี้ถึง) -->
        <section
          v-if="qrCode"
          class="flex flex-wrap items-center gap-4 rounded-box border border-base-300 bg-base-200/60 p-3"
        >
          <img
            v-if="qrDataUrl"
            :src="qrDataUrl"
            :alt="`QR ของ ${detail.assetNumber}`"
            class="size-28 shrink-0 rounded bg-white p-1"
          />
          <!-- วาดไม่สำเร็จก็ยังต้องเห็นว่ามี QR อยู่ และ URL ข้างล่างยังก๊อปไปใช้ต่อได้ -->
          <div v-else class="grid size-28 shrink-0 place-items-center rounded bg-base-300">
            <Icon icon="mdi:qrcode-remove" class="size-6 opacity-40" />
          </div>

          <div class="min-w-0 flex-1">
            <div
              class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60"
            >
              <Icon icon="mdi:qrcode" class="size-4" />
              QR สำหรับติดตัวเครื่อง
            </div>
            <p class="mt-1 font-mono text-xs break-all opacity-80">{{ qrCode }}</p>
            <p class="mt-1 text-xs opacity-60">
              สแกนด้วยกล้องมือถือแล้วเปิดหน้าสินทรัพย์ของชิ้นนี้ได้เลย
            </p>
          </div>
        </section>
      </div>
    </div>

    <!-- ── รูปเต็มจอ - object-contain ไม่เฉือนอะไรทิ้ง เพราะนี่คือโหมดที่คนหน้างานใช้ซูม
         อ่าน S/N บนตัวเครื่องจริง กดที่ไหนก็ปิด (ทั้งพื้นหลังและปุ่ม) แล้วกลับมาที่เดิม

         ★ Teleport to body - component นี้ถูกใช้ใน modal ของ AssetDetailModal ด้วย ถ้าปล่อยไว้ใน
           ต้นไม้เดิมมันจะอยู่ใน .modal-box ที่เป็น overflow-hidden แล้วโดนตัดตามขอบกล่อง
           (หน้า QR ไม่มีกล่องครอบก็จริง แต่ทั้งสองทางใช้ไฟล์นี้ตัวเดียวกัน)
         ★ z สูงกว่า .modal ของ daisyUI เพราะมันซ้อนบนกล่องที่ยังเปิดอยู่ -->
    <Teleport to="body">
      <div v-if="lightboxOpen && imageUrl"
        class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4" role="dialog"
        aria-label="รูปสินทรัพย์ขนาดเต็ม" @click="lightboxOpen = false">
        <img :src="imageUrl" :alt="head.description ?? head.assetNumber"
          class="max-h-full max-w-full rounded object-contain" />
        <!-- ── ปุ่มแก้รูป อยู่ "ข้างปุ่มกากบาท" ────────────────────────────────
             ★ วางเป็นแถวเดียวกับปุ่มปิด ไม่ใช่ลอยแยกที่อื่น - มุมขวาบนคือที่ที่มือ
               ไปอยู่แล้วตอนจะปิด ปุ่มที่ต้องใช้คู่กันควรอยู่ระยะเดียวกัน
             ★ .stop ที่ทั้งสองปุ่ม - พื้นหลังผูก click ให้ปิดรูปไว้ ถ้าไม่กัน event
               จะไหลขึ้นไปปิดรูปเต็มจอพร้อมกับเปิดกล่อง (เห็นกล่องกระพริบแล้วหาย) -->
        <div class="absolute top-4 right-4 flex items-center gap-2">
          <button
            v-if="canEditImage"
            type="button"
            class="btn btn-circle btn-sm"
            aria-label="เปลี่ยนรูปสินทรัพย์"
            title="เปลี่ยนรูป"
            @click.stop="openImageDialogFromLightbox"
          >
            <Icon icon="lucide:pencil" class="size-4" />
          </button>
          <button type="button" class="btn btn-circle btn-sm" aria-label="ปิดรูป"
            @click.stop="lightboxOpen = false">
            <Icon icon="mdi:close" class="size-5" />
          </button>
        </div>
      </div>
    </Teleport>

    <!-- กล่องแนบ/เปลี่ยนรูป - ทางเข้าสองทางมาจบที่ตัวนี้ตัวเดียว
         ส่ง imageUrl เดิมเข้าไปด้วย กล่องจึง preview ของเดิมไว้ให้ตั้งแต่เปิด (ตามที่ขอ) -->
    <AssetImageDialog
      v-if="canEditImage && detail"
      v-model:open="imageDialogOpen"
      :asset-id="detail.id"
      :current-image-url="imageUrl || null"
      @saved="onImageSaved"
    />

    <!-- ── กล่องเลือกสถานที่บนผัง ─────────────────────────────────────────────
         ตัวเดียวกับที่กล่องกรอกสินทรัพย์ใช้ ไม่ก๊อป - ตรรกะ "ต้องเลือกห้อง + ต้องปักหมุด
         ถึงจะยืนยันได้" ต้องเหมือนกันทั้งสองทางเข้า

         ★ ส่งค่าเดิมเข้าไปครบสามช่อง หมุดจึงปักอยู่ที่เดิมตั้งแต่เปิด และกล่องจะเด้งไป
           ชั้นของห้องนั้นให้เอง (syncFromProps) ไม่ใช่เปิดมาที่ชั้นแรกแล้วให้ไล่หาใหม่

         ★ v-if ที่ detail ไม่ใช่แค่ที่ editableLocation - กล่องนี้ยิง /master/floor-plans
           ตอนเปิด และเราต้องมี detail.id ไว้ยิง PATCH อยู่แล้ว -->
    <FloorPlanPickerModal
      v-if="canEditLocation && detail"
      v-model:open="pickerOpen"
      :sub-location-id="detail.subLocationId"
      :pos-x="detail.posX"
      :pos-y="detail.posY"
      @confirm="onPickLocation"
    />
  </div>
</template>
