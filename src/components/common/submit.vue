<script setup lang="ts">
// editable = false → read-only (โดน lock/ส่งไปแล้ว) disable ปุ่ม submit
withDefaults(defineProps<{ editable?: boolean }>(), { editable: true })
defineEmits<{ (e: 'cancel'): void; (e: 'submit'): void }>()
</script>

<template>
  <div class="flex flex-row justify-end mt-[20px] px-5 gap-3">
    <button
      type="button"
      class="flex items-center
      bg-[var(--third-color)] gap-2 px-8 py-3 rounded-[16px]
      text-[var(--mainbackground)] font-label-md
      text-sm font-semibold uppercase shadow-lg
      transform transition-all duration-200
      hover:-translate-y-0.5 hover:opacity-90"
      @click="$emit('cancel')"
    >
      cancel
    </button>

    <button
      type="button"
      :disabled="!editable"
      class="flex items-center
      bg-[var(--button-active)] gap-2 px-12 py-3 rounded-[16px]
      text-[var(--mainbackground)] font-label-md
      text-sm font-semibold uppercase shadow-lg
      transform transition-all duration-200
      hover:-translate-y-0.5 hover:opacity-90
      disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      @click="$emit('submit')"
    >
      submit
    </button>
  </div>
</template>
