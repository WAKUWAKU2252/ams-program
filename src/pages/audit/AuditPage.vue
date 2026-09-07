<script setup lang="ts">
/**
 * หน้า Audit - ตอบคำถามข้อเดียว: "ของชิ้นนี้อยู่ตรงไหน ไปดูได้ยังไง"
 *
 * ซ้าย = ทะเบียน (ค้น/กรอง/แบ่งหน้า) ขวา = ผังชั้น คลิกการ์ดซ้ายแล้วผังขวากระโดดไปหา
 *
 * ── สามอย่างที่ต้องรู้ก่อนแก้ไฟล์นี้ ────────────────────────────────────────
 *
 * 1. **ตั้งต้นกรองเฉพาะชิ้นที่ระบุห้องแล้ว** (locatedOnly = true)
 *    วัดจากของจริง 2026-09-01: ทะเบียน REGISTERED 2,757 ชิ้น ระบุห้องไว้ 17 ชิ้น
 *    ปักหมุดแล้ว 13 ถ้าเปิดมาเห็นทั้ง 2,757 ชิ้น คนตรวจจะคลิกโดนของที่ไม่มีที่ตั้ง
 *    99.4% ของครั้ง แล้วสรุปว่าหน้านี้พัง ทั้งที่ปัญหาคือทะเบียนยังไม่ถูกกรอก
 *    - ปุ่มสลับมีให้กดดูทั้งทะเบียนได้ตลอด ไม่ได้ซ่อนของ
 *
 * 2. **แท็บชั้นกรองแค่หมุดบนผัง ไม่กรองลิสต์ซ้าย** ลิสต์ซ้ายเป็นผลค้นหาล้วน ๆ 10 ชิ้น
 *    ต่อหน้าเหมือนหน้าทะเบียน ถ้าให้แท็บมากรองลิสต์ด้วย จำนวนผลจะเปลี่ยนไปตามแท็บ
 *    แล้วเลขหน้ากับ "พบ N ชิ้น" จะหมายถึงคนละชุดกันในแต่ละแท็บ
 *    - คลิกของที่อยู่คนละชั้น ระบบสลับแท็บให้เอง ผู้ใช้ไม่ต้องรู้ล่วงหน้าว่าอยู่ชั้นไหน
 *
 * 3. **ชิ้นที่รู้ห้องแต่ไม่มีหมุด ก็ยังพาไปหาได้** - ส่ง subLocationId ให้แผนที่เป็นห้อง
 *    ที่เลือก มันจะซูมไปไฮไลต์ทั้งห้องให้เอง (ck_asset_pos_needs_sub_location การันตีว่า
 *    ชิ้นที่มีหมุดต้องมีห้องเสมอ ทางกลับกันไม่จริง) auditor เดินไปถึงห้องก็เจอของแล้ว
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import AssetDetailModal from '@/shared/components/AssetDetailModal.vue'
import AuditAssetList from './components/AuditAssetList.vue'
import FloorPlanMap from '@/shared/components/FloorPlanMap.vue'
import { getAssetInventory, type InventoryItem } from '@/shared/services/asset.service'
import {
  listCompanies,
  listDepartments,
  listFloorPlans,
  type CompanyOption,
  type DepartmentOption,
  type FloorPlan,
} from '@/shared/services/master.service'
import { ApiError } from '@/shared/services/httpClient'
import { categoryIcon } from '@/shared/utils/category-icon'
import { ASSET_STATUS_OPTIONS } from '@/shared/utils/asset-status'

// ── รายการฝั่งซ้าย ─────────────────────────────────────────────────────────
const items = ref<InventoryItem[]>([])
const total = ref(0)
const page = ref(1)
/** 5 ชิ้นต่อหน้า - การ์ดสูงกว่าแถวตาราง ครึ่งจอเลยรับได้ไม่กี่ใบก่อนต้องเลื่อน */
const limit = 5
const loading = ref(false)
const loadError = ref('')

const searchText = ref('')
/** รหัสบริษัท เช่น 'UBA' - '' = ทุกบริษัท (ค่าคือ code ไม่ใช่ id ดู CompanyOption) */
const companyCode = ref('')
const departmentId = ref('')
const status = ref('')
/** ค่าตั้งต้นเป็น true - ดูเหตุผลข้อ 1 ที่หัวไฟล์ */
const locatedOnly = ref(true)

const companies = ref<CompanyOption[]>([])
const departments = ref<DepartmentOption[]>([])

/**
 * ต้องเลือกบริษัทก่อนถึงจะเลือกแผนกได้ - แผนกเป็นของบริษัท ไม่ใช่ของทั้งเครือ (0024)
 *
 * ★ ทะเบียนจริงมี 151 แผนกจาก 3 บริษัท และ **55 ชื่อซ้ำกันข้ามบริษัท** (วัด 2026-09-03)
 *   ลิสต์ที่เทลงมาทั้ง 151 แถวคือลิสต์ที่เลือกถูกไม่ได้: คนกดเจอ "ฝ่ายบัญชี" สามอัน
 *   เรียงติดกันแล้วต้องเดา เลือกผิดก็ได้ลิสต์ว่างโดยไม่มีอะไรอธิบาย
 *
 *   การติดป้ายรหัสบริษัทท้ายชื่อช่วยให้ "อ่านออก" ก็จริง แต่ยังต้องกวาดสายตาหา
 *   ในลิสต์ยาว 151 แถวอยู่ดี - บังคับเลือกบริษัทก่อนตัดความกำกวมทิ้งทั้งหมด
 *   (แพทเทิร์นเดียวกับช่องแผนกบนหน้า Dashboard ที่ล็อกไว้จนกว่าจะเลือกบริษัท)
 */
const departmentLocked = computed(() => !companyCode.value)

/** แผนกของบริษัทที่เลือกไว้ - ยังไม่เลือกบริษัท = ว่าง ไม่ใช่ "ทั้งหมด" (ดู departmentLocked) */
const companyDepartments = computed(() =>
  companyCode.value ? departments.value.filter((d) => d.companyCode === companyCode.value) : [],
)

// ย้ายไป utils/asset-status.ts แล้ว - เดิมไฟล์นี้ ทะเบียน และ Dashboard ถือคนละสำเนา
const STATUS_OPTIONS = ASSET_STATUS_OPTIONS

// ── โหมดสุ่มรายการตรวจ ─────────────────────────────────────────────────────
//
// flow ของการตรวจนับคือ: สุ่มรายการบน AMS → เดินไปสแกน QR ที่ตัวเครื่อง → เจอตรงก็จบ
// **ไม่มีการบันทึกอะไรกลับเข้าระบบ** หน้านี้จึงไม่ต้องมีรอบตรวจ/สถานะ/ปุ่ม submit
// มันคือ "ตัวออกรายการให้เดินไปดู" เฉย ๆ
//
// ★ สุ่มจากผลที่กรองไว้ ไม่ใช่จากทั้งทะเบียน - ผู้ตรวจตั้งขอบเขตก่อน (แผนก/สถานะ/
//   เฉพาะที่ระบุที่ตั้ง) แล้วค่อยสุ่มในขอบเขตนั้น
//
// ★ อยู่ในโหมดสุ่ม = ซ่อนแถบเลขหน้า เพราะการสุ่มเกิดใหม่ทุกคำขอ หน้า 2 จึงไม่ใช่
//   "ส่วนที่เหลือของหน้า 1" แต่เป็นชุดใหม่ที่ซ้ำกับหน้า 1 ได้ (ดู InventoryParams.random)
const randomMode = ref(false)
/** จำนวนที่จะสุ่ม - เพดาน 100 มาจาก paginationQuery ฝั่ง backend */
const sampleSize = ref(10)
const SAMPLE_OPTIONS = [5, 10, 20, 50]

/**
 * ชื่อแผนกที่เลือกไว้
 *
 * ไม่ต้องต่อรหัสบริษัทท้ายชื่อ - เลือกแผนกได้ก็ต่อเมื่อเลือกบริษัทไว้แล้ว (departmentLocked)
 * chip ของบริษัทจึงบอกอยู่แล้วว่าเป็นแผนกของใคร เขียนซ้ำมีแต่จะยาวเกินจำเป็น
 */
function departmentLabel(): string {
  return departments.value.find((d) => String(d.id) === departmentId.value)?.name ?? departmentId.value
}

/**
 * ตัวกรองที่ใช้อยู่ตอนนี้ - แสดงเป็น chip ให้เห็นครบในบรรทัดเดียว (แพทเทิร์นเดียวกับหน้าทะเบียน)
 *
 * ★ จำเป็นเพราะแผงตัวกรองโชว์ได้ทีละแกน ถ้าไม่มีบรรทัดนี้ ผู้ใช้ที่กรองไว้สามแกนจะเห็น
 *   แค่แกนล่าสุด แล้วไม่รู้ว่าอีกสองตัวยังบีบผลลัพธ์อยู่
 *
 * นับคำค้นและสวิตช์ "เฉพาะชิ้นที่ระบุที่ตั้ง" รวมด้วย ทั้งที่สองอันอยู่นอกแผง - คำถามที่
 * บรรทัดนี้ตอบคือ "ตอนนี้ลิสต์ถูกจำกัดด้วยอะไรอยู่บ้าง" ซึ่งทั้งคู่ก็เป็นหนึ่งในนั้น
 */
const activeFilterChips = computed(() => {
  const chips: { key: string; label: string; clear: () => void }[] = []

  const search = searchText.value.trim()
  if (search) chips.push({ key: 'search', label: `ค้น: ${search}`, clear: () => (searchText.value = '') })

  if (companyCode.value) {
    const name = companies.value.find((c) => c.code === companyCode.value)?.name
    chips.push({
      key: 'company',
      label: `บริษัท: ${name ?? companyCode.value}`,
      clear: () => (companyCode.value = ''),
    })
  }

  if (departmentId.value) {
    chips.push({
      key: 'dep',
      label: `แผนก: ${departmentLabel()}`,
      clear: () => (departmentId.value = ''),
    })
  }

  if (status.value) {
    const label = STATUS_OPTIONS.find((s) => s.value === status.value)?.label ?? status.value
    chips.push({ key: 'status', label: `สถานะ: ${label}`, clear: () => (status.value = '') })
  }

  // สวิตช์นี้ค่าตั้งต้นเป็นเปิด การ "ปิด" ต่างหากที่เป็นการเปลี่ยนขอบเขต จึงขึ้น chip ตอนปิด
  if (!locatedOnly.value) {
    chips.push({
      key: 'located',
      label: 'รวมชิ้นที่ยังไม่ระบุที่ตั้ง',
      clear: () => (locatedOnly.value = true),
    })
  }

  return chips
})

const hasFilter = computed(() => activeFilterChips.value.length > 0)

/** '' → undefined (ช่อง select คืน string เสมอ) */
function num(value: string): number | undefined {
  const parsed = Number(value)
  return value && Number.isFinite(parsed) ? parsed : undefined
}

/**
 * กันผลลัพธ์เก่าทับใหม่ - หน้านี้มีทั้งช่องพิมพ์และปุ่มกด ยิงซ้อนกันได้ง่ายกว่าหน้าทะเบียน
 * ที่มีแต่ตัวกรอง (พิมพ์ค้นค้างอยู่ แล้วกดสลับ "เฉพาะที่ระบุที่ตั้ง" ทันที = สองคำขอซ้อน)
 */
let latest = 0

async function load() {
  const token = ++latest
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAssetInventory({
      page: page.value,
      // โหมดสุ่มใช้ limit เป็น "จำนวนที่สุ่มออกมา" ไม่ใช่ขนาดหน้า (ไม่มีหน้า 2 ให้ไป)
      limit: randomMode.value ? sampleSize.value : limit,
      search: searchText.value,
      companyCode: companyCode.value || undefined,
      departmentId: num(departmentId.value),
      status: status.value || undefined,
      located: locatedOnly.value,
      random: randomMode.value || undefined,
    })
    if (token !== latest) return
    items.value = res.data
    total.value = res.total
  } catch (e) {
    if (token !== latest) return
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการสินทรัพย์ไม่สำเร็จ'
    items.value = []
    total.value = 0
  } finally {
    if (token === latest) loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined

/** ช่องที่พิมพ์ต้องหน่วง ไม่งั้นได้ 10 request ต่อคำค้น 10 ตัวอักษร */
watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void load()
  }, 350)
})

// ★ ทุกตัวต้องรีเซ็ตกลับหน้า 1 - ค้างอยู่หน้า 2 แล้วกรองจนเหลือ 3 ชิ้นจะได้ลิสต์ว่าง
//   พร้อมแถบเลขหน้าที่หายไปด้วย = ไม่มีปุ่มให้กดกลับ
//
// ★★ ต้องเป็น watch ตัวเดียว ห้ามแยก "ล้างแผนกตอนเปลี่ยนบริษัท" ออกไปเป็นอีกตัว
//    แผนกเป็นของบริษัท (0024) id ที่ค้างจากบริษัทก่อนจึงไม่มีอยู่ในบริษัทใหม่ ต้องล้างทิ้ง
//    แต่ถ้าแยกเป็นสอง watch ทั้งคู่จะถูกคิวในรอบ flush เดียวกันแล้วทำงานตามลำดับที่ประกาศ
//    ตัวหนึ่งยิง load() ด้วยคู่ (บริษัทใหม่ + แผนกของบริษัทเก่า) ซึ่งเป็นคู่ที่ไม่มีอยู่จริง
//    → ได้ผลว่างแวบหนึ่ง แล้วอีกตัวค่อยล้างแผนกจนยิงซ้ำอีกรอบ (บั๊กเดียวกับที่หน้า
//    Dashboard เคยเจอ - ดู watch ใน DashboardPage.vue)
//
//    รวมเป็นตัวเดียวแล้ว "ล้างแล้วไม่โหลด" - การเซ็ตค่าจะกระตุ้น watch ตัวนี้ซ้ำเอง
//    รอบถัดไปจึงโหลดด้วยคู่ที่ถูกต้องครั้งเดียว
watch([companyCode, departmentId, status, locatedOnly], ([company], [prevCompany]) => {
  if (company !== prevCompany && departmentId.value) {
    departmentId.value = ''
    return
  }
  page.value = 1
  void load()
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  // listener ของแผงตัวกรอง - ถอดทิ้งด้วย ไม่งั้นค้างอยู่กับ document หลังออกจากหน้า
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onPanelKeydown)
})

/** กล่องที่เลื่อนคือลิสต์ ไม่ใช่ทั้งหน้า - window.scrollTo จึงไม่ช่วยอะไรตอนเปลี่ยนหน้า */
const listScroller = ref<HTMLElement | null>(null)

function onPageChange(next: number) {
  page.value = next
  void load()
  listScroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

/**
 * เลื่อนลิสต์ซ้ายไปหาการ์ดของชิ้นที่เลือก - ใช้ตอนผู้ใช้คลิกหมุดบนผัง
 *
 * ★ ต้องหาผ่าน DOM ไม่ใช่ ref ของ component ลูก: AuditAssetList เรนเดอร์การ์ดในลูป
 *   ส่วนกล่องที่เลื่อนจริง (listScroller) อยู่ข้างนอก component นั้น - การ์ดจึงติดป้าย
 *   data-asset-id ไว้ให้ค้น (ดูหมายเหตุใน AuditAssetList.vue)
 *
 * block: 'nearest' ไม่ใช่ 'center' - การ์ดที่อยู่ในกรอบอยู่แล้วจะไม่เลื่อนอะไรเลย
 * คนที่คลิกหมุดของชิ้นที่ตัวเองกำลังอ่านอยู่ ไม่ควรโดนลิสต์กระตุกใส่
 */
async function scrollToSelected(id: number) {
  await nextTick()
  listScroller.value
    ?.querySelector(`[data-asset-id="${id}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

/**
 * คลิกหมุดบนผัง = เลือกชิ้นนั้นในลิสต์ (กติกาเดียวกับหน้า Asset Location Map)
 *
 * ★ ไม่สลับแท็บชั้นเหมือน onSelect - หมุดที่กดได้มีแต่ของผังใบที่เปิดอยู่แล้ว (assetPins
 *   กรองด้วย planKey === activeKey) จึงไม่มีเคสที่ต้องพาไปชั้นอื่น
 *
 * ★ ไม่เปิด modal รายละเอียดด้วย - บนผังคนกำลังกวาดหาของ การเด้ง modal ทุกครั้งที่แตะหมุด
 *   จะขวางมากกว่าช่วย อยากดูรายละเอียดค่อยกดปุ่มในการ์ดที่เพิ่งถูกเลื่อนมาให้
 */
function onPinSelect(id: number) {
  selectedId.value = id
  void scrollToSelected(id)
}

function clearFilters() {
  searchText.value = ''
  companyCode.value = ''
  departmentId.value = ''
  status.value = ''
  locatedOnly.value = true
  // ไม่เรียก load() เอง - watch สองชุดข้างบนจับครบทุกช่องแล้ว เรียกซ้ำจะยิงซ้อน
}

// ── แผงตัวกรอง ─────────────────────────────────────────────────────────────
//
// รูปเดียวกับหน้า Asset Inventory: dropdown แผงเดียวที่ "เลือกค่าได้ในตัวเอง" กดหัวข้อ
// แล้วกางออกในที่ ไม่ใช่ dropdown ที่เลือกชนิดแล้วไปโผล่ช่องกรอกข้างนอก
//
// ★ ทำไมต้องเปลี่ยนจาก <select> เรียงกัน: คอลัมน์ซ้ายของหน้านี้กว้างครึ่งจอ พอมี
//   ช่องค้น + สองกล่องเลือก + ปุ่มล้างอยู่ใน flex-wrap เดียวกัน มันตัดบรรทัดมั่วตามความ
//   ยาวของชื่อแผนกที่เลือกไว้ (บางชื่อยาว 40 ตัวอักษร) แล้วแถวตัวกรองสูงกว่าลิสต์ที่มัน
//   ควรกรอง - แผงเก็บทุกอย่างไว้หลังปุ่มเดียวที่ความกว้างคงที่
//
// ★ ค่าจริงยังอยู่ใน ref ของแต่ละแกนเหมือนเดิม แผงนี้เป็นแค่หน้าตา ปิดแผงแล้วตัวกรอง
//   ยังทำงานอยู่ (badge บนปุ่มกับ chip ข้างล่างเป็นตัวบอก)
const panelOpen = ref(false)
/** หัวข้อที่กางอยู่ - ทีละอันเพื่อไม่ให้แผงยาวจนต้องเลื่อนหา */
const expandedField = ref('')

/**
 * ปลดบริษัททิ้งตอนลิสต์แผนกกางอยู่ = ต้องหุบมันด้วย
 *
 * ไม่หุบแล้วผู้ใช้จะเห็นลิสต์เปล่าพร้อมข้อความ "ไม่พบแผนกที่ตรงกับคำค้น" ซึ่งโกหก -
 * สาเหตุจริงคือยังไม่ได้เลือกบริษัท ไม่ใช่คำค้นไม่ตรง
 */
watch(departmentLocked, (locked) => {
  if (locked && expandedField.value === 'department') expandedField.value = ''
})

const FILTER_FIELDS = [
  { key: 'company', label: 'บริษัท', icon: 'lucide:building-2' },
  { key: 'department', label: 'แผนก', icon: 'lucide:users' },
  { key: 'status', label: 'สถานะ', icon: 'lucide:activity' },
]

/** แกนไหนมีค่าอยู่แล้ว - เอาไปขึ้น badge บนหัวข้อในแผง */
function filterHasValue(key: string): boolean {
  if (key === 'company') return !!companyCode.value
  if (key === 'department') return !!departmentId.value
  if (key === 'status') return !!status.value
  return false
}

function clearField(key: string) {
  if (key === 'company') companyCode.value = ''
  else if (key === 'department') departmentId.value = ''
  else if (key === 'status') status.value = ''
}

/**
 * กดตัวเลือกเดิมซ้ำ = ปลดตัวกรองนั้น
 *
 * ในแผงไม่มีตัวเลือก "ทั้งหมด" ให้กดเหมือนตอนเป็น <select> - การกดซ้ำจึงเป็นทางเดียวที่
 * ผู้ใช้จะกลับไปสถานะ "ไม่กรอง" ได้จากในลิสต์ (นอกจากกด × บนหัวข้อ หรือกด chip ข้างล่าง)
 *
 * รับเป็น key ไม่ใช่ตัว ref - ใน <script setup> template จะ unwrap ref ให้อัตโนมัติ
 * ส่งตัว ref ออกไปจาก template จึงไม่ได้ ได้แต่ค่าข้างใน
 */
function toggleValue(key: string, value: string) {
  const target =
    key === 'company' ? companyCode : key === 'department' ? departmentId : key === 'status' ? status : null
  if (!target) return
  target.value = target.value === value ? '' : value
}

/** ค่าที่เลือกไว้ของแกนนั้น เป็นข้อความอ่านออก - โชว์ใต้หัวข้อตอนหุบ */
function fieldValueLabel(key: string): string {
  if (key === 'company') {
    return companies.value.find((c) => c.code === companyCode.value)?.name ?? companyCode.value
  }
  if (key === 'department') return departmentLabel()
  if (key === 'status') return STATUS_OPTIONS.find((s) => s.value === status.value)?.label ?? status.value
  return ''
}

// แผนกมีหลายสิบต่อบริษัท ลิสต์เปล่า ๆ เลื่อนหาไม่ไหว - ส่วนบริษัท/สถานะมีไม่กี่ตัวจึงไม่ต้องมี
const departmentSearch = ref('')

// เปลี่ยนบริษัท = ล้างคำค้นแผนกด้วย คำที่พิมพ์ไว้ตอนดูบริษัทก่อนหน้ามักไม่ตรงกับชื่อแผนก
// ของบริษัทใหม่ แล้วจะได้ลิสต์เปล่าทันทีที่กางออกมา ทั้งที่มีแผนกให้เลือกอยู่หลายสิบ
//
// ★ ต้องอยู่ใต้ departmentSearch ไม่ใช่ไปกองรวมกับ watch อื่นข้างบน - const ไม่ถูก hoist
//   ตามฟังก์ชันที่ปิดทับมัน วางไว้เหนือแล้ววันหลังมีคนเติม { immediate: true } จะได้
//   ReferenceError ทันทีตอน setup โดยที่ tsc จับไม่ได้ (บั๊กคลาสเดียวกับที่ AppAssetDetail เจอ)
watch(companyCode, () => (departmentSearch.value = ''))

const filteredDepartments = computed(() => {
  const q = departmentSearch.value.trim().toLowerCase()
  return q
    ? companyDepartments.value.filter((d) => d.name.toLowerCase().includes(q))
    : companyDepartments.value
})

// ปิดแผงเมื่อคลิกนอกแผง - ไม่ปิดตอนคลิกในแผง ไม่งั้นกดเลือกค่าทีเดียวแผงหุบทุกครั้ง
const panelRef = ref<HTMLElement | null>(null)

function onDocumentPointerDown(e: PointerEvent) {
  if (!panelOpen.value) return
  if (panelRef.value && !panelRef.value.contains(e.target as Node)) panelOpen.value = false
}

function onPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && panelOpen.value) panelOpen.value = false
}

watch(panelOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onPanelKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onPanelKeydown)
  }
})

/**
 * กด "สุ่มรายการตรวจ" - กดซ้ำได้เรื่อย ๆ เพื่อสุ่มชุดใหม่
 *
 * ★ ต้อง load() เองตรงนี้ ไม่ใช่ผ่าน watch - randomMode ที่เป็น true อยู่แล้วแล้วกดซ้ำ
 *   จะไม่ทำให้ watch ยิง (ค่าไม่เปลี่ยน) ปุ่ม "สุ่มใหม่" ก็จะกดแล้วไม่เกิดอะไรขึ้น
 */
function drawRandom() {
  randomMode.value = true
  page.value = 1
  void load()
}

/** กลับไปโหมดไล่ดูทั้งทะเบียนตามปกติ - ตัวกรองที่ตั้งไว้ยังอยู่เหมือนเดิม */
function exitRandom() {
  randomMode.value = false
  page.value = 1
  void load()
}

// ── ผังชั้นฝั่งขวา ──────────────────────────────────────────────────────────
const plans = ref<FloorPlan[]>([])
const activeKey = ref('')
const planError = ref('')

/** ชิ้นที่กำลังส่องอยู่ - ล้างทุกครั้งที่ผลลัพธ์เปลี่ยน (ชิ้นเดิมอาจไม่อยู่ในหน้าใหม่แล้ว) */
const selectedId = ref<number | null>(null)
watch(items, () => (selectedId.value = null))

const selectedAsset = computed(() => items.value.find((i) => i.id === selectedId.value) ?? null)
const activePlan = computed(() => plans.value.find((p) => p.planKey === activeKey.value) ?? null)

/** BASE_URL เผื่อ deploy ใต้ sub-path - ต่อ path ตรง ๆ จะ 404 ทันทีที่ base ไม่ใช่ "/" */
const planSrc = computed(() =>
  activePlan.value ? `${import.meta.env.BASE_URL}floorplans/${activePlan.value.planKey}.png` : '',
)

/**
 * หมุดของ "ผลค้นหาหน้านี้" ที่อยู่บนผังใบที่เปิดอยู่
 *
 * วาดทั้งหน้าไม่ใช่เฉพาะชิ้นที่เลือก - คนตรวจได้เห็นว่าของชุดที่ค้นเจอกระจายอยู่ตรงไหนบ้าง
 * แล้วค่อยไล่ทีละชิ้น ซึ่งเร็วกว่าคลิกทีละใบเพื่อดูว่ามันอยู่ไหน
 */
const assetPins = computed(() =>
  items.value
    .filter(
      (i): i is InventoryItem & { posX: number; posY: number } =>
        i.planKey === activeKey.value && i.posX !== null && i.posY !== null,
    )
    .map((i) => ({
      id: i.id,
      x: i.posX,
      y: i.posY,
      icon: categoryIcon(i.categoryName),
      // เลขสินทรัพย์มาก่อนเสมอ - คนตามหาของจำเลข ไม่ได้จำคำอธิบาย
      label: [i.assetNumber, i.description].filter(Boolean).join(' · '),
    })),
)

/** จำนวนชิ้นในหน้านี้ที่อยู่แต่ละชั้น - ขึ้นเป็นตัวเลขบนแท็บ จะได้รู้ว่าควรกดแท็บไหนต่อ */
function countOnPlan(planKey: string): number {
  return items.value.filter((i) => i.planKey === planKey).length
}

/** ห้องของชิ้นที่เลือก เฉพาะเมื่อห้องนั้นอยู่บนผังใบที่เปิดอยู่ - ตัวนี้คือสิ่งที่ทำให้แผนที่ซูม */
const mapSelectedRoomId = computed(() => {
  const asset = selectedAsset.value
  if (!asset || asset.planKey !== activeKey.value) return null
  return asset.subLocationId
})

const activePinId = computed(() => {
  const asset = selectedAsset.value
  if (!asset || asset.planKey !== activeKey.value || asset.posX === null) return null
  return asset.id
})

// ── modal รายละเอียดรายชิ้น ─────────────────────────────────────────────────
//
// ใช้ AssetDetailModal ตัวเดียวกับหน้าทะเบียนและ My asset - ไม่เขียนหน้ารายละเอียดของตัวเอง
// เพราะข้อมูลชุดเดียวกันที่โชว์คนละแบบสองที่คือทางที่ทำให้สองหน้าเพี้ยนจากกันในที่สุด
// (modal นั้นยิง /assets/by-number เอาราคาทุน/ค่าเสื่อมสะสม/อายุมาเอง ซึ่งการ์ดในลิสต์ไม่มี)
//
// ★ ถือทั้งก้อน item ไม่ใช่ id - modal ใช้ข้อมูลจากแถวมาวาดหัวระหว่างรอ API
//   และทำให้ modal ไม่พังถ้าลิสต์ข้างหลังโหลดใหม่ตอนเปิดอยู่
const detailItem = ref<InventoryItem | null>(null)
const detailOpen = ref(false)

function onDetail(item: InventoryItem) {
  detailItem.value = item
  detailOpen.value = true
}

function onSelect(item: InventoryItem) {
  selectedId.value = item.id
  // สลับแท็บให้ตรงกับชั้นของชิ้นที่คลิก - ผู้ใช้ไม่ต้องรู้ล่วงหน้าว่าของอยู่ชั้นไหน
  if (item.planKey && item.planKey !== activeKey.value) activeKey.value = item.planKey
}

function switchPlan(key: string) {
  if (key === activeKey.value) return
  activeKey.value = key
  // ★ ไม่ล้าง selectedId: ชิ้นที่เลือกยังเป็นคำตอบที่ผู้ใช้กำลังดูอยู่ แค่ไปโผล่บนผังอีกใบ
  //   กดแท็บกลับมาก็ต้องเจอมันไฮไลต์อยู่ที่เดิม (mapSelectedRoomId เช็คชั้นให้แล้ว)
}

/**
 * บอกให้รู้ว่าคำตอบที่ได้ละเอียดแค่ไหน - เงียบไว้แล้วผู้ใช้จะไม่รู้ว่า "แผนที่ไม่ขยับ"
 * เพราะข้อมูลไม่มี หรือเพราะกดไม่ติด
 */
const locateNote = computed(() => {
  const asset = selectedAsset.value
  if (!asset) return null

  if (asset.subLocationId === null) {
    return { icon: 'lucide:map-pin-off', cls: 'alert-warning', text: 'ทะเบียนยังไม่ระบุว่าชิ้นนี้อยู่ห้องไหน' }
  }

  // ห้องมีจริงแต่ยังไม่ถูก trace ขอบเขต - /master/floor-plans คืนเฉพาะห้องที่มี polygon
  const onPlan = plans.value.some((p) => p.rooms.some((r) => r.id === asset.subLocationId))
  if (!onPlan) {
    return {
      icon: 'lucide:pencil-ruler',
      cls: 'alert-warning',
      text: `อยู่ที่ ${asset.subLocationName ?? 'ห้องที่ระบุไว้'} - ห้องนี้ยังไม่ได้ตีขอบเขตลงผัง`,
    }
  }

  if (asset.posX === null) {
    return {
      icon: 'lucide:scan-search',
      cls: 'alert-info',
      text: `อยู่ที่ ${asset.subLocationName} - ไม่ได้ปักหมุด`,
    }
  }

  return {
    icon: 'lucide:crosshair',
    cls: 'alert-success',
    text: `${asset.assetNumber} อยู่ที่ ${asset.subLocationName}`,
  }
})

onMounted(async () => {
  // โหลดคู่กันไป ไม่ต้องรอกัน - ตัวเลือกในกล่องกรองกับผังไม่ใช่เงื่อนไขของการโหลดลิสต์
  //
  // ★ แต่ละอันพังแยกกันได้ - catch ทีละตัว ไม่ใช้ Promise.all ที่ตัวเดียวล้มแล้วลากที่เหลือ
  //   หายไปด้วย แกนที่โหลดไม่ได้จะเหลือลิสต์เปล่าในแผง ส่วนลิสต์ซ้ายยังค้นได้ตามปกติ
  void listCompanies()
    .then((rows) => (companies.value = rows))
    .catch(() => {})

  void listDepartments()
    .then((rows) => (departments.value = rows))
    .catch(() => {})

  void listFloorPlans()
    .then((rows) => {
      plans.value = rows
      activeKey.value = rows[0]?.planKey ?? ''
      if (!rows.length) planError.value = 'ยังไม่มีผังชั้นที่ตีขอบเขตห้องไว้'
    })
    .catch((e) => {
      planError.value = e instanceof Error ? e.message : 'โหลดผังไม่สำเร็จ'
    })

  await load()
})
</script>

<template>
  <!-- ความสูงอิง viewport ไม่ใช่ h-full: <main> ของ MainLayout ไม่ได้กำหนดความสูงไว้
       flex-1 ของแผนที่จะพองตามเนื้อหาจนผังไปโผล่ใต้ขอบจอ (เหตุผลเดียวกับหน้า Floor Plan) -->
  <!-- ★ ล็อกความสูงเท่าจอเฉพาะ lg ขึ้นไป — บนมือถือ grid ยุบเหลือคอลัมน์เดียว ลิสต์กับผัง
       จึงเรียงต่อกันในกล่องที่สูงเท่า viewport พอดี ผังมี min-h-[20rem] กินไปเกือบหมด
       ลิสต์เหลือความสูงไม่ถึง 100px แล้วต้องเลื่อนดูของทั้งห้องในช่องแค่นั้น (อาการที่รายงานมา)
       มือถือปล่อยให้หน้ายาวแล้วเลื่อนทั้งหน้าตามปกติ -->
  <div class="flex min-h-0 flex-col gap-4 bg-base-100 px-4 py-6 lg:h-[calc(100dvh-3.5rem)] lg:min-h-[34rem] md:px-10">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold sm:text-4xl">Audit</h1>
        <p class="text-base-content/70">การตรวจสอบสินทรัพย์</p>
      </div>

      <div v-if="plans.length" role="tablist" class="tabs tabs-box">
        <button
          v-for="plan in plans"
          :key="plan.planKey"
          role="tab"
          class="tab gap-1"
          :class="plan.planKey === activeKey ? 'tab-active' : ''"
          @click="switchPlan(plan.planKey)"
        >
          ชั้น {{ plan.floor ?? plan.planKey }}
          <!-- จำนวนของในหน้านี้ที่อยู่ชั้นนั้น - บอกว่ากดแท็บไหนแล้วจะเจออะไร -->
          <span v-if="countOnPlan(plan.planKey)" class="badge badge-xs badge-primary">
            {{ countOnPlan(plan.planKey) }}
          </span>
        </button>
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- ═══ ซ้าย: ทะเบียน ═══ -->
      <div class="flex min-h-0 flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="input input-sm flex min-w-[10rem] flex-1 items-center gap-2">
            <Icon icon="lucide:search" class="size-4 shrink-0 opacity-60" />
            <input
              v-model="searchText"
              type="search"
              class="grow"
              placeholder="เลขสินทรัพย์ / รายละเอียด / เลขเครื่อง"
            />
            <!-- ตัวหมุนอยู่ในช่องค้น ไม่ใช่ทับทั้งลิสต์ - ผลเดิมยังอ่านได้ระหว่างรอของใหม่ -->
            <span v-if="loading" class="loading loading-spinner loading-xs shrink-0" />
          </label>

          <!-- ── แผงตัวกรอง (รูปเดียวกับหน้า Asset Inventory) ─────────────── -->
          <div ref="panelRef" class="relative">
            <button
              type="button"
              class="btn btn-sm"
              :class="hasFilter ? 'btn-primary' : 'btn'"
              :aria-expanded="panelOpen"
              @click="panelOpen = !panelOpen"
            >
              <Icon icon="lucide:sliders-horizontal" class="size-4" />
              ตัวกรอง
              <span v-if="hasFilter" class="badge badge-xs badge-neutral">
                {{ activeFilterChips.length }}
              </span>
              <Icon
                icon="lucide:chevron-down"
                class="size-4 transition-transform"
                :class="{ 'rotate-180': panelOpen }"
              />
            </button>

            <!-- right-0 ไม่ใช่ left-0 ต่างจากหน้าทะเบียน - ปุ่มนี้อยู่ชิดขวาของคอลัมน์ที่
                 กว้างครึ่งจอ กางไปทางซ้ายจะไม่ล้นออกนอกคอลัมน์ -->
            <div
              v-if="panelOpen"
              class="absolute right-0 z-30 mt-2 w-72 rounded-box border border-base-300 bg-base-100 shadow-lg"
            >
              <div class="flex items-center justify-between border-b border-base-300 px-3 py-2">
                <span class="text-sm font-semibold">ตัวกรอง</span>
                <button class="btn btn-ghost btn-xs" :disabled="!hasFilter" @click="clearFilters">
                  ล้างทั้งหมด
                </button>
              </div>

              <div class="max-h-96 overflow-y-auto p-1.5">
                <div v-for="f in FILTER_FIELDS" :key="f.key" class="rounded-btn">
                  <!-- หัวข้อ: กดแล้วกาง/หุบ ตัวที่กรองอยู่มี badge กับปุ่ม × ให้ปลดได้จากตรงนี้
                       ★ "แผนก" กดไม่ได้จนกว่าจะเลือกบริษัท - แผนกเป็นของบริษัท ไม่ใช่ของทั้งเครือ
                         (ดู departmentLocked) กางออกมาก็ไม่มีอะไรให้เลือกอยู่ดี -->
                  <div
                    class="flex w-full items-center gap-2 rounded-btn px-2 py-2"
                    :class="
                      f.key === 'department' && departmentLocked
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer hover:bg-base-200'
                    "
                    @click="
                      f.key === 'department' && departmentLocked
                        ? null
                        : (expandedField = expandedField === f.key ? '' : f.key)
                    "
                  >
                    <Icon :icon="f.icon" class="size-4 shrink-0 opacity-60" />
                    <span class="flex-1 text-left text-sm">{{ f.label }}</span>

                    <span
                      v-if="filterHasValue(f.key)"
                      class="badge badge-sm badge-primary gap-1 pr-1"
                      @click.stop="clearField(f.key)"
                    >
                      1
                      <Icon icon="lucide:x" class="size-3" />
                    </span>

                    <Icon
                      v-if="f.key === 'department' && departmentLocked"
                      icon="lucide:lock"
                      class="size-3.5 shrink-0 opacity-60"
                    />
                    <Icon
                      v-else
                      icon="lucide:chevron-down"
                      class="size-4 shrink-0 opacity-50 transition-transform"
                      :class="{ 'rotate-180': expandedField === f.key }"
                    />
                  </div>

                  <!-- บอกเงื่อนไขตรง ๆ ตรงที่ผู้ใช้กำลังกด ไม่ใช่ปล่อยให้เจอแถวจาง ๆ ที่กดไม่ติด
                       แล้วเดาเองว่าระบบเสียหรือสิทธิ์ไม่ถึง -->
                  <p
                    v-if="f.key === 'department' && departmentLocked"
                    class="px-2 pb-2 pl-8 text-left text-xs text-base-content/50"
                  >
                    เลือกบริษัทก่อนจึงจะเลือกแผนกได้
                  </p>

                  <!-- ค่าที่เลือกไว้ โชว์ใต้หัวข้อตอนหุบ จะได้รู้ว่ากรองด้วยอะไรโดยไม่ต้องกางดู -->
                  <p
                    v-else-if="filterHasValue(f.key) && expandedField !== f.key"
                    class="px-2 pb-2 pl-8 text-left text-xs text-base-content/60"
                  >
                    {{ fieldValueLabel(f.key) }}
                  </p>

                  <div v-if="expandedField === f.key" class="px-2 pb-2">
                    <ul v-if="f.key === 'company'">
                      <li v-for="c in companies" :key="c.code">
                        <button
                          class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                          :class="{ 'bg-primary/10 font-medium': companyCode === c.code }"
                          @click="toggleValue('company', c.code)"
                        >
                          <Icon
                            :icon="companyCode === c.code ? 'lucide:check' : 'lucide:minus'"
                            class="size-3.5 shrink-0"
                            :class="companyCode === c.code ? 'text-primary' : 'opacity-0'"
                          />
                          {{ c.name }}
                        </button>
                      </li>
                      <li v-if="!companies.length" class="px-2 py-2 text-xs text-base-content/50">
                        โหลดรายชื่อบริษัทไม่สำเร็จ
                      </li>
                    </ul>

                    <template v-else-if="f.key === 'department'">
                      <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                        <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                        <input v-model="departmentSearch" type="search" class="grow" placeholder="ค้นแผนก" />
                      </label>
                      <ul class="max-h-44 overflow-y-auto">
                        <li v-for="d in filteredDepartments" :key="d.id">
                          <button
                            class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                            :class="{ 'bg-primary/10 font-medium': departmentId === String(d.id) }"
                            @click="toggleValue('department', String(d.id))"
                          >
                            <Icon
                              :icon="departmentId === String(d.id) ? 'lucide:check' : 'lucide:minus'"
                              class="size-3.5 shrink-0"
                              :class="departmentId === String(d.id) ? 'text-primary' : 'opacity-0'"
                            />
                            <!-- ไม่ต้องมี badge รหัสบริษัทท้ายชื่อแล้ว - ลิสต์นี้เปิดได้ก็ต่อเมื่อ
                                 เลือกบริษัทไว้แล้ว ทุกแถวจึงเป็นของบริษัทเดียวกันทั้งหมด -->
                            <span class="truncate">{{ d.name }}</span>
                          </button>
                        </li>
                        <li v-if="!filteredDepartments.length" class="px-2 py-2 text-xs text-base-content/50">
                          ไม่พบแผนกที่ตรงกับคำค้น
                        </li>
                      </ul>
                    </template>

                    <ul v-else-if="f.key === 'status'">
                      <li v-for="s in STATUS_OPTIONS" :key="s.value">
                        <button
                          class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                          :class="{ 'bg-primary/10 font-medium': status === s.value }"
                          @click="toggleValue('status', s.value)"
                        >
                          <Icon
                            :icon="status === s.value ? 'lucide:check' : 'lucide:minus'"
                            class="size-3.5 shrink-0"
                            :class="status === s.value ? 'text-primary' : 'opacity-0'"
                          />
                          {{ s.label }}
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ตัวกรองที่ใช้อยู่ - เห็นได้โดยไม่ต้องเปิดแผง กดที่ตัวไหนก็ปลดตัวนั้น -->
        <div v-if="hasFilter" class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="chip in activeFilterChips"
            :key="chip.key"
            class="badge badge-sm badge-ghost gap-1 pr-1"
            @click="chip.clear()"
          >
            {{ chip.label }}
            <Icon icon="lucide:x" class="size-3" />
          </button>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <!-- ปุ่มนี้คือสิ่งที่กันไม่ให้หน้านี้ดูเหมือนพัง ดูเหตุผลข้อ 1 ที่หัวไฟล์ -->
          <label class="label cursor-pointer gap-2 py-0">
            <input v-model="locatedOnly" type="checkbox" class="toggle toggle-sm toggle-primary" />
            <span class="label-text text-sm">เฉพาะชิ้นที่ระบุที่ตั้งแล้ว</span>
          </label>

          <span v-if="!loading" class="text-sm text-base-content/60">พบ {{ total }} ชิ้น</span>
        </div>

        <!-- ── สุ่มรายการตรวจ ────────────────────────────────────────────────
             ขั้นแรกของ flow ตรวจนับ: สุ่มที่นี่ → เดินไปสแกน QR ที่ตัวเครื่อง → เจอตรงก็จบ
             ไม่มีอะไรบันทึกกลับเข้าระบบ ปุ่มนี้จึงเป็นแค่ตัวออกรายการให้เดินไปดู -->
        <div class="flex flex-wrap items-center gap-2 rounded-box bg-base-200/60 px-3 py-2">
          <Icon icon="lucide:dice-5" class="size-4 shrink-0 opacity-60" />
          <span class="text-sm">สุ่มรายการตรวจ</span>

          <select v-model.number="sampleSize" class="select select-xs w-20" :disabled="loading">
            <option v-for="n in SAMPLE_OPTIONS" :key="n" :value="n">{{ n }} ชิ้น</option>
          </select>

          <button type="button" class="btn btn-primary btn-xs" :disabled="loading" @click="drawRandom">
            {{ randomMode ? 'สุ่มใหม่' : 'สุ่ม' }}
          </button>

          <button v-if="randomMode" type="button" class="btn btn-ghost btn-sm" @click="exitRandom">
            <Icon icon="lucide:x" class="size-4" />
            ออกจากโหมดสุ่ม
          </button>

          <!-- บอกให้ชัดว่ากำลังดูของที่สุ่มมา ไม่ใช่ทะเบียนทั้งกอง - ไม่งั้นคนกดสุ่มแล้ว
               เห็นลิสต์สั้นลงจะนึกว่าตัวกรองพัง -->
          <span v-if="randomMode && !loading" class="ml-auto text-sm text-base-content/60">
            สุ่มมา {{ items.length }} จาก {{ total }} ชิ้นที่ตรงเงื่อนไข
          </span>
        </div>

        <div v-if="loadError" role="alert" class="alert alert-error alert-soft">
          <span class="text-sm">{{ loadError }}</span>
        </div>

        <!-- มือถือ: ปล่อยสูงตามเนื้อหา ไม่ต้องมีกล่องเลื่อนซ้อนในหน้าที่เลื่อนได้อยู่แล้ว
             lg: กลับเป็นกล่องเลื่อนของตัวเองเหมือนเดิม (สองคอลัมน์ต้องเลื่อนแยกกัน) -->
        <div ref="listScroller" class="pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <AuditAssetList
            :items="items"
            :loading="loading"
            :selected-id="selectedId"
            @select="onSelect"
            @detail="onDetail"
          />
        </div>

        <!-- โหมดสุ่มไม่มีเลขหน้า - การสุ่มเกิดใหม่ทุกคำขอ หน้า 2 จึงไม่ใช่ "ส่วนที่เหลือ
             ของหน้า 1" แต่เป็นชุดใหม่ที่ซ้ำกับหน้า 1 ได้ กดสุ่มใหม่แทนถ้าอยากได้ชุดอื่น -->
        <AppPagination
          v-if="!randomMode"
          :page="page"
          :total="total"
          :limit="limit"
          @update:page="onPageChange"
        />
      </div>

      <!-- ═══ ขวา: ผังชั้น ═══ -->
      <div class="flex min-h-0 flex-col gap-2">
        <div v-if="locateNote" role="status" class="alert alert-soft py-2" :class="locateNote.cls">
          <Icon :icon="locateNote.icon" class="size-4 shrink-0" />
          <span class="text-sm">{{ locateNote.text }}</span>
        </div>

        <!-- ★ ข้อความต่างกันตามจอ ไม่ใช่แค่เรื่องความยาว - บนมือถือ grid ยุบเหลือคอลัมน์เดียว
             ลิสต์จึงอยู่ "ด้านบน" ไม่ใช่ "ทางซ้าย" คำเดิมจึงชี้ผิดทิศบนมือถือ
             และคำที่สั้นลงยังพอดีบรรทัดเดียวที่ 390px แทนที่จะตัดเป็นสองบรรทัด -->
        <div
          v-else
          class="rounded-box border border-dashed border-base-300 px-3 py-2 text-center text-sm text-base-content/60"
        >
          <span class="lg:hidden">เลือกรายการด้านบนเพื่อดูตำแหน่ง</span>
          <span class="hidden lg:inline">คลิกรายการทางซ้ายเพื่อดูตำแหน่งบนผัง</span>
        </div>

        <div v-if="planError" role="alert" class="alert alert-error flex-1">
          <span>{{ planError }}</span>
        </div>

        <div v-else class="h-[55dvh] min-h-[18rem] lg:h-auto lg:min-h-[20rem] lg:flex-1">
          <FloorPlanMap
            v-if="activePlan"
            :src="planSrc"
            :rooms="activePlan.rooms"
            :selected-id="mapSelectedRoomId"
            :asset-pins="assetPins"
            :active-pin-id="activePinId"
            @select-asset="onPinSelect"
          />
          <div v-else class="grid h-full place-items-center">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- ตัวเดียวกับหน้าทะเบียน/My asset - ยิง /assets/by-number เอารายละเอียดเต็มมาเอง

         ★ **ไม่ส่ง editable-location โดยตั้งใจ** - อย่าเติมให้ "ครบเหมือนหน้าอื่น"
           หน้านี้เปิดกล่องดูได้เหมือนกันทุกหน้า แต่ห้ามแก้ทะเบียนจากตรงนี้: คนเดินตรวจนับ
           กำลังตอบคำถามว่า "ของอยู่ตรงที่ทะเบียนบอกไหม" ถ้าแก้ทะเบียนได้กลางคัน คำตอบ
           จะกลายเป็นใช่เสมอโดยไม่มีร่องรอยว่าเคยไม่ตรง - ของที่ผิดต้องถูกบันทึกว่าผิดก่อน
           แล้วค่อยไปแก้ที่หน้าทะเบียน/แผนผัง ซึ่งเปิดปุ่มนั้นไว้ให้แล้ว -->
    <AssetDetailModal v-model="detailOpen" :item="detailItem" />
  </div>
</template>
