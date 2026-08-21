// ═══════════════════════════════════════════════════════════════════════════
// ป้ายสถานะของ "ใบคำขอ" — นิยามที่เดียวของทั้งระบบ
//
// ค่าดิบมาจาก enum request_status ฝั่ง DB ซึ่งมี 4 ค่าเท่านั้น:
//   DRAFT · PENDING_APPROVAL · APPROVED · REJECTED
// (REGISTERED ถูกถอดออกตั้งแต่ 0014 — ใบจบหน้าที่ที่ APPROVED ส่วน REGISTERED/CANCELLED
//  ย้ายไปเป็นเรื่องของ "ชิ้น" แล้ว ดู asset.lifecycle)
//
// ★ ห้ามโชว์ค่าดิบบนจอ: ผู้ใช้เห็น "APPROVED" ปนกับ "Draft" ในตารางเดียวกันแล้วอ่านเหมือน
//   คนละระบบ — และ ALL CAPS ที่หลุดมาคือสัญญาณว่ามีสถานะที่ map ไม่ครบ ซึ่งจะเงียบไปเรื่อย ๆ
//   ถ้าปล่อยให้ fallback เป็นค่าดิบสวย ๆ
// ═══════════════════════════════════════════════════════════════════════════

export interface RequestStatusMeta {
  label: string
  /** class ของ daisyUI badge — สีตาม semantic ของธีม ไม่ fix สี */
  class: string
}

const META: Record<string, RequestStatusMeta> = {
  DRAFT: { label: 'Draft', class: 'badge-neutral badge-soft' },
  PENDING_APPROVAL: { label: 'Pending Approval', class: 'badge-warning badge-soft' },
  APPROVED: { label: 'Approved', class: 'badge-success badge-soft' },
  REJECTED: { label: 'Rejected', class: 'badge-error badge-soft' },
}

/**
 * ป้ายของสถานะหนึ่ง — สถานะที่ไม่รู้จักคืนค่าดิบ + badge จาง
 * (ให้เห็นว่ามีค่าแปลกอยู่ ดีกว่าซ่อนจนไม่มีใครรู้ว่า map ไม่ครบ)
 */
export function requestStatusMeta(status: string): RequestStatusMeta {
  return META[status] ?? { label: status, class: 'badge-ghost' }
}
