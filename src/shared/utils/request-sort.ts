// ตัวเลือก "เรียงตาม" ของคิวออกเลข (หน้า Asset Request)
//
// ★ value ต้องตรงกับ union ของ pendingRegistrationQuerySchema.sort ฝั่ง backend เป๊ะ
//   ค่านอกลิสต์โดน 422 ตั้งแต่ประตู ไม่ได้เงียบ ๆ
//
// ★ ไม่มี "วันอนุมัติ" ในลิสต์โดยตั้งใจ — นั่นคือ **ค่าตั้งต้น** ของคิว (เก่าสุดอยู่บน =
//   ใบที่รอนานที่สุดได้ทำก่อน) ซึ่งกดคืนได้จากปุ่ม "ค่าตั้งต้น" ในเมนูอยู่แล้ว
//   ใส่เข้ามาเป็นตัวเลือกจะกลายเป็นสองทางที่ให้ผลเหมือนกันแต่ปุ่มคนละปุ่ม
import type { SortOption } from '@/shared/components/AppSortMenu.vue'

export const REQUEST_SORT_OPTIONS: SortOption[] = [
  {
    value: 'requestDate',
    label: 'วันที่ส่งคำขอ',
    icon: 'lucide:calendar-clock',
    descLabel: 'ใหม่ → เก่า',
    ascLabel: 'เก่า → ใหม่',
  },
  {
    value: 'requestNo',
    label: 'เลขที่คำขอ',
    icon: 'lucide:hash',
    // เลขใบเรียงตาม id ไม่ใช่ข้อความ — "มาก → น้อย" จึงตรงกับที่ตาเห็น (#120 ก่อน #99)
    descLabel: 'มาก → น้อย',
    ascLabel: 'น้อย → มาก',
  },
]
