<script setup lang="ts">
// สัดส่วนจำนวนสินทรัพย์ตามแผนก (โดนัท)
//
// ★ กราฟนี้นับ "ชิ้น" ไม่ใช่ "เงิน" - เงินเป็นหน้าที่ของกราฟแท่งอันดับที่อยู่ข้าง ๆ
//   สองอันนี้ตอบคนละคำถามและมักได้อันดับไม่เหมือนกัน (แผนกที่มีของเยอะสุดไม่จำเป็นต้อง
//   มีมูลค่าสูงสุด) ห้ามยุบรวมกันเป็นกราฟเดียวเพราะจะอ่านผิดทันที
//
// ★ ตัดที่ 5 แผนก + "อื่น ๆ" โดยตั้งใจ - วงกลมที่มีเกิน 6 ก้อนคนอ่านเทียบขนาดไม่ออกแล้ว
//   และของจริงมีแผนกหลักสิบ ถ้าโยนเข้าไปหมดจะได้เศษเสี้ยวบาง ๆ เรียงกันเป็นสิบชิ้น
//   รายละเอียดครบทุกแผนกอยู่ในตารางสรุปรายแผนกใต้หน้านี้อยู่แล้ว
//
// ★ legend เขียนเองใน template ไม่ใช้ของ Apex - ต้องการชื่อแผนกภาษาไทยที่ตัดบรรทัดได้
//   พร้อมจำนวนชิ้นและเปอร์เซ็นต์เป็นตัวหนังสือ ไม่ใช่จุดสีเปล่า ๆ (สีในชุดนี้บางสี
//   contrast ต่ำ ห้ามให้สีเป็นตัวบอกความหมายเพียงอย่างเดียว - ดู chart-theme.ts)
import { computed } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { DepartmentSummary } from '@/shared/services/dashboard.service'
import { OTHER_COLOR, SURFACE, categoryColor } from './chart-theme'


const activeRing = computed(() => Math.round(100))
const props = defineProps<{ rows: DepartmentSummary[] }>()

/** จำนวนแผนกที่แสดงเป็นก้อนของตัวเอง ที่เหลือยุบเป็น "อื่น ๆ" */
const MAX_SLICES = 5

interface Slice {
  label: string
  value: number
  color: string
}

/** เอาเฉพาะแผนกที่มีของจริง - แผนกที่ยังไม่มีสินทรัพย์ไม่มีสัดส่วนให้แบ่ง */
const ranked = computed(() =>
  props.rows.filter((r) => r.assets > 0).sort((a, b) => b.assets - a.assets),
)

const slices = computed<Slice[]>(() => {
  const rows = ranked.value
  const out: Slice[] = rows.slice(0, MAX_SLICES).map((row, i) => ({
    label: row.departmentName ?? 'ยังไม่ระบุแผนก',
    value: row.assets,
    color: categoryColor(i),
  }))

  const rest = rows.slice(MAX_SLICES)
  if (rest.length) {
    out.push({
      // บอกด้วยว่ายุบมาจากกี่แผนก ไม่งั้นก้อนเทาก้อนนี้จะดูเหมือนแผนกหนึ่งชื่อ "อื่น ๆ"
      label: `อื่น ๆ (${rest.length} แผนก)`,
      value: rest.reduce((sum, r) => sum + r.assets, 0),
      color: OTHER_COLOR,
    })
  }
  return out
})

const total = computed(() => slices.value.reduce((sum, s) => sum + s.value, 0))

const percent = (value: number) => (total.value === 0 ? 0 : (value / total.value) * 100)

const chartOptions = computed(() => {
  const data = slices.value
  const grandTotal = total.value

  return {
    chart: {
      type: 'donut' as const,
      height: 260,
      // ฟอนต์ของแอป - ไม่ตั้งชื่อฟอนต์เอง (index.html ไม่ได้โหลดฟอนต์ไหนเพิ่ม
      // ถ้าเขียนชื่อที่ไม่มีอยู่จริง จะตกไปใช้ฟอนต์ default ของเบราว์เซอร์ซึ่งหลุดจากทั้งหน้า)
      fontFamily: 'inherit',
      // อนิเมชันคุมที่ prop `animate` ของ AppApexChart ไม่ใช่ที่นี่ - เขียนซ้ำสองที่แล้ว
      // จะงงว่าอันไหนชนะ (wrapper ทับค่าตรงนี้อยู่ดี)
      toolbar: { show: false },
    },
    labels: data.map((s) => s.label),
    series: data.map((s) => s.value),
    colors: data.map((s) => s.color),
    // ช่องว่างสีพื้น 2px คั่นก้อนที่ติดกัน - ใช้ช่องว่างแยก ไม่ใช่ตีเส้นขอบรอบก้อน
    stroke: { width: 2, colors: [SURFACE] },
    // ไม่พิมพ์ตัวเลขทับบนก้อน - ก้อนเล็ก ๆ จะเบียดกันจนอ่านไม่ออก
    // ตัวเลขไปอยู่ที่ legend ข้างล่าง (อ่านได้เสมอ) และ tooltip
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
              // ใช้ยอดที่คิดไว้แล้วข้างบน ไม่ไปอ่าน w.globals - ค่าเดียวกันแต่ตรวจสอบง่ายกว่า
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
        <h2 class="card-title text-base">สัดส่วนสินทรัพย์ตามแผนก</h2>
        <p class="text-xs text-base-content/60">นับเป็นจำนวนชิ้นในทะเบียน</p>
      </div>
      
      <p v-if="!slices.length" class="py-10 text-center text-sm text-base-content/50">
        ยังไม่มีสินทรัพย์ในขอบเขตนี้
      </p>
         
      <div v-else-if="slices.length === 1" class="py-8 text-center">
                <div
                class="radial-progress text-success"
                :style="`--value:${activeRing}; --size:14rem; --thickness:25px;`"
                :aria-valuenow="activeRing"
                role="progressbar"
              >
                <span class="text-2xl text-base-content">{{ total.toLocaleString('th-TH') }} ชิ้น</span>


              </div>


      </div>


      <template v-else>
        <AppApexChart :options="chartOptions" />

        <!-- legend เอง: จุดสี + ชื่อ + จำนวน + เปอร์เซ็นต์ ตัวหนังสือใช้โทนหมึกเสมอ
             (ห้ามระบายสีข้อความตามสีก้อน - สีอ่อนอย่างเหลือง/ชมพูอ่านไม่ออกบนพื้นขาว) -->
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
