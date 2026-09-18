// ═══════════════════════════════════════════════════════════════════════════
// ของที่ "ตารางทั้งสองชีต + หน้าแม่" ใช้ร่วมกัน — นิยามคอลัมน์ และฟังก์ชันล้วน ๆ
//
// ★ แยกออกมาเป็น .ts ไม่ใช่ปล่อยไว้ในหน้า เพราะตั้งแต่แตกตารางออกเป็น component แล้ว
//   ของพวกนี้มีผู้ใช้สามที่ (หน้าแม่ใช้ทำแผงเลือกคอลัมน์ · ตารางสองใบใช้วาดหัวกับเซลล์)
//   ถ้าปล่อยให้แต่ละที่ประกาศเอง คีย์กับ label จะ drift กันโดยไม่มีอะไรฟ้อง
//
// ★ ในไฟล์นี้ห้ามมี ref/computed — มันเป็นข้อมูลกับฟังก์ชันบริสุทธิ์เท่านั้น สถานะการเรียง
//   เป็นของหน้าแม่ (sorts) แล้วส่งค่าลงมาเป็นพารามิเตอร์ ตารางจึงไม่ต้องรู้ว่าใครถือ state
// ═══════════════════════════════════════════════════════════════════════════
import { formatMoney } from '@/shared/utils/money'

export type Sheet = 'asset' | 'dep'
export type SortDirection = 'asc' | 'desc'

/**
 * ── คอลัมน์ที่เรียงได้ — นิยามที่เดียว แล้ว thead วนสร้างจากลิสต์นี้
 *
 * ★ ทำให้ "หัวคอลัมน์" กับ "คีย์ที่ใช้เรียง" มาจากแหล่งเดียวกันโดยโครงสร้าง — เขียนแยก
 *   ทีละ <th> แล้วพิมพ์คีย์ผิดตัวเดียว คอลัมน์นั้นจะกดแล้วไปเรียงข้อมูลของอีกคอลัมน์
 *   โดยไม่มีอะไรฟ้อง (ทุกช่องเป็นเงินเหมือนกันหมด)
 * ★ ไม่มี assetClass ในลิสต์ — คอลัมน์แรกเป็นคีย์ของแถว และเป็นลำดับตั้งต้นของตารางอยู่แล้ว
 *
 * ★ ลำดับคอลัมน์ = ลำดับในชีตของ finance เพื่อวางเทียบกันทีละช่องได้
 * ★ `on` = ติ๊กไว้ตั้งแต่แรก — ชุดที่ติ๊กไว้คือคอลัมน์ที่ชีตนั้นมีจริง ส่วนที่เหลือเป็นของแถม
 *   ของ AMS (Assets / Retired Depr. / Accum. Depr.) ให้เปิดเองเมื่อต้องการ
 * ★ `strong` = ตัวหนาในแถว Total — ยอดปลายงวดที่คนเอาไปกระทบยอด
 */
export const ASSET_COLUMNS = [
  { key: 'assets', label: 'Assets', money: false, align: 'text-center', justify: 'justify-center', on: false, strong: false },
  { key: 'openingCost', label: 'APC on Start Date', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'openingDepreciation', label: 'Accum. Depr. on Start Date', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'openingNetBookValue', label: 'มูลค่ายกมาต้นงวด', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'capitalization', label: 'Capitalization', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'retiredCost', label: 'Retired APC', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'retiredNetBookValue', label: 'Retired NBV', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'retiredDepreciation', label: 'Retired Depr.', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'transferredCost', label: 'Transferred APC', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'transferredNetBookValue', label: 'Transferred NBV', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'writeUp', label: 'Write-Up', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'depreciationInPeriod', label: 'ค่าเสื่อมในงวด', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: false },
  { key: 'bookedCost', label: 'ราคาทุน', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: true },
  { key: 'netBookValue', label: 'มูลค่าคงเหลือ', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: true },
  { key: 'accumulatedDepreciation', label: 'ค่าเสื่อมสะสม', money: true, align: 'text-right', justify: 'justify-end', on: true, strong: true },
] as const

export type AssetColumn = (typeof ASSET_COLUMNS)[number]

export const DEP_COLUMNS = [
  { key: 'assets', label: 'Assets', align: 'text-center', justify: 'justify-center' },
  {
    key: 'ordinaryDepreciation',
    label: 'Ordinary Depreciation',
    align: 'text-right',
    justify: 'justify-end',
  },
  { key: 'journalEntry', label: 'Journal Entry', align: 'text-left', justify: 'justify-start' },
] as const

/**
 * ค่าของช่องหนึ่งในแถว — แปลงตามชนิดที่คอลัมน์ประกาศไว้ ไม่ใช่เดาจากค่า
 *
 * ★ รับเป็น object ไม่ใช่ Record<string, unknown> — ผู้เรียกส่งมาสองแบบ: แถวจริง
 *   (AssetSummaryRow ซึ่งเป็น interface จึงไม่มี index signature) กับแถวรวมที่ประกอบเอง
 *   ถ้าประกาศเป็น Record<> ตัวแรกจะไม่ผ่าน TS ทั้งที่รูปร่างใช้ได้จริง
 */
export function cellText(row: object, col: { key: string; money: boolean }): string {
  const value = (row as Record<string, unknown>)[col.key]
  if (col.money) return formatMoney(typeof value === 'number' ? value : null)
  return typeof value === 'number' ? value.toLocaleString('th-TH') : '-'
}

/** ป้ายชื่อแถว - รหัสกับชื่ออยู่คนละช่อง ห้ามต่อสตริงติดกัน (ดูตารางสรุปของ Dashboard) */
export const labelOf = (row: { assetClass: string | null; accountName: string | null }) => ({
  code: row.assetClass,
  name: row.accountName ?? (row.assetClass ? null : 'ยังไม่ระบุชั้นบัญชี'),
  unassigned: !row.assetClass,
})

/**
 * ไอคอนหัวคอลัมน์ตามสถานะการเรียง
 *
 * ★ รับ sortValue/sortDir เข้ามาเป็นพารามิเตอร์ ไม่ได้อ่านจาก ref ข้างนอก — ฟังก์ชันในไฟล์นี้
 *   ถูกเรียกจากสอง component ที่ถือ state คนละชุด (ชีต asset กับ dep เรียงแยกกัน)
 */
export const sortIcon = (key: string, sortValue: string, sortDir: SortDirection) =>
  sortValue !== key
    ? 'lucide:chevrons-up-down'
    : sortDir === 'asc'
      ? 'lucide:arrow-up'
      : 'lucide:arrow-down'

/** aria-sort ให้ screen reader รู้ว่าคอลัมน์ไหนกำลังเรียงอยู่และทางไหน */
export const ariaSort = (
  key: string,
  sortValue: string,
  sortDir: SortDirection,
): 'none' | 'ascending' | 'descending' =>
  sortValue !== key ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'
