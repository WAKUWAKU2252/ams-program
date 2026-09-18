export interface Role {
  id: number
  name: string
  description: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ตรงกับ PublicUser ฝั่ง backend = แถวในตาราง user ที่ตัด passwordHash ทิ้ง
// ไม่มี email/firstName/lastName แล้ว (0005) - อีเมลกับชื่อจริงอยู่ที่ employee (มาจาก HR/SAP)
export interface User {
  id: number
  username: string
  displayName: string
  roleId: number
  employeeId: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// เฉพาะเส้นที่ join role มาให้ (POST /auth/login, GET /auth/me)
// POST /users คืน User เปล่า ๆ ไม่มี role - จึงแยกชนิดกัน ไม่งั้นโค้ดจะอ่าน user.role.name
// จากผลลัพธ์ที่ไม่มีฟิลด์นั้นจริงแล้วได้ undefined ตอนรัน โดย TS ไม่เตือน
export interface AuthUser extends User {
  role: Role
  /** null = บัญชีนี้ยังไม่ผูกกับพนักงานในระบบ HR (ดู AuthEmployee) */
  employee?: AuthEmployee | null
}

/**
 * ตัวตนฝั่ง HR ที่ backend join มาให้กับ GET /auth/me (with: { employee: true })
 *
 * ★ ประกาศเฉพาะช่องที่หน้าจอใช้จริง ไม่ยกทั้งแถวมา - แถว employee มีข้อมูลบุคคลอยู่ด้วย
 *   การประกาศครบทุกช่องเชิญชวนให้เอาไปแสดงในที่ที่ไม่ควรแสดง
 *
 * ★ POST /auth/login กับ GET /auth/me คืนชุดเดียวกันแล้ว (แก้ 2026-09-09) - อ่านช่องนี้ได้
 *   ตั้งแต่วินาทีที่ล็อกอินเสร็จ ไม่ต้องรอ getCurrentUser()
 *
 *   เดิม login join แค่ role ผลคือกล่องโปรไฟล์ขึ้น "ไม่ได้ระบุ" ทุกช่องหลังล็อกอิน
 *   แล้วต้องกด F5 ถึงจะมาครบ (Sidebar โหลด /auth/me เฉพาะตอนยังไม่มี user ซึ่งหลัง login
 *   มีแล้ว แค่ไม่ครบ) — ถ้าจะเพิ่ม relation ที่หน้าจอใช้ ต้องเพิ่มทั้งสองเส้นพร้อมกันเสมอ
 *
 * ★ null ได้ทั้งตัวและทั้งช่อง: บัญชีที่ยังไม่ผูกพนักงาน (service account) ไม่มี employee
 *   และ employee.companyCode เองก็ nullable (HR ไม่มีข้อมูลสังกัดของบางคน)
 */
export interface AuthEmployee {
  id: number
  companyCode: string | null
  departmentId: number | null

  // ── ช่องที่กล่องโปรไฟล์ (Sidebar) ใช้ - เพิ่มทีหลัง ยังคงหลัก "เฉพาะที่ใช้จริง" เหมือนเดิม
  //
  // ★ ทั้งสามช่องเป็น null ได้จริง ไม่ใช่กันเผื่อ: ในพนักงานที่ใช้งานอยู่ 396 คน
  //   ไม่มีอีเมล 254 คน (วัด 2026-09-09) - หน้าจอต้องเขียนกรณี "ไม่มี" ให้อ่านออก
  //   ไม่ใช่ปล่อยเป็นช่องว่างที่ดูเหมือนระบบลืมแสดง
  /** ชื่อจริงจาก HR - คนละตัวกับ user.displayName ซึ่งเป็นชื่อของ "บัญชี" */
  firstName: string | null
  lastName: string | null
  /**
   * ชื่ออังกฤษจาก HR - ใช้ทำตัวอักษรย่อบนรูปโปรไฟล์
   *
   * ★ backend ส่งมาให้อยู่แล้วตั้งแต่แรก (getMe/login ใช้ with: { employee: true } ซึ่งคืน
   *   ทุกคอลัมน์ของแถว) แค่ชนิดฝั่งนี้ไม่เคยประกาศไว้ - ไม่ได้เพิ่มเส้น API ใหม่
   * ★ null ได้จริง HR ไม่ได้กรอกครบทุกคน ตัวย่อจึงต้องมีทางถอย (ดู avatarLetter)
   */
  firstNameEn: string | null
  lastNameEn: string | null
  /** รหัสพนักงาน (HR) - คนละตัวกับ user.employeeId ซึ่งเป็น id ของแถวในตาราง */
  empId: string | null
  email: string | null
  /** มาจาก with: { department: true } ของ GET /auth/me - null = ยังไม่ผูกแผนก */
  department?: { id: number; name: string; shortName: string | null } | null
}
