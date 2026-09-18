<script setup lang="ts">
// หน้า Create New Asset - ลิสต์คำขอขึ้นทะเบียนของผู้ขอ
//
// ── แถบเครื่องมือใช้โครงเดียวกับ Asset Inventory: ค้น | ตัวกรอง | เรียงตาม
//
// ★ ทุกอย่างกรองที่ backend ไม่ใช่กรองแถวที่โหลดมาแล้ว - ของเดิมกรอง poNumber ในเครื่อง
//   จากผลลัพธ์ 10 แถวของหน้าปัจจุบัน ทำให้ใบที่อยู่หน้า 2 ค้นไม่เจอทั้งที่มีอยู่ และ
//   ตัวเลขบนแถบเลขหน้าก็ไม่ตรงกับสิ่งที่เห็น
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppPagination from '@/shared/components/AppPagination.vue'
import AppSortMenu from '@/shared/components/AppSortMenu.vue'
import type { SortDirection } from '@/shared/components/AppSortMenu.vue'
import CreateRequestModal from '@/pages/create-asset/components/CreateRequestModal.vue'
import AppConfirmDialog from '@/shared/components/AppConfirmDialog.vue'
import {
  listDrafts,
  leaveRequest,
  listMyStuckNotifications,
  retryNotifyApprover,
} from '@/shared/services/assetRequest.service'
import type {
  AssetRequestRow,
  AssetRequestStatus,
  ListDraftsParams,
  MyStuckRequest,
} from '@/shared/services/assetRequest.service'
import { listEmployees } from '@/shared/services/master.service'
import type { EmployeeOption } from '@/shared/services/master.service'
import { useConnectionStore } from '@/shared/stores/connection'
import { useAuthStore } from '@/shared/stores/auth'
import { getTokenRole } from '@/shared/services/auth.token'
import { canPickCompany } from '@/shared/utils/role-scope'
import { ApiError } from '@/shared/services/httpClient'
import { formatDateTime } from '@/shared/utils/date'
import { requestStatusMeta } from '@/shared/utils/request-status'
import { DRAFT_SORT_OPTIONS } from '@/shared/utils/draft-sort'
import { Icon } from '@iconify/vue'
import TopicCard from '@/shared/components/TopicCard.vue'

const router = useRouter()
const authStore = useAuthStore()

const drafts = ref<AssetRequestRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const loading = ref(false)
const loadError = ref('')

/** ข้อความในช่องค้นหา - ยังไม่ใช่คำที่ยิงไปจริง (ดู debounce ข้างล่าง) */
const searchText = ref('')

// ── ตัวกรอง ────────────────────────────────────────────────────────────────
//
// เก็บเป็น string ทุกตัวเพราะค่ามาจากปุ่มในลิสต์ ('' = ไม่กรอง) แล้วแปลงตอนส่งที่เดียว
//
// ★ ไม่มีตัวกรอง "แผนก" ที่นี่โดยตั้งใจ - อย่าเผลอเติมกลับมา
//   หน้านี้เป็นใบคำขอ ซึ่งผูกกับ PO ไม่ได้ผูกกับแผนก ลิสต์แผนกจึงต้องมาจาก /master
//   ทั้งเครือแล้วค่อยกรองด้วยบริษัทของผู้ใช้เอง - ซึ่งใช้ไม่ได้จริงสองทาง:
//   คนที่เห็นทั้งเครือได้ (ADMIN) เจอชื่อแผนกปนกันทุกบริษัท และชื่อแผนกซ้ำข้ามบริษัทจริง
//   55 ชื่อ (วัด 2026-09-03) เลือกไปก็ไม่รู้ว่าได้อันไหน
//   ★ ถ้าจะเอากลับมา ต้องให้ backend ส่ง "แผนกที่มีใบจริงอยู่" มาให้ ไม่ใช่ดึงจาก /master
const status = ref('')
/** ผู้ขอซื้อ - เก็บชื่อคู่กับ id เพราะ chip กับป้ายใต้หัวข้อต้องใช้ชื่อ ไม่ใช่เลข */
const ownerPrId = ref(0)
const ownerPrName = ref('')
/** '' = ใบที่เพิ่งเปิดล่าสุดอยู่บน (ค่าตั้งต้นของ backend) - ดู DRAFT_SORT_OPTIONS */
const sort = ref('')
const sortDir = ref<SortDirection>('desc')

/**
 * สถานะที่หน้านี้แสดง - ครบทั้งสี่ค่าของ enum request_status
 *
 *   DRAFT             ยังไม่ส่ง
 *   PENDING_APPROVAL  ส่งแล้ว รอหัวหน้าอนุมัติ
 *   APPROVED          อนุมัติแล้ว รอบัญชีออกเลข (รวมใบที่บัญชีตีกลับรายชิ้นแล้วรอผู้ขอแก้)
 *   REJECTED          หัวหน้าตีกลับทั้งใบ
 *
 * ★ ลิสต์นี้คือ "ใบของฉันตั้งแต่เปิดจนขึ้นทะเบียนจบ" ไม่ใช่แค่ใบที่ยังแก้ได้ - ใบหลุดออกจาก
 *   ลิสต์ตอนบัญชีปิดงานเท่านั้น (backend กรอง completeNotifiedAt is null ให้แล้ว ไม่ใช่หน้าที่
 *   ของตัวกรองนี้) ของเดิมไม่มี PENDING_APPROVAL ในลิสต์เลย ผลคือกด Submit ปุ๊บใบหายจากจอ
 *   ทันทีทั้งที่เพิ่งส่งไปเอง แล้วหายซ้ำอีกรอบตอนหัวหน้าอนุมัติ
 *
 * ★ ทุกตัวเลือกกรองตรงตามชื่อ - "Approved" คือใบที่อนุมัติแล้วทุกใบจริง ๆ ไม่ใช่ "อนุมัติแล้ว
 *   และยังมีชิ้นถูกตีกลับ" แบบเดิมที่อ่านจากชื่อไม่ได้
 */
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const

/** ไม่ได้เลือกสถานะ = ขอครบทุกแบบ (ต้องครบ ไม่งั้นใบบางสถานะหายจากลิสต์) */
const ALL_STATUSES = STATUS_OPTIONS.map((s) => s.value)

/**
 * ★ ตัวกันคิวรีแซงกัน - แพตเทิร์นเดียวกับ ownerSeq ของ loadOwners ข้างล่าง
 *
 * หน้านี้ยิงโหลดได้จากสามทางที่เกิดพร้อมกันได้จริง: หน่วงพิมพ์ค้น (350ms) · สาย SSE
 * (scheduleReload 400ms) · การกดเปลี่ยนตัวกรอง/หน้า และ clearFilters() ทริกสองสายพร้อมกัน
 * เสมอ (watch ตัวกรอง + watch searchText) ถ้าอันที่ยิงก่อนกลับมาช้ากว่า ตารางจะโชว์ผลของ
 * เงื่อนไขเก่าคู่กับ chip ของเงื่อนไขใหม่ โดยไม่มีอะไรฟ้อง
 */
let loadSeq = 0

async function loadDrafts(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ''
  try {
    const params: ListDraftsParams = {
      page: page.value,
      limit,
      // ไม่เลือกสถานะ = ขอครบทุกแบบ เลือกแล้วค่อยแคบลงเหลือค่าเดียว
      status: status.value ? [status.value as AssetRequestStatus] : [...ALL_STATUSES],
      search: searchText.value,
      ownerPrId: ownerPrId.value || undefined,
      sort: (sort.value || undefined) as ListDraftsParams['sort'],
      sortDir: sortDir.value,
    }

    const res = await listDrafts(params)
    // มีคำขอใหม่กว่าเกิดขึ้นระหว่างรอ - ทิ้งผลนี้ ไม่งั้นผลเก่ามาทับผลใหม่
    if (seq !== loadSeq) return

    /**
     * ★ หน้าที่กำลังดูหลุดขอบไปแล้ว (ลิสต์หดลงหลังโหลดครั้งก่อน) - ถอยไปหน้าสุดท้ายที่มีของจริง
     *
     * เกิดได้สามทาง: เอาใบออกจากลิสต์เอง · คนอื่นทำให้ลิสต์หด (สาย SSE) · ตัวกรองแคบลง
     * ถ้าไม่ถอยให้ ผู้ใช้จะเจอตารางว่างคู่กับแถบเลขหน้าที่ไม่มีปุ่มของหน้าที่ตัวเองอยู่
     * = ไม่มีทางออกนอกจากเดาว่าต้องกดเลขไหน (ลบใบสุดท้ายของหน้า 3 จาก 21 ใบ เจอเคสนี้พอดี)
     *
     * ★ ไม่วนซ้ำ: เงื่อนไขบังคับ page > lastPage และเราตั้ง page = lastPage ก่อนเรียกใหม่
     *   รอบถัดไปจึงไม่มีทางเข้าสาขานี้อีก (total = 0 ได้ lastPage = 1 ซึ่งไม่ > 1)
     */
    const lastPage = Math.max(1, Math.ceil(res.total / limit))
    if (res.data.length === 0 && page.value > lastPage) {
      page.value = lastPage
      await loadDrafts()
      return
    }

    drafts.value = res.data
    total.value = res.total
  } catch (e) {
    if (seq !== loadSeq) return
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการคำขอไม่สำเร็จ'
    drafts.value = []
    total.value = 0
  } finally {
    // รอบที่ถูกแซงไปแล้วห้ามปิดสปินเนอร์ - รอบล่าสุดยังโหลดอยู่
    // (รวมถึงตอนถอยหน้าข้างบน ซึ่งเรียกตัวเองแล้วเลข seq ขยับไปอีกรอบ)
    if (seq === loadSeq) loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  void loadDrafts()
}

// ── ตัวเลือกในแผงกรอง ──────────────────────────────────────────────────────
//
// มาจาก /master/* ไม่ใช่จากผลลัพธ์ในหน้า - ข้อมูลมาทีละหน้า ชื่อคนที่จะโผล่จึงขึ้นกับ
// ว่าบังเอิญอยู่หน้าไหน ใช้เป็นลิสต์ตัวกรองไม่ได้เลย

/**
 * บริษัทของผู้ใช้ - ใช้จำกัดรายชื่อให้เหลือเฉพาะของบริษัทตัวเอง
 *
 * ★ คนที่เลือกบริษัทไม่ได้ (พนักงานทั่วไป) สร้างคำขอได้เฉพาะ PO ของบริษัทตัวเองอยู่แล้ว
 *   (ดู assertCanOpenPoCompany ฝั่ง backend) ลิสต์ตัวกรองจึงต้องแคบตามให้ตรงกัน ไม่งั้น
 *   เขาจะเห็นชื่อคนของบริษัทที่ไม่มีวันมีใบโผล่มาเลย
 *
 * ★ role ที่เลือกบริษัทได้เห็นทั้งเครือ - ใบของเขาข้ามบริษัทได้จริง
 */
const canPickAnyCompany = computed(() => canPickCompany(getTokenRole()))
const ownCompanyCode = computed(() => authStore.user?.employee?.companyCode ?? null)
const scopedCompanyCode = computed(() =>
  canPickAnyCompany.value ? undefined : (ownCompanyCode.value ?? undefined),
)

// ── ขอซื้อโดย: ค้นที่ฝั่ง server ไม่ใช่โหลดมาทั้งหมดแล้วกรองในเครื่อง ─────────
//
// พนักงานมีหลักร้อย - ขอทีละ 8 แถวแล้วบอกว่าทั้งหมดมีกี่คน ให้ผู้ใช้พิมพ์ค้นให้แคบลงเอง
// (กติกาเดียวกับตัวกรองผู้ครอบครองบน Dashboard)
const OWNER_LIMIT = 8
const ownerSearch = ref('')
const owners = ref<EmployeeOption[]>([])
const ownerTotal = ref(0)
const ownersLoading = ref(false)
const ownersFailed = ref(false)
let ownersLoaded = false
let ownerTimer: ReturnType<typeof setTimeout> | undefined
let ownerSeq = 0

/** "แสดง 8 จาก 396 คน" - ไม่บอกจำนวนทั้งหมด คนที่หาชื่อไม่เจอจะสรุปว่าคนนั้นไม่มีในระบบ */
const ownerRangeLabel = computed(() =>
  ownerTotal.value === 0
    ? ''
    : `แสดง ${owners.value.length} จาก ${ownerTotal.value.toLocaleString('th-TH')} คน`,
)

async function loadOwners() {
  const seq = ++ownerSeq
  ownersLoading.value = true
  ownersFailed.value = false
  try {
    const res = await listEmployees({
      search: ownerSearch.value.trim() || undefined,
      companyCode: scopedCompanyCode.value,
      page: 1,
      limit: OWNER_LIMIT,
    })
    // มีคำขอใหม่กว่าเกิดขึ้นระหว่างรอ - ทิ้งผลนี้ ไม่งั้นผลเก่ามาทับผลใหม่
    if (seq !== ownerSeq) return
    owners.value = res.data
    ownerTotal.value = res.total
    ownersLoaded = true
  } catch {
    if (seq !== ownerSeq) return
    owners.value = []
    ownerTotal.value = 0
    ownersFailed.value = true
  } finally {
    if (seq === ownerSeq) ownersLoading.value = false
  }
}

watch(ownerSearch, () => {
  clearTimeout(ownerTimer)
  ownerTimer = setTimeout(loadOwners, 300)
})

// ── แผงตัวกรอง (โครงเดียวกับ Asset Inventory) ───────────────────────────────
const panelOpen = ref(false)
/** หัวข้อที่กางอยู่ - ทีละอันเพื่อไม่ให้แผงยาวจนต้องเลื่อนหา */
const expandedField = ref('')

const FILTER_FIELDS = [
  { key: 'owner', label: 'ขอซื้อโดย', icon: 'lucide:user' },
  { key: 'status', label: 'Status', icon: 'lucide:activity' },
]

function filterHasValue(key: string): boolean {
  if (key === 'owner') return !!ownerPrId.value
  return !!status.value
}

function clearField(key: string) {
  if (key === 'owner') clearOwner()
  else status.value = ''
}

/** กดตัวเลือกเดิมซ้ำ = ปลดตัวกรองนั้น (ทางเดียวที่กลับไป "ไม่กรอง" ได้จากในลิสต์) */
function toggleValue(_key: string, value: string) {
  status.value = status.value === value ? '' : value
}

function toggleOwner(emp: EmployeeOption) {
  if (ownerPrId.value === emp.id) {
    clearOwner()
    return
  }
  ownerPrId.value = emp.id
  ownerPrName.value = emp.name
}

function clearOwner() {
  ownerPrId.value = 0
  ownerPrName.value = ''
}

/** ค่าที่เลือกไว้ของแกนนั้น เป็นข้อความอ่านออก - โชว์ใต้หัวข้อตอนหุบ */
function fieldValueLabel(key: string): string {
  if (key === 'owner') return ownerPrName.value
  return STATUS_OPTIONS.find((s) => s.value === status.value)?.label ?? status.value
}

// โหลดรายชื่อตอนกางหัวข้อครั้งแรกเท่านั้น - ไม่งั้นเข้าหน้าทีไรก็ยิงขอรายชื่อทิ้งเปล่า ๆ
// ทั้งที่คนส่วนใหญ่ไม่ได้กรองด้วยผู้ขอซื้อ
watch(expandedField, (key) => {
  if (key === 'owner' && !ownersLoaded) void loadOwners()
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
 * ตัวกรองที่ใช้อยู่ - แสดงเป็น chip ให้เห็นครบโดยไม่ต้องเปิดแผง
 *
 * แผงโชว์ได้ทีละแกน ถ้าไม่มีบรรทัดนี้ คนที่กรองไว้สามแกนจะเห็นแค่แกนล่าสุด แล้วไม่รู้ว่า
 * อีกสองตัวยังบีบผลลัพธ์อยู่ (นับคำค้นด้วย เพราะมันก็จำกัดตารางเหมือนกัน)
 */
const activeFilterChips = computed(() => {
  const chips: { key: string; label: string; clear: () => void }[] = []

  const search = searchText.value.trim()
  if (search) {
    chips.push({ key: 'search', label: `ค้น: ${search}`, clear: () => (searchText.value = '') })
  }
  if (ownerPrId.value) {
    chips.push({ key: 'owner', label: `ขอซื้อโดย: ${ownerPrName.value}`, clear: clearOwner })
  }
  if (status.value) {
    chips.push({
      key: 'status',
      label: `Status: ${fieldValueLabel('status')}`,
      clear: () => (status.value = ''),
    })
  }

  return chips
})

const hasFilter = computed(() => activeFilterChips.value.length > 0)

function clearFilters() {
  searchText.value = ''
  status.value = ''
  clearOwner()
  // ไม่เรียก loadDrafts() เอง - watch ข้างล่างจับได้ครบทุกช่อง เรียกเองจะยิงซ้อนกัน
  // แล้วผลลัพธ์ที่มาทีหลังอาจเป็นของคิวรีเก่า
}

// กล่องเลือกยิงทันที ไม่ต้องหน่วง - เป็นการกดเลือกครั้งเดียว ไม่ใช่การพิมพ์รัว
// ★ ต้องรีเซ็ตกลับหน้า 1 เสมอ ค้างอยู่หน้า 3 แล้วกรองจนเหลือใบเดียวจะได้ตารางว่าง
//   และแถบเลขหน้าหายไปด้วย = ไม่มีปุ่มให้กดกลับ
watch([ownerPrId, status, sort, sortDir], () => {
  page.value = 1
  void loadDrafts()
})

// หน่วงก่อนยิงตอนพิมพ์ค้น - ไม่งั้นพิมพ์ 10 ตัวอักษรได้ 10 request
// ★ timer คนละตัวกับ reloadTimer ของสาย SSE: สองอย่างนี้ถูกทริกจากคนละเหตุ ถ้าใช้ตัวเดียวกัน
//   การพิมพ์จะไปเลื่อนคิวโหลดของ SSE ออกไปเรื่อย ๆ
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void loadDrafts()
  }, 350)
})

/** ลำดับที่กำลังแสดง เช่น "11–20 จาก 34 ใบ" */
const range = computed(() => {
  if (total.value === 0) return ''
  const start = (page.value - 1) * limit + 1
  return `${start}–${Math.min(start + limit - 1, total.value)} จาก ${total.value.toLocaleString('th-TH')} ใบ`
})

// ── มีคนเปลี่ยนอะไรที่ทำให้ลิสต์นี้เปลี่ยน → โหลดใหม่เอง ────────────────────────
//
// เคสหลักคือบัญชีตีกลับรายชิ้น: ใบนั้นเข้าลิสต์นี้เอง (listMyDrafts รวมใบ APPROVED ที่มีชิ้น
// ถูกตีกลับ) แต่เกิดตอนผู้ขอไม่ได้ทำอะไรอยู่เลย ถ้าไม่มีสัญญาณก็ต้องเดารีเฟรชว่ามีงานเข้าหรือยัง
//
// ★ ไม่เปิดสาย SSE เองที่นี่ - ใช้สายเดียวของทั้งแอปที่ store ถืออยู่แล้ว (โควตา connection
//   ของ browser มีจำกัด ดู services/sse.service.ts) หน้าที่ของหน้านี้เหลือแค่ watch ตัวนับ
const connection = useConnectionStore()
let reloadTimer: ReturnType<typeof setTimeout> | undefined

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined
    void loadDrafts()
  }, 400)
}

watch(() => connection.changeTick, scheduleReload)

// ── ใบที่ส่งไปแล้วแต่หัวหน้ายังไม่ได้รับการ์ด ────────────────────────────────
//
// ★ ต้องมีแถบนี้เพราะลิสต์ข้างล่างกรองแค่ DRAFT/REJECTED — ใบที่ส่งไปแล้วไม่โผล่ที่ไหนเลย
//   ฝั่งผู้ขอ ถ้าการ์ดไม่ถึงหัวหน้า ใบจะค้างโดยไม่มีใครรู้: ผู้ขอคิดว่าส่งแล้ว หัวหน้าไม่รู้ว่ามีงาน
//   และ submit ซ้ำก็ไม่ได้ (สถานะไม่ใช่ DRAFT/REJECTED แล้ว)
const stuck = ref<MyStuckRequest[]>([])
const retrying = ref<number | null>(null)
const retryMsg = ref('')

async function loadStuck() {
  try {
    stuck.value = await listMyStuckNotifications()
  } catch {
    // แถบเตือนพังไม่ควรลากหน้าหลักตาย — รายการคำขอยังใช้งานได้ครบ
    stuck.value = []
  }
}

async function onRetryCard(requestId: number) {
  if (retrying.value !== null) return
  retrying.value = requestId
  retryMsg.value = ''
  try {
    const res = await retryNotifyApprover(requestId)
    retryMsg.value = res.notified
      ? `ส่งการ์ดของคำขอ #${requestId} ใหม่เรียบร้อยแล้ว`
      : `ยังส่งไม่ผ่าน: ${res.notifyError ?? 'ไม่ทราบสาเหตุ'}`
    await loadStuck()
  } catch (e) {
    // ข้อความจาก backend บอกตรง ๆ ว่าต้องไปแก้อะไร (หัวหน้าไม่มีอีเมล/ไม่มีบัญชีใน AMS)
    // ต้องโชว์ตามตรง ไม่กลบเป็น "ส่งไม่สำเร็จ" เฉย ๆ
    retryMsg.value = e instanceof ApiError ? e.message : 'ส่งการ์ดซ้ำไม่สำเร็จ'
  } finally {
    retrying.value = null
  }
}

onMounted(() => {
  if (!authStore.user) void authStore.getCurrentUser().catch(() => {})
  void loadDrafts()
  void loadStuck()
})

onUnmounted(() => {
  if (reloadTimer) clearTimeout(reloadTimer)
  if (searchTimer) clearTimeout(searchTimer)
  clearTimeout(ownerTimer)
  // ต้องถอดเองด้วย - watch(panelOpen) ถอดให้เฉพาะตอนแผงถูกปิด ออกจากหน้าโดยแผงยังกางอยู่
  // จะทิ้ง listener ค้างไว้บน document
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onPanelKeydown)
})

function goForm(requestId: number) {
  router.push({ name: 'DraftForm', params: { requestId: String(requestId) } })
}

const modalOpen = ref(false)

function onCreate() {
  modalOpen.value = true
}

function onCreated(requestId: number) {
  router.push({ name: 'DraftForm', params: { requestId: String(requestId) } })
}

const confirmOpen = ref(false)
const removing = ref(false)
const target = ref<AssetRequestRow | null>(null)
const removeError = ref('')

function onDelete(row: AssetRequestRow) {
  target.value = row
  removeError.value = ''
  confirmOpen.value = true
}

async function onConfirmRemove() {
  if (!target.value) return
  removing.value = true
  removeError.value = ''
  try {
    await leaveRequest(target.value.id)
    confirmOpen.value = false
    target.value = null
    await loadDrafts()
  } catch (e) {
    removeError.value = e instanceof ApiError ? e.message : 'ทำรายการไม่สำเร็จ โปรดลองอีกครั้ง'
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <TopicCard value="create" />
      <!-- ── ใบที่ส่งไปแล้วแต่การ์ดไม่ถึงหัวหน้า — ซ่อนทั้งแถบเมื่อไม่มี
           ★ ผู้ขอเป็นคนเดียวที่รู้ว่าใบตัวเองค้าง (ลิสต์ข้างล่างกรองแค่ DRAFT/REJECTED
             ใบที่ส่งไปแล้วจึงไม่โผล่ที่ไหนเลย) และเป็นคนกดส่งซ้ำได้ด้วย -->
      <div
        v-if="stuck.length"
        role="alert"
        class="alert alert-warning alert-soft w-full items-start sm:order-last"
      >
        <Icon icon="mdi:alert-outline" class="size-5 shrink-0" />
        <div class="min-w-0 flex-1 space-y-2">
          <p class="text-sm">
            มี <span class="font-semibold">{{ stuck.length }}</span> คำขอที่ส่งไปแล้ว
            <span class="font-semibold">แต่หัวหน้ายังไม่ได้รับการ์ดขออนุมัติ</span>
            — ใบจะค้างจนกว่าจะส่งการ์ดใหม่
          </p>
          <div v-for="s in stuck" :key="s.id" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-mono">#{{ s.id }}</span>
            <span class="font-mono opacity-70">{{ s.poNumber }}</span>
            <span v-if="s.notifyError" class="max-w-[22rem] truncate opacity-70">
              {{ s.notifyError }}
            </span>
            <button
              type="button"
              class="btn btn-xs"
              :disabled="retrying !== null"
              @click="onRetryCard(s.id)"
            >
              <span v-if="retrying === s.id" class="loading loading-spinner loading-xs"></span>
              ส่งการ์ดซ้ำ
            </button>
          </div>
          <p v-if="retryMsg" class="text-sm opacity-80">{{ retryMsg }}</p>
        </div>
      </div>
    </div>

    <!-- ── แถบค้น / ตัวกรอง / เรียงตาม — โครงเดียวกับหน้า Asset Inventory ──── -->
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
              <div
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

              <!-- ค่าที่เลือกไว้ โชว์ใต้หัวข้อตอนหุบ จะได้รู้ว่ากรองด้วยอะไรโดยไม่ต้องกางดู -->
              <p
                v-if="filterHasValue(f.key) && expandedField !== f.key"
                class="px-2 pb-2 pl-8 text-left text-xs text-base-content/60"
              >
                {{ fieldValueLabel(f.key) }}
              </p>

              <div v-if="expandedField === f.key" class="px-2 pb-2">
                <template v-if="f.key === 'owner'">
                  <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                    <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                    <input
                      v-model="ownerSearch"
                      type="search"
                      class="grow"
                      placeholder="ค้นชื่อหรือรหัสพนักงาน"
                    />
                    <span v-if="ownersLoading" class="loading loading-spinner loading-xs shrink-0" />
                  </label>
                  <ul class="max-h-44 overflow-y-auto">
                    <li v-for="e in owners" :key="e.id">
                      <button
                        class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                        :class="{ 'bg-primary/10 font-medium': ownerPrId === e.id }"
                        @click="toggleOwner(e)"
                      >
                        <Icon
                          :icon="ownerPrId === e.id ? 'lucide:check' : 'lucide:minus'"
                          class="size-3.5 shrink-0"
                          :class="ownerPrId === e.id ? 'text-primary' : 'opacity-0'"
                        />
                        <span class="truncate">{{ e.name }}</span>
                        <span v-if="e.empId" class="shrink-0 text-xs opacity-50">{{ e.empId }}</span>
                      </button>
                    </li>
                    <li v-if="ownersFailed" class="px-2 py-2 text-xs text-base-content/50">
                      โหลดรายชื่อพนักงานไม่สำเร็จ
                    </li>
                    <li
                      v-else-if="!owners.length && !ownersLoading"
                      class="px-2 py-2 text-xs text-base-content/50"
                    >
                      ไม่พบพนักงานที่ตรงกับคำค้น
                    </li>
                  </ul>
                  <p v-if="ownerRangeLabel" class="mt-1.5 px-2 text-center text-xs text-base-content/50">
                    {{ ownerRangeLabel }}
                  </p>
                </template>

                <ul v-else>
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

          <!-- ★ ใบที่บัญชีตีกลับรายชิ้นยังเป็น APPROVED และ backend แถมมาให้เสมอ ต้องบอกไว้
               ไม่งั้นคนที่กรอง Status = Draft แล้วยังเห็นใบ Approved จะอ่านเป็นบั๊ก -->
          <p
            v-if="status"
            class="flex items-start gap-1.5 border-t border-base-300 px-3 py-2 text-left text-xs text-base-content/60"
          >
            <Icon icon="lucide:info" class="mt-0.5 size-3.5 shrink-0" />
            ใบที่บัญชีตีกลับรายชิ้นจะขึ้นเสมอ ไม่ว่าเลือกสถานะไหน — เป็นงานที่รอคุณแก้อยู่
          </p>
        </div>
      </div>

      <!-- เรียงตาม - ยืนติดกับปุ่มตัวกรอง ใช้โครงแผงเดียวกัน (ดู AppSortMenu) -->
      <AppSortMenu
        v-model="sort"
        v-model:direction="sortDir"
        :options="DRAFT_SORT_OPTIONS"
        default-label="เรียงตาม"
      />
            <button class="btn btn-primary btn-sm sm:order-2" @click="onCreate">
        <Icon icon="lucide:plus" />Create
      </button>
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
      <button class="btn btn-sm" @click="loadDrafts">ลองใหม่</button>
    </div>

    <!-- ── ตาราง draft ── -->
    <div class="mt-4 overflow-x-auto rounded-box border border-base-300">
      <!-- ★ --freeze-1-w ต้องเท่ากับความกว้างจริงของคอลัมน์แรก (คลาส w-20 ข้างล่าง = 5rem)
           CSS หาเองไม่ได้ ถ้าสองค่านี้ไม่ตรงกัน คอลัมน์ที่ตรึงจะซ้อนกันหรือมีช่องโหว่
           ให้เนื้อหาเลื่อนทะลุขึ้นมาตรงกลาง — แก้ค่าไหนต้องแก้คู่กันเสมอ -->
      <table class="table table-pin-rows table-freeze-first [--freeze-1-w:5rem]">
        <thead>
          <tr>
            <th class="freeze-col text-center lg:w-[10%]">Request</th>
            <th class="freeze-col-2 w-[18%] text-center">PO Number</th>
            <th class="w-[18%]">ผู้สร้าง</th>
            <th class="w-[18%]">ขอซื้อโดย</th>
            <th class="w-[18%]">แก้ล่าสุด</th>
            <th class="w-[10%] text-right">Status</th>
            <th class="w-[8%]"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in drafts"
            :key="d.id"
            class="cursor-pointer hover:bg-base-200"
            @click="goForm(d.id)"
          >
            <td class="freeze-col w-20 truncate text-center lg:w-auto">#{{ d.id }}</td>
            <td class="freeze-col-2 truncate text-center font-mono">{{ d.poNumber }}</td>
            <td class="truncate">{{ d.createdByName ?? '-' }}</td>
            <td class="truncate">{{ d.ownerPrName ?? '-' }}</td>
            <td class="truncate">{{ formatDateTime(d.updatedAt) }}</td>
            <td class="text-right">
              <div class="flex flex-wrap items-center justify-end gap-1">
                <span class="badge whitespace-nowrap" :class="requestStatusMeta(d.status).class">
                  {{ requestStatusMeta(d.status).label }}
                </span>
                <span
                  v-if="(d.rejectedAssetCount ?? 0) > 0"
                  class="badge badge-warning badge-soft badge-sm gap-1 whitespace-nowrap"
                  :title="`บัญชีตีกลับ ${d.rejectedAssetCount} ชิ้น แก้แล้วชิ้นนั้นจะกลับเข้าคิวออกเลขเอง`"
                >
                  <Icon icon="mdi:undo-variant" class="size-3.5" />
                  ตีกลับ {{ d.rejectedAssetCount }} ชิ้น
                </span>
              </div>
            </td>
            <td class="text-left">
              <div class="flex gap-1">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-square hover:text-error"
                  title="เอาออกจากรายการของฉัน"
                  @click.stop="onDelete(d)"
                >
                  <Icon icon="lucide:trash-2" class="text-lg" />
                </button>
              </div>
            </td>
          </tr>

          <!-- ว่าง / กำลังโหลด -->
          <tr v-if="loading">
            <td colspan="7" class="py-10 text-center text-base-content/50">
              <span class="loading loading-spinner loading-lg mb-2 block"></span>
              กำลังโหลด...
            </td>
          </tr>
          <tr v-else-if="drafts.length === 0">
            <td colspan="7" class="py-10 text-center text-base-content/50">
              <!-- ★ ต้องแยกสองข้อความ - "ยังไม่มีคำขอค้างอยู่" ตอนที่กรองอยู่คือคำตอบที่ผิด
                   ลิสต์อาจมีใบเต็มไปหมดแต่ไม่มีใบไหนตรงกับเงื่อนไข -->
              <template v-if="hasFilter">
                <p>ไม่พบคำขอที่ตรงกับเงื่อนไข</p>
                <button class="btn btn-sm mt-3" @click="clearFilters">ล้างตัวกรอง</button>
              </template>
              <template v-else>ยังไม่มีคำขอค้างอยู่ กด “Create” เพื่อเริ่มใบใหม่</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── pagination ── -->
    <AppPagination
      v-if="total > limit"
      class="mt-4"
      :page="page"
      :total="total"
      :limit="limit"
      @update:page="onPageChange"
    />

    <!-- ── modal ── -->
    <CreateRequestModal v-model:open="modalOpen" title="สร้างคำขอใหม่" @created="onCreated" />

    <!-- ── ยืนยันการเอาออกจากลิสต์ ── -->
    <AppConfirmDialog
      v-model="confirmOpen"
      variant="warning"
      title="เอาออกจากรายการของฉัน?"
      confirm-text="เอาออก"
      :loading="removing"
      @confirm="onConfirmRemove"
    >
      <div class="space-y-2">
        <p class="font-medium">
          คำขอ <span>#{{ target?.id }}</span> · PO <span>{{ target?.poNumber }}</span>
          <span v-if="(target?.assetCount ?? 0) > 0">
            <br />กรอกข้อมูลแล้ว {{ target?.assetCount }} ชิ้น
          </span>
        </p>
        <p class="text-md">
          คำขอนี้จะถูกซ่อนจากรายการของคุณเท่านั้น (ไม่ได้ถูกลบ และผู้ใช้อื่นยังคงใช้งานได้ตามปกติ)
          หากต้องการนำกลับมาที่รายการของคุณอีกครั้ง สามารถค้นหาด้วยรหัส
          <span class="font-medium">{{ target?.poNumber }}</span>
        </p>
        <div v-if="removeError" role="alert" class="alert alert-error alert-soft">
          <span>{{ removeError }}</span>
        </div>
      </div>
    </AppConfirmDialog>
  </div>
</template>
