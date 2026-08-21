<script setup lang="ts">

import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import { createAsset, getAsset, updateAsset, type AssetFormPayload } from '@/services/asset.service'
import { ApiError } from '@/services/httpClient'
import type { AssetFormTarget } from '@/types/asset-form'
import type { DepartmentOption, MasterOption, SubLocationOption } from '@/services/master.service'
import AppDatePicker from './AppDatePicker.vue'
import AppEmployeeSelect from './AppEmployeeSelect.vue'
import { uploadModuleFiles, fileBlobUrl, deleteUploadedFile } from '@/services/attachment.service'
import { rejectRoleLabel } from '@/utils/reject-role'

const props = withDefaults(
  defineProps<{
    open: boolean
    requestId: number
    target: AssetFormTarget | null
    editable?: boolean
    locations?: MasterOption[]
    subLocations?: SubLocationOption[]
    departments?: DepartmentOption[]
    brand?: string
    model?: string
  }>(),
  {
    editable: true,
    locations: () => [],
    subLocations: () => [],
    departments: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
}>()

const isEdit = computed(() => props.target?.assetId != null)

/**
 * ชิ้นนี้ถูกตีกลับอยู่ไหม — ถ้าใช่ ต้องบอกว่า "ใครสั่งให้แก้ และให้แก้อะไร" คาไว้บนฟอร์ม
 *
 * ผู้ขอเปิดกล่องนี้มาเพื่อแก้ตามที่ถูกตีกลับพอดี ถ้าเหตุผลอยู่แต่ในตารางข้างนอก เขาต้องปิด
 * กล่องกลับไปอ่านแล้วเปิดใหม่ทุกครั้งที่ลืม — ซึ่งคือทุกครั้งที่ตีกลับมาหลายข้อ
 *
 * role บอกว่าต้องแก้คนละแบบ: ตีกลับทั้งใบ (หัวหน้า) ต้องกดส่งใหม่หลังแก้
 * ส่วนตีกลับรายชิ้น (บัญชี) แค่แก้ชิ้นนั้นแล้วมันกลับเข้าคิวเอง
 */
const rejection = computed(() => {
  const t = props.target
  if (!t?.rejectReason && !t?.rejectedByName) return null
  return {
    by: t.rejectedByName?.trim() || 'ไม่ทราบชื่อผู้กด',
    // ใช้ตัวแปลตัวเดียวกับ note ในตาราง (utils/reject-role) — ถ้าแยกกันนิยาม วันที่เพิ่ม
    // role ใหม่จะแปลที่เดียวแล้วอีกที่โชว์ค่าดิบ โดยไม่มีอะไรฟ้อง
    role: rejectRoleLabel(t.rejectedRole),
    reason: t.rejectReason?.trim() || 'ไม่ได้ระบุเหตุผล',
  }
})

const form = ref({
  description: props.target?.itemDescription || '',
  serialNumber: '',
  assetClass: '',
  acquisitionCost: 0,
  locationId: 0,
  subLocationId: 0,
  employeeId: 0,
  warrantyStartDate: '',
  warrantyEndDate: '',
  departmentId: 0,
  imageId: '',
})

const saving = ref(false)
const error = ref('')
const imagePreview = ref('')
const isUploadingImage = ref(false)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
// ★ เฉพาะรูปที่ "เพิ่งอัปในรอบนี้และยังไม่ได้บันทึก" — ใช้ตัดสินว่าปิดฟอร์มแล้วต้องลบทิ้งไหม
//   รูปเดิมของชิ้นที่โหลดมาแก้ ห้ามใส่ในนี้ ไม่งั้นกดยกเลิกแล้วรูปที่บันทึกไว้จะหายไปด้วย
const uploadedImageId = ref('')
// โหลดรายละเอียดของชิ้นเดิมอยู่ (เฉพาะตอนกดแก้ไข)
const loadingDetail = ref(false)
// เปลี่ยนสถานที่แล้ว sub-location เดิมอาจไม่ได้อยู่ใต้สถานที่ใหม่ — กรองตาม locationId ที่เลือก
const subLocationChoices = computed(() =>
  props.subLocations.filter((s) => s.locationId === form.value.locationId),
)
watch(
  () => form.value.locationId,
  () => {
    if (!subLocationChoices.value.some((s) => s.id === form.value.subLocationId)) {
      form.value.subLocationId = 0
    }
  },
)
onBeforeUnmount(() => {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  discardPendingImage()
})

/**
 * ทิ้งรูปที่อัปแล้วแต่ยังไม่ได้ผูกกับ asset — เรียกตอนปิดฟอร์มโดยไม่บันทึก
 *
 * ไม่ต้องรอผลและไม่ต้องแจ้ง error: ต่อให้ลบไม่สำเร็จ ไฟล์ก็แค่กลายเป็นกำพร้าซึ่ง
 * cleanupOrphans ฝั่ง backend กวาดให้เองใน 24 ชม. (ทำตรงนี้แค่ไม่ให้กองไว้เปล่า ๆ)
 */
function discardPendingImage() {
  if (!uploadedImageId.value) return
  deleteUploadedFile(uploadedImageId.value).catch(() => {})
  uploadedImageId.value = ''
}

// หน้านี้ไม่กรอก category/uom — สองตัวนั้นอยู่ที่ OITM ของ SAP ไม่ได้อยู่บน PO
// ถูกถอดออกจาก createAssetBody และทำเป็น nullable แล้วใน migration 0007
const masterMissing = computed(() => !props.locations.length)
const canSave = computed(() => {
  if (!props.editable || saving.value || isUploadingImage.value) return false
  // ★ ห้ามบันทึกระหว่างโหลดของเดิม — ตอนนั้นฟอร์มยังเป็นค่าว่างที่รีเซ็ตไว้
  //   กดแล้วจะ PATCH ทับสถานที่/ผู้ถือครอง/ประกันที่บันทึกไว้ให้หายหมด
  if (loadingDetail.value) return false
  // สร้างชิ้นใหม่ต้องเลือกสถานที่ก่อน — locationId เป็น FK NOT NULL ที่ DB และ backend
  // บังคับ minimum: 1 ปล่อยให้กดได้ตอนยังเป็น 0 จะได้ 422 กลับมาแทนที่จะกันไว้ตั้งแต่ปุ่ม
  if (!isEdit.value && form.value.locationId <= 0) return false
  return true
})

const hasImage = computed(() => !!uploadedImageId.value || !!form.value.imageId)

/** backend คืน ISO เต็ม ('2026-08-13T00:00:00.000Z') แต่ AppDatePicker ใช้ 'YYYY-MM-DD' */
const toDateInput = (iso: string | null) => iso?.slice(0, 10) ?? ''

watch(
  () => [props.open, props.target] as const,
  async ([open, target]) => {
    if (!open || !target) return
    error.value = ''
    uploadError.value = ''
    uploadedImageId.value = ''
    if (imagePreview.value) {
      URL.revokeObjectURL(imagePreview.value)
      imagePreview.value = ''
    }

    // ตั้งค่าจาก target ก่อนเสมอ — ทั้งกรณีสร้างใหม่ และเป็นค่าตั้งต้นระหว่างรอโหลดของเดิม
    // (ถ้าไม่ล้างก่อน ค่าของชิ้นที่เปิดดูรอบก่อนจะค้างให้เห็นชั่ววินาที แล้วดูเหมือนกรอกไว้แล้ว)
    form.value = {
      description: target.itemDescription || '',
      serialNumber: target.serialNumber ?? '',
      assetClass: '',
      acquisitionCost: target.acquisitionCost,
      locationId: 0,
      subLocationId: 0,
      employeeId: 0,
      warrantyStartDate: '',
      warrantyEndDate: '',
      departmentId: 0,
      imageId: '',
    }

    if (target.assetId == null) return

    // ── โหมดแก้ไข: ดึงของที่บันทึกไว้จริงมาเติม ─────────────────────────────
    // target มีแค่ข้อมูลที่ตารางรู้ (คำอธิบาย/serial/ราคา) — สถานที่ ผู้ถือครอง ประกัน รูป
    // อยู่ในแถว asset เท่านั้น ไม่ดึงมาจะเห็นฟอร์มว่างแล้วเข้าใจผิดว่ายังไม่เคยกรอก
    loadingDetail.value = true
    const assetId = target.assetId
    try {
      const detail = await getAsset(assetId)

      // เปลี่ยนช่องระหว่างรอ fetch ได้ (ผู้ใช้ปิดแล้วเปิดชิ้นอื่น) — ถ้าไม่เช็ค
      // ข้อมูลของชิ้นเก่าจะมาทับสิ่งที่กำลังดูอยู่
      if (props.target?.assetId !== assetId) return

      form.value = {
        description: detail.description ?? '',
        serialNumber: detail.serialNumber ?? '',
        assetClass: detail.assetClass ?? '',
        acquisitionCost: detail.acquisitionCost,
        locationId: detail.locationId,
        subLocationId: detail.subLocationId ?? 0,
        employeeId: detail.employeeId ?? 0,
        warrantyStartDate: toDateInput(detail.warrantyStartDate),
        warrantyEndDate: toDateInput(detail.warrantyEndDate),
        departmentId: detail.departmentId ?? 0,
        imageId: detail.imageId ?? '',
      }

      // ★ ไม่เซ็ต uploadedImageId — รูปนี้ผูกกับ asset แล้ว ถ้าใส่ไว้ กดยกเลิกจะไปลบของจริง
      if (detail.imageId) {
        try {
          imagePreview.value = await fileBlobUrl(detail.imageId)
        } catch {
          // โหลดรูปไม่ขึ้นไม่ควรทำให้แก้ข้อมูลอื่นไม่ได้ — ปล่อยให้ขึ้น spinner ค้างแทน
          uploadError.value = 'โหลดรูปที่แนบไว้ไม่สำเร็จ'
        }
      }
    } catch (e) {
      error.value =
        e instanceof ApiError ? e.message : 'โหลดข้อมูลเดิมไม่สำเร็จ — แก้ไขตอนนี้อาจทับข้อมูลที่มีอยู่'
    } finally {
      loadingDetail.value = false
    }
  },
  { immediate: true },
)

function close() {
  if (saving.value) return
  // ปิดทั้งที่ยังไม่บันทึก = รูปที่อัปไว้ไม่มีวันถูกผูกกับ asset ไหน ทิ้งไปเลย
  discardPendingImage()
  emit('update:open', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

// ไม่ต้องล็อก scroll เอง — daisyUI ทำให้แล้วผ่าน :root:has(.modal.modal-open)
// (ล็อกที่ :root พร้อม scrollbar-gutter: stable ล็อกเองที่ body จะทำให้หน้าเลื่อนเพราะ scrollbar หาย)
watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

// ─── Image Upload Handlers ───────────────────────────────────────────────────

// ต้องตรงกับ RULES.ASSET_IMG ฝั่ง backend (upload.service.ts) — เช็คสองชั้นโดยตั้งใจ:
// ที่นี่เพื่อบอกผู้ใช้ทันทีโดยไม่ต้องรอส่งไฟล์ 5MB ขึ้นไปแล้วค่อยรู้ว่าไม่ผ่าน
// ที่ backend เพราะ client เชื่อไม่ได้ (ยิง API ตรงข้าม UI ได้เสมอ)
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** จุดเดียวที่อัปรูป — ทั้งปุ่มเลือกไฟล์และการลากมาวางเรียกตัวนี้ */
async function uploadImage(file: File) {
  if (!IMAGE_MIME.includes(file.type)) {
    uploadError.value = 'รับเฉพาะไฟล์ JPG, PNG หรือ WebP'
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    uploadError.value = `ไฟล์ใหญ่เกินไป (สูงสุด ${IMAGE_MAX_BYTES / 1024 / 1024} MB)`
    return
  }

  uploadError.value = ''
  isUploadingImage.value = true

  // ตัวเก่าต้องถูกลบ "หลัง" ตัวใหม่ขึ้นสำเร็จ — ลบก่อนแล้วอัปพัง จะเหลือฟอร์มที่ไม่มีรูปเลย
  // ทั้งที่ผู้ใช้แค่อยากเปลี่ยนรูป (ของเดิมหายไปโดยไม่ได้ตั้งใจและกู้ไม่ได้)
  const previous = uploadedImageId.value

  try {
    const { files } = await uploadModuleFiles('ASSET_IMG', [file])
    const uploaded = files[0]
    // backend คืน array — ถ้าว่างแปลว่าสัญญาไม่ตรงกัน ต้องรู้ ไม่ใช่เงียบแล้วปล่อยฟอร์มค้าง
    if (!uploaded) throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับ id ไฟล์กลับมา')

    uploadedImageId.value = uploaded.id
    form.value.imageId = uploaded.id

    // endpoint อยู่หลัง authGuard ใส่ URL ตรง ๆ ใน <img src> จะได้ 401 — fileBlobUrl แนบ token ให้
    const nextPreview = await fileBlobUrl(uploaded.id)
    if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
    imagePreview.value = nextPreview

    if (previous) {
      // ลบไม่สำเร็จไม่ใช่เรื่องที่ผู้ใช้ต้องรับรู้ — รูปใหม่ขึ้นแล้ว ส่วนตัวเก่ากลายเป็นกำพร้า
      // ซึ่ง cleanupOrphans ฝั่ง backend กวาดให้เองใน 24 ชม.
      deleteUploadedFile(previous).catch(() => {})
    }
  } catch (e) {
    uploadError.value = e instanceof ApiError ? e.message : 'อัปโหลดรูปไม่สำเร็จ'
  } finally {
    isUploadingImage.value = false
    // เคลียร์ค่าใน input — ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่เกิด change event (ค่าไม่เปลี่ยน)
    if (fileInput.value) fileInput.value.value = ''
  }
}

function handleImageSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void uploadImage(file)
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (!props.editable || isUploadingImage.value) return

  const file = event.dataTransfer?.files?.[0]
  if (file) void uploadImage(file)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

async function removeImage() {
  if (uploadedImageId.value) {
    try {
      await deleteUploadedFile(uploadedImageId.value)
    } catch (e) {
      console.error('ลบรูปไม่สำเร็จ:', e)
    }
  }
  uploadedImageId.value = ''
  form.value.imageId = ''
  if (imagePreview.value) {
    URL.revokeObjectURL(imagePreview.value)
    imagePreview.value = ''
  }
  if (fileInput.value) fileInput.value.value = ''
}

// ─── Form Payload Builder ────────────────────────────────────────────────────

// ช่องที่เว้นว่างต้องส่ง undefined ไม่ใช่ '' หรือ 0 — คอลัมน์เป็น nullable
// ส่ง '' ไปจะได้ค่าสตริงว่างที่แยกไม่ออกจาก "ยังไม่กรอก" ส่วน 0 ไม่ผ่าน minimum: 1 ของ backend
//
// imageId เป็นข้อยกเว้นเดียว — ตอนแก้ไขต้องส่ง null ไม่ใช่ undefined เมื่อผู้ใช้กดลบรูป
// undefined = "ไม่ได้แก้ช่องนี้" ซึ่ง backend จะไม่แตะคอลัมน์ แล้วรูปเดิมยังผูกอยู่
// (ฝั่ง create รับ null ไม่ได้ — ไม่มีรูปก็แค่ไม่ส่ง key มา จึงต้องแยกสองโหมด)
// overload: โหมด update คืนชนิดที่ imageId เป็น null ได้ / โหมด create คืนชนิดที่เป็นไม่ได้
// — ให้ compiler บังคับความต่างนี้แทนที่จะพึ่งว่าคนอ่านคอมเมนต์แล้วจำได้
function buildPayload(forUpdate: true): AssetFormPayload
function buildPayload(forUpdate: false): AssetFormPayload & { imageId?: string }
function buildPayload(forUpdate: boolean): AssetFormPayload {
  const f = form.value
  const text = (v: string) => v.trim() || undefined
  const id = (v: number) => (v > 0 ? v : undefined)
  const uuid = (v: string) => v || (forUpdate ? null : undefined)
  // ช่องข้อความที่ "ลบทิ้งได้" — ตอนแก้ไขต้องส่ง null ไม่ใช่ undefined เมื่อผู้ใช้ล้างช่อง
  // (undefined = ไม่ได้แก้ backend ไม่แตะคอลัมน์ แล้วค่าเดิมจะยังอยู่แบบเงียบ ๆ)
  // ฝั่ง create ยังเป็น undefined เหมือนเดิม — ไม่มีค่าก็แค่ไม่ส่ง key มา
  const clearable = (v: string) => v.trim() || (forUpdate ? null : undefined)

  return {
    description: text(f.description),
    serialNumber: clearable(f.serialNumber),
    assetClass: text(f.assetClass),
    locationId: id(f.locationId),
    subLocationId: id(f.subLocationId),
    departmentId: id(f.departmentId),
    employeeId: id(f.employeeId),
    warrantyStartDate: text(f.warrantyStartDate),
    warrantyEndDate: text(f.warrantyEndDate),
    acquisitionCost: f.acquisitionCost,
    imageId: uuid(f.imageId),
  }
}

async function onSave() {
  const target = props.target
  if (!target || saving.value || isUploadingImage.value) return

  // ห้ามบันทึกถ้ายังมี error ตรง upload
  if (uploadError.value) {
    error.value = 'กรุณาตรวจสอบรูปภาพก่อนบันทึก'
    return
  }

  saving.value = true
  error.value = ''

  try {
    if (target.assetId != null) {
      await updateAsset(target.assetId, buildPayload(true))
    } else {
      await createAsset({
        ...buildPayload(false),
        requestId: props.requestId,
        grpoLineId: target.grpoLineId,
        unitNo: target.unitNo,
        // canSave กันไว้แล้วว่าไม่ว่าง — ที่นี่แค่บอก TS ว่าเป็น required ของ create
        locationId: form.value.locationId,
      })
    }

    // บันทึกสำเร็จ — ไม่ต้องลบรูป เพราะรูปถูกผูกกับ asset แล้ว
    uploadedImageId.value = ''
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ โปรดลองอีกครั้ง'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal py-10 backdrop-blur-sm" :class="{ 'modal-open': open }" role="dialog" aria-modal="true">
      <div v-if="target" class="modal-box max-w-3xl ">
        <!-- header -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg text-primary"
            >
              <Icon icon="lucide:package" />
            </div>
            <div class="text-left">
              <h3 class="text-lg font-semibold">
                {{ isEdit ? 'แก้ไขรายละเอียดสินทรัพย์' : 'กรอกรายละเอียดสินทรัพย์' }}
              </h3>
              <p class="text-sm text-base-content/60">
                ช่อง <span class="font-mono">{{ target.poLine }}.{{ target.unitNo }}</span>
                · รอบรับของ <span class="font-mono">{{ target.grpoNo }}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            aria-label="Close"
            :disabled="saving"
            @click="close"
          >
            <Icon icon="lucide:x" />
          </button>
        </div>

        <p class="mt-3 truncate text-left text-sm text-base-content/70" :title="target.itemDescription">
          {{ target.itemDescription }}
        </p>

        <!-- ── ชิ้นนี้ถูกตีกลับ: ใครสั่ง และให้แก้อะไร
             ต้องอยู่เหนือฟอร์มและอ่านได้ตลอดเวลาที่กรอก เพราะนี่คือโจทย์ของการเปิดกล่องนี้
             ไม่ใส่ truncate/บรรทัดเดียว — เหตุผลตีกลับยาวได้และตัดทิ้งไม่ได้สักคำ -->
        <div v-if="rejection" role="alert" class="alert alert-warning alert-soft mt-3 items-start text-left">
          <Icon icon="mdi:undo-variant" class="size-5 shrink-0" />
          <div class="min-w-0">
            <div class="text-sm font-medium">
              ถูกตีกลับโดยคุณ {{ rejection.by }}
              <span v-if="rejection.role" class="font-normal opacity-70">· {{ rejection.role }}</span>
            </div>
            <div class="mt-0.5 text-sm break-words whitespace-pre-line">
              เหตุผล: {{ rejection.reason }}
            </div>
          </div>
        </div>

        <!-- โหลดของเดิมอยู่ — ต้องบอก ไม่งั้นผู้ใช้เห็นฟอร์มว่างแล้วเริ่มพิมพ์ทับ
             แล้วค่าที่โหลดมาจะเด้งมาทับสิ่งที่เพิ่งพิมพ์ -->
        <div v-if="loadingDetail" class="alert alert-info alert-soft mt-3">
          <span class="loading loading-spinner loading-sm"></span>
          <span>กำลังโหลดข้อมูลที่บันทึกไว้...</span>
        </div>

        <div class="grid grid-cols-1 gap-x-6 py-4 text-left md:grid-cols-2">

          <fieldset class="fieldset">
            <!-- ─── Image Upload Zone ─────────────────────────────────── -->
            <legend class="fieldset-legend">รูปถ่าย</legend>
            <div
              v-if="!hasImage"
              class="border-2 border-dashed border-base-content/20 rounded-box p-8 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors"
              @dragover="handleDragOver"
              @drop="handleDrop"
            >
              <label class="flex flex-col items-center gap-3 cursor-pointer">
                <Icon icon="lucide:image-plus" class="w-12 h-12 opacity-50" />
                <div>
                  <p class="font-semibold text-sm">ลากรูปมาวางที่นี่หรือคลิกเพื่อเลือก</p>
                  <p class="text-xs opacity-60 mt-1">JPG, PNG หรือ WebP (สูงสุด 5 MB)</p>
                </div>
                <input
                  ref="fileInput"
                  type="file"
                  class="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  :disabled="isUploadingImage || !editable"
                  @change="handleImageSelect"
                />
              </label>
            </div>

            <!-- ─── Image Preview ──────────────────────────────────────── -->
            <div v-else class="relative">
              <div class="relative bg-base-200 rounded-box overflow-hidden">
                <img
                  v-if="imagePreview"
                  :src="imagePreview"
                  alt="รูปสินทรัพย์"
                  class="w-full h-48 object-cover"
                />
                <div v-else class="w-full h-48 flex items-center justify-center bg-base-300">
                  <span class="loading loading-spinner loading-lg"></span>
                </div>
              </div>
              <button
                v-if="editable"
                type="button"
                class="absolute top-2 right-2 btn btn-error btn-sm btn-circle"
                :disabled="isUploadingImage"
                @click="removeImage"
              >
                <Icon icon="lucide:x" class="w-4 h-4" />
              </button>
            </div>

            <!-- ─── Upload Status ──────────────────────────────────────── -->
            <div v-if="isUploadingImage" class="mt-3 flex items-center gap-2 text-sm">
              <span class="loading loading-spinner loading-sm"></span>
              <span>กำลังอัปโหลด...</span>
            </div>
            
            <div v-else-if="uploadError" role="alert" 
            class="alert alert-error alert-outline mt-1">
              <Icon icon="lucide:alert-circle" />
              <span>{{ uploadError }}</span>
            </div>

            <!-- ─── Details Section ────────────────────────────────────── -->
            <legend class="fieldset-legend mt-6">รายละเอียด</legend>
            <input
              v-model="form.description"
              type="text"
              class="input w-full text-ellipsis overflow-hidden whitespace-nowrap"
              maxlength="100"
              :placeholder=" target.itemDescription || 'รายละเอียด'"
              :disabled="!editable"
            />

            <legend class="fieldset-legend">Serial number</legend>
            <input
              v-model="form.serialNumber"
              type="text"
              class="input w-full"
              maxlength="100"
              placeholder="เลขเครื่อง"
              :disabled="!editable"
            />
            <fieldset>


            </fieldset>

            <legend class="fieldset-legend">ราคาทุนต่อชิ้น</legend>
            <label class="input w-full">
              <input v-model.number="form.acquisitionCost" type="number" min="0" step="1" :disabled="!editable" />
              <span class="label">฿</span>
            </label>
            <p class="label">ค่าตั้งต้นมาจาก unit price ของ PO line</p>

            
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">ระยะประกัน</legend>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p class="label mb-1">เริ่ม</p>
                <AppDatePicker
                  v-model="form.warrantyStartDate"
                  placeholder="วันเริ่มประกัน"
                  :max="form.warrantyEndDate || undefined"
                  :disabled="!editable"
                />
              </div>
              <div>
                <p class="label mb-1">สิ้นสุด</p>
                <!-- min = วันเริ่ม → เลือกวันสิ้นสุดก่อนวันเริ่มไม่ได้ตั้งแต่ในปฏิทิน -->
                <AppDatePicker
                  v-model="form.warrantyEndDate"
                  placeholder="วันสิ้นสุดประกัน"
                  :min="form.warrantyStartDate || undefined"
                  :disabled="!editable"
                />
              </div>
            </div>
            <!-- บันทึกลง asset.departmentId ตั้งแต่ 0008 — คนละแกนกับผู้ถือครองข้างล่าง
                 ของกลาง (ห้องประชุม/โรงอาหาร) ไม่มีเจ้าของแต่ยังระบุแผนกที่รับผิดชอบได้ -->
            <legend class="fieldset-legend">Department</legend>
            <select
              v-model.number="form.departmentId"
              class="select w-full"
              :disabled="!editable || !departments.length"
            >
              <option :value="0">— ไม่ระบุ —</option>
              <option v-for="d in departments" :key="d.id" :value="d.id">{{d.departmentId}} - {{ d.name }}</option>
            </select>

            <legend class="fieldset-legend">ผู้ถือครอง</legend>
            <AppEmployeeSelect v-model="form.employeeId" :disabled="!editable" />


            <legend class="fieldset-legend">
              Location<span v-if="!isEdit" class="text-error">*</span>
            </legend>
            <select v-model.number="form.locationId" class="select w-full" :disabled="!editable || !locations.length">
              <option :value="0" disabled>— เลือกสถานที่ —</option>
              <option v-for="l in locations" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>

            <legend class="fieldset-legend">Sub location</legend>
            <select
              v-model.number="form.subLocationId"
              class="select w-full"
              :disabled="!editable || !subLocationChoices.length"
            >
              <option :value="0">— ไม่ระบุ —</option>
              <option v-for="s in subLocationChoices" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <p class="label">เลือกสถานที่ก่อน จึงจะมีชั้น/ห้องให้เลือก</p>

            
          </fieldset>
        </div>

        <div v-if="error" role="alert" class="alert alert-error alert-soft">
          <Icon icon="lucide:circle-alert" />
          <span>{{ error }}</span>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="saving" @click="close">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="!canSave" @click="onSave">
            <span v-if="saving" class="loading loading-spinner loading-sm"></span>
            {{ isEdit ? 'บันทึกการแก้ไข' : 'บันทึก' }}
          </button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>
  </Teleport>
</template>
