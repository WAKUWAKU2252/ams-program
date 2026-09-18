<script setup lang="ts">
// หน้า Asset Request - คิวของบัญชี: ใบที่อนุมัติแล้ว รอออกเลขสินทรัพย์จาก SAP
//
// หน้านี้เป็น "คิว" อย่างเดียว ไม่มีการแก้ไขในตัวมันเอง - กด "แก้ไข" แล้วไปทำที่
// AssetRequestForm ทีละใบ เพราะการออกเลขต้องจองใบไว้ก่อน (lock) และการจองผูกกับหน้าที่
// เปิดอยู่ ถ้ากางแก้ในตารางได้หลายใบพร้อมกัน คนคนเดียวจะถือ lock ค้างหลายใบและบล็อกทั้งแถบ
//
// ── สาย lobby: บอกว่าใบไหนใครแก้อยู่ ─────────────────────────────────────────
// สายเดียวครอบทุกใบ ไม่ใช่สายต่อแถว - สายต่อแถวจะชนเพดาน connection ของ browser และ
// ที่แย่กว่าคือคนที่แค่เปิดดูคิวจะกลายเป็นสมาชิกทุกห้องแล้วไปแย่งคิวคนที่ตั้งใจจะแก้จริง
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppPagination from '@/shared/components/AppPagination.vue'
import AppSortMenu from '@/shared/components/AppSortMenu.vue'
import type { SortDirection } from '@/shared/components/AppSortMenu.vue'
import {
  listPendingRegistration,
  listStuckNotifications,
} from '@/shared/services/assetRequest.service'
import type {
  PendingRegistrationParams,
  PendingRegistrationRow,
  StuckNotification,
} from '@/shared/services/assetRequest.service'
import { listCompanies, listDepartments } from '@/shared/services/master.service'
import type { CompanyOption, DepartmentOption } from '@/shared/services/master.service'
import { openRegistrationLobby } from '@/shared/services/presence.service'
import type { PresenceConnection } from '@/shared/services/presence.service'
import { ApiError } from '@/shared/services/httpClient'
import { formatDateTime } from '@/shared/utils/date'
import { REQUEST_SORT_OPTIONS } from '@/shared/utils/request-sort'
import { Icon } from '@iconify/vue'
import TopicCard from '@/shared/components/TopicCard.vue'

const router = useRouter()
const rows = ref<PendingRegistrationRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const loading = ref(false)
const loadError = ref('')


// ── ตัวกรอง + การเรียง ──────────────────────────────────────────────────────
//
// โครงเดียวกับหน้า Asset Inventory ทั้งหมด (แผงเดียวที่เลือกค่าได้ในตัวเอง + ปุ่มเรียง
// แยกอีกปุ่ม + chip บอกตัวกรองที่ใช้อยู่) — สองหน้านี้เป็นงานของคนกลุ่มเดียวกัน
// ถ้าหน้าตาคนละแบบจะอ่านเป็นของคนละระบบ
//
// เก็บเป็น string ทุกตัวเพราะค่ามาจากปุ่มในลิสต์ ('' = ไม่กรอง) แล้วแปลงตอนส่งให้ API
// ที่เดียว — เก็บเป็น number แล้วต้องคอยระวัง 0 กับ '' ปนกันทุกจุดที่อ่าน
/** รหัสบริษัทของ PO เช่น 'UBA' - '' = ทุกบริษัท (ค่าคือ code ไม่ใช่ id) */
/** ข้อความในช่องค้นหา - ยังไม่ใช่คำที่ยิงไปจริง (ดู debounce ข้างล่าง) */
const searchText = ref('')

const companyCode = ref('')
const departmentId = ref('')
/** '' = ลำดับคิวเดิม (วันอนุมัติเก่าสุดอยู่บน) - ดู REQUEST_SORT_OPTIONS */
const sort = ref('')
/** มีผลเมื่อเลือก sort แล้วเท่านั้น - ค่าตั้งต้นคือใหม่/มากก่อน */
const sortDir = ref<SortDirection>('desc')

const companies = ref<CompanyOption[]>([])
const departments = ref<DepartmentOption[]>([])

/**
 * ต้องเลือกบริษัทก่อนถึงจะเลือกแผนกได้ - กติกาเดียวกับหน้า Inventory/Audit/Dashboard
 *
 * แผนกเป็นของบริษัท ไม่ใช่ของทั้งเครือ (0024) และมีชื่อซ้ำกันข้ามบริษัทหลายสิบชื่อ
 * ลิสต์ที่เทมาทั้งเครือคือลิสต์ที่เลือกถูกไม่ได้ - เห็น "ฝ่ายบัญชี" สามอันเรียงติดกันแล้วต้องเดา
 */
const departmentLocked = computed(() => !companyCode.value)

/** แผนกของบริษัทที่เลือกไว้ - ยังไม่เลือกบริษัท = ว่าง ไม่ใช่ "ทั้งหมด" (ดู departmentLocked) */
const companyDepartments = computed(() =>
  companyCode.value ? departments.value.filter((d) => d.companyCode === companyCode.value) : [],
)

/** '' → undefined (กันไม่ให้ส่ง departmentId=0 ไปให้ backend ตีเป็นค่าที่ตั้งใจกรอง) */
function num(value: string): number | undefined {
  const parsed = Number(value.trim())
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined
}
/** requestId -> ชื่อคนที่กำลังแก้ใบนั้น (ไม่มี key = ใบว่าง) */
const holders = ref<Record<number, string>>({})
let lobbyConn: PresenceConnection | null = null

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await listPendingRegistration({
      page: page.value,
      limit,
      search: searchText.value,
      companyCode: companyCode.value || undefined,
      departmentId: num(departmentId.value),
      sort: (sort.value || undefined) as PendingRegistrationParams['sort'],
      sortDir: sortDir.value,
    })
    rows.value = res.data
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการไม่สำเร็จ'
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * มีคนเปลี่ยนอะไรในคิว → โหลดตารางใหม่ แต่รวบหลายก้อนเป็นครั้งเดียว
 *
 * บัญชีไล่ออกเลขทีละชิ้นรัว ๆ - ใบที่มี 20 ชิ้นยิงมา 20 ก้อนติดกัน ถ้าโหลดทุกก้อนก็ได้
 * 20 request ทั้งที่ผลลัพธ์สุดท้ายเหมือนกันก้อนเดียว (และแต่ละ request กินโควตา connection
 * ที่สาย SSE เหลือให้อยู่แล้ว) หน่วงสั้น ๆ แล้วโหลดรอบเดียวพอ
 */
let reloadTimer: ReturnType<typeof setTimeout> | undefined

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined
    void load()
  }, 400)
}

function openLobby() {
  lobbyConn = openRegistrationLobby({
    // สายนี้ฟังอย่างเดียว ไม่ถือ lock ของใคร ปิดตอนแท็บถูกซ่อนได้โดยไม่มีผลข้างเคียง
    // - โควตา connection ของเบราว์เซอร์เป็นของทั้งโปรไฟล์ ไม่ใช่ของแต่ละแท็บ
    pauseWhenHidden: true,
    // ช่วงที่ปิดไปอาจมีใบถูกอนุมัติ/ออกเลขเพิ่ม โหลดหนึ่งรอบตอนกลับมา
    onResume: () => scheduleReload(),
    // ตารางนี้ไม่มีกล่องกรอกอะไร โหลดทับได้ตลอดเวลาโดยไม่ทำใครเสียงาน
    onStatus: () => scheduleReload(),
    onHolder: (h) => {
      // สร้าง object ใหม่ทุกครั้ง - Vue ไม่ track การ delete key ของ object เดิม
      const next = { ...holders.value }
      if (h.holderUserId === null) delete next[h.requestId]
      else next[h.requestId] = h.holderName ?? `ผู้ใช้ #${h.holderUserId}`
      holders.value = next
    },
    // สายหลุดไม่ใช่เรื่องคอขาดบาดตาย - ป้าย "กำลังแก้ไข" ค้างของเก่าไว้แป๊บหนึ่ง แล้ว
    // service ต่อใหม่ให้เอง (backend ส่ง snapshot ของใบที่มีคนถืออยู่ให้ตอนต่อติด)
    onError: (e) => console.error('lobby error:', e),
  })
}

/**
 * เข้าไปออกเลขในใบนี้
 *
 * ไม่บล็อกใบที่มีคนถืออยู่ - เข้าไปดูได้ แต่หน้าฟอร์มจะเป็นโหมดอ่านอย่างเดียวจนกว่าคนแรก
 * จะออก (แล้วมันปลดล็อกให้เองโดยไม่ต้อง reload) การเด้งกลับทำให้ดูสถานะใบไม่ได้เลย
 * ซึ่งเป็นสิ่งที่บัญชีเข้ามาทำบ่อยกว่าการแก้เสียอีก
 */
function openRequest(requestId: number) {
  router.push({ name: 'AssetRequestForm', params: { requestId: String(requestId) } })
}

function onPageChange(p: number) {
  page.value = p
  load()
}

// ── ใบที่การแจ้งเตือนไม่ถึงปลายทาง ─────────────────────────────────────────
//
// เหลือเฉพาะสองอาการที่ "บัญชีเป็นคนกดแก้" — แจ้งปิดงาน/ตีกลับไม่ออก ทั้งคู่กู้ด้วยการ
// เข้าไปกดปุ่มเดิมซ้ำในใบนั้น (ส่งล้ม = ไม่ปิดรอบ) จึงไม่มีปุ่มส่งซ้ำแยก มีแต่ทางเข้าใบ
//
// ★ "การ์ดไม่ถึงหัวหน้า" ไม่ได้อยู่ที่นี่ — ใบนั้นค้างของผู้ขอ เขารู้ก่อนและกดส่งซ้ำเองได้
//
// ★ ปกติต้องเป็นลิสต์ว่าง แถบทั้งแถบจึงซ่อนตัวเองเมื่อไม่มีอะไรค้าง ไม่ใช่โชว์ "0 รายการ"
//   ค้างไว้ให้ชิน จนวันที่มีของจริงไม่มีใครสังเกต
const stuck = ref<StuckNotification[]>([])
const stuckOpen = ref(false)

async function loadStuck() {
  try {
    stuck.value = await listStuckNotifications()
  } catch {
    // แถบเฝ้าพังไม่ควรลากหน้าหลักตาย — คิวออกเลขยังทำงานได้ครบโดยไม่มีแถบนี้
    stuck.value = []
  }
}


// ── แผงตัวกรอง ─────────────────────────────────────────────────────────────
//
// dropdown แผงเดียวที่ "เลือกค่าได้ในตัวเอง" - เปิดแผง กดหัวข้อ มันกางออกในที่
// แล้วกดเลือกค่าได้เลย ไม่ใช่กดแล้วไปโผล่ช่องกรอกข้างนอกแผง (โครงเดียวกับ Inventory)
const panelOpen = ref(false)
/** หัวข้อที่กางอยู่ - ทีละอัน */
const expandedField = ref('')

const FILTER_FIELDS = [
  { key: 'company', label: 'บริษัท', icon: 'lucide:building-2' },
  { key: 'department', label: 'แผนก', icon: 'lucide:users' },
]

/** แกนไหนมีค่าอยู่แล้ว - เอาไปขึ้น badge บนหัวข้อในแผง */
function filterHasValue(key: string): boolean {
  return key === 'company' ? !!companyCode.value : !!departmentId.value
}

function clearField(key: string) {
  if (key === 'company') companyCode.value = ''
  else departmentId.value = ''
}

/**
 * กดตัวเลือกเดิมซ้ำ = ปลดตัวกรองนั้น
 *
 * ในแผงไม่มีปุ่ม "ทุกแผนก" ให้กด การกดซ้ำจึงเป็นทางเดียวที่ผู้ใช้จะกลับไปสถานะ
 * "ไม่กรอง" ได้จากในลิสต์ (นอกจากกด × บนหัวข้อ หรือ chip ข้างล่าง)
 */
function toggleValue(key: string, value: string) {
  const target = key === 'company' ? companyCode : departmentId
  target.value = target.value === value ? '' : value
}

/** ค่าที่เลือกไว้ของแกนนั้น เป็นข้อความอ่านออก - โชว์ใต้หัวข้อตอนหุบ */
function fieldValueLabel(key: string): string {
  if (key === 'company') {
    return companies.value.find((c) => c.code === companyCode.value)?.name ?? companyCode.value
  }
  return departments.value.find((d) => String(d.id) === departmentId.value)?.name ?? ''
}

// แผนกจริงมีหลายสิบแถวต่อบริษัท ลิสต์เปล่า ๆ เลื่อนหาไม่ไหว - บริษัทมีไม่กี่ตัวจึงไม่ต้องมี
const departmentSearch = ref('')

const filteredDepartments = computed(() => {
  const q = departmentSearch.value.trim().toLowerCase()
  return q
    ? companyDepartments.value.filter((d) => d.name.toLowerCase().includes(q))
    : companyDepartments.value
})

// เปลี่ยนบริษัท = ล้างคำค้นแผนกด้วย คำที่พิมพ์ไว้ตอนดูบริษัทก่อนหน้ามักไม่ตรงกับชื่อแผนก
// ของบริษัทใหม่ แล้วจะได้ลิสต์เปล่าทันทีที่กางออกมา ทั้งที่มีแผนกให้เลือกอยู่
//
// ★ ต้องอยู่ใต้ departmentSearch - const ไม่ถูก hoist ตามฟังก์ชันที่ปิดทับมัน
watch(companyCode, () => (departmentSearch.value = ''))

/**
 * ปลดบริษัททิ้งตอนลิสต์แผนกกางอยู่ = ต้องหุบมันด้วย
 *
 * ไม่หุบแล้วผู้ใช้จะเห็นลิสต์เปล่าพร้อมข้อความ "ไม่พบแผนก..." ซึ่งโกหก - สาเหตุจริง
 * คือยังไม่ได้เลือกบริษัท ไม่ใช่คำค้นไม่ตรง
 */
watch(departmentLocked, (locked) => {
  if (locked && expandedField.value === 'department') expandedField.value = ''
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
 * ตัวกรองที่ใช้อยู่ตอนนี้ - แสดงเป็น chip ให้เห็นครบโดยไม่ต้องเปิดแผง
 *
 * แผงโชว์ได้ทีละแกน ถ้าไม่มีบรรทัดนี้ ผู้ใช้ที่กรองไว้สองแกนจะเห็นแค่แกนล่าสุด
 * แล้วไม่รู้ว่าอีกตัวยังบีบผลลัพธ์อยู่
 */
const activeFilterChips = computed(() => {
  const chips: { key: string; label: string; clear: () => void }[] = []

  // นับคำค้นเป็น chip ด้วย ทั้งที่ช่องค้นอยู่นอกแผง - คำถามที่บรรทัดนี้ตอบคือ
  // "ตอนนี้ตารางถูกจำกัดด้วยอะไรอยู่บ้าง" ซึ่งคำค้นก็เป็นหนึ่งในนั้น (เหมือน Inventory)
  const search = searchText.value.trim()
  if (search) {
    chips.push({ key: 'search', label: `ค้น: ${search}`, clear: () => (searchText.value = '') })
  }

  if (companyCode.value) {
    const name = companies.value.find((c) => c.code === companyCode.value)?.name
    chips.push({
      key: 'company',
      label: `บริษัท: ${name ?? companyCode.value}`,
      clear: () => (companyCode.value = ''),
    })
  }

  // ไม่ต้องต่อรหัสบริษัทท้ายชื่อ - เลือกแผนกได้ก็ต่อเมื่อเลือกบริษัทไว้แล้ว chip ของบริษัท
  // จึงบอกอยู่แล้วว่าเป็นแผนกของใคร
  if (departmentId.value) {
    const name = departments.value.find((d) => String(d.id) === departmentId.value)?.name
    chips.push({
      key: 'dep',
      label: `แผนก: ${name ?? departmentId.value}`,
      clear: () => (departmentId.value = ''),
    })
  }

  return chips
})

const hasFilter = computed(() => activeFilterChips.value.length > 0)

function clearFilters() {
  searchText.value = ''
  companyCode.value = ''
  departmentId.value = ''
  // ไม่เรียก load() เอง - watch ข้างล่างจับได้ครบทุกช่องอยู่แล้ว เรียกเองจะยิงซ้อนกัน
  // แล้วผลลัพธ์ที่มาทีหลังอาจเป็นของคิวรีเก่า
}

/**
 * กล่องเลือกยิงทันที ไม่ต้อง debounce - เป็นการกดเลือกครั้งเดียว ไม่ใช่การพิมพ์รัว
 *
 * ★ ต้องรีเซ็ตกลับหน้า 1 เสมอ ค้างอยู่หน้า 3 แล้วกรองจนเหลือใบเดียว จะได้ตารางว่าง
 *   ทั้งที่มีผลลัพธ์ และแถบเลขหน้าก็หายไปด้วย = ไม่มีปุ่มให้กดกลับ
 *
 * ★★ ต้องเป็น watch ตัวเดียว ห้ามแยก "ล้างแผนกตอนเปลี่ยนบริษัท" ออกไปเป็นอีกตัว -
 *    แผนกเป็นของบริษัท id ที่ค้างจากบริษัทก่อนจึงไม่มีในบริษัทใหม่ ต้องล้างทิ้ง แต่ถ้าแยก
 *    เป็นสอง watch ทั้งคู่จะถูกคิวในรอบ flush เดียวกัน ตัวหนึ่งจะยิง load() ด้วยคู่
 *    (บริษัทใหม่ + แผนกของบริษัทเก่า) ซึ่งเป็นคู่ที่ไม่มีอยู่จริง → ตารางว่างแวบหนึ่ง
 *    (บั๊กเดียวกับที่ Dashboard และ Inventory เคยเจอ)
 */
watch([companyCode, departmentId, sort, sortDir], ([company], [prevCompany]) => {
  if (company !== prevCompany && departmentId.value) {
    departmentId.value = ''
    return
  }
  page.value = 1
  void load()
})

/**
 * ช่องที่ "พิมพ์" ต้องหน่วง ช่องที่ "กด" ไม่ต้อง (กติกาเดียวกับหน้า Inventory)
 *
 * คำค้นเป็นการพิมพ์ทีละตัวอักษร ถ้ายิงทุกครั้งจะได้ 10 request ต่อ 10 ตัวอักษร และแต่ละ
 * ครั้งกินโควตา connection ที่สาย SSE ของหน้านี้เหลือให้อยู่แล้ว
 *
 * ★ ใช้ timer คนละตัวกับ reloadTimer ของสาย lobby โดยตั้งใจ - สองอย่างนี้ถูกทริกจากคนละ
 *   เหตุ (คนพิมพ์ / คนอื่นแก้ใบ) ถ้าใช้ตัวเดียวกัน การพิมพ์จะไปเลื่อนคิวโหลดของ SSE ออกไป
 *   เรื่อย ๆ แล้วป้าย "กำลังแก้ไข" จะค้างของเก่าตราบใดที่ยังพิมพ์อยู่
 */
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void load()
  }, 350)
})

/**
 * ตัวเลือกในแผงมาจาก /master/* ไม่ใช่จากผลลัพธ์ในหน้า
 *
 * ข้อมูลมาทีละหน้า บริษัท/แผนกที่จะโผล่จึงขึ้นกับว่าบังเอิญอยู่หน้าไหน ใช้เป็นลิสต์
 * ตัวกรองไม่ได้เลย
 *
 * ★ แต่ละอันพังแยกกันได้ - catch ทีละตัว ไม่ใช้ Promise.all ที่ตัวเดียวล้มแล้วลากที่เหลือ
 *   หายไปด้วย กล่องที่โหลดไม่ได้จะว่าง ส่วนตารางยังทำงานตามปกติ
 */
function loadFilterOptions() {
  void listCompanies()
    .then((r) => (companies.value = r))
    .catch(() => {})
  void listDepartments()
    .then((r) => (departments.value = r))
    .catch(() => {})
}

/** ลำดับที่กำลังแสดง เช่น "11–20 จาก 34 ใบ" */
const range = computed(() => {
  if (total.value === 0) return ''
  const start = (page.value - 1) * limit + 1
  return `${start}–${Math.min(start + limit - 1, total.value)} จาก ${total.value.toLocaleString('th-TH')} ใบ`
})

onMounted(() => {
  // โหลดคู่กันไปเลย ไม่ต้องรอกัน - ตัวเลือกในแผงกรองไม่ใช่เงื่อนไขของการโหลดตาราง
  loadFilterOptions()
  void load()
  void loadStuck()
  openLobby()
})

onUnmounted(() => {
  if (reloadTimer) clearTimeout(reloadTimer)
  if (searchTimer) clearTimeout(searchTimer)
  lobbyConn?.close()
  lobbyConn = null
  // ต้องถอดเองด้วย - watch(panelOpen) ถอดให้เฉพาะตอนแผงถูกปิด ปิดแท็บทั้งหน้าโดยแผง
  // ยังกางอยู่จะทิ้ง listener ค้างไว้บน document
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onPanelKeydown)
})
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <TopicCard
      value="asset-request"/>

    <!-- ── แถบกรอง/เรียง ──────────────────────────────────────────────────
         โครงเดียวกับหน้า Asset Inventory เป๊ะ - ช่องค้นซ้ายสุด ตามด้วยแผงตัวกรองกับปุ่มเรียง
         แล้วช่วงที่แสดงอยู่ชิดขวา -->
    <div class="mt-5 flex flex-wrap items-end gap-3">
      <label class="form-control w-full max-w-md text-left">
        <span class="mb-1 text-xs text-base-content/60">ค้นหา</span>
        <div class="input input-sm flex w-full items-center gap-2">
          <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
          <input
            v-model="searchText"
            type="search"
            class="grow"
            placeholder="เลขที่คำขอ / เลขที่ PO / ชื่อผู้ขาย"
          />
          <!-- ตัวหมุนอยู่ในช่องค้น ไม่ใช่ทับทั้งตาราง - ผลลัพธ์เดิมยังอ่านได้ระหว่างรอของใหม่ -->
          <span v-if="loading" class="loading loading-spinner loading-xs shrink-0" />
        </div>
      </label>

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
            <button class="btn btn-ghost btn-xs" :disabled="!hasFilter" @click="clearFilters">
              ล้างทั้งหมด
            </button>
          </div>

          <div class="max-h-96 overflow-y-auto p-1.5">
            <div v-for="f in FILTER_FIELDS" :key="f.key" class="rounded-btn">
              <!-- หัวข้อ: กดแล้วกาง/หุบ ตัวที่กรองอยู่มี badge กับปุ่ม × ให้ปลดได้จากตรงนี้
                   ★ "แผนก" กดไม่ได้จนกว่าจะเลือกบริษัท (ดู departmentLocked) -->
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

                <template v-else>
                  <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                    <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                    <input
                      v-model="departmentSearch"
                      type="search"
                      class="grow"
                      placeholder="ค้นแผนก"
                    />
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
                    <li
                      v-if="!filteredDepartments.length"
                      class="px-2 py-2 text-xs text-base-content/50"
                    >
                      ไม่พบแผนกที่ตรงกับคำค้น
                    </li>
                  </ul>
                </template>
              </div>
            </div>
          </div>

          <!-- ★ แผนกที่กรองคือแผนกของ "ผู้ขอซื้อ" ไม่ใช่ของคนกดส่งคำขอ - ต้องบอกไว้
               เพราะสองคนนี้เป็นคนละคนกันได้ และคอลัมน์ Request by ในตารางโชว์คนหลัง -->
          <p
            v-if="departmentId"
            class="flex items-start gap-1.5 border-t border-base-300 px-3 py-2 text-left text-xs text-base-content/60"
          >
            <Icon icon="lucide:info" class="mt-0.5 size-3.5 shrink-0" />
            กรองตามแผนกของผู้ขอซื้อบน PO ไม่ใช่แผนกของผู้ส่งคำขอ
          </p>
        </div>
      </div>

      <!-- เรียงตาม - ยืนติดกับปุ่มตัวกรอง ใช้โครงแผงเดียวกัน (ดู AppSortMenu)
           ค่าตั้งต้นคือลำดับคิว (วันอนุมัติเก่าสุดอยู่บน) กดปุ่ม "ค่าตั้งต้น" กลับมาได้เสมอ -->
      <AppSortMenu
        v-model="sort"
        v-model:direction="sortDir"
        :options="REQUEST_SORT_OPTIONS"
        default-label="เรียงตาม"
      />

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
    </div>

    <!-- ── ใบที่การแจ้งเตือนไม่ถึงปลายทาง — ซ่อนทั้งแถบเมื่อไม่มีอะไรค้าง
         โชว์ "0 รายการ" ค้างไว้จะทำให้คนชินจนวันที่มีของจริงไม่มีใครสังเกต -->
    <div v-if="stuck.length" class="mt-4">
      <div role="alert" class="alert alert-warning alert-soft items-start">
        <Icon icon="mdi:bell-alert-outline" class="size-5 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-sm">
            มี <span class="font-semibold">{{ stuck.length }}</span> ใบที่แจ้งผลกลับผู้ขอไม่ออก
           เข้าไปกดปุ่มเดิมซ้ำในใบนั้นเพื่อส่งใหม่
          </p>
        </div>
        <button type="button" class="btn btn-sm" @click="stuckOpen = !stuckOpen">
          {{ stuckOpen ? 'ซ่อน' : 'ดูรายการ' }}
        </button>
      </div>

      <div v-if="stuckOpen" class="mt-2 overflow-x-auto rounded-box border border-base-300">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Req No.</th>
              <th>PO No.</th>
              <th>อาการ</th>
              <th>สาเหตุ</th>
              <th class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in stuck" :key="s.id" class="hover:bg-base-200">
              <td class="font-mono whitespace-nowrap">#{{ s.id }}</td>
              <td class="font-mono whitespace-nowrap">{{ s.poNumber }}</td>
              <td class="whitespace-nowrap">
                <span class="badge badge-sm">
                  {{ s.kind === 'COMPLETE' ? 'แจ้งปิดงานไม่ออก' : 'แจ้งตีกลับไม่ออก' }}
                </span>
              </td>
              <td class="max-w-[26rem] truncate text-sm">{{ s.reason }}</td>
              <td class="text-center">
                <!-- ไม่มีปุ่มส่งซ้ำโดยตั้งใจ — สองอาการนี้กู้ด้วยการกดปุ่มเดิมซ้ำในใบ
                     (ส่งล้ม = ไม่ปิดรอบ) ปุ่มแยกจะกลายเป็นทางที่สองที่ต้องดูแลโดยไม่ได้อะไรเพิ่ม -->
                <button type="button" class="btn btn-xs" @click="openRequest(s.id)">เปิดใบ</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-6 overflow-x-auto rounded-box border border-base-300">
      <table class="table table-pin-rows table-freeze-first">
        <thead>
          <tr>
            <th class="freeze-col">Req No.</th>
            <th>PO No.</th>
            <th>Request by</th>
            <th>Approved by</th>
            <th>วันที่ส่งคำขอ</th>
            <th class="text-center">ชิ้น</th>
            <th class="text-center">สถานะการแก้ไข</th>
            <th class="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.requestId" class="hover:bg-base-200">
            <td class="freeze-col font-mono">#{{ r.requestId }}</td>
            <td class="font-mono">
              {{ r.poNumber }}
              <div class="text-xs font-sans text-base-content/60">{{ r.vendorName ?? '-' }}</div>
            </td>
            <td class="truncate">{{ r.submittedByName ?? '-' }}</td>
            <td class="truncate">{{ r.approvedByName ?? '-' }}</td>
            <td>{{ formatDateTime(r.submittedAt) }}</td>
            <!-- "ออกเลขแล้วกี่ชิ้น" ต้องหักทั้งที่รอบัญชีและที่รอผู้ขอ - ชิ้นที่ตีกลับยังไม่มีเลข
                 ถ้าหักแค่ pendingAssets มันจะถูกนับรวมว่าเสร็จแล้ว -->
            <td class="text-center">
              <span :class="r.pendingAssets > 0 ? 'text-warning' : 'text-success'">
                {{ r.totalAssets - r.pendingAssets - r.rejectedAssets }}/{{ r.totalAssets }}
              </span>
              <!-- ชิ้นที่รอผู้ขอแก้ = ไม่ใช่งานของบัญชีแล้ว แต่ใบยังไม่จบ ต้องแยกให้เห็น
                   ไม่งั้นบัญชีเห็นตัวเลขไม่เต็มแล้วนึกว่าตัวเองยังมีงานค้างในใบนี้ -->
              <div v-if="r.rejectedAssets > 0" class="text-xs text-warning">
                รอผู้ขอแก้ {{ r.rejectedAssets }} ชิ้น
              </div>
            </td>
            <!-- ใครแก้อยู่ - มาจากสาย lobby ไม่ใช่จาก list (list โหลดครั้งเดียว แต่ข้อมูลนี้
                 เปลี่ยนตลอดเวลา ถ้าเอามาจาก list จะค้างจนกว่าจะกดโหลดใหม่) -->
            <td class="text-center">
              <span v-if="holders[r.requestId]" class="badge badge-warning badge-soft gap-1"
                :title="`${holders[r.requestId]} กำลังแก้ไขใบนี้อยู่ - เข้าไปดูได้แต่ยังแก้ไม่ได้`">
                <Icon icon="lucide:lock" class="size-3.5" />
                {{ holders[r.requestId] }}
              </span>
              <span v-else class="text-sm text-base-content/40">ว่าง</span>
            </td>
            <!-- จุดแดงมุมขวาบนของปุ่ม = ผู้ขอแก้ชิ้นที่เราตีกลับไปแล้ว รอบัญชีตรวจซ้ำ
                 ต้องมีป้ายที่ระดับ "ใบ" เพราะการแก้ของผู้ขอเกิดหลังจากบัญชีปิดหน้าฟอร์มไปแล้ว
                 ถ้าไม่มีอะไรเตือนที่หน้าคิว บัญชีต้องเปิดเข้าไปดูทุกใบเพื่อหาว่าใบไหนมีของใหม่
                 (จุดหายเองเมื่อบัญชีตัดสินชิ้นนั้น - backend ล้าง rejectFixedAt ให้ทั้งสามปุ่ม) -->
            <td class="text-center">
              <div class="indicator">
                <span
                  v-if="r.fixedAssets > 0"
                  class="indicator-item size-2.5 rounded-full bg-error ring-2 ring-base-100"
                ></span>
                <button class="btn btn-sm"
                  :class="holders[r.requestId] ? 'btn-outline btn-neutral' : 'btn-primary'"
                  :title="r.fixedAssets > 0
                    ? `ผู้ขอแก้ชิ้นที่ตีกลับแล้ว ${r.fixedAssets} ชิ้น - ต้องตรวจซ้ำก่อนออกเลข`
                    : undefined"
                  @click="openRequest(r.requestId)">
                  <Icon :icon="holders[r.requestId] ? 'lucide:eye' : 'lucide:pencil'" class="size-4" />
                  {{ holders[r.requestId] ? 'ดู' : 'แก้ไข' }}
                </button>
              </div>
            </td>
          </tr>

          <tr v-if="loading">
            <td colspan="8" class="py-10 text-center text-base-content/50">
              <span class="loading loading-spinner loading-lg mb-2 block"></span>
              กำลังโหลด...
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td colspan="8" class="py-10 text-center text-base-content/50">
              <!-- ต้องแยกสองข้อความ - "ไม่มีใบรอออกเลข" ตอนที่กรองอยู่คือคำตอบที่ผิด
                   คิวอาจมีงานเต็มไปหมดแต่ไม่มีใบไหนตรงกับบริษัท/แผนกที่เลือก -->
              <template v-if="hasFilter">
                <p>ไม่มีใบที่ตรงกับตัวกรอง</p>
                <button class="btn btn-sm mt-3" @click="clearFilters">ล้างตัวกรอง</button>
              </template>
              <template v-else>ไม่มีใบรอออกเลข คำขอที่ผ่านการอนุมัติจะขึ้นที่นี่เอง</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppPagination v-if="total > limit" class="mt-4" :page="page" :total="total" :limit="limit"
      @update:page="onPageChange" />
  </div>
</template>
