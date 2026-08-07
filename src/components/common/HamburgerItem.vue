
<script setup>
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'

defineProps({
  ariaLabel: {
    type: String,
    default: 'เปิด/ปิดเมนู',
  },
})

const uiStore = useUiStore()
const { isSidebarCollapsed } = storeToRefs(uiStore)
</script>

<template>
  <button
    type="button"
    class="relative inline-flex items-center justify-center w-12 h-12 border-none bg-transparent rounded-[10px] cursor-pointer [-webkit-tap-highlight-color:transparent] transition-colors duration-200 ease-in-out hover:bg-black/[0.06] active:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6750a4] focus-visible:outline-offset-2"
    :aria-expanded="!isSidebarCollapsed"
    :aria-label="ariaLabel"
    @click="uiStore.toggleSidebar()"
  >
    <span class="relative w-5 h-4">
      <span class="absolute left-0 top-0 w-full h-0.5 rounded-sm bg-[var(--on-surface-variant-color)]"></span>
      <span class="absolute left-0 top-[7px] w-full h-0.5 rounded-sm bg-[var(--on-surface-variant-color)]"></span>
      <span class="absolute left-0 top-[14px] w-full h-0.5 rounded-sm bg-[var(--on-surface-variant-color)]"></span>
    </span>
  </button>
</template>