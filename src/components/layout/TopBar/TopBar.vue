<script setup lang="ts">
import DateDisplay from './Datedisplay.vue'
import TopbarItem from '@/components/common/HamburgerItem.vue';
import { useUiStore } from '@/stores/ui'
import { ref } from 'vue'

const isSidebarOpen = ref(false)
const uiStore = useUiStore()
</script>

<template>
  <header class="grid grid-cols-1 bg-[var(--Side-background)] w-full h-[70px]">
    <div class="w-full h-full grid grid-rows-1">

      <div class="h-full box-border grid grid-cols-[minmax(0,1fr)_max-content] items-center [padding:0_50px_0_30px] bg-white rounded-t-[20px]">
        <div class="grid grid-cols-[max-content_1px_minmax(0,1fr)] items-center gap-x-3 text-left">
            <topbar-item
            :model="isSidebarOpen"
            @update:model-value="uiStore.toggleSidebar"
            :aria-expanded="isSidebarOpen"
            aria-label="เปิด/ปิดเมนูหลัก"/>
            <div class="w-[1.5px] h-5 bg-[var(--line-color)] mx-[10px] justify-self-center self-center"></div>
          <span class="text-sm font-normal text-[var(--third-color)]">Create New Asset</span>
        </div>
        <div class="grid grid-flow-col auto-cols-max items-center gap-x-4">
          <DateDisplay
            locale="en"
            variant="short"
            :show-time="true"
            :live-time="true"
            class="text-[15px] text-[var(--third-color)]"
          />
        </div>
      </div>
    </div>
  </header>
</template>