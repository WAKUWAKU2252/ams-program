<script setup lang="ts">
import ubislogo from '@/assets/UBIS.png'
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

import SidebarItem from './SidebarItem.vue'
import UserItemComponent from './UserItem.vue'
import { menuItems } from '@/config/sidebar-menu'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/Auth'

const props = defineProps<{
  userPermissions?: string[]
}>()

const uiStore = useUiStore()
const authStore = useAuthStore()

const {
  isSidebarCollapsed,
  isProfileMenuOpen,
} = storeToRefs(uiStore)

// ผู้ใช้ที่ล็อกอินอยู่ — มาจาก Auth store (service คืน mock ชั่วคราวจนกว่า backend auth พร้อม)
const { user } = storeToRefs(authStore)

onMounted(() => {
  if (!authStore.user) authStore.getCurrentUser().catch(() => {})
})

const filteredMenu = computed(() => {
  const permissions = props.userPermissions
  if (!permissions) return menuItems

  return menuItems.filter((item) => {
    if (!item.permission) return true

    return permissions.includes(item.permission)
  })
})
</script>

<template>
  <aside
    class="sticky top-0 h-screen transition-[width] duration-300 ease-in-out"
  >
    <div class="grid h-full grid-rows-[auto_1fr_auto] bg-[var(--Side-background)]">
      <div class="grid justify-items-center items-center">
        <img
          :src="ubislogo"
          draggable="false"
          class="h-auto transition-[width,padding] duration-300 ease-in-out"
        />
        <p>Assets Management System</p>
      </div>

      <nav class="mt-4 overflow-y-auto">
        <ul>
          <li v-for="item in filteredMenu" :key="item.name">
            <SidebarItem
              :item="item"
            />
          </li>
        </ul>
      </nav>

      

      <div class="pb-[30px] text-center">
        <div class="border-t border-[#cecece] mx-5 my-2.5"></div>
    <div>
        {{ authStore.user?.displayName}} id: {{authStore.user?.id  }}
      </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>

.logo {
  display: grid;
  justify-items: center;
  align-items: center;
}

img {
  width: 200px;
  height: auto;
  padding: 30px 40px 10px;
}
</style>