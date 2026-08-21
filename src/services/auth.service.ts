import { request } from './httpClient'
import type { AuthUser } from '@/types/user'

// mock ชั่วคราวระหว่างรอ backend auth — พอ API จริงมาให้ลบทิ้ง แล้วใช้ getCurrentUser()
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

  logout(): Promise<void> {
    return request<void>('/auth/logout', { method: 'POST' })
  },
}