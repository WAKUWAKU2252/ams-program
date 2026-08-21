<script setup lang="ts">
import { ref } from 'vue'
import PurchaseOrderSearch from '@/components/common/Searching.vue'
import ShowPONumber from '@/components/common/Showponumber.vue'
import { getPurchaseOrderByNumber } from '@/services/purchaseOrder.service'
import type { PurchaseOrder, PurchaseOrderSummary } from '@/services/purchaseOrder.service'

const emit = defineEmits<{
  (e: 'update:selectedPO', po: PurchaseOrder | null): void
}>()

const selectedPO = ref<PurchaseOrder | null>(null)
const loadingDetail = ref(false)
const detailError = ref('')
const searchRef = ref<InstanceType<typeof PurchaseOrderSearch> | null>(null)


  
async function selectPO(summary: PurchaseOrderSummary) {
  loadingDetail.value = true
  detailError.value = ''
  try {
    const po = await getPurchaseOrderByNumber(summary.poNumber)
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
    <div class="card bg-base-100 shadow-sm">
        <div class="card-body items-start gap-4 text-left">
            <div class="w-full min-w-0">
                <h2 class="card-title">รายละเอียดใบสั่งซื้อ Purchase Order</h2>
                <p class="mb-4 text-sm text-base-content/70">ค้นหาและเลือกใบสั่งซื้อจากระบบ*</p>

                <PurchaseOrderSearch ref="searchRef" @select="selectPO" />

                <p v-if="loadingDetail" class="mt-2 flex items-center gap-2 text-sm text-base-content/70">
                  <span class="loading loading-spinner loading-xs"></span>กำลังโหลดรายละเอียด PO...
                </p>
                <div v-if="detailError" role="alert" class="alert alert-error alert-soft mt-2">
                  <span>{{ detailError }}</span>
                </div>
            </div>

            <ShowPONumber :selectedPO="selectedPO" @clear="clearSelectedPO" />
        </div>
    </div>
</template>