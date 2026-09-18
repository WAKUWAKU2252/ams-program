<script setup lang="ts">
// ส่วนต่างของตัวเลขบนการ์ด KPI เทียบกับ snapshot เดือนล่าสุด
//
// ★★ ไม่ใช้สีเขียว/แดง โดยตั้งใจ — และนี่คือเหตุผลที่สำคัญที่สุดของไฟล์นี้
//
// แดชบอร์ดทั่วไปทาเขียว = ดี แดง = แย่ ซึ่งใช้กับ Revenue/Conversion ได้ แต่กับตัวเลข
// บัญชีชุดนี้ความหมายกลับด้านหรือไม่มีความหมายเลย:
//   ค่าเสื่อมสะสมเพิ่มขึ้น = เรื่องปกติที่ต้องเกิดทุกงวด ไม่ใช่ข่าวร้าย
//   มูลค่าคงเหลือลดลง     = เรื่องปกติ ของเสื่อมตามเวลา ไม่ใช่ปัญหา
//   ราคาทุนเพิ่มขึ้น       = ซื้อของ จะดีหรือแย่ขึ้นกับว่าอยู่ในงบไหม ซึ่งหน้านี้ไม่รู้
//
// ถ้าทา NBV เป็นแดงทุกครั้งที่ลดลง หน้าจอจะขึ้นสัญญาณเตือนทุกวันโดยไม่มีอะไรผิดเลย
// คนจะเลิกมองภายในสัปดาห์เดียว แล้ววันที่มันลดผิดปกติจริงจะไม่มีใครสังเกต
//
// ★ ซ่อนตัวเองเมื่อไม่มีฐานให้เทียบ — ห้ามแสดง 0% เพราะ 0% อ่านว่า "ไม่เปลี่ยนเลย"
//   ซึ่งเป็นคนละคำตอบกับ "ยังไม่รู้" (ระบบเพิ่งเปิดใช้ / บริษัทเพิ่งเพิ่มเข้ามา)
//
// ★ เดือนที่เทียบอยู่ใน title ไม่ใช่แค่ "เดือนก่อน" — sync ไม่ได้วิ่งทุกเดือน ฐานอาจถอย
//   ไปไกลกว่านั้น ถ้าไม่บอกเดือนจริง ผู้ใช้จะตีความส่วนต่างผิดช่วงเวลา
import { computed } from 'vue'
import { formatMoney } from '@/shared/utils/money'
import { compactBaht } from './chart-theme'

const props = defineProps<{
  current: number | null
  previous: number | null
  /** money = ย่อเป็นล้าน/พันล้าน · count = จำนวนชิ้น */
  unit: 'money' | 'count'
  /** เดือนของ snapshot ที่เอามาเทียบ ('2026-08') */
  since: string
}>()

const diff = computed(() => {
  if (props.current === null || props.previous === null) return null
  return props.current - props.previous
})

/** ปัดก่อนตัดสินว่า "ไม่เปลี่ยน" — ผลต่างระดับสตางค์จากการปัดของ float ไม่ใช่การเปลี่ยนแปลง */
const isFlat = computed(() => diff.value !== null && Math.abs(diff.value) < 0.005)

const label = computed(() => {
  const d = diff.value
  if (d === null) return ''
  if (isFlat.value) return ''
  const sign = d > 0 ? '+' : '−'
  const size = Math.abs(d)
  return props.unit === 'money'
    ? `${sign}${compactBaht(size)}`
    : `${sign}${size.toLocaleString('th-TH')} ชิ้น`
})

const title = computed(() => {
  const d = diff.value
  if (d === null) return ''
  if (isFlat.value) return `ไม่เปลี่ยนจากข้อมูลเดือน ${props.since}`
  const exact = props.unit === 'money' ? `${formatMoney(Math.abs(d))} บาท` : `${Math.abs(d)} ชิ้น`
  return `${d > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${exact} เทียบกับข้อมูลเดือน ${props.since}`
})
</script>

<template>
  <span v-if="diff !== null" class="shrink-0 text-xs whitespace-nowrap tabular-nums text-base-content/70"
    :title="title">
    {{ label }}
  </span>
</template>
