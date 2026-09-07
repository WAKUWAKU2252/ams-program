// ตัวเลือก "เรียงตาม" ของตารางทะเบียน - ใช้ร่วมกันระหว่างหน้า Asset Inventory กับ
// ตารางบน Dashboard เพื่อไม่ให้สองหน้าเรียงได้คนละชุดโดยไม่มีอะไรฟ้อง
//
// ★ value ต้องตรงกับ union ของ assetInventoryQuery.sort ฝั่ง backend เป๊ะ
//   ค่านอกลิสต์จะโดน 422 ตั้งแต่ประตู ไม่ได้เงียบ ๆ
//
// ★ คำอธิบายทิศทางแยกรายตัวเลือก - แกนที่เป็นวันที่ต้องใช้ "ใหม่/เก่า" ส่วนตัวเลข
//   ใช้ "มาก/น้อย" ถ้าใช้คำกลาง ๆ ชุดเดียวจะได้ "มูลค่ามากไปน้อย" คู่กับ
//   "วันที่ลงทะเบียนมากไปน้อย" ซึ่งอันหลังไม่มีใครพูด
import type { SortOption } from '@/shared/components/AppSortMenu.vue'

export const ASSET_SORT_OPTIONS: SortOption[] = [
  {
    value: 'registered',
    label: 'วันที่ลงทะเบียน',
    icon: 'lucide:calendar-check',
    descLabel: 'ใหม่ → เก่า',
    ascLabel: 'เก่า → ใหม่',
  },
  {
    value: 'netBookValue',
    label: 'มูลค่าคงเหลือ',
    icon: 'lucide:coins',
    descLabel: 'มาก → น้อย',
    ascLabel: 'น้อย → มาก',
  },
  {
    value: 'fiscalYear',
    label: 'ปีบัญชี',
    icon: 'lucide:calendar',
    descLabel: 'ใหม่ → เก่า',
    ascLabel: 'เก่า → ใหม่',
  },
  {
    value: 'remainingLife',
    label: 'อายุคงเหลือ',
    icon: 'lucide:hourglass',
    // "มาก → น้อย" ไม่ใช่ "ใหม่ → เก่า" - นี่คือระยะเวลาที่เหลือ ไม่ใช่วันที่
    descLabel: 'มาก → น้อย',
    ascLabel: 'น้อย → มาก',
  },
]
