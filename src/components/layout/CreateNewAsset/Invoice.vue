<script setup lang="ts">
import Attachfilecard from '@/components/common/Attachfilecard.vue';
import { useFileAttachment } from '@/composables/Usefileattachement';

const moduleKey = 'invoice';

const { files, error, onFileChange, onDrop, removeFile, formatSize } =
  useFileAttachment(moduleKey, {
    acceptedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeMB: 10,
    maxFiles: null,
  });
</script>

<template>
  <div class="card">
    <div>
      <h2 class="text-xl text-[var(--primary-color)] text-left">
        1. Invoice
      </h2>

      <p class="mb-4 text-sm text-[var(--secondary-color)] text-left">
        แนบเอกสารใบแจ้งหนี้
      </p>

      <Attachfilecard
        :module-key="moduleKey"
        :max-size-m-b="10"
        accept=".pdf,.jpg,.jpeg,.png"
        @file-change="onFileChange"
        @drop="onDrop"
      />

      <p v-if="error" class="mt-2 text-sm text-red-500">
        {{ error }}
      </p>
    </div>

    <div
  v-if="files.length"
  class="grid max-h-[200px] gap-[10px] overflow-y-auto pr-2 items-end"
  >
  <!-- กรณีมี previewUrl-->
  <div
    v-for="(file, index) in files"
    :key="`${file.name}-${index}`"
  >
<div
  v-if="file.previewUrl"
  class="relative h-[110px] w-full w-full overflow-hidden rounded-[16px]"
>
  <img
    :src="file.previewUrl"
    :alt="file.name"
    class="h-full w-full object-cover"
  />

  <div
    class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-white/70 px-3 py-1.5"
  >
    <p class="truncate text-[0.8rem] text-black">
      {{ file.name }}
    </p>

    <button
      type="button"
      class="cursor-pointer border-none bg-transparent text-[0.85rem] text-[#ef4444] hover:underline"
      @click="removeFile(index)"
    >
      Remove
    </button>
  </div>
</div>

<!-- กรณีไม่มี previewUrl -->
<div
  v-else
  class="relative h-[110px] w-full overflow-hidden rounded-[16px] bg-[#f3f4f6]"
>
  <div class="flex h-full w-full items-center justify-center">
    <i
      class="fa-solid fa-file-lines text-4xl text-[#6b7280]"
    ></i>
  </div>

  <div
    class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-white/70 px-3 py-1.5"
  >
    <p class="truncate text-[0.8rem] text-black">
      {{ file.name }}
    </p>

    <button
      type="button"
      class="cursor-pointer border-none bg-transparent text-[0.85rem] text-[#ef4444] hover:underline"
      @click="removeFile(index)"
    >
      Remove
    </button>
  </div>
</div>
  </div>
</div>

<div
  v-else
  class="flex min-h-[100px] items-center justify-center rounded-[10px] border border-dashed border-[#e5e7eb] text-sm text-[#9ca3af]"
>
  ยังไม่มีไฟล์ที่แนบ
</div>
  </div>
</template>