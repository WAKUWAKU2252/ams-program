<script setup lang="ts">
// กล่องแนบใบแจ้งหนี้ของ "รอบรับของ" หนึ่งรอบ — กดเลือกไฟล์ หรือลากมาวางก็ได้
//
// invoice ผูกกับใบ GRPO ไม่ใช่ PO line (ตรงกับ grpo.invoiceId ฝั่ง DB) moduleKey จึงอิงเลข GRPO
// ผลคือ GRPO ใบเดียวที่โผล่ใต้หลาย PO line จะเห็นไฟล์ชุดเดียวกัน — ตรงกับความจริงว่ามีใบเดียว
//
// ยังไม่ต่อ service: ไฟล์อยู่ใน pinia store ฝั่ง browser เท่านั้น (ดูแผนที่หัวไฟล์ Attachmentstore.ts)
import AppConfirmDialog from './AppConfirmDialog.vue';
import Attachfilecard from './Attachfilecard.vue';
import FileAttachList from './FileAttachList.vue';
import { useFileAttachment } from '@/composables/Usefileattachement';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** คีย์ประจำใบ GRPO เช่น `invoice-12305022` — ผู้เรียกต้อง :key ด้วยค่านี้เพื่อให้ remount เมื่อเปลี่ยนรอบ */
    moduleKey: string;
    grpoNo: string;
    grpoDate?: string;
    disabled?: boolean;
  }>(),
  { disabled: false, grpoDate: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { files, error, onFileChange, onDrop, removeFile } = useFileAttachment(props.moduleKey, {
  acceptedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  maxSizeMB: 10,
  maxFiles: null,
});
</script>

<template>
  <AppConfirmDialog
    :model-value="modelValue"
    variant="info"
    title="แนบใบแจ้งหนี้ (Invoice)"
    confirm-text="เสร็จสิ้น"
    cancel-text="ปิด"
    @update:model-value="emit('update:modelValue', $event)"
    @confirm="emit('update:modelValue', false)"
  >
    <div class="space-y-3">
      <p>
        รอบรับของ <span class="font-mono font-semibold">{{ grpoNo }}</span>
        <span v-if="grpoDate"> · {{ grpoDate }}</span>
      </p>

      <Attachfilecard
        :module-key="moduleKey"
        :max-size-m-b="10"
        accept=".pdf,.jpg,.jpeg,.png"
        :disabled="disabled"
        @file-change="onFileChange"
        @drop="onDrop"
      />

      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>

      <FileAttachList
        :files="files"
        :disabled="disabled"
        empty-text="ยังไม่ได้แนบใบแจ้งหนี้ของรอบนี้"
        @remove="removeFile"
      />
    </div>
  </AppConfirmDialog>
</template>
