export interface Role {
  id: number
  name: string
  description: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ตรงกับ PublicUser ฝั่ง backend = แถวในตาราง user ที่ตัด passwordHash ทิ้ง
// ไม่มี email/firstName/lastName แล้ว (0005) — อีเมลกับชื่อจริงอยู่ที่ employee (มาจาก HR/SAP)
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
// POST /users คืน User เปล่า ๆ ไม่มี role — จึงแยกชนิดกัน ไม่งั้นโค้ดจะอ่าน user.role.name
// จากผลลัพธ์ที่ไม่มีฟิลด์นั้นจริงแล้วได้ undefined ตอนรัน โดย TS ไม่เตือน
export interface AuthUser extends User {
  role: Role
}
