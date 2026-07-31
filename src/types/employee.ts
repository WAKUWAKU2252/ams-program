// ผู้ถือครองสินทรัพย์ (mirror ของ employee master ฝั่ง backend)
// asset.employeeId ชี้มาที่นี่ — คนละตัวกับ User ที่ล็อกอินเข้าระบบ
export interface Employee {
  id: number // รหัสพนักงานจาก HR ไม่ auto-gen
  name: string
  email: string
  departmentId: number
  isActive: boolean
}
