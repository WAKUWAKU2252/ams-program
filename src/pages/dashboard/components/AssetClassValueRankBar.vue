<script setup lang="ts">
// อันดับมูลค่าสินทรัพย์รวมของแต่ละชั้นบัญชี (แท่งนอน เรียงจากมากไปน้อย)
//
// ★ แกนนี้คือ asset.assetClass รหัสเต็ม ตรงกับที่รายงานของ finance แบ่ง - เอาไปเทียบกับ
//   ชีต Asset-สรุป ได้ทีละชั้น ต่างจากแกนแผนกที่ finance ไม่ได้ออกรายงานให้
//
// ★ ค่าที่วัดคือ "มูลค่าคงเหลือ" (netBookValue) ตัวเดียวกับช่องใหญ่ด้านบนของหน้า
//   ไม่ใช่ราคาทุน - ถ้าเปลี่ยนไปใช้ราคาทุนต้องแก้หัวเรื่องด้วย ไม่งั้นคนจะเอาแท่งนี้
//   ไปกระทบยอดกับช่อง "มูลค่าคงเหลือ" แล้วไม่ตรงโดยหาสาเหตุไม่เจอ
//
// ★ ตัดที่ 10 อันดับแรก และเขียนไว้บนหน้าว่าตัดกี่อันดับ - ตารางสรุปรายแผนกใต้กราฟ
//   มีครบทุกแผนกอยู่แล้ว กราฟนี้มีไว้ตอบว่า "ใครถือของมีค่าที่สุด" ไม่ใช่ที่เก็บข้อมูลครบ
//
// ★ แผนกที่มูลค่าเป็น 0 หรือยังไม่มีตัวเลขบัญชี (null) ไม่ขึ้นกราฟ - แท่งยาวศูนย์เรียงกัน
//   ท้ายกราฟไม่ได้บอกอะไร แต่กินที่และทำให้แท่งที่มีค่าจริงเตี้ยลง ความต่างสองอย่างนี้
//   (ไม่มีของ / มีของแต่ SAP ยังไม่ส่งตัวเลขมา) อ่านได้จากตารางซึ่งแยก - ไว้ '0' กับ '-'
import { computed } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { AssetClassSummary } from '@/shared/services/dashboard.service'
import { formatMoney } from '@/shared/utils/money'
import { VALUE_COLOR, compactBaht, grid, ink, inkMuted } from './chart-theme'

const props = defineProps<{ rows: AssetClassSummary[] }>()

/** ชื่อที่จะขึ้นบนแกน - ชื่อบัญชี > รหัสดิบ > แถวที่ไม่มีชั้นบัญชีเลย
 *  ★ ห้ามเขียน "ไม่ระบุ" เมื่อยังไม่ได้ import ชื่อ - รหัสดิบอ่านออกและเทียบรายงานได้ */
const labelOf = (row: AssetClassSummary): string =>
  row.accountName ?? row.assetClass ?? 'ยังไม่ระบุชั้นบัญชี'

/**
 * ชื่อเต็มพร้อมรหัสชั้นบัญชี — ใช้เฉพาะหัว tooltip ตอนเอาเมาส์ชี้
 *
 * ★ ห้ามเอาไปใส่ใน xaxis.categories แทน — ป้ายบนแกน y ถูกจำกัดความกว้างอยู่แล้ว
 *   (maxWidth 110px บนจอแคบ) เติมรหัส 13 ตัวเข้าไปจะไปเบียดชื่อจนอ่านไม่ออก
 *   ซึ่งเป็นปัญหาเดียวกับที่เจอใน legend ของ AssetClassSharePie
 *
 * ★ ไม่เติมรหัสเมื่อ label เป็นรหัสอยู่แล้ว (ชั้นที่ยังไม่ได้ import ชื่อบัญชี — UBP 4 รหัส ·
 *   MIG 7 · UBA 10) ไม่งั้นจะได้ "1216301-1-228 · 1216301-1-228" ซ้ำสองรอบ
 */
const fullLabel = (row: AssetClassSummary): string => {
  const name = labelOf(row)
  return row.assetClass && row.assetClass !== name ? `${name}  ${row.assetClass}` : name
}

const TOP_N = 10

const ranked = computed(() =>
  props.rows
    .filter((r) => (r.netBookValue ?? 0) > 0)
    .sort((a, b) => (b.netBookValue ?? 0) - (a.netBookValue ?? 0)),
)

const shown = computed(() => ranked.value.slice(0, TOP_N))

/** บอกตรง ๆ ว่ายังมีอีกกี่แผนกที่ไม่ได้อยู่บนกราฟ - กันคนบวกเฉพาะแท่งที่เห็นแล้วสรุปยอด */
const hiddenCount = computed(() => Math.max(0, ranked.value.length - shown.value.length))

const chartOptions = computed(() => {
  const rows = shown.value
  const values = rows.map((r) => r.netBookValue ?? 0)
  const maxValue = values[0] ?? 0

  return {
    chart: {
      type: 'bar' as const,
      // สูงตามจำนวนแท่ง ไม่ใช่ความสูงคงที่ - ถ้าตรึงไว้ค่าเดียว พอมี 3 แผนกแท่งจะอ้วนเป็นแผ่น
      // และพอมี 10 แผนกแท่งจะเบียดจนชื่อซ้อนกัน
      height: Math.max(220, rows.length * 38 + 48),
      fontFamily: 'inherit',
      // สีตัวหนังสือตั้งต้นของกราฟ - ป้ายแกนกับหัวแกนที่ไม่ได้ระบุสีไว้จะตกมาใช้ค่านี้
      // ไม่ตั้ง = Apex ใช้เทาเข้มของมันเอง (#373d3f) ซึ่งจมหายไปกับพื้นการ์ดบนธีมมืด
      foreColor: ink.value,
      // อนิเมชันคุมที่ prop `animate` ของ AppApexChart ไม่ใช่ที่นี่ - เขียนซ้ำสองที่แล้ว
      // จะงงว่าอันไหนชนะ (wrapper ทับค่าตรงนี้อยู่ดี)
      toolbar: {
        show: true, 
        offsetX: 10,
        offsetY: -20
      },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        // 55% ของช่อง (ช่องละ 38px) ≈ 21px - ใต้เพดาน 24px ที่แท่งเริ่มดูหนักเกินไป
        // ที่เหลือปล่อยเป็นช่องว่าง ไม่ถมให้เต็มช่อง
        barHeight: '55%',
        borderRadius: 4,
        // มนเฉพาะปลายที่เป็นข้อมูล ฐานยังชิดเส้นศูนย์แบบเหลี่ยม - ปลายมนสองข้างทำให้
        // จุดเริ่มของแท่งดูไม่ตรงกับศูนย์
        borderRadiusApplication: 'end' as const,
        dataLabels: { position: 'top' },
      },
    },
    // สีเดียวทั้งกราฟ: ข้อมูลอยู่ที่ความยาวแท่ง ไม่ใช่ที่สี
    // ★ ห้ามไล่สีตามอันดับ - พอกรองแผนกแล้วอันดับขยับ สีจะย้ายตัวเจ้าของ อ่านผิดทันที
    colors: [VALUE_COLOR],
    series: [{ name: 'มูลค่าคงเหลือ', data: values }],
    xaxis: {
      categories: rows.map((r, i) => `${i + 1}. ${labelOf(r)}`),
      // ★ ตรึงจุดเริ่มไว้ที่ 0 - ปล่อยให้ Apex เลือกเอง มันจะจัดสเกลสวย ๆ ที่เริ่มติดลบ
      //   (วัดจริง: ได้ขีดแรกที่ -43 ล้าน) ซึ่งทั้งกินที่และผิดความจริง มูลค่าสินทรัพย์
      //   ติดลบไม่ได้ และความยาวแท่งต้องเทียบกันได้จากศูนย์เท่านั้น
      min: 0,
      // เผื่อที่ด้านขวาให้ป้ายตัวเลขที่อยู่นอกปลายแท่ง ไม่งั้นแท่งอันดับ 1 จะยาวชนขอบ
      // แล้วป้ายของมันโดนตัด
      max: maxValue > 0 ? maxValue * 1.22 : undefined,
      tickAmount: 4,
      labels: {
        formatter: (value: string | number) => compactBaht(Number(value)),
        style: { colors: inkMuted.value, fontSize: '11px' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        // ตัดชื่อยาวด้วยความกว้าง ไม่ใช่จำนวนตัวอักษร - ชื่อบัญชีภาษาไทยยาวกว่าชื่อแผนกมาก
        // ("เครื่องจักร และอุปกรณ์โรงงาน-ผลิตเลคเกอร์บางปู") จึงเผื่อกว้างกว่าเดิม
        maxWidth: 210,
        style: { colors: ink.value, fontSize: '12px' },
      },
    },
    grid: {
      borderColor: grid.value,
      // เส้นตารางแนวตั้งอย่างเดียว เส้นทึบ 1px - แท่งนอนอ่านค่าตามแนวนอน
      // เส้นแนวนอนจะซ้อนทับตัวแท่งเปล่า ๆ
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
      padding: { left: 4, right: 8 },
    },
    dataLabels: {
      enabled: true,
      // ป้ายอยู่ "นอก" ปลายแท่งเสมอ ไม่ใช่ในแท่ง - ในแท่งจะพอดีเฉพาะแท่งยาว ๆ
      // ส่วนแท่งอันดับท้าย ๆ ตัวหนังสือจะล้นออกมาทับพื้นจนอ่านไม่ออก
      textAnchor: 'start' as const,
      offsetX: 6,
      formatter: (val: number) => compactBaht(val),
      style: { fontSize: '11px', fontWeight: 500, colors: [ink.value] },
    },
    legend: { show: false },
    // จอแคบ: ตัดชื่อบัญชีให้สั้นลง ไม่งั้นป้ายชื่อกินพื้นที่จนแท่งเหลือไม่กี่สิบพิกเซล
    // แล้วกราฟจะเลิกบอกอะไรเลย (ชื่อเต็มยังอยู่ใน tooltip และตารางข้างล่าง)
    responsive: [{ breakpoint: 640, options: { yaxis: { labels: { maxWidth: 110 } } } }],
    tooltip: {
      /**
       * หัว tooltip = ชื่อชั้นบัญชี **พร้อมรหัส** (ป้ายบนแกน y มีแต่ชื่อ เพราะที่จำกัด)
       *
       * ★ อ้างแถวด้วย dataPointIndex ไม่ใช่เทียบสตริงจากค่าที่ส่งมา — ค่าที่ส่งมาคือ
       *   category ที่มีเลขอันดับนำหน้าแล้ว ('1. เครื่องใช้...') และชั้นที่ยังไม่มีชื่อบัญชี
       *   ใช้รหัสเป็นชื่ออยู่แล้ว เทียบสตริงมีโอกาสจับคู่ผิดแถว
       * ★ คงเลขอันดับไว้ ให้ตรงกับที่เห็นบนแกนและในตารางใต้กราฟ
       */
      x: {
        formatter: (val: string, opts?: { dataPointIndex?: number }) => {
          const row = rows[opts?.dataPointIndex ?? -1]
          return row ? `${(opts?.dataPointIndex ?? 0) + 1}. ${fullLabel(row)}` : val
        },
      },
      // ตัวเลขเต็มบาทสตางค์อยู่ที่นี่ ป้ายบนกราฟเป็นแค่ตัวย่อ
      y: { formatter: (val: number) => `${formatMoney(val)} บาท` },
    },
    states: { active: { filter: { type: 'none' as const } } },
  }
})
</script>

<template>
  <div class="card min-w-0 border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 class="card-title text-base">มูลค่าสินทรัพย์ตามหมวดหมู่ทางบัญชี</h2>
          <p class="text-xs text-base-content/60">
            มูลค่าคงเหลือรวม (บาท) เรียงจากมากไปน้อย
          </p>
        </div>
        <span v-if="hiddenCount" class="text-xs text-base-content/60">
          แสดง {{ shown.length }} อันดับแรก จาก {{ ranked.length }} ชั้นบัญชีที่มีมูลค่า
        </span>
      </div>

      <p v-if="!shown.length" class="py-10 text-center text-sm text-base-content/50">
        ยังไม่มีชั้นบัญชีไหนที่มีมูลค่าทางบัญชีในขอบเขตนี้
      </p>

      <AppApexChart v-else :options="chartOptions" />
    </div>
  </div>
</template>
