<script setup lang="ts">
import Attachfilecard from '@/components/common/Attachfilecard.vue';
import FileAttachList from '@/components/common/FileAttachList.vue';
import { useFileAttachment } from '@/composables/Usefileattachement';

const moduleKey = 'invoice';

// ยังไม่ต่อ service — ไฟล์ถูกถือไว้ใน store ฝั่ง browser เท่านั้น
// (แผนย้ายไป upload ทันทีแล้วเก็บแค่ id เขียนไว้ที่หัวไฟล์ stores/Attachmentstore.ts)
const { files, error, onFileChange, onDrop, removeFile } = useFileAttachment(moduleKey, {
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

      <p v-if="error" class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
        {{ error }}
      </p>
    </div>

    <!-- รายการไฟล์: รูปโชว์ภาพจริง / PDF โชว์ไอคอน + ชื่อ + ขนาด -->
    <FileAttachList :files="files" @remove="removeFile" />

  </div>
</template>
