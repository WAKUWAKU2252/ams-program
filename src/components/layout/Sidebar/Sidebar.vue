<script setup lang="ts">
import ubislogo from '@/assets/UBIS.png'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import SidebarItem from './SidebarItem.vue'
import UserItemComponent from './UserItem.vue'
import { menuItems } from '@/config/sidebar-menu'
import { UserItem } from '@/types/user'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{
  userPermissions?: string[]
}>()

const uiStore = useUiStore()

const {
  isSidebarCollapsed,
  activeMenu,
  isProfileMenuOpen,
} = storeToRefs(uiStore)

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

      <div
        v-if="isProfileMenuOpen"
        class="fixed inset-0 z-10"
        @click="uiStore.toggleProfileMenu"
      >
        <div
          class="absolute bottom-[70px] left-2.5 w-[250px] min-h-[200px] p-2.5 rounded-[20px] bg-[#d9d9d9] shadow-[0_4px_8px_rgba(0,0,0,0.4)]"
          @click.stop
        >
          Profile Popup
        </div>
      </div>

      <div class="pb-[30px]">
        <div class="border-t border-[#cecece] mx-5 my-2.5"></div>

        <ul>
          <li v-for="user in UserItem" :key="user.id">
            <UserItemComponent
              :user="user"
              :active="activeMenu === 'account'"
              @click="uiStore.toggleProfileMenu"
            />
          </li>
        </ul>
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