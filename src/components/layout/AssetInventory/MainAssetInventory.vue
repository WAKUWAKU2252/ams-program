<script setup lang="ts">
// หน้า Asset Inventory — ทะเบียนสินทรัพย์ทั้งบริษัท ค้น/กรอง/เปิดดูรายชิ้น
//
// ★ เคยถูกยุบไปเป็นส่วนท้ายของ Dashboard ช่วงหนึ่ง แล้วแยกกลับมา — อย่ายุบอีก
//   เหตุผลที่มันอยู่ร่วมหน้ากับ Dashboard ไม่ได้: สองหน้านี้มีกฎขอบเขตคนละชุด
//   (ดูข้อ 1) พอมาอยู่หน้าเดียวกันจะได้ช่อง "แผนก" สองช่องที่ทำงานคนละแบบ
//   ช่องหนึ่งล็อกกดไม่ได้ อีกช่องกดได้ — สับสนโดยไม่มีทางอธิบายให้ผู้ใช้เข้าใจ
//   และหน้าแรกของทุกคนต้องแบกคำขอเพิ่มอีกสิบกว่ารายการเพื่อตารางที่ส่วนใหญ่ไม่ได้เลื่อนไปดู
//
// ── สามอย่างที่หน้านี้ต้องทำให้ถูก ──────────────────────────────────────────
//
// 1. **ไม่จำกัดตามคนที่ล็อกอิน** — ต่างจาก My asset ("ของฉัน") และ Dashboard (ล็อกแผนก
//    ตาม role) หน้านี้ตอบว่า "ของชิ้นนี้อยู่ไหน ใครดูแล" ให้ทุกคน เพราะคนที่ตามหาเครื่อง
//    มักไม่ใช่คนแผนกเดียวกับที่ของสังกัดอยู่ (ช่างซ่อม/คนตรวจนับ/คนยืมข้ามแผนก)
//
// 2. **แบ่งหน้าฝั่ง backend ไม่ใช่ฝั่งจอ** — ทะเบียนจริงมี 2,700+ ชิ้น ต่างจากตารางสรุป
//    รายแผนกบน Dashboard ที่ตัดหน้าฝั่งจอได้เพราะข้อมูลมาครบทั้งก้อนอยู่แล้ว
//    ที่นี่ดึงทีละหน้า → เปลี่ยนหน้า/ค้น/กรอง = ยิง API ใหม่ทุกครั้ง
//
// 3. **ตัวเลขบัญชีค้างปีเก่าได้** — ยอดที่ sync มาเป็นของ "ปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น"
//    ซึ่งไม่ใช่ปีปัจจุบันเสมอไป (วัด 2026-08-20: 25% ของทะเบียน) ต้องติดป้ายปีคู่กับยอดเสมอ
//    เหมือนหน้า My asset ไม่งั้นคนอ่านเลขปี 2022 เป็นมูลค่าวันนี้
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import AppPagination from '@/components/common/AppPagination.vue'
import { getAssetInventory } from '@/services/asset.service'
import type { InventoryItem } from '@/services/asset.service'
import { listDepartments } from '@/services/master.service'
import type { DepartmentOption } from '@/services/master.service'
import { fileBlobUrl } from '@/services/attachment.service'
import { ApiError } from '@/services/httpClient'
import { formatDate } from '@/utils/date'
import { formatMoney } from '@/utils/money'

const router = useRouter()

const items = ref<InventoryItem[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const loadError = ref('')

/** ข้อความในช่องค้นหา — ยังไม่ใช่คำที่ยิงไปจริง (ดู debounce ข้างล่าง) */
const searchText = ref('')
const departmentId = ref<string>('')
const departments = ref<DepartmentOption[]>([])

const currentYear = new Date().getFullYear()

/** imageId -> blob URL — ไฟล์อยู่หลัง authGuard ใส่ src ตรง ๆ จะโดน 401 */
const imageUrls = ref<Record<string, string>>({})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAssetInventory({
      page: page.value,
      limit,
      search: searchText.value,
      departmentId: departmentId.value ? Number(departmentId.value) : undefined,
    })
    items.value = res.data
    total.value = res.total
    await loadThumbnails(res.data)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการสินทรัพย์ไม่สำเร็จ'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * โหลดรูปทีละใบแบบไม่ให้ใบที่พังลากใบอื่นตาย
 *
 * รูปโหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — ขึ้นไอคอนแทนแล้วไปต่อ ดีกว่าทั้งตารางค้างเพราะ
 * ไฟล์เดียวหาย (ไฟล์ถูกลบจาก disk แต่ imageId ยังอยู่เป็นเคสที่เกิดได้จริง)
 */
async function loadThumbnails(list: InventoryItem[]) {
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

// blob URL ค้างใน memory จนกว่าจะ revoke — ออกจากหน้าแล้วไม่มีใครใช้ต่อ
// ถ้าไม่คืนจะรั่วสะสมทุกครั้งที่เข้า-ออกหน้านี้ (ยิ่งหน้านี้เปลี่ยนหน้าบ่อยยิ่งสะสมเร็ว)
onUnmounted(() => {
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
})

onMounted(async () => {
  // โหลดคู่กันไปเลย ไม่ต้องรอกัน — ตัวเลือกแผนกไม่ใช่เงื่อนไขของการโหลดตาราง
  void loadDepartments()
  await load()
})

/**
 * ตัวเลือกแผนกมาจาก /master/departments ไม่ใช่จากผลลัพธ์ในหน้า
 *
 * ต่างจาก Dashboard ที่อ่านจาก byDepartment ได้ — ที่นี่ข้อมูลมาทีละหน้า แผนกที่จะโผล่
 * จึงขึ้นกับว่าบังเอิญอยู่หน้าไหน ซึ่งใช้เป็นลิสต์ตัวกรองไม่ได้เลย
 */
async function loadDepartments() {
  try {
    departments.value = await listDepartments()
  } catch {
    // เลือกแผนกไม่ได้ไม่ควรทำให้ทั้งหน้าพัง — ตารางยังค้นได้ตามปกติ
  }
}

/**
 * หน่วงก่อนยิงตอนพิมพ์ค้น — ไม่งั้นพิมพ์ 10 ตัวอักษรได้ 10 request
 *
 * ★ ต้องรีเซ็ตกลับหน้า 1 ทุกครั้งที่เงื่อนไขเปลี่ยน: ค้างอยู่หน้า 5 แล้วพิมพ์ค้นจนเหลือ
 *   3 ชิ้น จะได้ตารางว่างทั้งที่มีผลลัพธ์ และแถบเลขหน้าก็หายไปด้วย (เหลือหน้าเดียว)
 *   = ไม่มีปุ่มให้กดกลับ ผู้ใช้ติดอยู่ตรงนั้นจนกว่าจะรีโหลดหน้า
 */
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void load()
  }, 350)
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

// เปลี่ยนแผนกยิงทันที ไม่ต้องหน่วง — เป็นการกดเลือกครั้งเดียว ไม่ใช่การพิมพ์รัว
watch(departmentId, () => {
  page.value = 1
  void load()
})

function onPageChange(next: number) {
  page.value = next
  void load()
  // เปลี่ยนหน้าแล้วตาต้องกลับไปอยู่หัวตาราง ไม่ใช่ค้างอยู่ท้ายหน้าเดิม
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearFilters() {
  searchText.value = ''
  departmentId.value = ''
  // watch ของ searchText หน่วง 350ms — กรองแผนกยิงทันทีอยู่แล้ว ปล่อยให้สองตัวนั้นทำงาน
}

const hasFilter = computed(() => !!searchText.value.trim() || !!departmentId.value)

/**
 * เปิดหน้ารายละเอียดของชิ้นนั้น — ใช้เส้นเดียวกับที่ QR บนสติกเกอร์พาไป
 *
 * ต้อง encode: เลขจริงบางตัวมี '/' อยู่ข้างใน (MAC-212-13-001/1) ถ้าไม่ encode
 * router จะตัดเป็นคนละ segment แล้วตกไป catch-all → เด้ง dashboard โดยไม่บอกอะไร
 */
function openAsset(item: InventoryItem) {
  router.push(`/assets/${encodeURIComponent(item.assetNumber)}`)
}

const isStale = (item: InventoryItem) =>
  item.accounting !== null && item.accounting.fiscalYear !== currentYear

// ป้ายสถานะ — ชื่อไทยกับสีชุดเดียวกับที่ Dashboard ใช้ ต้องไม่เพี้ยนกันคนละหน้า
const STATUS_LABEL: Record<string, string> = {
  Active: 'active',
  Inactive: 'Inactive',
  Under_Maintenance : 'Under Maintenance',
  Lost: 'Missing',
  Disposed: 'Disposed',
}

const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-success',
  Inactive: 'badge-ghost',
  'Under Maintenance': 'badge-warning',
  Lost: 'badge-error',
  Disposed: 'badge-neutral',
}

// สถานะที่ไม่รู้จัก (เพิ่มค่าใน enum แล้วลืมมาแก้ที่นี่) ต้องโชว์ค่าดิบ ไม่ใช่ช่องว่าง
const statusLabel = (status: string) => STATUS_LABEL[status] ?? status
const statusBadge = (status: string) => STATUS_BADGE[status] ?? 'badge-ghost'

/** ลำดับที่กำลังแสดง เช่น "21–40 จาก 2,713 ชิ้น" */
const range = computed(() => {
  if (total.value === 0) return ''
  const start = (page.value - 1) * limit + 1
  return `${start}–${Math.min(start + limit - 1, total.value)} จาก ${total.value.toLocaleString('th-TH')} ชิ้น`
})
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="text-left">
      <h1 class="text-3xl font-semibold sm:text-4xl">Asset Inventory</h1>
      <p class="text-base-content/70">ทะเบียนสินทรัพย์ทั้งหมด ค้นหาและดูรายละเอียดรายชิ้น</p>
    </div>

    <!-- ── แถบค้นหา/กรอง ──────────────────────────────────────────────────── -->
    <div class="mt-5 flex flex-wrap items-end gap-3">
      <label class="form-control w-full max-w-md text-left">
        <span class="mb-1 text-xs text-base-content/60">ค้นหา</span>
        <div class="input flex w-full items-center gap-2">
          <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
          <input
            v-model="searchText"
            type="search"
            class="grow"
            placeholder="เลขสินทรัพย์ / ชื่อของ / เลขเครื่อง (S/N)"
          />
          <!-- ตัวหมุนอยู่ในช่องค้น ไม่ใช่ทับทั้งตาราง — ผลลัพธ์เดิมยังอ่านได้ระหว่างรอของใหม่ -->
          <span v-if="loading" class="loading loading-spinner loading-xs shrink-0" />
        </div>
      </label>

      <label class="form-control w-full max-w-xs text-left">
        <span class="mb-1 flex items-center gap-1.5 text-xs text-base-content/60">
          <Icon icon="lucide:filter" class="size-3.5" />
          แผนก
        </span>
        <select v-model="departmentId" class="select w-full">
          <option value="">ทุกแผนก</option>
          <option v-for="d in departments" :key="d.id" :value="String(d.id)">{{ d.name }}</option>
        </select>
      </label>

      <button v-if="hasFilter" class="btn btn-ghost btn-sm" @click="clearFilters">
        <Icon icon="lucide:x" class="size-4" />
        ล้างตัวกรอง
      </button>

      <span class="ml-auto text-sm text-base-content/60">{{ range }}</span>
    </div>

    <div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-4">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
    </div>

    <!-- ── ตาราง ──────────────────────────────────────────────────────────
         min-h = พื้นที่ 8 แถวพอดี — วัดจากของจริงในเบราว์เซอร์: แถวละ 68.8px
         (รูป size-11 = 44px คุมความสูง + padding ของ daisyUI) + หัวตาราง 45.8px
         = 597px จึงตั้ง 37.5rem (600px)

         กันกล่องยุบตามจำนวนผลลัพธ์: ค้นจนเหลือชิ้นเดียวแล้วกล่องหดจาก 20 แถวเหลือ 1
         ทำให้แถบเลขหน้ากับที่ว่างท้ายหน้ากระโดดขึ้นมาเกือบเต็มจอ ล็อกไว้แล้วตำแหน่งนิ่ง
         ★ แก้ความสูงรูป/เปลี่ยนเป็น table-sm เมื่อไหร่ ต้องวัดใหม่แล้วแก้เลขนี้ด้วย

         ไม่ใช้ max-h เพราะไม่ต้องการให้ตารางมี scroll ของตัวเองซ้อนกับ scroll ของหน้า -->
    <div class="mt-4 min-h-[37.5rem] overflow-x-auto rounded-box border border-base-300">
      <table class="table table-pin-rows">
        <thead>
          <tr>
            <th class="w-16"></th>
            <th>เลขสินทรัพย์</th>
            <th class="w-12 ">รายละเอียด</th>
            <th>แผนก</th>
            <th>ที่ตั้ง</th>
            <th>ผู้ดูแล</th>
            <th class="text-center">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
            class="cursor-pointer hover:bg-base-200"
            @click="openAsset(item)"
          >
            <td>
              <div class="grid size-11 place-items-center overflow-hidden rounded bg-base-200">
                <img
                  v-if="item.imageId && imageUrls[item.imageId]"
                  :src="imageUrls[item.imageId]"
                  :alt="item.description ?? item.assetNumber"
                  class="size-full object-cover"
                />
                <Icon v-else icon="mdi:image-off-outline" class="size-5 opacity-30" />
              </div>
            </td>

            <td class="font-mono whitespace-nowrap">
              {{ item.assetNumber }}
              <div v-if="item.serialNumber" class="font-sans text-xs text-base-content/60">
                S/N {{ item.serialNumber }}
              </div>
            </td>

            <td class="max-w-xs">
              <div class="truncate">{{ item.description ?? '—' }}</div>
              <div class="flex flex-wrap items-center gap-1 text-xs text-base-content/60">
                <span v-if="item.categoryName">{{ item.categoryName }}</span>
                <span v-if="item.categoryName && item.acquisitionDate">·</span>
                <span v-if="item.acquisitionDate">ลงทะเบียนเมื่อ {{ formatDate(item.acquisitionDate) }}</span>
              </div>
            </td>

            <td class="whitespace-nowrap">
              <span :class="item.departmentName ? '' : 'text-base-content/40 italic'">
                {{ item.departmentName ?? 'ยังไม่ระบุ' }}
              </span>
            </td>

            <td>
              <div class="whitespace-nowrap">{{ item.locationName }}</div>
              <div v-if="item.subLocationName" class="text-xs text-base-content/60">
                {{ item.subLocationName }}
              </div>
            </td>

            <td>
              <span :class="item.holderName ? '' : 'text-base-content/40 italic'">
                {{ item.holderName ?? 'ไม่ระบุ' }}
              </span>
            </td>

            <td class="text-center">
              <span class="badge badge-sm whitespace-nowrap" :class="statusBadge(item.status)">
                {{ statusLabel(item.status) }}
              </span>
            </td>


          </tr>

          <tr v-if="loading && !items.length">
            <td colspan="8" class="py-12 text-center text-base-content/50">
              <span class="loading loading-spinner loading-lg mb-2 block" />
              กำลังโหลด...
            </td>
          </tr>

          <!-- แยกสองข้อความให้ขาด: "ค้นไม่เจอ" แก้ด้วยการเปลี่ยนคำค้น
               ส่วน "ทะเบียนยังว่าง" แก้ด้วยการไปลงทะเบียน คนละทางแก้กันคนละเรื่อง -->
          <tr v-else-if="!items.length && !loadError">
            <td colspan="8" class="py-12 text-center text-base-content/50">
              <Icon icon="mdi:package-variant" class="mx-auto size-12 opacity-40" />
              <template v-if="hasFilter">
                <p class="mt-2">ไม่พบสินทรัพย์ที่ตรงกับเงื่อนไข</p>
                <button class="btn btn-sm mt-3" @click="clearFilters">ล้างตัวกรอง</button>
              </template>
              <p v-else class="mt-2">ยังไม่มีสินทรัพย์ในทะเบียน</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppPagination
      v-if="total > limit"
      class="mt-4"
      :page="page"
      :total="total"
      :limit="limit"
      @update:page="onPageChange"
    />
  </div>
</template>
