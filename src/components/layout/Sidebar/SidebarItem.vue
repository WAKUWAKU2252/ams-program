<script setup lang="ts">
import type { MenuItem } from "@/config/sidebar-menu";


const props = defineProps<{
  item: MenuItem;
  isCollapsed?: boolean;
  active: boolean;
}>();


const emit = defineEmits<{
  (e: "select", name: string): void;
}>();

const handleClick = () => {
  emit("select", props.item.name);
};

</script>

<template>
  <router-link  
    :to="item.to"
    class="menu"
    :class="{ 'active': active }"
    @click="handleClick"
  >
    <span class="icon-box">
      <i v-if="item.icon" :class="item.icon"></i>
    </span>

    <span v-if="!isCollapsed">
      {{ item.label }}
    </span>
  </router-link>
</template>

<style> 

.menu {
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

.menu:hover {
  background: rgb(196, 196, 196);
}
.menu.active {
  background: #1C9548;
  color: white;
}
.menu.active:hover {
  background: #1C9548;
  color: white;
}

.menu:hover{
    background: rgb(196, 196, 196);
    transition: 0.3s;
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
.menu.active .icon-box i{
  color: rgb(255, 255, 255);
}


</style>