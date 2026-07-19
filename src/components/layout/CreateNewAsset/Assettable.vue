<script setup lang="ts">
import { ref } from 'vue';
import HeadtableCreateNewAsset from '@/components/common/PolineTable/HeadtableCreateNewAsset.vue';
import AssetPhotoAttach from '@/components/common/AssetPhotoAttach.vue';
import type { PurchaseOrderItem } from '@/services/purchaseOrderApi';
import CreateAllasset from '@/components/common/PolineTable/CreateAllasset.vue';
import ubislogo from '@/assets/UBIS.png'

withDefaults(
  defineProps<{
    items?: PurchaseOrderItem[];
  }>(),
  { items: () => [] },
);

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })+" ฿";
}

const expandedIds = ref(new Set<string>());

function toggleExpand(item: PurchaseOrderItem) {
  const next = new Set(expandedIds.value);
  if (next.has(item.id)) {
    next.delete(item.id);
  } else {
    next.add(item.id);
  }
  expandedIds.value = next;
}

function isExpanded(id: string) {
  return expandedIds.value.has(id);
}
</script>

<template>
  <div class="card">
    <div class="flex flex-col items-start min-w-0 w-full">
      <h2 class="text-xl text-[var(--primary-color)] text-left">2. Select PO Line</h2>
      <p class="mb-4 text-sm text-[var(--secondary-color)] text-left">
        เลือกรายการ PO Line ที่ต้องการลงทะเบียน Asset*
      </p>


      <div class="w-full overflow-x-auto rounded-lg border border-[var(--line-color)]">
        <table class="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
          <HeadtableCreateNewAsset />
          <tbody>
            <tr v-if="items.length === 0">
              <td colspan="4" class="px-6 py-6 text-center text-[var(--third-color)]">
                ยังไม่มี PO Line ให้เลือก กรุณาเลือก Purchase Order ก่อน
              </td>
            </tr>


            <template v-for="(item, index) in items" :key="item.id">
              <tr class="po-row even:bg-[var(--secondary-background)] text-[var(--primary-color)]
              transition-colors hover:bg-[var(--Side-background)] cursor-pointer"
                @click="toggleExpand(item)">

                <td class="row-divider px-4 py-4 font-mono text-sm">
                  <span class="inline-flex items-center gap-4">
                    <i class="fa-solid fa-chevron-right text-xs text-[var(--secondary-color)] transition-transform"
                      :class="{ 'rotate-90': isExpanded(item.id) }"></i>
                    {{ item.poLine }}
                  </span>
                </td>
                <td class="row-divider px-6 py-4 text-left">
                  {{ item.itemDescription }}
                </td>

                <td class="row-divider px-6 py-4 text-center font-mono text-sm">
                  {{ item.quantity }}
                </td>
                <td class="row-divider px-6 py-4 text-right font-mono text-sm">{{ formatCurrency(item.unitPrice) }}</td>
              </tr>




              <tr v-if="isExpanded(item.id)" class="row-divider">
                <td colspan="4" class="bg-[var(--third-background)] px-14 py-4">


                  <table class="w-full border-separate border-spacing-0 text-sm ">
                    <tbody>
                      
                      <!-- คลี่เป็นรายชิ้นตามจำนวนสั่งใน PO (quantity) — เพดานตายตัวตั้งแต่เปิดใบ -->
                      <tr v-for="unit in item.quantity" :key="unit"
                        class="bg-white hover:bg-[var(--Side-background)] 
                        transition-colors">
                        <!-- No -->
                        <td class="border-l-4 border-[var(--button-active)] rounded-l-lg row-divider 
                        px-4 py-2 font-mono text-sm text-center">
                          {{ item.poLine }}.{{ unit }}
                        </td>

                        <!-- Image -->
                        <td class="row-divider py-2 text-center">
                          <img :src="ubislogo" draggable="false"
                            class="w-12 h-12 object-cover rounded border mx-auto" />
                        </td>

                        <!-- Serial -->
                        <td class="row-divider px-4 py-2 text-left ">
                          <div class="flex flex-col">
                          <span class="text-label-md text-outline uppercase text-[var(--third-color)]">Serial number</span>
                          <span class="text-[var(--primary-color)]">Not assigned</span>
                          </div>
                          <!-- {{ asset.serialNo }} -->
                        </td>
                        
                        <td class="row-divider px-4 py-2 text-left">
                          <div class="flex flex-col">
                          <span class="text-label-md text-outline uppercase text-[var(--third-color)]">GRPO No.</span>
                          <span class="text-[var(--primary-color)]">{{ item.grpoLines.map(g => g.grpoNo).join(', ') }}</span>
                          </div>
                        </td>
                        <td class="row-divider py-2 text-right">
                          <div class="flex flex-col">
                          <span class="text-label-md text-outline uppercase text-[var(--third-color)]">Price per unit</span>
                          <span class="text-[var(--primary-color)]">{{ formatCurrency((item.unitPrice/item.quantity)) }}</span>
                          </div>
                        </td>
                        <td class="row-divider py-2 text-right max-w-[60px]">
                          <span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600">
                            Incomplete
                          </span>
                        
                        </td>
                        <!-- Action -->
                        <td class="row-divider pr-4 py-2 text-center items-left rounded-r-lg max-w-[40px]">
                          <button class=" py-1 rounded  text-[var(--primary-color)] 
                          hover:text-blue-700 text-lg">
                            <i class="fa-regular fa-pen-to-square"></i>
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  grid-template-columns: 1fr;
}
</style>
