<script setup lang="ts">
// สัดส่วนค่าเสื่อมของแผนกที่เลือก (โดนัท) - "ราคาทุนก้อนนี้ถูกกินไปแล้วเท่าไร"
//
// ★ เป็นคู่ของกราฟอายุคงเหลือที่อยู่ข้าง ๆ - อันนั้นเป็นแกน "เวลา" อันนี้เป็นแกน "เงิน"
//   อ่านคู่กันถึงจะตอบได้ว่าแผนกนี้ของเก่าจริง หรือแค่ใกล้ครบอายุทางบัญชี
//   (ของที่ตัดค่าเสื่อมเกือบครบแต่ยังใช้งานได้ดี กับของที่ใกล้พังจริง เป็นคนละเรื่อง)
//
// ★ ราคาทุน = ค่าเสื่อมสะสม + มูลค่าคงเหลือ เสมอ เพราะ backend คิดยอดสามก้อนนี้จาก
//   ชิ้นชุดเดียวกัน (กรอง VALUED เหมือนกันหมด - ดูหัวไฟล์ dashboard.service.ts ข้อ 2)
//   จึงเอามาแบ่งเป็นวงกลมได้ตรง ๆ โดยไม่ต้องกลัวว่าจะบวกไม่ลงตัว
//
// ★ ยอดพวกนี้ **ไม่ได้นับทุกชิ้นในแผนก** - ชิ้นที่ SAP ให้ตัวเลขมาไม่ครบถูกกันออก
//   ต้องเขียนกำกับใต้กราฟเสมอ ไม่งั้นคนเทียบกับจำนวนชิ้นในแผนกแล้วจะคิดว่าข้อมูลหาย
import { computed, type PropType } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { DashboardTotals } from '@/shared/services/dashboard.service'
import { formatMoney } from '@/shared/utils/money'
import { OTHER_COLOR, SURFACE, VALUE_COLOR } from './chart-theme'

const props = defineProps({
  totals: { type: Object as PropType<DashboardTotals>, required: true },
  /** ชื่อแผนกที่กำลังดู เอาไว้ขึ้นคำอธิบายใต้หัวข้อ */
  departmentName: { type: String, default: '' },
})

/**
 * มีอะไรให้แบ่งไหม
 *
 * ★ null ≠ 0 - null แปลว่า "ไม่มีชิ้นไหนมีตัวเลขบัญชีเลย" ส่วน 0 แปลว่า "รวมแล้วได้ศูนย์จริง"
 *   สองอันนี้ต้องแสดงคนละแบบ ถ้าเผลอเขียน `if (!bookedCost)` จะกลืนกันทันที
 */
const hasData = computed(
  () =>
    props.totals.bookedCost !== null &&
    props.totals.accumulatedDepreciation !== null &&
    props.totals.netBookValue !== null &&
    props.totals.bookedCost > 0,
)

const accumulated = computed(() => props.totals.accumulatedDepreciation ?? 0)
const netBookValue = computed(() => props.totals.netBookValue ?? 0)
const bookedCost = computed(() => props.totals.bookedCost ?? 0)

/** ตัดไปแล้วกี่ % ของราคาทุน - ตัวเลขหลักที่คนมาดูกราฟนี้ต้องการ */
const depreciatedPercent = computed(() =>
  bookedCost.value === 0 ? 0 : (accumulated.value / bookedCost.value) * 100,
)

const slices = computed(() => [
  // ★ ค่าเสื่อมสะสมเป็นสีเทาโดยตั้งใจ = ส่วนที่ "ใช้ไปแล้ว" ส่วนมูลค่าคงเหลือใช้สีข้อมูล
  //   ห้ามสลับ - สีเทาที่ไปอยู่กับของที่ยังเหลือจะอ่านเหมือนของนั้นไม่มีค่า
  { label: 'ค่าเสื่อมสะสม', value: accumulated.value, color: OTHER_COLOR },
  { label: 'มูลค่าคงเหลือ', value: netBookValue.value, color: VALUE_COLOR },
])

const chartOptions = computed(() => ({
  chart: {
    type: 'donut' as const,
    height: 260,
    // ฟอนต์ของแอป - ไม่ตั้งชื่อฟอนต์เอง (กติกาเดียวกับกราฟอื่นบนหน้านี้)
    fontFamily: 'inherit',
    toolbar: { show: false },
  },
  labels: slices.value.map((s) => s.label),
  series: slices.value.map((s) => s.value),
  colors: slices.value.map((s) => s.color),
  // ช่องว่างสีพื้น 2px คั่นสองก้อน - ใช้ช่องว่างแยก ไม่ใช่ตีเส้นขอบรอบก้อน
  stroke: { width: 2, colors: [SURFACE] },
  legend: { show: false },
  dataLabels: { enabled: false },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          // ★ ห้ามปิด value - ตัวเลขที่ total.formatter คืนมาถูกเขียนลงในช่องนี้
          //   ปิดแล้วจะเหลือแต่ป้าย "ตัดค่าเสื่อมแล้ว" ลอย ๆ ไม่มีตัวเลข (เคยพลาดมาแล้ว)
          value: { show: true, fontSize: '22px', color: '#334155' },
          total: {
            show: true,
            // ★ ตรงกลางต้องเป็น "ตัดค่าเสื่อมแล้ว X%" ตลอดเวลา ห้ามสลับเป็นยอดของก้อนที่ชี้อยู่
            //   showAlways: true คือตัวที่ทำให้ Apex ไม่ผูก listener เขียนทับตรงกลางตอน hover/click
            //   (ดู Pie.js: addListeners ข้าม printDataLabelsInner เมื่อ showAlways เป็น true)
            //   ยอดรายก้อนอ่านได้จาก tooltip กับ legend ข้างล่างอยู่แล้ว - ตรงกลางมีหน้าที่เดียว
            //   คือตอบ "ตัดไปแล้วกี่ %" ถ้ามันเปลี่ยนไปมาตอนชี้ ตัวเลขหลักจะหายทุกครั้งที่เอาเมาส์ไปโดน
            showAlways: true,
            label: 'ตัดค่าเสื่อมแล้ว',
            color: '#64748b',
            formatter: () => `${depreciatedPercent.value.toFixed(1)}%`,
          },
        },
      },
    },
  },
  tooltip: { y: { formatter: (val: number) => `${formatMoney(val)} บาท` } },
  states: { active: { filter: { type: 'none' as const } } },
}))
</script>

<template>
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <div>
        <h2 class="card-title text-base">สัดส่วนค่าเสื่อม</h2>
        <p class="text-xs text-base-content/60">
          {{ departmentName || 'แผนกที่เลือก' }} คิดจากราคาทุนทางบัญชี
        </p>
      </div>

      <!-- ★ ข้อความนี้ต่างจาก "รวมแล้วได้ศูนย์" - ต้องบอกว่ายังไม่มีตัวเลขให้รวม
           ไม่ใช่วาดวงกลม 0% ซึ่งอ่านเหมือนทรัพย์สินไม่มีมูลค่า -->
      <p v-if="!hasData" class="py-10 text-center text-sm text-base-content/50">
        ยังไม่มีชิ้นไหนในแผนกนี้ที่มีตัวเลขบัญชีครบพอจะคิดสัดส่วนได้
      </p>

      <template v-else>
        <AppApexChart :options="chartOptions" />

        <!-- legend เขียนเอง: จุดสี + ชื่อ + ยอดเงิน ตัวหนังสือใช้โทนหมึกเสมอ
             (ห้ามระบายสีข้อความตามสีก้อน - กติกาเดียวกับกราฟอื่นในหน้านี้) -->
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
              <span class="truncate">{{ slice.label }}</span>
            </span>
            <span class="shrink-0 tabular-nums text-base-content/70">
              {{ formatMoney(slice.value) }}
            </span>
          </li>
          <li class="flex items-baseline justify-between gap-2 border-t border-base-200 pt-1.5">
            <span class="text-base-content/60">ราคาทุนทางบัญชี</span>
            <span class="shrink-0 font-medium tabular-nums">{{ formatMoney(bookedCost) }}</span>
          </li>
        </ul>

        <!-- ★ ห้ามตัดบรรทัดนี้ทิ้ง - ยอดข้างบนไม่ได้นับทุกชิ้นในแผนก คนที่เอาไปเทียบกับ
             จำนวนชิ้นแล้วไม่ตรงจะคิดว่าข้อมูลหาย ทั้งที่เป็นชิ้นที่ SAP ยังไม่ให้ตัวเลขมา -->
        <p class="border-t border-base-200 pt-2 text-xs text-base-content/60">
          นับจาก {{ totals.valued.toLocaleString('th-TH') }} ชิ้นที่มีตัวเลขบัญชีครบ
          <template v-if="totals.unvalued">
            · อีก {{ totals.unvalued.toLocaleString('th-TH') }} ชิ้นยังไม่ถูกนับ
          </template>
        </p>
      </template>
    </div>
  </div>
</template>
