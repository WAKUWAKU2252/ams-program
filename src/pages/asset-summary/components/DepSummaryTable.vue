<script setup lang="ts">
// ตาราง DEP-สรุป — แถวละชั้นบัญชีของ "งวดเดียว" (ไม่ใช่ช่วงงวด)
//
// ★ ไม่ถือ state เหมือน AssetSummaryTable — เหตุผลเดียวกัน (ดูคอมเมนต์ที่นั่น)
// ★ งวดที่กำลังดูอยู่ไม่ได้อยู่ในตาราง แต่อยู่บนป้ายเหนือตารางซึ่งเป็นของหน้าแม่
import { Icon } from '@iconify/vue'
import { formatMoney } from '@/shared/utils/money'
import { ariaSort, DEP_COLUMNS, labelOf, sortIcon, type SortDirection } from '../asset-summary.helpers'
import type { DepSummaryRow } from '@/shared/services/dashboard.service'

/**
 * ★ คีย์การเลือกใช้ assetClass อย่างเดียว ไม่รวม period — ต้องตรงกับ rowKey ของหน้าแม่
 *   และของตาราง Asset-สรุป เพราะ **ทั้งสองชีตใช้ Set เดียวกัน**: ติ๊กบัญชีไว้ที่ชีตหนึ่ง
 *   แล้วสลับไปอีกชีต บัญชีเดิมยังถูกไฮไลต์อยู่ ซึ่งเป็นสิ่งที่คนกระทบยอดต้องการพอดี
 *
 * ★ ส่วน :key ของ v-for ยังต้องมี period ต่อท้าย — ชีตนี้ grain เป็นบัญชี × งวด
 */
const rowKey = (row: DepSummaryRow) => row.assetClass ?? 'none'

defineProps<{
  /** แถวของหน้าที่เปิดอยู่เท่านั้น */
  rows: DepSummaryRow[]
  /** จำนวนแถวทั้งชุดหลังกรอง */
  totalRows: number
  /** จำนวนชิ้นรวมทั้งชุด — บวกจากทั้งชุดที่หน้าแม่ ไม่ใช่จากหน้าที่เปิดอยู่ */
  totalAssets: number
  /** ค่าเสื่อมรวมทั้งชุด */
  total: number | null
  sortValue: string
  sortDir: SortDirection
  /** Set เดียวกับที่ชีต Asset-สรุป ใช้ — ดูเหตุผลที่ rowKey */
  selectedRows: Set<string>
}>()

defineEmits<{
  'toggle-sort': [key: string]
  'toggle-row': [key: string]
  'open-pieces': [row: DepSummaryRow]
}>()
</script>

<template>
  <div class="overflow-x-auto">
    <table class="table table-sm table-pin-rows table-freeze-first table-freeze-always"
      aria-labelledby="ams-report-title">
      <thead>
        <tr>
          <th scope="col" class="freeze-col">Balance Account</th>
          <th v-for="col in DEP_COLUMNS" :key="col.key" scope="col"
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
        <!-- แถวละบัญชี ไม่ใช่บัญชี × งวด — งวดที่กำลังดูอยู่บนป้ายหัวตาราง -->
        <!-- ★ สีแถวที่เลือกทาผ่านคลาส row-selected ใน main.css ไม่ใช่ utility ตรงนี้ —
             ตารางนี้เปิด table-freeze-always ซึ่งประกาศ background ที่ tbody tr ไว้แล้ว
             ด้วย specificity ที่สูงกว่า utility ตัวเดียว (ดูคำเตือนในก้อนนั้นของ main.css) -->
        <tr v-for="row in rows" :key="`${row.assetClass ?? 'none'}-${row.period}`"
          :class="selectedRows.has(rowKey(row)) ? 'row-selected' : 'hover:bg-base-200'">
          <!-- ไม่ตัดบรรทัดเหมือนตาราง Asset-สรุป — เหตุผลเดียวกัน -->
          <td class="freeze-col">
            <div class="flex items-center gap-2 whitespace-nowrap">
              <!-- aria-label ต้องบอกว่าเลือก "แถวไหน" — checkbox หลายตัวที่อ่านว่า
                   "เลือกแถว" เหมือนกันหมดคือสิ่งที่ screen reader ใช้ไม่ได้จริง -->
              <input type="checkbox" class="checkbox checkbox-sm"
                :checked="selectedRows.has(rowKey(row))"
                :aria-label="`เลือก ${labelOf(row).code ?? 'แถวที่ไม่ระบุชั้นบัญชี'}`"
                @change="$emit('toggle-row', rowKey(row))" >
              <!-- ★ เปิดโมดัลตัวเดียวกับชีต Asset-สรุป — มันแสดง "รายชิ้นของบัญชีนี้"
                   ซึ่งไม่ได้ผูกกับชีตไหน คนที่กำลังดูค่าเสื่อมของบัญชีหนึ่งแล้วอยากรู้ว่า
                   มาจากชิ้นไหนบ้าง ไม่ควรต้องสลับกลับไปอีกชีตก่อน -->
              <button type="button" class="btn btn-ghost btn-xs btn-square"
                :aria-label="`ดูรายชิ้นใน ${labelOf(row).code ?? 'ชั้นบัญชีที่ยังไม่ระบุ'}`"
                @click="$emit('open-pieces', row)">
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
          <td class="text-center tabular-nums">{{ row.assets.toLocaleString('th-TH') }}</td>
          <td class="text-right font-medium tabular-nums">
            {{ formatMoney(row.ordinaryDepreciation) }}
          </td>
          <td class="tabular-nums">
            {{ row.journalEntry ?? '-' }}
            <span v-if="row.journalEntryCount > 1" class="badge badge-warning badge-xs">
              +{{ row.journalEntryCount - 1 }}
            </span>
          </td>
        </tr>

        <tr v-if="!totalRows">
          <td colspan="4" class="py-10 text-center text-base-content/70">
            ยังไม่มีค่าเสื่อมที่ลงบัญชีในงวดนี้
          </td>
        </tr>
      </tbody>
      <tfoot v-if="totalRows">
        <!-- โครงเดียวกับ Total ของ Asset-สรุป — ตารางสองตัวบนหน้าเดียวกัน
             ถ้าแถวรวมหน้าตาคนละแบบจะอ่านเป็นของคนละระบบ -->
        <!-- ★ พื้นหลังต้อง **ทึบ** ห้ามใช้สีโปร่ง (/60) — คอลัมน์แรกของแถวนี้ถูกตรึงไว้
             ด้วย position: sticky แล้ว CSS ให้มันรับสีจาก <tr> มา (background: inherit)
             สีโปร่งเมื่อไหร่ ตัวเลขที่เลื่อนอยู่ข้างใต้จะทะลุขึ้นมาซ้อนคำว่า Total ทันที -->
        <tr class="border-t-2 border-base-300 bg-base-200">
          <th class="freeze-col bg-base-200 text-sm">
            Total
            <span class="ml-1 text-xs font-normal text-base-content/60">
              {{ totalRows }} accounts
            </span>
          </th>
          <td class="text-center font-semibold tabular-nums">
            {{ totalAssets.toLocaleString('th-TH') }}
          </td>
          <td class="text-right text-base font-bold tabular-nums">
            {{ formatMoney(total) }}
          </td>
          <td></td>
        </tr>
      </tfoot>
    </table>


  </div>
</template>
