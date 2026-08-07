<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { MenuItem } from '@/config/sidebar-menu'
import { Icon } from "@iconify/vue";
const props = defineProps<{
  item: MenuItem
  isCollapsed?: boolean
}>()

const route = useRoute()

// active มาจาก route ปัจจุบัน ไม่ใช่ state ใน store — reload แล้วไฮไลต์ยังตรง URL
// startsWith(to + '/') ให้ route ลูก (เช่น /create/:requestId) ยังนับว่า Create active อยู่
const isActive = computed(
  () => route.path === props.item.to || route.path.startsWith(props.item.to + '/'),
)
</script>

<template>
  <router-link
    :to="item.to"
    class="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-[18px]  [padding:12px_16px_12px_30px] rounded-[0.8rem] cursor-pointer mx-[15px] text-sm transition duration-200 text-left no-underline"
    :class="isActive
      ? 'text-black'
      : 'text-primary'"
  >
    <span class="w-6 h-6 grid place-items-center">
      <!-- <i
        v-if="item.icon"
        :class="[item.icon, isActive ? 'text-white' : 'text-[var(--primary-color)]']"
        class="text-[18px] leading-[8px]"
      ></i> --><Icon :icon="item.icon"   
   
        class="text-[18px] leading-[8px]"/>
    </span>
    <span>
      {{ item.label }}
    </span>
  </router-link>
</template>
