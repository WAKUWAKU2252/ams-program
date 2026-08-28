<script setup lang="ts">
// Modal รายละเอียดสินทรัพย์รายชิ้น — เปิดจากการกดแถวในตารางทะเบียน
//
// ── ทำไมเป็น modal ไม่ใช่การเด้งไปหน้าใหม่ ─────────────────────────────────
//
// หน้าทะเบียนคือหน้า "กวาดหา" — คนเปิดดูทีละหลายชิ้นเพื่อเทียบกัน การเด้งออกไป
// หน้ารายละเอียดทำให้เสียตำแหน่งหน้า คำค้น และตัวกรองทั้งหมด กลับมาต้องตั้งใหม่ทุกครั้ง
// (เส้น /assets/:company/:number ยังอยู่และยังเป็นปลายทางของ QR บนสติกเกอร์เหมือนเดิม
//  ตรงนั้นคือคนที่ยืนอยู่หน้าเครื่องจริง ซึ่งเป็นคนละพฤติกรรมกับคนที่นั่งไล่ทะเบียน)
//
// ── ยิง API ตอนเปิด ไม่ใช้ข้อมูลจากแถว ─────────────────────────────────────
//
// แถวในตารางมียอดบัญชีแค่ปีกับมูลค่าคงเหลือ (InventoryAccounting) ส่วนราคาทุน
// ค่าเสื่อมสะสม อายุการใช้งาน วิธีคิดค่าเสื่อม อยู่ในผลของ /assets/by-number เท่านั้น
// จึงยิงตอนเปิดจริง แล้วเอาข้อมูลจากแถวมาวาดหัวไปก่อนระหว่างรอ — จอไม่กระพริบเป็นว่าง
import { computed, ref, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import QRCode from 'qrcode'
import { getAssetByNumber } from '@/services/asset.service'
import type { AssetByNumberDetail } from '@/services/asset.service'
import { fileBlobUrl } from '@/services/attachment.service'
import { ApiError } from '@/services/httpClient'
import { formatDate, formatDateTime } from '@/utils/date'
import { formatMoney, formatMonths } from '@/utils/money'

/**
 * รูปย่อที่สุดที่ modal ต้องใช้เพื่อไปดึงรายละเอียดมาเอง
 *
 * ★ ตั้งใจให้เป็น interface กว้าง ๆ ไม่ผูกกับ InventoryItem — แถวจากคนละหน้าคนละชนิดกัน
 *   (InventoryItem ของทะเบียน / MyAssetItem ของ My asset) แต่ทุกตัวมีสองช่องนี้ครบ
 *   TypeScript เทียบโครงสร้าง ส่งเข้ามาได้เลยโดยไม่ต้อง map
 *
 * ★ companyCode จำเป็นคู่กับ assetNumber เสมอ — เลขซ้ำกันข้ามบริษัทจริง 24 ตัว
 */
export interface AssetRef {
  companyCode: string
  /** null = ยังไม่ออกเลข (ยังไม่ลงทะเบียน) — เปิดรายละเอียดไม่ได้ */
  assetNumber: string | null
  description?: string | null
  status?: string
  imageId?: string | null
}

const props = defineProps<{
  modelValue: boolean
  /** แถวที่ถูกกด — ใช้วาดหัวทันทีระหว่างรอผลจาก API */
  item: AssetRef | null
  /**
   * URL ที่ฝังใน QR ของสติกเกอร์ชิ้นนี้ — ส่งมาเมื่อหน้านั้นมีค่านี้อยู่แล้ว (My asset)
   *
   * ★ วาดจากค่านี้เท่านั้น ห้ามประกอบเองจาก assetNumber — ค่าที่เก็บคือค่าที่ตรงกับ
   *   สติกเกอร์ที่พิมพ์แปะไปแล้ว ถ้าจอประกอบเอง วันที่โดเมนเปลี่ยน จอจะโชว์ QR ที่พาไป
   *   คนละที่กับของจริงบนเครื่อง โดยไม่มีอะไรฟ้อง
   */
  qrCode?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const detail = ref<AssetByNumberDetail | null>(null)
const loading = ref(false)
const loadError = ref('')
const imageUrl = ref('')

const currentYear = new Date().getFullYear()

/** ตัวเลขบัญชีที่ค้างปีเก่า ต้องติดป้ายเตือน ไม่งั้นคนอ่านเลขปี 2022 เป็นมูลค่าวันนี้ */
const isStale = computed(
  () => !!detail.value?.accounting && detail.value.accounting.fiscalYear !== currentYear,
)

const close = () => emit('update:modelValue', false)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

function revokeImage() {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
}

async function load(item: AssetRef) {
  loading.value = true
  loadError.value = ''
  detail.value = null
  revokeImage()

  // ยังไม่ออกเลข = ไม่มีกุญแจให้ไปถามรายละเอียด ต้องบอกตรง ๆ ไม่ใช่ปล่อยหมุนค้าง
  // (เกิดได้กับของที่ยังเป็น DRAFT — หน้าที่ลิสต์เฉพาะ REGISTERED จะไม่เจอเคสนี้)
  if (!item.assetNumber) {
    loading.value = false
    loadError.value = 'ชิ้นนี้ยังไม่มีเลขสินทรัพย์ จึงยังเปิดรายละเอียดไม่ได้'
    return
  }

  try {
    detail.value = await getAssetByNumber(item.companyCode, item.assetNumber)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายละเอียดไม่สำเร็จ'
  } finally {
    loading.value = false
  }

  // รูปโหลดแยกและพังได้โดยไม่ลากทั้ง modal ตาย — ไฟล์ถูกลบจาก disk แต่ imageId ยังอยู่
  // เป็นเคสที่เกิดจริง (กติกาเดียวกับ thumbnail ใน AssetTable)
  const imageId = detail.value?.imageId ?? item.imageId
  if (imageId) {
    try {
      imageUrl.value = await fileBlobUrl(imageId)
    } catch {
      // ปล่อยว่าง ให้ template ขึ้นไอคอนแทน
    }
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
      if (props.item) void load(props.item)
    } else {
      document.removeEventListener('keydown', onKeydown)
      revokeImage()
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  revokeImage()
})

// ── QR ของชิ้นที่เปิดดูอยู่ ──────────────────────────────────────────────────
//
// errorCorrectionLevel 'M' (กู้ได้ ~15%) — ต้องเป็นค่าเดียวกันทั้งระบบ (AssetRequestForm
// ใช้ค่านี้) ไม่งั้น QR ของชิ้นเดียวกันที่วาดจากคนละหน้าจะหน้าตาไม่เหมือนกัน
const qrDataUrl = ref('')

watch(
  () => (props.modelValue ? (props.qrCode ?? null) : null),
  async (value) => {
    if (!value) {
      qrDataUrl.value = ''
      return
    }
    try {
      qrDataUrl.value = await QRCode.toDataURL(value, {
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M',
      })
    } catch {
      // วาดไม่ได้ก็ไม่โชว์รูป แต่ข้อความ URL ยังอยู่ให้ก๊อปไปใช้ต่อได้
      qrDataUrl.value = ''
    }
  },
  { immediate: true },
)

// ป้ายสถานะ — ชุดเดียวกับ AssetTable คีย์ต้องตรง enum asset_status ของ DB
const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-success',
  Inactive: 'badge-ghost',
  'Under Maintenance': 'badge-warning',
  Lost: 'badge-error',
  Disposed: 'badge-neutral',
}
const statusBadge = (s: string) => STATUS_BADGE[s] ?? 'badge-ghost'
const statusLabel = (s: string) => (s === 'Lost' ? 'Missing' : s)

/**
 * ระยะประกันเป็นข้อความบรรทัดเดียว — สองคอลัมน์นี้ nullable อิสระจากกัน จึงมี 4 กรณีจริง
 * ปล่อยให้ template เขียน v-if ซ้อนกันเองแล้วจะได้ "— – 31/12/2570" ในกรณีที่มีแต่วันจบ
 * (สูตรเดียวกับ warrantyText() ใน AssetRequestForm.vue)
 */
const warrantyText = computed(() => {
  const start = detail.value?.warrantyStartDate ?? null
  const end = detail.value?.warrantyEndDate ?? null
  if (!start && !end) return '—'
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`
  return start ? `เริ่ม ${formatDate(start)}` : `ถึง ${formatDate(end!)}`
})

/**
 * ประกันหมดแล้วหรือยัง — ตอบได้เฉพาะเมื่อมีวันสิ้นสุด
 *
 * null = บอกไม่ได้ (ไม่ได้กรอกวันจบไว้) ซึ่งคนละเรื่องกับ "ยังไม่หมด" จึงไม่ยุบเป็น boolean
 * เทียบที่ต้นวันของวันนี้ — ประกันที่หมด "วันนี้" ยังเคลมได้ทั้งวัน ไม่ควรขึ้นแดงตั้งแต่เช้า
 */
const warrantyExpired = computed<boolean | null>(() => {
  const end = detail.value?.warrantyEndDate
  if (!end) return null
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return endDate < today
})

/** หัว modal วาดจากแถวก่อน แล้วค่อยทับด้วยผลจาก API เมื่อมาถึง */
const head = computed(() => ({
  assetNumber: detail.value?.assetNumber ?? props.item?.assetNumber ?? '',
  description: detail.value?.description ?? props.item?.description ?? null,
  status: detail.value?.status ?? props.item?.status ?? '',
}))
</script>

<template>
  <Teleport to="body">
    <div class="modal backdrop-blur-sm" :class="{ 'modal-open': modelValue }" role="dialog" aria-modal="true">
      <div class="modal-box max-w-3xl">
        <!-- ── หัว: รูป + เลข + สถานะ ─────────────────────────────────────── -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-1 items-start gap-4 text-left">
            <div class="grid size-64 shrink-0 place-items-center overflow-hidden rounded-lg bg-base-200">
              <img v-if="imageUrl" :src="imageUrl" :alt="head.description ?? head.assetNumber"
                class="size-full object-cover" />
              <Icon v-else icon="mdi:image-off-outline" class="size-7 opacity-30" />
            </div>

            <div class="min-w-0">
              <h3 class="font-mono text-lg font-semibold break-all">{{ head.assetNumber }}</h3>
              <p class="text-sm text-base-content/70">{{ head.description ?? '—' }}</p>
              <div class="flex flex-start gap-2">
                <span v-if="head.status" class="badge badge-sm mt-1.5 whitespace-nowrap"
                  :class="statusBadge(head.status)">
                  {{ statusLabel(head.status) }}
                </span>
                <span v-if="detail?.categoryName" class="badge badge-sm mt-1.5 badge-ghost">
                  {{ detail.categoryName }}
                </span>
                <span v-if="detail?.departmentName" class="badge badge-sm mt-1.5 badge-ghost">
                  {{ detail.departmentName }}
                </span>
                <span v-if="detail?.holderName" class="badge badge-sm mt-1.5 badge-ghost">
                  {{ detail.holderName }}
                </span>
              </div>
            </div>
          </div>

          <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label="ปิด" @click="close">
            <Icon icon="lucide:x" />
          </button>
        </div>

        <!-- ── เนื้อหา ─────────────────────────────────────────────────────
             min-h กันกล่องกระโดดตอนสลับจากตัวหมุนเป็นเนื้อหาจริง -->
        <div class="min-h-[18rem] py-4 text-left">
          <div v-if="loading" class="flex h-72 items-center justify-center">
            <span class="loading loading-spinner loading-lg" />
          </div>

          <div v-else-if="loadError" role="alert" class="alert alert-error alert-soft">
            <Icon icon="mdi:alert-circle-outline" class="size-5" />
            <span>{{ loadError }}</span>
            <button v-if="item" class="btn btn-sm" @click="load(item)">ลองใหม่</button>
          </div>

          <div v-else-if="detail" class="space-y-5">
            <!-- ข้อมูลของชิ้น -->
            <section>
              <h4 class="mb-2 text-xs font-bold tracking-wide text-base-content uppercase">
                ข้อมูลสินทรัพย์
              </h4>
              <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">เลขเครื่อง (S/N)</dt>
                  <dd class="font-mono">{{ detail.serialNumber ?? '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">หน่วยนับ</dt>
                  <dd>{{ detail.uom ?? '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">Asset class</dt>
                  <dd>{{ detail.assetClass ?? '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">วันที่ได้มา</dt>
                  <dd>{{ formatDate(detail.acquisitionDate) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">ราคาที่ได้มา</dt>
                  <dd class="tabular-nums">{{ formatMoney(detail.acquisitionCost) }}</dd>
                </div>
                <div class="flex justify-between gap-3 ">
                  <dt class="text-base-content/60">ระยะประกัน</dt>
                  <dd class="flex items-center gap-2">
                    <span>{{ warrantyText }}</span>
                    <span v-if="warrantyExpired !== null" class="badge badge-xs"
                      :class="warrantyExpired ? 'badge-error' : 'badge-success'">
                      {{ warrantyExpired ? 'หมดประกันแล้ว' : 'อยู่ในประกัน' }}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>



            <!-- มูลค่าทางบัญชี -->
            <section>
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <h4 class="text-xs font-semibold tracking-wide text-base-content uppercase">
                  มูลค่าทางบัญชี
                </h4>
                <span v-if="detail.accounting" class="badge badge-xs"
                  :class="isStale ? 'badge-warning ' : 'badge-ghost'">
                  ปีบัญชี {{ detail.accounting.fiscalYear }}
                </span>
                <!-- ★ ป้ายนี้ห้ามตัดทิ้ง — 25% ของทะเบียนเป็นตัวเลขของปีเก่า (วัด 2026-08-20)
                     ถ้าไม่บอก คนจะอ่านยอดปี 2022 เป็นมูลค่าของวันนี้ -->

              </div>

              <p v-if="!detail.accounting" class="text-sm text-base-content/50">
                SAP ยังไม่มียอดบัญชีของชิ้นนี้
              </p>

              <dl v-else class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">ราคาทุน</dt>
                  <dd class="tabular-nums">{{ formatMoney(detail.accounting.bookedCost) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">ค่าเสื่อมสะสม</dt>
                  <dd class="tabular-nums">
                    {{ formatMoney(detail.accounting.accumulatedDepreciation) }}
                  </dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">มูลค่าคงเหลือ</dt>
                  <dd class="tabular-nums">{{ formatMoney(detail.accounting.netBookValue) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">มูลค่าซาก</dt>
                  <dd class="tabular-nums">{{ formatMoney(detail.accounting.salvageValue) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">อายุการใช้งาน</dt>
                  <dd>{{ formatMonths(detail.accounting.usefulLifeMonths) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">อายุคงเหลือ</dt>
                  <dd>{{ formatMonths(detail.accounting.remainingLifeMonths) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">วิธีคิดค่าเสื่อม</dt>
                  <dd>{{ detail.accounting.depreciationMethod ?? '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-base-content/60">ช่วงคิดค่าเสื่อม</dt>
                  <dd>
                    {{ formatDate(detail.accounting.depreciationStart) }} –
                    {{ formatDate(detail.accounting.depreciationEnd) }}
                  </dd>
                </div>
                <div class="flex justify-between gap-3 sm:col-span-2">
                  <dt class="text-primary ">ดึงข้อมูลจาก SAP ล่าสุด</dt>
                  <dd class="text-primary ">{{ formatDateTime(detail.accounting.syncedAt) }}</dd>
                </div>
              </dl>
            </section>

            <!-- ── QR สำหรับติดตัวเครื่อง ────────────────────────────────────
                 โผล่เฉพาะหน้าที่ส่ง qrCode เข้ามา และเฉพาะชิ้นที่มีค่านั้นจริง
                 (ไม่มีเลข = ไม่มี QR = ไม่มีอะไรให้ชี้ถึง) -->
            <section
              v-if="qrCode"
              class="flex flex-wrap items-center gap-4 rounded-box border border-base-300 bg-base-200/60 p-3"
            >
              <img
                v-if="qrDataUrl"
                :src="qrDataUrl"
                :alt="`QR ของ ${detail.assetNumber}`"
                class="size-28 shrink-0 rounded bg-white p-1"
              />
              <!-- วาดไม่สำเร็จก็ยังต้องเห็นว่ามี QR อยู่ และ URL ข้างล่างยังก๊อปไปใช้ต่อได้ -->
              <div v-else class="grid size-28 shrink-0 place-items-center rounded bg-base-300">
                <Icon icon="mdi:qrcode-remove" class="size-6 opacity-40" />
              </div>

              <div class="min-w-0 flex-1">
                <div
                  class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60"
                >
                  <Icon icon="mdi:qrcode" class="size-4" />
                  QR สำหรับติดตัวเครื่อง
                </div>
                <p class="mt-1 font-mono text-xs break-all opacity-80">{{ qrCode }}</p>
                <p class="mt-1 text-xs opacity-60">
                  สแกนด้วยกล้องมือถือแล้วเปิดหน้าสินทรัพย์ของชิ้นนี้ได้เลย
                </p>
              </div>
            </section>
          </div>
        </div>

        <div class="modal-action">
          <button type="button" class="btn" @click="close">ปิด</button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>
  </Teleport>
</template>
