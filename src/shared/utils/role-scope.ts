// ═══════════════════════════════════════════════════════════════════════════
// role ที่ถูกจำกัดให้ใช้ได้หน้าเดียว
//
// ปกติสิทธิ์ในระบบนี้เป็น allowlist ต่อหน้า (meta.roles ของ route + roles ของเมนู) ซึ่ง
// ตอบว่า "หน้านี้ใครเข้าได้บ้าง" แต่ role อย่าง AUDIT ต้องการคำตอบกลับด้าน: "คนนี้เข้า
// ได้หน้าเดียว" ถ้าใช้ meta.roles อย่างเดียวจะต้องไปไล่ใส่ทุก route ที่ไม่มี meta.roles
// (dashboard, create, floor-plan, asset-inventory, my-assets) แล้วหน้าใหม่ที่ใครเพิ่ม
// ทีหลังจะเปิดให้ AUDIT เองโดยอัตโนมัติ — กลับด้านกับสิ่งที่ role นี้แปลว่า
//
// ★ นี่เป็นการกั้นฝั่งหน้าจอเท่านั้น ตัวบังคับจริงคือ auditScopeGuard ฝั่ง backend
//   ซึ่ง allowlist เส้น API ที่หน้า Audit ใช้จริงไว้ (พิมพ์ URL เข้ามาเองก็ไม่ได้ข้อมูล)
// ═══════════════════════════════════════════════════════════════════════════

/** role → path เดียวที่เข้าได้ (นับรวม route ลูกด้วย เทียบแบบขึ้นต้น) */
const ROLE_ONLY_PATH: Record<string, string> = {
  AUDIT: '/audit',
}

/** null = role นี้ไม่ได้ถูกจำกัด ใช้กติกา meta.roles ตามปกติ */
export function onlyPathForRole(role: string | null | undefined): string | null {
  return (role && ROLE_ONLY_PATH[role]) ?? null
}

/**
 * หน้าเริ่มต้นของ role — คนทั่วไปคือ /dashboard ส่วน role ที่ถูกจำกัดคือหน้าเดียวที่เขาเข้าได้
 *
 * ★ ต้องใช้ตัวนี้แทนการเขียน '/dashboard' ตรง ๆ ทุกที่ที่เป็น "ที่ไปเมื่อเข้าหน้านั้นไม่ได้"
 *   ไม่งั้น AUDIT ที่ถูกดีดออกจากหน้าอื่นจะถูกส่งไป /dashboard ซึ่งเขาก็เข้าไม่ได้อีก = วนไม่จบ
 */
export function homePathForRole(role: string | null | undefined): string {
  return onlyPathForRole(role) ?? '/dashboard'
}

/** path นี้อยู่ในขอบเขตของ role หรือไม่ (role ที่ไม่ถูกจำกัด = ได้ทุก path) */
export function isPathInRoleScope(role: string | null | undefined, path: string): boolean {
  const only = onlyPathForRole(role)
  if (!only) return true
  return path === only || path.startsWith(`${only}/`)
}

/**
 * role ที่เลือก "บริษัท" ได้เอง — ADMIN คนเดียว นอกนั้นถูกล็อกไว้ที่บริษัทตัวเอง
 *
 * ★ แคบกว่าที่อื่นในระบบโดยตั้งใจ: MANAGER/FINANCE ดูตัวเลขของบริษัทอื่นบน Dashboard ได้
 *   แต่ "เปิดใบ" ของบริษัทอื่นไม่ได้ — อ่านกับเขียนคนละระดับ
 *
 * ★ ต้องตรงกับ PO_ALL_COMPANY_ROLES ฝั่ง backend เป๊ะ (common/roles.ts) — ตัวบังคับจริง
 *   อยู่ที่ createDraft ซึ่งโยน 403 ถ้า PO เป็นของบริษัทอื่น ตัวนี้เป็นแค่การซ่อนช่องที่กด
 *   ไปก็ไม่มีผล ถ้าสองที่ไม่ตรงกัน ผู้ใช้จะเลือกบริษัทได้แล้วไปเจอ 403 ตอนกดสร้าง
 */
const PICK_COMPANY_ROLES = ['ADMIN']

export function canPickCompany(role: string | null | undefined): boolean {
  return !!role && PICK_COMPANY_ROLES.includes(role)
}
