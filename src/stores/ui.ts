import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const isSidebarCollapsed = ref(false)

  function toggleSidebar(): void {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
  }

  function collapseSidebar(): void {
    isSidebarCollapsed.value = true
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
    isSidebarCollapsed,
    isProfileMenuOpen,
    // sidebar actions
    toggleSidebar,
    collapseSidebar,
    // profile menu actions
    toggleProfileMenu,
    openProfileMenu,
    closeProfileMenu,
  }
})
