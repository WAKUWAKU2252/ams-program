const NO_VALUE = '-'

/**
 * แปลง timestamp จาก backend เป็น epoch ms - **ห้ามใช้ new Date(value) ตรง ๆ กับค่าพวกนี้**
 *
 * ── กติกาที่ backend ใช้เก็บเวลา ─────────────────────────────────────────────
 *
 * `nowIso()` ฝั่ง backend ประกอบสตริงจากนาฬิกา local แล้วแปะ 'Z' ต่อท้าย ไม่ใช่ UTC จริง
 * (เวลาไทย 18:00 ถูกเก็บเป็น "...T18:00:00.000Z" ทั้งที่ UTC จริงคือ 11:00) กติกานี้จงใจ
 * เพราะต้องเทียบกับ UpdateDate ของ SAP ที่เก็บแบบเดียวกัน - แก้ที่ backend ไม่ได้
 *
 * ผลคือ `new Date(value)` จะได้เวลาที่ **ล้ำหน้าไป 7 ชั่วโมง** บนเครื่องโซนไทย
 * (อาการที่เจอจริง: ตัวนับถอยหลังของปุ่ม sync ขึ้น 25,200 วินาที = 7 ชม. พอดี)
 *
 * ตัวนี้ตัด 'Z' ทิ้งก่อน - รูปแบบ ISO ที่ไม่มี offset ถูก parse เป็นเวลา local ตามสเปก
 * ซึ่งตรงกับความหมายจริงของค่าที่เก็บไว้
 *
 * ★ formatDateTime ข้างล่างใช้ตัวนี้แล้ว - ห้ามเปลี่ยนกลับไปเป็น new Date(value) ตรง ๆ
 *
 * ★ formatDate **ไม่ต้องใช้** และไม่ควรใช้ให้เปลือง: ทุกค่าที่ส่งเข้าไปมาจากคอลัมน์ชนิด
 *   date() ของ postgres ซึ่งเป็น 'YYYY-MM-DD' ไม่มีส่วนเวลาและไม่มี Z ให้ตัดตั้งแต่ต้น
 *   (poDate / grpoDate / sapCreatedDate / depreciationStart-End - ตรวจแล้วทั้งหมด)
 */
export function parseServerTime(value: string | null | undefined): number | null {
  if (!value) return null
  // ตัด Z หรือ offset ท้ายสุดออก แล้วให้ JS อ่านเป็นเวลา local
  const local = value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '')
  const ms = new Date(local).getTime()
  return Number.isNaN(ms) ? null : ms
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return NO_VALUE
  const d = new Date(value)
  if (isNaN(d.getTime())) return NO_VALUE
  return d.toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

/**
 * วันที่ + เวลา - ต้องผ่าน parseServerTime เสมอ
 *
 * ★ ห้ามใช้ new Date(value) ตรง ๆ: backend เก็บเวลาแบบ "wall clock แปะ Z" ซึ่งไม่ใช่ UTC
 *   จริง (ดู parseServerTime ข้างบน) ผลคือเวลาบนจอเร็วไป 7 ชั่วโมงทุกที่ - เวลาส่งใบคำขอ
 *   เวลาอนุมัติ เวลาแก้ร่างล่าสุด เวลา sync ยอดบัญชี ผิดหมดโดยไม่มีอะไรฟ้อง
 */
export function formatDateTime(value: string | null | undefined): string {
  const ms = parseServerTime(value)
  if (ms === null) return NO_VALUE
  return new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}
