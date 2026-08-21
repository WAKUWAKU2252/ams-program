<script setup lang="ts">
// รายการไฟล์ที่แนบแล้ว — รูปโชว์ภาพจริง / PDF โชว์ไอคอน พร้อมชื่อและขนาด
// dumb component: ไม่รู้จัก store หรือ moduleKey เลย รับ list มาแสดงแล้วบอกกลับว่ากดลบอันไหน
import type { AttachedFile } from '@/stores/Attachmentstore';
import { Icon } from '@iconify/vue';

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
    return { icon: 'lucide:file-text', color: 'text-error', bg: 'bg-error/10' };
  }
  return { icon: 'lucide:file', color: 'text-base-content/60', bg: 'bg-base-200' };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
</script>

<template>
  <ul v-if="files.length" class="list max-h-[220px] overflow-y-auto rounded-box bg-base-100">
    <li v-for="(file, index) in files" :key="`${file.name}-${index}`" class="list-row items-center">
      <!-- รูปมี previewUrl ติดมาจาก useFileAttachment — ชนิดอื่นใช้ไอคอนแทน -->
      <img
        v-if="file.previewUrl"
        :src="file.previewUrl"
        :alt="file.name"
        class="size-12 rounded-box object-cover"
      />
      <div
        v-else
        class="flex size-12 items-center justify-center rounded-box text-xl"
        :class="[fileIcon(file).bg, fileIcon(file).color]"
      >
        <Icon :icon="fileIcon(file).icon" />
      </div>

      <div class="min-w-0 text-left">
        <p class="truncate text-sm" :title="file.name">{{ file.name }}</p>
        <p class="text-xs text-base-content/50">{{ formatSize(file.size) }}</p>
      </div>

      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square hover:text-error"
        :disabled="disabled"
        :title="`ลบ ${file.name}`"
        @click="emit('remove', index)"
      >
        <Icon icon="lucide:trash-2" />
      </button>
    </li>
  </ul>

  <div
    v-else
    class="flex min-h-[100px] items-center justify-center rounded-box border border-dashed border-base-300 text-sm text-base-content/50"
  >
    {{ emptyText }}
  </div>
</template>
