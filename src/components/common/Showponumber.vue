<script setup lang="ts">
import type { PurchaseOrderSummary } from '@/services/purchaseOrder.service'
import { formatDate } from '@/utils/date';

// clearable: false = การ์ดอ่านอย่างเดียว (หน้า DraftForm — PO ของ draft เปลี่ยนไม่ได้)
withDefaults(
  defineProps<{
    selectedPO: PurchaseOrderSummary | null
    clearable?: boolean
  }>(),
  { clearable: true },
)

const emit = defineEmits<{
  (e:'clear'):void}>()
</script>

<template>
  <div
    v-if="selectedPO"
    class="relative w-full min-w-0
    bg-[var(--surface-bright)]
    border-l-4 border-[var(--button-active)]
    rounded-lg p-4 sm:p-6 pr-12
    shadow-sm flex flex-col gap-1
    transition-all hover:shadow-md"
  >
    <h5 class="text-base font-semibold text-[var(--primary-color)] text-left break-words">
      PO NO. {{ selectedPO.poNumber }}
    </h5>
    <p class="text-sm text-[var(--secondary-color)] text-left break-words">
      Vendor: {{ selectedPO.vendorName }}
    </p>
    <p class="text-sm text-[var(--secondary-color)] text-left">
      PO Date: {{formatDate( selectedPO.poDate )}}
    </p>
    <button
      v-if="clearable"
      type="button"
      class="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-500"
      aria-label="Close"
      @click="emit('clear')"
    >
      <i class="fa-solid fa-xmark block text-base"></i>
    </button>
  </div>
</template>