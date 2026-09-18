<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════════════════
// Asset summary - คู่แฝดของชีต Asset-สรุป / DEP-สรุป ในไฟล์ของ finance
//
// ── ★ ทำไมแยกจาก Dashboard
//
// Dashboard ตอบ "ตอนนี้เป็นยังไง" จึงล็อกที่งวดล่าสุดที่บัญชีปิด หน้านี้ตอบ "งวด 1-5 ของ
// ปี 2569 เป็นยังไง" ซึ่งต้องย้อนงวดได้ เพราะคนเอาไปกระทบยอดกับไฟล์ที่ finance ออกไว้
// เดือนก่อน ๆ - ถ้ายัดเข้า Dashboard ตัวเลือกงวดจะไปเปลี่ยนความหมายของทั้งหน้านั้น
//
// ── ★ ปุ่มสลับตารางไม่ยิง API ใหม่
//
// backend ส่ง byAssetClass กับ depreciationByPeriod มาในก้อนเดียว (ดู /dashboard/asset-summary)
// เพราะสองชีตอ่านจากข้อมูลชุดเดียวกัน แค่ group คนละแกน - กดสลับแล้วตัวเลขไม่กะพริบ
//
// ── ★ ช่วงงวดต้องมาจากข้อมูลจริง ห้ามปั้น 1-12
//
// แต่ละบริษัทปิดงวดไม่พร้อมกัน (UBA/UBP ถึงงวด 8 · MIG ถึงงวด 1) ถ้าให้เลือกถึง 12 ได้
// ผู้ใช้จะเลือกแล้วเจอตารางว่างโดยไม่รู้ว่าเพราะบัญชียังไม่ปิดงวด ไม่ใช่เพราะไม่มีของ
// ═══════════════════════════════════════════════════════════════════════════
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import {
  getAssetSummary,
  type AssetSummaryReport,
  type AssetSummaryRow,
  type DepSummaryRow,
} from '@/shared/services/dashboard.service'
import { listCompanies, type CompanyOption } from '@/shared/services/master.service'
import AppPagination from '@/shared/components/AppPagination.vue'
import { formatMoney } from '@/shared/utils/money'
import { formatDate } from '@/shared/utils/date'
import { ApiError } from '@/shared/services/httpClient'
import TopicCard from '@/shared/components/TopicCard.vue'
import AssetSummaryTable from '@/pages/asset-summary/components/AssetSummaryTable.vue'
import DepSummaryTable from '@/pages/asset-summary/components/DepSummaryTable.vue'
import AssetPiecesModal from '@/pages/asset-summary/components/AssetPiecesModal.vue'
import DepPiecesModal from '@/pages/asset-summary/components/DepPiecesModal.vue'
import {
  ASSET_COLUMNS,
  cellText,
  labelOf,
  type Sheet,
  type SortDirection,
} from '@/pages/asset-summary/asset-summary.helpers'


/**
 * ท่อนที่ 2 ของรหัสบัญชี = ที่ตั้ง
 *
 * ★ มีสามค่าเท่านั้นในข้อมูลจริง (วัด 2026-09-16 จาก gl_account ทั้ง 75 รหัส) - ค่าที่ไม่รู้จัก
 *   ให้โชว์ตัวเลขดิบ ห้ามเดาชื่อให้ ถ้าวันหนึ่งบัญชีเปิดโรงงานที่สาม ตัวกรองจะมีตัวเลือก
 *   เพิ่มมาเองโดยขึ้นเป็นเลข ซึ่งอ่านออกและไม่ผิด ต่างจากการ map ผิดเป็นชื่อโรงงานเดิม
 */
const SITE_LABELS: Record<string, string> = {
  '0': 'สำนักงาน',
  '1': 'โรงงาน',
  '4': 'บางปู',
}

const data = ref<AssetSummaryReport | null>(null)
const companies = ref<CompanyOption[]>([])
const loading = ref(false)
const loadError = ref('')
const sheet = ref<Sheet>('asset')

/**
 * บริษัทที่เลือกเป็นค่าตั้งต้น — '' = ทุกบริษัท (ตรงกับ scope.companyCode === null)
 *
 * ★★ หน้านี้ตั้งต้นที่ "บริษัทเดียว" ไม่ใช่ "ทุกบริษัท" โดยตั้งใจ
 *
 * ทั้งสองตารางจัดกลุ่มด้วย assetClass ซึ่ง **ไม่ซ้ำกันภายในบริษัทเดียว แต่ซ้ำข้ามบริษัท**
 * (UBA กับ UBP ใช้รหัสร่วมกัน 8 รหัส) พอดูทุกบริษัทพร้อมกันจึงเกิดสองอาการ:
 *   - Asset-สรุป เอาเงินของสองบริษัทมาบวกกันในแถวเดียว
 *   - DEP-สรุป เอาใบสำคัญของสองบริษัทมากองรวม (งวด 8: 5 แถวที่มี 2 ใบ) ซึ่งพังกติกา
 *     "1 บัญชี 1 งวด 1 ใบ" และทำให้เอาไปกระทบยอดกับสมุดรายวันไม่ได้เลย
 *
 * รายงานของ finance ก็ออกทีละบริษัทอยู่แล้ว ค่าตั้งต้นจึงควรตรงกับวิธีใช้จริง
 */
const DEFAULT_COMPANY_CODE = 'UBA'
const selectedCompany = ref('')

/**
 * กันโหลดซ้ำตอนเปิดหน้า — ตั้งค่าบริษัทตั้งต้นจะไปกระตุ้น watch ที่เฝ้าตัวกรองอยู่
 * ถ้าไม่กั้น จะยิง API สองครั้งต่อการเปิดหน้าหนึ่งครั้ง (และครั้งแรกเป็นคู่ที่ยังไม่ถูก)
 */
const ready = ref(false)
const selectedYear = ref<number | null>(null)
const fromPeriod = ref<number | null>(null)
const toPeriod = ref<number | null>(null)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAssetSummary({
      companyCode: selectedCompany.value || undefined,
      fiscalYear: selectedYear.value ?? undefined,
      fromPeriod: fromPeriod.value ?? undefined,
      toPeriod: toPeriod.value ?? undefined,
    })
    data.value = res
    // ★ เขียนค่ากลับจาก response ไม่ใช่เชื่อค่าที่ส่งไป - backend หนีบช่วงงวดให้อยู่ในที่มี
    //   ข้อมูลจริง ถ้าไม่เขียนกลับ ช่องเลือกจะโชว์งวดที่ไม่ตรงกับตัวเลขในตาราง
    selectedCompany.value = res.scope.companyCode ?? ''
    selectedYear.value = res.fiscalYear
    fromPeriod.value = res.fromPeriod
    toPeriod.value = res.toPeriod
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายงานไม่สำเร็จ'
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // ลิสต์บริษัทมาจาก master ไม่ใช่จากรายงาน - รายงานถูกกรองด้วยบริษัทที่เลือกอยู่แล้ว
  // เอามาทำตัวเลือกจะกลายเป็นเลือกได้ครั้งเดียวแล้วกดกลับไม่ได้
  companies.value = await listCompanies().catch(() => [])

  // ★ หยิบจากลิสต์จริง ไม่ฮาร์ดโค้ดรหัสลงไปตรง ๆ - ถ้าวันหนึ่งไม่มี UBA ในระบบ
  //   การส่งรหัสที่ไม่มีอยู่ไปจะได้ 404 แล้วหน้าจอว่างทั้งหน้าตั้งแต่เปิด
  //   ไม่เจอก็ถอยไปบริษัทแรกในลิสต์ ยังดีกว่าตั้งต้นที่ "ทุกบริษัท" ซึ่งอ่านผิดได้ (ดู DEFAULT_COMPANY_CODE)
  const preferred = companies.value.find((c) => c.code === DEFAULT_COMPANY_CODE)
  selectedCompany.value = (preferred ?? companies.value[0])?.code ?? ''

  await load()
  ready.value = true
})

watch([selectedCompany, selectedYear, fromPeriod, toPeriod], (next, prev) => {
  if (!ready.value) return
  if (next.some((value, i) => value !== prev[i])) void load()
})

const yearOptions = computed(() => data.value?.periodOptions ?? [])

/** งวดที่เลือกได้ของปีที่เลือกอยู่ - มาจาก min/max ที่ backend วัดจากข้อมูลจริง */
const periodChoices = computed(() => {
  const option = yearOptions.value.find((o) => o.fiscalYear === selectedYear.value)
  if (!option) return [] as number[]
  return Array.from(
    { length: option.maxPeriod - option.minPeriod + 1 },
    (_, i) => option.minPeriod + i,
  )
})

const dataThrough = computed(
  () => yearOptions.value.find((o) => o.fiscalYear === selectedYear.value)?.lastToDate ?? null,
)


/** แถว "ยังไม่ระบุ" ไปท้ายเสมอ - filter สองรอบเพื่อคงลำดับที่ backend เรียงมาให้ */
function unassignedLast<T extends { assetClass: string | null }>(rows: T[]): T[] {
  return [...rows.filter((r) => r.assetClass !== null), ...rows.filter((r) => r.assetClass === null)]
}

const allAssetRows = computed(() => unassignedLast(data.value?.byAssetClass ?? []))
const depRows = computed(() => unassignedLast(data.value?.depreciationByPeriod ?? []))

// ── ค้นหา / ตัวกรอง / เรียง — ทำฝั่งจอทั้งหมด ───────────────────────────────
//
// ★★ ไม่ยิง API ใหม่โดยตั้งใจ — ตารางนี้มีไม่เกิน ~60 แถวต่อบริษัท (UBA 46) ซึ่งลงมา
//    ครบอยู่แล้วในก้อนเดียว กรอง/เรียงฝั่งจอจึงได้ผลทันทีไม่มี loading และไม่ไปเพิ่ม
//    ภาระให้ DB ที่คนทั้งบริษัทใช้อยู่ — ต่างจากหน้าทะเบียนที่มีหลักพันแถวจึงต้องทำฝั่ง backend
//
// ★ "บริษัท" กับ "งวด" ยังเป็นของ backend เหมือนเดิม — สองตัวนั้นเปลี่ยน**ชุดข้อมูล**
//   ส่วนสามตัวนี้แค่ย่อสิ่งที่มีอยู่แล้วให้แคบลง คนละเรื่องกัน
/**
 * ★★ ตัวกรองใช้ร่วมกันทั้งสองแท็บ และอยู่ **เหนือแท็บ**
 *
 * แกนของตัวกรองทั้งสี่ (คำค้น / Asset class / ที่ตั้ง / แผนก) แกะมาจากรหัสบัญชีชุดเดียวกัน
 * ไม่ได้ต่างกันตาม grain — สิ่งที่ต่างกันจริงคือ **คอลัมน์** กับ **การเรียง**
 *
 * ★ งานหลักของหน้านี้คือกระทบยอด: กรองบัญชีหนึ่ง → ดูยอดสะสมใน Asset-สรุป → สลับไปดู
 *   ค่าเสื่อมของงวดใน DEP-สรุป → กลับมา ถ้าตัวกรองแยกกันต้องตั้งซ้ำทุกครั้งที่สลับ
 *   ท่าที่ใช้บ่อยที่สุดจะกลายเป็นท่าที่เสียดสีที่สุด
 *
 * ★ อยู่เหนือแท็บเพราะเป็น "ขอบเขต" เหมือนบริษัท/งวด — กติกาของหน้านี้จึงเหลือข้อเดียว:
 *   **เหนือแท็บ = ขอบเขต · ในแท็บ = มุมมอง** (เคยวางไว้ในการ์ดแล้วหน้าจอมีสองชั้นที่ขัดกันเอง
 *   บริษัท/งวดใช้ร่วม แต่ตัวกรองแยก คนใช้ต้องจำว่าอันไหนเป็นอันไหน)
 */
const f = reactive({
  search: '',
  /** ท่อนที่ 1 ของรหัสบัญชี = หมวด (1216301) */
  category: '',
  /** ท่อนที่ 2 = ที่ตั้ง (0 สนง. / 1 โรงงาน / 4 บางปู) */
  site: '',
  /** ท่อนที่ 3 = รหัส cost center = แผนก */
  department: '',
})

/**
 * ★ การเรียงเป็นตัวเดียวที่ยังแยกต่อแท็บ — ตรงนี้ grain ต่างกันจริง
 *
 * Asset-สรุป เรียงได้ 10 แกน · DEP-สรุป มีคอลัมน์ตัวเลขแค่ 2 ถ้าใช้ค่าร่วมกันแล้วเรียงด้วย
 * 'APC on Start' อยู่ตอนสลับไป DEP-สรุป ตารางจะกลับไปเรียงค่าเริ่มต้นเงียบ ๆ ขณะที่ปุ่ม
 * ยังเขียนว่าเรียงด้วย APC on Start อยู่
 */
const sorts = reactive<Record<Sheet, { value: string; dir: SortDirection }>>({
  asset: { value: '', dir: 'desc' },
  dep: { value: '', dir: 'desc' },
})

const sortValue = computed({
  get: () => sorts[sheet.value].value,
  set: (value: string) => (sorts[sheet.value].value = value),
})
const sortDir = computed({
  get: () => sorts[sheet.value].dir,
  set: (value: SortDirection) => (sorts[sheet.value].dir = value),
})


/**
 * ── คอลัมน์ที่เปิดอยู่
 *
 * ★ ตารางนี้กว้าง 15 คอลัมน์เมื่อเปิดครบ — คนใช้จริงดูทีละกลุ่ม (ยอดยกมา / ความเคลื่อนไหว /
 *   ยอดปลายงวด) การซ่อนคอลัมน์ที่ไม่ได้ดูช่วยให้เลื่อนแนวนอนน้อยลงมาก
 * ★ ซ่อนแล้วไม่ได้หายจากยอดรวม — Total ยังรวมทุกคอลัมน์ที่เปิดอยู่เท่านั้น (ตรงกับที่เห็น)
 *   ส่วนการกรอง/เรียงไม่เกี่ยวกับการซ่อน คอลัมน์ที่ซ่อนอยู่ยังถูกเรียงได้ถ้าเคยเลือกไว้
 */
const visibleCols = reactive<Record<string, boolean>>(
  Object.fromEntries(ASSET_COLUMNS.map((c) => [c.key, c.on])),
)

const shownColumns = computed(() => ASSET_COLUMNS.filter((c) => visibleCols[c.key]))

const colPanelOpen = ref(false)
const colPanelRef = ref<HTMLElement | null>(null)

function resetColumns() {
  for (const col of ASSET_COLUMNS) visibleCols[col.key] = col.on
}

// ปิดแผงเมื่อคลิกนอก/กด Escape — กติกาเดียวกับแผงตัวกรองข้าง ๆ กัน
function onColPointerDown(e: PointerEvent) {
  if (!colPanelOpen.value) return
  if (colPanelRef.value && !colPanelRef.value.contains(e.target as Node)) colPanelOpen.value = false
}

function onColKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && colPanelOpen.value) colPanelOpen.value = false
}

watch(colPanelOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onColPointerDown)
    document.addEventListener('keydown', onColKeydown)
  } else {
    document.removeEventListener('pointerdown', onColPointerDown)
    document.removeEventListener('keydown', onColKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onColPointerDown)
  document.removeEventListener('keydown', onColKeydown)
})



/**
 * กดหัวคอลัมน์ = วน 3 สถานะ **ขึ้น → ลง → ยกเลิก**
 *
 * ★ "ยกเลิก" ต้องมี ไม่ใช่วนแค่ขึ้น-ลง — ลำดับตั้งต้น (เรียงตามรหัสบัญชี) คือลำดับที่ตรงกับ
 *   ไฟล์ของ finance ถ้ากดแล้วกลับไม่ได้ ผู้ใช้ที่เผลอกดจะเทียบทีละบรรทัดกับ Excel ไม่ได้อีก
 *   จนกว่าจะรีโหลดหน้า
 * ★ เริ่มที่ "ขึ้น" ตามที่สั่งไว้ — ไม่ใช่ desc-first แบบตารางเงินทั่วไป
 */
function toggleSort(key: string) {
  const order = sorts[sheet.value]
  if (order.value !== key) {
    order.value = key
    order.dir = 'asc'
    return
  }
  if (order.dir === 'asc') {
    order.dir = 'desc'
    return
  }
  order.value = ''
  order.dir = 'asc'
}



const segmentOf = (assetClass: string | null, index: 1 | 2 | 3) =>
  assetClass?.split('-')[index - 1] ?? ''

/**
 * ตัวเลือกของตัวกรอง — สร้างจากแถวทั้งหมดที่โหลดมา ไม่ใช่จากแถวที่ผ่านตัวกรองแล้ว
 *
 * ★ ถ้าสร้างจากแถวที่กรองแล้ว ตัวเลือกจะหายไปทีละตัวตามที่ผู้ใช้เลือก แล้วกดกลับไม่ได้
 *   (เลือกโรงงาน → ตัวเลือก "สำนักงาน" หายจากลิสต์ทันที)
 */
/** แถวที่มีรูปร่างพอให้กรอง/เรียงได้ — ใช้ร่วมกันทั้งสองชีต */
type FilterableRow = { assetClass: string | null; accountName: string | null }

function optionsOf<T extends FilterableRow>(
  rows: T[],
  index: 1 | 2 | 3,
  labelOfRow: (row: T) => string | null,
) {
  const map = new Map<string, string>()
  for (const row of rows) {
    const code = segmentOf(row.assetClass, index)
    if (!code) continue
    // ชื่อยังไม่มีก็ใช้รหัสไปก่อน — รหัสดิบอ่านออก ต่างจากการซ่อนตัวเลือกทิ้ง
    if (!map.has(code)) map.set(code, labelOfRow(row) ?? code)
  }
  return [...map.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * ★ ตัวเลือกมาจากแถวของ**ชีตที่เปิดอยู่** ไม่ใช่ของ Asset-สรุป เสมอ
 *
 * DEP-สรุป มีเฉพาะชั้นบัญชีที่มีค่าเสื่อมในงวดนั้น (UBA งวด 8 = 29 จาก 46) ถ้าเอาตัวเลือก
 * ของ Asset-สรุป มาใช้ จะมีตัวเลือกที่กดแล้วได้ตารางว่างโดยไม่มีอะไรบอกว่าทำไม
 *
 * ★ แต่ยังสร้างจากแถว "ก่อนกรอง" ของชีตนั้น — ไม่งั้นตัวเลือกจะหายไปทีละตัวตามที่เลือก
 */
const categoryOptions = computed(() =>
  sheet.value === 'asset'
    ? optionsOf(allAssetRows.value, 1, (r) => r.categoryName)
    : optionsOf(depRows.value, 1, () => null),
)
const siteOptions = computed(() => {
  const rows: FilterableRow[] = sheet.value === 'asset' ? allAssetRows.value : depRows.value
  return optionsOf(rows, 2, (r) => SITE_LABELS[segmentOf(r.assetClass, 2)] ?? null)
})
const departmentOptions = computed(() =>
  sheet.value === 'asset'
    ? optionsOf(allAssetRows.value, 3, (r) => r.departmentName)
    : optionsOf(depRows.value, 3, () => null),
)

/**
 * กรอง + เรียง — ตัวเดียวใช้ได้ทั้งสองชีตเพราะทั้งคู่มี assetClass/accountName เหมือนกัน
 *
 * ★ null ลงท้ายเสมอไม่ว่าจะเรียงทางไหน — null แปลว่า "ไม่มีตัวเลขบัญชี" ไม่ใช่ค่าน้อยสุด
 *   ถ้าปล่อยให้ถูกเรียงเหมือน 0 แถวที่ยังไม่มีข้อมูลจะไปยืนหัวตารางตอนเรียงน้อย→มาก
 */
function applyFilter<T extends FilterableRow>(
  rows: T[],
  order: { value: string; dir: SortDirection },
): T[] {
  const q = f.search.trim().toLowerCase()

  const filtered = rows.filter((row) => {
    if (f.category && segmentOf(row.assetClass, 1) !== f.category) return false
    if (f.site && segmentOf(row.assetClass, 2) !== f.site) return false
    if (f.department && segmentOf(row.assetClass, 3) !== f.department) return false
    if (!q) return true
    // ค้นทั้งรหัสและชื่อบัญชี — คนจำได้อย่างใดอย่างหนึ่ง ไม่ใช่ทั้งคู่
    return (
      (row.assetClass ?? '').toLowerCase().includes(q) ||
      (row.accountName ?? '').toLowerCase().includes(q)
    )
  })

  if (!order.value) return filtered

  const dir = order.dir === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    const x = (a as Record<string, unknown>)[order.value]
    const y = (b as Record<string, unknown>)[order.value]

    // ★ null ลงท้ายเสมอไม่ว่าจะเรียงทางไหน — null แปลว่า "ไม่มีค่า" ไม่ใช่ค่าน้อยสุด
    //   ถ้าปล่อยให้ถูกเรียงเหมือน 0 แถวที่ยังไม่มีข้อมูลจะไปยืนหัวตารางตอนเรียงน้อย→มาก
    const empty = (v: unknown) => v === null || v === undefined || v === ''
    if (empty(x) && empty(y)) return 0
    if (empty(x)) return 1
    if (empty(y)) return -1

    // Journal Entry เป็นสตริง (เลขใบสำคัญ) ที่เหลือเป็นตัวเลข — เทียบคนละแบบ
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x).localeCompare(String(y), 'th') * dir
  })
}

const assetRows = computed(() => applyFilter(allAssetRows.value, sorts.asset))
const depFilteredRows = computed(() => applyFilter(depRows.value, sorts.dep))

// ── แผงตัวกรอง — โครงเดียวกับหน้า Asset Inventory ───────────────────────────
//
// ★ ใช้แผงเดียวที่กางเลือกค่าได้ในตัว ไม่ใช่ <select> เรียงกันเป็นแถว — สองหน้านี้เป็น
//   "ตารางที่ต้องกรอง" เหมือนกัน ถ้าหน้าตาคนละแบบคนจะอ่านเป็นของคนละระบบแล้วต้องเรียนรู้ใหม่
// ★ บริษัทกับงวดอยู่ในแผงเดียวกับตัวกรองอื่น แต่**ยิง API ใหม่**เมื่อเปลี่ยน ต่างจาก
//   Asset class / ที่ตั้ง / แผนก ที่กรองฝั่งจอทันที — เขียนกำกับไว้ในแผงให้เห็น
const panelOpen = ref(false)
const panelRef = ref<HTMLElement | null>(null)
/** หัวข้อที่กางอยู่ - ทีละอันเพื่อไม่ให้แผงยาวจนต้องเลื่อนหา */
const expandedField = ref('')
/** ช่องค้นในแผง - กรองรายชื่อ "หัวข้อตัวกรอง" ไม่ใช่กรองข้อมูลในตาราง */
const filterSearch = ref('')
const categorySearch = ref('')
const departmentSearch = ref('')

// ★ ไม่มี 'period' ในลิสต์นี้ — งวดบัญชีแยกออกไปเป็นกลุ่มของตัวเองบนแถบ
//   เหตุผล: มันเลือกเป็น **ช่วง** (ปี + จาก–ถึง) ไม่ใช่ค่าเดียวแบบหัวข้ออื่น และเป็นตัวที่
//   ผู้ใช้เปลี่ยนบ่อยที่สุดเวลากระทบยอดกับไฟล์ของ finance — ฝังไว้ในแผงที่ต้องกดสองชั้น
//   กว่าจะถึง ทำให้งานที่ทำบ่อยที่สุดกลายเป็นงานที่เข้าถึงยากที่สุด
/**
 * ★★ clearable: false = แกนที่ "ต้องมีค่าเสมอ" ปลดไม่ได้ทุกทาง
 *
 * บริษัทเป็นแบบนั้นเพราะทั้งสองตารางจัดกลุ่มด้วย assetClass ซึ่งซ้ำกันข้ามบริษัทจริง
 * (UBA กับ UBP ใช้รหัสร่วมกัน 8 รหัส) — พอไม่เลือกบริษัท Asset-สรุป จะเอาเงินของสอง
 * บริษัทมาบวกกันในแถวเดียว และ DEP-สรุป จะเอาใบสำคัญมากองรวมจนพังกติกา
 * "1 บัญชี 1 งวด 1 ใบ" (ดูเหตุผลเต็มที่ DEFAULT_COMPANY_CODE)
 *
 * ★ สถานะ "ไม่เลือกบริษัท" จึงไม่ใช่มุมมองที่ถูกต้องของรายงานนี้เลย ไม่ใช่แค่ไม่สะดวก
 */
const FILTER_FIELDS = [
  { key: 'company', label: 'บริษัท', icon: 'lucide:building-2', clearable: false },
  { key: 'assetClass', label: 'Asset class', icon: 'lucide:layers', clearable: true },
  { key: 'site', label: 'ที่ตั้ง', icon: 'lucide:map-pin', clearable: true },
  { key: 'department', label: 'แผนก', icon: 'lucide:users', clearable: true },
] as const

const visibleFields = computed(() => {
  const q = filterSearch.value.trim().toLowerCase()
  return q
    ? FILTER_FIELDS.filter((field) => field.label.toLowerCase().includes(q))
    : FILTER_FIELDS
})

/**
 * แกนไหนมีค่าอยู่ - เอาไปขึ้น badge บนหัวข้อในแผง
 *
 * ★ 'period' ไม่เคยว่าง (ต้องมีงวดเสมอถึงจะมีตัวเลข) จึงไม่นับเป็น "ตัวกรองที่ใช้อยู่"
 *   และไม่มีปุ่มปลด — ปลดแล้วจะไม่เหลืออะไรให้แสดง
 */
function filterHasValue(key: string): boolean {
  switch (key) {
    case 'company':
      return selectedCompany.value !== ''
    case 'assetClass':
      return f.category !== ''
    case 'site':
      return f.site !== ''
    case 'department':
      return f.department !== ''
    default:
      return false
  }
}

function clearField(key: string) {
  // ★ บริษัทปลดไม่ได้ (ดู FILTER_FIELDS) — กันไว้ที่นี่ด้วย ไม่ใช่พึ่งแค่การซ่อนปุ่มใน
  //   template เพราะยังมีทางเรียกจาก chip และจากโค้ดอื่นที่เพิ่มทีหลัง
  if (key === 'company') return
  if (key === 'assetClass') f.category = ''
  if (key === 'site') f.site = ''
  if (key === 'department') f.department = ''
}

const labelIn = (options: { code: string; label: string }[], code: string) =>
  options.find((o) => o.code === code)?.label ?? code

/** ค่าที่เลือกไว้ โชว์ใต้หัวข้อตอนหุบ จะได้รู้ว่ากรองด้วยอะไรโดยไม่ต้องกางดู */
function fieldValueLabel(key: string): string {
  switch (key) {
    case 'company':
      return companies.value.find((c) => c.code === selectedCompany.value)?.name ?? selectedCompany.value
    case 'assetClass':
      return `${f.category} · ${labelIn(categoryOptions.value, f.category)}`
    case 'site':
      return labelIn(siteOptions.value, f.site)
    case 'department':
      return `${f.department} · ${labelIn(departmentOptions.value, f.department)}`
    default:
      return ''
  }
}

/** กดค่าเดิมซ้ำ = ปลดตัวกรองนั้น (ทางเดียวที่จะเลิกกรองได้จากในลิสต์ กติกาเดียวกับหน้าทะเบียน) */
function toggleValue(key: string, value: string) {
  const same = key === 'company'
    ? selectedCompany.value === value
    : key === 'assetClass'
      ? f.category === value
      : key === 'site'
        ? f.site === value
        : f.department === value

  // ★ บริษัทกดซ้ำแล้ว "ไม่ปลด" — นี่คือบั๊กที่รายงานมา: กดบริษัทที่เลือกอยู่ซ้ำหนึ่งครั้ง
  //   แล้วตกไปอยู่มุมมองข้ามบริษัทที่ตัวเลขอ่านผิด โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
  if (key === 'company') {
    selectedCompany.value = value
    return
  }

  const next = same ? '' : value
  if (key === 'assetClass') f.category = next
  if (key === 'site') f.site = next
  if (key === 'department') f.department = next
}

const filteredCategoryOptions = computed(() => {
  const q = categorySearch.value.trim().toLowerCase()
  if (!q) return categoryOptions.value
  return categoryOptions.value.filter(
    (o) => o.code.includes(q) || o.label.toLowerCase().includes(q),
  )
})

const filteredDepartmentOptions = computed(() => {
  const q = departmentSearch.value.trim().toLowerCase()
  if (!q) return departmentOptions.value
  return departmentOptions.value.filter(
    (o) => o.code.includes(q) || o.label.toLowerCase().includes(q),
  )
})

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

/** ตัวกรองที่ใช้อยู่ - เห็นได้โดยไม่ต้องเปิดแผง กดที่ตัวไหนก็ปลดตัวนั้น */
const activeFilterChips = computed(() => {
  // ★ clearable ติดมากับ chip ด้วย — แกนที่ปลดไม่ได้ (บริษัท) ต้อง "นับ" เข้า badge
  //   เหมือนเดิม แต่ต้องไม่วาดกากบาทให้ ไม่งั้นเป็นปุ่มที่กดแล้วไม่เกิดอะไรขึ้น
  const chips: { key: string; label: string; clearable: boolean; clear: () => void }[] = []

  const search = f.search.trim()
  if (search) {
    chips.push({ key: 'search', label: `ค้น: ${search}`, clearable: true, clear: () => (f.search = '') })
  }

  for (const field of FILTER_FIELDS) {
    if (!filterHasValue(field.key)) continue
    chips.push({
      key: field.key,
      label: `${field.label}: ${fieldValueLabel(field.key)}`,
      clearable: field.clearable,
      clear: () => clearField(field.key),
    })
  }
  return chips
})

const hasFilter = computed(() => activeFilterChips.value.length > 0)

function clearFilters() {
  f.search = ''
  f.category = ''
  f.site = ''
  f.department = ''
  // ★ บริษัทกลับไปที่ "ค่าตั้งต้น" ไม่ใช่ "ทุกบริษัท" — ล้างเป็นค่าว่างจะพาผู้ใช้ไปอยู่ใน
  //   มุมมองข้ามบริษัทที่ตัวเลขอ่านผิดได้ ทั้งที่เขาแค่อยากล้างตัวกรองที่ตัวเองใส่ไว้
  const preferred = companies.value.find((c) => c.code === DEFAULT_COMPANY_CODE)
  selectedCompany.value = (preferred ?? companies.value[0])?.code ?? ''
}

// ── แบ่งหน้า ────────────────────────────────────────────────────────────────
//
// นับหน้าแยกกันสองชีต - จำนวนแถวไม่เท่ากัน (Asset-สรุป = ทุกชั้นบัญชี ·
// DEP-สรุป = เฉพาะชั้นที่มีค่าเสื่อมในงวดนั้น) ใช้เลขหน้าร่วมกันแล้วสลับชีต
// จะเด้งไปหน้าที่ไม่มีอยู่ของอีกชีต
const PAGE_SIZE = 15
const assetPage = ref(1)
const depPage = ref(1)

const pagedAssetRows = computed(() =>
  assetRows.value.slice((assetPage.value - 1) * PAGE_SIZE, assetPage.value * PAGE_SIZE),
)
const pagedDepRows = computed(() =>
  depFilteredRows.value.slice((depPage.value - 1) * PAGE_SIZE, depPage.value * PAGE_SIZE),
)

// เปลี่ยนขอบเขต/งวด = ชุดแถวคนละชุด ต้องกลับหน้า 1 ไม่งั้นค้างอยู่หน้าที่ชุดใหม่ไม่มี
// แล้วตารางว่างโดยที่ปุ่มแบ่งหน้าบอกว่ายังมีข้อมูล
watch([assetRows, depFilteredRows], () => {
  assetPage.value = 1
  depPage.value = 1
})

// ── เลือกแถวไว้คั่นสายตา ─────────────────────────────────────────────────────
//
// ไม่ใช่การเลือกเพื่อสั่งงานอะไรต่อ (ไม่มี bulk action) — ตารางนี้กว้างจนต้องเลื่อนแนวนอน
// พอเลื่อนไปดูคอลัมน์ขวาสุด สายตาหลุดแถวได้ง่ายมาก ติ๊กไว้แล้วทั้งแถวเปลี่ยนสีคือที่คั่นหน้า
//
// ★ คีย์ด้วย assetClass ไม่ใช่ index ของแถว — เรียงคอลัมน์ใหม่หรือเปลี่ยนหน้าแล้ว index
//   ขยับ แต่สิ่งที่ผู้ใช้ติ๊กไว้คือ "บัญชีนั้น" ไม่ใช่ "ลำดับที่เท่านั้น"
//
// ★ ไม่มีปุ่มเลือกทั้งหมดโดยตั้งใจ — ติ๊กครบทั้งหน้าแล้วทุกแถวสีเดียวกัน = ไม่ได้เน้นอะไรเลย
const selectedRows = ref(new Set<string>())

/**
 * คีย์ของแถวที่ติ๊กไว้ — ใช้ร่วมกันทั้งสองชีต
 *
 * ★ เป็น assetClass ล้วน ไม่รวม period — ชีต DEP มี grain เป็นบัญชี × งวด แต่สิ่งที่ผู้ใช้
 *   ติ๊กคือ "บัญชีนี้" ติ๊กไว้ที่ชีตหนึ่งแล้วสลับไปอีกชีตจึงยังเห็นไฮไลต์เดิม
 */
const rowKey = (row: { assetClass: string | null }) => row.assetClass ?? 'none'

function toggleRow(key: string): void {
  if (selectedRows.value.has(key)) selectedRows.value.delete(key)
  else selectedRows.value.add(key)
}

/**
 * ล้างที่ติ๊กไว้ **เฉพาะตอนเปลี่ยนบริษัท** เท่านั้น
 *
 * ★ เดิมเฝ้าทั้งสี่ตัว (บริษัท/ปี/งวดเริ่ม/งวดจบ) ซึ่งเหมารวมเกินไป — เปลี่ยนงวดคือสิ่งที่
 *   คนทำบ่อยที่สุดตอนกระทบยอด และรหัสบัญชีแทบทั้งหมดเป็นชุดเดิม ติ๊กไว้แล้วหายทุกครั้ง
 *   ที่ขยับงวด = ที่คั่นหน้าใช้ไม่ได้เลยในงานที่มันถูกสร้างมาเพื่อสิ่งนั้น
 *
 * ★ บริษัทต้องล้างจริง — รหัสบัญชีซ้ำกันข้ามบริษัท (UBA กับ UBP ใช้ร่วมกัน 8 รหัส)
 *   ถ้าไม่ล้าง แถวที่ไฮไลต์ค้างอยู่หลังสลับบริษัทจะเป็น "คนละบัญชีที่รหัสบังเอิญตรงกัน"
 *
 * ★ ไม่ล้างตอนเปลี่ยนหน้า/เรียงคอลัมน์/สลับชีต — ทั้งหมดนั้นยังเป็นข้อมูลชุดเดิม
 */
watch(selectedCompany, () => selectedRows.value.clear())

// ── โมดัลรายชิ้น ────────────────────────────────────────────────────────────
//
// ★ state ทั้งหมดของโมดัล (โหลด/แบ่งหน้า/error) อยู่ใน component ไม่ใช่ที่นี่ — หน้านี้
//   รู้แค่ "ผู้ใช้กดแถวไหน" แล้วเรียก open() ผ่าน template ref
const piecesModal = ref<InstanceType<typeof AssetPiecesModal> | null>(null)
const depPiecesModal = ref<InstanceType<typeof DepPiecesModal> | null>(null)

/**
 * ★★ สองชีตเปิด "คนละโมดัล" ไม่ใช่ตัวเดียวกัน
 *
 * ไฟล์ของ finance มีชีตละเอียดแยกกันสองใบ และคอลัมน์คนละชุด:
 *   Asset-ละเอียด  คอลัมน์ชุดเดียวกับ Asset-สรุป (ยอดคงเหลือครบชุด)
 *   DEP-ละเอียด    แค่ Asset No. / Description / Ordinary Depreciation
 *
 * เคยใช้โมดัลตัวเดียวกันทั้งสองชีต ซึ่งทำให้กดจากแถว DEP แล้วได้ราคาทุน/NBV —
 * ตอบคนละคำถามกับที่คนกดกำลังถามอยู่
 */
function openPieces(row: { assetClass: string | null; accountName: string | null }) {
  piecesModal.value?.open(row)
}

function openDepPieces(row: { assetClass: string | null; accountName: string | null }) {
  depPiecesModal.value?.open(row)
}

/** ช่วงที่กำลังดูอยู่ของตารางที่เปิด - ตารางนี้ไม่ได้แสดงครบในหน้าเดียว ต้องบอกเสมอ */
const shownRange = computed(() => {
  const total = sheet.value === 'asset' ? assetRows.value.length : depFilteredRows.value.length
  if (total === 0) return ''
  const page = sheet.value === 'asset' ? assetPage.value : depPage.value
  const start = (page - 1) * PAGE_SIZE + 1
  return `${start}–${Math.min(start + PAGE_SIZE - 1, total)} จาก ${total} ชั้นบัญชี`
})

/**
 * ยอดรวมท้ายตาราง - รายงานบัญชีต้องมีแถวรวมเสมอ คนเอาไปกระทบยอดกับไฟล์ Excel ทีละช่อง
 *
 * ★ null ทุกแถว = null ไม่ใช่ 0 (ยังไม่มีชิ้นไหนมีตัวเลขบัญชีเลย คนละเรื่องกับรวมได้ศูนย์)
 */
function sumOf(rows: AssetSummaryRow[], key: keyof AssetSummaryRow): number | null {
  const values = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number')
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0)
}

/**
 * ★ รวมทุกคอลัมน์เงินจาก ASSET_COLUMNS โดยตรง ไม่ไล่เขียนทีละช่อง
 *
 * เดิมเขียนทีละบรรทัดแล้วลืมเติมตอนเพิ่มคอลัมน์ = แถว Total มีช่องว่างโดยไม่มีอะไรฟ้อง
 * แบบนี้คอลัมน์ใหม่ที่เพิ่มในลิสต์เดียวได้ยอดรวมเองอัตโนมัติ
 */
const assetTotals = computed(() => {
  const rows = assetRows.value
  const money: Record<string, number | null> = {}
  for (const col of ASSET_COLUMNS) {
    if (col.money) money[col.key] = sumOf(rows, col.key as keyof AssetSummaryRow)
  }
  // สองช่องนับชิ้นอยู่นอก record เพื่อให้ชนิดยังเป็น number แท้ ๆ (ไม่ใช่ number | null)
  // — ป้ายเตือน "มี n ชิ้นที่ยังไม่มีตัวเลขบัญชี" เทียบ > 0 ตรง ๆ ได้โดยไม่ต้องกัน null
  return {
    ...money,
    assets: rows.reduce((sum, r) => sum + r.assets, 0),
    assetsWithoutValue: rows.reduce((sum, r) => sum + r.assetsWithoutValue, 0),
  }
})

/**
 * จำนวนชิ้นรวมของชีต DEP — บวกจาก "ทั้งชุดที่กรองแล้ว" ไม่ใช่จากหน้าที่เปิดอยู่
 *
 * ★ เดิมเขียน reduce ไว้ใน template ของแถว Total ซึ่งอ่านยากและซ่อนไว้ว่ามันบวกจากชุดไหน
 *   ตอนแตกตารางออกเป็น component เลยยกขึ้นมาเป็น computed ที่นี่ให้เห็นชัดว่าเป็นของทั้งชุด
 */
const depTotalAssets = computed(() =>
  depFilteredRows.value.reduce((sum, r) => sum + r.assets, 0),
)

const depTotal = computed(() =>
  depFilteredRows.value.reduce((sum, r) => sum + r.ordinaryDepreciation, 0),
)

/**
 * งวดที่ DEP-สรุป กำลังแสดง — งวดเดียวเสมอ (backend ส่งมาเฉพาะ toPeriod)
 *
 * ★ ชีตของ finance เป็นภาพของงวดเดียว 1 บัญชี = 1 บรรทัด ถ้าเอาช่วงงวดมากางในตาราง
 *   บัญชีเดียวจะแตกเป็นหลายบรรทัดแล้วเทียบกับชีตทีละบรรทัดไม่ได้ — ช่วงงวดที่เลือกไว้
 *   ยังมีผลกับ Asset-สรุป ตามเดิม ป้ายนี้จึงต้องมี ไม่งั้นคนจะนึกว่าเป็นยอดของทั้งช่วง
 */
const depPeriodLabel = computed(() => {
  const row = depFilteredRows.value[0]
  if (!row) return data.value ? `งวด ${data.value.toPeriod}` : ''
  return `งวด ${row.period} · ${formatDate(row.fromDate)} – ${formatDate(row.toDate)}`
})

/** ใบสำคัญที่ไม่ใช่ 1 ใบต่อแถว = สมมุติฐาน grain พัง ต้องเตือน ไม่ใช่โชว์ใบแรกเงียบ ๆ */
const oddJournalRows = computed(
  () => depFilteredRows.value.filter((r: DepSummaryRow) => r.journalEntryCount > 1).length,
)
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 text-left">
      <div>
        <TopicCard value="asset-summary" />
      </div>
    </div>
    <div v-if="loadError" class="alert alert-error alert-soft mt-4">
      <Icon icon="lucide:triangle-alert" />
      <span>{{ loadError }}</span>
    </div>

    <!-- ── แถบค้นหา/กรอง — อยู่เหนือแท็บเพราะเป็น "ขอบเขต" ไม่ใช่ "มุมมอง" ─────
         ตัวกรองทั้งหมดใช้ร่วมกันทั้งสองแท็บ (ดู const f) ส่วนปุ่มเรียงตามยังแยกต่อแท็บ
         เพราะสองตารางมีคอลัมน์ตัวเลขคนละชุด · โครงแถบยกมาจากหน้า Asset Inventory -->
    <div class="mt-5 flex flex-wrap items-end gap-3">
      <label class="form-control w-full max-w-md text-left">
        <span class="mb-1 text-xs text-base-content/60">ค้นหา</span>
        <div class="input input-sm flex w-full items-center gap-2">
          <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
          <input v-model="f.search" type="search" class="grow" placeholder="Balance Account / ชื่อบัญชี" />
          <!-- ตัวหมุนอยู่ในช่องค้น ไม่ใช่ทับทั้งตาราง - ผลเดิมยังอ่านได้ระหว่างรอของใหม่ -->
          <span v-if="loading" class="loading loading-spinner loading-xs shrink-0" />
        </div>
      </label>

      <!-- ── งวดบัญชี — กลุ่มของตัวเอง ไม่อยู่ในแผงตัวกรอง ────────────────
           ★ แยกออกมาเพราะสองเหตุผล
             1. มันเลือกเป็น **ช่วง** (ปี + จาก–ถึง) ไม่ใช่ค่าเดียวแบบหัวข้ออื่นในแผง
             2. เป็นตัวที่เปลี่ยนบ่อยที่สุดเวลากระทบยอดกับไฟล์ของ finance — ฝังไว้ในแผง
                ที่ต้องกดสองชั้นกว่าจะถึง = งานที่ทำบ่อยสุดเข้าถึงยากสุด
           ★ เปลี่ยนแล้วยิง API ใหม่ (ต่างจากตัวกรองในแผงที่กรองฝั่งจอ) — spinner
             อยู่ในช่องค้นข้าง ๆ ให้เห็นว่ากำลังโหลด -->


      <!-- ── แผงตัวกรอง — dropdown แผงเดียวที่เลือกค่าได้ในตัว ───────────── -->
      <div ref="panelRef" class="relative">
        <button class="btn btn-sm" :class="hasFilter ? 'btn-primary' : 'btn'" :aria-expanded="panelOpen"
          @click="panelOpen = !panelOpen">
          <Icon icon="lucide:sliders-horizontal" class="size-4" />
          ตัวกรอง
          <span v-if="hasFilter" class="badge badge-xs badge-neutral">
            {{ activeFilterChips.length }}
          </span>
          <Icon icon="lucide:chevron-down" class="size-4 transition-transform" :class="{ 'rotate-180': panelOpen }" />
        </button>

        <div v-if="panelOpen"
          class="absolute left-0 z-30 mt-2 w-80 rounded-box border border-base-300 bg-base-100 shadow-lg">
          <div class="flex items-center justify-between border-b border-base-300 px-3 py-2">
            <span class="text-sm font-semibold">ตัวกรอง</span>
            <button class="btn btn-ghost btn-xs" :disabled="!hasFilter" @click="clearFilters">
              ล้างทั้งหมด
            </button>
          </div>

          <!-- ค้นหัวข้อตัวกรอง ไม่ใช่ค้นข้อมูลในตาราง - ป้ายต้องเขียนให้ต่างกันชัด ๆ -->
          <div class="px-3 pt-2">
            <label class="input input-sm flex w-full items-center gap-2">
              <Icon icon="lucide:search" class="size-3.5 shrink-0 opacity-50" />
              <input v-model="filterSearch" type="search" class="grow" placeholder="ค้นหาตัวกรอง..." />
            </label>
          </div>

          <div class="max-h-96 overflow-y-auto p-1.5">
            <div v-for="field in visibleFields" :key="field.key" class="rounded-btn">
              <div class="flex w-full cursor-pointer items-center gap-2 rounded-btn px-2 py-2 hover:bg-base-200"
                @click="expandedField = expandedField === field.key ? '' : field.key">
                <Icon :icon="field.icon" class="size-4 shrink-0 opacity-60" />
                <span class="flex-1 text-left text-sm">{{ field.label }}</span>

                <!-- ★ แกนที่ปลดไม่ได้ (บริษัท) ยังขึ้น badge บอกว่ามีค่าอยู่เหมือนกัน
                     แต่ไม่มีกากบาทและกดไม่ได้ — badge เป็นตัวบอกสถานะ ส่วนกากบาทเป็น
                     ตัวสัญญาว่า "กดแล้วปลดได้" ซึ่งเป็นสัญญาที่แกนนี้ทำไม่ได้ -->
                <span v-if="filterHasValue(field.key)" class="badge badge-sm badge-primary gap-1"
                  :class="field.clearable ? 'cursor-pointer pr-1' : ''"
                  @click.stop="field.clearable && clearField(field.key)">
                  1
                  <Icon v-if="field.clearable" icon="lucide:x" class="size-3" />
                </span>

                <Icon icon="lucide:chevron-down" class="size-4 shrink-0 opacity-50 transition-transform"
                  :class="{ 'rotate-180': expandedField === field.key }" />
              </div>

              <p v-if="expandedField !== field.key && filterHasValue(field.key)"
                class="px-2 pb-2 pl-8 text-left text-xs text-base-content/60">
                {{ fieldValueLabel(field.key) }}
              </p>

              <div v-if="expandedField === field.key" class="px-2 pb-2">
                <!-- ★ บริษัทกับงวดยิง API ใหม่ ต่างจากอีกสามตัวที่กรองฝั่งจอทันที
                     บอกไว้ตรงนี้เพราะเป็นจุดเดียวที่ผู้ใช้เห็นทั้งสองแบบยืนติดกัน -->
                <p v-if="field.key === 'company'"
                  class="mb-1.5 flex items-start gap-1.5 text-left text-xs text-base-content/50">
                  <Icon icon="lucide:info" class="mt-0.5 size-3 shrink-0" />
                  เลือกบริษัทที่ต้องการ
                </p>

                <ul v-if="field.key === 'company'">
                  <li v-for="c in companies" :key="c.code">
                    <button
                      class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                      :class="{ 'bg-primary/10 font-medium': selectedCompany === c.code }"
                      :disabled="data?.scope.companyLocked" @click="toggleValue('company', c.code)">
                      <Icon :icon="selectedCompany === c.code ? 'lucide:check' : 'lucide:minus'"
                        class="size-3.5 shrink-0" :class="selectedCompany === c.code ? 'text-primary' : 'opacity-0'" />
                      {{ c.name || c.code }}
                    </button>
                  </li>
                </ul>

                <template v-else-if="field.key === 'assetClass'">
                  <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                    <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                    <input v-model="categorySearch" type="search" class="grow" placeholder="ค้น Asset class" />
                  </label>
                  <ul class="max-h-44 overflow-y-auto">
                    <li v-for="o in filteredCategoryOptions" :key="o.code">
                      <button
                        class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                        :class="{ 'bg-primary/10 font-medium': f.category === o.code }"
                        @click="toggleValue('assetClass', o.code)">
                        <Icon :icon="f.category === o.code ? 'lucide:check' : 'lucide:minus'" class="size-3.5 shrink-0"
                          :class="f.category === o.code ? 'text-primary' : 'opacity-0'" />
                        <span class="truncate">{{ o.code }} · {{ o.label }}</span>
                      </button>
                    </li>
                    <li v-if="!filteredCategoryOptions.length" class="px-2 py-2 text-xs text-base-content/50">
                      ไม่พบ Asset class ที่ตรงกับคำค้น
                    </li>
                  </ul>
                </template>

                <ul v-else-if="field.key === 'site'">
                  <li v-for="o in siteOptions" :key="o.code">
                    <button
                      class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                      :class="{ 'bg-primary/10 font-medium': f.site === o.code }" @click="toggleValue('site', o.code)">
                      <Icon :icon="f.site === o.code ? 'lucide:check' : 'lucide:minus'" class="size-3.5 shrink-0"
                        :class="f.site === o.code ? 'text-primary' : 'opacity-0'" />
                      {{ o.label }}
                    </button>
                  </li>
                </ul>

                <template v-else-if="field.key === 'department'">
                  <label class="input input-xs mb-1.5 flex w-full items-center gap-1.5">
                    <Icon icon="lucide:search" class="size-3 shrink-0 opacity-50" />
                    <input v-model="departmentSearch" type="search" class="grow" placeholder="ค้นแผนก" />
                  </label>
                  <ul class="max-h-44 overflow-y-auto">
                    <li v-for="o in filteredDepartmentOptions" :key="o.code">
                      <button
                        class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
                        :class="{ 'bg-primary/10 font-medium': f.department === o.code }"
                        @click="toggleValue('department', o.code)">
                        <Icon :icon="f.department === o.code ? 'lucide:check' : 'lucide:minus'"
                          class="size-3.5 shrink-0" :class="f.department === o.code ? 'text-primary' : 'opacity-0'" />
                        <span class="truncate">{{ o.code }} · {{ o.label }}</span>
                      </button>
                    </li>
                    <li v-if="!filteredDepartmentOptions.length" class="px-2 py-2 text-xs text-base-content/50">
                      ไม่พบแผนกที่ตรงกับคำค้น
                    </li>
                  </ul>
                </template>
              </div>
            </div>
          </div>

          <!-- ★ สามตัวล่างกรองจาก "ท่อนของรหัสบัญชี" ไม่ใช่จากแผนก/ที่ตั้งของตัวชิ้น
               ต้องบอก ไม่งั้นคนจะคาดว่าผลตรงกับหน้าทะเบียนที่กรองคนละฐาน -->

        </div>
      </div>

      <!-- ── เลือกคอลัมน์ที่จะแสดง (เฉพาะ Asset-สรุป) ────────────────────────
           ★ โผล่เฉพาะแท็บ Asset-สรุป — DEP-สรุป มี 3 คอลัมน์ ไม่มีอะไรให้ซ่อน
           ★ ค่าตั้งต้น = ชุดคอลัมน์ที่มีอยู่ในชีตของ finance ส่วนที่เหลือเป็นของแถมของ AMS
             (Assets / Retired Depr. / Accum. Depr.) ปิดไว้ก่อน เปิดเองได้
           ★ ซ่อนคอลัมน์ไม่กระทบตัวเลข — แถว Total คิดจากคอลัมน์ที่เปิดอยู่เท่านั้น
             จึงตรงกับสิ่งที่ตาเห็นเสมอ -->
      <div v-if="sheet === 'asset'" ref="colPanelRef" class="relative">
        <button class="btn btn-sm" :aria-expanded="colPanelOpen" @click="colPanelOpen = !colPanelOpen">
          <Icon icon="lucide:columns-3" class="size-4" />
          คอลัมน์
          <span class="badge badge-xs badge-neutral">{{ shownColumns.length }}</span>
          <Icon icon="lucide:chevron-down" class="size-4 transition-transform"
            :class="{ 'rotate-180': colPanelOpen }" />
        </button>

        <div v-if="colPanelOpen"
          class="absolute left-0 z-30 mt-2 w-72 rounded-box border border-base-300 bg-base-100 shadow-lg">
          <div class="flex items-center justify-between border-b border-base-300 px-3 py-2">
            <span class="text-sm font-semibold">คอลัมน์ที่แสดง</span>
            <button class="btn btn-ghost btn-xs" @click="resetColumns">คืนค่าเริ่มต้น</button>
          </div>
          <ul class="max-h-96 overflow-y-auto p-1.5">
            <li v-for="col in ASSET_COLUMNS" :key="col.key">
              <label class="flex cursor-pointer items-center gap-2 rounded-btn px-2 py-1.5 hover:bg-base-200">
                <input v-model="visibleCols[col.key]" type="checkbox" class="checkbox checkbox-xs" />
                <span class="text-sm">{{ col.label }}</span>
                <!-- บอกว่าตัวไหนไม่ได้อยู่ในชีตของ finance จะได้ไม่งงตอนเอาไปเทียบ -->
                <span v-if="!col.on" class="badge badge-ghost badge-xs">AMS</span>
              </label>
            </li>
          </ul>
        </div>
      </div>

      <div class="form-control text-left">
        <div class="join">
          <select v-model.number="selectedYear" class="select join-item select-sm w-28">
            <option v-for="o in yearOptions" :key="o.fiscalYear" :value="o.fiscalYear">
              ปี {{ o.fiscalYear + 543 }}
            </option>
          </select>
          <select v-model.number="fromPeriod" class="select join-item select-sm w-24">
            <option v-for="p in periodChoices" :key="p" :value="p">งวด {{ p }}</option>
          </select>
          <span class="btn btn-sm join-item pointer-events-none px-2 font-normal">–</span>
          <select v-model.number="toPeriod" class="select join-item select-sm w-24">
            <option v-for="p in periodChoices" :key="p" :value="p">งวด {{ p }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ตัวกรองที่ใช้อยู่ - เห็นได้โดยไม่ต้องเปิดแผง กดที่ตัวไหนก็ปลดตัวนั้น

         ★ แกนที่ปลดไม่ได้ (บริษัท) วาดเป็น <span> ไม่ใช่ <button> — ไม่ใช่แค่เรื่องหน้าตา
           แต่ปุ่มที่กดแล้วไม่เกิดอะไรขึ้นคือสิ่งที่ผู้ใช้จะกดซ้ำแล้วคิดว่าระบบค้าง และ
           screen reader จะอ่านว่าเป็นปุ่มทั้งที่ไม่มี action ให้ทำ -->
    <div v-if="hasFilter" class="flex flex-wrap items-center gap-1.5">
      <template v-for="chip in activeFilterChips" :key="chip.key">
        <button v-if="chip.clearable" class="badge badge-sm badge-ghost gap-1 pr-1 mt-2" @click="chip.clear()">
          {{ chip.label }}
          <Icon icon="lucide:x" class="size-3" />
        </button>
        <span v-else class="badge badge-sm badge-neutral mt-2">{{ chip.label }}</span>
      </template>
    </div>

    <!-- ── แท็บสองหน้า — ทรงเดียวกับแท็บเบราว์เซอร์ ─────────────────────────
         ★ tabs-lift ไม่ใช่ tabs-box: แท็บที่เลือกอยู่ต่อเนื่องเป็นเนื้อเดียวกับการ์ดข้างล่าง
           สื่อว่า "นี่คือหน้าของแท็บนี้" ไม่ใช่ปุ่มสองปุ่มที่บังเอิญวางคู่กัน
         ★ ตัวกรองอยู่เหนือแท็บและใช้ร่วมกัน — กรองบัญชีหนึ่งแล้วสลับไปมาได้โดยไม่ต้องตั้งซ้ำ
           ซึ่งเป็นท่าหลักของการกระทบยอด (ยอดสะสม vs ค่าเสื่อมของงวด ของบัญชีเดียวกัน)
         ★ role=tablist + aria-selected ไม่ใช่ปุ่มเปล่า — screen reader ต้องรู้ว่ามีกี่หน้า
           และตอนนี้อยู่หน้าไหน -->
    <div role="tablist" class="tabs tabs-lift mt-5">
      <button v-for="tab in [
        { key: 'asset', label: 'Asset-สรุป', count: assetRows.length },
        { key: 'dep', label: 'DEP-สรุป', count: depFilteredRows.length },
      ]" :key="tab.key" role="tab" class="tab gap-2" :class="sheet === tab.key ? 'tab-active font-medium' : ''"
        :aria-selected="sheet === tab.key" @click="sheet = tab.key as Sheet">
        {{ tab.label }}
        <span class="badge badge-ghost badge-sm">{{ tab.count }}</span>
      </button>
    </div>

    <div class="card rounded-t-none border border-base-300 bg-base-100 shadow-sm">
      <div class="card-body gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ams-report-title" class="sr-only">
            {{ sheet === 'asset' ? 'Asset-สรุป' : 'DEP-สรุป' }}
          </h2>
          <!-- DEP-สรุป เป็นภาพของงวดเดียว ต่างจาก Asset-สรุป ที่เป็นช่วง — ต้องบอกให้ชัด
               ไม่งั้นคนจะอ่านยอดนี้เป็นยอดรวมของทั้งช่วงงวดที่เลือกไว้ -->
          <span v-if="sheet === 'dep'" class="badge badge-outline badge-sm font-normal">
            {{ depPeriodLabel }}
          </span>
          <span class="ml-auto text-xs text-base-content/70">{{ shownRange }}</span>
        </div>


        <p v-if="assetTotals.assetsWithoutValue > 0" class="text-xs text-warning">
          มี {{ assetTotals.assetsWithoutValue }} ชิ้นที่ SAP ยังไม่ส่งตัวเลขบัญชีมา -
          ยอดเงินในตารางไม่ได้รวมชิ้นเหล่านี้
        </p>
        <!-- ★ ข้อความต้องแยกสองสาเหตุ - เดิมเขียนเดาไว้ว่า "ใบกลับรายการ" ทั้งที่สาเหตุจริง
             ที่เจอคือกำลังดูทุกบริษัทอยู่ แล้วรหัสบัญชีที่ UBA กับ UBP ใช้ร่วมกันถูกยุบ
             เป็นแถวเดียว (งวด 8: 5 แถว) ชี้ผิดทางแบบนั้นทำให้คนไปไล่หาใบที่ไม่มีอยู่จริง -->
        <p v-if="sheet === 'dep' && oddJournalRows > 0" class="text-xs text-warning">
          มี {{ oddJournalRows }} แถวที่มีใบสำคัญมากกว่าหนึ่งใบ - ปกติ 1 บัญชีต่อ 1 งวดได้ใบเดียว
          <template v-if="!selectedCompany">
            เพราะกำลังดูทุกบริษัทอยู่ รหัสบัญชีที่ใช้ร่วมกันข้ามบริษัทจึงถูกยุบเป็นแถวเดียว
            — <strong>เลือกบริษัทเพื่อให้เทียบกับสมุดรายวันได้</strong>
          </template>
          <template v-else>ให้ตรวจว่ามีใบกลับรายการหรือไม่</template>
        </p>

        <!-- ── Asset-สรุป ──────────────────────────────────────────────── -->
        <AssetSummaryTable
          v-if="sheet === 'asset'"
          :rows="pagedAssetRows"
          :total-rows="assetRows.length"
          :columns="shownColumns"
          :totals="assetTotals"
          :sort-value="sortValue"
          :sort-dir="sortDir"
          :selected-rows="selectedRows"
          @toggle-sort="toggleSort"
          @toggle-row="toggleRow"
          @open-pieces="openPieces"
        />

        <!-- ── DEP-สรุป ────────────────────────────────────────────────── -->
        <DepSummaryTable
          v-else
          :rows="pagedDepRows"
          :total-rows="depFilteredRows.length"
          :total-assets="depTotalAssets"
          :total="depTotal"
          :sort-value="sortValue"
          :sort-dir="sortDir"
          :selected-rows="selectedRows"
          @toggle-sort="toggleSort"
          @toggle-row="toggleRow"
          @open-pieces="openDepPieces"
        />

<div class="flex w-full min-w-0 justify-center">
  <AppPagination
    v-if="sheet === 'asset'"
    class="mt-1"
    :page="assetPage"
    :total="assetRows.length"
    :limit="PAGE_SIZE"
    @update:page="assetPage = $event"
  />

  <AppPagination
    v-else
    class="mt-1"
    :page="depPage"
    :total="depFilteredRows.length"
    :limit="PAGE_SIZE"
    @update:page="depPage = $event"
  />
</div>
      </div>
    </div>

    <!-- ── รายชิ้นในชั้นบัญชีเดียว — เปิดจากปุ่มบนแถวของ Asset-สรุป ────────
         ★ ส่ง "ขอบเขตงวด" ที่หน้านี้เลือกอยู่ลงไปครบทุกช่อง ขาดช่องไหน backend จะหนีบ
           งวดให้ใหม่ แล้วยอดในโมดัลจะเป็นของคนละงวดกับแถวที่เพิ่งกด -->
    <AssetPiecesModal
      ref="piecesModal"
      :company-code="selectedCompany"
      :fiscal-year="selectedYear"
      :from-period="fromPeriod"
      :to-period="toPeriod"
      :columns="shownColumns"
    />

    <!-- ── รายชิ้นค่าเสื่อม — เปิดจากปุ่มบนแถวของ DEP-สรุป ─────────────────
         ★ คนละโมดัลกับข้างบนโดยตั้งใจ (ดู openPieces/openDepPieces) -->
    <DepPiecesModal
      ref="depPiecesModal"
      :company-code="selectedCompany"
      :fiscal-year="selectedYear"
      :from-period="fromPeriod"
      :to-period="toPeriod"
    />
  </div>
</template>
