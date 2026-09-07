// ไอคอนประจำหมวดสินทรัพย์ - ใช้ที่ไหนก็ได้ที่ต้องโชว์หมวดในที่แคบ ๆ
//
// จับคู่ด้วย "ชื่อหมวด" ไม่ใช่ id: id เป็น serial ที่ต่างกันระหว่างเครื่อง dev กับ prod
// (เหตุผลเดียวกับที่ asset_location.code / asset_sub_location.code มีอยู่) ผูกกับ id เมื่อไหร่
// ไอคอนจะสลับหมวดกันเองบนเครื่องที่ import คนละรอบโดยไม่มีอะไรฟ้อง

/** ไอคอนตอนไม่รู้หมวด - ของที่ sync มาจาก SAP ส่วนใหญ่ยังไม่มี categoryId (เติมทีหลังโดย job) */
export const FALLBACK_CATEGORY_ICON = 'lucide:package';

const ICONS: Record<string, string> = {
  ที่ดิน: 'lucide:land-plot',
  ส่วนปรับปรุงที่ดิน: 'lucide:fence',
  อาคารและสิ่งปลูกสร้าง: 'lucide:building-2',
  ส่วนปรับปรุงอาคาร: 'lucide:hammer',
  เครื่องจักรและอุปกรณ์: 'lucide:cog',
  เครื่องใช้สำนักงาน: 'lucide:monitor',
  ยานพาหนะ: 'lucide:car',
};

/**
 * ไอคอนของหมวดหนึ่ง
 *
 * ★ ตัดหางแบบ " (2)" ทิ้งก่อนเทียบ - master data มีหมวดซ้ำอยู่จริงสองคู่
 *   (ที่ดิน / ที่ดิน (2) และ ส่วนปรับปรุงที่ดิน / ส่วนปรับปรุงที่ดิน (2)) ซึ่งหมายถึงของอย่างเดียวกัน
 *   แค่ยกมาจาก SAP คนละแถว จึงต้องได้ไอคอนเดียวกัน ไม่ใช่แยกกันคนละอัน
 */
export function categoryIcon(name: string | null | undefined): string {
  if (!name) return FALLBACK_CATEGORY_ICON;
  const key = name.replace(/\s*\(\d+\)\s*$/, '').trim();
  return ICONS[key] ?? FALLBACK_CATEGORY_ICON;
}
