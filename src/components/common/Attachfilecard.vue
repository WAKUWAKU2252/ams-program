<script setup lang="ts">
interface Props {
  moduleKey: string;
  maxSizeMB?: number;
  accept?: string;
}

withDefaults(defineProps<Props>(), {
  maxSizeMB: 10,
  accept: '.pdf,.jpg,.jpeg,.png',
});

const emit = defineEmits<{
  fileChange: [event: Event];
  drop: [event: DragEvent];
}>();
</script>

<template>
  <div
    class="card-body flex justify-start"
    @dragover.prevent
    @drop.prevent="emit('drop', $event)"
  >
    <label
      :for="`fileInput-${moduleKey}`"
      class="grid min-h-[100px] cursor-pointer grid-cols-[30px_1fr] place-items-center gap-[5px] rounded-2xl border-2 border-dashed border-[#d1d5db] bg-[#f9fafb] px-10 py-7 text-center transition-[border-color,background-color] duration-200 ease-in-out hover:border-[#9ca3af] hover:bg-[#f3f4f6]"
    >
      <i class="fa-solid fa-arrow-up-from-bracket"></i>

  <span class="text-[var(--secondary-color)]">
    Click to upload or drag and drop PDF, JPG, PNG (Max. {{ maxSizeMB }}MB)
  </span>

  <input
    :id="`fileInput-${moduleKey}`"
    type="file"
    multiple
    class="hidden"
    :accept="accept"
    @change="emit('fileChange', $event)"
  />
</label>
  </div>
</template>
