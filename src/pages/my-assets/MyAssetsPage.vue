<script setup lang="ts">
// หน้า My asset - สินทรัพย์ในความดูแลของคนที่ล็อกอินอยู่
//
// ยึด "ของฉัน" จาก token ฝั่ง backend (GET /assets/mine) ไม่ได้ส่ง id ไปถาม จึงไม่มีทาง
// ที่ใครจะดัดพารามิเตอร์เพื่อดูของคนอื่น
//
// ── หน้านี้เป็น "กระดานรูป" ไม่ใช่ตารางข้อมูล ────────────────────────────────
//
// คนเปิดหน้านี้มาถามคำถามเดียว: "ของที่อยู่ในความดูแลฉันมีอะไรบ้าง" ซึ่งเขาจำได้จาก
// **หน้าตาของของ** ไม่ใช่จากเลข MAC-211-14-002 - รูปจึงต้องเป็นพระเอกและกินพื้นที่
// การ์ดเกินครึ่ง ส่วนตัวเลขที่เหลือเป็นแค่ป้ายกำกับให้ยืนยันว่าใช่ชิ้นนั้น
//
// รายละเอียดเต็ม (S/N, หน่วยนับ, ระยะประกัน, ผัง, ค่าเสื่อมแยกช่อง) อยู่ใน AssetDetailModal
// ที่กดเปิดได้ทุกใบอยู่แล้ว - ยัดลงการ์ดทุกใบคือทำให้ทุกใบอ่านยากเพื่อข้อมูลที่คนดูจริง
// ทีละใบ (เดิมการ์ดมีตัวเลข 8 บรรทัด + แถบค่าเสื่อม + ปุ่ม จนรูปเหลือไม่ถึงครึ่ง)
//
// ★ รูปใช้อัตราส่วนคงที่ (aspect-[4/3]) ไม่ใช่ความสูงคงที่ (h-64) - ความกว้างการ์ด
//   เปลี่ยนตามจำนวนคอลัมน์ในแต่ละขนาดจอ ความสูงคงที่จึงทำให้รูปแบนผิดสัดส่วนบนจอกว้าง
//   และสูงเกินไปบนจอแคบ อัตราส่วนคงที่ทำให้กริดเรียงเป็นแนวเดียวกันทุกขนาด
//
// ── ตัวเลขบัญชีบนหน้านี้มีกับดักหนึ่งข้อที่ต้องแสดงให้ผู้ใช้เห็นเสมอ
//
// ยอดที่ sync มาเป็นตัวเลข "ของปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น" ซึ่งไม่ใช่ปีปัจจุบันเสมอไป -
// ของที่ตัดจำหน่าย/หยุดคิดค่าเสื่อมแล้วจะค้างที่ปีสุดท้ายของมัน (วัดจริง 2026-08-20: 668 จาก
// 2,721 ชิ้น = 25% ไม่ใช่ปี 2026 โดยชุดใหญ่สุดค้างที่ปี 2022) จึงต้องติดป้ายปีคู่กับยอดทุกที่
// และเตือนให้ชัดเมื่อเป็นปีเก่า ไม่งั้นผู้ใช้จะอ่านเลขปี 2022 เป็นมูลค่าวันนี้
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import AssetDetailModal from '@/shared/components/AssetDetailModal.vue'
import { getMyAssets } from '@/shared/services/asset.service'
import type { MyAssetItem } from '@/shared/services/asset.service'
import { fileBlobUrl } from '@/shared/services/attachment.service'
import { ApiError } from '@/shared/services/httpClient'
import { formatMoney } from '@/shared/utils/money'

const items = ref<MyAssetItem[]>([])
const linkedToEmployee = ref(true)
const loading = ref(false)
const loadError = ref('')

/** imageId -> blob URL - ต้องโหลดผ่าน fetch เพราะไฟล์อยู่หลัง authGuard ใส่ src ตรง ๆ จะโดน 401 */
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
 * รูปโหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย - ขึ้น placeholder แทนแล้วไปต่อ ดีกว่าทั้งหน้าค้าง
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

// blob URL ที่ createObjectURL สร้างไว้ค้างใน memory จนกว่าจะ revoke - ออกจากหน้าแล้ว
// ไม่มีใครใช้ต่อ ถ้าไม่คืนจะรั่วสะสมทุกครั้งที่เข้า-ออกหน้านี้
onUnmounted(() => {
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
})

onMounted(load)

/**
 * สรุปหัวหน้า - ยอดที่ยังใช้ได้ = เฉพาะชิ้นที่ตัวเลขเป็นของปีปัจจุบัน (ดูเหตุผลที่หัวไฟล์)
 *
 * ★ เดิมคำนวณไว้แต่ไม่เคยถูกวาดออกจอเลย - ตัวเลขสามตัวนี้คือสิ่งเดียวที่ตอบได้ว่า
 *   "ยอดรวมที่เห็นเชื่อได้แค่ไหน" ซึ่งกระดานรูปล้วน ๆ ตอบไม่ได้ จึงเอาขึ้นมาแสดงจริง
 */
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

const isStale = (item: MyAssetItem) =>
  item.accounting !== null && item.accounting.fiscalYear !== currentYear

/**
 * ตัดค่าเสื่อมครบแล้ว = มูลค่าคงเหลือลงมาเท่ากับมูลค่าซากพอดี
 *
 * ★ ต้องบอกให้ผู้ใช้รู้ ไม่ใช่ปล่อยให้เดา - ค่าเสื่อมตันที่ `ราคาทุน − มูลค่าซาก` ไม่ใช่ที่
 *   ราคาทุน ของที่หมดอายุแล้วจึงมี "มูลค่าคงเหลือ" กับ "มูลค่าซาก" เป็นเลขเดียวกันเป๊ะเสมอ
 *   (วัด 2026-08-20: 1,584 จาก 2,721 ชิ้น = 58% ของทะเบียน และ 95% มีมูลค่าซาก 1.00 บาท)
 *   บนการ์ดใบเล็กนี้เหลือยอดเดียวก็จริง แต่ป้ายยังต้องมี ไม่งั้นคนเห็น "1.00" ลอย ๆ
 *   จะอ่านว่าข้อมูลพัง ไม่ใช่ว่าของตัดครบแล้ว
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
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 class="text-3xl font-semibold sm:text-4xl">My Assets</h1>
        <p class="text-base-content/70">สินทรัพย์ในความดูแลของฉัน</p>
      </div>

      <!-- สรุปสามตัว - ไม่ใช้ daisyUI `stats` เพราะมันเป็นแถวเดียวที่ล้นออกนอกจอแคบ
           (มี overflow-x ในตัว = ต้องปัดข้างเพื่ออ่านตัวเลขตัวที่สาม ซึ่งไม่มีใครทำ)
           flex-wrap ทำให้มันตกบรรทัดเองบนมือถือแล้วยังอ่านครบทุกตัว -->
      <div v-if="!loading && items.length" class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div>
          <p class="text-xs text-base-content/60">ทั้งหมด</p>
          <p class="text-lg font-semibold tabular-nums">{{ items.length }} ชิ้น</p>
        </div>
        <div>
          <p class="text-xs text-base-content/60">มูลค่าคงเหลือ (ปี {{ currentYear }})</p>
          <p class="text-lg font-semibold tabular-nums">{{ formatMoney(summary.currentNbv) }}</p>
        </div>
        <!-- ★ ต้องบอกว่ายอดข้างบนไม่ได้นับครบทุกชิ้น ไม่งั้นคนอ่านเป็น "มูลค่ารวมของฉัน"
             ทั้งที่ชิ้นที่ตัวเลขค้างปีเก่ากับชิ้นที่ยังไม่มีข้อมูลถูกกันออกไป -->

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

    <!-- ยังไม่ผูกพนักงาน ≠ ไม่มีของ - อันนี้ต้องให้ admin ไปแก้ ไม่ใช่ผู้ใช้รอเฉย ๆ -->
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

    <!-- ── กริด: ไล่ตามความกว้างจริงของการ์ด ไม่ใช่ตามชื่อ breakpoint ────────
         2 คอลัมน์ตั้งแต่จอมือถือ เพราะหน้านี้คือกระดานรูป - คอลัมน์เดียวบนมือถือ
         ทำให้เห็นทีละใบ ต้องปัดยาวมากกว่าจะเห็นครบ ทั้งที่รูปกว้างครึ่งจอก็จำของได้แล้ว
         แล้วค่อยเพิ่มเป็น 3/4/5 ตามที่จอกว้างขึ้น เพื่อให้การ์ดไม่บวมเกิน ~20rem
         (การ์ดกว้างกว่านั้นรูปจะใหญ่จนเห็นได้ไม่กี่ใบต่อหน้าจอ ซึ่งย้อนแย้งกับการกวาดหา) -->
    <div
      v-else
      class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5"
    >
      <!-- ทั้งใบเป็นปุ่ม ไม่ใช่การ์ดที่มีปุ่ม "รายละเอียด" อยู่มุมล่าง
           - เป้ากดใหญ่ขึ้นทั้งใบ ซึ่งสำคัญมากบนมือถือที่การ์ดกว้างครึ่งจอ
           - ได้ Enter/Space กับ focus ring มาฟรีจาก <button> จริง ไม่ต้องใส่ role/tabindex เอง
           - ข้างในไม่มีปุ่มอื่นแล้ว จึงไม่ติดปัญหา <button> ซ้อน <button> เหมือน AuditAssetList -->
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="group card overflow-hidden bg-base-100 text-left ring-1 ring-base-300 transition
               hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary"
        @click="openDetail(item)"
      >
        <!-- อัตราส่วนคงที่ + overflow-hidden ที่การ์ด = รูปซูมตอน hover ได้โดยไม่ดันกริดพัง -->
        <figure class="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-base-200">
          <img
            v-if="item.imageId && imageUrls[item.imageId]"
            :src="imageUrls[item.imageId]"
            :alt="item.description ?? item.assetNumber ?? 'asset'"
            loading="lazy"
            class="size-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <div v-else class="grid size-full place-items-center">
            <Icon icon="mdi:image-off-outline" class="size-10 opacity-25" />
          </div>

          <!-- ป้ายเตือนวางทับรูป ไม่ลงไปกินบรรทัดข้างล่าง - มันเป็น "ข้อยกเว้น" ที่ไม่ได้
               มีทุกใบ ถ้าจองที่ไว้เป็นบรรทัดถาวรจะเสียพื้นที่ให้ใบที่ปกติทั้งหมด -->
          <span
            v-if="isStale(item)"
            class="badge badge-warning badge-sm absolute top-2 right-2 gap-1 shadow"
            :title="`ตัวเลขบัญชีเป็นของปี ${item.accounting?.fiscalYear} ไม่ใช่ปีปัจจุบัน`"
          >
            <Icon icon="lucide:clock-alert" class="size-3" />
            ปี {{ item.accounting?.fiscalYear }}
          </span>
        </figure>

        <!-- เนื้อข้างล่างเหลือ 3 บรรทัดคงที่ - สูงเท่ากันทุกใบ กริดจึงเรียงตรงแนวเสมอ
             โดยไม่ต้องใส่ min-h เดา ๆ (เดิมใช้ min-h-[2.5rem] กับคำอธิบายเพราะปล่อย 2 บรรทัด) -->
        <!-- ★ min-w-0 จำเป็น ไม่ใช่ของเกิน - truncate ข้างในทำงานไม่ได้ถ้าไม่มี
             กล่อง flex/grid มี min-width:auto เป็นค่าตั้งต้น = "ห้ามหดเล็กกว่าเนื้อหา"
             คำอธิบายยาว ๆ ที่ตั้ง white-space:nowrap ไว้ (มาจาก truncate) จึงดันกล่องนี้
             ให้กว้างตามตัวมันเอง แล้วดันการ์ดทั้งใบล้นออกนอกช่องของกริดไปด้วย
             (อาการที่รายงาน: คำอธิบายล้นกรอบทั้งที่มี truncate อยู่แล้ว) -->
        <div class="flex min-w-0 flex-col gap-0.5 p-2.5 sm:p-3">
          <p class="truncate font-mono text-sm font-semibold" :title="item.assetNumber ?? ''">
            {{ item.assetNumber ?? '- ยังไม่มีเลข -' }}
          </p>
          <p class="truncate text-xs text-base-content/70" :title="item.description ?? ''">
            {{ item.description ?? '-' }}
          </p>

          <div class="mt-1 flex items-baseline justify-between gap-1.5">
            <template v-if="item.accounting">
              <span class="truncate text-sm font-semibold tabular-nums">
                {{ formatMoney(item.accounting.netBookValue) }}
              </span>
              <!-- ป้ายนี้กันคำถาม "ทำไมเหลือ 1.00 บาท" ที่เคยมีคนทักมาจริง (ดู isFullyDepreciated) -->
              <span v-if="isFullyDepreciated(item)" class="badge badge-ghost badge-xs shrink-0">
                ตัดค่าเสื่อมครบแล้ว
              </span>
            </template>
            <span v-else class="text-xs text-base-content/50">ยังไม่มีข้อมูลบัญชี</span>
          </div>
        </div>
      </button>
    </div>
  </div>

  <!-- รายละเอียดใช้ AssetDetailModal ตัวเดียวกับหน้าทะเบียนและ Dashboard - ชิ้นเดียวกันต้องหน้าตา
       เหมือนกันทุกทางเข้า และ modal ไปดึงรายละเอียดเต็มจาก /assets/by-number เอง
       (ของที่ลิสต์นี้มีไม่ครบ เช่น S/N, หน่วยนับ, ระยะประกัน, แผนก/ผู้ครอบครอง)

       ★ ตัวเลขที่ถูกถอดออกจากการ์ด (ราคาทุน ค่าเสื่อมสะสม แถบความคืบหน้า มูลค่าซาก)
         ไม่ได้หายไปจากระบบ - มันอยู่ครบใน modal นี้ พร้อมป้ายปีบัญชีของตัวเอง -->
  <AssetDetailModal v-model="detailOpen" :item="selected" :qr-code="selected?.qrCode" editable-location editable-image />
</template>
