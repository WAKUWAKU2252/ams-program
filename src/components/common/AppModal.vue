<script setup lang="ts">

import { ref, watch, onUnmounted } from 'vue'
import Searching from './Searching.vue'
import ShowPONumber from './Showponumber.vue'
import type { PurchaseOrderSummary } from '@/services/purchaseOrder.service'
import { createDraft } from '@/services/assetRequest.service'

const props = defineProps<{
  open: boolean
  title?: string
  maxWidth?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'close'): void
  (e: 'created', selectedPO: number): void
}>()

// ── PO ที่เลือกจาก Searching → ใช้โชว์การ์ด ShowPONumber ──
const searchRef = ref<InstanceType<typeof Searching> | null>(null)
const selectedPO = ref<PurchaseOrderSummary | null>(null)
const detailError = ref('')
const unSelect = ref(false)
const creating = ref(false) // กำลังยิง createDraft อยู่ → ล็อกปุ่มกันกดซ้ำ

// Searching ส่ง summary ทั้ง object มาเลย (poNumber/vendorName/poDate ครบจากผลค้นหา row 1)
// การ์ด ShowPONumber ใช้แค่ 3 field นี้ → ไม่ต้องยิงดึงรายละเอียดซ้ำ (ตัด GET /:poNumber ออก)
function selectPO(po: PurchaseOrderSummary) {
  selectedPO.value = po
  unSelect.value = false // เลือก PO ได้แล้ว → เคลียร์ warning
}

function clearSelectedPO() {
  selectedPO.value = null
  detailError.value = ''
  unSelect.value = false
  searchRef.value?.clearQuery()
}

function close() {
  if (creating.value) return // กำลังสร้างอยู่ห้ามปิด (กติกาเดียวกับ loading ของ AppConfirmDialog)
  clearSelectedPO() // ปิด modal แล้วล้างของเดิม กันค้างตอนเปิดใหม่
  emit('update:open', false)
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

// กด Create → สร้าง draft แล้วส่ง requestId ให้ parent เปิดหน้าฟอร์มต่อ
async function onCreateClick() {
  if (!selectedPO.value) {
    unSelect.value = true
    return
  }
  if (creating.value) return
  creating.value = true
  detailError.value = ''

  try {
    const { requestId } = await createDraft(selectedPO.value.poNumber)
    emit('created', requestId)
    close()
  } catch (e) {
    console.error('สร้าง draft ไม่สำเร็จ:', e)
    detailError.value = 'สร้างคำขอไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    creating.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden' // กันหน้าเบื้องหลัง scroll
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        @mousedown.self="close"
      >
        <div
          class="flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          :class="maxWidth ?? 'max-w-2xl'"
        >
          <!-- header — วางโครงเดียวกับ AppConfirmDialog: ไอคอนวงกลม + หัวข้อ + คำอธิบาย -->
          <div class="flex items-start justify-between gap-4 px-6 pt-5 pb-4 sm:p-6 sm:pb-4">
              <slot name="header">
                <div class="flex flex-1 items-start gap-4">
                  <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl text-blue-500">
                    <i class="fa-solid fa-file-circle-plus" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold leading-6 text-gray-900">
                      Create New Request
                    </h3>
                    <p class="mt-1 text-sm text-gray-500">
                      สร้างคำขอลงทะเบียนใหม่ — เลือก PO ที่ต้องการลงทะเบียนสินทรัพย์
                    </p>
                  </div>
                </div>
              </slot>

              <button
                type="button"
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500 disabled:opacity-40"
                aria-label="Close"
                :disabled="creating"
                @click="close"
              >
                <i class="fa-solid fa-xmark text-base" />
              </button>
            </div>

          <!-- body (scroll ได้เมื่อเนื้อหายาว) -->
          <div class="min-h-[330px] max-h-[80vh] overflow-y-auto px-6 pb-4 sm:px-8">
            <slot name="body"/>
            <Searching
              ref="searchRef"
              width-class="w-[400px]"
              label="PO No. / Vendor Name"
              class="mt-4"
              :invalid="unSelect && !selectedPO"
              @select="selectPO"
            />
            <p v-if="unSelect && !selectedPO" class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              *กรุณาเลือก PO ก่อนกด Create
            </p>
           

            <p v-if="detailError" class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ detailError }}</p>

            <div class="mt-6">
              <ShowPONumber :selectedPO="selectedPO" @clear="clearSelectedPO" />
            </div>
          </div>
          

          <!-- footer — แถบเทาและปุ่มชุดเดียวกับ AppConfirmDialog (ปุ่มหลักอยู่ขวาสุด) -->
          <div class="gap-2 bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <slot name="footer" />
            <button
              type="button"
              class="inline-flex w-full justify-center rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              :disabled="creating"
              @click="onCreateClick"
            >
              <i v-if="creating" class="fa-solid fa-spinner animate-spin mr-2 mt-0.5" />Create
            </button>
            <button
              type="button"
              class="mt-3 inline-flex w-full justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto"
              :disabled="creating"
              @click="close"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* จังหวะเดียวกับ AppConfirmDialog (0.2s) — เปิดคนละกล่องแล้วความรู้สึกต้องเหมือนกัน */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
