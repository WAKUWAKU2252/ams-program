<script setup lang="ts">
// หน้า Dashboard - ภาพรวมทะเบียนสินทรัพย์ + มูลค่าทางบัญชี
//
// ── สองอย่างที่หน้านี้ต้องไม่โกหกผู้ใช้ ────────────────────────────────────────
//
// 1. **ตัวเลขนี้เป็นของแผนกไหน** - ขอบเขตมาจาก backend (`scope`) ไม่ใช่จากค่าที่หน้าจอ
//    ส่งไป พนักงานทั่วไปถูกล็อกไว้ที่แผนกตัวเองฝั่ง server แล้ว หน้าจอแค่สะท้อนสิ่งที่
//    ได้กลับมา - ห้าม derive ป้ายหัวเรื่องจาก selectedDepartmentId ของตัวเอง ไม่งั้น
//    วันที่ backend ทิ้งค่าที่ส่งไป จอจะเขียนชื่อแผนกหนึ่งทับตัวเลขของอีกแผนกหนึ่ง
//
// 2. **ยอดเงินไม่ได้นับทุกชิ้น** - นับเฉพาะชิ้นที่มีตัวเลขบัญชีครบ (totals.valued) และ
//    ตัวเลขชุดนั้นเป็นของ "ปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น" ซึ่งค้างที่ปีเก่าได้จริง
//    (วัด 2026-08-20: 25% ของทะเบียนไม่ใช่ปีปัจจุบัน) สองข้อนี้ต้องขึ้นบนหน้าเสมอ
//    ไม่ใช่ซ่อนใน tooltip - ไม่งั้นคนอ่านยอดที่มีเลขปี 2022 ปนอยู่เป็นมูลค่าของวันนี้
//
// ★ ทะเบียนสินทรัพย์ (Asset Inventory) เคยถูกยุบมาต่อท้ายหน้านี้ช่วงหนึ่ง แล้วแยกกลับไป
//   เป็น /asset-inventory ตามเดิม - อย่าเอากลับมา ช่องเลือกแผนกของหน้านี้ถูก backend
//   ล็อกตาม role ส่วนของทะเบียนต้องค้นได้ทุกแผนก สองกฎนี้อยู่หน้าเดียวกันไม่ได้
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import { getDashboardOverview } from '@/shared/services/dashboard.service'
import type {
  AssetStatus,
  CompanySummary,
  DashboardOverview,
  DepartmentSummary,
} from '@/shared/services/dashboard.service'
import { ApiError } from '@/shared/services/httpClient'
import { formatMoney } from '@/shared/utils/money'
import { formatDate } from '@/shared/utils/date'
import CompanySharePie from './components/CompanySharePie.vue'
import CompanySummaryTable from './components/CompanySummaryTable.vue'
import CompanyDepreciationRunoffLine from './components/CompanyDepreciationRunoffLine.vue'
import CompanyDepreciationTrendLine from './components/CompanyDepreciationTrendLine.vue'
import DepreciationChartToggle from './components/DepreciationChartToggle.vue'
import type { DepreciationChartMode } from './components/DepreciationChartToggle.vue'
import KpiDelta from './components/KpiDelta.vue'
import AssetClassSharePie from './components/AssetClassSharePie.vue'
import AssetClassValueRankBar from './components/AssetClassValueRankBar.vue'
import DepartmentTable from './components/DepartmentTable.vue'
import RemainingLifeChart from './components/RemainingLifeChart.vue'
import TopicCard from '@/shared/components/TopicCard.vue'

const data = ref<DashboardOverview | null>(null)
const loading = ref(false)
const loadError = ref('')

/**
 * "ยอดเงินบนการ์ดเป็นของ ณ วันไหน" - ว่างเมื่อยังไม่มีข้อมูลค่าเสื่อมรายงวดเลย
 *
 * SAP ลงค่าเสื่อมเดือนละครั้งตอนปิดงวด ยอดจึงนิ่งทั้งเดือนแล้วกระโดดทีเดียวตอนต้นเดือนถัดไป
 * - ไม่ใช่ค่อย ๆ ไหลลงทุกวัน ป้ายนี้คือสิ่งเดียวที่ทำให้ "เลขไม่ขยับ" อ่านออกว่าปกติ
 *
 * แสดงเป็นช่วงเมื่อสองค่าไม่เท่ากัน = กำลังดูรวมหลายบริษัทที่ปิดงวดคนละเวลา
 */

const selectedDepartmentId = ref<string>('')
const departmentOptions = ref<DepartmentSummary[]>([])

/** '' = ทุกบริษัท - ตรงกับ scope.companyCode === null ที่ backend ตอบกลับ */
const selectedCompanyCode = ref<string>('')
const companyOptions = ref<CompanySummary[]>([])

/**
 * กราฟไหนกำลังโชว์อยู่บนการ์ดค่าเสื่อมรายบริษัท (ดู DepreciationChartToggle)
 *
 * ★ ตั้งต้นที่ 'trend' - ค่าเสื่อมสะสมปีนี้เป็นตัวที่เปิดดูทุกเดือนตอนปิดงวด ส่วน runoff
 *   เป็นกราฟวางแผนที่เปิดปีละไม่กี่ครั้ง
 *
 * ★ ไม่ล้างค่าตอนเปลี่ยนตัวกรอง - การ์ดนี้โผล่เฉพาะมุมมอง "ทุกบริษัท/ทุกแผนก" อยู่แล้ว
 *   คนที่กดไป runoff แล้วกดดูแผนกหนึ่งแล้วกดกลับมา ควรเจอกราฟเดิมที่ตัวเองเลือกไว้
 */
const depreciationChart = ref<DepreciationChartMode>('trend')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const departmentId = selectedDepartmentId.value ? Number(selectedDepartmentId.value) : undefined
    const res = await getDashboardOverview({
      departmentId,
      companyCode: selectedCompanyCode.value || undefined,
    })
    data.value = res
    summaryPage.value = 1

    if (res.scope.departmentId === null && res.scope.kind === 'ALL') {
      // เอาเฉพาะแถวที่มี id จริง - ชิ้นที่ยังไม่ระบุแผนก (id เป็น null) กรองด้วย API ไม่ได้
      departmentOptions.value = res.byDepartment.filter((d) => d.departmentId !== null)
    }

    /**
     * ตัวเลขในวงเล็บของช่องเลือกบริษัท ต้องเป็นยอด "ทั้งบริษัท" เสมอ ไม่ใช่ยอดที่ถูกกรอง
     *
     * ★ byCompany ที่ backend ส่งมาถูกกรองด้วยแผนกที่เลือกอยู่ (ดู summarizeByCompany ที่
     *   รับ scope.departmentId) — พออัปเดตลิสต์ทุกรอบ พอเลือกแผนกปุ๊บ ช่องบริษัทจะกลาย
     *   เป็น "บริษัทที่เลือก (ยอดของแผนกนั้น)" ส่วนบริษัทอื่นเป็น (0) ทั้งแถว ทั้งที่
     *   บริษัทพวกนั้นมีของเป็นพัน ๆ ชิ้น — ตัวเลขในวงเล็บของ dropdown ตอบคำถามว่า
     *   "ถ้ากดสลับไปบริษัทนี้จะเห็นกี่ชิ้น" การกรองด้วยแผนกจึงผิดความหมายทั้งตัว
     *
     * ★ กติกาเดียวกับ departmentOptions ข้างบน แต่เงื่อนไข "กลับด้าน" โดยตั้งใจ:
     *     บริษัท → แผนก  = การจำกัดขอบเขต ลิสต์แผนกจึงต้องแคบลงตามบริษัทที่เลือก
     *     แผนก  → บริษัท = ไม่ใช่การจำกัดขอบเขต แผนกเป็นของบริษัทเดียวอยู่แล้ว (0024)
     *                       ลิสต์บริษัทจึงต้องไม่ขยับตามแผนก
     *
     * ★ ยึด departmentId ที่ "ส่งไป" ไม่ใช่ scope.departmentId ที่ backend ตอบกลับ —
     *   พนักงานทั่วไปถูกล็อกแผนกจาก role โดยไม่ได้เลือกเอง (scope.departmentId ไม่ null
     *   ตั้งแต่รอบแรก) ถ้าเช็คจากค่าที่ตอบกลับ ลิสต์บริษัทของเขาจะว่างเปล่าถาวร
     */
    if (departmentId === undefined) companyOptions.value = res.byCompany

    const effective = res.scope.departmentId
    selectedDepartmentId.value = effective === null ? '' : String(effective)
    // สะท้อนค่าที่ backend ใช้จริงกลับมาเหมือนแผนก - วันที่ backend เริ่มทิ้งค่าที่ส่งไป
    // (เช่นเพิ่มการล็อกบริษัทตาม role) ช่องเลือกจะเด้งกลับเองโดยไม่ต้องแก้ตรงนี้
    selectedCompanyCode.value = res.scope.companyCode ?? ''
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดข้อมูลภาพรวมไม่สำเร็จ'
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)

/**
 * โหลดใหม่เมื่อตัวกรองเปลี่ยน + ล้างแผนกทิ้งเมื่อเปลี่ยนบริษัท
 *
 * ★★ ต้องเป็น watch ตัวเดียว ห้ามแยกเป็นสองตัว
 *
 * เคยเขียนแยก (watch อาร์เรย์ตัวหนึ่ง + watch บริษัทอีกตัวที่ล้างแผนก) แล้วพัง: ทั้งสองตัว
 * ถูกคิวในรอบ flush เดียวกันและทำงานตามลำดับที่ประกาศ — ตัวแรกเรียก load() ทันทีโดยที่
 * selectedDepartmentId ยังเป็นแผนกของบริษัทเก่า แล้วตัวที่สองค่อยล้างค่า ซึ่งไปกระตุ้น
 * ตัวแรกให้ยิงอีกรอบ ผลคือ:
 *   - ยิง API สองครั้งต่อการเปลี่ยนบริษัทหนึ่งครั้ง
 *   - ครั้งแรกส่ง (บริษัทใหม่ + แผนกของบริษัทเก่า) ซึ่งเป็นคู่ที่ไม่มีอยู่จริง → ได้ 0 ทุกช่อง
 *   - ถ้า response ของครั้งแรกมาถึงทีหลัง (race) หน้าจอจะค้างที่ 0 และช่องแผนกเด้งกลับไป
 *     เป็นแผนกของบริษัทเก่า เพราะ load() เขียน selectedDepartmentId ด้วยค่าจาก scope
 *
 * รวมเป็นตัวเดียวแล้วล้างแผนกก่อน "แล้วไม่โหลด" — การเซ็ตค่าจะกระตุ้น watch ตัวนี้ซ้ำเอง
 * รอบถัดไปจึงโหลดด้วยคู่ที่ถูกต้องครั้งเดียว
 *
 * แผนกเป็นของบริษัท (0024) — id ที่ค้างจากบริษัทก่อนไม่มีอยู่ในบริษัทใหม่
 */
watch([selectedDepartmentId, selectedCompanyCode], ([dept, company], [prevDept, prevCompany]) => {
  // ★ ข้ามการล้างแผนกเมื่อ backend ล็อกขอบเขตไว้ - ค่าที่เพิ่งเปลี่ยนไม่ได้มาจากคนกด
  //   แต่มาจาก load() ที่เขียนค่ากลับตาม scope (พนักงานทั่วไปได้ทั้งบริษัทและแผนกพร้อมกัน
  //   ในรอบแรก) ถ้าล้างทิ้งจะยิงเพิ่มอีกรอบเพื่อให้ backend บังคับค่าเดิมกลับมา
  //   และช่องแผนกจะกะพริบเป็นว่างระหว่างทาง ทั้งที่ผู้ใช้เลือกอะไรไม่ได้อยู่แล้ว
  if (!data.value?.scope.locked && company !== prevCompany && dept !== '') {
    selectedDepartmentId.value = ''
    return
  }
  if (dept !== prevDept || company !== prevCompany) void load()
})

const scopeLabel = computed(() => {
  const scope = data.value?.scope
  if (!scope) return ''
  if (scope.kind === 'UNLINKED') return 'ยังระบุแผนกไม่ได้'
  return scope.departmentName ?? 'ทุกแผนก'
})

/** เปอร์เซ็นต์สำหรับวาดวงกลม - ปัดเป็นจำนวนเต็มเพราะ --value รับ 0–100 */
const activeRing = computed(() => Math.round(data.value?.status.activePercent ?? 0))

const percent = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)}%`)

/**
 * ประโยคที่ประกาศให้ screen reader ฟังเมื่อชุดตัวเลขเปลี่ยนขอบเขต
 *
 * ★ คืนค่าว่างระหว่างโหลด ไม่ใช่คงค่าเดิมไว้ - live region อ่านเฉพาะตอน "ข้อความเปลี่ยน"
 *   ถ้าค้างค่าเดิมไว้แล้วขอบเขตใหม่บังเอิญได้ยอดเท่าเดิม จะไม่มีการประกาศเลย
 *
 * ★ ประกอบจาก scope ที่ backend ตอบ ไม่ใช่จากช่องเลือก (กติกาข้อ 1 บนหัวไฟล์) -
 *   สิ่งที่ประกาศออกไปต้องเป็นเรื่องเดียวกับตัวเลขที่แสดง ไม่ใช่สิ่งที่ผู้ใช้ขอ
 */
const liveSummary = computed(() => {
  const res = data.value
  if (loading.value || !res) return ''
  const where = [res.scope.companyName ?? 'ทุกบริษัท', scopeLabel.value].filter(Boolean).join(' · ')
  return `${where} · มูลค่าคงเหลือ ${formatMoney(res.totals.netBookValue)} บาท`
})

/** สัดส่วนความกว้างของแท่งในรายการสถานะ - 0 ชิ้นไม่มีทางเกิดเพราะ breakdown ตัดออกแล้ว */
function statusWidth(count: number): string {
  const total = data.value?.totals.assets ?? 0
  return total === 0 ? '0%' : `${(count / total) * 100}%`
}

const STATUS_LABEL: Record<AssetStatus, string> = {
  Active: 'ใช้งานอยู่',
  Inactive: 'ไม่ได้ใช้งาน',
}

// สีของแท่ง/จุดต่อสถานะ - มีสองค่าเท่านั้นตาม SAP (ดู shared/utils/asset-status.ts)
const STATUS_TONE: Record<AssetStatus, string> = {
  Active: 'bg-accent',
  Inactive: 'bg-base-content/30',
}

const departmentName = (row: DepartmentSummary) => row.departmentName ?? 'ยังไม่ระบุแผนก'

/**
 * % ที่ยังใช้งานอยู่ ของแต่ละบริษัท - ใช้แทนแท่ง breakdown ตอนดู "ทุกบริษัท"
 *
 * ★ ตัดบริษัทที่ยังไม่มีของออก - แถบยาว 0% ไม่ได้บอกอะไร และ 0/0 คิดเปอร์เซ็นต์ไม่ได้
 *   (บริษัทนั้นยังเห็นได้ในตารางสรุปข้างซ้ายซึ่งขึ้นป้าย "ยังไม่มีของ" ให้)
 *
 * ★ เรียงตามจำนวนชิ้นเหมือนโดนัทกับตาราง ไม่ใช่เรียงตาม % - ลำดับของบริษัทต้องเหมือนกัน
 *   ทั้งหน้า ไม่งั้นคนกวาดตาลงมาแล้วต้องอ่านชื่อใหม่ทุกการ์ด
 */
const activeByCompany = computed(() =>
  (data.value?.byCompany ?? [])
    .filter((c) => c.assets > 0)
    .sort((a, b) => b.assets - a.assets)
    .map((c) => ({
      companyCode: c.companyCode,
      label: c.companyName || c.companyCode,
      assets: c.assets,
      active: c.active,
      percent: (c.active / c.assets) * 100,
    })),
)

/**
 * ยังไม่เลือกบริษัท = เลือกแผนกไม่ได้ ต้องเป็น "ทุกแผนก" เท่านั้น
 *
 * ★ ชื่อแผนกซ้ำข้ามบริษัทจริง 55 ชื่อ (Finance / Executive / Information Technology ...)
 *   บางชื่อโผล่ครบทั้ง 3 บริษัท การให้เลือกแผนกตอนดูทั้งเครือแปลว่าผู้ใช้ต้องเดาว่า
 *   "Finance" อันไหนเป็นของใคร แล้วตัวเลขที่ได้กลับมาก็ดูสมเหตุสมผลจนไม่มีใครเอะใจว่าเลือกผิด
 *
 * บังคับให้เลือกบริษัทก่อนจึงตัดความกำกวมทิ้งทั้งหมด แทนที่จะไปแก้ปลายทางด้วยการ
 * เขียนรหัสบริษัทกำกับทุกตัวเลือก (ซึ่งยังต้องอ่านทีละอันอยู่ดี)
 */
const departmentLocked = computed(() => selectedCompanyCode.value === '')

// ── ตารางสรุป: สลับแกนระหว่าง "แผนก" กับ "ชั้นบัญชี" ─────────────────────────
//
// การ์ดนี้โผล่เฉพาะตอนเลือกบริษัทแล้ว (ตอนดูทั้งเครือเป็น CompanySummaryTable แทน)
// สองแกนตอบคนละคำถามจากข้อมูลชุดเดียวกัน:
//   แผนก     - "ของกองอยู่ที่หน่วยงานไหน" ใช้ตามหาเจ้าของ/ผู้รับผิดชอบ
//   ชั้นบัญชี  - แกนเดียวกับที่รายงานของ finance แบ่ง เอาไปกระทบยอดได้ทีละชั้น
//
// ★ ไม่ต้องยิง API เพิ่ม - `byDepartment` กับ `byAssetClass` มาในก้อนเดียวกันตั้งแต่แรก
//   และ backend กรองด้วยบริษัท/แผนกที่เลือกให้ทั้งคู่แล้ว (`summarizeByAssetClass` รับ
//   `scope.companyCode` ตัวเดียวกับ `summarizeByDepartment`) การสลับจึงเป็นเรื่องฝั่งจอล้วน
//   - กดสลับแล้วตัวเลขไม่กะพริบ ไม่มี loading และไม่เพิ่มภาระฝั่ง DB
//
// ★ ไม่แยกเป็นสองตาราง - คอลัมน์ตัวเลขเหมือนกันเป๊ะทั้งสองแกน ต่างแค่ชื่อแถว
//   ถ้าเขียนแยกกันสองชุด วันที่เพิ่ม/แก้คอลัมน์จะมีที่ให้ลืมแก้หนึ่งที่เสมอ
type SummaryAxis = 'department' | 'assetClass'
const summaryAxis = ref<SummaryAxis>('assetClass')

/** แถวที่ normalize แล้ว - ตารางเดียววาดได้ทั้งสองแกนโดยไม่ต้องรู้ว่ากำลังดูแกนไหน */
type SummaryRow = {
  key: string
  /**
   * รหัสที่เขียนนำหน้าชื่อ - มีเฉพาะแกนชั้นบัญชี (`null` = ไม่มีรหัสให้เขียน)
   *
   * ★ แยกเป็นคนละช่องกับ `label` ไม่ใช่ต่อสตริงเดียวกัน - จะได้ทำให้รหัสจางกว่าชื่อและ
   *   ใช้ `tabular-nums` ให้หลักตรงกันทุกแถว ซึ่งเป็นเหตุผลเดียวที่เอารหัสมาไว้ข้างหน้า:
   *   กวาดตาหาแถวที่ตรงกับรายงานของ finance ซึ่งเรียงด้วยรหัสบัญชีเหมือนกัน
   * ★ แกนแผนกเป็น null เสมอ - `departmentId` เป็น id ภายในของ AMS ไม่ใช่รหัสที่คนใช้
   *   อ้างถึงแผนก เขียนนำหน้าไปก็ไม่มีใครเอาไปเทียบกับอะไรได้
   */
  code: string | null
  label: string
  /** แถว "ยังไม่ระบุ" - ไม่ใช่หน่วยงาน/ชั้นบัญชีจริง จึงทำให้จางลงเหมือนเดิม */
  unassigned: boolean
  assets: number
  active: number
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
}

/**
 * ดัน "ยังไม่ระบุ" ไปท้ายสุดเสมอ - ไม่ใช่ปล่อยให้มันเรียงตามมูลค่าเหมือนแถวอื่น
 *
 * backend เรียงด้วยมูลค่าคงเหลือ มาก→น้อย แล้ว `nulls last` (ดู summarizeByAssetClass)
 * ทุกวันนี้แถว "ยังไม่ระบุ" ของ UBA บังเอิญไปท้ายอยู่แล้วเพราะ 35 ชิ้นนั้นไม่มีตัวเลขบัญชี
 * เลยสักชิ้น → มูลค่าเป็น null → ตกไปท้ายตาม nulls last
 *
 * ★ แต่มันเป็นเรื่องบังเอิญ ไม่ใช่กติกา วันที่สินทรัพย์ที่ยังไม่ระบุชั้นบัญชีมีตัวเลขบัญชี
 *   ติดมาด้วย (ของที่ลงทะเบียนผ่าน AMS แล้วบัญชีเพิ่งออกยอดให้ แต่ยังไม่ผูกชั้นบัญชี)
 *   แถวนั้นจะเด้งไปแทรกกลางตารางทันทีโดยไม่มีอะไรเปลี่ยนในโค้ด - ตรงนี้ทำให้เป็นกติกา
 *
 * ★ filter สองรอบแทน sort - Array.filter รักษาลำดับเดิม ลำดับของแถวที่เหลือจึงยังเป็น
 *   ของ backend เป๊ะ ๆ ถ้าใช้ sort ต้องเขียน comparator ที่จำลองการเรียงของ backend
 *   ให้ตรงด้วย แล้ววันที่ backend เปลี่ยนเกณฑ์ สองที่จะเพี้ยนจากกันเงียบ ๆ
 */
function unassignedLast(rows: SummaryRow[]): SummaryRow[] {
  return [...rows.filter((row) => !row.unassigned), ...rows.filter((row) => row.unassigned)]
}

const summaryRows = computed<SummaryRow[]>(() => {
  if (!data.value) return []

  if (summaryAxis.value === 'assetClass') {
    return unassignedLast(data.value.byAssetClass.map((row) => ({
      key: row.assetClass ?? 'none',
      code: row.assetClass,
      // ★ ยังไม่มีชื่อบัญชีแต่มีรหัส = ปล่อยว่าง ห้ามเขียน "ไม่ระบุ" - รหัสข้างหน้าอ่านออก
      //   และเอาไปเทียบกับรายงานของ finance ได้อยู่แล้ว ส่วนคำว่า "ไม่ระบุ" ต่อท้ายรหัส
      //   จะอ่านเหมือนข้อมูลหาย ทั้งที่แค่ยังไม่ได้ import ชื่อของรหัสนั้น
      //   (ตอนนี้ UBP/MIG ยังไม่มีชื่อสักรหัส - ทั้งคอลัมน์จะเป็นรหัสล้วนจนกว่าจะ import)
      // ★ "ยังไม่ระบุชั้นบัญชี" ใช้เฉพาะตอนไม่มีรหัสจริง ๆ ซึ่งเป็นคนละเรื่อง
      label: row.assetClass === null ? 'ยังไม่ระบุชั้นบัญชี' : (row.accountName ?? ''),
      unassigned: row.assetClass === null,
      assets: row.assets,
      active: row.active,
      bookedCost: row.bookedCost,
      accumulatedDepreciation: row.accumulatedDepreciation,
      netBookValue: row.netBookValue,
    })))
  }

  return unassignedLast(data.value.byDepartment.map((row) => ({
    key: String(row.departmentId ?? 'none'),
    code: null,
    label: departmentName(row),
    unassigned: row.departmentId === null,
    assets: row.assets,
    active: row.active,
    bookedCost: row.bookedCost,
    accumulatedDepreciation: row.accumulatedDepreciation,
    netBookValue: row.netBookValue,
  })))
})

// ── แบ่งหน้าตารางสรุป ───────────────────────────────────────────────────────
const SUMMARY_PAGE_SIZE = 10
const summaryPage = ref(1)

const pagedSummary = computed(() => {
  const start = (summaryPage.value - 1) * SUMMARY_PAGE_SIZE
  return summaryRows.value.slice(start, start + SUMMARY_PAGE_SIZE)
})

/** หน่วยนับต่อท้ายช่วง - ต้องเปลี่ยนตามแกน ไม่งั้นจะอ่านว่า "12 แผนก" ทั้งที่กำลังดูชั้นบัญชี */
const summaryUnit = computed(() => (summaryAxis.value === 'assetClass' ? 'ชั้นบัญชี' : 'แผนก'))

const summaryRange = computed(() => {
  const total = summaryRows.value.length
  if (total === 0) return ''
  const start = (summaryPage.value - 1) * SUMMARY_PAGE_SIZE + 1
  return `${start}–${Math.min(start + SUMMARY_PAGE_SIZE - 1, total)} จาก ${total} ${summaryUnit.value}`
})

// สลับแกนแล้วต้องเด้งกลับหน้า 1 - สองแกนมีจำนวนแถวไม่เท่ากัน (UBA: 40 แผนก vs 54 ชั้นบัญชี)
// ถ้าค้างอยู่หน้า 4 แล้วสลับไปแกนที่มีแค่ 2 หน้า ตารางจะว่างเปล่าโดยไม่มีอะไรบอกว่าทำไม
watch(summaryAxis, () => {
  summaryPage.value = 1
})
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 text-left">
      <!-- หัวเรื่อง + ป้ายบอกขอบเขต อยู่ในก้อนเดียวกัน - ป้ายเป็นคำขยายของ "ภาพรวมของใคร"
           ไม่ใช่แถบเครื่องมือของตัวเอง เดิมมันกินความกว้างทั้งหน้าเป็นแถบที่สามคั่นระหว่าง
           ช่องเลือกกับตัวเลข ทั้งที่พูดเรื่องเดียวกับหัวเรื่อง
           ★ ข้อความยังอ่านจาก scope ที่ backend ตอบ ไม่ใช่จากช่องเลือก (ดูข้อ 1 บนหัวไฟล์) -->
      <div class="min-w-0">
        <TopicCard value="dashboard" />

        <div v-if="data && data.scope.kind !== 'UNLINKED'" class="mt-2 flex flex-wrap items-center gap-2">
          <span class="badge badge-ghost gap-1">
            <Icon icon="lucide:filter" class="size-3.5" />
            {{ scopeLabel }}
          </span>
          <span v-if="selectedCompanyCode" class="badge badge-ghost gap-1">
            <Icon icon="lucide:building-2" class="size-3.5" />
            {{ selectedCompanyCode }}
          </span>
          <span v-if="loading" class="loading loading-spinner loading-xs" />
        </div>
      </div>

      <div class="flex w-full flex-wrap gap-3 sm:w-auto">
        <!-- ช่องเลือกบริษัท - วางก่อนช่องแผนกตามลำดับที่คนอ่าน: บริษัทเป็นขอบเขตที่กว้างกว่า
           ★ ถูกล็อกตาม role ได้เหมือนแผนกแล้ว (companyLocked) - บริษัทเป็นแกนของสิทธิ์
             ตัวที่สอง ไม่ใช่แค่ตัวกรองเพื่อความสะดวกอีกต่อไป (ดู DashboardScope) -->
        <!-- ★ กว้างพอให้อ่านชื่อบริษัทจบ - เดิม sm:w-30 (120px) ตัดทุกตัวเลือกทิ้งตั้งแต่กลางชื่อ
             ทั้งที่ตัวเลือกคือ "ชื่อบริษัท (จำนวนชิ้น)" ซึ่งตัวเลขท้ายคือส่วนที่ถูกตัดก่อนเสมอ -->
        <label class="form-control w-full max-w-xs text-left sm:w-56">
          <span class="mb-1 flex items-center gap-1.5 text-xs text-base-content/70">
            <Icon icon="lucide:building-2" class="size-3.5" />
            บริษัท
            <Icon v-if="data?.scope.companyLocked" icon="lucide:lock" class="size-3.5"
              title="คุณเห็นข้อมูลได้เฉพาะบริษัทของตัวเอง" />
          </span>
          <select v-model="selectedCompanyCode" class="select h-11 w-full sm:h-10"
            :disabled="loading || !!data?.scope.companyLocked">
            <!-- ถูกล็อก = มีทางเลือกเดียวจริง ๆ จึงไม่ใส่ "ทั้งหมด" ที่กดแล้วไม่มีผล
               ★ backend กรอง byCompany ให้เหลือบริษัทเดียวแล้วตอนล็อก จึงวนลิสต์เดิมได้เลย
                 ไม่ต้องมี branch แยกแบบช่องแผนก (ของแผนกต้องแยกเพราะ departmentOptions
                 ถูกเติมเฉพาะรอบที่ไม่กรอง ซึ่งพนักงานทั่วไปไม่เคยได้) -->
            <option v-if="!data?.scope.companyLocked" value="">ทั้งหมด</option>
            <option v-for="c in companyOptions" :key="c.companyCode" :value="c.companyCode">
              {{ c.companyName }} ({{ c.assets.toLocaleString('th-TH') }})
            </option>
          </select>
        </label>

        <!-- ช่องเลือกแผนก - ปิดไว้เมื่อ backend ล็อกขอบเขต (พนักงานทั่วไป)
           ป้ายข้างล่างบอกตรง ๆ ว่าเห็นได้แค่แผนกตัวเอง จะได้ไม่คิดว่าระบบเสีย -->
        <label class="form-control w-full max-w-xs text-left sm:w-64">
          <span class="mb-1 flex items-center gap-1.5 text-xs text-base-content/70">
            <Icon icon="lucide:filter" class="size-3.5" />
            แผนก
            <Icon v-if="data?.scope.locked" icon="lucide:lock" class="size-3.5"
              title="คุณเห็นข้อมูลได้เฉพาะแผนกของตัวเอง" />
          </span>
          <select v-model="selectedDepartmentId" class="select h-11 w-full sm:h-10"
            :disabled="loading || !!data?.scope.locked || departmentLocked">
            <!-- ถูกล็อก = มีทางเลือกเดียวจริง ๆ จึงใส่แค่แผนกตัวเอง ไม่ใช่ลิสต์ที่กดไม่ได้
               ★ ต้องมี option นี้เสมอ ไม่งั้นช่องจะโชว์ว่างทั้งที่ v-model มีค่าอยู่
                 (พนักงานไม่เคยได้ผลลัพธ์รอบไม่กรอง departmentOptions จึงว่างตลอด) -->
            <template v-if="data?.scope.locked">
              <option v-if="data.scope.departmentId !== null" :value="String(data.scope.departmentId)">
                {{ data.scope.departmentName }}
              </option>
            </template>
            <!-- ★ ยังไม่เลือกบริษัท = โชว์ตัวเลือกเดียวที่บอกว่าต้องทำอะไรก่อน
                 ห้ามโชว์ลิสต์แผนกทั้ง 40 ตัวในช่องที่กดไม่ได้ - ตัวเลือกที่เลือกไม่ได้
                 ไม่ควรมีอยู่ให้เห็นตั้งแต่แรก มันอ่านเป็น "ระบบเสีย" ไม่ใช่ "ยังไม่ถึงคิว" -->
            <template v-else-if="departmentLocked">
              <option value="">เลือกบริษัทก่อน</option>
            </template>
            <template v-else>
              <option value="">ทุกแผนก</option>
              <option v-for="d in departmentOptions" :key="d.departmentId!" :value="String(d.departmentId)">
                {{ departmentName(d) }} ({{ d.assets }})
              </option>
            </template>
          </select>

          <!-- ★ เหตุผลของการล็อกต้องเป็นตัวหนังสือที่มองเห็น ไม่ใช่ title บน select ที่ disabled
               control ที่ disabled หลุดจาก tab order ทั้งหมด และ title บนมันไม่ถูก AT ประกาศ
               กับ hover ก็ไม่ขึ้นแน่นอนบน Chrome - ที่ผ่านมาจึงเท่ากับไม่มีคำอธิบายเลย
               วางไว้ใน <label> เดียวกัน ข้อความจึงถูกอ่านรวมเป็นชื่อของช่องนี้ด้วย -->
          <span v-if="departmentLocked" class="mt-1 text-xs text-base-content/70">
            เลือกบริษัทก่อนจึงจะเลือกแผนกได้
          </span>
        </label>
      </div>
    </div>

    <div v-if="loading && !data" class="mt-16 flex justify-center">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else-if="loadError" role="alert" class="alert alert-error alert-soft mt-6">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm h-11 sm:h-8" @click="load">ลองใหม่</button>
    </div>

    <!-- ยังไม่ผูกพนักงาน ≠ ไม่มีของ - ต้องให้ผู้ดูแลระบบไปแก้ ไม่ใช่ผู้ใช้รอเฉย ๆ
         (ข้อความเดียวกับหน้า My asset โดยตั้งใจ ปัญหาเดียวกันและทางแก้เดียวกัน) -->
    <div v-else-if="data?.scope.kind === 'UNLINKED'" role="alert" class="alert alert-warning mt-6">
      <Icon icon="mdi:account-question-outline" class="size-5" />
      <span>
        บัญชีผู้ใช้ของคุณยังไม่ได้ผูกกับข้อมูลพนักงาน จึงยังบอกไม่ได้ว่าคุณอยู่แผนกไหน
        แจ้งผู้ดูแลระบบให้ผูกให้ก่อน
      </span>
    </div>

    <!-- ── ก้อนตัวเลขทั้งหมด ───────────────────────────────────────────────────
         ★ เป็น <div> ไม่ใช่ <template> เพราะต้องมีที่แขวน aria-busy กับสถานะจาง
           ระหว่างโหลด - ตัวกรองหนึ่งครั้งสลับพร้อมกันสี่ส่วน (แถวกราฟ ตารางซ้าย
           การ์ดสถานะขวา และ DepartmentTable) โดยที่สัญญาณเดียวคือ spinner เล็ก ๆ
           มุมซ้ายบน ซึ่งอยู่คนละมุมกับช่องที่ผู้ใช้เพิ่งกด
         ★ จางทั้งก้อนระหว่างโหลด = แยกออกว่าตัวเลขที่เห็นเป็นของเก่าที่ยังไม่ถูกแทน -->
    <div v-else-if="data" :aria-busy="loading" class="transition-opacity" :class="loading ? 'opacity-60' : ''">
      <!-- ★ ประกาศผลลัพธ์ที่ "ลงตัวแล้ว" ให้ screen reader - ว่างระหว่างโหลดโดยตั้งใจ
           เพื่อให้ค่าที่เซ็ตกลับมาตอนโหลดเสร็จนับเป็นการเปลี่ยนแปลง แล้ว AT จึงอ่านออกมา
           ถ้าไม่มีบรรทัดนี้ คนใช้ screen reader เปลี่ยนบริษัทแล้วทั้งหน้ากลายเป็นตัวเลข
           ชุดใหม่โดยไม่มีเสียงอะไรเลย -->
      <p class="sr-only" role="status" aria-live="polite">{{ liveSummary }}</p>

      <!-- ── ตัวเลขหลัก - สองก้อนตาม "ชนิดของคำถาม" ไม่ใช่ห้าช่องเท่ากัน ──────────
           ซ้าย (2/3) เงิน   : ราคาทุน − ค่าเสื่อมสะสม = มูลค่าคงเหลือ สามตัวนี้เป็นสมการเดียว
                              อยู่กล่องเดียวกันตามลำดับผลลัพธ์ก่อนแล้วตามด้วยที่มา
           ขวา (1/3) ทะเบียน : จำนวนชิ้น + สัดส่วนที่ยังใช้งานอยู่ - เป็นเรื่องของ "ของ" ไม่ใช่ "เงิน"

           ★ ห้ามกลับไปเป็นห้าช่องเท่ากัน สาเหตุคือลำดับชั้นกลับหัว: ช่องที่ตัวหนังสือใหญ่สุด
             คือจำนวนชิ้น (text-3xl) ส่วนมูลค่าคงเหลือซึ่งเป็นตัวที่คนเปิดหน้านี้มาดูจริง ๆ
             เป็นช่องที่สี่ด้วยขนาด text-xl - เล็กกว่าตัวที่ไม่ใช่พระเอกเกือบครึ่ง และที่ lg
             ห้าช่องในสามคอลัมน์ตกเป็น 3+2 ทำให้มันไปโผล่หัวแถวที่สองแบบไม่ได้ตั้งใจ

           ★ ยอดเงินทุกตัวยังต้อง whitespace-nowrap - ยอดระดับบริษัทยาวหลักสิบตัวอักษร
             (487,215,903.44) ตัดขึ้นบรรทัดใหม่กลางจำนวนเมื่อไหร่คืออ่านผิดทันที
             โครงนี้ให้ที่กับยอดกว้างขึ้นกว่าเดิมมาก จึงไม่ต้องมีเพดาน 2xl แบบห้าช่องอีก -->
      <!-- ★ แยกสองคอลัมน์ที่ xl ไม่ใช่ lg - ที่ 1280px sidebar (w-64) กินไป 256 เหลือให้เนื้อหา
           864px กล่องเงินได้ 2/3 = 565px ซึ่งพอกับยอดยาวสุดสบาย ๆ ส่วนที่ lg (1024px)
           เหลือแค่ 608px คอลัมน์ 1/3 จะเหลือ ~192px แล้วหัวข้อ 'Total fixed asset' ตัดสองบรรทัด
           (วัดจริงแล้ว) ต่ำกว่า xl จึงให้ซ้อนกันเต็มความกว้างแทน -->
      <div class="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <!-- ── เงิน - กล่องเดียวในหน้าที่ยกระดับด้วยเงา (ไม่ใช่แค่เส้นขอบเหมือนที่เหลือ) -->
        <div class="card min-w-0 border border-base-300 bg-base-100 shadow-lg xl:col-span-2">
          <div class="card-body justify-between gap-0 text-left">
            <div>
              <!-- ตัวเลขที่คนเปิดหน้านี้มาดูจริง ๆ - ที่เดียวในหน้าที่ใช้สี primary
                   ★ เป็น <h2> ไม่ใช่ <p> - การ์ดนี้คือส่วนแรกของหน้า ถ้าไม่มี h2 ตรงนี้
                     heading ตัวถัดไปที่เอกสารเจอคือ <h3> ของแถบความสด = กระโดดจาก h1
                     ข้ามชั้นไป h3 (คลาสเดิมทุกตัว หน้าตาไม่เปลี่ยนสักพิกเซล) -->
              <h2 class="text-sm font-medium text-base-content/70">Net Book Value</h2>
              <!-- ★★ ตัวเลขต้องมี grow-0 เสมอ — daisyUI ตั้ง flex-grow: 1 ให้ทุกย่อหน้าที่อยู่ใน
                     card-body ("card-body :where(p)") พอเอาย่อหน้ามาเป็น flex item มันจึงยืดเต็ม
                     แถว ซึ่งจะดันอะไรก็ตามที่มาวางข้าง ๆ ไปชิดขอบขวาจนอ่านไม่ออกว่าคู่กัน
                     (วัดจริงตอนที่ยังมีส่วนต่าง: ย่อหน้ากว้าง 562px ทั้งที่ตัวหนังสือกว้าง 257px)

                   ★ **ไม่มีส่วนต่างเทียบเดือนก่อนบนตัวเลขเงินทั้งสามตัวแล้ว (2026-09-21)**
                     ผู้ใช้อ่านแล้วสับสน และวัดข้อมูลจริงแล้วพบว่าสองในสามไม่ได้บอกอะไรเลย:
                       ค่าเสื่อมสะสม  ขึ้นราว +1.1 ล้านทุกเดือน แกว่งแค่ ±5% (UBA งวด 1–8/2569)
                                     = เลขเดิมซ้ำทุกครั้งที่เปิดหน้า
                       มูลค่าคงเหลือ  เป็นผลรวมของสามเหตุการณ์ที่ไม่เกี่ยวกัน (ซื้อเพิ่ม −
                                     ค่าเสื่อม − มูลค่าที่ตัดจำหน่าย) อ่านแล้วตอบไม่ได้ว่าเกิดอะไร
                     ★ ราคาทุนเป็นตัวที่ "มีข่าวจริง" (งวด 8 ซื้อเพิ่ม 1.76 ล้าน = 12 เท่าของงวด 1)
                       แต่ผู้ใช้ตัดสินใจเอาออกด้วยเพื่อให้การ์ดเงินไม่มีส่วนต่างเลยทั้งกล่อง
                       จะเอากลับมาเฉพาะตัวนี้ก็ได้ - KpiDelta ยังอยู่ ยังใช้ที่จำนวนชิ้น -->
              <div class="mt-1 flex flex-wrap items-baseline gap-x-2">
                <p class="grow-0 text-3xl font-bold whitespace-nowrap text-primary tabular-nums sm:text-4xl 2xl:text-5xl">
                  {{ formatMoney(data.totals.netBookValue) }}
                </p>
              </div>
              <p class="mt-3 text-xs text-base-content/70">
                บาท (มูลค่าคงเหลือ)
                <!-- ★ ป้ายนี้ห้ามตัดทิ้ง - SAP ลงค่าเสื่อมเดือนละครั้งตอนปิดงวด ยอดจึงนิ่งทั้ง
                     เดือนแล้วกระโดดทีเดียวตอนต้นเดือนถัดไป ไม่บอกวันที่ = คนเห็นเลขไม่ขยับ
                     สามสัปดาห์แล้วอ่านว่าระบบค้าง ทั้งที่ตัวเลขถูกอยู่
                     ★ แสดงเป็นช่วงเมื่อสองค่าไม่เท่ากัน - แต่ละบริษัทปิดงวดคนละเวลา
                       (14 ก.ย. 2569: UBA/UBP ถึง 31 ส.ค. แต่ MIG ถึงแค่ 31 ม.ค.) ตอนดูรวม
                       ทุกบริษัทยอดก้อนนี้จึงเป็นส่วนผสมของหลายวัน บอกตรง ๆ ดีกว่าเลือกมาวันเดียว -->
              </p>

              <!-- ── ฐานที่ยอดข้างบนนับมา (หัวไฟล์ข้อ 2) ──────────────────────────
                   ★★ แยกสองสาเหตุเสมอ ห้ามรวมเป็น "ยังไม่ถูกนับ N ชิ้น" ก้อนเดียว

                     ค้างปีเก่า      = มีตัวเลขอยู่ แต่เป็นของปีก่อน **ไม่ใช่งานค้าง**
                                      ของที่ SAP เลิกส่งตัวเลขใหม่ (ส่วนใหญ่ตัดจำหน่ายแล้ว)
                     ยังไม่มีข้อมูล  = รอ SAP ส่งตัวเลขมา **อันนี้คืองานค้างจริง**

                     วัด 2026-09-16 ที่ UBA: 703 = ค้างปีเก่า 668 + ยังไม่มีข้อมูล 35
                     เขียนรวมเป็น 703 ทำให้อ่านเหมือนมีงานค้าง 703 รายการ ทั้งที่มี 35

                   ★ อ่านจาก totals.* ห้ามคำนวณเองจาก freshness.* — สองชุดตอบคนละคำถาม
                     (freshness ตอบเรื่องความสดของข้อมูล ส่วน totals ตอบว่ายอดเงินบนการ์ด
                     ขาดไปกี่ชิ้น) และ noDataCount นับเฉพาะ "ไม่มีแถวเลย" ซึ่งแคบกว่า
                     unvaluedMissing ที่รวมแถวปีล่าสุดที่ยอดไม่ครบด้วย

                   ★ แต่ละก้อนซ่อนเองเมื่อเป็น 0 - บริษัทที่ข้อมูลครบจะเหลือบรรทัดเดียว
                     หรือไม่มีบรรทัดนี้เลย บรรทัดนี้มีไว้เตือนเฉพาะตอนมีของตกหล่นจริง -->
              <p v-if="data.totals.unvalued" class="mt-1 text-xs text-base-content/70">
                นับจาก {{ data.totals.valued.toLocaleString('th-TH') }} ชิ้นที่มีตัวเลขบัญชีครบ
                <template v-if="data.totals.unvaluedStale">
                  · ตัวเลขค้างปีเก่า {{ data.totals.unvaluedStale.toLocaleString('th-TH') }} ชิ้น
                </template>
                <template v-if="data.totals.unvaluedMissing">
                  · ยังไม่มีข้อมูล {{ data.totals.unvaluedMissing.toLocaleString('th-TH') }} ชิ้น
                </template>
              </p>

              <!-- ที่มาของยอดข้างบน - เรียงตามสมการ (ตั้งต้น แล้วหักออก) ไม่ใช่เรียงตามขนาดยอด
                   ★ ซ้อนกันบนจอมือถือ - สองคอลัมน์ที่ 375px ทำให้ป้าย 'Accumulated Depreciation'
                     ตัดสองบรรทัดฝั่งเดียว แล้วยอดสองตัวหลุดจากเส้นฐานเดียวกันจนดูเหมือน
                     คนละระดับชั้น ทั้งที่เป็นของคู่กัน -->
              <div class="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-base-200 pt-4 sm:grid-cols-2">
                <div class="min-w-0">
                  <p class="text-xs text-base-content/70">Total Acquisition Cost</p>
                  <div class="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <p class="grow-0 text-base font-medium whitespace-nowrap tabular-nums sm:text-lg">
                      {{ formatMoney(data.totals.bookedCost) }}
                    </p>
                  </div>
                  <p class="mt-0.5 text-xs text-base-content/70">บาท (ราคาทุนทั้งหมด)</p>
                </div>
                <div class="min-w-0">
                  <p class="text-xs text-base-content/70">Accumulated Depreciation</p>
                  <div class="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <p class="grow-0 text-base font-medium whitespace-nowrap tabular-nums sm:text-lg">
                      {{ formatMoney(data.totals.accumulatedDepreciation) }}
                    </p>
                  </div>
                  <p class="mt-0.5 text-xs text-base-content/70">บาท (ค่าเสื่อมราคาสะสม)</p>
                </div>
              </div>
            </div>

            <!-- ── ความสดของตัวเลขบัญชี - ย้ายมาจากการ์ดสถานะมุมขวาล่าง ───────────
                 มันตอบคำถามว่า "ยอดข้างบนเป็นข้อมูลของปีไหน" ซึ่งคือยอดในกล่องนี้ ไม่ใช่
                 แท่งสถานะที่มันไปอยู่ด้วย - อยู่ห่างจากสิ่งที่ตัวเองขยายสองส่วนเต็ม ๆ
                 (ดูหัวไฟล์ข้อ 2: ข้อจำกัดของยอดเงินต้องอยู่ติดกับตัวเลข) -->
            
          </div>
        </div>

        <!-- ── ทะเบียน - จำนวนชิ้นนำ สัดส่วนที่ยังใช้งานอยู่เป็นแถบท้ายการ์ด
             แถบท้ายวางตรงกับแถบ "ข้อมูลตัวเลขทางบัญชี" ของกล่องเงิน สองการ์ดจึงจบด้วย
             จังหวะเดียวกันแทนที่จะปล่อยการ์ดนี้สั้นกุดแล้วเหลือช่องว่างค้างในกริด -->
        <div class="card min-w-0 border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body gap-0 text-left">
            <!-- ★ ทิศทางสลับตามความกว้างที่การ์ดได้จริง ไม่ใช่ตามขนาดจอเฉย ๆ:
                   ต่ำกว่า sm  = การ์ดแคบ    → เรียงลงล่าง เส้นคั่นแนวนอน
                   sm ถึง xl   = การ์ดเต็มแถว → เรียงข้างกัน เส้นคั่นแนวตั้ง (ไม่งั้นเหลือที่ว่างครึ่งแถว)
                   xl ขึ้นไป   = การ์ดเป็นคอลัมน์ 1/3 → กลับมาเรียงลงล่าง โดยดันก้อนล่างไปชิดฐาน
                                ให้จบระดับเดียวกับแถบ 'ข้อมูลตัวเลขทางบัญชี' ของกล่องเงิน -->
            <div class="flex h-full flex-col justify-between sm:flex-row sm:items-stretch sm:justify-start
              xl:flex-col xl:justify-between">
              <div class="flex items-center justify-left gap-5 sm:flex-1 xl:flex-none">
                <Icon icon="lucide:boxes" class="size-16 shrink-0 text-primary" aria-hidden="true " />
                <div class="min-w-0">
                  <h2 class="text-sm font-medium text-base-content/70"> Total fixed asset</h2>
                  <div class="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <p class="grow-0 text-4xl font-bold tabular-nums">
                      {{ data.totals.assets.toLocaleString('th-TH') }}
                    </p>
                    <KpiDelta v-if="data.previousTotals" unit="count" :since="data.previousTotals.periodMonth"
                      :current="data.totals.assets" :previous="data.previousTotals.assets" />
                  </div>
                  <p class="mt-1.5 text-xs text-base-content/70">ชิ้นที่อยู่ในทะเบียนแล้ว</p>
                </div>
                
              </div>

              <div class="mt-5 flex items-center justify-between gap-3 border-t border-base-200 pt-3
                sm:mt-0 sm:ml-6 sm:flex-1 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6
                xl:mt-5 xl:ml-0 xl:flex-none xl:border-t xl:border-l-0 xl:pt-3 xl:pl-0">
                <div class="min-w-0">
                  <p id="ams-active-ratio-label" class="text-xs font-medium text-base-content/70">
                    Active / Inactive
                  </p>
                  <p class="mt-0.5 text-lg font-medium tabular-nums">
                    {{ percent(data.status.activePercent) }}
                  </p>
                </div>
                <!-- ★ วงแหวนขึ้นเฉพาะตอนคิดเปอร์เซ็นต์ได้จริง
                     activeRing บีบ null เป็น 0 (ต้องบีบ เพราะ --value รับแต่ 0-100) ผลคือ
                     ตอนขอบเขตไม่มีของเลย ตัวหนังสือขึ้น '-' แต่วงแหวนข้าง ๆ ขึ้น '0%'
                     อย่างมั่นใจ - สองอันนี้ขัดกันเองในระยะ 40px และ screen reader จะได้ยิน
                     ว่า 0 ทั้งที่คำตอบจริงคือ "ตอบไม่ได้"

                     ★ aria-labelledby ชี้ป้ายที่มีอยู่แล้ว ไม่ตั้งชื่อใหม่ - ไม่งั้นชื่อที่
                       ประกาศกับชื่อที่เห็นบนจอจะ drift กันวันหลัง -->
                <div v-if="data.status.activePercent !== null" class="radial-progress shrink-0 text-success"
                  :style="`--value:${activeRing}; --size:3.5rem; --thickness:5px;`" role="progressbar"
                  :aria-valuenow="activeRing" aria-valuemin="0" aria-valuemax="100"
                  aria-labelledby="ams-active-ratio-label">
                  <span class="text-xs text-base-content">{{ activeRing }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      <!-- ── กราฟสองตัวนี้อ่านจาก byDepartment ก้อนเดียวกับตารางข้างล่าง ────────────
           ไม่มีการยิง API เพิ่ม และไม่มีการคำนวณยอดใหม่ฝั่งจอ - ตัวเลขบนกราฟกับในตาราง
           จึงเป็นชุดเดียวกันเสมอ ห้ามเปลี่ยนไปดึงจาก endpoint อื่น ไม่งั้นสองที่นี้จะเริ่ม
           ไม่ตรงกันโดยไม่มีอะไรฟ้อง

           ★ กราฟตัดยอดให้เหลือเท่าที่อ่านออก (5 แผนก + อื่น ๆ / 10 อันดับแรก) ทั้งคู่จึง
             "ไม่ใช่ที่สำหรับกระทบยอด" - ตารางสรุปรายแผนกข้างล่างคือที่ที่ครบ

           ★ เคยหายไปทั้งแถวมาแล้วครั้งหนึ่งโดยที่ import ข้างบนยังอยู่ ซึ่งไม่มีอะไรฟ้องเลย
             (import ที่ไม่ถูกใช้ไม่ทำให้ build พัง) ถ้าจะเอาออกจริง ให้ลบ import ด้วย -->
      <!-- ── แถวนี้มีสามหน้าตา ตามขอบเขตที่กำลังดู ─────────────────────────────
             ทุกบริษัท + ทุกแผนก  → รายบริษัท (ชิ้น / องค์ประกอบมูลค่า)
             บริษัทเดียว + ทุกแผนก → รายแผนก  (ชิ้น / อันดับมูลค่า)
             แผนกเดียว            → เจาะแผนกนั้น (ค่าเสื่อม / อายุคงเหลือ)

           ★ กราฟรายแผนกต้องไม่โผล่ตอนดู "ทุกบริษัท" — ชื่อแผนกซ้ำข้ามบริษัทจริง 55 ชื่อ
             (บางชื่อครบทั้งสามบริษัท) และกราฟทั้งสองตัววาดแต่ชื่อแผนกโดยไม่มีรหัสบริษัท
             กำกับ ผลคือแท่งสองแท่งที่หน้าตาเหมือนกันแต่เป็นคนละบริษัท — วัด 2026-09-07:
             อันดับ 7-8 คือ 'Supply Chain Mangement ( SCM )' ของ UBA กับ
             'Supply Chain Mangement' ของ MIG ยอดต่างกัน 1% แยกด้วยตาไม่ได้
             การสลับทั้งแถวแก้เรื่องนี้โดยโครงสร้าง ไม่ต้องไปไล่เติมรหัสบริษัทในกราฟ -->
      <div v-if="!selectedDepartmentId && !selectedCompanyCode" class="mt-10 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CompanySharePie class="xl:col-span-1" :rows="data.byCompany" />
        <!-- ── การ์ดค่าเสื่อมรายบริษัท: สองกราฟสลับกันด้วยปุ่มในหัวการ์ด ──────────
             ★ v-if/v-else ไม่ใช่ v-show - สองกราฟนี้เป็น ApexCharts คนละตัวที่ผูก
               ResizeObserver ระดับ window ไว้ (ดู AppApexChart) การซ่อนด้วย CSS จะทิ้ง
               กราฟที่มองไม่เห็นไว้กินทรัพยากรและวัดความกว้างจากกล่องที่กว้าง 0
             ★ ทั้งสองก้อนเป็น null พร้อมกันเสมอ (backend กั้นด้วยเงื่อนไขเดียวกันเป๊ะ)
               กดสลับแล้วจึงไม่มีทางเจอการ์ดว่างข้างเดียว -->
        <CompanyDepreciationTrendLine v-if="depreciationChart === 'trend'" class="xl:col-span-2"
          :data="data.depreciationTrend">
          <template #toggle>
            <DepreciationChartToggle v-model="depreciationChart" />
          </template>
        </CompanyDepreciationTrendLine>
        <CompanyDepreciationRunoffLine v-else class="xl:col-span-2" :data="data.depreciationRunoff">
          <template #toggle>
            <DepreciationChartToggle v-model="depreciationChart" />
          </template>
        </CompanyDepreciationRunoffLine>
      </div>
      <div v-else-if="!selectedDepartmentId" class="mt-10 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <!-- ★ แกนเป็นชั้นบัญชี ไม่ใช่แผนก - เป็นแกนเดียวกับที่รายงานของ finance แบ่ง
             จึงเอาตัวเลขไปเทียบกับชีต Asset-สรุป ได้ทีละชั้น ส่วนมุมมองรายแผนก
             ยังอยู่ครบในตารางสรุปใต้หน้านี้ -->
        <AssetClassSharePie :rows="data.byAssetClass" class="xl:col-span-1" />
        <AssetClassValueRankBar :rows="data.byAssetClass" class="xl:col-span-2" />
      </div>
      <div v-else class="mt-10 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <!-- ★ การ์ดใบเดียวกับมุมมอง "เลือกบริษัทแล้ว" ข้างบน ต่างแค่ส่ง departmentName เพิ่ม
             - byAssetClass ถูก backend กรองด้วยแผนกที่เลือกอยู่แล้ว (ดู summarizeByAssetClass)
             ตัวเลขจึงเป็นของแผนกนั้นโดยไม่ต้องทำอะไรเพิ่ม
             ★ เคยเป็นโดนัท "สัดส่วนมูลค่า" คนละไฟล์ที่โครงเหมือนกันเกือบทั้งดุ้น ต่างแค่
             วัดด้วยเงินแทนจำนวนชิ้น - ยุบมาใช้ใบเดียวกันเมื่อ 2026-09-16 -->
        <AssetClassSharePie
          class="xl:col-span-1"
          :rows="data.byAssetClass"
          :department-name="scopeLabel"
        />
        <RemainingLifeChart class="xl:col-span-2" :data="data.remainingLife" :department-name="scopeLabel"
          :as-of-date="data.totals.asOfDateLatest" />
      </div>

      <div class="mt-10 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <!-- ── สรุปรายบริษัท (เฉพาะตอนดูทุกบริษัท) ───────────────────────────
             เปลี่ยน "แกน" ไม่ใช่เติมคอลัมน์บริษัทลงตารางรายแผนก - เหตุผลเต็มอยู่ในไฟล์
             CompanySummaryTable (สรุป: ตอนดูทั้งเครือ คำถามคือ "บริษัทไหนเป็นยังไง") -->
        <CompanySummaryTable v-if="!selectedCompanyCode" class="xl:col-span-2" :rows="data.byCompany" />

        <!-- ── สรุปรายแผนก ──────────────────────────────────────────────────── -->
        <div v-else class="card border border-base-300 bg-base-100 shadow-sm xl:col-span-2">
          <div class="card-body gap-3 text-left">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 id="ams-department-summary-title" class="card-title text-base">
                {{ summaryAxis === 'assetClass' ? 'สรุปรายหมวดหมู่ทางบัญชี' : 'สรุปรายแผนก' }}
                <span class="badge badge-ghost badge-sm">{{ summaryRows.length }}</span>
              </h2>

              <div class="flex flex-wrap items-center gap-3">
                <!-- บอกว่ากำลังดูช่วงไหนของทั้งหมด - ตารางนี้ไม่ได้แสดงครบในหน้าเดียว
                     ถ้าไม่บอก คนจะบวกเฉพาะแถวที่เห็นแล้วสรุปว่ายอดข้างบนผิด -->
                <span class="text-xs text-base-content/70">{{ summaryRange }}</span>

                <!-- ── สลับแกนของตาราง ────────────────────────────────────────
                     ★ ใช้ role="group" + aria-pressed ไม่ใช่ tab - สองปุ่มนี้เปลี่ยน
                       "วิธีจัดกลุ่มข้อมูลในตารางเดียวกัน" ไม่ได้สลับแผงเนื้อหาคนละชุด
                       ถ้าประกาศเป็น tablist screen reader จะรอ panel ที่ไม่มีอยู่จริง
                     ★ ปุ่มที่เลือกอยู่ต้องต่างจากอีกปุ่มด้วย "สี" ไม่ใช่แค่ความเข้ม -
                       badge-ghost ทั้งคู่แบบร่างเดิมแยกด้วยตาไม่ออกว่าอันไหนกำลังใช้ -->
                <div class="join" role="group" aria-label="แกนของตารางสรุป">

                  <button
                    type="button"
                    class="btn btn-xs join-item"
                    :class="summaryAxis === 'assetClass' ? 'btn-accent' : 'btn-ghost'"
                    :aria-pressed="summaryAxis === 'assetClass'"
                    @click="summaryAxis = 'assetClass'"
                  >
                    Asset Class
                  </button>
                                    <button
                    type="button"
                    class="btn btn-xs join-item"
                    :class="summaryAxis === 'department' ? 'btn-accent' : 'btn-ghost'"
                    :aria-pressed="summaryAxis === 'department'"
                    @click="summaryAxis = 'department'"
                  >
                    Department
                  </button>
                </div>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="table table-sm table-pin-rows table-freeze-first" aria-labelledby="ams-department-summary-title">
                <thead>
                  <tr>
                    <th scope="col" class="freeze-col">
                      {{ summaryAxis === 'assetClass' ? 'ชั้นบัญชี' : 'แผนก' }}
                    </th>
                    <th scope="col" class="text-center">ชิ้น</th>
                    <th scope="col" class="text-right">Active</th>
                    <th scope="col" class="text-right">ราคาทุน</th>
                    <th scope="col" class="text-right">ค่าเสื่อมสะสม</th>
                    <th scope="col" class="text-right">มูลค่าคงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- แถวที่ยังไม่มีของ จางลงทั้งแถว - ให้กวาดตาหาแถวที่มีของได้เร็ว
                       แต่ยังอ่านออกว่ามีแผนก/ชั้นบัญชีนี้อยู่ (ซึ่งคือเหตุผลที่เอามันมาแสดง) -->
                  <tr v-for="row in pagedSummary" :key="row.key" class="hover:bg-base-200"
                    :class="row.assets === 0 ? 'text-base-content/45' : ''">
                    <td class="freeze-col">
                      <!-- รหัสบัญชีนำหน้า จางกว่าชื่อและใช้ tabular-nums ให้หลักตรงกันทุกแถว
                           - มีไว้ให้กวาดตาเทียบกับรายงานของ finance ที่เรียงด้วยรหัส
                           เหมือนกัน ไม่ได้มีไว้อ่านเป็นเนื้อความ จึงไม่ควรเด่นเท่าชื่อ
                           ★★ ไม่ตัดบรรทัดเลย - ปล่อยให้ชื่อบัญชีดันความกว้างของคอลัมน์ออกไป
                             แล้วคอลัมน์ตัวเลขถูกดันตามไปทางขวา (ตารางมี overflow-x-auto อยู่แล้ว)
                             เคยให้ตัดบรรทัด แต่ชื่อบัญชีเป็นสตริงที่ขีดคั่นเป็นท่อน ๆ
                             ('เครื่องจักร และอุปกรณ์-สำนักงาน-ตลาดต่างประเทศจีน') พอตัดกลางท่อน
                             แล้วอ่านไม่ออกว่าท่อนไหนต่อท่อนไหน - เลื่อนแนวนอนอ่านง่ายกว่า -->
                      <div class="flex gap-2 whitespace-nowrap">
                        <span v-if="row.code" class="shrink-0 text-base-content/55 tabular-nums">
                          {{ row.code }}
                        </span>
                        <!-- v-if เพราะแถวที่มีรหัสแต่ยังไม่มีชื่อบัญชีจะปล่อย label ว่างไว้
                             (ดู summaryRows) - ไม่งั้นได้ span เปล่าที่ดันช่องไฟเกินมา -->
                        <span v-if="row.label" :class="row.unassigned ? 'text-base-content/50 italic' : ''">
                          {{ row.label }}
                        </span>
                      </div>
                    </td>
                    <td class="text-center tabular-nums ">
                      <span v-if="row.assets === 0" class="badge badge-ghost badge-sm">ยังไม่มีของ</span>
                      <template v-else>{{ row.assets.toLocaleString('th-TH') }}</template>
                    </td>
                    <td class="text-right tabular-nums">
                      {{ row.active.toLocaleString('th-TH') }}
                    </td>
                    <td class="text-right tabular-nums">{{ formatMoney(row.bookedCost) }}</td>
                    <td class="text-right tabular-nums">
                      {{ formatMoney(row.accumulatedDepreciation) }}
                    </td>
                    <td class="text-right font-medium tabular-nums">
                      {{ formatMoney(row.netBookValue) }}
                    </td>
                  </tr>

                  <tr v-if="!summaryRows.length">
                    <td colspan="6" class="py-10 text-center text-base-content/70">
                      ยังไม่มีสินทรัพย์ในขอบเขตนี้
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- ซ่อนตัวเองเมื่อมีหน้าเดียว (AppPagination จัดการให้แล้ว) -->
            <AppPagination class="mt-1" :page="summaryPage" :total="summaryRows.length"
              :limit="SUMMARY_PAGE_SIZE" @update:page="summaryPage = $event" />
          </div>
        </div>


        <!-- ── สถานะรายชิ้น ─────────────────────────────────────────────────── -->
        <div class="card border border-base-300 bg-base-100 shadow-sm xl:col-span-1">
          <div class="card-body gap-3 text-left">
            <h2 class="card-title text-base">
              {{ selectedCompanyCode ? 'สถานะสินทรัพย์' : 'สัดส่วนที่ยังใช้งานอยู่' }}
            </h2>

            <!-- ── ทุกบริษัท: เทียบ % Active รายบริษัท ──────────────────────────
                 สถานะเหลือสองค่าตาม SAP (Active/Inactive) แท่ง breakdown จึงเหลือสองแท่ง
                 ที่รวมทุกบริษัทเป็นก้อนเดียว - ได้ตัวเลขกลาง ๆ ที่ไม่ใช่ของใครเลย
                 (วัด 2026-09-07: รวมได้ 79% ทั้งที่ UBA 74% / UBP 98% / MIG 100%)
                 แยกรายบริษัทแล้วความต่างนั้นโผล่ทันที ซึ่งเป็นสิ่งเดียวที่ทำอะไรต่อได้
                 ★ ใช้ภาษาภาพเดิม (จุดสี + แถบ + ตัวเลข) ไม่ต้องเรียนรู้อะไรใหม่ -->
            <template v-if="!selectedCompanyCode">
              <p v-if="!activeByCompany.length" class="text-sm text-base-content/70">
                ยังไม่มีสินทรัพย์ในขอบเขตนี้
              </p>

              <div v-for="row in activeByCompany" :key="row.companyCode" class="space-y-1">
                <div class="flex items-baseline justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2">
                    <span class="size-2.5 rounded-full bg-accent" />
                    {{ row.label }}
                  </span>
                  <span class="tabular-nums text-base-content/70">
                    {{ row.percent.toFixed(1) }}%
                    <span class="text-base-content/70">
                      ({{ row.active.toLocaleString('th-TH') }}/{{ row.assets.toLocaleString('th-TH') }})
                    </span>
                  </span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                  <div class="h-full rounded-full bg-accent" :style="{ width: `${row.percent}%` }" />
                </div>
              </div>
            </template>

            <!-- ── บริษัทเดียว/แผนกเดียว: แยกทีละสถานะเหมือนเดิม ──────────────── -->
            <template v-else>
              <p v-if="!data.status.breakdown.length" class="text-sm text-base-content/70">
                ยังไม่มีสินทรัพย์ในขอบเขตนี้
              </p>

              <div v-for="row in data.status.breakdown" :key="row.status" class="space-y-1">
                <div class="flex items-baseline justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2">
                    <span class="size-2.5 rounded-full" :class="STATUS_TONE[row.status]" />
                    {{ STATUS_LABEL[row.status] }}
                  </span>
                  <span class="tabular-nums text-base-content/70">
                    {{ row.count.toLocaleString('th-TH') }}
                  </span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                  <div class="h-full rounded-full" :class="STATUS_TONE[row.status]"
                    :style="{ width: statusWidth(row.count) }" />
                </div>
              </div>
            </template>
          </div>
        </div>


      </div>
      <!-- ชื่อแผนกส่งจาก scopeLabel ซึ่งอ่านมาจาก scope ที่ backend ตอบ ไม่ใช่จาก
           selectedDepartmentId ที่หน้าจอส่งไป - เหตุผลอยู่ในข้อ 1 บนหัวไฟล์ -->
      <!-- ★ ต้องส่ง company-code ลงไปด้วย ไม่ใช่แค่ department-id - ไม่งั้นการ์ดสรุปข้างบน
           บอกยอดของ UBP แต่ตารางข้างล่างไล่ของ UBA มาให้ดู
           ชื่อบริษัทอ่านจาก scope ที่ backend ตอบ ไม่ใช่จากค่าที่หน้าจอส่งไป (ดูข้อ 1 บนหัวไฟล์) -->
      <DepartmentTable v-if="selectedCompanyCode" class="mt-10" :department-id="selectedDepartmentId"
        :department-name="scopeLabel" :company-code="selectedCompanyCode" :company-name="data.scope.companyName" />
    </div>
  </div>
</template>
