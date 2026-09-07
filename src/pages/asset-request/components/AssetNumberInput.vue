<script setup lang="ts">
// ช่องกรอกเลขสินทรัพย์ - บังคับตัวใหญ่ตั้งแต่ตอนพิมพ์ ไม่ใช่ไปแปลงเงียบ ๆ ตอนส่ง
//
// ทำไมต้องเห็นเป็นตัวใหญ่ระหว่างพิมพ์: backend normalize ให้อยู่แล้ว (transform hook)
// แต่ถ้าจอโชว์ 'com-775-26-050' แล้วบันทึกไปเป็น 'COM-775-26-050' ผู้ใช้จะไม่รู้ว่าระบบ
// แก้ค่าให้ - พอเห็นในตารางทีหลังเป็นคนละแบบกับที่พิมพ์ก็จะสงสัยว่าตัวเองกรอกผิดหรือเปล่า
// แปลงให้เห็นทันทีตั้งแต่ตัวอักษรแรกจึงไม่มีอะไรเซอร์ไพรส์
//
// ── ไม่ตรวจรูปแบบแล้ว (ถอด ASSET_NUMBER_REGEX ออก) ──────────────────────────
//
// เดิมช่องนี้กันไม่ให้กดบันทึกจนกว่าค่าจะเข้า XXX-###-##-<3-7 ตัว> ซึ่งเป็น "สคีมาที่บริษัท
// ตั้งใจ" ไม่ใช่รูปแบบที่ SAP ออกให้จริงทั้งหมด - ของจริงมีเลขที่ใช้จุด/ทับ และเลขที่คนละ
// สคีมาไปเลย (ดู @common/asset-number) พอบัญชีเจอเลขพวกนั้นก็พิมพ์เข้าระบบไม่ได้เลย
//
// ตอนนี้ด่านเดียวที่เหลือคือ "ต้องไม่ว่าง" กับความยาวของคอลัมน์ ส่วนความถูกต้องของเลข
// เป็นเรื่องที่บัญชีตัดสินจากเอกสารตรงหน้า ไม่ใช่สิ่งที่ regex เดาแทนได้
//
// maxlength ยึดความกว้างคอลัมน์ asset.assetNumber (varchar(100)) เท่ากับ assignNumberBody
const MAX_LENGTH = 100

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    placeholder?: string
  }>(),
  { disabled: false, placeholder: 'COM-775-26-050' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'enter'): void
}>()

// แปลงตอน input ไม่ใช่ตอน blur - ผู้ใช้ต้องเห็นตัวใหญ่ทันทีที่พิมพ์
// ความยาวไม่เปลี่ยนหลัง toUpperCase ตำแหน่ง cursor จึงไม่กระโดด
function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const upper = el.value.toUpperCase()
  // เขียนกลับลง element ด้วย เพราะ Vue จะไม่ re-render ถ้า modelValue เดิมเท่ากับค่าใหม่
  // (พิมพ์ 'c' ได้ 'C' → พิมพ์ 'c' อีกที ถ้าไม่เซ็ตตรงนี้จอจะค้างเป็น 'c' ตัวเล็ก)
  if (el.value !== upper) el.value = upper
  emit('update:modelValue', upper)
}

// trim ตอน blur ไม่ใช่ตอน input - ตัดช่องว่างระหว่างพิมพ์ทำให้พิมพ์ต่อไม่ได้
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
        :maxlength="MAX_LENGTH"
        inputmode="text"
        @input="onInput"
        @blur="onBlur"
        @keyup.enter="emit('enter')"
      />
    </label>
  </div>
</template>
