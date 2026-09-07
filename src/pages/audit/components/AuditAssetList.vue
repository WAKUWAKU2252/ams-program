<script setup lang="ts">
/**
 * รายการสินทรัพย์ฝั่งซ้ายของหน้า Audit - การ์ดต่อชิ้น ไม่ใช่ตาราง
 *
 * ทำไมไม่ใช้ AssetTable ที่มีอยู่: ตารางนั้นออกแบบให้กวาดอ่านหลายสิบแถวเทียบกัน จึงกว้าง
 * และคอลัมน์เยอะ พอมาอยู่ครึ่งจอคู่กับแผนที่จะเหลือคอลัมน์ละไม่กี่สิบ px แล้วทุกช่องถูก
 * truncate จนอ่านไม่ออก - หน้านี้อ่านทีละชิ้นเพื่อ "คลิกแล้วไปดูบนผัง" ไม่ใช่เทียบข้ามแถว
 *
 * component นี้แสดงอย่างเดียว: ไม่ยิง API ไม่ถือ page ไม่รู้จักตัวกรอง คนเรียกโหลดมาให้
 *
 * ★ ป้ายสถานะต้องใช้ชุดเดียวกับ AssetTable เป๊ะ (คีย์ตรงกับ enum asset_status)
 *   ไม่งั้นคนอ่านสถานะจากหน้า Audit กับหน้าทะเบียนจะได้คำตอบคนละอย่างสำหรับของชิ้นเดียวกัน
 */
import { Icon } from '@iconify/vue'
import type { InventoryItem } from '@/shared/services/asset.service'
import { formatMoney } from '@/shared/utils/money'

defineProps<{
  items: InventoryItem[]
  loading?: boolean
  /** id ของชิ้นที่กำลังดูบนแผนที่ - ใช้ไฮไลต์การ์ด */
  selectedId: number | null
}>()

const emit = defineEmits<{
  /** กดที่การ์ด = ไปดูตำแหน่งบนผัง */
  (e: 'select', item: InventoryItem): void
  /** กดปุ่ม "ดูรายละเอียด" = เปิด modal AssetDetailModal - คนละคำสั่งกับ select */
  (e: 'detail', item: InventoryItem): void
}>()

// ป้ายสถานะ - ยกกติกามาจาก AssetTable โดยตั้งใจให้เหมือนกันทุกตัวอักษร
// มีสองค่าเท่านั้น SAP เป็นเจ้าของแกนนี้ (ดู shared/utils/asset-status.ts)
const STATUS_LABEL: Record<string, string> = {
  Active: 'Active',
  Inactive: 'Inactive',
}

const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-success',
  Inactive: 'badge-ghost',
}

const statusLabel = (status: string) => STATUS_LABEL[status] ?? status
const statusBadge = (status: string) => STATUS_BADGE[status] ?? 'badge-ghost'

const currentYear = new Date().getFullYear()

/**
 * ที่ตั้งที่ auditor ใช้เดินไปหาของ = ห้อง ไม่ใช่สถานที่ทางบัญชี
 *
 * สองแกนนี้ตั้งใจให้ไม่ตรงกัน (asset.locationId คือสถานที่ทางบัญชีจาก SAP ส่วนห้องคือ
 * ที่ตั้งจริงบนผัง) - ป้ายจึงโชว์ห้องก่อนเสมอ แล้วค่อยตกไปที่สถานที่เมื่อยังไม่ระบุห้อง
 */
const placeLabel = (item: InventoryItem) => item.subLocationName ?? item.locationName

const placeTitle = (item: InventoryItem) =>
  item.subLocationName ? item.locationName + ' · ' + item.subLocationName : item.locationName

/**
 * ชี้บนผังได้แค่ไหน - สามระดับ ไม่ใช่มี/ไม่มี
 *   pinned   ปักหมุดแล้ว ชี้ได้ถึงจุด
 *   room     รู้ห้อง แต่ยังไม่ปักหมุด - ยังพาไปถูกห้อง
 *   unknown  ทะเบียนยังไม่ระบุห้อง
 */
function locateLevel(item: InventoryItem): 'pinned' | 'room' | 'unknown' {
  if (item.posX !== null) return 'pinned'
  return item.subLocationId !== null ? 'room' : 'unknown'
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="loading" class="flex flex-col gap-2">
      <div v-for="n in 5" :key="n" class="skeleton h-32 w-full shrink-0"></div>
    </div>

    <div
      v-else-if="!items.length"
      class="rounded-box border border-dashed border-base-300 p-8 text-center"
    >
      <Icon icon="lucide:package-search" class="mx-auto size-7 opacity-40" />
      <p class="mt-2 text-sm text-base-content/60">ไม่พบสินทรัพย์ที่ตรงกับเงื่อนไข</p>
    </div>

    <template v-else>
      <!--
        การ์ดเป็น div ไม่ใช่ button ทั้งที่ทั้งใบกดได้ - เพราะข้างในมีปุ่ม "ดูรายละเอียด"
        อยู่อีกตัว และ <button> ซ้อน <button> เป็น HTML ที่ผิดกติกา เบราว์เซอร์จะแยก
        DOM ออกจากกันเองตอน parse แล้วปุ่มข้างในจะหลุดออกไปอยู่นอกการ์ด
        (ใส่ role/tabindex/keydown ให้ครบแทน คีย์บอร์ดจึงยังกดเลือกได้เหมือนปุ่มจริง)

        ★ data-asset-id คือจุดที่หน้าแม่ใช้หาการ์ดเพื่อเลื่อนลิสต์ไปหา ตอนผู้ใช้คลิกหมุด
          บนผัง (ดู scrollToSelected ใน AuditPage.vue) - ห้ามถอดออกแม้จะดูไม่มีใครใช้
          ใน component นี้ กล่องที่เลื่อนอยู่ข้างนอก component จึง query ผ่าน DOM
      -->
      <div
        v-for="item in items"
        :key="item.id"
        :data-asset-id="item.id"
        role="button"
        tabindex="0"
        class="card w-full cursor-pointer border bg-base-100 text-left transition-colors"
        :class="
          item.id === selectedId
            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
            : 'border-base-300 hover:border-primary/50'
        "
        @click="emit('select', item)"
        @keydown.enter.prevent="emit('select', item)"
        @keydown.space.prevent="emit('select', item)"
      >
        <div class="card-body gap-2 p-3">
          <!-- แถวป้าย: สถานะ / แผนก / ที่ตั้ง - เรียงตามที่คนตรวจใช้คัดสายตาก่อนอ่านเลข

               ★ ต้อง flex-wrap ที่ชั้นนอกด้วย ไม่ใช่แค่ชั้นใน - เดิมชั้นนอกเป็น
                 justify-between ที่ตรึงป้าย "บนผัง/รู้ห้อง/ไม่ระบุที่ตั้ง" ไว้ขวาสุดเสมอ
                 บนการ์ดแคบ กลุ่มป้ายซ้ายจึงถูกบีบให้ตัดสองสามบรรทัดโดยที่ป้ายขวายังยืนเดี่ยว
                 ปล่อยให้ wrap ได้ทั้งแถว แล้วใช้ ml-auto ดันไปขวาเฉพาะตอนที่ยังมีที่เหลือ -->
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div class="flex flex-wrap items-center gap-1">
            <span class="badge badge-sm" :class="statusBadge(item.status)">
              {{ statusLabel(item.status) }}
            </span>
            <span v-if="item.departmentName" class="badge badge-sm badge-ghost">
              {{ item.departmentName }}
            </span>
            <span class="badge badge-sm badge-ghost gap-1" :title="placeTitle(item)">
              <Icon icon="lucide:map-pin" class="size-3" />
              {{ placeLabel(item) }}
            </span>
          </div>
          <div class="ml-auto">
            <!-- บอกล่วงหน้าว่าคลิกแล้วแผนที่จะพาไปได้ละเอียดแค่ไหน จะได้ไม่ต้องคลิกลองทีละชิ้น -->
            <span
              v-if="locateLevel(item) === 'pinned'"
              class="badge badge-sm badge-soft badge-primary shrink-0 gap-1"
              title="ปักหมุดบนผังแล้ว"
            >
              <Icon icon="lucide:crosshair" class="size-3" />
              บนผัง
            </span>
            <span
              v-else-if="locateLevel(item) === 'room'"
              class="badge badge-sm badge-ghost shrink-0 gap-1"
              title="รู้ว่าอยู่ห้องไหน แต่ยังไม่ได้ปักหมุด"
            >
              <Icon icon="lucide:scan-search" class="size-3" />
              รู้ห้อง
            </span>
            <span
              v-else
              class="badge badge-sm badge-soft badge-warning shrink-0 gap-1"
              title="ทะเบียนยังไม่ระบุว่าอยู่ห้องไหน"
            >
              <Icon icon="lucide:map-pin-off" class="size-3" />
              ไม่ระบุที่ตั้ง
            </span>
          </div>
          </div>

          <div class="flex items-center justify-start gap-2">
            <span class="truncate font-mono text-sm font-semibold text-primary">
              {{ item.assetNumber }}
            </span>

          </div>

          <p class="truncate text-sm" :title="item.description ?? ''">
            {{ item.description || 'ไม่มีรายละเอียด' }}
          </p>

        <!-- ปุ่มอยู่นอก <dl> ไม่ใช่เป็นคอลัมน์ที่สาม - dl รับได้แค่ dt/dd (หรือ div ที่ห่อสองตัวนั้น)
             ยัดปุ่มเข้าไปคือ markup ผิดชนิด ส่วนหน้าตายังเหมือนเดิม: สองช่องข้อมูล ปุ่มชิดขวา -->
        <!-- ★ มือถือ: ปุ่มลงไปอยู่บรรทัดของตัวเอง ไม่ยืนแถวเดียวกับข้อมูล
             การ์ดกว้างราว 340px ปุ่ม "ดูรายละเอียด" กินไป ~120px เหลือให้ dl สองคอลัมน์
             คอลัมน์ละ ~90px - ชื่อผู้ครอบครองโดนตัดเกือบหมด และยอดเงินกับป้ายปีตกบรรทัด
             จนอ่านไม่ออก (อาการในภาพที่ส่งมา)
             sm ขึ้นไปกลับเป็นแถวเดียวปุ่มชิดขวาเหมือนเดิมทุกอย่าง -->
        <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:gap-3">
          <dl class="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div class="min-w-0">
              <dt class="text-base-content/50">ผู้ครอบครอง</dt>
              <dd class="truncate" :title="item.holderName ?? ''">
                {{ item.holderName || '- ยังไม่ระบุ -' }}
              </dd>
            </div>

            <div class="min-w-0">
              <dt class="text-base-content/50">มูลค่าคงเหลือ</dt>
              <dd class="flex items-baseline gap-1">
                <!--
                  ★ ยอดต้องมาคู่ป้ายปีเสมอ ห้ามตัดทิ้งเพราะการ์ดแคบ - ยอดที่ sync มาเป็นของ
                    ปีบัญชีล่าสุดที่ SAP มีให้ชิ้นนั้น ซึ่งค้างปีเก่าได้จริง (วัด 2026-08-20:
                    25% ของทะเบียน) ไม่บอกปี = คนอ่านเลขปี 2022 เป็นมูลค่าของวันนี้
                    กติกาเดียวกับหน้าทะเบียนและ My asset
                -->
                <template v-if="item.accounting">
                  <span class="font-medium tabular-nums">
                    {{ formatMoney(item.accounting.netBookValue) }}
                  </span>
                  <span
                    class="badge badge-xs"
                    :class="
                      item.accounting.fiscalYear === currentYear
                        ? 'badge-ghost'
                        : 'badge-soft badge-warning'
                    "
                    :title="
                      item.accounting.fiscalYear === currentYear
                        ? 'ตัวเลขของปีบัญชีปัจจุบัน'
                        : 'ตัวเลขค้างอยู่ที่ปีบัญชีนี้ ไม่ใช่มูลค่าของวันนี้'
                    "
                  >
                    ปี {{ item.accounting.fiscalYear }}
                  </span>
                </template>
                <span v-else class="text-base-content/50">- ยังไม่มียอดบัญชี -</span>
              </dd>
            </div>
          </dl>

          <!--
            ★ ต้องมี .stop - ปุ่มนี้อยู่ในการ์ดที่ทั้งใบกดได้ ถ้าไม่หยุด event การกดปุ่มนี้
              จะไปโดน @click ของการ์ดด้วย แล้วแผนที่จะเลื่อนอยู่ข้างหลัง modal ที่เพิ่งเปิด
              (สองอย่างนี้เป็นคนละคำสั่ง: "ดูตำแหน่ง" กับ "ดูรายละเอียด")
          -->
          <button
            type="button"
            class="btn btn-sm w-full shrink-0 sm:w-auto"
            @click.stop="emit('detail', item)"
          >
            <Icon icon="lucide:file-text" class="size-4" />
            ดูรายละเอียด
          </button>
        </div>
        </div>
      </div>
    </template>
  </div>
</template>
