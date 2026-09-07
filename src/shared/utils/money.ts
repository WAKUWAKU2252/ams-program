// จัดรูปตัวเลขเงิน/จำนวน - คู่กับ utils/date.ts และใช้ '-' แทนค่าว่างเหมือนกัน
//
// ★ null กับ 0 ต้องแสดงต่างกันเสมอ ห้ามยุบเป็นอันเดียว
//   null = "ยังไม่รู้" (SAP ยังไม่มีข้อมูล / ระบบเก็บไม่ได้)
//   0    = "รู้แล้วว่าเป็นศูนย์" เช่นที่ดินที่ไม่คิดค่าเสื่อม ค่าเสื่อมสะสมเป็น 0 จริง ๆ
//   ถ้าเผลอเขียน `value || '-'` เลข 0 จะกลายเป็นขีดทันที แล้วที่ดิน 28 ล้านจะดูเหมือน
//   ข้อมูลหาย ทั้งที่ตัวเลขถูกต้องสมบูรณ์
const NO_VALUE = '-'

/** เงินบาท - คั่นหลักพันและบังคับทศนิยม 2 ตำแหน่งเสมอ (ยอดบัญชีมีเศษสตางค์จริง) */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * อายุการใช้งานที่ SAP เก็บเป็น "เดือน" → อ่านเป็นปี/เดือนแบบที่คนพูดกัน
 *
 * แปลงตอนแสดงผลเท่านั้น ค่าที่เก็บยังเป็นเดือนดิบตามต้นทาง (กติกาของโมดูล sync:
 * ดึงอย่างเดียว ไม่แปลงหน่วยตอนเก็บ)
 *
 * ★ ตัวนี้แปลงหน่วยอย่างเดียว **ไม่ตีความว่า 0 แปลว่าอะไร** - เคยใส่ไว้ว่า 0 = "ไม่คิด
 *   ค่าเสื่อม" แล้วพัง เพราะ 0 มีสองความหมายคนละเรื่องขึ้นกับว่าเป็นช่องไหน:
 *     usefulLifeMonths = 0      → ของชิ้นนี้ไม่คิดค่าเสื่อมเลย (ที่ดิน)
 *     remainingLifeMonths = 0   → คิดค่าเสื่อมจนครบแล้ว (คนละเรื่องกันสิ้นเชิง)
 *   ความหมายเป็นเรื่องของโดเมน ให้ผู้เรียกตัดสิน ที่นี่รู้จักแค่ "กี่เดือน"
 */
export function formatMonths(months: number | null | undefined): string {
  if (months === null || months === undefined || Number.isNaN(months)) return NO_VALUE
  if (months === 0) return '0 เดือน'

  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${rest} เดือน`
  if (rest === 0) return `${years} ปี`
  return `${years} ปี ${rest} เดือน`
}

/**
 * ควรโชว์ตัวเลขเดือนดิบในวงเล็บต่อท้าย formatMonths หรือไม่
 *
 * ต่ำกว่า 12 เดือน formatMonths คืน "N เดือน" ตรง ๆ อยู่แล้ว วงเล็บจะซ้ำคำเดิมทั้งดุ้น
 * ("7 เดือน (7 เดือน)" / "0 เดือน (0 เดือน)") ส่วน null คืน '-' ซึ่งไม่มีตัวเลขให้กำกับ
 * ตั้งแต่แรก เหลือกรณีเดียวที่วงเล็บมีประโยชน์จริงคือตั้งแต่ 12 เดือนขึ้นไป ที่ถูกแปลง
 * เป็นปีจนอ่านไม่ออกแล้วว่า SAP เก็บมากี่เดือน
 */
export function showRawMonths(months: number | null | undefined): boolean {
  if (months === null || months === undefined || Number.isNaN(months)) return false
  return months >= 12
}
