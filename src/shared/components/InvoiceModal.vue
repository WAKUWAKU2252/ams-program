<script setup lang="ts">
// จัดการ invoice ของ "รอบรับของ" หนึ่งรอบ - 1 รอบแนบได้หลายใบ (grpo_invoice many-to-many)
// รายการซ้าย + preview ขวา (รูปโชว์ inline / PDF ฝัง iframe) - อัปโหลดทันทีที่เลือกไฟล์
import { ref, watch, onUnmounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { InvoiceFile } from '@/shared/services/asset.service'
import { uploadInvoice, linkGrpoInvoice, unlinkGrpoInvoice, invoiceBlobUrl, openInvoiceFile } from '@/shared/services/invoice.service'
import { ApiError } from '@/shared/services/httpClient'

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
const busy = ref(false) // อัปโหลด/ถอดอยู่ - กันกดซ้ำ
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

// ไม่ต้องล็อก scroll เอง - daisyUI ทำให้แล้วผ่าน :root:has(.modal.modal-open)
// (ล็อกที่ :root พร้อม scrollbar-gutter: stable ล็อกเองที่ body จะทำให้หน้าเลื่อนเพราะ scrollbar หาย)
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
      revokePreview()
      selected.value = null
      error.value = ''
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  revokePreview()
})
</script>

<template>
  <Teleport to="body">
    <div class="modal backdrop-blur-sm" :class="{ 'modal-open': open }" role="dialog" aria-modal="true">
      <div class="modal-box max-w-3xl">
        <!-- header -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-info/10 text-lg text-info"
            >
              <Icon icon="lucide:receipt-text" />
            </div>
            <div class="text-left">
              <h3 class="text-lg font-semibold">ใบแจ้งหนี้ (Invoice)</h3>
              <p class="text-sm text-base-content/60">
                รอบรับของ <span class="font-mono">{{ grpoNo }}</span>
              </p>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label="Close" @click="close">
            <Icon icon="lucide:x" />
          </button>
        </div>

        <div class="grid min-h-[300px] grid-cols-1 gap-4 py-4 md:grid-cols-[260px_1fr]">
          <!-- ซ้าย: รายการไฟล์ + ปุ่มแนบ -->
          <div class="flex max-h-96 flex-col">
            <div class="flex-1 space-y-1.5 overflow-y-auto pr-1">
              <p
                v-if="invoices.length === 0"
                class="rounded-box bg-base-200 px-3 py-4 text-center text-sm text-base-content/50"
              >
                ยังไม่มี invoice ในรอบนี้
              </p>
              <button
                v-for="inv in invoices"
                :key="inv.id"
                type="button"
                class="flex w-full items-center gap-2 rounded-box border px-3 py-2 text-left text-sm transition-colors"
                :class="
                  selected?.id === inv.id
                    ? 'border-primary bg-primary/5'
                    : 'border-base-300 hover:bg-base-200'
                "
                @click="selectForPreview(inv)"
              >
                <Icon
                  :icon="inv.mimeType === 'application/pdf' ? 'lucide:file-text' : 'lucide:file-image'"
                  :class="inv.mimeType === 'application/pdf' ? 'text-error' : 'text-info'"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{{ inv.originalName }}</span>
                  <span class="text-xs text-base-content/50">{{ formatSize(inv.size) }}</span>
                </span>
                <span
                  v-if="editable"
                  role="button"
                  tabindex="0"
                  title="ถอดออกจากรอบนี้"
                  class="btn btn-ghost btn-xs btn-square hover:text-error"
                  @click.stop="removeInvoice(inv)"
                  @keydown.enter.stop="removeInvoice(inv)"
                >
                  <Icon icon="lucide:x" />
                </span>
              </button>
            </div>

            <button
              type="button"
              class="btn btn-dash btn-primary btn-sm mt-3"
              :disabled="!editable || busy"
              @click="pickFile"
            >
              <span v-if="busy" class="loading loading-spinner loading-xs"></span>
              <Icon v-else icon="lucide:plus" />
              {{ busy ? 'กำลังอัปโหลด...' : 'แนบไฟล์ใหม่' }}
            </button>
            <input ref="fileInput" type="file" class="hidden" accept=".pdf,.jpg,.jpeg,.png" @change="onFile" />
          </div>

          <!-- ขวา: preview - fix ความสูงไว้ 350px กัน UI ดิ้นตอนสลับไฟล์ -->
          <div
            class="flex h-[350px] items-center justify-center overflow-hidden rounded-box border border-base-300 bg-base-200"
          >
            <p v-if="!selected" class="px-4 text-center text-sm text-base-content/50">
              เลือกไฟล์ทางซ้ายเพื่อดูตัวอย่าง
            </p>
            <p v-else-if="previewLoading" class="flex items-center gap-2 text-sm text-base-content/50">
              <span class="loading loading-spinner loading-sm"></span>กำลังโหลด...
            </p>

            <!-- รูปภาพ -->
            <div v-else-if="isImage && previewUrl" class="group relative flex h-full w-full items-center justify-center">
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-square absolute right-2 top-2"
                aria-label="เปิดในแท็บใหม่"
                @click="openInvoiceFile(selected!.id)"
              >
                <Icon icon="lucide:external-link" />
              </button>
              <img :src="previewUrl" alt="invoice preview" class="h-full w-full object-contain p-2" />
            </div>

            <!-- PDF -->
            <div v-else-if="isPdf && previewUrl" class="relative h-full w-full">
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-square absolute right-5 top-2"
                aria-label="เปิดในแท็บใหม่"
                @click="openInvoiceFile(selected!.id)"
              >
                <Icon icon="lucide:external-link" />
              </button>
              <iframe
                :src="`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`"
                class="h-full w-full"
                title="invoice pdf"
              />
            </div>

            <div v-else class="px-4 text-center text-sm text-base-content/60">
              <Icon icon="lucide:file" class="mx-auto mb-2 text-2xl" />
              <p class="mb-2">{{ selected.originalName }}</p>
              <button type="button" class="btn btn-link btn-sm" @click="openInvoiceFile(selected.id)">
                เปิดในแท็บใหม่
              </button>
            </div>
          </div>
        </div>

        <div v-if="error" role="alert" class="alert alert-error alert-soft mb-2">
          <Icon icon="lucide:circle-alert" />
          <span>{{ error }}</span>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-primary" @click="close">บันทึก</button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>
  </Teleport>
</template>
