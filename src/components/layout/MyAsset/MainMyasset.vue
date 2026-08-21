<script setup lang="ts">
// หน้า My asset — สินทรัพย์ในความดูแลของคนที่ล็อกอินอยู่
//
// ยึด "ของฉัน" จาก token ฝั่ง backend (GET /assets/mine) ไม่ได้ส่ง id ไปถาม จึงไม่มีทาง
// ที่ใครจะดัดพารามิเตอร์เพื่อดูของคนอื่น
//
// ── ตัวเลขบัญชีบนหน้านี้มีกับดักหนึ่งข้อที่ต้องแสดงให้ผู้ใช้เห็นเสมอ
//
// ยอดที่ sync มาเป็นตัวเลข "ของปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น" ซึ่งไม่ใช่ปีปัจจุบันเสมอไป —
// ของที่ตัดจำหน่าย/หยุดคิดค่าเสื่อมแล้วจะค้างที่ปีสุดท้ายของมัน (วัดจริง 2026-08-20: 668 จาก
// 2,721 ชิ้น = 25% ไม่ใช่ปี 2026 โดยชุดใหญ่สุดค้างที่ปี 2022) จึงต้องติดป้ายปีคู่กับยอดทุกที่
// และเตือนให้ชัดเมื่อเป็นปีเก่า ไม่งั้นผู้ใช้จะอ่านเลขปี 2022 เป็นมูลค่าวันนี้
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import QRCode from 'qrcode'
import { getMyAssets } from '@/services/asset.service'
import type { MyAssetItem } from '@/services/asset.service'
import { fileBlobUrl } from '@/services/attachment.service'
import { ApiError } from '@/services/httpClient'
import { formatDate } from '@/utils/date'
import { formatMoney, formatMonths } from '@/utils/money'

const items = ref<MyAssetItem[]>([])
const linkedToEmployee = ref(true)
const loading = ref(false)
const loadError = ref('')

/** imageId -> blob URL — ต้องโหลดผ่าน fetch เพราะไฟล์อยู่หลัง authGuard ใส่ src ตรง ๆ จะโดน 401 */
const imageUrls = ref<Record<string, string>>({})

const currentYear = new Date().getFullYear()

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getMyAssets()
    items.value = res.items
    linkedToEmployee.value = res.linkedToEmployee
    await loadThumbnails(res.items)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการสินทรัพย์ไม่สำเร็จ'
    items.value = []
  } finally {
    loading.value = false
  }
}

/**
 * โหลดรูปทีละใบแบบไม่ให้ใบที่พังลากใบอื่นตาย
 *
 * รูปโหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — ขึ้น placeholder แทนแล้วไปต่อ ดีกว่าทั้งหน้าค้าง
 * เพราะไฟล์เดียวหาย (ไฟล์ถูกลบจาก disk แต่ imageId ยังอยู่เป็นเคสที่เกิดได้จริง)
 */
async function loadThumbnails(list: MyAssetItem[]) {
  await Promise.all(
    list.map(async (item) => {
      if (!item.imageId || imageUrls.value[item.imageId]) return
      try {
        imageUrls.value[item.imageId] = await fileBlobUrl(item.imageId)
      } catch {
        // ปล่อยว่างไว้ ให้ template ขึ้นไอคอนแทน
      }
    }),
  )
}

// blob URL ที่ createObjectURL สร้างไว้ค้างใน memory จนกว่าจะ revoke — ออกจากหน้าแล้ว
// ไม่มีใครใช้ต่อ ถ้าไม่คืนจะรั่วสะสมทุกครั้งที่เข้า-ออกหน้านี้
onUnmounted(() => {
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
})

onMounted(load)

/** ยอดที่ยังใช้ได้ = เฉพาะชิ้นที่ตัวเลขเป็นของปีปัจจุบัน (ดูเหตุผลที่หัวไฟล์) */
const summary = computed(() => {
  let currentNbv = 0
  let currentCount = 0
  let staleCount = 0
  let noDataCount = 0

  for (const item of items.value) {
    const acct = item.accounting
    if (!acct) {
      noDataCount++
      continue
    }
    if (acct.fiscalYear !== currentYear) {
      staleCount++
      continue
    }
    currentCount++
    if (acct.netBookValue !== null) currentNbv += acct.netBookValue
  }
  return { currentNbv, currentCount, staleCount, noDataCount }
})

const selected = ref<MyAssetItem | null>(null)
const detailDialog = ref<HTMLDialogElement | null>(null)

function openDetail(item: MyAssetItem) {
  selected.value = item
  detailDialog.value?.showModal()
}

// ── QR ของชิ้นที่เปิดดูอยู่ ──────────────────────────────────────────────────
//
// วาดจาก item.qrCode ที่ backend เก็บไว้ **ห้ามประกอบ URL เองจาก assetNumber** — ค่าที่เก็บ
// คือค่าที่ตรงกับสติกเกอร์ที่พิมพ์แปะไปแล้ว ถ้าจอประกอบเอง วันที่ APP_BASE_URL เปลี่ยน
// จอจะโชว์ QR ใหม่ที่พาไปคนละที่กับสติกเกอร์บนเครื่องจริง โดยไม่มีอะไรฟ้อง
//
// errorCorrectionLevel 'M' (กู้ได้ ~15%) — ตรงกับที่ AssetRequestForm ใช้ ต้องเหมือนกัน
// ทั้งระบบ ไม่งั้น QR ของชิ้นเดียวกันที่วาดจากคนละหน้าจะหน้าตาไม่เหมือนกัน
const qrDataUrl = ref('')

watch(
  () => selected.value?.qrCode ?? null,
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
)

/** สัดส่วนค่าเสื่อมที่ตัดไปแล้ว 0–100 — null เมื่อคำนวณไม่ได้หรือของไม่คิดค่าเสื่อม */
function depreciationPercent(item: MyAssetItem): number | null {
  const acct = item.accounting
  if (!acct || acct.bookedCost === null || acct.accumulatedDepreciation === null) return null
  if (acct.bookedCost <= 0) return null
  return Math.min(100, Math.round((acct.accumulatedDepreciation / acct.bookedCost) * 100))
}

const isStale = (item: MyAssetItem) =>
  item.accounting !== null && item.accounting.fiscalYear !== currentYear

type Accounting = NonNullable<MyAssetItem['accounting']>

/** อายุการใช้งาน — 0 เดือนที่ช่องนี้แปลว่าของชิ้นนี้ไม่คิดค่าเสื่อมเลย (ที่ดิน) */
function usefulLifeLabel(a: Accounting): string {
  return a.usefulLifeMonths === 0 ? 'ไม่คิดค่าเสื่อม' : formatMonths(a.usefulLifeMonths)
}

/**
 * อายุคงเหลือ — 0 ที่ช่องนี้แปลว่า "ตัดครบแล้ว" ไม่ใช่ "ไม่คิดค่าเสื่อม"
 *
 * แยกสองเคสด้วยอายุตั้งต้น: ของที่ไม่คิดค่าเสื่อมตั้งแต่แรกจะเป็น 0 ทั้งคู่ ถ้าดูแต่ช่องนี้
 * ช่องเดียวจะบอกว่าที่ดิน "หมดอายุแล้ว" ซึ่งผิดคนละเรื่อง
 */
function remainingLifeLabel(a: Accounting): string {
  if (a.usefulLifeMonths === 0) return 'ไม่คิดค่าเสื่อม'
  if (a.remainingLifeMonths === 0) return 'ตัดค่าเสื่อมครบแล้ว'
  return formatMonths(a.remainingLifeMonths)
}

/**
 * ตัดค่าเสื่อมครบแล้ว = มูลค่าคงเหลือลงมาเท่ากับมูลค่าซากพอดี
 *
 * ★ ต้องบอกให้ผู้ใช้รู้ ไม่ใช่ปล่อยให้เดา — ค่าเสื่อมตันที่ `ราคาทุน − มูลค่าซาก` ไม่ใช่ที่
 *   ราคาทุน ของที่หมดอายุแล้วจึงมี "มูลค่าคงเหลือ" กับ "มูลค่าซาก" เป็นเลขเดียวกันเป๊ะเสมอ
 *   (วัด 2026-08-20: 1,584 จาก 2,721 ชิ้น = 58% ของทะเบียน และ 95% มีมูลค่าซาก 1.00 บาท)
 *   สองบรรทัดติดกันที่เขียนว่า 1.00 เหมือนกันอ่านยังไงก็เหมือนโค้ดหยิบผิดช่อง — มีคนทัก
 *   มาแล้วจริง ๆ ติดป้ายบอกไปเลยว่าทำไมมันเท่ากัน
 *
 * เทียบด้วยค่าความคลาดเคลื่อน ไม่ใช่ `===` เพราะเป็นเลขทศนิยม (12871.03 − 12870.03 ใน
 * floating point ไม่ได้เท่ากับ 1 เป๊ะ) ใช้ครึ่งสตางค์เป็นเกณฑ์ = ละเอียดกว่าที่จอแสดงได้อยู่แล้ว
 */
function isFullyDepreciated(item: MyAssetItem): boolean {
  const acct = item.accounting
  if (!acct || acct.netBookValue === null || acct.salvageValue === null) return false
  // ของที่ยังไม่เริ่มตัดค่าเสื่อม (ที่ดิน) ไม่ใช่ "ครบแล้ว" แม้ตัวเลขจะบังเอิญใกล้กัน
  if (!acct.accumulatedDepreciation) return false
  return Math.abs(acct.netBookValue - acct.salvageValue) < 0.005
}
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold sm:text-4xl">My asset</h1>
        <p class="text-base-content/70">สินทรัพย์ในความดูแลของฉัน</p>
      </div>

      <div v-if="!loading && !loadError && items.length" class="stats stats-vertical sm:stats-horizontal shadow">
        <div class="stat py-3">
          <div class="stat-title text-xs">ทั้งหมด</div>
          <div class="stat-value text-2xl">{{ items.length }}</div>
          <div class="stat-desc">ชิ้น</div>
        </div>
        <div class="stat py-3">
          <div class="stat-title text-xs">มูลค่าคงเหลือ (ปี {{ currentYear }})</div>
          <!--
            ไม่มีชิ้นไหนเป็นข้อมูลปีนี้ → ต้องขึ้น '—' ไม่ใช่ '0.00'
            ศูนย์แปลว่า "รวมแล้วได้ศูนย์" ซึ่งอ่านเหมือนของไม่มีมูลค่า ทั้งที่ความจริงคือ
            "ยังไม่มีตัวเลขของปีนี้ให้รวม" — คนละเรื่องกันคนละทางแก้
          -->
          <div class="stat-value text-2xl">
            {{ summary.currentCount ? formatMoney(summary.currentNbv) : '—' }}
          </div>
          <!-- บอกตรง ๆ ว่ายอดนี้นับจากกี่ชิ้น เพราะมันไม่ได้นับทุกชิ้นในหน้า -->
          <div class="stat-desc">
            <template v-if="summary.currentCount">
              จาก {{ summary.currentCount }} ชิ้นที่ข้อมูลเป็นปีปัจจุบัน
            </template>
            <template v-else>ยังไม่มีชิ้นไหนที่ข้อมูลเป็นปี {{ currentYear }}</template>
          </div>
        </div>
      </div>
    </div>


    <div v-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else-if="loadError" role="alert" class="alert alert-error mt-6">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
    </div>

    <!-- ยังไม่ผูกพนักงาน ≠ ไม่มีของ — อันนี้ต้องให้ admin ไปแก้ ไม่ใช่ผู้ใช้รอเฉย ๆ -->
    <div v-else-if="!linkedToEmployee" role="alert" class="alert alert-warning mt-6">
      <Icon icon="mdi:account-question-outline" class="size-5" />
      <span>
        บัญชีผู้ใช้ของคุณยังไม่ได้ผูกกับข้อมูลพนักงาน จึงยังบอกไม่ได้ว่าถือสินทรัพย์ชิ้นไหน
        แจ้งผู้ดูแลระบบให้ผูกให้ก่อน
      </span>
    </div>

    <div v-else-if="!items.length" class="mt-16 text-center text-base-content/60">
      <Icon icon="mdi:package-variant" class="mx-auto size-14 opacity-40" />
      <p class="mt-3">ยังไม่มีสินทรัพย์ในความดูแลของคุณ</p>
    </div>

    <div v-else class="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="item in items"
        :key="item.id"
        class="card bg-base-100 shadow-sm ring-1 ring-base-300"
      >
        <figure class="h-44 bg-base-200">
          <img
            v-if="item.imageId && imageUrls[item.imageId]"
            :src="imageUrls[item.imageId]"
            :alt="item.description ?? item.assetNumber ?? 'asset'"
            class="h-full w-full object-cover"
          />
          <Icon v-else icon="mdi:image-off-outline" class="size-12 opacity-30" />
        </figure>

        <div class="card-body gap-2">
          <h2 class="card-title font-mono text-base tracking-wide">
            {{ item.assetNumber ?? '—' }}
          </h2>
          <p class="line-clamp-2 min-h-[2.5rem] text-sm text-base-content/70">
            {{ item.description ?? '—' }}
          </p>

          <div class="flex flex-wrap gap-1">
            <span v-if="item.categoryName" class="badge badge-ghost badge-sm">
              {{ item.categoryName }}
            </span>
            <span class="badge badge-ghost badge-sm">{{ item.locationName }}</span>
          </div>

          <div class="mt-1 rounded-lg bg-base-200/60 p-3">
            <template v-if="item.accounting">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-xs text-base-content/60">มูลค่าคงเหลือ</span>
                <!-- ป้ายปีอยู่ติดกับยอดเสมอ ไม่ใช่ซ่อนไว้ในหน้ารายละเอียด -->
                <span
                  class="badge badge-xs"
                  :class="isStale(item) ? 'badge-warning ' : 'badge-ghost'"
                >
                  ปี {{ item.accounting.fiscalYear }}
                </span>
              </div>
              <div class="flex items-baseline gap-2">
                <span class="font-semibold">{{ formatMoney(item.accounting.netBookValue) }}</span>
                <!-- อธิบายตรงจุดว่าทำไมยอดนี้ถึงเท่ากับมูลค่าซาก (ดู isFullyDepreciated) -->
                <span v-if="isFullyDepreciated(item)" class="badge badge-xs badge-neutral">
                  ตัดค่าเสื่อมครบแล้ว
                </span>
              </div>

              <progress
                v-if="depreciationPercent(item) !== null"
                class="progress progress-primary mt-2 h-1.5"
                :value="depreciationPercent(item) ?? 0"
                max="100"
              />
              <div class="mt-1 text-xs text-base-content/60">
                ตัดค่าเสื่อมแล้ว {{ formatMoney(item.accounting.accumulatedDepreciation) }} จาก
                {{ formatMoney(item.accounting.bookedCost) }}
              </div>
            </template>
            <p v-else class="text-xs text-base-content/60">ยังไม่มีข้อมูลบัญชีจาก SAP</p>
          </div>

          <div class="card-actions mt-1 justify-end">
            <button class="btn btn-sm btn-primary" @click="openDetail(item)">รายละเอียด</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <dialog ref="detailDialog" class="modal">
    <div v-if="selected" class="modal-box max-w-2xl">
      <h3 class="font-mono text-lg font-bold">{{ selected.description ?? '—' }}</h3>
      <p class="text-sm text-base-content/70">{{ selected.assetNumber ?? '—' }}</p>

      <div class="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div class="flex justify-between gap-2 border-b border-base-200 py-1">
          <span class="text-base-content/60">หมวด</span><span>{{ selected.categoryName ?? '—' }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1">
          <span class="text-base-content/60">ที่ตั้ง</span><span>{{ selected.locationName }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1">
          <span class="text-base-content/60">ตำแหน่งย่อย</span>
          <span>{{ selected.subLocationName ?? '—' }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1">
          <span class="text-base-content/60">วันที่ได้มา</span>
          <span>{{ formatDate(selected.acquisitionDate) }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1 sm:col-span-2">
          <span class="text-base-content/60">ราคาที่ซื้อ/ตามใบกำกับ</span>
          <span>{{ formatMoney(selected.acquisitionCost) }}</span>
        </div>
      </div>

      <template v-if="selected.accounting">
        <div class="mt-5 flex items-center gap-2">
          <h4 class="font-semibold">มูลค่าทางบัญชี</h4>
          <span class="badge badge-sm" :class="isStale(selected) ? 'badge-warning' : 'badge-ghost'">
            ปีบัญชี {{ selected.accounting.fiscalYear }}
          </span>
        </div>

        <!-- ตัวเลขปีเก่าอ่านผิดง่ายที่สุด — เตือนตรงจุดที่ตัวเลขอยู่ ไม่ใช่แค่ป้ายเล็ก ๆ -->
        <div v-if="isStale(selected)" role="alert" class="alert alert-warning alert-soft mt-2 py-2">
          <Icon icon="mdi:clock-alert-outline" class="size-5" />
          <span class="text-sm">
            ตัวเลขชุดนี้เป็นของปี {{ selected.accounting.fiscalYear }} ไม่ใช่ปีปัจจุบัน
            — มักแปลว่าสินทรัพย์ถูกตัดจำหน่ายหรือหยุดคิดค่าเสื่อมไปแล้ว
          </span>
        </div>

        <div class="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-2 border-b border-base-200 py-1">
            <span class="text-base-content/60">ราคาทุนทางบัญชี</span>
            <span>{{ formatMoney(selected.accounting.bookedCost) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1">
            <span class="text-base-content/60">ค่าเสื่อมสะสม</span>
            <span>{{ formatMoney(selected.accounting.accumulatedDepreciation) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1 font-semibold">
            <span class="text-base-content/60">มูลค่าคงเหลือ</span>
            <span>{{ formatMoney(selected.accounting.netBookValue) }}</span>
          </div>
          <!--
            ของที่ตัดครบแล้วจะมี "มูลค่าคงเหลือ" เท่ากับ "มูลค่าซาก" บรรทัดล่างเป๊ะเสมอ
            ถ้าไม่อธิบายไว้ตรงนี้ มันอ่านเหมือนโค้ดหยิบผิดช่อง (58% ของทะเบียนเป็นแบบนี้)
          -->

          <div class="flex justify-between gap-2 border-b border-base-200 py-1">
            <span class="text-base-content/60">มูลค่าซาก</span>
            <span>{{ formatMoney(selected.accounting.salvageValue) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1">
            <span class="text-base-content/60">อายุการใช้งาน</span>
            <span>{{ usefulLifeLabel(selected.accounting) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1">
            <span class="text-base-content/60">อายุคงเหลือ</span>
            <span>{{ remainingLifeLabel(selected.accounting) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1">
            <span class="text-base-content/60">เริ่มคิดค่าเสื่อม</span>
            <span>{{ formatDate(selected.accounting.depreciationStart) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1">
            <span class="text-base-content/60">สิ้นสุดค่าเสื่อม</span>
            <span>{{ formatDate(selected.accounting.depreciationEnd) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1 sm:col-span-2">
            <span class="text-base-content/60">วิธีคิดค่าเสื่อม</span>
            <span>{{ selected.accounting.depreciationMethod ?? '—' }}</span>
          </div>
        </div>

        <p class="mt-2 text-xs text-base-content/50">
          ดึงจาก SAP ล่าสุด {{ formatDate(selected.accounting.syncedAt) }}
        </p>
      </template>

      <p v-else class="mt-5 text-sm text-base-content/60">
        ชิ้นนี้ยังไม่มีข้อมูลบัญชีจาก SAP — เกิดได้เมื่อบัญชียังไม่ได้ลงทะเบียนสินทรัพย์ในระบบ SAP
      </p>

      <!-- ── QR สำหรับติดตัวเครื่อง — โผล่เฉพาะชิ้นที่มีเลขแล้ว (ไม่มีเลข = ไม่มีอะไรให้ชี้ถึง) -->
      <div
        v-if="selected.qrCode"
        class="mt-5 flex flex-wrap items-center gap-4 rounded-box border border-base-300 bg-base-200/60 p-3"
      >
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          :alt="`QR ของ ${selected.assetNumber}`"
          class="size-28 shrink-0 rounded bg-white p-1"
        />
        <!-- วาดไม่สำเร็จก็ยังต้องเห็นว่ามี QR อยู่ และ URL ข้างล่างยังก๊อปไปใช้ต่อได้ -->
        <div v-else class="grid size-28 shrink-0 place-items-center rounded bg-base-300">
          <Icon icon="mdi:qrcode-remove" class="size-6 opacity-40" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60">
            <Icon icon="mdi:qrcode" class="size-4" />
            QR สำหรับติดตัวเครื่อง
          </div>
          <p class="mt-1 font-mono text-xs break-all opacity-80">{{ selected.qrCode }}</p>
          <p class="mt-1 text-xs opacity-60">
            สแกนด้วยกล้องมือถือแล้วเปิดหน้าสินทรัพย์ของชิ้นนี้ได้เลย
          </p>
        </div>
      </div>

      <div class="modal-action">
        <form method="dialog"><button class="btn">ปิด</button></form>
      </div>
    </div>

    <!-- คลิกนอกกล่องแล้วปิด — พฤติกรรมที่คนคาดหวังจาก modal -->
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>
</template>
