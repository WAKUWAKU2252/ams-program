<script setup lang="ts">
// ช่องเลือกวันที่ - ปุ่มหน้าตาเหมือน input เปิด popover ที่มีปฏิทิน Cally ข้างใน
//
// ทำไมไม่ใช้ <input type="date"> ตรง ๆ: หน้าตาปฏิทินเป็นของ browser คุมธีมไม่ได้เลย
// (ดำสนิทบนธีมสว่าง / ต่างกันทุก browser) - Cally + class .cally ของ daisyUI ใช้สีจากธีมเรา
//
// ค่าที่รับ-ส่งเป็น 'YYYY-MM-DD' ตรงกับที่ Cally ใช้และตรงกับที่ backend รับ ไม่ต้องแปลงกลางทาง
import { computed, useId } from 'vue'
import { Icon } from '@iconify/vue'
// side-effect import: ลงทะเบียน custom element <calendar-date> / <calendar-month> ให้ browser
// อยู่ที่นี่ที่เดียว ใครใช้ picker ตัวนี้ก็ได้ปฏิทินไปด้วย ไม่ต้อง import ซ้ำในทุกหน้า
import 'cally'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    min?: string
    max?: string
  }>(),
  { placeholder: 'เลือกวันที่', disabled: false, min: undefined, max: undefined },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const uid = useId()
const popoverId = `datepicker-${uid}`
const anchorName = `--datepicker-${uid}`

const display = computed(() => {
  if (!props.modelValue) return ''
  const [y, m, d] = props.modelValue.split('-')
  return `${d}/${m}/${y}`
})

function onChange(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

function clear() {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="w-full">
    <button
      type="button"
      class="input w-full cursor-pointer text-left"
      :popovertarget="popoverId"
      :disabled="disabled"
      :style="{ anchorName }"
    >
      <Icon icon="lucide:calendar" class="opacity-60" />
      <span class="grow" :class="{ 'text-base-content/40': !display }">
        {{ display || placeholder }}
      </span>
      <span
        v-if="display && !disabled"
        role="button"
        tabindex="0"
        class="btn btn-ghost btn-xs btn-square"
        aria-label="ล้างวันที่"
        @click.stop="clear"
        @keydown.enter.stop="clear"
      >
        <Icon icon="lucide:x" />
      </span>
    </button>

    <div
      :id="popoverId"
      popover
      class="dropdown bg-base-100 rounded-box shadow-lg"
      :style="{ positionAnchor: anchorName }"
    >
      <calendar-date
        class="cally p-2"
        :value="modelValue"
        :min="min"
        :max="max"
        locale="th-TH"
        @change="onChange"
      >
        <Icon icon="lucide:chevron-left" slot="previous" class="size-4" />
        <Icon icon="lucide:chevron-right" slot="next" class="size-4" />
        <calendar-month />
      </calendar-date>
    </div>
  </div>
</template>
