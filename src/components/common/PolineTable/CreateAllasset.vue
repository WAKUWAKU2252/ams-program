<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineEmits<{ (e: 'create-all'): void }>()
</script>

<template>
  <div class="mb-3 flex flex-row items-center gap-3 rounded-box border border-base-300 bg-base-100 p-6">
    <button type="button" class="btn btn-secondary btn-sm uppercase" @click="$emit('create-all')">
      <Icon icon="lucide:layers" />
      Create for All
    </button>

    <p class="text-sm italic text-base-content/70">กรอกรายละเอียดสินทรัพย์ทั้งหมด*</p>
  </div>
</template>
