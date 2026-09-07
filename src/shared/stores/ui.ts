import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  // ผูกกับ checkbox `drawer-toggle` ของ daisyUI ใน MainLayout โดยตรง
  // (บนจอ lg ขึ้นไป drawer เปิดค้างด้วย lg:drawer-open - ค่านี้จึงมีผลเฉพาะจอเล็ก)
  const isSidebarOpen = ref(false)

  function toggleSidebar(): void {
    isSidebarOpen.value = !isSidebarOpen.value
  }

  function closeSidebar(): void {
    isSidebarOpen.value = false
  }

  // --- Profile menu popup (UserItem overlay) ---
  const isProfileMenuOpen = ref(false)

  function toggleProfileMenu(): void {
    isProfileMenuOpen.value = !isProfileMenuOpen.value
  }

  function openProfileMenu(): void {
    isProfileMenuOpen.value = true
  }

  function closeProfileMenu(): void {
    isProfileMenuOpen.value = false
  }

  return {
    // state
    isSidebarOpen,
    isProfileMenuOpen,
    // sidebar actions
    toggleSidebar,
    closeSidebar,
    // profile menu actions
    toggleProfileMenu,
    openProfileMenu,
    closeProfileMenu,
  }
})
