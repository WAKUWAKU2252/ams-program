import { request } from './httpClient'
import type { AuthUser } from '@/shared/types/user'

// mock ชั่วคราวระหว่างรอ backend auth - พอ API จริงมาให้ลบทิ้ง แล้วใช้ getCurrentUser()
// component/store ไม่ต้องแก้เพราะยึด type User ตัวเดียวกันอยู่แล้ว

interface LoginPayload {
  username: string
  password: string
}

interface LoginResponse {
  token: string
  user: AuthUser
}

export const authService = {
  login(payload: LoginPayload): Promise<LoginResponse> {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },

  getCurrentUser(): Promise<AuthUser> {
    return request<AuthUser>('/auth/me', {
      method: 'GET',
      
    })
  },
}

// ── ไม่มี logout() แล้ว (ถอดออก 2026-09-16)
//
// มันยิง POST /auth/logout ซึ่ง **ไม่เคยมีใน backend** — JWT เป็น stateless ไม่มี session
// ให้ทำลายฝั่ง server การออกจากระบบจึงเป็นการทิ้ง token ทิ้งฝั่งจออย่างเดียว
// ทางที่ใช้จริงคือ authStore.logout() (ดู Sidebar.vue ที่เขียนกำกับไว้แล้วว่าไม่เรียกตัวนี้)
// ★ ถ้าวันหลังต้องเพิ่ม logout จริง (revoke token / blacklist) ต้องทำเส้นฝั่ง backend ก่อน
