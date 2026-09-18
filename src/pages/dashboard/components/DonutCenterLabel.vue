<script setup lang="ts">
// ป้ายกลางวงโดนัท - เขียนเป็น HTML ทับบนกราฟ ไม่ได้ใช้ donut.labels ของ Apex
//
// ── ★★ ทำไมต้องเขียนเอง (อ่านก่อนคิดจะย้ายกลับไปใช้ของ Apex)
//
// Apex วาดป้ายกลางวงเป็น SVG <text> ชิ้นเดียว และตอน hover มันเขียนทับด้วย
// `elLabel.textContent = name` (printInnerLabels ในซอร์สของ apexcharts ที่ลงไว้)
// ผลคือ **ไม่มีทางทำให้ขึ้นบรรทัดใหม่ได้เลย** ไม่ว่าจะส่ง formatter แบบไหน:
//
//   - '\n' ใน SVG <text> เป็นแค่ช่องว่าง ไม่ขึ้นบรรทัด
//   - คืนเป็น array ได้ 'a,b' เพราะ textContent แปลงเป็นสตริงตรง ๆ
//   - เส้นทาง <tspan> ของ drawText ใช้เฉพาะตอนวาดครั้งแรก ตอน hover ไม่ผ่านเลย
//
// พอย้ายมาเป็น HTML ก็ได้ตัดบรรทัด + line-clamp + … ของ CSS มาฟรี และคุมด้วยธีมเดียว
// กับการ์ดที่เหลือได้ (ของ Apex ต้องส่งสีเป็น hex เข้าไปทีละจุด)
//
// ── ★ pointer-events-none ห้ามถอด
//
// กล่องนี้ทับรูโดนัทอยู่ ถ้ามันรับเมาส์เมื่อไหร่ ก้อนพายข้างใต้จะไม่ถูก hover อีกเลย
// แล้วทั้ง tooltip และตัวป้ายนี้เองจะหยุดทำงานพร้อมกัน (ป้ายนี้อาศัย hover ของก้อนพาย)
//
// ── ★ ทำไม maxWidth เป็น px ไม่ใช่ %
//
// กล่องที่ทับอยู่กว้างเท่าการ์ด แต่วงโดนัทกว้างแค่ ~174px (Apex คิดจาก chart.height 260
// ไม่ใช่จากความกว้าง) เปอร์เซ็นต์จึงไม่ผูกกับรูจริง ค่าเริ่มต้น 118px มาจาก
// 174px × donut.size 72% = รู ~125px แล้วเผื่อขอบข้างละ ~3px
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** ชื่อก้อนที่ hover อยู่ - null = ไม่ได้ hover อะไร ให้แสดง totalLabel แทน */
    label: string | null
    /** ยอดของก้อนที่ hover อยู่ - null = แสดง totalValue */
    value: string | null
    totalLabel: string
    totalValue: string
    /** กว้างสุดของข้อความ (px) - ต้องไม่เกินรูโดนัท ดูคอมเมนต์หัวไฟล์ */
    maxWidth?: number
    /** จำนวนบรรทัดของชื่อก่อนจะตัดด้วย … */
    lines?: number
  }>(),
  { maxWidth: 118, lines: 3 },
)

const shownLabel = computed(() => props.label ?? props.totalLabel)
const shownValue = computed(() => props.value ?? props.totalValue)
</script>

<template>
  <!-- inset-0 + grid place-items-center = จุดกึ่งกลางของกล่องนี้ตรงกับจุดศูนย์กลางวง
       (Apex วางวงไว้กลางพื้นที่กราฟเมื่อไม่มี legend ซึ่งกราฟชุดนี้ปิด legend ไว้ทุกตัว) -->
  <div class="pointer-events-none absolute inset-0 grid place-items-center">
    <div class="text-center" :style="{ maxWidth: `${maxWidth}px` }">
      <!-- ★ ตัดบรรทัดด้วย style ไม่ใช่คลาส line-clamp-N ของ Tailwind - v4 สแกนชื่อคลาส
           จากซอร์สแบบสตริงตายตัว คลาสที่ประกอบจากตัวแปร (`line-clamp-${lines}`) จะไม่ถูก
           สร้าง CSS ให้เลย แล้วข้อความจะไม่ถูกตัดโดยไม่มีอะไรฟ้อง
           title ไว้ให้เอาเมาส์ชี้อ่านชื่อเต็มตอนโดน … ตัด -->
      <p
        class="overflow-hidden text-[13px] leading-tight text-base-content/70"
        :style="{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines }"
        :title="shownLabel"
      >
        {{ shownLabel }}
      </p>
      <p class="mt-0.5 text-xl font-semibold tabular-nums text-base-content">
        {{ shownValue }}
      </p>
    </div>
  </div>
</template>
