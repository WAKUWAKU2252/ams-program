<script setup lang="ts">
// หน้า Asset Inventory - ทะเบียนสินทรัพย์ทั้งบริษัท ค้น/กรอง/เปิดดูรายชิ้น
//
// ★ เคยถูกยุบไปเป็นส่วนท้ายของ Dashboard ช่วงหนึ่ง แล้วแยกกลับมา - อย่ายุบอีก
//   เหตุผลที่มันอยู่ร่วมหน้ากับ Dashboard ไม่ได้: สองหน้านี้มีกฎขอบเขตคนละชุด
//   (ดูข้อ 1) พอมาอยู่หน้าเดียวกันจะได้ช่อง "แผนก" สองช่องที่ทำงานคนละแบบ
//   ช่องหนึ่งล็อกกดไม่ได้ อีกช่องกดได้ - สับสนโดยไม่มีทางอธิบายให้ผู้ใช้เข้าใจ
//   และหน้าแรกของทุกคนต้องแบกคำขอเพิ่มอีกสิบกว่ารายการเพื่อตารางที่ส่วนใหญ่ไม่ได้เลื่อนไปดู
//
// ── สามอย่างที่หน้านี้ต้องทำให้ถูก ──────────────────────────────────────────
//
// 1. **ไม่จำกัดตามคนที่ล็อกอิน** - ต่างจาก My asset ("ของฉัน") และ Dashboard (ล็อกแผนก
//    ตาม role) หน้านี้ตอบว่า "ของชิ้นนี้อยู่ไหน ใครดูแล" ให้ทุกคน เพราะคนที่ตามหาเครื่อง
//    มักไม่ใช่คนแผนกเดียวกับที่ของสังกัดอยู่ (ช่างซ่อม/คนตรวจนับ/คนยืมข้ามแผนก)
//
// 2. **แบ่งหน้าฝั่ง backend ไม่ใช่ฝั่งจอ** - ทะเบียนจริงมี 2,700+ ชิ้น ต่างจากตารางสรุป
//    รายแผนกบน Dashboard ที่ตัดหน้าฝั่งจอได้เพราะข้อมูลมาครบทั้งก้อนอยู่แล้ว
//    ที่นี่ดึงทีละหน้า → เปลี่ยนหน้า/ค้น/กรอง = ยิง API ใหม่ทุกครั้ง
//
// 3. **ตัวเลขบัญชีค้างปีเก่าได้** - ยอดที่ sync มาเป็นของ "ปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น"
//    ซึ่งไม่ใช่ปีปัจจุบันเสมอไป (วัด 2026-08-20: 25% ของทะเบียน) ต้องติดป้ายปีคู่กับยอดเสมอ
//    เหมือนหน้า My asset ไม่งั้นคนอ่านเลขปี 2022 เป็นมูลค่าวันนี้
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import AssetTable from '@/shared/components/AssetTable.vue'
import { getAssetInventory } from '@/shared/services/asset.service'
import type { InventoryItem, InventoryParams } from '@/shared/services/asset.service'
import {
  listCompanies,
  listDepartments,
  listFiscalYears,
  listLocations,
} from '@/shared/services/master.service'
import type { CompanyOption, DepartmentOption, MasterOption } from '@/shared/services/master.service'
import { ApiError } from '@/shared/services/httpClient'
import { ASSET_STATUS_OPTIONS } from '@/shared/utils/asset-status'
import { ASSET_SORT_OPTIONS } from '@/shared/utils/asset-sort'
import AppSortMenu from '@/shared/components/AppSortMenu.vue'
import type { SortDirection } from '@/shared/components/AppSortMenu.vue'
import AssetDetailModal from '@/shared/components/AssetDetailModal.vue'

const items = ref<InventoryItem[]>([])
const total = ref(0)
const page = ref(1)
// หน้าละ 10 แถว - แถวสูงขึ้นเพราะคอลัมน์มูลค่าคงเหลือซ้อนปีบัญชีไว้ใต้ยอด
// 20 แถวทำให้ต้องเลื่อนจอสองหน้ากว่าจะเจอแถบเลขหน้า
const limit = 10
const loading = ref(false)
const loadError = ref('')

/** ข้อความในช่องค้นหา - ยังไม่ใช่คำที่ยิงไปจริง (ดู debounce ข้างล่าง) */
const searchText = ref('')

// ── ตัวกรอง ────────────────────────────────────────────────────────────────
//
// ทุกตัวเก็บเป็น string เพราะ <select>/<input> คืน string เสมอ แล้วแปลงตอนส่งให้ API
// ที่เดียว ('' = ไม่กรอง) เก็บเป็น number แล้วต้องคอยระวัง 0 กับ '' ปนกันทุกจุดที่อ่าน
/** รหัสบริษัท เช่น 'UBA' - '' = ทุกบริษัท (ค่าคือ code ไม่ใช่ id ดู CompanyOption) */
const companyCode = ref('')
const departmentId = ref('')
const locationId = ref('')
const status = ref('')
const fiscalYear = ref('')
const minNbv = ref('')
const maxNbv = ref('')
/** '' = เรียงตามเลขสินทรัพย์ (ค่าตั้งต้นของ backend) - ดู ASSET_SORT_OPTIONS */
const sort = ref('')
/** มีผลเมื่อเลือก sort แล้วเท่านั้น - ค่าตั้งต้นคือมาก/ใหม่ก่อน */
const sortDir = ref<SortDirection>('desc')

const companies = ref<CompanyOption[]>([])
const departments = ref<DepartmentOption[]>([])
const locations = ref<MasterOption[]>([])
const fiscalYears = ref<number[]>([])

/**
 * ต้องเลือกบริษัทก่อนถึงจะเลือกแผนกได้ - แผนกเป็นของบริษัท ไม่ใช่ของทั้งเครือ (0024)
 *
 * ★ ทะเบียนจริงมี 151 แผนกจาก 3 บริษัท และ **55 ชื่อซ้ำกันข้ามบริษัท** (วัด 2026-09-03)
 *   ลิสต์ที่เทลงมาทั้ง 151 แถวคือลิสต์ที่เลือกถูกไม่ได้: คนกดเจอ "ฝ่ายบัญชี" สามอัน
 *   เรียงติดกันแล้วต้องเดา เลือกผิดก็ได้ตารางว่างโดยไม่มีอะไรอธิบาย
 *   บังคับเลือกบริษัทก่อนตัดความกำกวมทิ้งทั้งหมด (กติกาเดียวกับหน้า Audit และ Dashboard)
 *
 * ★ ไม่ทำแบบเดียวกันกับ "ที่ตั้ง" โดยตั้งใจ - asset_location ยังไม่มีคอลัมน์ companyCode
 *   จึงบอกไม่ได้ว่าสถานที่ไหนเป็นของบริษัทไหน (ข้อจำกัดที่ค้างอยู่ ดูหมายเหตุใน
 *   asset.connector.ts) ล็อกไว้ก็ไม่มีอะไรให้กรองได้ถูกต้องอยู่ดี
 */
const departmentLocked = computed(() => !companyCode.value)

/** แผนกของบริษัทที่เลือกไว้ - ยังไม่เลือกบริษัท = ว่าง ไม่ใช่ "ทั้งหมด" (ดู departmentLocked) */
const companyDepartments = computed(() =>
  companyCode.value ? departments.value.filter((d) => d.companyCode === companyCode.value) : [],
)

// ย้ายไป utils/asset-status.ts แล้ว - เดิมไฟล์นี้ Audit และ Dashboard ถือคนละสำเนา
const STATUS_OPTIONS = ASSET_STATUS_OPTIONS

/** '' → undefined, ตัวเลขที่แปลงไม่ได้ → undefined (กันช่องที่พิมพ์ค้างไว้ครึ่งทาง) */
function num(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAssetInventory({
      page: page.value,
      limit,
      search: searchText.value,
      companyCode: companyCode.value || undefined,
      departmentId: num(departmentId.value),
      locationId: num(locationId.value),
      status: status.value || undefined,
      fiscalYear: num(fiscalYear.value),
      minNetBookValue: num(minNbv.value),
      maxNetBookValue: num(maxNbv.value),
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

onMounted(async () => {
  // โหลดคู่กันไปเลย ไม่ต้องรอกัน - ตัวเลือกในกล่องกรองไม่ใช่เงื่อนไขของการโหลดตาราง
  void loadFilterOptions()
  await load()
})

/**
 * ตัวเลือกในกล่องกรองมาจาก /master/* ไม่ใช่จากผลลัพธ์ในหน้า
 *
 * ต่างจาก Dashboard ที่อ่านจาก byDepartment ได้ - ที่นี่ข้อมูลมาทีละหน้า แผนก/ที่ตั้ง
 * ที่จะโผล่จึงขึ้นกับว่าบังเอิญอยู่หน้าไหน ซึ่งใช้เป็นลิสต์ตัวกรองไม่ได้เลย
 *
 * ★ แต่ละอันพังแยกกันได้ - ยิงพร้อมกันแล้ว catch ทีละตัว ไม่ใช้ Promise.all ที่
 *   ตัวเดียวล้มแล้วลากที่เหลือหายไปด้วย กล่องที่โหลดไม่ได้จะเหลือแค่ตัวเลือก "ทั้งหมด"
 *   ส่วนตารางยังค้นได้ตามปกติ
 */
function loadFilterOptions() {
  void listCompanies()
    .then((rows) => (companies.value = rows))
    .catch(() => {})
  void listDepartments()
    .then((rows) => (departments.value = rows))
    .catch(() => {})
  void listLocations()
    .then((rows) => (locations.value = rows))
    .catch(() => {})
  void listFiscalYears()
    .then((rows) => (fiscalYears.value = rows))
    .catch(() => {})
}

let searchTimer: ReturnType<typeof setTimeout> | undefined

/**
 * ช่องที่ "พิมพ์" ต้องหน่วง ช่องที่ "กด" ไม่ต้อง
 *
 * คำค้นกับช่วงมูลค่าเป็นการพิมพ์ทีละตัวอักษร ถ้ายิงทุกครั้งจะได้ 10 request ต่อ 10 ตัวอักษร
 * และช่วงมูลค่ายิ่งแย่กว่า เพราะระหว่างพิมพ์ "15000" จะยิงด้วยค่า 1, 15, 150, 1500 ก่อน
 * ซึ่งแต่ละครั้งคือคิวรีที่ผลลัพธ์ต่างกันคนละโลก
 */
const debouncedLoad = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void load()
  }, 350)
}

watch([searchText, minNbv, maxNbv], debouncedLoad)

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

// กล่องเลือกยิงทันที ไม่ต้องหน่วง - เป็นการกดเลือกครั้งเดียว ไม่ใช่การพิมพ์รัว
//
// ★ ทุกตัวต้องรีเซ็ตกลับหน้า 1 เสมอ ค้างอยู่หน้า 5 แล้วกรองจนเหลือ 3 ชิ้น จะได้ตารางว่าง
//   ทั้งที่มีผลลัพธ์ และแถบเลขหน้าก็หายไปด้วย = ไม่มีปุ่มให้กดกลับ ผู้ใช้ติดอยู่ตรงนั้น
//
// ★★ ต้องเป็น watch ตัวเดียว ห้ามแยก "ล้างแผนกตอนเปลี่ยนบริษัท" ออกไปเป็นอีกตัว
//    แผนกเป็นของบริษัท (0024) id ที่ค้างจากบริษัทก่อนจึงไม่มีอยู่ในบริษัทใหม่ ต้องล้างทิ้ง
//    แต่ถ้าแยกเป็นสอง watch ทั้งคู่จะถูกคิวในรอบ flush เดียวกันแล้วทำงานตามลำดับที่ประกาศ
//    ตัวหนึ่งยิง load() ด้วยคู่ (บริษัทใหม่ + แผนกของบริษัทเก่า) ซึ่งเป็นคู่ที่ไม่มีอยู่จริง
//    → ได้ตารางว่างแวบหนึ่ง แล้วอีกตัวค่อยล้างแผนกจนยิงซ้ำอีกรอบ
//    (บั๊กเดียวกับที่หน้า Dashboard เคยเจอ - ดู watch ใน DashboardPage.vue)
watch([companyCode, departmentId, locationId, status, fiscalYear, sort, sortDir], ([company], [prevCompany]) => {
  if (company !== prevCompany && departmentId.value) {
    departmentId.value = ''
    return
  }
  page.value = 1
  void load()
})

function onPageChange(next: number) {
  page.value = next
  void load()
  // เปลี่ยนหน้าแล้วตาต้องกลับไปอยู่หัวตาราง ไม่ใช่ค้างอยู่ท้ายหน้าเดิม
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearFilters() {
  searchText.value = ''
  companyCode.value = ''
  departmentId.value = ''
  locationId.value = ''
  status.value = ''
  fiscalYear.value = ''
  minNbv.value = ''
  maxNbv.value = ''
  // ไม่เรียก load() เอง - watch ทั้งสองชุดข้างบนจับได้ครบทุกช่องอยู่แล้ว
  // เรียกเองจะกลายเป็นยิงซ้อนกับ watch แล้วผลลัพธ์ที่มาทีหลังอาจเป็นของคิวรีเก่า
}

// ── แผงตัวกรอง ─────────────────────────────────────────────────────────────
//
// เป็น dropdown แผงเดียวที่ "เลือกค่าได้ในตัวเอง" ไม่ใช่ dropdown ที่เลือกชนิดแล้วไป
// โผล่ช่องกรอกข้างนอก - เปิดแผง กดหัวข้อที่ต้องการ มันกางออกในที่ แล้วกดเลือกค่าได้เลย
//
// ★ ค่าจริงยังอยู่ใน ref ของแต่ละแกนเหมือนเดิม แผงนี้เป็นแค่หน้าตา
//   ปิดแผงแล้วตัวกรองยังทำงานอยู่ (badge บนปุ่มกับ chip ข้างล่างเป็นตัวบอก)
const panelOpen = ref(false)
/** หัวข้อที่กางอยู่ - ทีละอันเพื่อไม่ให้แผงยาวจนต้องเลื่อนหา */
const expandedField = ref('')
/** ช่องค้นในแผง - กรองรายชื่อ "หัวข้อตัวกรอง" ไม่ใช่กรองข้อมูลในตาราง */
const filterSearch = ref('')

const FILTER_FIELDS = [
  { key: 'company', label: 'บริษัท', icon: 'lucide:building-2' },
  { key: 'department', label: 'แผนก', icon: 'lucide:users' },
  { key: 'location', label: 'ที่ตั้ง', icon: 'lucide:map-pin' },
  { key: 'status', label: 'สถานะ', icon: 'lucide:activity' },
  { key: 'fiscalYear', label: 'ปีบัญชีของตัวเลข', icon: 'lucide:calendar' },
  { key: 'netBookValue', label: 'มูลค่าคงเหลือ', icon: 'lucide:coins' },
]

const visibleFields = computed(() => {
  const q = filterSearch.value.trim().toLowerCase()
  return q ? FILTER_FIELDS.filter((f) => f.label.toLowerCase().includes(q)) : FILTER_FIELDS
})

/** แกนไหนมีค่าอยู่แล้ว - เอาไปขึ้น badge บนหัวข้อในแผง */
function filterHasValue(key: string): boolean {
  switch (key) {
    case 'company':
      return !!companyCode.value
    case 'department':
      return !!departmentId.value
    case 'location':
      return !!locationId.value
    case 'status':
      return !!status.value
    case 'fiscalYear':
      return !!fiscalYear.value
    case 'netBookValue':
      return !!minNbv.value.trim() || !!maxNbv.value.trim()
    default:
      return false
  }
}

function clearField(key: string) {
  if (key === 'company') companyCode.value = ''
  else if (key === 'department') departmentId.value = ''
  else if (key === 'location') locationId.value = ''
  else if (key === 'status') status.value = ''
  else if (key === 'fiscalYear') fiscalYear.value = ''
  else if (key === 'netBookValue') {
    minNbv.value = ''
    maxNbv.value = ''
  }
}

/**
 * กดตัวเลือกเดิมซ้ำ = ปลดตัวกรองนั้น
 *
 * ในแผงไม่มีปุ่ม "ทุกแผนก" ให้กดเหมือนตอนเป็น <select> - การกดซ้ำจึงเป็นทางเดียว
 * ที่ผู้ใช้จะกลับไปสถานะ "ไม่กรอง" ได้จากในลิสต์ (นอกจากกด × บนหัวข้อ)
 *
 * รับเป็น key ไม่ใช่ตัว ref - ใน <script setup> template จะ unwrap ref ให้อัตโนมัติ
 * ส่งตัว ref ออกไปจาก template จึงไม่ได้ ได้แต่ค่าข้างใน
 */
function toggleValue(key: string, value: string) {
  const target =
    key === 'company'
      ? companyCode
      : key === 'department'
        ? departmentId
        : key === 'location'
          ? locationId
          : key === 'status'
            ? status
            : key === 'fiscalYear'
              ? fiscalYear
              : null
  if (!target) return
  target.value = target.value === value ? '' : value
}

/** ค่าที่เลือกไว้ของแกนนั้น เป็นข้อความอ่านออก - โชว์ใต้หัวข้อตอนหุบ */
function fieldValueLabel(key: string): string {
  switch (key) {
    case 'company':
      return companies.value.find((c) => c.code === companyCode.value)?.name ?? companyCode.value
    case 'department':
      return departments.value.find((d) => String(d.id) === departmentId.value)?.name ?? ''
    case 'location':
      return locations.value.find((l) => String(l.id) === locationId.value)?.name ?? ''
    case 'status':
      return STATUS_OPTIONS.find((s) => s.value === status.value)?.label ?? status.value
    case 'fiscalYear':
      return fiscalYear.value
    case 'netBookValue': {
      const min = minNbv.value.trim()
      const max = maxNbv.value.trim()
      return min && max ? `${min}–${max}` : min ? `≥ ${min}` : `≤ ${max}`
    }
    default:
      return ''
  }
}

// ── ค้นในรายการตัวเลือก ────────────────────────────────────────────────────
// แผนกจริงมี 62 แผนก ลิสต์เปล่า ๆ เลื่อนหาไม่ไหว ส่วนสถานะ/ปีมีไม่กี่ตัวจึงไม่ต้องมี
const departmentSearch = ref('')
const locationSearch = ref('')

const filteredDepartments = computed(() => {
  const q = departmentSearch.value.trim().toLowerCase()
  return q
    ? companyDepartments.value.filter((d) => d.name.toLowerCase().includes(q))
    : companyDepartments.value
})

// เปลี่ยนบริษัท = ล้างคำค้นแผนกด้วย คำที่พิมพ์ไว้ตอนดูบริษัทก่อนหน้ามักไม่ตรงกับชื่อแผนก
// ของบริษัทใหม่ แล้วจะได้ลิสต์เปล่าทันทีที่กางออกมา ทั้งที่มีแผนกให้เลือกอยู่หลายสิบ
//
// ★ ต้องอยู่ใต้ departmentSearch - const ไม่ถูก hoist ตามฟังก์ชันที่ปิดทับมัน วางไว้เหนือ
//   แล้ววันหลังมีคนเติม { immediate: true } จะได้ ReferenceError ตอน setup โดยที่ tsc
//   จับไม่ได้ (บั๊กคลาสเดียวกับที่ AppAssetDetail.vue เขียนเตือนไว้)
watch(companyCode, () => (departmentSearch.value = ''))

/**
 * ปลดบริษัททิ้งตอนลิสต์แผนกกางอยู่ = ต้องหุบมันด้วย
 *
 * ไม่หุบแล้วผู้ใช้จะเห็นลิสต์เปล่าพร้อมข้อความ "ไม่พบแผนกที่ตรงกับคำค้น" ซึ่งโกหก -
 * สาเหตุจริงคือยังไม่ได้เลือกบริษัท ไม่ใช่คำค้นไม่ตรง
 */
watch(departmentLocked, (locked) => {
  if (locked && expandedField.value === 'department') expandedField.value = ''
})

const filteredLocations = computed(() => {
  const q = locationSearch.value.trim().toLowerCase()
  return q ? locations.value.filter((l) => l.name.toLowerCase().includes(q)) : locations.value
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

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onPanelKeydown)
})

/**
 * ตัวกรองที่ใช้อยู่ตอนนี้ - แสดงเป็น chip ให้เห็นครบในบรรทัดเดียว
 *
 * ★ จำเป็นเพราะ dropdown โชว์ได้ทีละแกน ถ้าไม่มีบรรทัดนี้ ผู้ใช้ที่กรองไว้สามแกน
 *   จะเห็นแค่แกนล่าสุด แล้วไม่รู้ว่าอีกสองตัวยังบีบผลลัพธ์อยู่
 *
 * นับคำค้นรวมด้วย ทั้งที่ช่องค้นอยู่คนละที่ - เพราะคำถามที่บรรทัดนี้ตอบคือ
 * "ตอนนี้ตารางถูกจำกัดด้วยอะไรอยู่บ้าง" ซึ่งคำค้นก็เป็นหนึ่งในนั้น
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

  // ไม่ต้องต่อรหัสบริษัทท้ายชื่อ - เลือกแผนกได้ก็ต่อเมื่อเลือกบริษัทไว้แล้ว chip ของบริษัท
  // จึงบอกอยู่แล้วว่าเป็นแผนกของใคร (ต่างจากตอนที่ลิสต์ยังเทมาทั้ง 151 แถวจาก 3 บริษัท)
  if (departmentId.value) {
    const name = departments.value.find((d) => String(d.id) === departmentId.value)?.name
    chips.push({ key: 'dep', label: `แผนก: ${name ?? departmentId.value}`, clear: () => (departmentId.value = '') })
  }

  if (locationId.value) {
    const name = locations.value.find((l) => String(l.id) === locationId.value)?.name
    chips.push({ key: 'loc', label: `ที่ตั้ง: ${name ?? locationId.value}`, clear: () => (locationId.value = '') })
  }

  if (status.value) {
    const label = STATUS_OPTIONS.find((s) => s.value === status.value)?.label ?? status.value
    chips.push({ key: 'status', label: `สถานะ: ${label}`, clear: () => (status.value = '') })
  }

  if (fiscalYear.value) {
    chips.push({ key: 'year', label: `ปีบัญชี: ${fiscalYear.value}`, clear: () => (fiscalYear.value = '') })
  }

  // รวมสองช่องเป็น chip เดียว - เป็นช่วงเดียวกัน แยกเป็นสองอันแล้วอ่านไม่ออกว่าคู่กัน
  const min = minNbv.value.trim()
  const max = maxNbv.value.trim()
  if (min || max) {
    const text = min && max ? `${min}–${max}` : min ? `≥ ${min}` : `≤ ${max}`
    chips.push({
      key: 'nbv',
      label: `มูลค่าคงเหลือ: ${text}`,
      clear: () => {
        minNbv.value = ''
        maxNbv.value = ''
      },
    })
  }

  return chips
})

const hasFilter = computed(() => activeFilterChips.value.length > 0)

/**
 * ช่วงมูลค่าที่กรอกกลับหัว (ต่ำสุด > สูงสุด) - เตือนไว้ ไม่ใช่บล็อก
 *
 * backend ตอบผลว่างซึ่งถูกต้องตามที่ถาม แต่ผู้ใช้จะอ่านว่า "ไม่มีของ" ทั้งที่จริงคือ
 * กรอกสลับกัน ป้ายเตือนบอกให้รู้ว่าทำไมถึงว่าง
 */
const nbvRangeInvalid = computed(() => {
  const min = num(minNbv.value)
  const max = num(maxNbv.value)
  return min !== undefined && max !== undefined && min > max
})

// ── กดแถว = เปิด modal ไม่ใช่เด้งออกไปหน้ารายละเอียด ────────────────────────
//
// หน้านี้คือหน้า "กวาดหา" คนเปิดดูทีละหลายชิ้นเพื่อเทียบกัน การเด้งออกไปทำให้เสีย
// ตำแหน่งหน้า คำค้น และตัวกรองทั้งหมด กลับมาต้องตั้งใหม่ทุกครั้ง
//
// เส้น /assets/:company/:number ยังอยู่เหมือนเดิม - นั่นคือปลายทางของ QR บนสติกเกอร์
// ซึ่งเป็นคนละคนกัน (คนที่ยืนอยู่หน้าเครื่องจริง ไม่ใช่คนที่นั่งไล่ทะเบียน)
const selectedItem = ref<InventoryItem | null>(null)
const detailOpen = ref(false)

function openAsset(item: InventoryItem) {
  selectedItem.value = item
  detailOpen.value = true
}

/** ลำดับที่กำลังแสดง เช่น "21–40 จาก 2,713 ชิ้น" */
const range = computed(() => {
  if (total.value === 0) return ''
  const start = (page.value - 1) * limit + 1
  return `${start}–${Math.min(start + limit - 1, total.value)} จาก ${total.value.toLocaleString('th-TH')} ชิ้น`
})
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="text-left">
      <h1 class="text-3xl font-semibold sm:text-4xl">Asset Inventory</h1>
      <p class="text-base-content/70">ทะเบียนสินทรัพย์ทั้งหมด ค้นหาและดูรายละเอียดรายชิ้น</p>
    </div>

    <!-- ── แถบค้นหา/กรอง ──────────────────────────────────────────────────── -->
    <div class="mt-5 flex flex-wrap items-end gap-3">
      <label class="form-control w-full max-w-md text-left">
        <span class="mb-1 text-xs text-base-content/60">ค้นหา</span>
        <div class="input input-sm flex w-full items-center gap-2 ">
          <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
          <input
            v-model="searchText"
            type="search"
            class="grow"
            placeholder="เลขสินทรัพย์ / ชื่อของ / เลขเครื่อง (S/N)"
          />
          <!-- ตัวหมุนอยู่ในช่องค้น ไม่ใช่ทับทั้งตาราง - ผลลัพธ์เดิมยังอ่านได้ระหว่างรอของใหม่ -->
          <span v-if="loading" class="loading loading-spinner loading-xs shrink-0" />
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
          class="absolute left-0 z-30 mt-2 w-80 rounded-box border border-base-300 bg-base-100 shadow-lg"
        >
          <div class="flex items-center justify-between border-b border-base-300 px-3 py-2">
            <span class="text-sm font-semibold">ตัวกรอง</span>
            <button
              class="btn btn-ghost btn-xs"
              :disabled="!hasFilter"
              @click="clearFilters"
            >
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

              <!-- บอกเงื่อนไขตรงที่ผู้ใช้กำลังกด ไม่ใช่ปล่อยให้เจอแถวจาง ๆ ที่กดไม่ติด
                   แล้วเดาเองว่าระบบเสียหรือสิทธิ์ไม่ถึง -->
              <p
                v-if="f.key === 'department' && departmentLocked"
                class="px-2 pb-2 pl-8 text-left text-xs text-base-content/50"
              >
                กรุณาเลือกบริษัทก่อน
              </p>

              <!-- ค่าที่เลือกไว้ โชว์ใต้หัวข้อตอนหุบ จะได้รู้ว่ากรองด้วยอะไรอยู่โดยไม่ต้องกางดู -->
              <p
                v-else-if="filterHasValue(f.key) && expandedField !== f.key"
                class="px-2 pb-2 pl-8 text-left text-xs text-base-content/60"
              >
                {{ fieldValueLabel(f.key) }}
              </p>

              <!-- เนื้อใน: เลือกค่าได้ตรงนี้เลย ไม่ต้องออกไปข้างนอกแผง -->
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
                        <span class="truncate">{{ d.name }}</span>
                      </button>
                    </li>
                    <li v-if="!filteredDepartments.length" class="px-2 py-2 text-xs text-base-content/50">
                      ไม่พบแผนกที่ตรงกับคำค้น
                    </li>
                  </ul>
                </template>

                <template v-else-if="f.key === 'location'">
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
                        <span class="truncate">{{ l.name }}</span>
                      </button>
                    </li>
                    <li v-if="!filteredLocations.length" class="px-2 py-2 text-xs text-base-content/50">
                      ไม่พบที่ตั้งที่ตรงกับคำค้น
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

                <ul v-else-if="f.key === 'fiscalYear'" class="max-h-44 overflow-y-auto">
                  <li v-for="y in fiscalYears" :key="y">
                    <button
                      class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                      :class="{ 'bg-primary/10 font-medium': fiscalYear === String(y) }"
                      @click="toggleValue('fiscalYear', String(y))"
                    >
                      <Icon
                        :icon="fiscalYear === String(y) ? 'lucide:check' : 'lucide:minus'"
                        class="size-3.5 shrink-0"
                        :class="fiscalYear === String(y) ? 'text-primary' : 'opacity-0'"
                      />
                      {{ y }}
                    </button>
                  </li>
                  <li v-if="!fiscalYears.length" class="px-2 py-2 text-xs text-base-content/50">
                    ยังไม่มีตัวเลขบัญชีในทะเบียน
                  </li>
                </ul>

                <template v-else-if="f.key === 'netBookValue'">
                  <!-- ★ type="text" ไม่ใช่ type="number" โดยตั้งใจ
                       v-model บน type="number" ทำให้ Vue แปลงค่าเป็น Number ให้อัตโนมัติ
                       (vModelText เห็น el.type === 'number' แล้วเรียก looseToNumber)
                       ref ที่ประกาศเป็น string จึงกลายเป็น number กลางคัน แล้ว .trim() ระเบิด
                       - เคยพังมาแล้ว ตัวกรองเงียบไปทั้งตัวโดยหน้าจอไม่ฟ้องอะไรเลย
                       inputmode="decimal" ยังให้แป้นตัวเลขบนมือถือเหมือนเดิม -->
                  <div class="join w-full">
                    <input
                      v-model="minNbv"
                      type="text"
                      inputmode="decimal"
                      class="input input-sm join-item w-full"
                      :class="{ 'input-error': nbvRangeInvalid }"
                      placeholder="ต่ำสุด"
                    />
                    <input
                      v-model="maxNbv"
                      type="text"
                      inputmode="decimal"
                      class="input input-sm join-item w-full"
                      :class="{ 'input-error': nbvRangeInvalid }"
                      placeholder="สูงสุด"
                    />
                  </div>
                  <p v-if="nbvRangeInvalid" class="mt-1.5 text-left text-xs text-error">
                    ต่ำสุดมากกว่าสูงสุด จึงไม่มีชิ้นไหนเข้าเงื่อนไข
                  </p>
                </template>
              </div>
            </div>

            <p v-if="!visibleFields.length" class="px-2 py-3 text-center text-xs text-base-content/50">
              ไม่พบตัวกรองที่ตรงกับคำค้น
            </p>
          </div>

          <!-- ★ สองตัวกรองนี้ตัดชิ้นที่ยังไม่มีตัวเลขบัญชีออกจากผลโดยปริยาย (เทียบค่าไม่ได้)
               ต้องบอกไว้ ไม่งั้นยอดที่หายไปจะดูเหมือนข้อมูลหาย -->
          <p
            v-if="fiscalYear || minNbv.trim() || maxNbv.trim()"
            class="flex items-start gap-1.5 border-t border-base-300 px-3 py-2 text-left text-xs text-base-content/60"
          >
            <Icon icon="lucide:info" class="mt-0.5 size-3.5 shrink-0" />
            กรองด้วยปีบัญชีหรือช่วงมูลค่า จะไม่รวมชิ้นที่ SAP ยังไม่มีตัวเลขบัญชีให้
          </p>
        </div>
      </div>

      <!-- เรียงตาม - ยืนติดกับปุ่มตัวกรอง ใช้โครงแผงเดียวกัน (ดู AppSortMenu)
           แยกปุ่มจากตัวกรองโดยตั้งใจ: ตัวกรองตอบ "เอาแถวไหนบ้าง" ส่วนอันนี้ตอบ
           "เรียงยังไง" - รวมเป็นแผงเดียวแล้วคนจะหาไม่เจอว่าเปลี่ยนลำดับตรงไหน -->
      <AppSortMenu v-model="sort" v-model:direction="sortDir" :options="ASSET_SORT_OPTIONS" />

      <span class="ml-auto text-sm text-base-content/60">{{ range }}</span>
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

    <div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-4">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
    </div>

    <AssetTable
      class="mt-4"
      :items="items"
      :loading="loading"
      :min-rows="10"
      show-accounting
      @select="openAsset"
    >
      <template #empty>
        <Icon icon="mdi:package-variant" class="mx-auto size-12 opacity-40" />
        <template v-if="hasFilter">
          <p class="mt-2">ไม่พบสินทรัพย์ที่ตรงกับเงื่อนไข</p>
          <button class="btn btn-sm mt-3" @click="clearFilters">ล้างตัวกรอง</button>
        </template>
        <p v-else class="mt-2">ยังไม่มีสินทรัพย์ในทะเบียน</p>
      </template>
    </AssetTable>

    <AppPagination
      v-if="total > limit"
      class="mt-4"
      :page="page"
      :total="total"
      :limit="limit"
      @update:page="onPageChange"
    />
  </div>

  <!-- Teleport ไป body อยู่แล้ว วางตรงไหนก็ได้ - ไว้ท้ายสุดเพื่อให้อ่านลำดับหน้าจอง่าย -->
  <AssetDetailModal v-model="detailOpen" :item="selectedItem" editable-location editable-image />
</template>
