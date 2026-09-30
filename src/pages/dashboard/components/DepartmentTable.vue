<script setup lang="ts">
// ตารางสินทรัพย์ของแผนกที่กำลังเลือกอยู่บน Dashboard - "แผนกนี้มีของชิ้นไหน ใครครอบครอง"
//
// ── ต่างจากหน้า Asset Inventory ตรงไหน ────────────────────────────────────────
//
// 1. **ไม่มีช่องเลือกแผนกของตัวเอง** - แผนกมาจาก prop ซึ่งผูกกับช่องเลือกของ Dashboard
//    ที่ backend ล็อกตาม role ไว้แล้ว ถ้าใส่ช่องเลือกซ้ำจะได้ช่อง "แผนก" สองช่องบนหน้า
//    เดียวกันที่ทำงานคนละกฎ (ช่องบนล็อก ช่องล่างไม่ล็อก) - อธิบายให้ผู้ใช้เข้าใจไม่ได้เลย
//
// 2. **หน้าละ 10 ไม่ใช่ 20** - ตารางนี้อยู่ท้าย Dashboard ที่มีการ์ดกับกราฟอยู่เหนือมัน
//    ยาวอยู่แล้ว ไม่ใช่หน้าที่เปิดมาเพื่อไล่อ่านทะเบียนทั้งบริษัท
//
// 3. **ชื่อแผนกรับมาเป็น prop ไม่ derive เอง** - Dashboard อ่านชื่อจาก scope ที่ backend
//    ตอบกลับมา (ไม่ใช่จาก id ที่ส่งไป) ที่นี่ต้องใช้ชื่อเดียวกันนั้น ไม่งั้นวันที่ backend
//    ทิ้งค่าที่ส่งไป หัวตารางจะเขียนชื่อแผนกหนึ่งทับรายการของอีกแผนกหนึ่ง
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AssetDetailModal from '@/shared/components/AssetDetailModal.vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import AssetTable from '@/shared/components/AssetTable.vue'
import { getAssetInventory } from '@/shared/services/asset.service'
import type { InventoryItem, InventoryParams } from '@/shared/services/asset.service'
import {
  listAssetClasses,
  listAssetNumberDepts,
  listAssetNumberYears,
  listAssetPrefixes,
  listEmployees,
  listLocations,
  type AssetClassOption,
  type AssetNumberDeptOption,
  type AssetNumberYearOption,
  type AssetPrefixOption,
  type EmployeeOption,
  type LocationOption,
} from '@/shared/services/master.service'
import { locationLabel, locationsForCompany } from '@/shared/utils/location'
import { ApiError } from '@/shared/services/httpClient'
import { ASSET_STATUS_OPTIONS, assetStatusLabel } from '@/shared/utils/asset-status'
import { ASSET_SORT_OPTIONS } from '@/shared/utils/asset-sort'
import AppSortMenu from '@/shared/components/AppSortMenu.vue'
import type { SortDirection } from '@/shared/components/AppSortMenu.vue'

const props = defineProps<{
  /**
   * id ของศูนย์ต้นทุนที่เลือกบน Dashboard - '' = ทุกศูนย์ต้นทุน (ตรงกับ scope.departmentId === null)
   *
   * ★ ชื่อ prop ต้องบอกแกนให้ตรง (0027) - ค่ายังเป็น `department.id` เหมือนเดิมเพราะ
   *   ตาราง department ทำหน้าที่เป็นทั้งผังแผนกและผังศูนย์ต้นทุน แต่ **ปลายทางที่มันไปกรอง
   *   คือ asset.costCenterId** ไม่ใช่ asset.departmentId
   *   เดิมชื่อ departmentId แล้วส่งไปกรอง asset.departmentId ซึ่งเป็น NULL ทั้งทะเบียน
   *   ผลคือกดแผนกที่ตารางสรุปบอกว่ามีของ แล้วได้รายการว่าง
   */
  costCenterId: string
  /** ชื่อที่จะขึ้นหัวตาราง มาจาก scope ของ backend */
  departmentName?: string
  /**
   * รหัสบริษัทที่เลือกบน Dashboard - '' = ทุกบริษัท
   *
   * ★ ต้องส่งต่อลง API ด้วย ไม่ใช่แค่โชว์ในหัวตาราง ไม่งั้นการ์ดสรุปข้างบนจะบอกยอดของ
   *   UBP แต่ตารางข้างล่างไล่ของ UBA มาให้ดู ซึ่งอ่านเป็นข้อมูลไม่ตรงกันทันที
   */
  companyCode?: string
  companyName?: string | null
}>()

const items = ref<InventoryItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadError = ref('')

const LIMIT = 10

/** ข้อความในช่องค้นหา - ยังไม่ใช่คำที่ยิงไปจริง (ดู debounce ข้างล่าง) */
const searchText = ref('')

// ── ตัวกรอง: ที่ตั้ง / ผู้ครอบครอง / สถานะ / Asset class / สามท่อนเลขสินทรัพย์ ──
//
// รูปแบบเดียวกับหน้า Asset Inventory และ Audit: dropdown แผงเดียวที่กางหัวข้อแล้วเลือก
// ค่าได้ในตัวเอง + แถบ chip ใต้แถบเครื่องมือบอกว่าตอนนี้ตารางถูกจำกัดด้วยอะไรอยู่บ้าง
// (สามหน้านี้เป็นตารางทะเบียนเหมือนกันและเป็นคนกลุ่มเดียวกันที่สลับไปมา ถ้าตัวกรองคนละแบบ
//  ต้องเรียนรู้ใหม่ทุกหน้าโดยไม่ได้อะไรเพิ่ม)
//
// **ไม่มีแกน "แผนก" และ "บริษัท"** โดยตั้งใจ - สองอย่างนั้นมาจากช่องเลือกด้านบนของ
// Dashboard ซึ่ง backend ล็อกตาม role ไว้แล้ว (เหตุผลเต็มอยู่ที่หัวไฟล์ข้อ 1)
//
// เก็บที่ตั้ง/สถานะเป็น string เพราะค่าที่กดมาจาก DOM - แปลงเป็นเลขตอนยิงที่เดียวใน load()
const locationId = ref('')
const status = ref('')
/** '' = เรียงตามเลขสินทรัพย์ (ค่าตั้งต้นของ backend) - ดู ASSET_SORT_OPTIONS */
const sort = ref('')
/** มีผลเมื่อเลือก sort แล้วเท่านั้น - ค่าตั้งต้นคือมาก/ใหม่ก่อน */
const sortDir = ref<SortDirection>('desc')
/** ผู้ครอบครอง - เก็บชื่อคู่กับ id เพราะ chip กับป้ายใต้หัวข้อต้องใช้ชื่อ ไม่ใช่เลข */
const employeeId = ref(0)
const employeeName = ref('')
/** รหัสหมวด = ท่อน 1 ของรหัสบัญชี เช่น '1216301' - แกนเดียวกับหน้า Asset Inventory */
const assetClass = ref('')
/**
 * สามท่อนแรกของเลขสินทรัพย์ COM-775-26-001 → รหัสนำหน้า / Dept ID / ปี
 * ★ ความหมายเหมือนหน้า Asset Inventory ทุกข้อ (ดู AssetInventoryPage.vue) - Dept ID กับปี
 *   คือค่าที่ฝังในเลขตอนออกเลข ไม่ใช่ศูนย์ต้นทุนที่เลือกบน Dashboard และไม่ใช่ปีบัญชี
 */
const assetPrefix = ref('')
const assetNumberDept = ref('')
const assetNumberYear = ref('')

// ลำดับและป้ายตรงกับหน้า Asset Inventory - สองตารางนี้คนกลุ่มเดียวกันสลับไปมา
const FILTER_FIELDS = [
  { key: 'location', label: 'ที่ตั้ง', icon: 'lucide:map-pin' },
  { key: 'holder', label: 'ผู้ครอบครอง', icon: 'lucide:user' },
  { key: 'status', label: 'สถานะ', icon: 'lucide:activity' },
  { key: 'assetClass', label: 'Asset class', icon: 'lucide:layers' },
  // ★ แถวนี้ไม่กาง/หุบ - สาม dropdown ในแถวเดียว (ดูเทมเพลต) ป้ายมีไว้ให้ช่องค้นหาตัวกรองหาเจอ
  { key: 'assetNumber', label: 'รหัสนำหน้า · Dept ID · ปี', icon: 'lucide:hash' },
]

const panelOpen = ref(false)
/** หัวข้อที่กางอยู่ - ทีละอันเดียว ('' = หุบหมด) */
const expandedField = ref('')
/** ค้น "หัวข้อตัวกรอง" ไม่ใช่ค้นข้อมูลในตาราง - สองช่องนี้ต้องเขียนป้ายให้ต่างกันชัด */
const filterSearch = ref('')

const visibleFields = computed(() => {
  const q = filterSearch.value.trim().toLowerCase()
  return q ? FILTER_FIELDS.filter((f) => f.label.toLowerCase().includes(q)) : FILTER_FIELDS
})

function filterHasValue(key: string): boolean {
  switch (key) {
    case 'location':
      return !!locationId.value
    case 'holder':
      return employeeId.value > 0
    case 'status':
      return !!status.value
    case 'assetClass':
      return !!assetClass.value
    default:
      return false
  }
}

function clearField(key: string) {
  if (key === 'location') locationId.value = ''
  else if (key === 'holder') clearEmployee()
  else if (key === 'status') status.value = ''
  else if (key === 'assetClass') assetClass.value = ''
}

/**
 * กดตัวเลือกเดิมซ้ำ = ปลดตัวกรองนั้น
 *
 * ในแผงไม่มีปุ่ม "ทั้งหมด" ให้กดเหมือนตอนเป็น <select> การกดซ้ำจึงเป็นทางเดียวที่ผู้ใช้
 * จะกลับไปสถานะ "ไม่กรอง" ได้จากในลิสต์ (นอกจากกด × บนหัวข้อ) - กติกาเดียวกับหน้าทะเบียน
 */
function toggleValue(key: string, value: string) {
  const target =
    key === 'location'
      ? locationId
      : key === 'status'
        ? status
        : key === 'assetClass'
          ? assetClass
          : null
  if (!target) return
  target.value = target.value === value ? '' : value
}

/** ค่าที่เลือกไว้ เป็นข้อความอ่านออก - โชว์ใต้หัวข้อตอนหุบ จะได้ไม่ต้องกางดู */
function fieldValueLabel(key: string): string {
  switch (key) {
    case 'location': {
      const loc = locations.value.find((l) => String(l.id) === locationId.value)
      return loc ? locationLabel(loc, locations.value) : locationId.value
    }
    case 'holder':
      return employeeName.value || `รหัส ${employeeId.value}`
    case 'status':
      return assetStatusLabel(status.value)
    case 'assetClass':
      return assetClassLabel(assetClass.value)
    default:
      return ''
  }
}

// ── Asset class + สามท่อนเลขสินทรัพย์: ลิสต์ตัวเลือกจากทะเบียน แคบตามขอบเขตของ Dashboard ──
//
// ★ ส่งทั้งบริษัทและศูนย์ต้นทุนไป - ตารางนี้ถูกจำกัดด้วยทั้งสองแกน ถ้าลิสต์ไม่แคบตาม ตัวเลือก
//   จะมีค่าที่ศูนย์นี้ไม่มีของ (กดแล้วตารางว่าง) และจำนวนชิ้นในวงเล็บเป็นของทั้งบริษัท
//   ซึ่งขัดกับตารางที่อยู่ข้างล่าง (ต่างจากหน้า Asset Inventory ที่ไม่มีแกนศูนย์ต้นทุนมาจากข้างนอก)
//
// ★ โหลดตอนเปิดแผงเท่านั้น ไม่ใช่ทุกครั้งที่เปลี่ยนศูนย์ต้นทุน - Dashboard เป็นหน้าแรกของทุกคน
//   และคนส่วนใหญ่ไม่ได้เปิดตัวกรอง (หลักเดียวกับรายชื่อผู้ครอบครอง)
const assetClasses = ref<AssetClassOption[]>([])
const assetPrefixes = ref<AssetPrefixOption[]>([])
const assetNumberDepts = ref<AssetNumberDeptOption[]>([])
const assetNumberYears = ref<AssetNumberYearOption[]>([])
/** ขอบเขตที่ลิสต์ชุดปัจจุบันโหลดมา - '' = ยังไม่เคยโหลด/โหลดพัง (เปิดแผงครั้งหน้าจะลองใหม่) */
let assetOptionsKey = ''

function loadAssetOptions() {
  const key = `${props.companyCode ?? ''}|${props.costCenterId}`
  if (key === assetOptionsKey) return
  assetOptionsKey = key
  const params = {
    companyCode: props.companyCode || undefined,
    costCenterId: props.costCenterId ? Number(props.costCenterId) : undefined,
  }
  // ผลที่มาช้ากว่าการเปลี่ยนขอบเขตรอบถัดไปต้องทิ้ง ไม่งั้นลิสต์ของศูนย์เก่ามาทับของศูนย์ใหม่
  const fresh = () => key === assetOptionsKey
  const failed = () => {
    if (fresh()) assetOptionsKey = ''
  }
  void listAssetClasses(params)
    .then((rows) => fresh() && (assetClasses.value = rows))
    .catch(failed)
  void listAssetPrefixes(params)
    .then((rows) => fresh() && (assetPrefixes.value = rows))
    .catch(failed)
  void listAssetNumberDepts(params)
    .then((rows) => fresh() && (assetNumberDepts.value = rows))
    .catch(failed)
  void listAssetNumberYears(params)
    .then((rows) => fresh() && (assetNumberYears.value = rows))
    .catch(failed)
}

const assetClassSearch = ref('')

/** ชื่อยังไม่มีก็ใช้รหัสไปก่อน - กติกาเดียวกับหน้า Asset Inventory / Asset summary */
const assetClassOptions = computed(() =>
  assetClasses.value.map((c) => ({ code: c.code, label: c.name ?? c.code })),
)

const filteredAssetClasses = computed(() => {
  const q = assetClassSearch.value.trim().toLowerCase()
  if (!q) return assetClassOptions.value
  return assetClassOptions.value.filter(
    (o) => o.code.includes(q) || o.label.toLowerCase().includes(q),
  )
})

/** '<รหัส> · <ชื่อ>' เหมือนหน้า Asset Inventory - หาไม่เจอในลิสต์ (ยังไม่โหลด) ใช้รหัสแทน */
function assetClassLabel(code: string): string {
  if (!code) return ''
  const label = assetClassOptions.value.find((o) => o.code === code)?.label ?? code
  return `${code} · ${label}`
}

// ── ที่ตั้ง: โหลดครบทีเดียวแล้วกรองในเครื่อง (มีไม่กี่สิบแถว) ─────────────────
const locations = ref<LocationOption[]>([])
/** โหลดไม่สำเร็จ - บอกในลิสต์ตรงนั้น ไม่ยัดลง loadError ซึ่งเป็นช่องของ "ตารางโหลดไม่ขึ้น" */
const locationsFailed = ref(false)
const locationSearch = ref('')

/**
 * ที่ตั้งของบริษัทที่ Dashboard เลือกอยู่ + แถวใช้ร่วม - '' (ทุกบริษัท) = ทั้งเครือ (0037)
 * ชื่อที่ซ้ำกันข้ามบริษัทแปะรหัสบริษัท (locationLabel) - เหตุผลเดียวกับหน้าทะเบียน
 */
const companyLocations = computed(() => locationsForCompany(locations.value, props.companyCode))

const filteredLocations = computed(() => {
  const q = locationSearch.value.trim().toLowerCase()
  return q
    ? companyLocations.value.filter((l) => l.name.toLowerCase().includes(q))
    : companyLocations.value
})

onMounted(async () => {
  try {
    locations.value = await listLocations()
  } catch {
    locationsFailed.value = true
  }
})

// ── ผู้ครอบครอง: ค้นที่ฝั่ง server ไม่ใช่โหลดมาทั้งหมดแล้วกรองในเครื่อง ───────
//
// ต่างจากที่ตั้งเพราะพนักงานมีหลักร้อยและโตตามบริษัทที่เพิ่มเข้ามา - ใช้กติกาเดียวกับ
// AppEmployeeSelect: ขอทีละ 8 แถวแล้วบอกว่ายังเหลืออีกกี่คน ให้ผู้ใช้พิมพ์ค้นให้แคบลงเอง
//
// ★ ผูก companyCode ของ Dashboard เข้าไปด้วย แต่ **ไม่ผูก departmentId** - สองแกนนี้
//   ตอบคนละคำถามและมีคำตอบต่างกัน:
//
//     แผนก   : ของแผนกหนึ่งอยู่ในมือคนอีกแผนกได้เป็นเรื่องปกติ (ยืมข้ามแผนก/ช่างดูแล)
//              กรองตามแผนกไว้แล้วคนที่ถือของอยู่จริงจะหายจากลิสต์จนเลือกไม่ได้
//     บริษัท : เป็นขอบเขตชั้นนอกที่ทั้งหน้าถูกจำกัดไว้แล้ว ลิสต์ที่เทชื่อคนทั้งเครือลงมา
//              (649 คน) ทำให้คนกดต้องเดาว่าชื่อไหนเป็นของบริษัทที่กำลังดูอยู่ ทั้งที่
//              ตารางข้างล่างมีแต่ของบริษัทเดียว
//
// ★ '' (ทุกบริษัท) = ไม่ส่ง companyCode ไป ลิสต์กลับไปเป็นทั้งเครือตามเดิม ซึ่งถูก -
//   ตอนนั้นตารางก็ไล่ของทั้งเครืออยู่เหมือนกัน
const EMPLOYEE_LIMIT = 8
const employeeSearch = ref('')
const employees = ref<EmployeeOption[]>([])
const employeeTotal = ref(0)
const employeesLoading = ref(false)
const employeesFailed = ref(false)
let employeesLoaded = false
let employeeTimer: ReturnType<typeof setTimeout> | undefined
let employeeSeq = 0

/**
 * "แสดง 8 จาก 396 คน" - ต้องบอกทั้งสองตัวเลข ไม่ใช่แค่ "เหลืออีก N คน"
 *
 * ลิสต์ขอมาทีละ 8 แถว (ดู EMPLOYEE_LIMIT) คนที่เปิดมาเห็น 8 ชื่อโดยไม่มีอะไรกำกับจะอ่านว่า
 * "บริษัทนี้มีพนักงานแค่นี้" แล้วสรุปว่าคนที่หาไม่เจอไม่มีในระบบ - ทั้งที่ต้องพิมพ์ค้น
 *
 * ★ ตัวหารคือ total ของ "ชุดที่กรองแล้ว" ไม่ใช่พนักงานทั้งหมด - พิมพ์ค้นแล้วเลขนี้ต้องลดลง
 *   ตาม ไม่งั้นมันจะขัดกับลิสต์ที่เห็นอยู่ตรงหน้า
 */
const employeeRangeLabel = computed(() =>
  employeeTotal.value === 0
    ? ''
    : `แสดง ${employees.value.length} จาก ${employeeTotal.value.toLocaleString('th-TH')} คน`,
)

async function loadEmployees() {
  const seq = ++employeeSeq
  employeesLoading.value = true
  employeesFailed.value = false
  try {
    const res = await listEmployees({
      search: employeeSearch.value.trim() || undefined,
      companyCode: props.companyCode || undefined,
      page: 1,
      limit: EMPLOYEE_LIMIT,
    })
    // มีคำขอใหม่กว่าเกิดขึ้นระหว่างรอ - ทิ้งผลนี้ ไม่งั้นผลเก่ามาทับผลใหม่
    if (seq !== employeeSeq) return
    employees.value = res.data
    employeeTotal.value = res.total
    employeesLoaded = true
  } catch {
    if (seq !== employeeSeq) return
    employees.value = []
    employeeTotal.value = 0
    employeesFailed.value = true
  } finally {
    if (seq === employeeSeq) employeesLoading.value = false
  }
}

watch(employeeSearch, () => {
  clearTimeout(employeeTimer)
  employeeTimer = setTimeout(loadEmployees, 300)
})

// โหลดตอนกางหัวข้อครั้งแรกเท่านั้น - ไม่งั้น Dashboard เปิดทีไรก็ยิงขอรายชื่อพนักงาน
// ทิ้งเปล่า ๆ ทั้งที่คนส่วนใหญ่ไม่ได้กรองด้วยผู้ครอบครอง
watch(expandedField, (key) => {
  if (key === 'holder' && !employeesLoaded) void loadEmployees()
})

function toggleEmployee(emp: EmployeeOption) {
  if (employeeId.value === emp.id) {
    clearEmployee()
    return
  }
  employeeId.value = emp.id
  employeeName.value = emp.name
}

function clearEmployee() {
  employeeId.value = 0
  employeeName.value = ''
}

/**
 * ตัวกรองที่ใช้อยู่ตอนนี้ - แสดงเป็น chip ให้เห็นครบในบรรทัดเดียว
 *
 * ★ จำเป็นเพราะแผงโชว์ได้ทีละแกน ถ้าไม่มีบรรทัดนี้ คนที่กรองไว้สามแกนจะเห็นแค่แกนล่าสุด
 *   แล้วไม่รู้ว่าอีกสองตัวยังบีบผลลัพธ์อยู่
 *
 * นับคำค้นรวมด้วยทั้งที่ช่องค้นอยู่คนละที่ - คำถามที่บรรทัดนี้ตอบคือ "ตอนนี้ตารางถูกจำกัด
 * ด้วยอะไรอยู่บ้าง" ซึ่งคำค้นก็เป็นหนึ่งในนั้น (กติกาเดียวกับหน้าทะเบียน)
 */
const activeFilterChips = computed(() => {
  const chips: { key: string; label: string; clear: () => void }[] = []

  const search = searchText.value.trim()
  if (search) {
    chips.push({ key: 'search', label: `ค้น: ${search}`, clear: () => (searchText.value = '') })
  }
  if (locationId.value) {
    chips.push({
      key: 'loc',
      label: `ที่ตั้ง: ${fieldValueLabel('location')}`,
      clear: () => (locationId.value = ''),
    })
  }
  if (employeeId.value > 0) {
    chips.push({
      key: 'holder',
      label: `ผู้ครอบครอง: ${fieldValueLabel('holder')}`,
      clear: clearEmployee,
    })
  }
  if (status.value) {
    chips.push({
      key: 'status',
      label: `สถานะ: ${assetStatusLabel(status.value)}`,
      clear: () => (status.value = ''),
    })
  }
  // ป้ายสี่ตัวข้างล่างเขียนแบบเดียวกับ chip ของหน้า Asset Inventory
  if (assetClass.value) {
    chips.push({
      key: 'class',
      label: `Asset class: ${assetClassLabel(assetClass.value)}`,
      clear: () => (assetClass.value = ''),
    })
  }
  if (assetPrefix.value) {
    chips.push({
      key: 'prefix',
      label: `รหัสนำหน้า: ${assetPrefix.value}`,
      clear: () => (assetPrefix.value = ''),
    })
  }
  if (assetNumberDept.value) {
    chips.push({
      key: 'numberDept',
      label: `Dept ID: ${assetNumberDept.value}`,
      clear: () => (assetNumberDept.value = ''),
    })
  }
  if (assetNumberYear.value) {
    chips.push({
      key: 'numberYear',
      label: `ปี: ${assetNumberYear.value}`,
      clear: () => (assetNumberYear.value = ''),
    })
  }

  return chips
})

const hasFilter = computed(() => activeFilterChips.value.length > 0)

/** ล้างทุกอย่างรวมคำค้น - ปุ่มในแผงกับในกล่อง "ไม่พบรายการ" ใช้ตัวเดียวกัน */
function clearFilters() {
  searchText.value = ''
  locationId.value = ''
  status.value = ''
  clearEmployee()
  assetClass.value = ''
  assetPrefix.value = ''
  assetNumberDept.value = ''
  assetNumberYear.value = ''
}

// ── ปิดแผงเมื่อคลิกนอกแผง / กด Escape ────────────────────────────────────────
// ไม่ปิดตอนคลิกในแผง ไม่งั้นกดเลือกค่าทีเดียวแผงหุบทุกครั้ง (กติกาเดียวกับหน้าทะเบียน)
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
    loadAssetOptions()
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onPanelKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onPanelKeydown)
  }
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAssetInventory({
      page: page.value,
      limit: LIMIT,
      search: searchText.value,
      // ★ costCenterId ไม่ใช่ departmentId (0027) - ต้องเป็นแกนเดียวกับที่ตารางสรุป
      //   ข้างบนใช้นับ ไม่งั้นกดแผนกที่ขึ้นว่ามี 116 ชิ้น แล้วได้รายการว่าง
      //   (เกิดมาแล้วตอนย้าย dashboard ไป costCenterId แล้วลืมจุดนี้ - asset.departmentId
      //    เป็น NULL ทั้งทะเบียนรอคนกรอกตอนตรวจนับ กรองด้วยตัวนั้นจึงได้ 0 เสมอ)
      costCenterId: props.costCenterId ? Number(props.costCenterId) : undefined,
      companyCode: props.companyCode || undefined,
      locationId: locationId.value ? Number(locationId.value) : undefined,
      // 0 = ยังไม่เลือก - ปล่อยเป็น undefined ไม่ใช่ส่ง 0 ไป (backend บังคับ minimum: 1)
      employeeId: employeeId.value || undefined,
      status: status.value || undefined,
      assetClass: assetClass.value || undefined,
      assetPrefix: assetPrefix.value || undefined,
      assetNumberDept: assetNumberDept.value || undefined,
      assetNumberYear: assetNumberYear.value || undefined,
      sort: (sort.value || undefined) as InventoryParams['sort'],
      sortDir: sortDir.value,
    })
    items.value = res.data
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการสินทรัพย์ไม่สำเร็จ'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * ★ ทุกทางที่เปลี่ยนเงื่อนไข ต้องรีเซ็ตกลับหน้า 1 เสมอ
 *
 * ค้างอยู่หน้า 4 แล้วสลับไปแผนกที่มีของ 6 ชิ้น จะได้ตารางว่างทั้งที่แผนกนั้นมีของ
 * และแถบเลขหน้าก็หายไปด้วย (เหลือหน้าเดียว) = ไม่มีปุ่มให้กดกลับ ผู้ใช้ติดอยู่ตรงนั้น
 *
 * ★★ เปลี่ยน "บริษัท" ต้องล้างรายชื่อผู้ครอบครองด้วย - ลิสต์ที่โหลดไว้เป็นของบริษัทก่อนหน้า
 *    ถ้าปล่อยไว้ ผู้ใช้จะเห็นชื่อคนของบริษัทเก่าค้างอยู่ในแผงของบริษัทใหม่
 *
 *    และถ้ามีคนถูกเลือกเป็นตัวกรองอยู่ ต้องปลดทิ้ง - เขาอาจไม่มีตัวตนในบริษัทใหม่เลย
 *    ผลคือตารางว่างพร้อม chip ที่เขียนชื่อคนซึ่งเลือกซ้ำจากในแผงไม่ได้อีก (หาไม่เจอ)
 *
 *    ★ ปลดแล้ว return ทันที ไม่ยิง load() ต่อ - การล้าง employeeId ไปทริก watch ของ
 *      ตัวกรองข้างล่างซึ่งยิง load() ให้อยู่แล้ว ยิงเองอีกรอบ = สอง request ที่ผลลัพธ์
 *      ของอันแรกเป็นของเงื่อนไขที่ถูกทิ้งไปแล้ว (บั๊กเดียวกับที่ Dashboard/Inventory
 *      เขียนเตือนไว้เรื่อง watch สองตัวในรอบ flush เดียว)
 */
watch(
  () => [props.costCenterId, props.companyCode],
  ([, company], prev) => {
    // แผงเปิดค้างอยู่ตอนขอบเขตเปลี่ยน = ต้องเห็นตัวเลือกของขอบเขตใหม่ทันที
    // (แผงปิดอยู่ไม่ต้องโหลด - loadAssetOptions เทียบขอบเขตเองตอนเปิดแผงครั้งหน้า)
    if (panelOpen.value) loadAssetOptions()
    if (prev !== undefined && company !== prev[1]) {
      employeesLoaded = false
      employees.value = []
      employeeTotal.value = 0
      // กางหัวข้อค้างอยู่ = ต้องเห็นชื่อชุดใหม่ทันที ไม่ใช่ลิสต์ว่างจนกว่าจะหุบแล้วกางใหม่
      if (expandedField.value === 'holder') void loadEmployees()
      // ★ Asset class ล้างตอนเปลี่ยนบริษัทเหมือนหน้า Asset Inventory - ส่วนสามท่อนเลข
      //   ไม่ล้างด้วยเหตุผลเดียวกับหน้านั้น (เป็นสตริงในเลข ความหมายเหมือนกันทุกบริษัท)
      assetClassSearch.value = ''
      if (employeeId.value || assetClass.value) {
        page.value = 1
        clearEmployee()
        assetClass.value = ''
        return
      }
    }
    page.value = 1
    void load()
  },
  { immediate: true },
)

// ตัวกรองยิงทันทีไม่ต้องหน่วง - เป็นการ "เลือก" ครั้งเดียวจบ ไม่ใช่การพิมพ์ทีละตัวอักษร
// (ต้องรีเซ็ตหน้าเหมือนกัน ไม่งั้นค้างอยู่หน้า 4 แล้วกรองจนเหลือ 6 ชิ้น = ตารางว่าง
//  และแถบเลขหน้าหายไปด้วย ผู้ใช้จะไม่มีปุ่มให้กดกลับ)
watch(
  [
    locationId,
    employeeId,
    status,
    assetClass,
    assetPrefix,
    assetNumberDept,
    assetNumberYear,
    sort,
    sortDir,
  ],
  () => {
    page.value = 1
    void load()
  },
)

// หน่วงก่อนยิงตอนพิมพ์ค้น - ไม่งั้นพิมพ์ 10 ตัวอักษรได้ 10 request
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void load()
  }, 350)
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  clearTimeout(employeeTimer)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onPanelKeydown)
})

/**
 * ★ ไม่เลื่อนจอ - ถอด scrollIntoView ออกแล้ว (2026-09-22) เหตุผลเดียวกับหน้าทะเบียน
 *
 * ตัวนี้เลื่อนไปหัวตาราง (ไม่ใช่หัวหน้า) ซึ่งเบากว่าของเดิมที่หน้าทะเบียนก็จริง
 * แต่ยังขยับจออยู่ดี แถบเลขหน้าอยู่ท้ายตารางจึงเลื่อนหนีจากใต้เมาส์เหมือนกัน
 */
function onPageChange(next: number) {
  page.value = next
  void load()
}

const heading = computed(() => {
  const scope = props.companyName ? ` · ${props.companyName}` : ''
  return `สินทรัพย์ของ${props.departmentName || 'ทุกแผนก'}${scope}`
})

/** ลำดับที่กำลังแสดง เช่น "11–20 จาก 143 ชิ้น" */
const range = computed(() => {
  if (total.value === 0) return ''
  const start = (page.value - 1) * LIMIT + 1
  return `${start}–${Math.min(start + LIMIT - 1, total.value)} จาก ${total.value.toLocaleString('th-TH')} ชิ้น`
})

// ── กดแถว = เปิด AssetDetailModal ไม่ใช่เด้งออกไปหน้ารายละเอียด ──────────────────────
//
// ตารางนี้อยู่ท้าย Dashboard ที่มีการ์ดกับกราฟอยู่เหนือมัน การเด้งออกไปแล้วกดกลับ
// ทำให้เสียทั้งแผนก/บริษัทที่เลือกไว้ คำค้น และหน้าที่อยู่ ต้องตั้งใหม่หมดทุกครั้ง
//
// AssetDetailModal เป็นตัวเดียวกับที่หน้าทะเบียนและ My asset ใช้ - ชิ้นเดียวกันต้องหน้าตา
// เหมือนกันทุกทางเข้า และ modal ไปดึงรายละเอียดเต็มจาก /assets/by-number เอง
//
// เส้น /assets/:company/:number ยังอยู่เหมือนเดิม - นั่นคือปลายทางของ QR บนสติกเกอร์
const selectedItem = ref<InventoryItem | null>(null)
const detailOpen = ref(false)

function openAsset(item: InventoryItem) {
  selectedItem.value = item
  detailOpen.value = true
}
</script>

<template>
  <section>
    <!-- ── แถบค้นหา/กรอง - โครงเดียวกับหน้า Asset Inventory และ Audit ──────────
         ต่างแค่ขนาด sm ทั้งแถบ เพราะตารางนี้อยู่ท้าย Dashboard ที่มีการ์ดกับกราฟอยู่เหนือมัน
         ไม่ใช่หน้าที่เปิดมาเพื่อค้นทะเบียนโดยเฉพาะ -->
    <div class="flex w-full flex-wrap items-center gap-2">

      <label class="form-control w-full max-w-xs text-left">
        <div class="input input-sm flex w-full items-center gap-2">
          <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
          <input
            v-model="searchText"
            type="search"
            class="grow"
            placeholder="เลขสินทรัพย์ / ชื่อของ / S/N"
          />
          <!-- ตัวหมุนอยู่ในช่องค้น ไม่ใช่ทับทั้งตาราง - ผลเดิมยังอ่านได้ระหว่างรอของใหม่ -->
          <span v-if="loading" class="loading loading-spinner loading-xs shrink-0"></span>
        </div>
      </label>

      <!-- ── แผงตัวกรอง ─────────────────────────────────────────────────────
           dropdown แผงเดียวที่เลือกค่าได้ในตัวเอง - กดหัวข้อแล้วกางออกในที่
           ไม่ใช่กดแล้วไปโผล่ช่องกรอกข้างนอกแผง -->
      <div ref="panelRef" class="relative">
        <button
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

        <div
          v-if="panelOpen"
          class="absolute left-0 z-30 mt-2 w-80 rounded-box border border-base-300 bg-base-100 text-left shadow-lg"
        >
          <div class="flex items-center justify-between border-b border-base-300 px-3 py-2">
            <span class="text-sm font-semibold">ตัวกรอง</span>
            <button class="btn btn-ghost btn-xs" :disabled="!hasFilter" @click="clearFilters">
              ล้างทั้งหมด
            </button>
          </div>

          <!-- ค้นหัวข้อตัวกรอง ไม่ใช่ค้นข้อมูลในตาราง - ป้ายต้องเขียนให้ต่างกันชัด ๆ
               ไม่งั้นคนพิมพ์เลขสินทรัพย์ลงช่องนี้แล้วงงว่าทำไมไม่มีอะไรเกิดขึ้น -->
          <div class="px-3 pt-2">
            <label class="input input-sm flex w-full items-center gap-2">
              <Icon icon="lucide:search" class="size-3.5 shrink-0 opacity-50" />
              <input v-model="filterSearch" type="search" class="grow" placeholder="ค้นหาตัวกรอง..." />
            </label>
          </div>

          <div class="max-h-96 overflow-y-auto p-1.5">
            <div v-for="f in visibleFields" :key="f.key" class="rounded-btn">
              <!-- สามท่อนแรกของเลขสินทรัพย์ในแถวเดียว - มาร์กอัปเดียวกับหน้า Asset Inventory
                   ตัวเลือกแรกของแต่ละช่องคือ "ไม่กรอง" จึงไม่ต้องมีปุ่ม × แยก -->
              <div v-if="f.key === 'assetNumber'" class="flex w-full items-center gap-2 px-2 py-2">
                <Icon :icon="f.icon" class="size-4 shrink-0 opacity-60" />
                <div class="grid flex-1 grid-cols-3 gap-1.5">
                  <select
                    v-model="assetPrefix"
                    class="select select-xs w-full"
                    :class="{ 'select-primary': assetPrefix }"
                    aria-label="Code"
                    title="Code"
                  >
                    <option value="">Code</option>
                    <option v-for="o in assetPrefixes" :key="o.code" :value="o.code">
                      {{ o.code }} ({{ o.assets }})
                    </option>
                  </select>
                  <select
                    v-model="assetNumberDept"
                    class="select select-xs w-full"
                    :class="{ 'select-primary': assetNumberDept }"
                    aria-label="Dept ID"
                    title="Dept ID"
                  >
                    <option value="">Dept ID</option>
                    <option v-for="o in assetNumberDepts" :key="o.dept" :value="o.dept">
                      {{ o.dept }} ({{ o.assets }})
                    </option>
                  </select>
                  <select
                    v-model="assetNumberYear"
                    class="select select-xs w-full"
                    :class="{ 'select-primary': assetNumberYear }"
                    aria-label="ปี"
                    title="ปี"
                  >
                    <option value="">ปี</option>
                    <option v-for="o in assetNumberYears" :key="o.year" :value="o.year">
                      {{ o.year }} ({{ o.assets }})
                    </option>
                  </select>
                </div>
              </div>

              <!-- หัวข้อ: กดแล้วกาง/หุบ ตัวที่กรองอยู่มี badge กับปุ่ม × ให้ปลดได้จากตรงนี้ -->
              <div
                v-else
                class="flex w-full cursor-pointer items-center gap-2 rounded-btn px-2 py-2 hover:bg-base-200"
                @click="expandedField = expandedField === f.key ? '' : f.key"
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
                  icon="lucide:chevron-down"
                  class="size-4 shrink-0 opacity-50 transition-transform"
                  :class="{ 'rotate-180': expandedField === f.key }"
                />
              </div>

              <!-- ค่าที่เลือกไว้ โชว์ใต้หัวข้อตอนหุบ จะได้รู้ว่ากรองด้วยอะไรอยู่โดยไม่ต้องกางดู -->
              <p
                v-if="filterHasValue(f.key) && expandedField !== f.key"
                class="px-2 pb-2 pl-8 text-left text-xs text-base-content/60"
              >
                {{ fieldValueLabel(f.key) }}
              </p>

              <!-- เนื้อใน: เลือกค่าได้ตรงนี้เลย ไม่ต้องออกไปข้างนอกแผง -->
              <div v-if="expandedField === f.key" class="px-2 pb-2">

                <template v-if="f.key === 'location'">
                  <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                    <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                    <input v-model="locationSearch" type="search" class="grow" placeholder="ค้นที่ตั้ง" />
                  </label>
                  <ul class="max-h-44 overflow-y-auto">
                    <li v-for="l in filteredLocations" :key="l.id">
                      <button
                        class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                        :class="{ 'bg-primary/10 font-medium': locationId === String(l.id) }"
                        @click="toggleValue('location', String(l.id))"
                      >
                        <Icon
                          :icon="locationId === String(l.id) ? 'lucide:check' : 'lucide:minus'"
                          class="size-3.5 shrink-0"
                          :class="locationId === String(l.id) ? 'text-primary' : 'opacity-0'"
                        />
                        <span class="truncate">{{ locationLabel(l, companyLocations) }}</span>
                      </button>
                    </li>
                    <li v-if="locationsFailed" class="px-2 py-2 text-xs text-base-content/50">
                      โหลดรายชื่อที่ตั้งไม่สำเร็จ
                    </li>
                    <li
                      v-else-if="!filteredLocations.length"
                      class="px-2 py-2 text-xs text-base-content/50"
                    >
                      ไม่พบที่ตั้งที่ตรงกับคำค้น
                    </li>
                  </ul>
                </template>

                <!-- ผู้ครอบครอง: ค้นที่ฝั่ง server (พนักงานหลักร้อย) จึงไม่ใช่การกรองลิสต์ในเครื่อง
                     เหมือนที่ตั้ง - ช่องนี้พิมพ์แล้วยิงถามใหม่ทุกครั้ง -->
                <template v-else-if="f.key === 'holder'">
                  <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                    <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                    <input
                      v-model="employeeSearch"
                      type="search"
                      class="grow"
                      placeholder="ค้นชื่อหรือรหัสพนักงาน"
                    />
                    <span v-if="employeesLoading" class="loading loading-spinner loading-xs shrink-0"></span>
                  </label>
                  <ul class="max-h-44 overflow-y-auto">
                    <li v-for="e in employees" :key="e.id">
                      <button
                        class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                        :class="{ 'bg-primary/10 font-medium': employeeId === e.id }"
                        @click="toggleEmployee(e)"
                      >
                        <Icon
                          :icon="employeeId === e.id ? 'lucide:check' : 'lucide:minus'"
                          class="size-3.5 shrink-0"
                          :class="employeeId === e.id ? 'text-primary' : 'opacity-0'"
                        />
                        <span class="truncate">{{ e.name }}</span>
                        <span v-if="e.empId" class="shrink-0 text-xs opacity-50">{{ e.empId }}</span>
                      </button>
                    </li>
                    <li v-if="employeesFailed" class="px-2 py-2 text-xs text-base-content/50">
                      โหลดรายชื่อพนักงานไม่สำเร็จ
                    </li>
                    <li
                      v-else-if="!employees.length && !employeesLoading"
                      class="px-2 py-2 text-xs text-base-content/50"
                    >
                      ไม่พบพนักงานที่ตรงกับคำค้น
                    </li>
                  </ul>

                  <!-- "แสดง 8 จาก 396 คน" - ลิสต์ขอมาทีละ 8 แถว ถ้าไม่บอกจำนวนทั้งหมด
                       คนที่หาชื่อไม่เจอจะสรุปว่าคนนั้นไม่มีในระบบ แทนที่จะพิมพ์ค้น -->
                  <p
                    v-if="employeeRangeLabel"
                    class="mt-1.5 px-2 text-center text-xs text-base-content/50"
                  >
                    {{ employeeRangeLabel }}
                  </p>

                </template>

                <ul v-else-if="f.key === 'status'">
                  <li v-for="s in ASSET_STATUS_OPTIONS" :key="s.value">
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

                <!-- มาร์กอัปเดียวกับตัวกรอง Asset class ของหน้า Asset Inventory / Asset summary -->
                <template v-else-if="f.key === 'assetClass'">
                  <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                    <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                    <input v-model="assetClassSearch" type="search" class="grow" placeholder="ค้น Asset class" />
                  </label>
                  <ul class="max-h-44 overflow-y-auto">
                    <li v-for="o in filteredAssetClasses" :key="o.code">
                      <button
                        class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                        :class="{ 'bg-primary/10 font-medium': assetClass === o.code }"
                        @click="toggleValue('assetClass', o.code)"
                      >
                        <Icon
                          :icon="assetClass === o.code ? 'lucide:check' : 'lucide:minus'"
                          class="size-3.5 shrink-0"
                          :class="assetClass === o.code ? 'text-primary' : 'opacity-0'"
                        />
                        <span class="truncate">{{ o.code }} · {{ o.label }}</span>
                      </button>
                    </li>
                    <li v-if="!filteredAssetClasses.length" class="px-2 py-2 text-xs text-base-content/50">
                      ไม่พบ Asset class ที่ตรงกับคำค้น
                    </li>
                  </ul>
                </template>

              </div>
            </div>

            <p v-if="!visibleFields.length" class="px-2 py-3 text-center text-xs text-base-content/50">
              ไม่พบตัวกรองที่ตรงกับคำค้น
            </p>
          </div>
        </div>
      </div>

      <!-- เรียงตาม - ยืนติดกับปุ่มตัวกรอง ใช้โครงแผงเดียวกัน -->
      <AppSortMenu v-model="sort" v-model:direction="sortDir" :options="ASSET_SORT_OPTIONS" />

      <!-- Range - ms-auto ดันไปชิดขวาของบรรทัดที่มันอยู่ ไม่ว่าตัวกรองจะตกบรรทัดหรือไม่ -->
      <p v-if="range" class="ms-auto shrink-0 text-right text-sm text-base-content/60">
        {{ range }}
      </p>

    </div>

    <!-- ตัวกรองที่ใช้อยู่ - เห็นได้โดยไม่ต้องเปิดแผง กดที่ตัวไหนก็ปลดตัวนั้น -->
    <div v-if="hasFilter" class="mt-2 flex flex-wrap items-center gap-1.5">
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

    <div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-3">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
    </div>

    

    <!-- คอลัมน์ชุดเดียวกับหน้า Asset Inventory ยกเว้นแผนก (ผู้ใช้กำหนด 2026-09-29)
         ★ show-accounting ต้องเปิด - ตัวเลือก "เรียงตาม" ใช้ชุดเดียวกับหน้า Inventory
           (มีอายุคงเหลือ) ถ้าปิด กดเรียงตามอายุคงเหลือแล้วจะไม่มีคอลัมน์นั้นให้เห็น
           ลำดับที่ได้จึงอ่านไม่ออก (เคยเป็นแบบนั้นจริง) -->
    <AssetTable
      class="mt-2"
      :items="items"
      :loading="loading"
      :show-department="false"
      show-accounting
      :min-rows="8"
      @select="openAsset"
    >
      <template #empty>
        <Icon icon="mdi:package-variant" class="mx-auto size-12 opacity-40" />
        <!-- แยกสามกรณี: กรองจนไม่เหลือ / ค้นไม่เจอ / แผนกนั้นไม่มีของเลย
             สามอย่างนี้ผู้ใช้ต้องทำคนละอย่างต่อ รวบเป็นข้อความเดียวคือปล่อยให้เดาเอง -->
        <template v-if="hasFilter">
          <p class="mt-2">ไม่พบสินทรัพย์ที่ตรงกับเงื่อนไขที่เลือก</p>
          <button class="btn btn-sm mt-3" @click="clearFilters">ล้างตัวกรอง</button>
        </template>
        <p v-else class="mt-2">{{ heading }} ยังไม่มีรายการ</p>
      </template>
    </AssetTable>

    <AppPagination
      v-if="total > LIMIT"
      class="mt-4"
      :page="page"
      :total="total"
      :limit="LIMIT"
      @update:page="onPageChange"
    />

    <!-- Teleport ไป body อยู่แล้ว วางตรงไหนก็ได้ -->
    <!-- @updated: แก้ที่ตั้ง/รูป/ประกันจากในกล่องแล้ว คอลัมน์ในตารางต้องตามไปด้วย
       ไม่งั้นแถวข้างหลังยังโชว์ห้องเดิมจนกว่าจะเปลี่ยนหน้าหรือกรองใหม่ -->
  <AssetDetailModal
    v-model="detailOpen"
    :item="selectedItem"
    editable-location
    editable-image
    editable-holder
    editable-warranty
    @updated="load()"
  />
  </section>
</template>
