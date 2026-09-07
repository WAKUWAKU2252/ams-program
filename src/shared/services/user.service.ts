// services/user.service.ts
import { request } from './httpClient'
import type { User } from '@/types/user'

// payload ตรงกับ createUserBody (TypeBox) ฝั่ง backend — module user
// ไม่มี email/firstName/lastName แล้ว (0005): อีเมลกับชื่อจริงเป็นของ employee ซึ่งมาจาก
// HR/SAP — อยากให้ user มีข้อมูลพวกนี้ต้องผูก employeeId ไม่ใช่ส่งมาที่นี่
// (ส่งไปก็หายเงียบ เพราะ Elysia normalize ตัดฟิลด์เกินทิ้งโดยไม่ error)
/**
 * ข้อมูลพนักงานใหม่ที่สร้างไปพร้อม user — ใช้แทน employeeId (ส่งพร้อมกันไม่ได้ backend ตอบ 400)
 *
 * ทางเข้าปกติของข้อมูลพนักงานคือสคริปต์ import จาก HR/SAP — ช่องนี้เป็นทางลัดของแอดมิน
 * สำหรับคนที่ยังไม่มีในต้นทาง และของที่กรอกไว้อาจถูก sync ทับทีหลังถ้า ownerCode ตรงกัน
 */
export interface CreateEmployeePayload {
  firstName: string
  lastName?: string
  firstNameEn?: string
  lastNameEn?: string
  empId?: string
  email?: string
  ownerCode?: number
  /** บังคับ — พนักงานต้องสังกัดแผนกเสมอ (NOT NULL ที่ DB) */
  departmentId: number
}

export interface CreateUserPayload {
  username: string
  displayName: string
  password: string
  roleId: number
  /** ผูกกับพนักงานที่มีอยู่แล้ว */
  employeeId?: number | null
  /** หรือสร้างพนักงานใหม่ไปพร้อมกัน — เลือกได้อย่างใดอย่างหนึ่ง */
  employee?: CreateEmployeePayload
}

export const userService = {
  createUser(payload: CreateUserPayload): Promise<User> {
    return request<User>('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}