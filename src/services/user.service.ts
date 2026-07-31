// services/user.service.ts
import { request } from './httpClient'
import type { User } from '@/types/user'

// payload ตรงกับ createUserBody (TypeBox) ฝั่ง backend — module user
export interface CreateUserPayload {
  username: string
  email?: string
  displayName: string
  password: string
  roleId: number
  employeeId?: number | null
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