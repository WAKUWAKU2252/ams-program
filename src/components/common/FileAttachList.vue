<script setup lang="ts">
// รายการไฟล์ที่แนบแล้ว — รูปโชว์ภาพจริง / PDF โชว์ไอคอน พร้อมชื่อและขนาด
// dumb component: ไม่รู้จัก store หรือ moduleKey เลย รับ list มาแสดงแล้วบอกกลับว่ากดลบอันไหน
import type { AttachedFile } from '@/stores/Attachmentstore';

withDefaults(
  defineProps<{
    files: AttachedFile[];
    disabled?: boolean;
    emptyText?: string;
  }>(),
  { disabled: false, emptyText: 'ยังไม่มีไฟล์ที่แนบ' },
);

const emit = defineEmits<{ remove: [index: number] }>();

function fileIcon(file: AttachedFile) {
  if (file.type === 'application/pdf') {
    return { icon: 'fa-regular fa-file-pdf', color: 'text-red-500', bg: 'bg-red-50' };
  }
  return { icon: 'fa-regular fa-file-lines', color: 'text-gray-500', bg: 'bg-gray-100' };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
</script>

<template>
  <div v-if="files.length" class="flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-1">
    <div
      v-for="(file, index) in files"
      :key="`${file.name}-${index}`"
      class="flex items-center gap-3 rounded-[12px] border border-[var(--line-color)] bg-white px-3 py-2"
    >
      <!-- รูปมี previewUrl ติดมาจาก useFileAttachment — ชนิดอื่นใช้ไอคอนแทน -->
      <img
        v-if="file.previewUrl"
        :src="file.previewUrl"
        :alt="file.name"
        class="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
      />
      <div
        v-else
        class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-xl"
        :class="[fileIcon(file).bg, fileIcon(file).color]"
      >
        <i :class="fileIcon(file).icon" />
      </div>

      <div class="min-w-0 flex-1 text-left">
        <p class="truncate text-sm text-[var(--primary-color)]" :title="file.name">{{ file.name }}</p>
        <p class="text-xs text-[var(--third-color)]">{{ formatSize(file.size) }}</p>
      </div>

      <button
        type="button"
        :disabled="disabled"
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--third-color)] transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--third-color)]"
        :title="`ลบ ${file.name}`"
        @click="emit('remove', index)"
      >
        <i class="fa-regular fa-trash-can" />
      </button>
    </div>
  </div>

  <div
    v-else
    class="flex min-h-[100px] items-center justify-center rounded-[10px] border border-dashed border-[#e5e7eb] text-sm text-[#9ca3af]"
  >
    {{ emptyText }}
  </div>
</template>
