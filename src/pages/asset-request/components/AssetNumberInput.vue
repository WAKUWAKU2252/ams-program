<script setup lang="ts">
// ช่องกรอกเลขสินทรัพย์ — บังคับตัวใหญ่ตั้งแต่ตอนพิมพ์ ไม่ใช่ไปแปลงเงียบ ๆ ตอนส่ง
//
// ทำไมต้องเห็นเป็นตัวใหญ่ระหว่างพิมพ์: backend normalize ให้อยู่แล้ว (transform hook)
// แต่ถ้าจอโชว์ 'com-775-26-050' แล้วบันทึกไปเป็น 'COM-775-26-050' ผู้ใช้จะไม่รู้ว่าระบบ
// แก้ค่าให้ — พอเห็นในตารางทีหลังเป็นคนละแบบกับที่พิมพ์ก็จะสงสัยว่าตัวเองกรอกผิดหรือเปล่า
// แปลงให้เห็นทันทีตั้งแต่ตัวอักษรแรกจึงไม่มีอะไรเซอร์ไพรส์
//
// regex กับความยาวมาจากไฟล์เดียวกับที่ backend ใช้บังคับจริง (alias ใน vite.config.ts)
// ไม่ได้ก๊อปมาไว้ที่นี่ — ถ้าวันหลังรูปแบบเลขเปลี่ยน แก้ที่ backend ที่เดียวแล้วจอนี้ตามเอง
import { computed } from 'vue'
import { ASSET_NUMBER_MAX_LENGTH, ASSET_NUMBER_REGEX } from '@contract/asset-number'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    placeholder?: string
    /** โชว์คำเตือนรูปแบบเฉพาะตอนที่ผู้ใช้พิมพ์ค้างไว้ ไม่ใช่ตั้งแต่ช่องยังว่าง */
    showHint?: boolean
  }>(),
  { disabled: false, placeholder: 'COM-775-26-050', showHint: true },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'enter'): void
}>()

const isValid = computed(() => ASSET_NUMBER_REGEX.test(props.modelValue))
const showError = computed(() => props.showHint && props.modelValue.length > 0 && !isValid.value)

// แปลงตอน input ไม่ใช่ตอน blur — ผู้ใช้ต้องเห็นตัวใหญ่ทันทีที่พิมพ์
// ความยาวไม่เปลี่ยนหลัง toUpperCase ตำแหน่ง cursor จึงไม่กระโดด
function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const upper = el.value.toUpperCase()
  // เขียนกลับลง element ด้วย เพราะ Vue จะไม่ re-render ถ้า modelValue เดิมเท่ากับค่าใหม่
  // (พิมพ์ 'c' ได้ 'C' → พิมพ์ 'c' อีกที ถ้าไม่เซ็ตตรงนี้จอจะค้างเป็น 'c' ตัวเล็ก)
  if (el.value !== upper) el.value = upper
  emit('update:modelValue', upper)
}

// trim ตอน blur ไม่ใช่ตอน input — ตัดช่องว่างระหว่างพิมพ์ทำให้พิมพ์ต่อไม่ได้
// (ที่ต้อง trim เพราะเลขมักถูก copy มาจาก Excel/อีเมลซึ่งติดช่องว่างหัวท้ายมาด้วย)
function onBlur() {
  const trimmed = props.modelValue.trim()
  if (trimmed !== props.modelValue) emit('update:modelValue', trimmed)
}
</script>

<template>
  <div class="w-full backdrop-blur-sm pr-4">
    <label class="input w-full" >
      <input
        type="text"
        class="grow font-mono uppercase tracking-wider"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder"
        :maxlength="ASSET_NUMBER_MAX_LENGTH"
        inputmode="text"
        @input="onInput"
        @blur="onBlur"
        @keyup.enter="emit('enter')"
      />
    </label>

    <!-- <p v-if="!showError" class="mt-1 text-xs text-error">
      รูปแบบต้องเป็น XXX-###-##-### เช่น COM-775-26-001
    </p> -->
  </div>
</template>
