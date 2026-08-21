<script setup lang="ts">
// หน้าที่เปิดจากการสแกน QR บนสติกเกอร์ — /assets/:assetNumber
//
// คนใช้จริงคือคนที่ยืนอยู่หน้าเครื่อง ถือมือถือ และมักไม่ใช่เจ้าของชิ้นนั้น (ช่าง/ผู้ตรวจนับ/
// เจ้าของห้อง) หน้านี้จึงต้องตอบสามคำถามให้ได้ในหน้าจอเดียวโดยไม่ต้องเลื่อน:
// "นี่คือของอะไร" · "ตามทะเบียนมันควรอยู่ตรงไหน" · "ใครดูแล"
// ส่วนตัวเลขบัญชีเป็นข้อมูลรอง วางไว้ล่างสุด
//
// ── เลขสินทรัพย์มาจาก path จึงต้องรับทุกอักขระ
//
// ของจริงมีเลขที่มี '/' (MAC-212-13-001/1) และมีตัวที่เป็นชื่อสินค้าภาษาไทยยาว 48 ตัว
// route จึงประกาศเป็น :assetNumber(.*) และส่งต่อ backend ทาง query string ไม่ใช่ path
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { getAssetByNumber } from '@/services/asset.service'
import type { AssetByNumberDetail } from '@/services/asset.service'
import { fileBlobUrl } from '@/services/attachment.service'
import { ApiError } from '@/services/httpClient'
import { formatDate } from '@/utils/date'
import { formatMoney, formatMonths } from '@/utils/money'

const route = useRoute()

const asset = ref<AssetByNumberDetail | null>(null)
const loading = ref(false)
const loadError = ref('')
const notFound = ref(false)
const imageUrl = ref('')

const currentYear = new Date().getFullYear()

/** param เป็น (.*) จึงได้มาเป็น string เสมอ แต่ vue-router ยอมให้เป็น array ในทางชนิด */
const assetNumber = computed(() => {
  const raw = route.params.assetNumber
  return Array.isArray(raw) ? raw.join('/') : (raw ?? '')
})

async function load() {
  if (!assetNumber.value) return
  loading.value = true
  loadError.value = ''
  notFound.value = false
  revokeImage()

  try {
    const data = await getAssetByNumber(assetNumber.value)
    asset.value = data
    if (data.imageId) {
      try {
        imageUrl.value = await fileBlobUrl(data.imageId)
      } catch {
        // รูปโหลดไม่ได้ไม่ควรทำให้ทั้งหน้าพัง — ข้อมูลที่เหลือยังมีประโยชน์เต็ม ๆ
      }
    }
  } catch (e) {
    asset.value = null
    // 404 ต้องแยกจาก error อื่น: "สแกนติดแต่ไม่มีในระบบ" กับ "ระบบมีปัญหา" แก้คนละทาง
    notFound.value = e instanceof ApiError && e.status === 404
    loadError.value = e instanceof ApiError ? e.message : 'โหลดข้อมูลสินทรัพย์ไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

function revokeImage() {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
}

// สแกนชิ้นถัดไปขณะเปิดหน้านี้ค้างอยู่ = เปลี่ยนแค่ param ตัวเดียว component ไม่ถูกสร้างใหม่
// ถ้าไม่ watch หน้าจะค้างข้อมูลชิ้นเดิมทั้งที่ URL เปลี่ยนแล้ว — ของที่คนเดินตรวจนับเจอบ่อย
watch(assetNumber, load)
onMounted(load)
onUnmounted(revokeImage)

const isStale = computed(
  () => asset.value?.accounting != null && asset.value.accounting.fiscalYear !== currentYear,
)

/** ตัดค่าเสื่อมครบ = มูลค่าคงเหลือลงมาเท่ากับมูลค่าซาก (เหตุผลเต็มที่ MainMyasset.vue) */
const isFullyDepreciated = computed(() => {
  const a = asset.value?.accounting
  if (!a || a.netBookValue === null || a.salvageValue === null) return false
  if (!a.accumulatedDepreciation) return false
  return Math.abs(a.netBookValue - a.salvageValue) < 0.005
})

const usefulLifeLabel = computed(() => {
  const a = asset.value?.accounting
  if (!a) return '—'
  return a.usefulLifeMonths === 0 ? 'ไม่คิดค่าเสื่อม' : formatMonths(a.usefulLifeMonths)
})

const remainingLifeLabel = computed(() => {
  const a = asset.value?.accounting
  if (!a) return '—'
  if (a.usefulLifeMonths === 0) return 'ไม่คิดค่าเสื่อม'
  if (a.remainingLifeMonths === 0) return 'ตัดค่าเสื่อมครบแล้ว'
  return formatMonths(a.remainingLifeMonths)
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-6">
    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <!-- สแกนติดแต่ไม่มีในระบบ — ต้องบอกเลขที่สแกนได้ด้วย ไม่งั้นคนหน้างานรายงานต่อไม่ได้ -->
    <div v-else-if="notFound" class="py-12 text-center">
      <Icon icon="mdi:tag-off-outline" class="mx-auto size-14 text-warning opacity-70" />
      <h1 class="mt-3 text-xl font-semibold">ไม่พบสินทรัพย์เลขนี้ในระบบ</h1>
      <p class="mt-1 font-mono text-sm break-all opacity-70">{{ assetNumber }}</p>
      <button class="btn btn-sm mt-4" @click="load">ลองใหม่</button>
    </div>

    <div v-else-if="loadError" role="alert" class="alert alert-error">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
    </div>

    <template v-else-if="asset">
      <div class="grid grid-cols-2">
        <div>
          <h1 class="font-mono text-2xl font-bold tracking-wide break-all">{{ asset.assetNumber }}</h1>
          <p class="mt-1 text-base-content/70">{{ asset.description ?? '—' }}</p>
          <div class="mt-2 flex flex-wrap gap-1 text-start">
            <span class="badge badge-sm" :class="asset.status === 'Active' ? 'badge-success' : 'badge-ghost'">
              {{ asset.status }}
            </span>
            
            <span v-if="asset.categoryName" class="badge badge-ghost badge-sm">{{ asset.categoryName }}</span>
          </div>
          <div class="mt-5 rounded-xl bg-base-200/60 p-4">
              <div class="flex items-start gap-3">
                <Icon icon="mdi:map-marker-outline" class="mt-0.5 size-5 shrink-0 opacity-60" />

                <div>
                  <div class="font-medium">{{ asset.locationName }}</div>
                  <div v-if="asset.subLocationName" class="text-sm text-base-content/70">
                    {{ asset.subLocationName }}
                  </div>
                </div>
              </div>
              <div class="mt-3 flex items-start gap-3">
                <Icon icon="mdi:account-outline" class="mt-0.5 size-5 shrink-0 opacity-60" />
                <div>
                  <div class="font-medium">{{ asset.holderName ?? 'ยังไม่ระบุผู้ดูแล' }}</div>
                  <div class="text-sm text-base-content/70">{{ asset.departmentName ?? '—' }}</div>
                </div>
              </div>
            </div>
        </div>
        <figure v-if="imageUrl" class="mb-4 overflow-hidden rounded-xl bg-base-200">
          <img :src="imageUrl" :alt="asset.description ?? asset.assetNumber" class="max-h-64 w-full object-cover" />
        </figure>


      </div>
      <!--
        ที่ตั้ง/ผู้ดูแลอยู่บนสุดโดยตั้งใจ — คนสแกนยืนอยู่หน้าเครื่องจริง คำถามแรกคือ
        "ของชิ้นนี้ควรอยู่ตรงนี้หรือเปล่า" และ "ถ้าไม่ใช่ ต้องถามใคร"
      -->


      <h2 class="mt-6 mb-2 font-semibold">ข้อมูลทะเบียน</h2>
      <div class="grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
        <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
          <span class="text-base-content/60">Serial</span>
          <span class="text-right break-all">{{ asset.serialNumber ?? '—' }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
          <span class="text-base-content/60">หน่วยนับ</span><span>{{ asset.uom ?? '—' }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
          <span class="text-base-content/60">วันที่ได้มา</span>
          <span>{{ formatDate(asset.acquisitionDate) }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
          <span class="text-base-content/60">ราคาที่ซื้อ</span>
          <span>{{ formatMoney(asset.acquisitionCost) }}</span>
        </div>
        <div class="flex justify-between gap-2 border-b border-base-200 py-1.5 sm:col-span-2">
          <span class="text-base-content/60">AssetClass (SAP)</span>
          <span class="font-mono text-xs">{{ asset.assetClass ?? '—' }}</span>
        </div>
      </div>

      <template v-if="asset.accounting">
        <div class="mt-6 mb-2 flex items-center gap-2">
          <h2 class="font-semibold">มูลค่าทางบัญชี</h2>
          <span class="badge badge-sm" :class="isStale ? 'badge-warning' : 'badge-ghost'">
            ปีบัญชี {{ asset.accounting.fiscalYear }}
          </span>
        </div>

        <div v-if="isStale" role="alert" class="alert alert-warning alert-soft mb-2 py-2">
          <Icon icon="mdi:clock-alert-outline" class="size-5" />
          <span class="text-sm">
            ตัวเลขชุดนี้เป็นของปี {{ asset.accounting.fiscalYear }} ไม่ใช่ปีปัจจุบัน
            — มักแปลว่าสินทรัพย์ถูกตัดจำหน่ายหรือหยุดคิดค่าเสื่อมไปแล้ว
          </span>
        </div>

        <div class="grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
            <span class="text-base-content/60">ราคาทุนทางบัญชี</span>
            <span>{{ formatMoney(asset.accounting.bookedCost) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
            <span class="text-base-content/60">ค่าเสื่อมสะสม</span>
            <span>{{ formatMoney(asset.accounting.accumulatedDepreciation) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1.5 font-semibold">
            <span class="text-base-content/60">มูลค่าคงเหลือ</span>
            <span>{{ formatMoney(asset.accounting.netBookValue) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
            <span class="text-base-content/60">มูลค่าซาก</span>
            <span>{{ formatMoney(asset.accounting.salvageValue) }}</span>
          </div>

          <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
            <span class="text-base-content/60">อายุการใช้งาน</span><span>{{ usefulLifeLabel }}</span>
          </div>
          <div class="flex justify-between gap-2 border-b border-base-200 py-1.5">
            <span class="text-base-content/60">อายุคงเหลือ</span><span>{{ remainingLifeLabel }}</span>
          </div>
        </div>

        <p class="mt-2 text-xs text-base-content/50">
          ดึงจาก SAP ล่าสุด {{ formatDate(asset.accounting.syncedAt) }}
        </p>
      </template>

      <p v-else class="mt-6 text-sm text-base-content/60">
        ชิ้นนี้ยังไม่มีข้อมูลบัญชีจาก SAP
      </p>
    </template>
  </div>
</template>
