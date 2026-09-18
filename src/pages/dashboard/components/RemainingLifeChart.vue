<script setup lang="ts">
// กราฟอายุคงเหลือของแผนกที่เลือก - "ของแผนกนี้ใกล้หมดอายุกันเยอะแค่ไหน"
//
// ★ กราฟนี้มีเฉพาะตอนเลือกแผนกเดียว ตอนดู "ทุกแผนก" backend คืน remainingLife เป็น null
//   ตั้งใจให้เป็นแบบนั้น: รวมทั้งบริษัทแล้วรูปจะเหมือนเดิมทุกครั้งจนไม่มีใครอ่าน และไม่มี
//   ใครทำอะไรกับมันได้ คนที่ต้องใช้คือหัวหน้าแผนกที่วางแผนงบเปลี่ยนของปีหน้า
//
// ★ ใช้ AppApexChart เหมือนกราฟอื่นบนหน้านี้ ไม่ใช่ chart.js - ไลบรารีกราฟสองตัวใน
//   โปรเจกต์เดียวแปลว่าธีม สี ฟอนต์ และพฤติกรรม resize จะเพี้ยนกันคนละแบบ
//   (และ AppApexChart จัดการ destroy กับ ResizeObserver ให้แล้ว ซึ่งเป็นสองอย่างที่
//   ลืมกันบ่อยที่สุดเวลาต่อกราฟเข้ากับ Vue)
import { computed, type PropType } from 'vue'
import { Icon } from '@iconify/vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { DashboardRemainingLife } from '@/shared/services/dashboard.service'
import { formatDate } from '@/shared/utils/date'
import { grid, ink } from './chart-theme'

const props = defineProps({
  /** null = ยังไม่ได้เลือกแผนก - component จะไม่วาดอะไรเลย */
  data: { type: Object as PropType<DashboardRemainingLife | null>, default: null },
  /** ชื่อแผนกที่กำลังดู เอาไว้ขึ้นคำอธิบายใต้หัวข้อ */
  departmentName: { type: String, default: '' },
  /**
   * ตัวเลขอายุคงเหลือเป็นของ ณ วันไหน (asOfDate ของงวดล่าสุดที่บัญชีปิด)
   *
   * ★ ต้องขึ้นคู่กับกราฟเสมอ — ก่อนหน้านี้กราฟแสดงยอด ณ ต้นปีบัญชีโดยไม่มีอะไรบอก
   *   ซึ่งสูงเกินจริงถึง 8 เดือน (UBA 917 จาก 1,061 ชิ้น)
   */
  asOfDate: { type: String as PropType<string | null>, default: null },
})

/** จำนวนชิ้นที่อยู่บนแกนเวลาจริง ๆ - ไม่รวมที่ดินกับชิ้นที่ไม่มีข้อมูล */
const totalInBuckets = computed(() =>
  (props.data?.buckets ?? []).reduce((sum, b) => sum + b.count, 0),
)

/** ไม่มีชิ้นไหนคิดค่าเสื่อมเลย = ไม่มีอะไรให้วาด (ต่างจาก "ยังไม่เลือกแผนก") */
const isEmpty = computed(() => totalInBuckets.value === 0)

const chartOptions = computed(() => {
  const buckets = props.data?.buckets ?? []
  return {
    chart: {
      type: 'bar' as const,
      height: 300,
      // ฟอนต์ของแอป - ไม่ตั้งชื่อฟอนต์เอง (กติกาเดียวกับกราฟอื่นบนหน้านี้)
      fontFamily: 'inherit',
      // สีตัวหนังสือตั้งต้นของกราฟ - ป้ายแกนกับหัวแกนที่ไม่ได้ระบุสีไว้จะตกมาใช้ค่านี้
      // ไม่ตั้ง = Apex ใช้เทาเข้มของมันเอง (#373d3f) ซึ่งจมหายไปกับพื้นการ์ดบนธีมมืด
      foreColor: ink.value,
      toolbar: { show: false },
    },
    series: [{ name: 'จำนวนชิ้น', data: buckets.map((b) => b.count) }],
    xaxis: {
      categories: buckets.map((b) => b.label),
      labels: { style: { fontSize: '11px' } },
    },
    yaxis: {
      title: { text: 'จำนวนชิ้น' },
      // จำนวนชิ้นเป็นจำนวนเต็มเสมอ - ปล่อยให้ Apex ตั้งสเกลเองจะได้ 0.5 ชิ้นบนแกน
      labels: { formatter: (v: number) => String(Math.round(v)) },
      forceNiceScale: true,
    },
    plotOptions: { bar: { borderRadius: 4, columnWidth: '55%', distributed: true } },
    // distributed: true ทำให้แต่ละแท่งมีสีของตัวเอง - ★ ต้องปิด legend ด้วย ไม่งั้น Apex
    // จะขึ้นป้ายสีครบทุกแท่งซ้ำกับชื่อบนแกน X ซึ่งกินที่ไปเปล่า ๆ
    legend: { show: false },
    dataLabels: { enabled: false },
    // ★ แท่งแรกคือ "หมดอายุแล้ว" = ของที่ต้องเฝ้า ให้สีเตือน ที่เหลือไล่จากใกล้หมดไปยังไกล
    colors: ['#dc2626', '#ea9a0b', '#eab308', '#84cc16', '#22c55e', '#16a34a', '#0891b2'],
    grid: { borderColor: grid.value },
    tooltip: { y: { formatter: (v: number) => `${v.toLocaleString('th-TH')} ชิ้น` } },
  }
})
</script>

<template>
  <!-- ไม่มีข้อมูล = ยังไม่ได้เลือกแผนก - ไม่วาดอะไรเลย ปล่อยให้ Dashboard คุมว่าจะโชว์ตอนไหน -->
  <div v-if="data" class="card min-w-0 border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <div>
        <h2 class="font-semibold">อายุคงเหลือของสินทรัพย์</h2>
        <!-- ★ ป้ายวันที่ห้ามตัดทิ้ง - ตัวเลขนี้เป็นอายุคงเหลือ ณ งวดล่าสุดที่บัญชีปิด
             ไม่ใช่ ณ วันนี้ และไม่ใช่ยอดต้นปีแบบที่ SAP ส่งมาดิบ ๆ (เคยแสดงยอดต้นปี
             ซึ่งสูงเกินจริงถึง 8 เดือน) กติกาเดียวกับการ์ดเงินด้านบนของหน้า -->
        <p class="text-sm text-base-content/60">
          {{ departmentName || 'แผนกที่เลือก' }}
          <template v-if="asOfDate"> · ณ {{ formatDate(asOfDate) }}</template>
        </p>
      </div>

      <div v-if="isEmpty" class="py-12 text-center text-base-content/50">
        <Icon icon="mdi:chart-bar" class="mx-auto size-12 opacity-40" />
        <p class="mt-2 text-sm">ยังไม่มีชิ้นไหนในแผนกนี้ที่มีข้อมูลอายุคงเหลือ</p>
      </div>

      <AppApexChart v-else :options="chartOptions" />

      <!-- ★ สองตัวนี้ห้ามเอาไปวาดรวมเป็นแท่ง - ไม่ใช่ช่วงเวลา วางบนแกนเดียวกันคือโกหก
           แต่ต้องบอกไว้ ไม่งั้นคนบวกแท่งแล้วไม่ตรงกับจำนวนชิ้นในแผนกจะคิดว่าข้อมูลหาย -->
      <div
        v-if="data.noDepreciation || data.noData"
        class="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-base-200 pt-2 text-xs text-base-content/60"
      >
        <span>อยู่บนกราฟ {{ totalInBuckets.toLocaleString('th-TH') }} ชิ้น</span>
        <span v-if="data.noDepreciation">
          ไม่คิดค่าเสื่อม {{ data.noDepreciation.toLocaleString('th-TH') }} ชิ้น
        </span>
        <span v-if="data.noData">
          ยังไม่มีข้อมูลอายุ {{ data.noData.toLocaleString('th-TH') }} ชิ้น
        </span>
      </div>
    </div>
  </div>
</template>
