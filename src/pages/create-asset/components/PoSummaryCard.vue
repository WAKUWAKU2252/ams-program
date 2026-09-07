<script setup lang="ts">
import type { PurchaseOrderSummary } from '@/shared/services/purchaseOrder.service'
import { formatDate } from '@/shared/utils/date';
import { Icon } from '@iconify/vue'

// clearable: false = การ์ดอ่านอย่างเดียว (หน้า DraftForm - PO ของ draft เปลี่ยนไม่ได้)
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
    class="card w-full min-w-0 border-l-4 border-primary bg-base-100 shadow-sm transition-shadow hover:shadow-md"
  >
    <div class="card-body gap-1 p-4 pr-12 sm:p-6 sm:pr-12">
      <h5 class="card-title break-words text-base">PO NO. {{ selectedPO.poNumber }}</h5>
      <p class="break-words text-left text-sm text-base-content/70">
        Vendor: {{ selectedPO.vendorName }}
      </p>
      <p class="text-left text-sm text-base-content/70">
        PO Date: {{ formatDate(selectedPO.poDate) }}
      </p>
      <button
        v-if="clearable"
        type="button"
        class="btn btn-ghost btn-sm btn-circle absolute right-3 top-3"
        aria-label="Clear"
        @click="emit('clear')"
      >
        <Icon icon="lucide:x" />
      </button>
    </div>
  </div>
</template>