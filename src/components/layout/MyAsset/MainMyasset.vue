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
import AppAsset from '@/components/common/AppAsset.vue'
import { getMyAssets } from '@/services/asset.service'
import type { MyAssetItem } from '@/services/asset.service'
import { fileBlobUrl } from '@/services/attachment.service'
import { ApiError } from '@/services/httpClient'
import { formatMoney } from '@/utils/money'

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
const detailOpen = ref(false)

function openDetail(item: MyAssetItem) {
  selected.value = item
  detailOpen.value = true
}

/** สัดส่วนค่าเสื่อมที่ตัดไปแล้ว 0–100 — null เมื่อคำนวณไม่ได้หรือของไม่คิดค่าเสื่อม */
function depreciationPercent(item: MyAssetItem): number | null {
  const acct = item.accounting
  if (!acct || acct.bookedCost === null || acct.accumulatedDepreciation === null) return null
  if (acct.bookedCost <= 0) return null
  return Math.min(100, Math.round((acct.accumulatedDepreciation / acct.bookedCost) * 100))
}

const isStale = (item: MyAssetItem) =>
  item.accounting !== null && item.accounting.fiscalYear !== currentYear

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

    <div v-else class="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
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

  <!-- รายละเอียดใช้ AppAsset ตัวเดียวกับหน้าทะเบียนและ Dashboard — ชิ้นเดียวกันต้องหน้าตา
       เหมือนกันทุกทางเข้า และ modal ไปดึงรายละเอียดเต็มจาก /assets/by-number เอง
       (ของที่ลิสต์นี้มีไม่ครบ เช่น S/N, หน่วยนับ, ระยะประกัน, แผนก/ผู้ครอบครอง) -->
  <AppAsset v-model="detailOpen" :item="selected" :qr-code="selected?.qrCode" />
</template>
