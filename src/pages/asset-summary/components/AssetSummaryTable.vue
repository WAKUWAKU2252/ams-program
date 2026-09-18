<script setup lang="ts">
// ตาราง Asset-สรุป — แถวละชั้นบัญชี
//
// ★ component นี้ "ไม่ถือ state" อะไรเลย ทั้งการเรียง การเลือกแถว และการแบ่งหน้าเป็นของ
//   หน้าแม่ทั้งหมด ที่นี่รับค่ามาวาดแล้ว emit กลับไปอย่างเดียว — จงใจ เพราะตัวกรอง/การ
//   เรียงใช้ร่วมกับชีต DEP และแถบแบ่งหน้าอยู่นอกตาราง ถ้าแยก state ลงมาจะมีสองแหล่งทันที
import { Icon } from '@iconify/vue'
import {
  ariaSort,
  cellText,
  labelOf,
  sortIcon,
  type AssetColumn,
  type SortDirection,
} from '../asset-summary.helpers'
import type { AssetSummaryRow } from '@/shared/services/dashboard.service'

defineProps<{
  /** แถวของ "หน้าที่เปิดอยู่" เท่านั้น ไม่ใช่ทั้งชุด */
  rows: AssetSummaryRow[]
  /** จำนวนแถวทั้งชุดหลังกรอง — ใช้ตัดสินว่าจะโชว์แถวว่าง/แถวรวม ไม่ใช่ rows.length */
  totalRows: number
  columns: readonly AssetColumn[]
  /** แถวรวมท้ายตาราง — หน้าแม่คำนวณจากทั้งชุด ไม่ใช่จากหน้าที่เปิดอยู่ */
  totals: Record<string, unknown>
  sortValue: string
  sortDir: SortDirection
  /** คีย์ของแถวที่ติ๊กไว้ (assetClass) — Set เพราะเช็ค has() ทุกแถวตอนวาด */
  selectedRows: Set<string>
}>()

defineEmits<{
  'toggle-sort': [key: string]
  'toggle-row': [key: string]
  'open-pieces': [row: AssetSummaryRow]
}>()

/** ★ ต้องตรงกับ rowKey ของหน้าแม่เป๊ะ — คีย์เดียวกันถูกใช้ทั้งเช็ค selected และ v-for */
const rowKey = (row: AssetSummaryRow) => row.assetClass ?? 'none'
</script>

<template>
  <div class="overflow-x-auto">
    <table class="table table-sm table-pin-rows table-freeze-first table-freeze-always"
      aria-labelledby="ams-report-title">
      <thead>
        <tr>
          <th scope="col" class="freeze-col">Balance Account</th>
          <th v-for="col in columns" :key="col.key" scope="col"
            :class="[col.align, sortValue === col.key ? 'bg-primary/10' : '']" :aria-sort="ariaSort(col.key, sortValue, sortDir)">
            <button type="button" class="group flex w-full items-center gap-1" :class="col.justify"
              @click="$emit('toggle-sort', col.key)">
              {{ col.label }}
              <Icon :icon="sortIcon(col.key, sortValue, sortDir)" class="size-3.5 shrink-0"
                :class="sortValue === col.key ? 'text-primary' : 'opacity-0 group-hover:opacity-40'" />
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- ★ สีแถวที่เลือกทาผ่านคลาส row-selected ใน main.css ไม่ใช่ utility ตรงนี้ —
             ตารางนี้เปิด table-freeze-always ซึ่งประกาศ background ที่ tbody tr ไว้แล้ว
             ด้วย specificity ที่สูงกว่า utility ตัวเดียว (ดูคำเตือนในก้อนนั้นของ main.css) -->
        <tr v-for="row in rows" :key="rowKey(row)"
          :class="selectedRows.has(rowKey(row)) ? 'row-selected' : 'hover:bg-base-200'">
          <!-- ★★ ไม่ตัดบรรทัดเลย — ให้ชื่อบัญชีดันความกว้างของคอลัมน์ออกไป
               แล้วคอลัมน์ตัวเลขถูกดันตามไปทางขวา (ตารางมี overflow-x-auto อยู่แล้ว)
               เคยให้มันตัดบรรทัด แต่ชื่อบัญชีเป็นสตริงที่ขีดคั่นเป็นท่อน ๆ
               ('เครื่องจักร และอุปกรณ์-สำนักงาน-ตลาดต่างประเทศจีน') พอตัดกลางท่อนแล้ว
               อ่านไม่ออกว่าท่อนไหนต่อท่อนไหน — เลื่อนตารางแนวนอนอ่านง่ายกว่า -->
          <td class="freeze-col">
            
            <div class="flex items-center gap-2 whitespace-nowrap">
              <!-- aria-label ต้องบอกว่าเลือก "แถวไหน" — checkbox 15 ตัวที่อ่านว่า
                   "เลือกแถว" เหมือนกันหมดคือสิ่งที่ screen reader ใช้ไม่ได้จริง -->
              <input type="checkbox" class="checkbox checkbox-sm"
                :checked="selectedRows.has(rowKey(row))"
                :aria-label="`เลือก ${labelOf(row).code ?? 'แถวที่ไม่ระบุชั้นบัญชี'}`"
                @change="$emit('toggle-row', rowKey(row))" >
              <button type="button" class="btn btn-ghost btn-xs btn-square"
                :aria-label="`ดูรายชิ้นใน ${labelOf(row).code ?? 'ชั้นบัญชีที่ยังไม่ระบุ'}`"
                @click="$emit('open-pieces', row)">
                <!-- ★ ต้องเป็นไอคอนชุด lucide เท่านั้น ห้ามหยิบชุดอื่นมาใช้ตัวเดียว
                     โปรเจกต์นี้ไม่ได้ลง @iconify-json/* และไม่มี addCollection ที่ไหนเลย
                     @iconify/vue จึงดึงไอคอนจาก api.iconify.design ตอนรันไทม์ โดยรวม
                     เป็นคำขอเดียวต่อ "ชุด" — ไอคอนชุดใหม่หนึ่งตัวจึงเท่ากับคำขอออกเน็ต
                     นอกเพิ่มอีกหนึ่งรอบเต็ม ๆ (วัดจริง 2026-09-17: icon-park-outline
                     ใช้ 193 ms เพื่อไอคอนตัวเดียว) ส่วนการเพิ่มชื่อ lucide ตัวใหม่ไม่เสีย
                     อะไรเลย เพราะไปต่อท้าย batch ของชุดที่หน้านี้ขอมาอยู่แล้ว -->
                <Icon icon="lucide:list" class="size-4" />
              </button>
              <span v-if="labelOf(row).code" class="shrink-0 text-base-content/55 tabular-nums">
                {{ labelOf(row).code }}
              </span>
              <span v-if="labelOf(row).name"
                :class="labelOf(row).unassigned ? 'text-base-content/50 italic' : ''">
                {{ labelOf(row).name }}
              </span>
            </div>
          </td>
          <td v-for="col in columns" :key="col.key" class="tabular-nums"
            :class="[col.align, col.strong ? 'font-medium' : '', sortValue === col.key ? 'bg-primary/5' : '']">
            {{ cellText(row, col) }}
          </td>
        </tr>

        <tr v-if="!totalRows">
          <td :colspan="columns.length + 1" class="py-10 text-center text-base-content/70">
            ยังไม่มีข้อมูลในขอบเขตนี้
          </td>
        </tr>
      </tbody>
      <tfoot v-if="totalRows">
        <tr class="border-t-2 border-base-300 bg-base-200">
          <th class="freeze-col bg-base-200 text-sm">
            Total
            <span class="ml-1 text-xs font-normal text-base-content/60">
              {{ totalRows }} accounts
            </span>
          </th>
          <td v-for="col in columns" :key="col.key" class="tabular-nums"
            :class="[col.align, col.strong ? 'font-semibold' : 'text-base-content/70']">
            {{ cellText(totals, col) }}
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- ซ่อนตัวเองเมื่อมีหน้าเดียว (AppPagination จัดการให้แล้ว) -->
  </div>
</template>
