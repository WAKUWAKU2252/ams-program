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
import CompanySharePie from './components/CompanySharePie.vue'
import CompanySummaryTable from './components/CompanySummaryTable.vue'
import CompanyValueStackBar from './components/CompanyValueStackBar.vue'
import DepartmentSharePie from './components/DepartmentSharePie.vue'
import DepartmentValueRankBar from './components/DepartmentValueRankBar.vue'
import DepartmentTable from './components/DepartmentTable.vue'
import DepreciationSplitDonut from './components/DepreciationSplitDonut.vue'
import RemainingLifeChart from './components/RemainingLifeChart.vue'

const data = ref<DashboardOverview | null>(null)
const loading = ref(false)
const loadError = ref('')

const selectedDepartmentId = ref<string>('')
const departmentOptions = ref<DepartmentSummary[]>([])

/** '' = ทุกบริษัท - ตรงกับ scope.companyCode === null ที่ backend ตอบกลับ */
const selectedCompanyCode = ref<string>('')
const companyOptions = ref<CompanySummary[]>([])

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
    departmentPage.value = 1

    if (res.scope.departmentId === null && res.scope.kind === 'ALL') {
      // เอาเฉพาะแถวที่มี id จริง - ชิ้นที่ยังไม่ระบุแผนก (id เป็น null) กรองด้วย API ไม่ได้
      departmentOptions.value = res.byDepartment.filter((d) => d.departmentId !== null)
    }

    companyOptions.value = res.byCompany

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
  Active: 'bg-success',
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

// ── แบ่งหน้าตารางสรุปรายแผนก ────────────────────────────────────────────────
const DEPARTMENT_PAGE_SIZE = 10
const departmentPage = ref(1)

const pagedDepartments = computed(() => {
  const rows = data.value?.byDepartment ?? []
  const start = (departmentPage.value - 1) * DEPARTMENT_PAGE_SIZE
  return rows.slice(start, start + DEPARTMENT_PAGE_SIZE)
})

const departmentRange = computed(() => {
  const total = data.value?.byDepartment.length ?? 0
  if (total === 0) return ''
  const start = (departmentPage.value - 1) * DEPARTMENT_PAGE_SIZE + 1
  return `${start}–${Math.min(start + DEPARTMENT_PAGE_SIZE - 1, total)} จาก ${total} แผนก`
})
</script>

<template>
<div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="flex flex-wrap items-start justify-between gap-4 text-left">
      <div>
        <h1 class="text-3xl font-semibold sm:text-4xl">Dashboard</h1>
        <p class="text-base-content/70">ภาพรวมทะเบียนสินทรัพย์และมูลค่าทางบัญชี</p>
      </div>

      <div class="flex w-full flex-wrap gap-3 sm:w-auto">
      <!-- ช่องเลือกบริษัท - วางก่อนช่องแผนกตามลำดับที่คนอ่าน: บริษัทเป็นขอบเขตที่กว้างกว่า
           ★ ถูกล็อกตาม role ได้เหมือนแผนกแล้ว (companyLocked) - บริษัทเป็นแกนของสิทธิ์
             ตัวที่สอง ไม่ใช่แค่ตัวกรองเพื่อความสะดวกอีกต่อไป (ดู DashboardScope) -->
      <label class="form-control w-full max-w-xs text-left sm:w-30">
        <span class="mb-1 flex items-center gap-1.5 text-xs text-base-content/60">
          <Icon icon="lucide:building-2" class="size-3.5" />
          บริษัท
          <Icon
            v-if="data?.scope.companyLocked"
            icon="lucide:lock"
            class="size-3.5"
            title="คุณเห็นข้อมูลได้เฉพาะบริษัทของตัวเอง"
          />
        </span>
        <select
          v-model="selectedCompanyCode"
          class="select w-full"
          :disabled="loading || !!data?.scope.companyLocked"
        >
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
        <span class="mb-1 flex items-center gap-1.5 text-xs text-base-content/60">
          <Icon icon="lucide:filter" class="size-3.5" />
          แผนก
          <Icon
            v-if="data?.scope.locked"
            icon="lucide:lock"
            class="size-3.5"
            title="คุณเห็นข้อมูลได้เฉพาะแผนกของตัวเอง"
          />
        </span>
        <select 
          v-model="selectedDepartmentId"
          class="select w-full"
          :disabled="loading || !!data?.scope.locked || departmentLocked"
          :title="departmentLocked ? 'เลือกบริษัทก่อนจึงจะเลือกแผนกได้' : ''"
        >
          <!-- ถูกล็อก = มีทางเลือกเดียวจริง ๆ จึงใส่แค่แผนกตัวเอง ไม่ใช่ลิสต์ที่กดไม่ได้
               ★ ต้องมี option นี้เสมอ ไม่งั้นช่องจะโชว์ว่างทั้งที่ v-model มีค่าอยู่
                 (พนักงานไม่เคยได้ผลลัพธ์รอบไม่กรอง departmentOptions จึงว่างตลอด) -->
          <template v-if="data?.scope.locked">
            <option v-if="data.scope.departmentId !== null" :value="String(data.scope.departmentId)">
              {{ data.scope.departmentName }}
            </option>
          </template>
          <template v-else>
            <option value="">ทุกแผนก</option>
            <option
              v-for="d in departmentOptions"
              :key="d.departmentId!"
              :value="String(d.departmentId)"
            >
              {{ departmentName(d) }} ({{ d.assets }})
            </option>
          </template>
        </select>
      </label>
      </div>
    </div>

    <div v-if="loading && !data" class="mt-16 flex justify-center">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else-if="loadError" role="alert" class="alert alert-error mt-6">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
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

    <template v-else-if="data">
      <div class="mt-4 flex flex-wrap items-center gap-2 text-left">
        <span class="badge badge-ghost gap-1">
          <Icon icon="lucide:building-2" class="size-3.5" />
          {{ scopeLabel }}
        </span>
          <span v-if="selectedCompanyCode" class="badge badge-ghost gap-1">
            
          {{ selectedCompanyCode}}
        </span>
        <span v-if="loading" class="loading loading-spinner loading-xs" />
      </div>
      

      <!-- ── ตัวเลขหลัก 5 ช่อง ─────────────────────────────────────────────────
           แยกเป็นกล่องละ stat ไม่ใช่ stats เดียวยาว ๆ - ยอดเงินระดับบริษัทยาวหลักสิบตัวอักษร
           ถ้ารวมอยู่กล่องเดียวกันจะบีบกันจนอ่านไม่ออกบนจอแคบ

           ★ ห้ามเพิ่มเป็น 5 คอลัมน์ก่อน 2xl - พื้นที่ที่เหลือหลังหัก Sidebar ที่ 1280px
             ทำให้ได้ช่องละ ~157px ซึ่งสั้นกว่ายอดอย่าง 487,215,903.44 แล้วเลขจะถูกตัดขึ้น
             บรรทัดใหม่กลางจำนวน (วัดจริงบนหน้านี้แล้ว) -->
      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <div class="stats border border-base-300 shadow-sm">
          <div class="stat">
            <div class="stat-figure text-base-content/30">
              <Icon icon="lucide:boxes" class="size-8" />
            </div>
            <div class="stat-title">Total fixed asset</div>
            <div class="stat-value text-3xl tabular-nums">
              {{ data.totals.assets.toLocaleString('th-TH') }}
            </div>
            <div class="stat-desc">ชิ้นที่อยู่ในทะเบียนแล้ว</div>
          </div>
        </div>

        <div class="stats border border-base-300 shadow-sm">
          <div class="stat">
            <div class="stat-title">ราคาทุนทั้งหมด</div>
            <div class="stat-value text-xl tabular-nums whitespace-nowrap 2xl:text-2xl">
              {{ formatMoney(data.totals.bookedCost) }}
            </div>
            <div class="stat-desc">บาท (ราคาทุนทางบัญชี)</div>
          </div>
        </div>

        <div class="stats border border-base-300 shadow-sm">
          <div class="stat">
            <div class="stat-title">ค่าเสื่อมสะสม</div>
            <div class="stat-value text-xl tabular-nums whitespace-nowrap 2xl:text-2xl">
              {{ formatMoney(data.totals.accumulatedDepreciation) }}
            </div>
            <div class="stat-desc">บาท (ค่าเสื่อมราคาสะสม)</div>
          </div>
        </div>

        <!-- ตัวเลขที่คนเปิดหน้านี้มาดูจริง ๆ - ที่เดียวในหน้าที่ใช้สี primary -->
        <div class="stats border border-primary/30 shadow-sm">
          <div class="stat">
            <div class="stat-title">มูลค่าคงเหลือ</div>
            <div class="stat-value text-primary text-xl tabular-nums whitespace-nowrap 2xl:text-2xl">
              {{ formatMoney(data.totals.netBookValue) }}
            </div>
            <div class="stat-desc">บาท (ราคาทุน − ค่าเสื่อมสะสม)</div>
          </div>
        </div>

        <div class="stats border border-base-300 shadow-sm">
          <div class="stat">
            <div class="stat-figure">
              <div
                class="radial-progress text-success"
                :style="`--value:${activeRing}; --size:3.5rem; --thickness:5px;`"
                :aria-valuenow="activeRing"
                role="progressbar"
              >
                <span class="text-xs text-base-content">{{ activeRing }}%</span>
              </div>
            </div>
            <div class="stat-title">Active / Inactive</div>
            <div class="stat-value text-2xl tabular-nums">
              {{ percent(data.status.activePercent) }}
            </div>
          </div>
        </div>
      </div>

      <!-- ── ข้อจำกัดของยอดเงิน - ต้องอยู่ติดกับตัวเลข ไม่ใช่ซ่อนใน tooltip (ดูหัวไฟล์ข้อ 2) -->


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
      <div v-if="!selectedDepartmentId && !selectedCompanyCode" class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CompanySharePie class="lg:col-span-1" :rows="data.byCompany" />
        <CompanyValueStackBar class="lg:col-span-2" :rows="data.byCompany" />
      </div>
      <div v-else-if="!selectedDepartmentId" class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DepartmentSharePie :rows="data.byDepartment" class="lg:col-span-1" />
        <DepartmentValueRankBar :rows="data.byDepartment" class="lg:col-span-2" />
      </div>
      <div v-else  class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DepreciationSplitDonut
          class="lg:col-span-1"
          :totals="data.totals"
          :department-name="scopeLabel"
        />
        <RemainingLifeChart
          class="lg:col-span-2"
          :data="data.remainingLife"
          :department-name="scopeLabel"
        />
      </div>

      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <!-- ── สรุปรายบริษัท (เฉพาะตอนดูทุกบริษัท) ───────────────────────────
             เปลี่ยน "แกน" ไม่ใช่เติมคอลัมน์บริษัทลงตารางรายแผนก - เหตุผลเต็มอยู่ในไฟล์
             CompanySummaryTable (สรุป: ตอนดูทั้งเครือ คำถามคือ "บริษัทไหนเป็นยังไง") -->
        <CompanySummaryTable
          v-if="!selectedCompanyCode"
          class="lg:col-span-2"
          :rows="data.byCompany"
        />

        <!-- ── สรุปรายแผนก ──────────────────────────────────────────────────── -->
        <div v-else class="card border border-base-300 bg-base-100 shadow-sm lg:col-span-2">
          <div class="card-body gap-3 text-left">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="card-title text-base">
                สรุปรายแผนก
                <span class="badge badge-ghost badge-sm">{{ data.byDepartment.length }}</span>
              </h2>
              <!-- บอกว่ากำลังดูช่วงไหนของทั้งหมด - ตารางนี้ไม่ได้แสดงครบทุกแผนกในหน้าเดียว
                   ถ้าไม่บอก คนจะบวกเฉพาะแถวที่เห็นแล้วสรุปว่ายอดข้างบนผิด -->
              <span class="text-xs text-base-content/60">{{ departmentRange }}</span>
            </div>

            <div class="overflow-x-auto">
              <table class="table table-sm table-pin-rows table-freeze-first">
                <thead>
                  <tr>
                    <th class="freeze-col">แผนก</th>
                    <th class="text-center">ชิ้น</th>
                    <th class="text-right">Active</th>
                    <th class="text-right">ราคาทุน</th>
                    <th class="text-right">ค่าเสื่อมสะสม</th>
                    <th class="text-right">มูลค่าคงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- แผนกที่ยังไม่มีของ จางลงทั้งแถว - ให้กวาดตาหาแผนกที่มีของได้เร็ว
                       แต่ยังอ่านออกว่ามีแผนกนี้อยู่ (ซึ่งคือเหตุผลที่เอามันมาแสดงตั้งแต่แรก) -->
                  <tr
                    v-for="row in pagedDepartments"
                    :key="row.departmentId ?? 'none'"
                    class="hover:bg-base-200"
                    :class="row.assets === 0 ? 'text-base-content/45' : ''"
                  >
                    <td class="freeze-col">
                      <span :class="row.departmentId === null ? 'text-base-content/50 italic' : ''">
                        {{ departmentName(row) }}
                      </span>
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

                  <tr v-if="!data.byDepartment.length">
                    <td colspan="6" class="py-10 text-center text-base-content/50">
                      ยังไม่มีสินทรัพย์ในขอบเขตนี้
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- ซ่อนตัวเองเมื่อมีหน้าเดียว (AppPagination จัดการให้แล้ว) -->
            <AppPagination
              class="mt-1"
              :page="departmentPage"
              :total="data.byDepartment.length"
              :limit="DEPARTMENT_PAGE_SIZE"
              @update:page="departmentPage = $event"
            />
          </div>
        </div>

        
        <!-- ── สถานะรายชิ้น ─────────────────────────────────────────────────── -->
        <div class="card border border-base-300 bg-base-100 shadow-sm lg:col-span-1">
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
              <p v-if="!activeByCompany.length" class="text-sm text-base-content/60">
                ยังไม่มีสินทรัพย์ในขอบเขตนี้
              </p>

              <div v-for="row in activeByCompany" :key="row.companyCode" class="space-y-1">
                <div class="flex items-baseline justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2">
                    <span class="size-2.5 rounded-full bg-success" />
                    {{ row.label }}
                  </span>
                  <span class="tabular-nums text-base-content/70">
                    {{ row.percent.toFixed(1) }}%
                    <span class="text-base-content/50">
                      ({{ row.active.toLocaleString('th-TH') }}/{{ row.assets.toLocaleString('th-TH') }})
                    </span>
                  </span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                  <div class="h-full rounded-full bg-success" :style="{ width: `${row.percent}%` }" />
                </div>
              </div>
            </template>

            <!-- ── บริษัทเดียว/แผนกเดียว: แยกทีละสถานะเหมือนเดิม ──────────────── -->
            <template v-else>
              <p v-if="!data.status.breakdown.length" class="text-sm text-base-content/60">
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
                  <div
                    class="h-full rounded-full"
                    :class="STATUS_TONE[row.status]"
                    :style="{ width: statusWidth(row.count) }"
                  />
                </div>
              </div>
            </template>

            <!-- ความสดของตัวเลขบัญชี - ตอบคำถาม "ยอดข้างบนเป็นข้อมูลของปีไหน" -->
            <div class="mt-2 border-t border-base-200 pt-3 text-sm">
              <h3 class="mb-1 font-medium">ข้อมูลตัวเลขทางบัญชี</h3>
              <div class="flex justify-between gap-2 py-0.5">
                <span class="text-base-content/60">ข้อมูลปี {{ data.freshness.fiscalYear }}</span>
                <span class="tabular-nums">
                  {{ data.freshness.currentYearCount.toLocaleString('th-TH') }}
                </span>
              </div>
              <div class="flex justify-between gap-2 py-0.5">
                <span class="text-base-content/60">ข้อมูลปีเก่า</span>
                <span class="tabular-nums" :class="data.freshness.staleCount ? 'text-warning' : ''">
                  {{ data.freshness.staleCount.toLocaleString('th-TH') }}
                </span>
              </div>
              <div class="flex justify-between gap-2 py-0.5">
                <span class="text-base-content/60">ยังไม่มีข้อมูลบัญชี</span>
                <span class="tabular-nums">
                  {{ data.freshness.noDataCount.toLocaleString('th-TH') }}
                </span>
              </div>
            </div>
          </div>
        </div>


      </div>
      <!-- ชื่อแผนกส่งจาก scopeLabel ซึ่งอ่านมาจาก scope ที่ backend ตอบ ไม่ใช่จาก
           selectedDepartmentId ที่หน้าจอส่งไป - เหตุผลอยู่ในข้อ 1 บนหัวไฟล์ -->
      <!-- ★ ต้องส่ง company-code ลงไปด้วย ไม่ใช่แค่ department-id - ไม่งั้นการ์ดสรุปข้างบน
           บอกยอดของ UBP แต่ตารางข้างล่างไล่ของ UBA มาให้ดู
           ชื่อบริษัทอ่านจาก scope ที่ backend ตอบ ไม่ใช่จากค่าที่หน้าจอส่งไป (ดูข้อ 1 บนหัวไฟล์) -->
      <DepartmentTable v-if="selectedCompanyCode"
        class="mt-8"
        :department-id="selectedDepartmentId"
        :department-name="scopeLabel"
        :company-code="selectedCompanyCode"
        :company-name="data.scope.companyName"
      />
    </template>
  </div>
</template>
