import { request } from './httpClient'

interface User {
  id: number
  name: string
  email: string
  roles: string[]
}

interface LoginPayload {
  email: string
  password: string
}

interface LoginResponse {
  token: string
  user: User
}

export const authService = {
  login(payload: LoginPayload): Promise<LoginResponse> {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },

  getCurrentUser(): Promise<User> {
    return request<User>('/auth/me')
  },

  logout(): Promise<void> {
    return request<void>('/auth/logout', { method: 'POST' })
  },
}