<script setup lang="ts">
// องค์ประกอบมูลค่าสินทรัพย์รายบริษัท (แท่งนอนซ้อน) - ใช้เฉพาะตอนดู "ทุกบริษัท"
//
// หนึ่งบริษัท = หนึ่งแท่ง แบ่งเป็น  ค่าเสื่อมสะสม + มูลค่าคงเหลือ = ราคาทุน
//
// ── ตอบคำถามที่กราฟอื่นบนหน้านี้ไม่ได้ตอบตอนดูทุกบริษัท ────────────────────
//
// โดนัทข้าง ๆ ตอบ "บริษัทไหนของเยอะ" (นับชิ้น) ส่วนอันนี้ตอบสองอย่างพร้อมกัน:
// "บริษัทไหนของแพง" (ความยาวแท่งทั้งแท่ง) และ "บริษัทไหนของเก่า" (สัดส่วนเทาต่อทั้งแท่ง)
// สองคำถามหลังตอบจากยอดรวมทั้งบริษัทไม่ได้ ต้องเห็นการแบ่งถึงจะอ่านออก
//
// ★ ทำไมไม่เอาแท่งอันดับรายแผนกมาใช้ต่อตอนดูทุกบริษัท
//
//   ชื่อแผนกซ้ำข้ามบริษัทจริง 55 ชื่อ (บางชื่อครบทั้งสามบริษัท) แท่งที่เขียนแต่ชื่อแผนก
//   จึงกำกวมโดยตัวมันเอง - วัด 2026-09-07: อันดับ 7 กับ 8 คือ 'Supply Chain Mangement ( SCM )'
//   ของ UBA (฿2.19M) กับ 'Supply Chain Mangement' ของ MIG (฿2.17M) ซึ่งแยกกันแทบไม่ออก
//   และ 8 ใน 10 อันดับเป็นของ UBA อยู่แล้ว (UBA ถือ 89% ของมูลค่าทั้งทะเบียน)
//   = เอาคำถามระดับแผนกมาตอบในมุมมองระดับบริษัท ซึ่งอ่านแล้วไม่ได้อะไร
//
//   กราฟรายแผนกยังอยู่ครบ แค่ย้ายไปโผล่ตอนเลือกบริษัทเดียว ซึ่งไม่มีชื่อซ้ำโดยโครงสร้าง
//
// ★ สีต้องตรงกับ DepreciationSplitDonut เป๊ะ (เทา = ค่าเสื่อมสะสม / น้ำเงิน = มูลค่าคงเหลือ)
//   สองกราฟนี้ไม่เคยโผล่พร้อมกัน (คนละ scope) แต่ผู้ใช้คนเดียวกันเห็นทั้งคู่ในเซสชันเดียว
//   สอนความหมายสีคนละอย่างเมื่อไหร่คืออ่านผิดข้ามหน้า
import { computed } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import type { CompanySummary } from '@/shared/services/dashboard.service'
import { formatMoney } from '@/shared/utils/money'
import { GRID, INK, INK_MUTED, OTHER_COLOR, SURFACE, VALUE_COLOR, compactBaht } from './chart-theme'

// กราฟนี้ถูกวาดเฉพาะตอน 'ทุกบริษัท + ทุกแผนก' ยอดจึงเป็นของทั้งบริษัทเสมอ
// (เหตุผลเต็มที่ CompanySharePie)
const props = defineProps<{ rows: CompanySummary[] }>()

/**
 * เอาเฉพาะบริษัทที่มีตัวเลขบัญชีจริง เรียงตามราคาทุนจากมากไปน้อย
 *
 * ★ ตัดบริษัทที่ราคาทุนเป็น 0 หรือ null ออก - แท่งยาวศูนย์ไม่ได้บอกอะไรแต่กินที่
 *   และทำให้แท่งที่มีค่าจริงเตี้ยลง ความต่างระหว่าง "ไม่มีของ" กับ "มีของแต่ SAP ยังไม่ส่ง
 *   ตัวเลขมา" อ่านได้จากตารางสรุปข้างล่างซึ่งแยก '-' กับ '0' ไว้แล้ว
 *
 * ★ เรียงด้วยราคาทุน ไม่ใช่มูลค่าคงเหลือ - ความยาวแท่งคือราคาทุน เรียงด้วยอย่างอื่น
 *   แล้วแท่งจะยาวสลับกันขึ้นลงจนอ่านไม่ออกว่าเรียงตามอะไร
 */
const ranked = computed(() =>
  props.rows
    .map((r) => {
      const accumulated = r.accumulatedDepreciation ?? 0
      const netBookValue = r.netBookValue ?? 0
      return {
        label: r.companyName || r.companyCode,
        accumulated,
        netBookValue,
        // ★ บวกเอง ไม่ใช้ r.bookedCost - ราคาทุน = ค่าเสื่อมสะสม + มูลค่าคงเหลือ เสมอ
        //   เพราะ backend คิดสามก้อนนี้จากชิ้นชุดเดียวกัน (กรอง VALUED เหมือนกันหมด)
        //   ใช้ bookedCost ตรง ๆ แล้วมีชิ้นไหนหลุดกรอง ผลรวมของสองส่วนจะไม่เท่าความยาวแท่ง
        //   ซึ่งเป็นบั๊กที่มองไม่เห็นจนกว่าจะมีคนเอาไปกระทบยอด
        total: accumulated + netBookValue,
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total),
)

/** สัดส่วนที่ตัดค่าเสื่อมไปแล้ว - ตัวเลขที่ตอบ "ของเก่าแค่ไหน" ตรงที่สุด */
const usedPercent = (row: { accumulated: number; total: number }) =>
  row.total === 0 ? 0 : (row.accumulated / row.total) * 100

const chartOptions = computed(() => {
  const rows = ranked.value

  return {
    chart: {
      type: 'bar' as const,
      stacked: true,
      // สูงตามจำนวนแท่ง ไม่ใช่ความสูงคงที่ - สามบริษัทกับบริษัทเดียวต้องไม่ได้แท่งอ้วนเท่ากัน
      height: Math.max(200, rows.length * 56 + 72),
      fontFamily: 'inherit',
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '58%',
        borderRadius: 4,
        borderRadiusApplication: 'end' as const,
        dataLabels: {
          /**
           * ป้าย "ตัดแล้ว N%" ต่อท้ายแท่ง - ตัวเลขที่ตอบ "ของเก่าแค่ไหน" ตรงที่สุด
           *
           * ★ ใช้ dataLabels.total ของแท่งซ้อน ไม่ใช่ dataLabels ปกติ - ตัวปกติจะพิมพ์
           *   ทับ "ในแต่ละส่วน" ซึ่งส่วนที่สั้น (MIG ตัดไป 2%) จะเบียดจนอ่านไม่ออก
           *   ส่วน total วางไว้นอกแท่งตรงปลายเสมอ ไม่ว่าสัดส่วนข้างในจะเป็นเท่าไร
           *
           * ★ ใช้ opts.dataPointIndex ไม่ใช่ค่า val ที่ส่งมา - val คือผลรวมของแท่ง
           *   (ราคาทุน) ซึ่งเอามาคิดเปอร์เซ็นต์เองไม่ได้ ต้องย้อนไปหาแถวเดิมที่มี
           *   ค่าเสื่อมสะสมแยกไว้ ลำดับตรงกับ series เพราะวาดจาก ranked ชุดเดียวกัน
           */
          total: {
            enabled: true,
            offsetX: 4,
            style: { color: INK_MUTED, fontSize: '12px', fontWeight: 500 },
            formatter: (_val?: string, opts?: { dataPointIndex: number }) => {
              const row = rows[opts?.dataPointIndex ?? -1]
              return row ? `ตัดแล้ว ${usedPercent(row).toFixed(0)}%` : ''
            },
          },
        },
      },
    },
    // ★ ลำดับใน series คือลำดับการซ้อนจากซ้ายไปขวา - ค่าเสื่อมสะสมอยู่ซ้าย (ส่วนที่หมดไปแล้ว)
    //   มูลค่าคงเหลืออยู่ขวา (ส่วนที่ยังเหลือ) อ่านเป็นเส้นเวลาจากซ้ายไปขวาได้ตรงตัว
    series: [
      { name: 'ค่าเสื่อมสะสม', data: rows.map((r) => r.accumulated) },
      { name: 'มูลค่าคงเหลือ', data: rows.map((r) => r.netBookValue) },
    ],
    colors: [OTHER_COLOR, VALUE_COLOR],
    stroke: { width: 2, colors: [SURFACE] },
    xaxis: {
      categories: rows.map((r) => r.label),
      labels: { formatter: (val: string) => compactBaht(Number(val)), style: { colors: INK_MUTED } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: INK, fontSize: '13px' } } },
    // padding.right เผื่อป้าย "ตัดแล้ว N%" ที่ยื่นออกนอกปลายแท่ง - ไม่เผื่อแล้วแท่งที่ยาวสุด
    // (บริษัทอันดับหนึ่ง) จะโดนขอบกราฟตัดป้ายหายไปครึ่งคำ
    grid: {
      borderColor: GRID,
      padding: { right: 72 },
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    // ไม่พิมพ์ตัวเลขทับบนแท่ง - ส่วนที่สั้น (บริษัทเล็ก) จะเบียดจนอ่านไม่ออก
    // ตัวเลขเต็มเป็นบาทอยู่ที่ tooltip และตารางสรุปข้างล่าง ส่วนปลายแท่งใช้บอก % ที่ตัดแล้ว
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      shared: true,
      intersect: false,
      y: { formatter: (val: number) => `${formatMoney(val)} บาท` },
    },
    states: { active: { filter: { type: 'none' as const } } },
  }
})

</script>

<template>
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <div>
        <h2 class="card-title text-base">องค์ประกอบมูลค่าสินทรัพย์รายบริษัท</h2>
        <p class="text-xs text-base-content/60">
          แสดงรายละเอียดองค์ประกอบและสัดส่วนมูลค่าสินทรัพย์ของแต่ละบริษัท
        </p>
      </div>

      <p v-if="!ranked.length" class="py-10 text-center text-sm text-base-content/50">
        ยังไม่มีสินทรัพย์ที่มีตัวเลขบัญชีในขอบเขตนี้
      </p>

      <template v-else>
        <!-- legend เขียนเอง วางไว้บนกราฟ - ต้องอ่านความหมายสีได้ก่อนดูแท่ง
             (สีในชุดนี้ห้ามเป็นตัวบอกความหมายเพียงอย่างเดียว - ดู chart-theme) -->
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/70">
          <li class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" :style="{ backgroundColor: OTHER_COLOR }" />
            ค่าเสื่อมสะสม
          </li>
          <li class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" :style="{ backgroundColor: VALUE_COLOR }" />
            มูลค่าคงเหลือ
          </li>
        </ul>

        <!-- ★ % ที่ตัดไปแล้วอยู่ปลายแท่ง ไม่ใช่ลิสต์ใต้กราฟ - ตัวเลขอยู่ติดกับสิ่งที่มันอธิบาย
             ตัวเลขเต็มเป็นบาทยังหาได้จาก tooltip และตารางสรุปข้างล่าง -->
        <AppApexChart :options="chartOptions" />

        <!-- ★ ต้องเขียนไว้เสมอ - ยอดพวกนี้ไม่ได้นับทุกชิ้น ชิ้นที่ SAP ให้ตัวเลขมาไม่ครบ
             ถูกกันออก ถ้าไม่บอก คนจะเอาไปเทียบกับจำนวนชิ้นในโดนัทข้าง ๆ แล้วคิดว่าข้อมูลหาย -->

      </template>
    </div>
  </div>
</template>
