<script setup lang="ts">
import { ref } from 'vue'
import PurchaseOrderSearch from '@/components/common/Searching.vue'
import ShowPONumber from '@/components/common/Showponumber.vue'
import { getPurchaseOrderByNumber } from '@/services/purchaseOrderApi'
import type { PurchaseOrder } from '@/services/purchaseOrderApi'

const emit = defineEmits<{
  (e: 'update:selectedPO', po: PurchaseOrder | null): void
}>()

const selectedPO = ref<PurchaseOrder | null>(null)
const loadingDetail = ref(false)
const detailError = ref('')
const searchRef = ref<InstanceType<typeof PurchaseOrderSearch> | null>(null)

// Searching.vue ส่งมาแค่ poNumber (ผลค้นหาแบบเบาไม่มี items) — ต้องดึงรายละเอียดเต็มเอง
async function selectPO(poNumber: string) {
  loadingDetail.value = true
  detailError.value = ''
  try {
    const po = await getPurchaseOrderByNumber(poNumber)
    selectedPO.value = po
    emit('update:selectedPO', po)
  } catch (e) {
    console.error('ดึงรายละเอียด PO ไม่สำเร็จ:', e)
    detailError.value = 'ดึงรายละเอียด PO ไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    loadingDetail.value = false
  }
}

function clearSelectedPO() {
  selectedPO.value = null
  detailError.value = ''
  searchRef.value?.clearQuery()
  emit('update:selectedPO', null)
}
</script>

<template>
    <div class="card">
        <div class="flex flex-col items-start min-w-0 w-full">
            <h2 class="text-xl text-[var(--primary-color)] text-left">
                2. Search Purchase Order
            </h2>

            <p class="mb-4 text-sm text-[var(--secondary-color)] text-left">
                ค้นหาและเลือกใบสั่งซื้อจากระบบ*
            </p>

            <PurchaseOrderSearch ref="searchRef" @select="selectPO" />

            <p v-if="loadingDetail" class="mt-2 text-sm text-[var(--secondary-color)]">
              <i class="fa-solid fa-spinner animate-spin mr-1" />กำลังโหลดรายละเอียด PO...
            </p>
            <p v-if="detailError" class="mt-2 text-sm text-red-500">{{ detailError }}</p>
        </div>
    <ShowPONumber
    :selectedPO="selectedPO"
    @clear="clearSelectedPO"/>
    </div>
</template>