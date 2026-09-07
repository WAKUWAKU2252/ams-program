<script setup lang="ts">
// สัดส่วนจำนวนสินทรัพย์ตามบริษัท (โดนัท) - ใช้เฉพาะตอนดู "ทุกบริษัท"
//
// ★ กราฟนี้นับ "ชิ้น" ไม่ใช่ "เงิน" - เงินเป็นหน้าที่ของแท่งซ้อนที่อยู่ข้าง ๆ
//   กติกาเดียวกับคู่รายแผนก และของจริงพิสูจน์ว่าสองแกนนี้ให้ภาพต่างกันจริงบนแกนบริษัทด้วย
//   (วัด 2026-09-07: UBA ถือ 78% ของชิ้น แต่ 89% ของมูลค่า ส่วน UBP 15% ของชิ้นแต่ 8% ของเงิน)
//   ห้ามยุบรวมเป็นกราฟเดียว
//
// ── ทำไมไม่ตัด top-N + "อื่น ๆ" เหมือนตัวรายแผนก ────────────────────────────
//
// ตัวรายแผนกต้องตัดที่ 5 เพราะมีแผนกหลักสิบ (26 แผนกใน UBA อย่างเดียว) วงกลมที่มีเกิน
// 6 ก้อนคนอ่านเทียบขนาดไม่ออก - ส่วนบริษัทที่เปิด sync อยู่มีสามแห่ง (UBA/UBP/MIG)
// ซึ่งอยู่ในเพดานสบาย ๆ การยุบ "อื่น ๆ" จึงไม่มีอะไรให้ยุบ และจะกลายเป็นการซ่อนบริษัท
// ทั้งบริษัทไว้ในก้อนเทาถ้าวันหนึ่งมีบริษัทที่สี่ - ถึงตอนนั้นค่อยคุยกันว่าจะตัดที่เท่าไร
// (CATEGORY_COLORS มีห้าสี ถ้าเกินห้าบริษัทเมื่อไหร่ categoryColor จะเริ่มคืนสีเทาซ้ำ ๆ
//  ซึ่งเป็นสัญญาณว่าถึงเวลาต้องคิดเรื่องนี้จริงจัง)
//
// ★ ไม่มีก้อน "ยังไม่ระบุ" - asset.companyCode เป็น NOT NULL ทุกชิ้นมีบริษัทเสมอ
//   (ต่างจากรายแผนกที่ departmentId เป็น NULL ได้ จึงต้องมีแถว "ยังไม่ระบุแผนก")
import { computed } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { CompanySummary } from '@/shared/services/dashboard.service'
import { SURFACE, categoryColor } from './chart-theme'

// หมายเหตุ: backend กรอง byCompany ด้วย scope.departmentId ด้วย แต่กราฟนี้ถูกวาดเฉพาะ
// ตอน 'ทุกบริษัท + ทุกแผนก' เท่านั้น (ดู DashboardPage) ยอดที่ได้จึงเป็นของทั้งบริษัทเสมอ
// - ไม่ต้องมี prop บอกชื่อแผนกกำกับ เพราะไม่มีทางที่สาขานี้จะถูกกรองด้วยแผนก
const props = defineProps<{ rows: CompanySummary[] }>()

interface Slice {
  label: string
  value: number
  color: string
}

/** เอาเฉพาะบริษัทที่มีของจริง - บริษัทที่ยังไม่มีสินทรัพย์ไม่มีสัดส่วนให้แบ่ง */
const slices = computed<Slice[]>(() =>
  props.rows
    .filter((r) => r.assets > 0)
    .sort((a, b) => b.assets - a.assets)
    .map((row, i) => ({
      // ชื่อเต็มอ่านง่ายกว่ารหัส ส่วนรหัสไปอยู่ในวงเล็บให้เทียบกับตัวเลือกด้านบนได้
      label: row.companyName || row.companyCode,
      value: row.assets,
      color: categoryColor(i),
    })),
)

const total = computed(() => slices.value.reduce((sum, s) => sum + s.value, 0))

const percent = (value: number) => (total.value === 0 ? 0 : (value / total.value) * 100)

const chartOptions = computed(() => {
  const data = slices.value
  const grandTotal = total.value

  return {
    chart: {
      type: 'donut' as const,
      height: 260,
      // ฟอนต์ของแอป - ไม่ตั้งชื่อฟอนต์เอง (เหตุผลเต็มที่ DepartmentSharePie)
      fontFamily: 'inherit',
      toolbar: { show: false },
    },
    labels: data.map((s) => s.label),
    series: data.map((s) => s.value),
    colors: data.map((s) => s.color),
    stroke: { width: 2, colors: [SURFACE] },
    // ตัวเลขไปอยู่ที่ legend ข้างล่าง (อ่านได้เสมอ) และ tooltip - ไม่พิมพ์ทับบนก้อน
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '72%',
          labels: {
            show: true,
            name: { fontSize: '13px', color: '#64748b' },
            value: {
              fontSize: '22px',
              fontWeight: 600,
              color: '#334155',
              formatter: (val: string | number) => `${Number(val).toLocaleString('th-TH')} ชิ้น`,
            },
            total: {
              show: true,
              label: 'ทั้งหมด',
              color: '#64748b',
              formatter: () => `${grandTotal.toLocaleString('th-TH')} ชิ้น`,
            },
          },
        },
      },
    },
    tooltip: {
      y: {
        formatter: (val: number) =>
          `${val.toLocaleString('th-TH')} ชิ้น (${percent(val).toFixed(1)}%)`,
      },
    },
    states: { active: { filter: { type: 'none' as const } } },
  }
})
</script>

<template>
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <div>
        <h2 class="card-title text-base">สัดส่วนสินทรัพย์ตามบริษัท</h2>
        <p class="text-xs text-base-content/60">
          นับเป็นจำนวนชิ้นในทะเบียน
        </p>
      </div>

      <p v-if="!slices.length" class="py-10 text-center text-sm text-base-content/50">
        ยังไม่มีสินทรัพย์ในขอบเขตนี้
      </p>

      <template v-else>
        <AppApexChart :options="chartOptions" />

        <!-- legend เอง: จุดสี + ชื่อ + จำนวน + เปอร์เซ็นต์ ตัวหนังสือใช้โทนหมึกเสมอ
             (ห้ามระบายสีข้อความตามสีก้อน - สีอ่อนในชุดอ่านไม่ออกบนพื้นขาว ดู chart-theme) -->
        <ul class="mt-1 space-y-1.5 text-sm">
          <li
            v-for="slice in slices"
            :key="slice.label"
            class="flex items-baseline justify-between gap-2"
          >
            <span class="flex min-w-0 items-baseline gap-2">
              <span
                class="size-2.5 shrink-0 translate-y-0.5 rounded-full"
                :style="{ backgroundColor: slice.color }"
              />
              <span class="truncate" :title="slice.label">{{ slice.label }}</span>
            </span>
            <span class="shrink-0 tabular-nums text-base-content/70">
              {{ slice.value.toLocaleString('th-TH') }}
              <span class="text-base-content/50">({{ percent(slice.value).toFixed(1) }}%)</span>
            </span>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
