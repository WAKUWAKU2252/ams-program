<script setup lang="ts">
// ค่าเสื่อมสะสมตั้งแต่ต้นปีบัญชี รายบริษัท (เส้น) - ใช้เฉพาะตอนดู "ทุกบริษัท"
//
// หนึ่งบริษัท = หนึ่งเส้น · แกน X = งวด 1-12 · แกน Y = ค่าเสื่อมสะสมเป็นบาท
//
// ── ★★ ทำไมเป็นยอด "สะสม" ไม่ใช่ค่าเสื่อมรายงวด
//
// SAP คิดค่าเสื่อมรายวัน ยอดรายงวดจึงแกว่งตามจำนวนวันในเดือนล้วน ๆ - ของ UBA ปีบัญชี 2569
// งวด 1 ได้ 1,136,894 บาท (31 วัน) งวด 2 ได้ 1,025,591 (28 วัน) ซึ่งต่อวันคือ 36,674
// กับ 36,628 แทบเท่ากัน ถ้าวาดรายงวด กราฟจะดิ่งลง ~10% ที่งวด 2 **พร้อมกันทุกเส้น**
// แล้วอ่านเหมือนมีเหตุการณ์ร่วมทั้งเครือ ทั้งที่เป็นปฏิทิน
//
// ยอดสะสมไม่มีปัญหานี้ เส้นขึ้นทางเดียว และ "ความชัน" คือ run rate ที่คนดูอยากได้อยู่แล้ว
//
// ── ★★ แกน X ตรึงไว้ 12 งวดเสมอ ห้ามหดตามงวดที่ปิดจริง
//
// เส้นที่หยุดกลางทางคือคำตอบในตัวว่าบริษัทไหนปิดงวดถึงไหนแล้ว (วัด 2026-09-16: UBA/UBP
// ถึงงวด 8 · MIG ถึงงวด 1) ถ้าหดแกนให้พอดีงวดสุดท้ายที่มี ข้อมูลนั้นจะหายไปทั้งก้อน
// - ต่างจาก runoff ที่หดแกนได้เพราะปลายเส้นที่ราบยาวไม่ได้บอกอะไร
//
// ★★ งวดที่ยังไม่ลงบัญชีเป็น null ต่อท้ายให้ครบ 12 ช่อง - ห้ามแปลงเป็น 0 และ **ห้ามตัดทิ้ง**
//   เป็น 0 → เส้นดิ่งลงพื้น อ่านว่า "ค่าเสื่อมหายไป"
//   ตัดทิ้ง → Apex หดแกนลงมาเท่า series ที่ยาวที่สุด ช่องว่างท้ายแกนหายไปทั้งก้อน
//   (เหตุผลเต็มอยู่ที่ series ใน chartOptions - เคยพลาดมาแล้วครั้งหนึ่ง)
//
// ★ เส้นตรง ไม่ใช่เส้นโค้ง (curve: 'straight') - ระหว่างสองงวดไม่มีข้อมูล การลากโค้ง
//   คือการแต่งค่ากลางทางขึ้นมาเอง ต่างจาก runoff ที่แกนเป็นช่วงปีต่อเนื่อง
//
// ⚠️ พื้นที่ fill ใต้เส้น: สามบริษัทต่างกันถึง 430 เท่า (UBA 1.13 ล้าน/งวด · MIG 2,629)
//   พื้นที่ของ UBA จึงพาดทับเส้นที่เหลือได้ - ถ้าวันหนึ่งเส้นเล็กอ่านไม่ออก ให้ลด
//   opacity ของ gradient ก่อน อย่าเพิ่งไปแตะสเกลหรือ normalize เป็น % เพราะยอดเป็นบาท
//   คือสิ่งที่กราฟนี้มีไว้ตอบ (ถ้า normalize ก็กลายเป็น runoff ที่อยู่อีกแท็บไปแล้ว)
//
// ★ สีต้องเป็นชุดเดียวกับ CompanySharePie ที่อยู่ข้าง ๆ (categoryColor ตามลำดับเดียวกัน)
import { computed } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { DashboardDepreciationTrend } from '@/shared/services/dashboard.service'
import { formatMoney } from '@/shared/utils/money'
import { formatMonthYear } from '@/shared/utils/date'
import { categoryColor, compactBaht, grid, ink, inkMuted, surface } from './chart-theme'

const props = defineProps<{ data: DashboardDepreciationTrend | null }>()

/** งวดต่อปี - ต้องตรงกับ PERIODS_IN_YEAR ฝั่ง backend (points ยาว 12 เสมอ) */
const PERIODS_IN_YEAR = 12

const lines = computed(() =>
  (props.data?.companies ?? []).map((c, i) => ({
    ...c,
    label: c.companyName || c.companyCode,
    color: categoryColor(i),
    /** ยอดสะสม ณ งวดสุดท้ายที่ปิดแล้ว = ค่าเสื่อมปีนี้ถึงตอนนี้ของบริษัทนั้น */
    total: c.points[c.lastClosedPeriod - 1] ?? 0,
  })),
)

/**
 * ทุกบริษัทปิดงวดถึงเท่ากันไหม - ไม่เท่ากันเมื่อไหร่ต้องเขียนกำกับใต้กราฟ
 *
 * ★ ตัวเลขบนเส้นแต่ละเส้นจึงเป็นของคนละช่วงเวลา ซึ่งเป็นเรื่องที่ต้องบอก ไม่ใช่ให้คน
 *   สังเกตเอาเองจากปลายเส้น (MIG ปิดถึงงวด 1 ส่วน UBA/UBP ถึงงวด 8)
 */
const mixedProgress = computed(() => new Set(lines.value.map((l) => l.lastClosedPeriod)).size > 1)

const chartOptions = computed(() => {
  const rows = lines.value

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
      /**
       * ★★★ ต้องยาว 12 ช่องเสมอ ห้าม slice ห้าม filter ห้ามตัดหางทิ้งไม่ว่าด้วยเหตุผลอะไร
       *
       * Apex กำหนดความยาวแกน X จาก **ความยาวของ series ที่ยาวที่สุด** ไม่ใช่จากจำนวน
       * xaxis.categories ที่ให้ไป - ตัดหางเมื่อไหร่แกนจะจบที่งวดสุดท้ายที่มีข้อมูล
       * (ทุกบริษัทปิดถึงงวด 8 → แกนเหลือ 1-8) แล้วช่องว่างของงวด 9-12 ที่เป็น
       * **ตัวข้อมูลเอง** จะหายไปทั้งก้อน
       *
       * ช่องว่างท้ายแกนคือคำตอบว่า "ปีบัญชียังเหลืออีกกี่งวด และบริษัทไหนตามหลังใคร"
       * ซึ่งเป็นเหตุผลทั้งหมดที่การ์ดนี้ตรึงแกนไว้ 12 งวดตั้งแต่แรก (ดูหัวไฟล์)
       *
       * ★ null ที่ต่อท้ายจึงเป็นข้อมูล ไม่ใช่ที่ว่างที่รอการ optimize - ห้ามแปลงเป็น 0 ด้วย
       *   เส้นจะดิ่งลงพื้นแล้วอ่านว่า "ค่าเสื่อมหายไป"
       *
       * ⚠️ เคยถูกแก้เป็น slice(0, lastClosedPeriod) มาแล้วครั้งหนึ่ง เพื่อให้อนิเมชันของ
       *    fill กับ stroke จบพร้อมกัน — แลกผิดของ อนิเมชันไม่คุ้มกับการเสียช่องว่าง
       *    ท้ายแกน (ดูหมายเหตุเรื่องอนิเมชันที่ <AppApexChart> ข้างล่าง)
       */
      data: r.points.map((v) => (v === null ? null : Math.round(v))),
    })),
    colors: rows.map((r) => r.color),
    // จุดละงวด มี 12 จุดต่อเส้น ไม่แน่นเท่า runoff (21 จุด) จึงโชว์ marker ได้
    // ★ ปลายเส้นที่หยุดกลางทางต้องมีจุดให้เห็น ไม่งั้นดูเหมือนเส้นถูกตัดขาดเพราะกราฟพัง
    markers: { size: 3.5, hover: { size: 6 } },
    stroke: { width: 4, curve: 'straight' as const },
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

    grid: {
      borderColor: grid.value,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 8, top: 0 },
    },
    xaxis: {
      categories: Array.from({ length: PERIODS_IN_YEAR }, (_, i) => String(i + 1)),
      labels: { style: { colors: inkMuted.value }, rotate: 0 },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
      title: {
        text: 'งวดบัญชี',
        style: { color: inkMuted.value, fontSize: '11px', fontWeight: 400 },
      },
    },
    yaxis: {
      min: 0,
      tickAmount: 4,
      labels: {
        style: { colors: inkMuted.value },
        formatter: (v: number) => compactBaht(v),
      },
    },
    tooltip: {
      shared: true,
      intersect: false,
      x: { formatter: (_v: number, opts?: { dataPointIndex?: number }) => `งวด ${(opts?.dataPointIndex ?? 0) + 1}` },
      y: { formatter: (v: number) => `${formatMoney(v)} บาท (สะสม)` },
    },
  }
})
</script>

<template>
  <div class="card min-w-0 border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <!-- ── หัวการ์ด: ชื่อ + ปุ่มสลับกราฟซ้าย · legend ขวา ──────────────────────
           ★ legend อยู่บน "ก่อน" กราฟ ไม่ใช่ล่าง - คนต้องรู้ว่าเส้นไหนคือใครก่อนอ่านเส้น
           ★ เขียน legend เอง ไม่ใช้ของ Apex เพราะต้องมียอดสะสมต่อบริษัทกำกับ ซึ่งเป็น
             ตัวเลขที่เอาไปกระทบยอดกับ P&L ได้ และเป็นป้ายตัวหนังสือที่ชุดสีนี้บังคับให้ต้องมี
             (ดู chart-theme: สามสีในชุด contrast ต่ำกว่า 3:1 ห้ามให้สีเป็นตัวบอกความหมายเดี่ยว ๆ) -->
      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 class="card-title text-base">ค่าเสื่อมสะสมรายบริษัท</h2>

          </div>
          <p class="text-xs text-base-content/70">
            ค่าเสื่อมที่ลงบัญชีแล้ว สะสมตั้งแต่ต้นปีบัญชี
            <template v-if="data">{{ data.fiscalYear + 543 }}</template>
          </p>
        </div>

        <ul v-if="lines.length" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <li v-for="row in lines" :key="row.companyCode" class="flex min-w-0 items-center gap-1.5">
            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: row.color }" />
            <span class="max-w-32 truncate text-base-content/70" :title="row.label">{{ row.label }}</span>
            <span class="shrink-0 font-medium tabular-nums">{{ compactBaht(row.total) }}</span>
          </li>
        </ul>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 ml-auto">
      <slot name="toggle" />
      </div>
      <p v-if="!lines.length" class="py-10 text-center text-sm text-base-content/70">
        ยังไม่มีบริษัทไหนที่ลงบัญชีค่าเสื่อมของปีบัญชีนี้
      </p>

      <template v-else>
        <!-- ── หมายเหตุ: fill กับเส้นจบอนิเมชันไม่พร้อมกัน และเรา "รับไว้" ไม่ใช่ยังไม่เจอ ──
             พื้นที่ fill ดูเหมือนเสร็จก่อนเส้นเล็กน้อย สาเหตุอยู่ที่ตัว apexcharts เอง
             (modules/Animations.js → animateDraw) ซึ่งเผยสองชั้นด้วยคนละกลไก:
               fill  → mask กวาดจาก 0 ถึง "ความกว้างกริด"
               เส้น  → ไล่ stroke-dashoffset ตาม "ความยาวเส้นของตัวเอง"
             เวลาเท่ากันแต่คนละระยะทาง — การ์ดนี้ตรึงแกน 12 งวดขณะที่ข้อมูลจบงวด 8
             เส้นจึงกินแค่ ~2/3 ของกริด ส่วน mask กวาดเต็มกริด
             (CompanyDepreciationRunoffLine ไม่มีอาการนี้เพราะข้อมูลกินเต็มแกนพอดี)

             ── ลองมาแล้วสองทาง ทั้งคู่แย่กว่าอาการเดิม อย่าลองซ้ำ
               1. ตัดหาง series ให้เท่าข้อมูล → แกนหดเหลือ 8 งวด เสียช่องว่างท้ายแกน
                  ซึ่งเป็นข้อมูลว่าปีบัญชียังเหลืออีกกี่งวด
               2. ใส่ stroke.dashArray ก้อนใหญ่ เพื่อให้เส้นไปใช้ mask เหมือน fill
                  → จบพร้อมกันจริง แต่กลายเป็นการกวาดทั้งแผงแทนการลากเส้น ดูแปลกกว่าเดิม
             ทางที่เหลือคือปิดอนิเมชันทิ้ง (:animate="false") ซึ่งแลกมากกว่าที่ได้ -->
        <AppApexChart :options="chartOptions" />

        <!-- ★ ต้องบอกว่าแต่ละเส้นจบที่งวดไหน - ปลายเส้นที่ไม่เท่ากันแปลว่าตัวเลขบน legend
             เป็นของคนละช่วงเวลา ถ้าไม่เขียนไว้ คนจะเอายอดสะสมของบริษัทที่ปิดถึงงวด 8
             ไปเทียบกับบริษัทที่ปิดถึงงวด 1 ตรง ๆ -->
        <div
          class="flex flex-wrap items-center  justify-center gap-x-4 gap-y-1 border-t border-base-200 pt-2 text-xs text-base-content/70">
          <span v-for="row in lines" :key="row.companyCode">
            {{ row.label }} ถึงงวด {{ row.lastClosedPeriod }}
            <template v-if="row.lastToDate">({{ formatMonthYear(row.lastToDate) }})</template>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
