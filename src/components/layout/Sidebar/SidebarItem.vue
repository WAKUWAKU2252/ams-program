<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import type { MenuItem } from '@/config/sidebar-menu'

const props = defineProps<{
  item: MenuItem
  isCollapsed?: boolean
}>()

const uiStore = useUiStore()

function handleClick(): void {
  uiStore.setActiveMenu(props.item.name)
}
</script>

<template>
  <router-link
    :to="item.to"
    class="font-[Arial,Helvetica,sans-serif] grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-[18px] text-[var(--primary-color)] [padding:12px_16px_12px_30px] rounded-[0.8rem] cursor-pointer mx-[15px] text-sm transition duration-200 text-left no-underline"
    :class="uiStore.activeMenu === item.name
      ? 'bg-[var(--button-active)] text-white hover:bg-[var(--button-active)]'
      : 'bg-[var(--Side-background)] hover:bg-[var(--button-hover)]'"
    @click="handleClick"
  >
    <span class="w-6 h-6 grid place-items-center">
      <i
        v-if="item.icon"
        :class="[item.icon, uiStore.activeMenu === item.name ? 'text-white' : 'text-[var(--primary-color)]']"
        class="text-[18px] leading-[8px]"
      ></i>
    </span>

    <span>
      {{ item.label }}
    </span>
  </router-link>
</template>