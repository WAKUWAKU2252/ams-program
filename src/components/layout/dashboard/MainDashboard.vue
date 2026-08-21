<script setup lang="ts">
// หน้า Dashboard — ภาพรวมทะเบียนสินทรัพย์ + มูลค่าทางบัญชี
//
// ── สองอย่างที่หน้านี้ต้องไม่โกหกผู้ใช้ ────────────────────────────────────────
//
// 1. **ตัวเลขนี้เป็นของแผนกไหน** — ขอบเขตมาจาก backend (`scope`) ไม่ใช่จากค่าที่หน้าจอ
//    ส่งไป พนักงานทั่วไปถูกล็อกไว้ที่แผนกตัวเองฝั่ง server แล้ว หน้าจอแค่สะท้อนสิ่งที่
//    ได้กลับมา — ห้าม derive ป้ายหัวเรื่องจาก selectedDepartmentId ของตัวเอง ไม่งั้น
//    วันที่ backend ทิ้งค่าที่ส่งไป จอจะเขียนชื่อแผนกหนึ่งทับตัวเลขของอีกแผนกหนึ่ง
//
// 2. **ยอดเงินไม่ได้นับทุกชิ้น** — นับเฉพาะชิ้นที่มีตัวเลขบัญชีครบ (totals.valued) และ
//    ตัวเลขชุดนั้นเป็นของ "ปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น" ซึ่งค้างที่ปีเก่าได้จริง
//    (วัด 2026-08-20: 25% ของทะเบียนไม่ใช่ปีปัจจุบัน) สองข้อนี้ต้องขึ้นบนหน้าเสมอ
//    ไม่ใช่ซ่อนใน tooltip — ไม่งั้นคนอ่านยอดที่มีเลขปี 2022 ปนอยู่เป็นมูลค่าของวันนี้
//
// ★ ทะเบียนสินทรัพย์ (Asset Inventory) เคยถูกยุบมาต่อท้ายหน้านี้ช่วงหนึ่ง แล้วแยกกลับไป
//   เป็น /asset-inventory ตามเดิม — อย่าเอากลับมา ช่องเลือกแผนกของหน้านี้ถูก backend
//   ล็อกตาม role ส่วนของทะเบียนต้องค้นได้ทุกแผนก สองกฎนี้อยู่หน้าเดียวกันไม่ได้
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/components/common/AppPagination.vue'
import { getDashboardOverview } from '@/services/dashboard.service'
import type { AssetStatus, DashboardOverview, DepartmentSummary } from '@/services/dashboard.service'
import { ApiError } from '@/services/httpClient'
import { formatMoney } from '@/utils/money'

const data = ref<DashboardOverview | null>(null)
const loading = ref(false)
const loadError = ref('')

/** ค่าในช่องเลือกแผนก — '' = ทุกแผนก (backend อาจไม่รับค่านี้ ดูหัวไฟล์ข้อ 1) */
const selectedDepartmentId = ref<string>('')

/**
 * ตัวเลือกในช่องเลือกแผนก = แผนกที่ "มีสินทรัพย์อยู่จริง" ซึ่งอ่านได้จากผลลัพธ์รอบที่ยัง
 * ไม่กรอง ไม่ต้องยิง /master/departments เพิ่ม
 *
 * ★ เก็บไว้จากรอบที่ scope.departmentId เป็น null เท่านั้น — พอกรองแผนกเดียวแล้ว
 *   byDepartment จะเหลือแถวเดียว ถ้าเขียนทับทุกรอบ ตัวเลือกอื่นจะหายไปหมดหลังกรองครั้งแรก
 *   แล้วผู้ใช้จะกลับไปดูแผนกอื่นไม่ได้เลยจนกว่าจะรีโหลดหน้า
 */
const departmentOptions = ref<DepartmentSummary[]>([])

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const departmentId = selectedDepartmentId.value ? Number(selectedDepartmentId.value) : undefined
    const res = await getDashboardOverview({ departmentId })
    data.value = res
    // ชุดแถวเปลี่ยนแล้ว ต้องกลับหน้า 1 — กรองแผนกตอนค้างอยู่หน้า 3 แล้วเหลือแถวเดียว
    // จะได้ตารางว่างเปล่าทั้งที่ข้อมูลมีอยู่ (แถบเลขหน้าก็หายไปด้วยเพราะเหลือหน้าเดียว
    // = ไม่มีปุ่มให้กดกลับ ผู้ใช้จะติดอยู่ตรงนั้นจนกว่าจะรีโหลดหน้า)
    departmentPage.value = 1

    if (res.scope.departmentId === null && res.scope.kind === 'ALL') {
      // เอาเฉพาะแถวที่มี id จริง — ชิ้นที่ยังไม่ระบุแผนก (id เป็น null) กรองด้วย API ไม่ได้
      departmentOptions.value = res.byDepartment.filter((d) => d.departmentId !== null)
    }

    // backend ทิ้งค่าที่ส่งไปแล้วบังคับเป็นแผนกอื่น (พนักงานทั่วไป) → ดึงช่องเลือกให้ตรงกับ
    // ตัวเลขที่ได้จริง ไม่ปล่อยให้ช่องโชว์แผนกหนึ่งแต่ตัวเลขเป็นของอีกแผนก
    const effective = res.scope.departmentId
    selectedDepartmentId.value = effective === null ? '' : String(effective)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดข้อมูลภาพรวมไม่สำเร็จ'
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)

// โหลดใหม่เมื่อผู้ใช้เปลี่ยนแผนก — load() เขียนทับ selectedDepartmentId ด้วยค่าที่ backend
// ตอบกลับมา ซึ่งจะไม่วนซ้ำเพราะ watch ไม่ยิงเมื่อค่าเท่าเดิม (และถ้าต่างจริง ก็ควรโหลดตาม)
watch(selectedDepartmentId, (next, prev) => {
  if (next !== prev) void load()
})

const scopeLabel = computed(() => {
  const scope = data.value?.scope
  if (!scope) return ''
  if (scope.kind === 'UNLINKED') return 'ยังระบุแผนกไม่ได้'
  return scope.departmentName ?? 'ทุกแผนก'
})

/** เปอร์เซ็นต์สำหรับวาดวงกลม — ปัดเป็นจำนวนเต็มเพราะ --value รับ 0–100 */
const activeRing = computed(() => Math.round(data.value?.status.activePercent ?? 0))

const percent = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`)

/** สัดส่วนความกว้างของแท่งในรายการสถานะ — 0 ชิ้นไม่มีทางเกิดเพราะ breakdown ตัดออกแล้ว */
function statusWidth(count: number): string {
  const total = data.value?.totals.assets ?? 0
  return total === 0 ? '0%' : `${(count / total) * 100}%`
}

const STATUS_LABEL: Record<AssetStatus, string> = {
  Active: 'ใช้งานอยู่',
  Inactive: 'ไม่ได้ใช้งาน',
  'Under Maintenance': 'อยู่ระหว่างซ่อมบำรุง',
  Lost: 'สูญหาย',
  Disposed: 'ตัดจำหน่ายแล้ว',
}

// สีของแท่ง/จุดต่อสถานะ — Active เขียวอย่างเดียว ที่เหลือไล่ตามความรุนแรง
const STATUS_TONE: Record<AssetStatus, string> = {
  Active: 'bg-success',
  Inactive: 'bg-base-content/30',
  'Under Maintenance': 'bg-warning',
  Lost: 'bg-error',
  Disposed: 'bg-neutral',
}

const departmentName = (row: DepartmentSummary) => row.departmentName ?? 'ยังไม่ระบุแผนก'

// ── แบ่งหน้าตารางสรุปรายแผนก ────────────────────────────────────────────────
//
// ตัดหน้าฝั่งจอ ไม่ใช่ฝั่ง API โดยตั้งใจ: byDepartment มาครบทั้งก้อนอยู่แล้วในคำขอเดียว
// (แผนกมีหลักสิบ ไม่ใช่หลักพัน) การไปแบ่งหน้าที่ backend จะกลายเป็นยิง API ทุกครั้งที่
// กดเปลี่ยนหน้า เพื่อข้อมูลที่ถืออยู่ในมือแล้ว — และยังทำให้ยอดรวมรายแผนกที่เอาไว้กระทบ
// ยอดกับ totals ต้องดึงหลายรอบกว่าจะครบ
const DEPARTMENT_PAGE_SIZE = 10
const departmentPage = ref(1)

const pagedDepartments = computed(() => {
  const rows = data.value?.byDepartment ?? []
  const start = (departmentPage.value - 1) * DEPARTMENT_PAGE_SIZE
  return rows.slice(start, start + DEPARTMENT_PAGE_SIZE)
})

/**
 * ช่วงลำดับที่กำลังแสดง เช่น "11–20 จาก 23 แผนก"
 *
 * ต้องบอกด้วยว่าทั้งหมดมีกี่แผนก ไม่ใช่โชว์แค่เลขหน้า — ตารางนี้กระทบยอดกับช่อง
 * Total fixed asset ข้างบนได้ ถ้าไม่บอกว่ายังมีแผนกที่ไม่ได้อยู่บนหน้านี้ คนจะบวก
 * เฉพาะ 10 แถวที่เห็นแล้วสรุปว่าตัวเลขข้างบนผิด
 */
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

      <!-- ช่องเลือกแผนก — ปิดไว้เมื่อ backend ล็อกขอบเขต (พนักงานทั่วไป)
           ป้ายข้างล่างบอกตรง ๆ ว่าเห็นได้แค่แผนกตัวเอง จะได้ไม่คิดว่าระบบเสีย -->
      <label class="form-control w-full max-w-xs text-left">
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
          :disabled="loading || !!data?.scope.locked"
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
              {{ d.departmentName }} ({{ d.assets }})
            </option>
          </template>
        </select>
      </label>
    </div>

    <div v-if="loading && !data" class="mt-16 flex justify-center">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else-if="loadError" role="alert" class="alert alert-error mt-6">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
    </div>

    <!-- ยังไม่ผูกพนักงาน ≠ ไม่มีของ — ต้องให้ผู้ดูแลระบบไปแก้ ไม่ใช่ผู้ใช้รอเฉย ๆ
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
        <span v-if="loading" class="loading loading-spinner loading-xs" />
      </div>

      <!-- ── ตัวเลขหลัก 5 ช่อง ─────────────────────────────────────────────────
           แยกเป็นกล่องละ stat ไม่ใช่ stats เดียวยาว ๆ — ยอดเงินระดับบริษัทยาวหลักสิบตัวอักษร
           ถ้ารวมอยู่กล่องเดียวกันจะบีบกันจนอ่านไม่ออกบนจอแคบ

           ★ ห้ามเพิ่มเป็น 5 คอลัมน์ก่อน 2xl — พื้นที่ที่เหลือหลังหัก Sidebar ที่ 1280px
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
            <div class="stat-title">ค่าเสื่อมรวม</div>
            <div class="stat-value text-xl tabular-nums whitespace-nowrap 2xl:text-2xl">
              {{ formatMoney(data.totals.accumulatedDepreciation) }}
            </div>
            <div class="stat-desc">บาท (ค่าเสื่อมราคาสะสม)</div>
          </div>
        </div>

        <!-- ตัวเลขที่คนเปิดหน้านี้มาดูจริง ๆ — ที่เดียวในหน้าที่ใช้สี primary -->
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

      <!-- ── ข้อจำกัดของยอดเงิน — ต้องอยู่ติดกับตัวเลข ไม่ใช่ซ่อนใน tooltip (ดูหัวไฟล์ข้อ 2) -->


      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <!-- ── สถานะรายชิ้น ─────────────────────────────────────────────────── -->
        <div class="card border border-base-300 bg-base-100 shadow-sm lg:col-span-1">
          <div class="card-body gap-3 text-left">
            <h2 class="card-title text-base">สถานะสินทรัพย์</h2>

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

            <!-- ความสดของตัวเลขบัญชี — ตอบคำถาม "ยอดข้างบนเป็นข้อมูลของปีไหน" -->
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

        <!-- ── สรุปรายแผนก ──────────────────────────────────────────────────── -->
        <div class="card border border-base-300 bg-base-100 shadow-sm lg:col-span-2">
          <div class="card-body gap-3 text-left">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="card-title text-base">
                สรุปรายแผนก
                <span class="badge badge-ghost badge-sm">{{ data.byDepartment.length }}</span>
              </h2>
              <!-- บอกว่ากำลังดูช่วงไหนของทั้งหมด — ตารางนี้ไม่ได้แสดงครบทุกแผนกในหน้าเดียว
                   ถ้าไม่บอก คนจะบวกเฉพาะแถวที่เห็นแล้วสรุปว่ายอดข้างบนผิด -->
              <span class="text-xs text-base-content/60">{{ departmentRange }}</span>
            </div>

            <div class="overflow-x-auto">
              <table class="table table-sm table-pin-rows">
                <thead>
                  <tr>
                    <th>แผนก</th>
                    <th class="text-center">ชิ้น</th>
                    <th class="text-right">Active</th>
                    <th class="text-right">ราคาทุน</th>
                    <th class="text-right">ค่าเสื่อมสะสม</th>
                    <th class="text-right">มูลค่าคงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- แผนกที่ยังไม่มีของ จางลงทั้งแถว — ให้กวาดตาหาแผนกที่มีของได้เร็ว
                       แต่ยังอ่านออกว่ามีแผนกนี้อยู่ (ซึ่งคือเหตุผลที่เอามันมาแสดงตั้งแต่แรก) -->
                  <tr
                    v-for="row in pagedDepartments"
                    :key="row.departmentId ?? 'none'"
                    class="hover:bg-base-200"
                    :class="row.assets === 0 ? 'text-base-content/45' : ''"
                  >
                    <td>
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
      </div>
    </template>
  </div>
</template>
