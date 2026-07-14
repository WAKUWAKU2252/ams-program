
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './Auth'
import { usePermissionStore } from './Permission'

export const useAppStore = defineStore('app', () => {
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const error = ref<string | null>(null)

  async function initializeApp() {
    const authStore = useAuthStore()
    const permissionStore = usePermissionStore()

    isLoading.value = true
    error.value = null

    try {
      await authStore.getCurrentUser()

      if (authStore.user) {
        await permissionStore.getPermissions()
      }
    } catch (err) {
      error.value = 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้'
      console.error(err)
    } finally {
      isInitialized.value = true
      isLoading.value = false
    }
  }

  function stopLoading() {
    isLoading.value = false
  }

  return {
    isLoading,
    isInitialized,
    error,
    initializeApp,
    stopLoading,
  }
})

