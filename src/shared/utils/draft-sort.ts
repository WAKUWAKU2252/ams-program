// ตัวเลือก "เรียงตาม" ของลิสต์คำขอฝั่งผู้ขอ (หน้า Create New Asset)
//
// ★ value ต้องตรงกับ union ของ listQuery.sort ฝั่ง backend เป๊ะ ค่านอกลิสต์โดน 422
//   ตั้งแต่ประตู ไม่ได้เงียบ ๆ
//
// ★ ไม่มี "ใบที่เพิ่งเปิด" ในลิสต์โดยตั้งใจ — นั่นคือ **ค่าตั้งต้น** ของหน้านี้
//   (assetRequestOpener.lastOpenedAt = "ของฉัน เรียงตามที่ฉันเพิ่งแตะ") กดปุ่ม
//   "ค่าตั้งต้น" ในเมนูกลับมาได้อยู่แล้ว ใส่เป็นตัวเลือกจะกลายเป็นสองปุ่มที่ให้ผลเหมือนกัน
import type { SortOption } from '@/shared/components/AppSortMenu.vue'

export const DRAFT_SORT_OPTIONS: SortOption[] = [
  {
    value: 'requestNo',
    label: 'เลขที่คำขอ',
    icon: 'lucide:hash',
    // เรียงตาม id ไม่ใช่ข้อความ - "มาก → น้อย" จึงตรงกับที่ตาเห็น (#120 ก่อน #99)
    descLabel: 'มาก → น้อย',
    ascLabel: 'น้อย → มาก',
  },
  {
    value: 'updatedAt',
    label: 'วันที่แก้ล่าสุด',
    icon: 'lucide:clock',
    descLabel: 'ใหม่ → เก่า',
    ascLabel: 'เก่า → ใหม่',
  },
  {
    value: 'poDate',
    label: 'วันที่เปิดใบสั่งซื้อ',
    icon: 'lucide:calendar',
    descLabel: 'ใหม่ → เก่า',
    ascLabel: 'เก่า → ใหม่',
  },
]
