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
  <div class="card bg-base-100 shadow-sm">
    <div class="card-body items-start text-left">
      <h2 class="card-title">1. Invoice</h2>
      <p class="mb-2 text-sm text-base-content/70">แนบเอกสารใบแจ้งหนี้</p>

      <Attachfilecard
        :module-key="moduleKey"
        :max-size-m-b="10"
        accept=".pdf,.jpg,.jpeg,.png"
        @file-change="onFileChange"
        @drop="onDrop"
      />

      <div v-if="error" role="alert" class="alert alert-error alert-soft mt-2">
        <span>{{ error }}</span>
      </div>

      <!-- รายการไฟล์: รูปโชว์ภาพจริง / PDF โชว์ไอคอน + ชื่อ + ขนาด -->
      <FileAttachList class="w-full" :files="files" @remove="removeFile" />
    </div>
  </div>
</template>
