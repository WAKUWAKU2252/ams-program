<script setup lang="ts">
// editable = false → read-only (โดน lock/ส่งไปแล้ว) disable ปุ่ม submit
withDefaults(defineProps<{ editable?: boolean }>(), { editable: true })
defineEmits<{ (e: 'cancel'): void; (e: 'submit'): void }>()
</script>

<template>
  <div class="mt-5 flex flex-row justify-end gap-3 px-5">
    <button type="button" class="btn btn-ghost uppercase" @click="$emit('cancel')">cancel</button>

    <button
      type="button"
      class="btn btn-primary px-10 uppercase"
      :disabled="!editable"
      @click="$emit('submit')"
    >
      submit
    </button>
  </div>
</template>
