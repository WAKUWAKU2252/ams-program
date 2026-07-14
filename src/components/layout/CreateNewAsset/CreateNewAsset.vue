<script setup lang="ts">
import { ref } from 'vue'
import Invoice from './Invoice.vue'
import PurchaseOrder from './PurchaseOrder.vue'
import Assettable from './Assettable.vue'
import type { PurchaseOrder as PurchaseOrderType } from '@/services/purchaseOrderApi'

const selectedPO = ref<PurchaseOrderType | null>(null)

const asset = ref({
  name: '',
  category: '',
  serial: '',
  purchaseDate: '',
  status: 'active',
  description: ''
})

function submitAsset() {
  console.log('Submitting asset', asset.value)
}
</script>

<template>
  <div class="min-h-screen grid grid-rows-[auto_auto_auto_1fr] gap-[10px] bg-white min-w-[600px]">
    <div class="m-6 grid min-h-[100px] px-4 py-5 sm:px-[50px]">
      <h1 class="text-left text-[28px] sm:text-[36px] text-[var(--primary-color)]">
        Create New Asset
      </h1>

      <p class="pl-2.5 text-left text-[var(--secondary-color)]">
        สร้างคำขอขึ้นทะเบียนสินทรัพย์ใหม่
      </p>
    </div>

    <section class="mx-4 md:mx-10 lg:mx-20">
      <Invoice />
    </section>

    <section class="mx-4 md:mx-10 lg:mx-20">
      <PurchaseOrder @update:selectedPO="selectedPO = $event" />
    </section>

    <section class="mx-4 md:mx-10 lg:mx-20">
      <Assettable :items="selectedPO?.items ?? []" />
    </section>
  </div>
</template>