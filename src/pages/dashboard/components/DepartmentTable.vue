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
  listEmployees,
  listLocations,
  type EmployeeOption,
  type MasterOption,
} from '@/shared/services/master.service'
import { ApiError } from '@/shared/services/httpClient'
import { ASSET_STATUS_OPTIONS, assetStatusLabel } from '@/shared/utils/asset-status'
import { ASSET_SORT_OPTIONS } from '@/shared/utils/asset-sort'
import AppSortMenu from '@/shared/components/AppSortMenu.vue'
import type { SortDirection } from '@/shared/components/AppSortMenu.vue'

const props = defineProps<{
  /** id ของแผนกที่เลือกบน Dashboard - '' = ทุกแผนก (ตรงกับ scope.departmentId === null) */
  departmentId: string
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

// ── ตัวกรอง: ที่ตั้ง / ผู้ครอบครอง / สถานะ ───────────────────────────────────
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

const FILTER_FIELDS = [
  { key: 'location', label: 'ที่ตั้ง', icon: 'lucide:map-pin' },
  { key: 'holder', label: 'ผู้ครอบครอง', icon: 'lucide:user' },
  { key: 'status', label: 'สถานะ', icon: 'lucide:activity' },
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
    default:
      return false
  }
}

function clearField(key: string) {
  if (key === 'location') locationId.value = ''
  else if (key === 'holder') clearEmployee()
  else if (key === 'status') status.value = ''
}

/**
 * กดตัวเลือกเดิมซ้ำ = ปลดตัวกรองนั้น
 *
 * ในแผงไม่มีปุ่ม "ทั้งหมด" ให้กดเหมือนตอนเป็น <select> การกดซ้ำจึงเป็นทางเดียวที่ผู้ใช้
 * จะกลับไปสถานะ "ไม่กรอง" ได้จากในลิสต์ (นอกจากกด × บนหัวข้อ) - กติกาเดียวกับหน้าทะเบียน
 */
function toggleValue(key: string, value: string) {
  const target = key === 'location' ? locationId : key === 'status' ? status : null
  if (!target) return
  target.value = target.value === value ? '' : value
}

/** ค่าที่เลือกไว้ เป็นข้อความอ่านออก - โชว์ใต้หัวข้อตอนหุบ จะได้ไม่ต้องกางดู */
function fieldValueLabel(key: string): string {
  switch (key) {
    case 'location':
      return locations.value.find((l) => String(l.id) === locationId.value)?.name ?? locationId.value
    case 'holder':
      return employeeName.value || `รหัส ${employeeId.value}`
    case 'status':
      return assetStatusLabel(status.value)
    default:
      return ''
  }
}

// ── ที่ตั้ง: โหลดครบทีเดียวแล้วกรองในเครื่อง (มีไม่กี่สิบแถว) ─────────────────
const locations = ref<MasterOption[]>([])
/** โหลดไม่สำเร็จ - บอกในลิสต์ตรงนั้น ไม่ยัดลง loadError ซึ่งเป็นช่องของ "ตารางโหลดไม่ขึ้น" */
const locationsFailed = ref(false)
const locationSearch = ref('')

const filteredLocations = computed(() => {
  const q = locationSearch.value.trim().toLowerCase()
  return q ? locations.value.filter((l) => l.name.toLowerCase().includes(q)) : locations.value
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
// ★ ไม่ผูก departmentId ของ Dashboard เข้าไปในคำขอ: ของแผนกหนึ่งอยู่ในมือคนอีกแผนกได้จริง
//   กรองรายชื่อตามแผนกไว้แล้วคนที่ถือของอยู่จะหายจากลิสต์จนเลือกไม่ได้ ตัวกรองจะดูเหมือนพัง
const EMPLOYEE_LIMIT = 8
const employeeSearch = ref('')
const employees = ref<EmployeeOption[]>([])
const employeeTotal = ref(0)
const employeesLoading = ref(false)
const employeesFailed = ref(false)
let employeesLoaded = false
let employeeTimer: ReturnType<typeof setTimeout> | undefined
let employeeSeq = 0

/** ยังมีคนที่ไม่ได้โชว์อีกกี่คน - ต้องบอก ไม่งั้นผู้ใช้จะคิดว่าลิสต์ 8 คนคือทั้งหมด */
const employeeHiddenCount = computed(() =>
  Math.max(0, employeeTotal.value - employees.value.length),
)

async function loadEmployees() {
  const seq = ++employeeSeq
  employeesLoading.value = true
  employeesFailed.value = false
  try {
    const res = await listEmployees({
      search: employeeSearch.value.trim() || undefined,
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

  return chips
})

const hasFilter = computed(() => activeFilterChips.value.length > 0)

/** ล้างทุกอย่างรวมคำค้น - ปุ่มในแผงกับในกล่อง "ไม่พบรายการ" ใช้ตัวเดียวกัน */
function clearFilters() {
  searchText.value = ''
  locationId.value = ''
  status.value = ''
  clearEmployee()
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
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onPanelKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onPanelKeydown)
  }
})

/** หัวตาราง ใช้เป็นจุดเลื่อนกลับตอนเปลี่ยนหน้า */
const tableTop = ref<HTMLElement | null>(null)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAssetInventory({
      page: page.value,
      limit: LIMIT,
      search: searchText.value,
      departmentId: props.departmentId ? Number(props.departmentId) : undefined,
      companyCode: props.companyCode || undefined,
      locationId: locationId.value ? Number(locationId.value) : undefined,
      // 0 = ยังไม่เลือก - ปล่อยเป็น undefined ไม่ใช่ส่ง 0 ไป (backend บังคับ minimum: 1)
      employeeId: employeeId.value || undefined,
      status: status.value || undefined,
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
 */
watch(
  () => [props.departmentId, props.companyCode],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)

// ตัวกรองยิงทันทีไม่ต้องหน่วง - เป็นการ "เลือก" ครั้งเดียวจบ ไม่ใช่การพิมพ์ทีละตัวอักษร
// (ต้องรีเซ็ตหน้าเหมือนกัน ไม่งั้นค้างอยู่หน้า 4 แล้วกรองจนเหลือ 6 ชิ้น = ตารางว่าง
//  และแถบเลขหน้าหายไปด้วย ผู้ใช้จะไม่มีปุ่มให้กดกลับ)
watch([locationId, employeeId, status, sort, sortDir], () => {
  page.value = 1
  void load()
})

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

function onPageChange(next: number) {
  page.value = next
  void load()
  // ตารางนี้อยู่ท้ายหน้า - เลื่อนกลับไปหัวตาราง ไม่ใช่หัวหน้า Dashboard
  // ไม่งั้นกดหน้า 2 แล้วโดนดีดขึ้นไปดูการ์ดสรุปใหม่ทุกครั้ง
  tableTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  <section ref="tableTop">
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
              <!-- หัวข้อ: กดแล้วกาง/หุบ ตัวที่กรองอยู่มี badge กับปุ่ม × ให้ปลดได้จากตรงนี้ -->
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
                        <span class="truncate">{{ l.name }}</span>
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

    

    <AssetTable
      class="mt-2"
      :items="items"
      :loading="loading"
      :show-department="!departmentId"
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
    <AssetDetailModal v-model="detailOpen" :item="selectedItem" editable-location editable-image />
  </section>
</template>
