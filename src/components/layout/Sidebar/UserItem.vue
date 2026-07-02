<script setup lang="ts">
import type { User } from "@/types/user.ts"


const props = defineProps<{
  user: User;
  isCollapsed?: boolean;
  active: boolean;
  toggleProfileMenu?: boolean;
}>();

const emit = defineEmits<{
  (e: "click", toggleProfileMenu: boolean): void;
}>();

</script>

<template>
  <router-link 
    class="menuUser"
    :class="{ 'active': active }"
    @click="emit('click', !toggleProfileMenu)"
  >
    <span class="icon-box">
      <i v-if="user.avatar" :class="user.avatar"></i>
    </span>

    <span v-if="!isCollapsed">
      {{ user.fullName }}
    </span>
    </router-link>
  </template>


<style>

.menuUser{
  font-family: Arial, Helvetica, sans-serif;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  color: #393C39;
  background-color: #F6F6F6;
  padding: 12px 16px 12px 30px;
  border-radius: 0.8rem;
  cursor: pointer;
  margin: 0px 15px;
  font-size: 14px;
  transition: 0.2s;
}

.menuUser:hover {
  background: rgb(196, 196, 196);
}
.icon-box {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.icon-box i{
  font-size: 18px;
  line-height: 8px;
  color: #393C39;
}
</style>