<script setup lang="ts">
// จัดการ invoice ของ "รอบรับของ" หนึ่งรอบ — 1 รอบแนบได้หลายใบ (grpo_invoice many-to-many)
// รายการซ้าย + preview ขวา (รูปโชว์ inline / PDF ฝัง iframe) — อัปโหลดทันทีที่เลือกไฟล์
import { ref, watch, onUnmounted, computed } from 'vue'
import type { InvoiceFile } from '@/services/asset.service'
import { uploadInvoice, linkGrpoInvoice, unlinkGrpoInvoice, invoiceBlobUrl, openInvoiceFile } from '@/services/invoice.service'
import { ApiError } from '@/services/httpClient'

const props = withDefaults(
  defineProps<{
    open: boolean
    grpoId: number
    grpoNo: string
    invoices: InvoiceFile[]
    editable?: boolean
  }>(),
  { editable: true },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'changed'): void // แนบ/ถอดสำเร็จ → parent โหลด slots ใหม่
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false) // อัปโหลด/ถอดอยู่ — กันกดซ้ำ
const error = ref('')

// ── preview ──
const selected = ref<InvoiceFile | null>(null)
const previewUrl = ref('')
const previewLoading = ref(false)

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

async function selectForPreview(inv: InvoiceFile) {
  selected.value = inv
  revokePreview()
  // PDF/รูป preview inline ได้ ชนิดอื่นให้กดเปิดแท็บเอา
  if (!inv.mimeType.startsWith('image/') && inv.mimeType !== 'application/pdf') return
  previewLoading.value = true
  try {
    previewUrl.value = await invoiceBlobUrl(inv.id)
  } catch {
    error.value = 'โหลดไฟล์ preview ไม่สำเร็จ'
  } finally {
    previewLoading.value = false
  }
}

const isImage = computed(() => selected.value?.mimeType.startsWith('image/'))
const isPdf = computed(() => selected.value?.mimeType === 'application/pdf')

function pickFile() {
  error.value = ''
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    const attachmentId = await uploadInvoice(file)
    await linkGrpoInvoice(props.grpoId, attachmentId)
    emit('changed') // parent reload → props.invoices อัปเดต
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'แนบ invoice ไม่สำเร็จ'
  } finally {
    busy.value = false
  }
}

async function removeInvoice(inv: InvoiceFile) {
  busy.value = true
  error.value = ''
  try {
    await unlinkGrpoInvoice(props.grpoId, inv.id)
    if (selected.value?.id === inv.id) {
      revokePreview()
      selected.value = null
    }
    emit('changed')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'ถอด invoice ไม่สำเร็จ'
  } finally {
    busy.value = false
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function close() {
  emit('update:open', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
      revokePreview()
      selected.value = null
      error.value = ''
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  revokePreview()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        @mousedown.self="close">
        <div class="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <!-- header -->
          <div class="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg text-blue-500">
                <i class="fa-solid fa-file-invoice" />
              </div>
              <div>
                <h3 class="text-lg font-semibold text-gray-900">ใบแจ้งหนี้ (Invoice)</h3>
                <p class="text-sm text-gray-500">รอบรับของ <span class="font-mono">{{ grpoNo }}</span></p>
              </div>
            </div>
            <button type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500"
              aria-label="Close" @click="close">
              <i class="fa-solid fa-xmark" />
            </button>
          </div>

          <div class="grid min-h-[300px] flex-1 grid-cols-1 gap-4 overflow-hidden px-6 pb-4 md:grid-cols-[260px_1fr]">
            <!-- ซ้าย: รายการไฟล์ + ปุ่มแนบ -->
            <div class="flex flex-col overflow-y-auto max-h-96">
              <div class="flex-1 space-y-1.5 overflow-y-auto pr-1">
                <p v-if="invoices.length === 0"
                  class="rounded-lg bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">
                  ยังไม่มี invoice ในรอบนี้
                </p>
                <button v-for="inv in invoices" :key="inv.id" type="button" @click="selectForPreview(inv)"
                  class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
                  :class="selected?.id === inv.id ? 'border-blue-400 bg-blue-50' : 'border-[var(--line-color)] hover:bg-gray-50'">
                  <i class="fa-solid"
                    :class="inv.mimeType === 'application/pdf' ? 'fa-file-pdf text-red-500' : 'fa-file-image text-blue-500'" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[var(--primary-color)]">{{ inv.originalName }}</span>
                    <span class="text-xs text-gray-400">{{ formatSize(inv.size) }}</span>
                  </span>
                  <span v-if="editable" role="button" tabindex="0" title="ถอดออกจากรอบนี้"
                    class="rounded p-1 text-gray-400 transition-colors hover:text-red-600"
                    @click.stop="removeInvoice(inv)" @keydown.enter.stop="removeInvoice(inv)">
                    <i class="fa-solid fa-xmark" />
                  </span>
                </button>
              </div>

              <button type="button" :disabled="!editable || busy" @click="pickFile"
                class="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">
                <i class="fa-solid" :class="busy ? 'fa-spinner animate-spin' : 'fa-plus'" />
                {{ busy ? 'กำลังอัปโหลด...' : 'แนบไฟล์ใหม่' }}
              </button>
              <input ref="fileInput" type="file" class="hidden" accept=".pdf,.jpg,.jpeg,.png" @change="onFile" />
            </div>

            <!-- ขวา: preview -->
            <!-- ใส่ h-[350px] เพื่อ Fix ความสูงของกล่องไปเลย UI จะได้ไม่ดิ้น -->
            <div
              class="flex h-[350px] items-center justify-center overflow-hidden rounded-xl border border-[var(--line-color)] bg-gray-50">

              <p v-if="!selected" class="px-4 text-center text-sm text-gray-400">
                เลือกไฟล์ทางซ้ายเพื่อดูตัวอย่าง
              </p>
              <p v-else-if="previewLoading" class="text-sm text-gray-400">
                <i class="fa-solid fa-spinner animate-spin mr-2" />กำลังโหลด...
              </p>

              <!-- รูปภาพ -->
              <div v-else-if="isImage && previewUrl"
                class="group relative flex h-full w-full items-center justify-center">
                <button type="button"
                  class="absolute right-2 top-2 p-2 text-zinc-500 opacity-80 transition-all duration-200 group-hover:opacity-100 hover:text-zinc-800"
                  @click="openInvoiceFile(selected!.id)">
                  <i class="fa-solid fa-up-right-from-square"></i>
                </button>
                <!-- เปลี่ยนจาก max-h-[60vh] เป็น h-full และ w-full เพื่อให้อยู่ในกล่อง 350px พอดี -->
                <img :src="previewUrl" alt="invoice preview" class="h-full w-full object-contain p-2" />
              </div>

              <!-- PDF -->
              <div v-else-if="isPdf && previewUrl" class="relative h-full w-full">
                <button type="button"
                  class="absolute right-5 top-2 p-2 text-zinc-500 opacity-80 transition-all duration-200 group-hover:opacity-100 hover:text-zinc-800"
                  @click="openInvoiceFile(selected!.id)">
                  <i class="fa-solid fa-up-right-from-square"></i>
                </button>
                <!-- เปลี่ยนจาก h-[60vh] เป็น h-full -->
                <iframe :src="`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`" class="h-full w-full"
                  title="invoice pdf" />
              </div>

              <div v-else class="px-4 text-center text-sm text-gray-500">
                <i class="fa-solid fa-file mb-2 block text-2xl" />
                <p class="mb-2">{{ selected.originalName }}</p>
                <button type="button" class="text-black-600 underline"
                  @click="openInvoiceFile(selected.id)">เปิดในแท็บใหม่</button>
              </div>
            </div>
          </div>

          <p v-if="error" class="mx-6 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>

          <div class="bg-gray-50 px-6 py-3 text-right">
            <button type="button" @click="close"
                  class="inline-flex w-full justify-center rounded-xl px-4 py-2
                  text-sm font-semibold text-white shadow-sm
                  bg-blue-600 hover:bg-blue-700
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  sm:w-auto transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed">

              บันทึก
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
