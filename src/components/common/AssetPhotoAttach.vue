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

    <div v-if="error" role="alert" class="alert alert-error alert-soft mt-2">
      <span>{{ error }}</span>
    </div>

    <ul v-if="files.length" class="list mt-2 rounded-box bg-base-100">
      <li
        v-for="(file, index) in files"
        :key="`${file.name}-${index}`"
        class="list-row items-center py-2"
      >
        <span class="truncate text-sm">{{ file.name }}</span>
        <span class="shrink-0 text-xs text-base-content/50">{{ formatSize(file.size) }}</span>
        <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeFile(index)">
          Remove
        </button>
      </li>
    </ul>
  </div>
</template>
