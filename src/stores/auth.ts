import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'

interface User {
  id: number
  name: string
  email: string
  roles: string[]
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  async function getCurrentUser() {
    if (!token.value) throw new Error('No token found')
    const data = await authService.getCurrentUser()
    user.value = data
  }

  function hasRole(role: string): boolean {
    return user.value?.roles.includes(role) ?? false
  }

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  return { user, token, isAuthenticated, getCurrentUser, hasRole, setToken, logout }
})