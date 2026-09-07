import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/shared/services/auth.service'
import { getToken, setToken as persistToken, clearToken, isTokenValid } from '@/shared/services/auth.token'
import type { AuthUser } from '@/shared/types/user'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)

  // token SSOT อยู่ที่ auth.token.ts (localStorage คีย์ 'authToken:<tabId>' แยกต่อแท็บ - ช่องเดียว
  // กับที่ httpClient/router guard/SSE ใช้) store ถือแค่ mirror reactive สำหรับ isAuthenticated
  // ★ ห้ามเขียน localStorage เอง/ห้ามประกอบคีย์เอง - ต้องผ่าน setToken/clearToken เท่านั้น
  //   (เดิม store ใช้คีย์ 'token' คนละตัวกับ httpClient จึง auth จริงกับ store ไม่ตรงกัน)
  const token = ref<string | null>(getToken())

  const isAuthenticated = computed(() => isTokenValid(token.value) && !!user.value)

  // login: ยิง credential → เก็บ token (ผ่าน SSOT) + เซ็ต user จาก response เลย (ไม่ต้อง getCurrentUser ซ้ำ)
  // เขียน token ที่เดียว: persistToken (auth.token.ts คุม localStorage + ตั้ง expiry) แล้ว sync mirror reactive
  async function login(credentials: { username: string; password: string }) {
    const { token: newToken, user: loggedInUser } = await authService.login(credentials)
    persistToken(newToken)
    token.value = newToken
    user.value = loggedInUser
  }

  async function getCurrentUser() {
    user.value = await authService.getCurrentUser()
  }

  function hasRole(roleName: string): boolean {
    return user.value?.role?.name === roleName
  }

  function logout() {
    clearToken()
    token.value = null
    user.value = null
  }

  return { user, token, isAuthenticated, login, getCurrentUser, hasRole, logout }
})
