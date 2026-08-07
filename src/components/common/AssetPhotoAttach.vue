<script setup lang="ts">
import Attachfilecard from '@/components/common/Attachfilecard.vue';
import { useFileAttachment } from '@/composables/Usefileattachement';

const props = defineProps<{
  moduleKey: string;
}>();

const { files, error, onFileChange, onDrop, removeFile, formatSize } =
  useFileAttachment(props.moduleKey, {
    acceptedTypes: ['image/jpeg', 'image/png'],
    maxSizeMB: 10,
    maxFiles: null,
  });
</script>

<template>
  <div>
    <Attachfilecard
      :module-key="moduleKey"
      :max-size-m-b="10"
      accept=".jpg,.jpeg,.png"
      @file-change="onFileChange"
      @drop="onDrop"
    />

    <p v-if="error" class="mt-2 text-sm text-red-500">
      {{ error }}
    </p>

    <ul v-if="files.length" class="mt-2 flex flex-col gap-1">
      <li
        v-for="(file, index) in files"
        :key="`${file.name}-${index}`"
        class="flex items-center justify-between gap-2 rounded-md border border-[var(--line-color)] px-3 py-1.5 text-sm"
      >
        <span class="truncate text-[var(--primary-color)]">{{ file.name }}</span>
        <span class="shrink-0 text-xs text-[var(--third-color)]">{{ formatSize(file.size) }}</span>
        <button
          type="button"
          class="shrink-0 cursor-pointer border-none bg-transparent text-xs text-[#ef4444] hover:underline"
          @click="removeFile(index)"
        >
          Remove
        </button>
      </li>
    </ul>
  </div>
</template>
