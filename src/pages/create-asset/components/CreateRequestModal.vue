<script setup lang="ts">

import { ref, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
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

// ไม่ต้องล็อก scroll เอง — daisyUI ทำให้แล้วผ่าน :root:has(.modal.modal-open)
// (ล็อกที่ :root พร้อม scrollbar-gutter: stable ล็อกเองที่ body จะทำให้หน้าเลื่อนเพราะ scrollbar หาย)
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="modal backdrop-blur-sm" :class="{ 'modal-open': open }" role="dialog" aria-modal="true">
      <div class="modal-box" :class="maxWidth ?? 'max-w-2xl'">
        <!-- header — วางโครงเดียวกับ AppConfirmDialog: ไอคอนวงกลม + หัวข้อ + คำอธิบาย -->
        <div class="flex items-start justify-between gap-4">
          <slot name="header">
            <div class="flex flex-1 items-start gap-4">
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-info/10 text-xl text-info"
              >
                <Icon icon="lucide:file-plus-2" />
              </div>
              <div class="text-left">
                <h3 class="text-lg font-semibold">Create New Request</h3>
                <p class="mt-1 text-sm text-base-content/60">
                  สร้างคำขอลงทะเบียนใหม่ — เลือก PO ที่ต้องการลงทะเบียนสินทรัพย์
                </p>
              </div>
            </div>
          </slot>

          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            aria-label="Close"
            :disabled="creating"
            @click="close"
          >
            <Icon icon="lucide:x" />
          </button>
        </div>

        <!-- body (scroll ได้เมื่อเนื้อหายาว) -->
        <div class="min-h-[330px] py-4">
          <slot name="body" />
          <Searching
            ref="searchRef"
            label="PO No. / Vendor Name"
            :invalid="unSelect && !selectedPO"
            @select="selectPO"
          />
          <div v-if="unSelect && !selectedPO" role="alert" class="alert alert-error alert-soft mt-2">
            <Icon icon="lucide:circle-alert" />
            <span>กรุณาเลือก PO ก่อนกด Create</span>
          </div>

          <div v-if="detailError" role="alert" class="alert alert-error alert-soft mt-2">
            <Icon icon="lucide:circle-alert" />
            <span>{{ detailError }}</span>
          </div>

          <div class="mt-6">
            <ShowPONumber :selectedPO="selectedPO" @clear="clearSelectedPO" />
          </div>
        </div>

        <div class="modal-action">
          <slot name="footer" />
          <button type="button" class="btn btn-ghost" :disabled="creating" @click="close">
            ยกเลิก
          </button>
          <button type="button" class="btn btn-primary" :disabled="creating" @click="onCreateClick">
            <span v-if="creating" class="loading loading-spinner loading-sm"></span>
            Create
          </button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>
  </Teleport>
</template>
