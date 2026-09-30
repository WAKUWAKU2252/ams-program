// services/user.service.ts
import { request } from './httpClient'
import type { User } from '@/shared/types/user'

// payload ตรงกับ createUserBody (TypeBox) ฝั่ง backend - module user
// ไม่มี email/firstName/lastName แล้ว (0005): อีเมลกับชื่อจริงเป็นของ employee ซึ่งมาจาก
// HR/SAP - อยากให้ user มีข้อมูลพวกนี้ต้องผูก employeeId ไม่ใช่ส่งมาที่นี่
// (ส่งไปก็หายเงียบ เพราะ Elysia normalize ตัดฟิลด์เกินทิ้งโดยไม่ error)
/**
 * ข้อมูลพนักงานใหม่ที่สร้างไปพร้อม user - ใช้แทน employeeId (ส่งพร้อมกันไม่ได้ backend ตอบ 400)
 *
 * ทางเข้าปกติของข้อมูลพนักงานคือสคริปต์ import จาก HR/SAP - ช่องนี้เป็นทางลัดของแอดมิน
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
  /** บังคับ - พนักงานต้องสังกัดแผนกเสมอ (NOT NULL ที่ DB) */
  departmentId: number
}

export interface CreateUserPayload {
  username: string
  displayName: string
  password: string
  roleId: number
  /** ผูกกับพนักงานที่มีอยู่แล้ว */
  employeeId?: number | null
  /** หรือสร้างพนักงานใหม่ไปพร้อมกัน - เลือกได้อย่างใดอย่างหนึ่ง */
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
// ── หน้า Manage role (ADMIN) ───────────────────────────────────────────────

/** หนึ่งแถวในตารางจัดการสิทธิ์ - backend ประกอบชื่อ role/แผนกมาให้แล้ว ไม่ต้อง join เอง */
export interface UserListItem {
  id: number
  username: string
  displayName: string | null
  isActive: boolean
  roleId: number
  roleName: string
  /** null = บัญชีที่ไม่ผูกพนักงาน (service account) */
  employeeId: number | null
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  companyCode: string | null
  /**
   * เป็นหัวหน้าของแผนกใดแผนกหนึ่งอยู่
   *
   * ★ ต้องโชว์ให้เห็นก่อนแก้สิทธิ์ - ลด role ของคนนี้ให้ต่ำกว่า MANAGER/FINANCE/ADMIN
   *   เมื่อไหร่ ใบคำขอของแผนกที่เขาคุมจะส่งไม่ออกทันที และไม่มี error ตรงไหนบอกเลย
   */
  isDepartmentManager: boolean
}

export interface UserListResult {
  data: UserListItem[]
  total: number
  page: number
  limit: number
}

/** GET /users - ADMIN เท่านั้น */
export function listUsers(
  params: {
    search?: string
    roleId?: number
    /** บริษัทที่สังกัดจริง (กติกาเดียวกับ Dashboard) คนละหนึ่งบริษัท - บัญชีที่ไม่ผูกพนักงานจะหายไปเมื่อกรอง */
    companyCode?: string
    /** เฉพาะบัญชีที่ไม่ผูกพนักงาน - ทางเดียวที่จะหาบัญชีกลุ่มนี้เจอ เพราะไม่มีบริษัทให้กรอง */
    unlinked?: boolean
    page?: number
    limit?: number
  } = {},
): Promise<UserListResult> {
  const query = new URLSearchParams()
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.roleId) query.set('roleId', String(params.roleId))
  if (params.companyCode) query.set('companyCode', params.companyCode)
  if (params.unlinked) query.set('unlinked', 'true')
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const qs = query.toString()
  return request<UserListResult>(`/users${qs ? `?${qs}` : ''}`, { method: 'GET' })
}

/**
 * PATCH /users/:id/role - เปลี่ยนสิทธิ์
 *
 * ⚠️ เขียนลงฐานจริง · ผู้ใช้ที่ล็อกอินค้างอยู่จะยังถือ role เดิมจนกว่า token จะหมดอายุ
 *    หรือล็อกอินใหม่ (role ฝังอยู่ใน JWT)
 */
export function updateUserRole(id: number, roleId: number): Promise<User> {
  return request<User>(`/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId }),
  })
}

/**
 * PATCH /users/:id/password - ADMIN ตั้งรหัสผ่านใหม่ให้ผู้ใช้
 *
 * ⚠️ เขียนลงฐานจริง · token ที่ผู้ใช้ถืออยู่ยังใช้ได้จนหมดอายุ (JWT_EXPIRES_IN) ระบบเตะออกไม่ได้
 */
export function resetUserPassword(id: number, password: string): Promise<User> {
  return request<User>(`/users/${id}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}
