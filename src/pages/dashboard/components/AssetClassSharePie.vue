<script setup lang="ts">
// สัดส่วนจำนวนสินทรัพย์ตามชั้นบัญชี (โดนัท)
//
// ★ ใช้สองที่บนหน้า Dashboard ด้วยการ์ดใบเดียวกัน - มุมมอง "เลือกบริษัทแล้ว" กับ
//   "เลือกแผนกแล้ว" ต่างกันแค่ prop `departmentName` ส่วนตัวเลขถูก backend กรองตาม
//   ขอบเขตมาให้แล้วทั้งคู่ (byAssetClass รับ scope เดียวกับ totals - ดู summarizeByAssetClass)
//
// ★ มุมมองแผนกเคยเป็นโดนัทคนละใบที่วัดด้วย "มูลค่าคงเหลือ" แทนจำนวนชิ้น โครงเหมือนกัน
//   เกือบทั้งไฟล์ - ยุบมาใช้ใบนี้ใบเดียวเมื่อ 2026-09-16 ถ้าวันหลังอยากได้แกนเงินกลับมา
//   ให้เพิ่มเป็น prop ที่สลับ metric อย่าแตกไฟล์ใหม่
//
// ★ แกนนี้คือ asset.assetClass รหัสเต็ม เช่น '1216301-1-220' ไม่ใช่ category ที่เก็บแค่
//   7 หลักแรก - รายงานของ finance แบ่งด้วยรหัสเต็ม กราฟนี้จึงเทียบกับรายงานได้ตรง ๆ
//
// ★ กราฟนี้นับ "ชิ้น" ไม่ใช่ "เงิน" - เงินเป็นหน้าที่ของกราฟแท่งอันดับที่อยู่ข้าง ๆ
//   สองอันนี้ตอบคนละคำถามและมักได้อันดับไม่เหมือนกัน (ชั้นที่มีของเยอะสุดไม่จำเป็นต้อง
//   มีมูลค่าสูงสุด - เครื่องใช้สำนักงานมี 928 ชิ้นแต่มูลค่ารวมน้อยกว่าที่ดิน 4 ชิ้น)
//
// ★ ตัดที่ 5 ชั้น + "อื่น ๆ" - วงกลมที่มีเกิน 6 ก้อนคนอ่านเทียบขนาดไม่ออกแล้ว และของจริง
//   UBA มี 54 ชั้น ถ้าโยนเข้าไปหมดจะได้เศษเสี้ยวบาง ๆ เรียงกันเป็นห้าสิบชิ้น
//
// ★ ป้ายใช้ชื่อบัญชีถ้ามี ไม่มีก็ใช้รหัสดิบ - ห้ามเขียนว่า "ไม่ระบุ" เมื่อชื่อยังไม่ได้ import
//   รหัสดิบอ่านออกและเทียบกับรายงานได้ ส่วน "ไม่ระบุ" ทำให้ดูเหมือนข้อมูลหาย
import { computed, ref } from 'vue'
import AppApexChart from '@/pages/dashboard/components/AppApexChart.vue'
import DonutCenterLabel from '@/pages/dashboard/components/DonutCenterLabel.vue'
import type { AssetClassSummary } from '@/shared/services/dashboard.service'
import { OTHER_COLOR, ink, surface, categoryColor } from './chart-theme'

const props = defineProps<{
  rows: AssetClassSummary[]
  /**
   * ชื่อแผนกที่กำลังดู - โชว์ต่อท้ายคำอธิบายใต้หัวข้อ
   *
   * ★ ไม่ส่ง = มุมมอง "ทั้งบริษัท" ซึ่งไม่ต้องบอกแผนก การ์ดใบเดียวกันนี้ถูกใช้สองที่
   *   บนหน้า Dashboard (เลือกบริษัทแล้ว / เลือกแผนกแล้ว) ต่างกันแค่บรรทัดนี้
   */
  departmentName?: string | null
}>()

/** จำนวนชั้นที่แสดงเป็นก้อนของตัวเอง ที่เหลือยุบเป็น "อื่น ๆ" */
const MAX_SLICES = 5

interface Slice {
  label: string
  /**
   * รหัสชั้นบัญชีเต็ม เช่น '1216401-1-220' — null เมื่อไม่มีรหัสให้แสดง
   * (ก้อน "อื่น ๆ" ที่ยุบมาหลายชั้น และแถวที่ไม่มีชั้นบัญชีเลย)
   *
   * ★ แยกจาก label เพราะ label เป็น "ชื่อบัญชีถ้ามี" ซึ่งเป็นคนละอย่างกับรหัส
   *   legend ต้องโชว์ทั้งคู่ — รหัสคือตัวที่เอาไปเทียบกับรายงานของ finance ได้
   */
  code: string | null
  value: number
  color: string
}

/** ชื่อที่จะขึ้นบนป้าย - ชื่อบัญชี > รหัสดิบ > แถวที่ไม่มีชั้นบัญชีเลย */
const labelOf = (row: AssetClassSummary): string =>
  row.accountName ?? row.assetClass ?? 'ยังไม่ระบุชั้นบัญชี'

/**
 * โชว์รหัสนำหน้าชื่อไหม — ★ ไม่โชว์เมื่อ label เป็นรหัสอยู่แล้ว
 *
 * ชั้นที่ยังไม่ได้ import ชื่อบัญชี (UBP 4 รหัส · MIG 7 · UBA 10) จะตกมาใช้รหัสดิบเป็น
 * label อยู่แล้ว ถ้าเติมรหัสนำหน้าอีกจะได้ "1216301-1-228 1216301-1-228" ซ้ำกันสองรอบ
 */
const showCode = (s: Slice): boolean => s.code !== null && s.code !== s.label

/** ข้อความเต็มตอนเอาเมาส์ชี้ - ต้องมีทั้งรหัสและชื่อ เพราะบรรทัดบนจอถูก truncate */
const fullLabel = (s: Slice): string => (showCode(s) ? `${s.code}  ${s.label}` : s.label)

/** เอาเฉพาะชั้นที่มีของจริง - ชั้นที่ไม่มีสินทรัพย์ไม่มีสัดส่วนให้แบ่ง */
const ranked = computed(() =>
  props.rows.filter((r) => r.assets > 0).sort((a, b) => b.assets - a.assets),
)

const slices = computed<Slice[]>(() => {
  const rows = ranked.value
  const out: Slice[] = rows.slice(0, MAX_SLICES).map((row, i) => ({
    label: labelOf(row),
    code: row.assetClass,
    value: row.assets,
    color: categoryColor(i),
  }))

  const rest = rows.slice(MAX_SLICES)
  if (rest.length) {
    out.push({
      // บอกด้วยว่ายุบมาจากกี่ชั้น ไม่งั้นก้อนเทาก้อนนี้จะดูเหมือนชั้นหนึ่งชื่อ "อื่น ๆ"
      label: `อื่น ๆ (${rest.length} ชั้นบัญชี)`,
      // ยุบมาหลายรหัส จึงไม่มีรหัสเดียวที่พูดแทนได้
      code: null,
      value: rest.reduce((sum, r) => sum + r.assets, 0),
      color: OTHER_COLOR,
    })
  }
  return out
})

const total = computed(() => slices.value.reduce((sum, s) => sum + s.value, 0))

const percent = (value: number) => (total.value === 0 ? 0 : (value / total.value) * 100)

/**
 * ก้อนที่เมาส์ชี้อยู่ - null = ไม่ได้ชี้อะไร (ป้ายกลางวงกลับไปเป็นยอดรวม)
 *
 * ★ chartOptions ห้ามอ่านค่านี้เด็ดขาด ให้ handler เป็นฝ่าย "เขียน" อย่างเดียว
 *   ถ้า computed ไปอ่าน มันจะคำนวณใหม่ทุกครั้งที่เมาส์ขยับ แล้ว AppApexChart จะสั่ง
 *   updateOptions ตามไปด้วย = วาดกราฟใหม่ทั้งวงทุกครั้งที่ hover
 */
const hovered = ref<number | null>(null)

const centerLabel = computed(() =>
  hovered.value === null ? null : (slices.value[hovered.value]?.label ?? null),
)
const centerValue = computed(() => {
  const slice = hovered.value === null ? null : slices.value[hovered.value]
  return slice ? `${slice.value.toLocaleString('th-TH')} ชิ้น` : null
})
const centerTotal = computed(() => `${total.value.toLocaleString('th-TH')} ชิ้น`)

const chartOptions = computed(() => {
  const data = slices.value

  return {
    chart: {
      type: 'donut' as const,
      height: 260,
      fontFamily: 'inherit',
      foreColor: ink.value,
      toolbar: { show: false },
      // ป้ายกลางวงเป็น HTML ของเราเอง (DonutCenterLabel) จึงต้องรู้ว่าเมาส์ชี้ก้อนไหน
      // ★ Apex ไม่ยิง dataPointMouseLeave ให้ตอนเมาส์ออกจากกราฟทั้งอัน - มันยิงเฉพาะตอน
      //   ออกจาก "ก้อน" ซึ่งเกิดตอนย้ายไปก้อนข้าง ๆ ด้วย ถ้าพึ่งอย่างเดียวป้ายจะค้างชื่อเก่า
      //   ค้างไว้หลังเมาส์ออกจากการ์ดไปแล้ว → เคลียร์ที่ @mouseleave ของกล่องครอบอีกชั้น
      events: {
        dataPointMouseEnter: (_e: MouseEvent, _ctx?: unknown, cfg?: { dataPointIndex?: number }) => {
          hovered.value = cfg?.dataPointIndex ?? null
        },
        dataPointMouseLeave: () => {
          hovered.value = null
        },
      },
    },
    labels: data.map((s) => s.label),
    series: data.map((s) => s.value),
    colors: data.map((s) => s.color),
    stroke: { width: 2, colors: [surface.value] },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '72%',
          // ★ ปิดป้ายของ Apex ทั้งชุด - ใช้ DonutCenterLabel วางทับแทน เพราะป้ายของ Apex
          //   เป็น SVG <text> ชิ้นเดียวที่ขึ้นบรรทัดใหม่ไม่ได้ (เหตุผลเต็มอยู่ในไฟล์นั้น)
          //   เปิดทิ้งไว้ไม่ได้ ไม่งั้นจะมีป้ายสองชุดซ้อนกัน
          labels: { show: false },
        },
      },
    },
    tooltip: {
      y: {
        /**
         * ── ★ หัว tooltip มีรหัสชั้นบัญชีด้วย ไม่ใช่แค่ชื่อ
         *
         * ★★ ห้ามเอารหัสไปใส่ใน `labels` ข้างบนแทน — `labels` ป้อนทั้ง tooltip **และ**
         *    ป้ายกลางวง (ผ่าน centerLabel) รหัส 13 ตัวจะไปกินที่ในรูโดนัทที่กว้าง ~118px
         *    แล้วชื่อจะโดน line-clamp ตัดเร็วขึ้น ที่นี่คือจุดเดียวที่ใส่ได้โดยไม่กระทบรูวง
         *
         * ★ อ้างก้อนด้วย seriesIndex ไม่ใช่เทียบสตริงจากชื่อที่ส่งมา — ชั้นที่ยังไม่มีชื่อ
         *   บัญชีใช้รหัสเป็นชื่ออยู่แล้ว เทียบสตริงจะจับคู่ผิดก้อนได้
         */
        title: {
          formatter: (name: string, opts?: { seriesIndex?: number }) => {
            const slice = data[opts?.seriesIndex ?? -1]
            return slice ? `${fullLabel(slice)}:` : `${name}:`
          },
        },
        formatter: (val: number) =>
          `${val.toLocaleString('th-TH')} ชิ้น (${percent(val).toFixed(1)}%)`,
      },
    },
    states: { active: { filter: { type: 'none' as const } } },
  }
})
</script>

<template>
  <div class="card min-w-0 border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3 text-left">
      <div>
        <h2 class="card-title text-base">สัดส่วนสินทรัพย์ตามหมวดหมู่ทางบัญชี</h2>
        <p class="text-xs text-base-content/60">
          นับเป็นจำนวนชิ้นในทะเบียน<template v-if="departmentName"> · {{ departmentName }}</template>
        </p>
      </div>

      <p v-if="!slices.length" class="py-10 text-center text-sm text-base-content/50">
        ยังไม่มีสินทรัพย์ในขอบเขตนี้
      </p>

      <template v-else>
        <!-- relative = กรอบอ้างอิงของป้ายกลางวง · mouseleave เคลียร์ค้าง (ดูคอมเมนต์ที่ events) -->
        <div class="relative" @mouseleave="hovered = null">
          <AppApexChart :options="chartOptions" />
          <DonutCenterLabel
            :label="centerLabel"
            :value="centerValue"
            total-label="ทั้งหมด"
            :total-value="centerTotal"
          />
        </div>

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
              <!-- รหัสชั้นบัญชีนำหน้าชื่อ - รหัสคือตัวที่เอาไปเทียบกับรายงานของ finance ได้
                   ส่วนชื่อคืออันที่คนอ่านออก ต้องมีทั้งคู่ · โทนจางกันไม่ให้แย่งสายตากับชื่อ
                   ★ title มีข้อความเต็มเสมอ เพราะบรรทัดนี้ถูก truncate เมื่อการ์ดแคบ -->
              <span class="truncate" :title="fullLabel(slice)">
                {{ slice.label }}
              </span>
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
