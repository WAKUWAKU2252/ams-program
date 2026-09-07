// สถานะสินทรัพย์ - **SAP เป็นเจ้าของข้อมูลนี้ 100%**
//
// ── มีแค่สองค่า และห้ามเพิ่ม ────────────────────────────────────────────────
//
// ค่านี้มาจาก OITM.validFor ของ SAP ซึ่งพูดได้แค่ "ใช้งานอยู่ / ไม่ใช้แล้ว" เท่านั้น
// ไม่มีทางเดินไหนใน AMS ที่เขียน asset.status ได้เลย - createAssetBody กับ updateAssetBody
// ไม่มีช่องนี้ตั้งแต่ต้น มีแต่ตัว sync ที่เขียน (ดู asset.connector)
//
// ★ เคยมีอีกสามค่าในระบบ ('Under Maintenance' / 'Lost' / 'Disposed') ถอดออกแล้ว
//
// สามค่านั้นเป็นคำศัพท์ของ AMS ที่ SAP ไม่มีทางรู้ ผลคือชิ้นไหนถูกตั้งเป็นค่าพวกนั้น
// จะหลุดจาก SAP ถาวร (sapStatusRule เดิมหยุดทับให้เมื่อค่าปัจจุบันไม่ใช่ Active/Inactive)
// = ข้อมูลสองฝั่งไม่ตรงกันโดยไม่มีอะไรฟ้อง - วัด 2026-09-07 ก่อนถอด: ไม่มีสักแถวที่ใช้
// สามค่านั้นจริง (Active 2,825 / Inactive 721 / อีกสามค่า 0) มันเป็นแค่ตัวเลือกในตัวกรอง
// ที่ค้นแล้วได้ศูนย์เสมอ
//
// **ห้ามเติมกลับ** ถ้าวันหนึ่งธุรกิจต้องการ "ส่งซ่อม/สูญหาย/ตัดจำหน่าย" จริง ต้องเป็น
// คอลัมน์ใหม่แยกจาก status ไม่ใช่มาเบียดแกนที่ SAP เป็นเจ้าของอยู่

export interface AssetStatusOption {
  /** ค่าที่ส่งไป backend - ต้องตรงกับ enum asset_status */
  value: string
  /** คำที่ผู้ใช้เห็น - ตรงกับค่าเสมอ ไม่มีการแปลงชื่ออีกแล้ว */
  label: string
}

export const ASSET_STATUS_OPTIONS: AssetStatusOption[] = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
]

/** ป้ายของค่าที่เลือกอยู่ - ค่าที่ไม่รู้จักคืนตัวมันเองไป ไม่ใช่ค่าว่าง */
export const assetStatusLabel = (value: string): string =>
  ASSET_STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value
