<script setup lang="ts">
// จังหวะการตัดค่าเสื่อมรายบริษัท (เส้นสะสม) - ใช้เฉพาะตอนดู "ทุกบริษัท"
//
// หนึ่งบริษัท = หนึ่งเส้น · แกน X = อีกกี่ปี · แกน Y = ราคาทุนกี่ % ที่ตัดครบภายในปีนั้น
//
// ── มาแทนแท่งซ้อน "องค์ประกอบมูลค่าสินทรัพย์รายบริษัท" ────────────────────────
//
// แท่งซ้อนตอบสองอย่าง: "บริษัทไหนของแพง" (ความยาวแท่ง) กับ "บริษัทไหนของเก่า" (สัดส่วนเทา)
// ปัญหาคือ UBA ถือ ~89% ของมูลค่าทั้งทะเบียน แท่งของ UBP กับ MIG จึงเป็นเสี้ยวที่อ่านไม่ออก
// คำถามที่สอง (ซึ่งเป็นคำถามที่ทำอะไรต่อได้จริง) เลยตอบไม่ได้เลยด้วยกราฟนั้น
//
// เส้นนี้หารด้วยราคาทุนของบริษัทตัวเอง ทุกเส้นจึงวิ่งเต็มช่วง 0-100% เทียบ "จังหวะ" กันได้
// ทั้งที่ขนาดต่างกัน 30 เท่า ส่วนคำถาม "บริษัทไหนของแพง" ย้ายไปอยู่ตารางสรุปข้างล่าง
// ซึ่งมีคอลัมน์ราคาทุนอยู่แล้ว - ไม่ได้หายไปไหน
//
// ★ จุดแรกของเส้น (ปีที่ 0) = "ตัดครบไปแล้วกี่ %" ซึ่งคือป้าย `ตัดครบแล้ว N%` ของแท่งเดิม
//   ที่ถูกกางออกเป็นเส้นเวลา ต่างกันตรงเดิมนับเป็นชิ้น อันนี้นับเป็นบาท
//
// ★ ทุกจุดเป็นข้อเท็จจริงจาก remainingLifeMonths ตรง ๆ **ไม่มีการพยากรณ์**
//   ห้ามเปลี่ยนไปคำนวณค่าเสื่อมในอนาคตให้เส้นลื่นขึ้น - นั่นคือคนละกราฟที่ต้องสมมติว่า
//   ทุกชิ้นตัดแบบเส้นตรง ทั้งที่ depreciationMethod เก็บดิบไว้และมีชิ้นที่ไม่ใช่
//
// ★ สีต้องเป็นชุดเดียวกับ CompanySharePie ที่อยู่ข้าง ๆ (categoryColor ตามลำดับเดียวกัน)
//   สองกราฟนี้โผล่พร้อมกันเสมอ บริษัทเดียวกันคนละสีเมื่อไหร่ = ต้องกวาดหาชื่อใหม่ทุกครั้ง
import { computed } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { DashboardDepreciationRunoff } from '@/shared/services/dashboard.service'
import { formatMoney } from '@/shared/utils/money'
import { categoryColor, grid, ink, inkMuted, surface } from './chart-theme'

const props = defineProps<{ data: DashboardDepreciationRunoff | null }>()

/**
 * เอาเฉพาะบริษัทที่มีของให้คิดจริง เรียงตามราคาทุนมากไปน้อย
 *
 * ★ ตัดบริษัทที่ depreciableCost = 0 ออก - เส้นแบน 0% ตลอดไม่ได้บอกอะไร แต่กิน legend
 *   และไปแย่งสีของบริษัทที่มีของจริง (บริษัทนั้นยังเห็นได้ในตารางสรุปข้างล่าง)
 *
 * ★ เรียงด้วยราคาทุน ไม่ใช่ % ที่ตัดครบ - ลำดับของบริษัทต้องเหมือนกันทั้งหน้า
 *   (โดนัทข้าง ๆ เรียงตามจำนวนชิ้น ซึ่งลำดับตรงกันในทางปฏิบัติ) ไม่งั้นคนกวาดตา
 *   จากกราฟหนึ่งไปอีกกราฟแล้วต้องอ่านชื่อใหม่ทุกครั้ง
 */
const lines = computed(() =>
  (props.data?.companies ?? [])
    .filter((c) => c.depreciableCost > 0)
    .sort((a, b) => b.depreciableCost - a.depreciableCost)
    .map((c, i) => ({
      ...c,
      label: c.companyName || c.companyCode,
      color: categoryColor(i),
    })),
)

/** ที่ดินรวมทั้งเครือ - อยู่นอกเส้น รายงานเป็นตัวเลขใต้กราฟ */
const landCost = computed(() =>
  (props.data?.companies ?? []).reduce((sum, c) => sum + c.landCost, 0),
)

const noDataPieces = computed(() =>
  (props.data?.companies ?? []).reduce((sum, c) => sum + c.noDataPieces, 0),
)

const chartOptions = computed(() => {
  const rows = lines.value
  const horizon = props.data?.horizonYears ?? 0

  // ── ป้ายแกน X ต้องเว้นเป็นช่วง ป้ายทุกปีไม่มีทางพอ ──────────────────────────
  //
  // เพดานคือ 20 ปี = 21 ป้าย ("วันนี้" + "1 ปี".."20 ปี") การ์ดนี้กว้าง 2 ใน 3 ของแถว
  // เหลือความกว้างแกนจริงราว 600px = ป้ายละ ~28px ทั้งที่ "12 ปี" กว้างเกิน 35px
  //
  // ★ ตัวที่ทำให้ป้ายเอียงเบียดกันคือ Apex ไม่ใช่ข้อมูล - ถ้าป้ายที่ยาวที่สุด × จำนวนป้าย
  //   เกินความกว้างแกน มันจะหมุนป้ายทั้งแถว -45° (ค่าตั้งต้นของ labels.rotate) แล้ว
  //   เกณฑ์ "ป้ายนี้ทับป้ายก่อนหน้าไหม" ก็ถูกหารด้วยมุมหมุน = ยอมให้ชิดกันกว่าเดิมเกือบ 4 เท่า
  //   ผลคือป้ายอยู่ครบทั้ง 21 ป้ายในแนวเฉียง ทับกันเอง และกินความสูงที่ควรเป็นของเส้นไปอีก
  //
  // ★ ต้องปิดการหมุนด้วย rotate: 0 (เงื่อนไขของ Apex เช็ค `rotate !== 0` ตรง ๆ)
  //   ใส่แค่ hideOverlappingLabels ไม่พอ เพราะการตัดสินใจหมุนเกิดก่อนด่านนั้น
  //
  // ★ จุดข้อมูลยังอยู่ครบทุกปีเหมือนเดิม - ซ่อนแค่ "ป้าย" ไม่ได้ตัดข้อมูลทิ้ง
  //   ปีที่ไม่มีป้ายยังชี้อ่านค่าได้จาก tooltip ที่บอกปีอยู่แล้ว (กติกาเดียวกับ marker ข้างล่าง)
  //
  // ★ ไม่ใช้ xaxis.tickAmount ของ Apex ที่ทำเรื่องคล้ายกัน เพราะระยะที่ได้จริงคือ
  //   round(จำนวนป้าย / (tickAmount + 1)) - คุมไม่ได้ว่าปีสุดท้ายจะได้ป้ายไหม และพอเซ็ต
  //   tickAmount แล้ว Apex จะข้ามด่านกันป้ายทับกันทิ้งไปเลย เหลือแต่ระยะที่มันคำนวณเอง
  const labelStep = Math.max(1, Math.ceil(horizon / 6))

  return {
    chart: {
      type: 'area' as const,
      height: 260,
      fontFamily: 'inherit',
      foreColor: ink.value,
      toolbar: { show: false },
      zoom: { enabled: false },
      background: surface.value,
    },
    
    series: rows.map((r) => ({
      name: r.label,
      // ตัดทศนิยมทิ้งตั้งแต่ตรงนี้ - ความละเอียดระดับ 0.1% ไม่มีใครอ่านจากเส้น
      data: r.points.map((p) => Math.round(p * 10) / 10),
    })),
    colors: rows.map((r) => r.color),
    // ★ ไม่ใส่ marker ทุกจุด - เส้นสามเส้น × 20 จุดคือ 60 วงกลมทับกันจนอ่านไม่ออก
    //   ให้ขึ้นเฉพาะตอน hover ซึ่งเป็นตอนที่คนกำลังหาค่าจุดนั้นจริง ๆ
    markers: { size: 0, hover: { size: 5 } },
    stroke: { width: 4.5, curve: 'smooth' as const },
    fill: {
      type: 'gradient',
      gradient: {
        opacityFrom: 0.25,
        opacityTo: 0.1,
        stops: [0, 100],
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },

    // ★ เส้นตารางแนวนอนอย่างเดียว - แนวตั้งไม่ได้ช่วยอ่านอะไรบนกราฟที่แกน X เป็นปีห่างเท่ากัน
    //   มีแต่จะตัดเส้นข้อมูลเป็นช่อง ๆ แข่งกับตัวเส้นเอง
    grid: {
      borderColor: grid.value,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 8, top: 0 },
    },
    xaxis: {
      categories: Array.from({ length: horizon + 1 }, (_, i) => String(i)),
      // ★ ป้ายแกนบอกหน่วยที่จุดแรก ไม่ใช่ที่หัวแกน - คนอ่านกราฟเส้นมองที่ตัวเลขบนแกน
      //   ไม่ได้มองหัวแกน ถ้าไม่บอกตรงนี้ "0 1 2 3" จะถูกอ่านเป็นปี พ.ศ. ย่อ ๆ ได้
      labels: {
        style: { colors: inkMuted.value },
        rotate: 0,
        formatter: (v: string) => {
          const year = Number(v)
          if (year === 0) return 'วันนี้'
          // ปีสุดท้ายได้ป้ายเสมอ - มันคือปลายแกน ถ้าปล่อยว่างจะอ่านไม่ออกว่ากราฟจบที่กี่ปี
          // (ถ้าบังเอิญไปชิดป้ายก่อนหน้า Apex ลบป้ายที่ทับให้เองอยู่แล้ว)
          if (year !== horizon && year % labelStep !== 0) return ''
          return `${year} ปี`
        },
      },
      // เส้นขอบแกนกับขีดเล็ก ๆ เอาออก - เส้นตารางแนวนอนทำหน้าที่บอกระดับอยู่แล้ว
      // ซ้อนอีกชั้นได้แค่กรอบที่แย่งความสนใจไปจากข้อมูล
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 4,
      labels: {
        style: { colors: inkMuted.value },
        formatter: (v: number) => `${Math.round(v)}%`,
      },
    },
    tooltip: {
      shared: true,
      intersect: false,
      x: {
        formatter: (_v: number, opts?: { dataPointIndex?: number }) => {
          const i = opts?.dataPointIndex ?? 0
          return i === 0 ? 'ตัดครบแล้ว ณ วันนี้' : `ภายใน ${i} ปี`
        },
      },
      y: { formatter: (v: number) => `${v.toFixed(1)}% ของราคาทุน` },
    },
  }
})
</script>

<template>
  <div class="card min-w-0 border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <!-- ── หัวการ์ด: ชื่อซ้าย · legend ขวา ────────────────────────────────────
           ★ legend อยู่บน "ก่อน" กราฟ ไม่ใช่ล่าง - คนต้องรู้ว่าเส้นไหนคือใครก่อนจะอ่านเส้น
             ไม่ใช่ไล่ดูเส้นแล้วค่อยเลื่อนสายตาลงไปหาคำตอบ

           ★ เขียน legend เอง ไม่ใช้ของ Apex - ต้องมีตัวเลข "ตัดครบแล้ววันนี้" ต่อบริษัท
             ซึ่งคือป้าย `ตัดครบแล้ว N%` ของแท่งซ้อนเดิมที่กราฟนี้มาแทน ถ้าตัดทิ้งเท่ากับ
             ทำให้ข้อมูลหายไปจากหน้าจอหนึ่งอย่างโดยไม่มีใครสังเกต

           ★ ราคาทุนถูกถอดออกจาก legend โดยตั้งใจ - มันอยู่ในตารางสรุปรายบริษัทที่อยู่ถัดลงไป
             ไม่กี่ร้อยพิกเซลอยู่แล้ว การเขียนซ้ำที่นี่คือการวาดสามบริษัทเพิ่มอีกหนึ่งรอบ
             ซึ่งเป็นปัญหาเดิมของหน้านี้ (สามบริษัทถูกวาดสี่รอบ) -->
      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div class="min-w-0">
          <!-- ★★ ปุ่มสลับกราฟต้องอยู่ตำแหน่งเดียวกันเป๊ะกับของ CompanyDepreciationTrendLine
               (ในบรรทัดเดียวกับ h2) ไม่งั้นปุ่มจะขยับตอนกดสลับ แล้วเมาส์ที่ค้างอยู่ตรงนั้น
               จะกดซ้ำไม่โดน - สองการ์ดนี้แทนที่กันในสล็อตเดียวกันบนหน้า Dashboard -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 class="card-title text-base">การตัดค่าเสื่อมรายบริษัท</h2>

          </div>
          <!-- ★ ต้องบอกว่า % ข้างชื่อบริษัทคืออะไร - ตัวเลขลอย ๆ ข้างชื่อใน legend
               ถูกเดาเป็น "สัดส่วนของบริษัทนั้นในทั้งเครือ" ได้ง่ายมาก ซึ่งคนละเรื่องกันเลย -->
          <p class="text-xs text-base-content/70">
            ราคาทุนกี่ % ที่ตัดค่าเสื่อมครบแล้วและจะครบภายในแต่ละปี
          </p>
        </div>

        <ul v-if="lines.length" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <li v-for="row in lines" :key="row.companyCode" class="flex min-w-0 items-center gap-1.5">
            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: row.color }" />
            <span class="max-w-32 truncate text-base-content/70" :title="row.label">{{ row.label }}</span>
            <span class="shrink-0 font-medium tabular-nums">
              {{ Math.round(row.points[0] ?? 0) }}%
            </span>
          </li>
        </ul>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 ml-auto">
      <slot name="toggle" />
      </div>     
      <p v-if="!lines.length" class="py-10 text-center text-sm text-base-content/70">
        ยังไม่มีบริษัทไหนที่มีข้อมูลอายุและราคาทุนพอจะคิดสัดส่วนได้
      </p>

      <template v-else>
        <AppApexChart :options="chartOptions" />

        <!-- ของที่อยู่นอกเส้น - ต้องบอก ไม่ใช่ปล่อยให้หายเงียบ (กติกาเดียวกับ RemainingLifeChart) -->
        <div v-if="landCost > 0 || noDataPieces > 0"
          class="flex flex-wrap items-center justify-center  gap-x-4 gap-y-1 border-t border-base-200 pt-2 text-xs text-base-content/70">
          <span v-if="noDataPieces > 0" class="flex items-center">
            ยังไม่มีข้อมูลอายุหรือราคาทุน {{ noDataPieces.toLocaleString('th-TH') }} ชิ้น
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
