import { defineStore } from 'pinia'
import { ref } from 'vue'
import { permissionService } from '@/services/permission.service'

export const usePermissionStore = defineStore('permission', () => {
  const permissions = ref<string[]>([])

  async function getPermissions() {
    const data = await permissionService.getPermissions()
    permissions.value = data
  }

  function hasPermission(perm: string): boolean {
    return permissions.value.includes(perm)
  }

  return { permissions, getPermissions, hasPermission }
})