// สถานที่ทางบัญชีกับบริษัท (0037) - ฟังก์ชันล้วน ไม่ยิง API
//
// แยกจาก master.service โดยตั้งใจ: เทสต์ของหน้าต่าง ๆ mock master.service ทั้งโมดูลด้วยของ
// ไม่กี่ตัวที่หน้านั้นเรียก ถ้าฟังก์ชันพวกนี้อยู่ในนั้นจะกลายเป็น undefined ในเทสต์ทันที
import type { LocationOption } from '@/shared/services/master.service'

/**
 * ชื่อสถานที่สำหรับลิสต์ที่มีหลายบริษัทปนกัน - แปะรหัสบริษัทเฉพาะชื่อที่ซ้ำ
 *
 * ชื่อซ้ำกันข้ามบริษัทได้ (วัด 2026-09-25: UBA/UBP ซ้ำกัน 14 ชื่อ เช่น QA/QC/ผลิต)
 * ชื่อที่ไม่ซ้ำไม่ต้องแปะ ลิสต์จะได้ไม่รกไปด้วยรหัสบริษัททุกแถว
 */
export function locationLabel(loc: LocationOption, all: readonly LocationOption[]): string {
  const dup = loc.companyCode && all.some((o) => o.id !== loc.id && o.name === loc.name)
  return dup ? `${loc.name} (${loc.companyCode})` : loc.name
}

/**
 * สถานที่ที่ใช้กับบริษัทนี้ได้ = ของบริษัทนั้น + แถวใช้ร่วม (companyCode null) - ไม่ระบุบริษัท = ทั้งหมด
 *
 * กติกาเดียวกับที่ backend กรอง (findLocations) - ใช้ในหน้าที่โหลดทั้งเครือมาครั้งเดียว
 * แล้วเปลี่ยนบริษัทไปมาโดยไม่ยิง API ใหม่
 */
export function locationsForCompany(
  all: readonly LocationOption[],
  companyCode: string | null | undefined,
): LocationOption[] {
  // == null ไม่ใช่ === null: แถวที่ไม่มีช่องนี้เลย (ของที่ประกอบเองในเทสต์/ข้อมูลเก่าในแคช)
  // ต้องนับเป็นใช้ร่วม ไม่ใช่หายไปจากทุกบริษัท
  return companyCode
    ? all.filter((l) => l.companyCode == null || l.companyCode === companyCode)
    : [...all]
}
