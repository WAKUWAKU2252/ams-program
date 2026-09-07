<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { MenuItem } from '@/layouts/sidebar-menu'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  item: MenuItem
}>()

const route = useRoute()

// active มาจาก route ปัจจุบัน ไม่ใช่ state ใน store - reload แล้วไฮไลต์ยังตรง URL
// startsWith(to + '/') ให้ route ลูก (เช่น /create/:requestId) ยังนับว่า Create active อยู่
const isActive = computed(
  () => route.path === props.item.to || route.path.startsWith(props.item.to + '/'),
)
</script>

<template>
  <router-link :to="item.to" :class="{ 'menu-active': isActive }">
    <Icon :icon="item.icon" class="text-lg" />
    <span>{{ item.label }}</span>
  </router-link>
</template>
