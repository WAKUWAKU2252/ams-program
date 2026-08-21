<script setup lang="ts">
import ubislogo from '@/assets/UBIS.png'
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { Icon } from '@iconify/vue'

import SidebarItem from './SidebarItem.vue'
import { menuItems } from '@/config/sidebar-menu'
import { useAuthStore } from '@/stores/auth'
import { getTokenRole } from '@/services/auth.token'

const props = defineProps<{
  userPermissions?: string[]
}>()

const authStore = useAuthStore()

// ผู้ใช้ที่ล็อกอินอยู่ — มาจาก Auth store (service คืน mock ชั่วคราวจนกว่า backend auth พร้อม)
const { user } = storeToRefs(authStore)

onMounted(() => {
  if (!authStore.user) authStore.getCurrentUser().catch(() => {})
})

// role มาจาก token (ไม่ต้องรอ /auth/me โหลดเสร็จ) เมนูจึงไม่กะพริบตอนเข้าหน้าครั้งแรก
const currentRole = computed(() => getTokenRole())

const filteredMenu = computed(() => {
  const permissions = props.userPermissions

  return menuItems.filter((item) => {
    // เมนูเฉพาะบาง role (เช่น Create User = ADMIN) — role ไม่ตรงก็ไม่ต้องแสดง
    if (item.roles?.length && !item.roles.includes(currentRole.value ?? '')) return false

    if (!permissions) return true
    if (!item.permission) return true

    return permissions.includes(item.permission)
  })
})
</script>

<template>
  <aside class="grid h-full min-h-screen w-64 grid-rows-[auto_1fr_auto] bg-base-200 text-base-content">
    <div class="grid justify-items-center gap-1 px-8 pb-3 pt-7">
      <img :src="ubislogo" draggable="false" alt="UBIS" class="h-auto w-40" />
      <p class="text-center text-xs text-base-content/60">Assets Management System</p>
    </div>

    <nav class="overflow-y-auto">
      <ul class="menu w-full gap-1 px-3">
        <li v-for="item in filteredMenu" :key="item.name">
          <SidebarItem :item="item" />
        </li>
      </ul>
    </nav>

    <div class="px-3 pb-6">
      <div class="divider my-2"></div>
      <div class="flex items-center gap-3 rounded-box px-3 py-2">
        <div class="avatar avatar-placeholder">
          <div class="w-9 rounded-full bg-primary text-primary-content">
            <Icon icon="lucide:user" class="text-lg" />
          </div>
        </div>
        <div class="min-w-0 text-left">
          <p class="truncate text-sm font-medium">{{ user?.displayName ?? '—' }}</p>
          <p class="truncate text-xs text-base-content/60">ID: {{ user?.employeeId ?? '—' }}</p>
        </div>
      </div>
    </div>
  </aside>
</template>
