<script setup lang="ts">
// ตารางรายการสินทรัพย์ — ใช้ร่วมกันระหว่างหน้า Asset Inventory (ทั้งบริษัท)
// กับตารางรายแผนกบน Dashboard
//
// ★ ก่อนหน้านี้สองที่นั้นเป็นไฟล์คนละใบที่ก็อปกันมา แล้วเริ่มเพี้ยนจากกันแล้วจริง ๆ
//   (ป้ายสถานะคนละชุด, DepartmentTable มี prop ที่ถูก ref ชื่อซ้ำบังจนไม่เคยถูกใช้)
//   ตารางสินทรัพย์ต้องหน้าตาเดียวกันทุกหน้า ไม่งั้นคนอ่านสถานะจากสองหน้าได้คำตอบคนละอย่าง
//
// component นี้ "แสดงอย่างเดียว" — ไม่ยิง API ไม่ถือ page ไม่รู้จักตัวกรอง
// คนเรียกเป็นคนโหลดข้อมูลแล้วส่ง items เข้ามา แล้วรับ @select ไปเปิดรายละเอียดเอง
import { computed, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { InventoryItem } from '@/services/asset.service'
import { fileBlobUrl } from '@/services/attachment.service'
import { formatDate } from '@/utils/date'
import { formatMoney } from '@/utils/money'

const props = withDefaults(
  defineProps<{
    items: InventoryItem[]
    loading?: boolean
    /** ซ่อนคอลัมน์แผนกเมื่อทั้งตารางเป็นแผนกเดียวกันอยู่แล้ว — ค่าซ้ำทุกแถวไม่ได้บอกอะไร */
    showDepartment?: boolean
    /**
     * เปิดคอลัมน์มูลค่าคงเหลือ — ปิดไว้เป็นค่าตั้งต้นโดยตั้งใจ
     *
     * ตารางบน Dashboard ตอบคำถาม "ของอยู่ไหน ใครถือ" ซึ่งไม่ต้องใช้ตัวเลขเงิน
     * และหน้านั้นมีการ์ดยอดรวมอยู่เหนือตารางอยู่แล้ว เอามาใส่ซ้ำมีแต่ทำให้แถวแน่นขึ้น
     */
    showAccounting?: boolean
    /** จองความสูงไว้กี่แถว ดูหมายเหตุที่ minHeight ข้างล่าง */
    minRows?: number
  }>(),
  { loading: false, showDepartment: true, showAccounting: false, minRows: 8 },
)

const emit = defineEmits<{ (e: 'select', item: InventoryItem): void }>()

/**
 * จองความสูงขั้นต่ำไว้ กันกล่องยุบตามจำนวนผลลัพธ์
 *
 * ไม่ล็อกไว้แล้วจะเป็นแบบนี้: ค้นจนเหลือชิ้นเดียว กล่องหดจากสิบแถวเหลือแถวเดียว
 * แถบเลขหน้ากับท้ายหน้ากระโดดขึ้นมาเกือบเต็มจอ แล้วพอกดหน้าถัดไปก็กระโดดกลับ
 *
 * ตัวเลขวัดจากของจริงในเบราว์เซอร์: แถวละ 68.8px (รูป size-11 = 44px คุมความสูง
 * + padding ของ daisyUI) หัวตาราง 45.8px
 * ★ แก้ความสูงรูปหรือเปลี่ยนเป็น table-sm เมื่อไหร่ ต้องวัดใหม่แล้วแก้สองเลขนี้
 *
 * ไม่ใช้ max-h เพราะไม่ต้องการให้ตารางมี scroll ของตัวเองซ้อนกับ scroll ของหน้า
 */
const ROW_PX = 68.8
const HEAD_PX = 45.8
const minHeight = computed(() => `${(props.minRows * ROW_PX + HEAD_PX) / 16}rem`)

/** 6 คอลัมน์คงที่ + สองคอลัมน์ที่เปิด/ปิดได้ — ใช้กับ colspan ของแถวว่าง */
const colCount = computed(() => 6 + (props.showDepartment ? 1 : 0) + (props.showAccounting ? 1 : 0))

const currentYear = new Date().getFullYear()

/**
 * ยอดนี้เป็นตัวเลขของปีเก่าหรือเปล่า
 *
 * ★ ต้องติดป้ายปีคู่กับยอดเสมอ ห้ามตัดทิ้งเพราะ "ตารางแคบ" — ยอดที่ sync มาเป็นของ
 *   ปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น ซึ่งค้างที่ปีเก่าได้จริง (วัด 2026-08-20: 25%
 *   ของทะเบียน) ถ้าไม่บอก คนจะอ่านเลขปี 2022 เป็นมูลค่าของวันนี้
 */
const isStale = (item: InventoryItem) =>
  item.accounting !== null && item.accounting.fiscalYear !== currentYear

/** imageId -> blob URL — ไฟล์อยู่หลัง authGuard ใส่ src ตรง ๆ จะโดน 401 */
const imageUrls = ref<Record<string, string>>({})

/**
 * โหลดรูปทีละใบแบบไม่ให้ใบที่พังลากใบอื่นตาย
 *
 * รูปโหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — ขึ้นไอคอนแทนแล้วไปต่อ ดีกว่าทั้งตารางค้างเพราะ
 * ไฟล์เดียวหาย (ไฟล์ถูกลบจาก disk แต่ imageId ยังอยู่เป็นเคสที่เกิดได้จริง)
 */
watch(
  () => props.items,
  (list) => {
    for (const item of list) {
      if (!item.imageId || imageUrls.value[item.imageId]) continue
      const id = item.imageId
      void fileBlobUrl(id)
        .then((url) => {
          imageUrls.value[id] = url
        })
        .catch(() => {
          // ปล่อยว่างไว้ ให้ template ขึ้นไอคอนแทน
        })
    }
  },
  { immediate: true },
)

// blob URL ค้างใน memory จนกว่าจะ revoke — ออกจากหน้าแล้วไม่มีใครใช้ต่อ
// ถ้าไม่คืนจะรั่วสะสมทุกครั้งที่เข้า-ออกหน้านี้ (ยิ่งเปลี่ยนหน้าบ่อยยิ่งสะสมเร็ว)
onUnmounted(() => {
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
})

// ป้ายสถานะ — คีย์ต้องตรงกับ enum asset_status ของ DB เป๊ะ
// ('Under Maintenance' มีเว้นวรรค ไม่ใช่ขีดล่าง — เคยเขียนผิดมาแล้วจนป้ายไม่เคยเจอคู่)
const STATUS_LABEL: Record<string, string> = {
  Active: 'Active',
  Inactive: 'Inactive',
  'Under Maintenance': 'Under Maintenance',
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
</script>

<template>
  <div
    class="overflow-x-auto rounded-box border border-base-300"
    :style="{ minHeight }"
  >
    <table class="table table-pin-rows">
      <thead>
        <tr>
          <th class="w-16"></th>
          <th>เลขสินทรัพย์</th>
          <th>รายละเอียด</th>
          <th v-if="showDepartment">แผนก</th>
          <th>ที่ตั้ง</th>
          <th>ผู้ครอบครอง</th>
          <th v-if="showAccounting" class="text-right whitespace-nowrap">มูลค่าคงเหลือ</th>
          <th class="text-center">สถานะ</th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="item in items"
          :key="item.id"
          class="cursor-pointer hover:bg-base-200"
          @click="emit('select', item)"
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
              <span v-if="item.acquisitionDate">
                ลงทะเบียนเมื่อ {{ formatDate(item.acquisitionDate) }}
              </span>
            </div>
          </td>

          <td v-if="showDepartment" class="whitespace-nowrap">
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

          <!-- ยอดต้องมาคู่กับปีบัญชีเสมอ และปีเก่าต้องเห็นได้จากในแถวโดยไม่ต้องเปิดดูรายชิ้น
               null ≠ 0: '—' = SAP ยังไม่มีตัวเลขให้ ส่วน 0.00 = ตัดค่าเสื่อมครบแล้วจริง -->
          <td v-if="showAccounting" class="text-right whitespace-nowrap">
            <template v-if="item.accounting">
              <div class="tabular-nums">{{ formatMoney(item.accounting.netBookValue) }}</div>
              <div
                class="text-xs"
                :class="isStale(item) ? 'text-warning' : 'text-base-content/60'"
              >
                ปี {{ item.accounting.fiscalYear }}
              </div>
            </template>
            <span v-else class="text-base-content/40 italic">ไม่มีข้อมูล</span>
          </td>

          <td class="text-center">
            <span class="badge badge-sm whitespace-nowrap" :class="statusBadge(item.status)">
              {{ statusLabel(item.status) }}
            </span>
          </td>
        </tr>

        <tr v-if="loading && !items.length">
          <td :colspan="colCount" class="py-12 text-center text-base-content/50">
            <span class="loading loading-spinner loading-lg mb-2 block" />
            กำลังโหลด...
          </td>
        </tr>

        <!-- ข้อความตอนไม่มีของ คนเรียกเป็นคนกำหนดเอง — "ค้นไม่เจอ" แก้ด้วยการเปลี่ยนคำค้น
             ส่วน "แผนกนี้ยังไม่มีของ" แก้ด้วยการไปลงทะเบียน คนละทางแก้กันคนละเรื่อง -->
        <tr v-else-if="!items.length">
          <td :colspan="colCount" class="py-12 text-center text-base-content/50">
            <slot name="empty">
              <Icon icon="mdi:package-variant" class="mx-auto size-12 opacity-40" />
              <p class="mt-2">ไม่มีรายการ</p>
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
