<script setup lang="ts">
// ปุ่มสลับกราฟบนการ์ดค่าเสื่อมรายบริษัท
//
// สองกราฟนี้ใช้ข้อมูลคนละก้อนและตอบคนละคำถาม แต่เป็นเรื่องเดียวกันคือ "ค่าเสื่อม" จึงอยู่
// การ์ดใบเดียวกันแทนที่จะกินพื้นที่สองใบ:
//
//   trend  ค่าเสื่อมสะสมปีนี้      มองย้อนหลัง - เปิดดูทุกเดือนตอนปิดงวด
//   runoff จังหวะการตัดค่าเสื่อม   มองไปข้างหน้า - ใช้ตอนวางแผนงบเปลี่ยนของ
//
// ★ ค่าตั้งต้นเป็น trend เพราะเป็นตัวที่ถูกเปิดดูบ่อยกว่ามาก (ตัวตั้งต้นอยู่ที่ DashboardPage
//   ไม่ใช่ที่นี่ - คอมโพเนนต์นี้ไม่ได้ถือสถานะเอง)
//
// ★★ ต้องถูกวางใน slot ชื่อ toggle ของ **ทั้งสองกราฟ** ที่ตำแหน่งเดียวกันเป๊ะ
//    ถ้าตำแหน่งไม่ตรงกัน ปุ่มจะขยับตอนกดสลับ แล้วเมาส์ที่ค้างอยู่ตรงนั้นจะกดซ้ำไม่โดน
// ★ ไม่ใช้ <input type="radio"> ของ daisyUI - เนื้อหาที่สลับอยู่คนละการ์ดกัน ไม่ใช่
//   tabpanel ที่อยู่ใต้แถบ tab เดียวกัน การประกาศ aria-controls จึงจะชี้ไปหาของที่ไม่มีอยู่
export type DepreciationChartMode = 'trend' | 'runoff'

defineProps<{ modelValue: DepreciationChartMode }>()
const emit = defineEmits<{ 'update:modelValue': [value: DepreciationChartMode] }>()

const TABS: { key: DepreciationChartMode; label: string }[] = [
  { key: 'trend', label: 'ค่าเสื่อมปีนี้' },
  { key: 'runoff', label: 'ค่าเสื่อมคงเหลือ' },
]
</script>

<template>
  <div role="tablist" class="tabs tabs-box tabs-xs shrink-0">
    <button v-for="tab in TABS" :key="tab.key" type="button" role="tab" class="tab"
      :class="{ 'tab-active font-medium': modelValue === tab.key }" :aria-selected="modelValue === tab.key"
      @click="emit('update:modelValue', tab.key)">
      {{ tab.label }}
    </button>
  </div>
</template>
