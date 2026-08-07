<script setup lang="ts">
// กล่องรับไฟล์: กดเพื่อเลือก หรือลากมาวางก็ได้
// component นี้ไม่รู้จัก logic validate/เก็บไฟล์เลย — ส่ง event ออกไปให้ผู้เรียกจัดการ (useFileAttachment)
// จึงเอาไปใช้ซ้ำได้ทั้ง invoice และรูป asset ด้วยกติกาคนละชุด
import { ref } from 'vue';

interface Props {
  moduleKey: string;
  maxSizeMB?: number;
  accept?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  maxSizeMB: 10,
  accept: '.pdf,.jpg,.jpeg,.png',
  disabled: false,
});

const emit = defineEmits<{
  fileChange: [event: Event];
  drop: [event: DragEvent];
}>();

// นับ enter/leave แทนการ set/unset ตรง ๆ — ลากผ่าน element ลูกข้างในจะยิง dragleave ของพ่อด้วย
// ถ้าไม่นับ กรอบจะกะพริบทุกครั้งที่ขยับเมาส์อยู่ในกล่อง
const dragDepth = ref(0);
const isDragging = ref(false);

function onDragEnter() {
  if (props.disabled) return;
  dragDepth.value += 1;
  isDragging.value = true;
}

function onDragLeave() {
  dragDepth.value -= 1;
  if (dragDepth.value <= 0) {
    dragDepth.value = 0;
    isDragging.value = false;
  }
}

function onDrop(event: DragEvent) {
  dragDepth.value = 0;
  isDragging.value = false;
  if (props.disabled) return;
  emit('drop', event);
}
</script>

<template>
  <div
    class="card-body flex w-full justify-start"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <label
      :for="`fileInput-${moduleKey}`"
      class="grid min-h-[100px] w-full grid-cols-[30px_1fr] place-items-center gap-[5px] rounded-2xl border-2 border-dashed px-10 py-7 text-center transition-all duration-200 ease-in-out"
      :class="[
        disabled
          ? 'cursor-not-allowed border-[#e5e7eb] bg-[#f9fafb] opacity-50'
          : 'cursor-pointer hover:border-[#9ca3af] hover:bg-[#f3f4f6]',
        isDragging && !disabled
          ? 'border-[var(--primary-color)] bg-blue-50'
          : 'border-[#d1d5db] bg-[#f9fafb]',
      ]"
    >
      <i
        class="fa-solid transition-transform duration-200"
        :class="isDragging && !disabled
          ? 'fa-file-arrow-down scale-125 text-[var(--primary-color)]'
          : 'fa-arrow-up-from-bracket'"
      ></i>

      <span :class="isDragging && !disabled ? 'text-[var(--primary-color)]' : 'text-[var(--secondary-color)]'">
        <template v-if="isDragging && !disabled">วางไฟล์ที่นี่ได้เลย</template>
        <template v-else>
          Click to upload or drag and drop PDF, JPG, PNG (Max. {{ maxSizeMB }}MB)
        </template>
      </span>

      <input
        :id="`fileInput-${moduleKey}`"
        type="file"
        multiple
        class="hidden"
        :accept="accept"
        :disabled="disabled"
        @change="emit('fileChange', $event)"
      />
    </label>
  </div>
</template>
