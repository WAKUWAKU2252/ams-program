// ═══════════════════════════════════════════════════════════════════════════
// ป้ายสถานะของ "ใบคำขอ" - นิยามที่เดียวของทั้งระบบ
//
// ค่าดิบมาจาก enum request_status ฝั่ง DB ซึ่งมี 4 ค่าเท่านั้น:
//   DRAFT · PENDING_APPROVAL · APPROVED · REJECTED
// (REGISTERED ถูกถอดออกตั้งแต่ 0014 - ใบจบหน้าที่ที่ APPROVED ส่วน REGISTERED/CANCELLED
//  ย้ายไปเป็นเรื่องของ "ชิ้น" แล้ว ดู asset.lifecycle)
//
// ★ ห้ามโชว์ค่าดิบบนจอ: ผู้ใช้เห็น "APPROVED" ปนกับ "Draft" ในตารางเดียวกันแล้วอ่านเหมือน
//   คนละระบบ - และ ALL CAPS ที่หลุดมาคือสัญญาณว่ามีสถานะที่ map ไม่ครบ ซึ่งจะเงียบไปเรื่อย ๆ
//   ถ้าปล่อยให้ fallback เป็นค่าดิบสวย ๆ
// ═══════════════════════════════════════════════════════════════════════════

export interface RequestStatusMeta {
  label: string
  /** class ของ daisyUI badge - สีตาม semantic ของธีม ไม่ fix สี */
  class: string
}

// ★★ ห้ามใช้ `badge-neutral badge-soft` (และห้ามเอาคู่นี้ไปใช้ที่อื่นด้วย)
//
//   `badge-soft` เอา "สีของ badge" ไปเป็น **สีตัวอักษร** (color: var(--badge-color))
//   บนพื้นที่เป็นสีเดียวกันผสม base-100 แค่ 8% - ใช้ได้กับสีจัดจ้าน (warning/success/error)
//   แต่พังกับ `neutral` เพราะทุกธีมนิยาม neutral เป็น "สีพื้นผิวเข้ม" ไม่ใช่สีหมึก
//   วัดค่าจริงจาก CSS ที่ build ออกมา (daisyUI 5.7.16):
//
//     ธีม        neutral       base-100      ผล
//     coffee     L 16.5%       L 24.0%       ตัวอักษร **มืดกว่าพื้น** อ่านไม่ออกเลย
//     dim        #1c212b       #2a303c       เกือบกลืนพื้น
//     halloween  L 24.4%       L 21.0%       ต่างกัน 3% แทบมองไม่เห็น
//     night      L 27.9%       L 20.8%       ต่างกัน 7% อ่านยากมาก
//     forest     L 30.7%       L 20.8%       เกือบกลืนพื้น
//     ams        L 35.0%       L 100%        อ่านได้ - ธีมสว่างเลยไม่มีใครเจอตอนพัฒนา
//
//   ★ ใช้ `badge-ghost` แทน - daisyUI นิยามเป็น base-200 + **base-content** ซึ่งเป็นคู่ที่
//     ทุกธีมการันตีว่าอ่านออกบนพื้นของตัวเอง จึงปลอดภัยข้ามธีมโดยโครงสร้าง
//     ไม่ต้องไล่วัดใหม่ทุกครั้งที่เพิ่มธีม
//
//   ★ กติกาทั่วไป: สีป้าย/ปุ่มต้องเป็นคู่ที่ daisyUI จับคู่ไว้ให้แล้วเท่านั้น
//     (X กับ X-content หรือ base-content บนพื้น base-*) - ห้ามหยิบสีใดสีหนึ่งมาเป็นสีหมึกเอง
const META: Record<string, RequestStatusMeta> = {
  DRAFT: { label: 'Draft', class: 'badge-ghost' },
  PENDING_APPROVAL: { label: 'Pending Approval', class: 'badge-warning badge-soft' },
  APPROVED: { label: 'Approved', class: 'badge-success badge-soft' },
  REJECTED: { label: 'Rejected', class: 'badge-error badge-soft' },
}

/**
 * ป้ายของสถานะหนึ่ง - สถานะที่ไม่รู้จักคืนค่าดิบ + badge จาง
 * (ให้เห็นว่ามีค่าแปลกอยู่ ดีกว่าซ่อนจนไม่มีใครรู้ว่า map ไม่ครบ)
 */
export function requestStatusMeta(status: string): RequestStatusMeta {
  return META[status] ?? { label: status, class: 'badge-ghost' }
}
