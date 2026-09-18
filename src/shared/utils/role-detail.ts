/**
 * คำอธิบายว่า role แต่ละตัว "เข้าถึงอะไรได้บ้าง"
 *
 * ★ ทำไมไม่ใช้ role.description จากฐานข้อมูล
 *
 *   คอลัมน์นั้นเก็บแค่ป้ายชื่อสั้น ๆ ('พนักงานทั่วไป' / 'ผู้จัดการ' / 'บัญชี') ซึ่งไม่ได้
 *   ตอบคำถามที่คนกดแจกสิทธิ์กำลังถามอยู่จริง ๆ ว่า "ให้ MANAGER ไปแล้วเขาทำอะไรได้เพิ่ม"
 *   — ข้อความข้างล่างจึงอยู่ฝั่งจอ ส่วน id/ชื่อยังมาจากฐานเสมอ (ดู listRoles)
 *
 * ★★ คัดมาจากของจริงสามที่ ห้ามแต่งเอง — ถ้าสามที่นั้นเปลี่ยน ต้องตามมาแก้ที่นี่ด้วย
 *
 *   sidebar-menu.ts       roles ต่อเมนู
 *   router/routes.ts      meta.roles ต่อหน้า
 *   backend common/roles  APPROVER_ROLES / REGISTRAR_ROLES / DASHBOARD_ALL_*
 *
 * ★ คีย์เป็น "ชื่อ role" ไม่ใช่ id — id มาจากลำดับที่ db:import:role รันครั้งแรก ต่างฐาน
 *   ต่างเลขได้ ส่วนชื่อคือสิ่งที่โค้ดฝั่ง backend อ้างจริง (requireRole('ADMIN') ฯลฯ)
 */
export const ROLE_DETAIL: Record<string, string> = {
  EMPLOYEE:
    'ใช้งานทั่วไป Dashboard, เปิดคำขอขึ้นทะเบียน, สินทรัพย์ของฉัน, ทะเบียนรวม, ผังที่ตั้ง',
  MANAGER:
    'เหมือน EMPLOYEE + อนุมัติใบคำขอได้ และเห็นตัวเลขของทุกแผนก/ทุกบริษัทบน Dashboard',
  FINANCE:
    'เหมือน MANAGER + ออกเลขสินทรัพย์ และเข้าหน้า Asset Request / Audit / Asset Summary',
  ADMIN: 'ทุกอย่างของ FINANCE + สร้างบัญชีผู้ใช้ จัดการสิทธิ์ และเลือกบริษัทตอนเปิดใบได้',
  AUDIT: 'เข้าได้หน้า Audit หน้าเดียวเท่านั้น ',
}

/**
 * ข้อความอธิบายของ role หนึ่งตัว — ถอยไปใช้ description จากฐานถ้ายังไม่มีข้อความที่นี่
 *
 * ★ ต้องมี fallback เสมอ: วันที่มีคนเพิ่ม role ใหม่ในฐาน หน้าจอต้องยังแสดงมันได้
 *   (แค่คำอธิบายสั้นลง) ไม่ใช่โผล่เป็นตัวเลือกเปล่า ๆ ที่ไม่มีใครรู้ว่าคืออะไร
 */
export function roleDetail(name: string, fallback?: string | null): string {
  return ROLE_DETAIL[name] ?? fallback ?? ''
}

/**
 * role ที่ "อนุมัติใบคำขอได้" — ต้องตรงกับ APPROVER_ROLES ฝั่ง backend เป๊ะ
 *
 * ★ ใช้เทียบด้วยชื่อ ไม่ใช่ id ด้วยเหตุผลเดียวกับ ROLE_DETAIL
 * ★ นี่เป็นแค่การเตือน/กรองที่หน้าจอ ตัวบังคับจริงอยู่ที่ setDepartmentManager ฝั่ง backend
 */
export const APPROVER_ROLE_NAMES = ['MANAGER', 'FINANCE', 'ADMIN']

export function isApproverRole(name: string): boolean {
  return APPROVER_ROLE_NAMES.includes(name)
}
