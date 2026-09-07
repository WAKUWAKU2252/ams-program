<script setup lang="ts">
/**
 * กล่องแนบ/เปลี่ยนรูปสินทรัพย์ - เปิดซ้อนบนกล่องรายละเอียด (AppAssetDetail)
 *
 * ── ทำไมเป็นสองขั้น: เลือกไฟล์ แล้วค่อยกดยืนยัน ─────────────────────────────
 *
 * การอัปโหลดกับการผูกรูปเข้ากับสินทรัพย์เป็นคนละเรื่องกัน:
 *   เลือกไฟล์ = อัปขึ้น /uploads ได้ id กลับมา (ยังไม่มีใครชี้ถึง = ไฟล์กำพร้า)
 *   กดยืนยัน  = PATCH /assets/:id/image ผูก id นั้นเข้ากับชิ้น
 *
 * ★ แยกสองขั้นเพราะผู้ใช้ต้อง "เห็นก่อนว่าได้รูปอะไร" แล้วค่อยตัดสินใจ - รูปที่ถ่ายจาก
 *   มือถือหน้างานมักเบลอ/ผิดชิ้น การผูกทันทีที่เลือกไฟล์แปลว่าพลาดแล้วแก้ไม่ทัน
 *   (ที่นี่ยกเลิกได้ ไฟล์ที่อัปค้างไว้กลายเป็นกำพร้าแล้ว cleanupOrphans กวาดใน 24 ชม.)
 *
 * ★ ไม่มีปุ่ม "ลบรูป" โดยตั้งใจ - backend ไม่รับ null ที่เส้นนี้ (ดู updateAssetImageBody)
 *   รูปคือสิ่งเดียวที่คนหน้างานใช้ยืนยันว่าของตรงหน้าคือชิ้นเดียวกับในทะเบียน
 *   กล่องที่ "ใครก็เปิดได้" ไม่ควรมีทางลบของนั้นทิ้ง
 */
import { computed, ref, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/shared/services/httpClient'
import { uploadModuleFiles, fileBlobUrl } from '@/shared/services/attachment.service'
import { updateAssetImage } from '@/shared/services/asset.service'

const props = defineProps<{
  open: boolean
  /** ชิ้นที่จะเปลี่ยนรูป - null = ยังไม่มีข้อมูล กล่องไม่ควรถูกเปิด */
  assetId: number | null
  /** blob URL ของรูปเดิม - ส่งมาเพื่อ preview ไว้ก่อน (null = ชิ้นนี้ยังไม่มีรูป) */
  currentImageUrl?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** ผูกรูปใหม่สำเร็จแล้ว - ผู้เรียกต้องโหลดรายละเอียดใหม่เพื่อให้ imageId ตรงกับของจริง */
  (e: 'saved'): void
}>()

/**
 * ต้องตรงกับ RULES.ASSET_IMG ฝั่ง backend (upload.service.ts) - เช็คสองชั้นโดยตั้งใจ:
 * ที่นี่เพื่อบอกผู้ใช้ทันทีโดยไม่ต้องรอส่งไฟล์ 5MB ขึ้นไปก่อนแล้วค่อยรู้ว่าไม่ผ่าน
 * ที่ backend เพราะ client เชื่อไม่ได้ (ยิง API ตรงข้าม UI ได้เสมอ)
 */
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_MAX_BYTES = 5 * 1024 * 1024

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const saving = ref(false)
const error = ref('')

/** id ของไฟล์ที่เพิ่งอัป - null = ยังไม่ได้เลือกรูปใหม่ (ยังโชว์รูปเดิมอยู่) */
const pickedId = ref<string | null>(null)
/** blob URL ของรูปที่เพิ่งอัป - ต้อง revoke เองทุกครั้งที่ทิ้ง ไม่งั้นรั่วสะสม */
const pickedUrl = ref('')

/** รูปที่กำลังโชว์ - ของใหม่ชนะของเดิมเสมอ */
const previewUrl = computed(() => pickedUrl.value || props.currentImageUrl || '')
const isReplacing = computed(() => !!props.currentImageUrl)

function releasePicked() {
  if (pickedUrl.value) {
    URL.revokeObjectURL(pickedUrl.value)
    pickedUrl.value = ''
  }
  pickedId.value = null
}

/**
 * รีเซ็ตทุกครั้งที่เปิดใหม่ - กล่องนี้ไม่ถูก unmount ตอนปิด (สลับคลาส modal-open เอา)
 * ถ้าไม่ล้าง รูปที่เลือกค้างไว้จากชิ้นก่อนจะโผล่มาเป็นรูปของชิ้นถัดไปทันทีที่เปิด
 */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    releasePicked()
    error.value = ''
    if (fileInput.value) fileInput.value.value = ''
  },
)

onUnmounted(releasePicked)

async function pickFile(file: File) {
  if (!IMAGE_MIME.includes(file.type)) {
    error.value = 'รับเฉพาะไฟล์ JPG, PNG หรือ WebP'
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    error.value = `ไฟล์ใหญ่เกินไป (สูงสุด ${IMAGE_MAX_BYTES / 1024 / 1024} MB)`
    return
  }

  error.value = ''
  uploading.value = true
  try {
    const { files } = await uploadModuleFiles('ASSET_IMG', [file])
    const uploaded = files[0]
    // backend คืน array - ว่างแปลว่าสัญญาไม่ตรงกัน ต้องรู้ ไม่ใช่เงียบแล้วปล่อยกล่องค้าง
    if (!uploaded) throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับ id ไฟล์กลับมา')

    // endpoint ดาวน์โหลดอยู่หลัง authGuard - ใส่ URL ตรง ๆ ใน <img src> จะได้ 401
    // fileBlobUrl แนบ token ให้แล้วคืน blob: มาแทน
    const url = await fileBlobUrl(uploaded.id)
    releasePicked()
    pickedId.value = uploaded.id
    pickedUrl.value = url
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'อัปโหลดรูปไม่สำเร็จ'
  } finally {
    uploading.value = false
    // ล้างค่าใน input - ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่เกิด change event (ค่าไม่เปลี่ยน)
    if (fileInput.value) fileInput.value.value = ''
  }
}

function onSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) void pickFile(file)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  if (uploading.value || saving.value) return
  const file = e.dataTransfer?.files?.[0]
  if (file) void pickFile(file)
}

async function submit() {
  const id = props.assetId
  const imageId = pickedId.value
  // ไม่มีรูปใหม่ = ไม่มีอะไรให้บันทึก (ปุ่มถูก disable ไว้แล้ว - กันซ้ำที่นี่อีกชั้น)
  if (!id || !imageId || saving.value) return

  saving.value = true
  error.value = ''
  try {
    await updateAssetImage(id, imageId)
    // ★ ห้าม revoke pickedUrl ตรงนี้ - ผู้เรียกกำลังจะโหลดรายละเอียดใหม่ซึ่งดึง blob ของ
    //   ตัวเองอยู่แล้ว ส่วนตัวนี้ปล่อยให้ watch(open) รอบหน้าเก็บกวาด
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'บันทึกรูปไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- ⚠️ z ต้องมากกว่า 1000 - กล่องนี้เปิดซ้อนบน "รูปเต็มจอ" ของ AppAssetDetail ซึ่งอยู่ที่
         z-[1000] และซ้อนบน .modal ของ daisyUI (z-index:999) อีกที ทั้งหมด teleport ไป body
         เหมือนกัน ลำดับใน DOM จึงไม่พอตัดสินว่าใครทับใคร ต้องระบุ z ให้ชนะตรง ๆ -->
    <div
      class="modal z-[1100] backdrop-blur-sm"
      :class="{ 'modal-open': open }"
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-box flex max-h-[calc(100dvh-4rem)] max-w-2xl flex-col gap-3">
        <h3 class="text-lg font-semibold">
          {{ isReplacing ? 'เปลี่ยนรูปสินทรัพย์' : 'แนบรูปสินทรัพย์' }}
        </h3>

        <!-- กรอบรูป: เป็นทั้งที่โชว์ preview และที่กดเพื่อเลือกไฟล์/ลากมาวาง
             ★ กดที่ไหนก็ได้ในกรอบ ไม่ใช่แค่ปุ่มเล็ก ๆ - หน้างานใช้มือถือ เป้าใหญ่กดง่ายกว่า -->
        <button
          type="button"
          class="grid h-72 w-full grid-rows-1 place-items-center overflow-hidden rounded-lg border-2 border-dashed border-base-300 bg-base-200 transition-colors hover:border-primary disabled:cursor-not-allowed"
          :disabled="uploading || saving"
          @click="fileInput?.click()"
          @drop="onDrop"
          @dragover.prevent.stop
        >
          <span v-if="uploading" class="loading loading-spinner loading-lg" />

          <!-- object-contain ไม่ใช่ cover - ที่นี่คือที่ที่ผู้ใช้ตรวจว่ารูปถูกชิ้นไหม
               การเฉือนขอบทิ้งแบบ cover ทำให้ตัดส่วนที่เขาต้องดู (ป้าย S/N มักอยู่ริม) -->
          <img
            v-else-if="previewUrl"
            :src="previewUrl"
            alt="รูปสินทรัพย์"
            class="size-full object-contain"
          />

          <span v-else class="flex flex-col items-center gap-2 text-base-content/50">
            <Icon icon="lucide:image-plus" class="size-10" />
            <span class="text-sm">กดเพื่อเลือกรูป หรือลากไฟล์มาวาง</span>
            <span class="text-xs">JPG, PNG, WebP · ไม่เกิน 5 MB</span>
          </span>
        </button>

        <input
          ref="fileInput"
          type="file"
          class="hidden"
          accept="image/jpeg,image/png,image/webp"
          @change="onSelect"
        />

        <!-- บอกให้ชัดว่ากำลังจะทับของเดิม - ไม่งั้นคนที่เปิดมาเห็นรูปเดิมจะไม่รู้ว่าต้องเลือกใหม่ -->
        <p v-if="isReplacing && !pickedId" class="text-xs text-base-content/60">
          เลือกรูปใหม่เพื่อแทนที่
        </p>

        <div v-if="error" role="alert" class="alert alert-error alert-soft py-2">
          <Icon icon="mdi:alert-circle-outline" class="size-5 shrink-0" />
          <span class="text-sm">{{ error }}</span>
        </div>

        <div class="modal-action mt-0">
          <button type="button" class="btn" :disabled="saving" @click="emit('update:open', false)">
            ยกเลิก
          </button>
          <!-- ยืนยันได้เฉพาะเมื่อมีรูป "ใหม่" - กดยืนยันทั้งที่ยังเป็นรูปเดิมคือ PATCH
               ที่เขียนค่าเดิมทับตัวเอง ไม่มีประโยชน์และทำให้ updatedAt ขยับเปล่า ๆ -->
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!pickedId || uploading || saving"
            :title="pickedId ? 'บันทึกรูปนี้' : 'เลือกรูปใหม่ก่อน'"
            @click="submit"
          >
            <span v-if="saving" class="loading loading-spinner loading-xs" />
            ยืนยัน
          </button>
        </div>
      </div>

      <div class="modal-backdrop" @click="!saving && emit('update:open', false)"></div>
    </div>
  </Teleport>
</template>
