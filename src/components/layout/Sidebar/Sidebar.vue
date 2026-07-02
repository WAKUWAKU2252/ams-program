<script setup lang="ts">
import ubislogo from "@/assets/UBIS.png"
import { computed, ref } from "vue";
import SidebarItem from "./SidebarItem.vue";
import { menuItems } from "@/config/sidebar-menu";
import UserItemComponent from "./UserItem.vue";
import { UserItem } from "@/types/user";

const props = defineProps<{
  userPermissions?: string[];
}>();


const isCollapsed = ref(false);

const activeMenu = ref<string>("dashboard");
const setActiveMenu = (name: string) => {
  activeMenu.value = name;
};

const isProfileMenuOpen = ref(false);
const toggleProfileMenu = () => {
  isProfileMenuOpen.value = !isProfileMenuOpen.value;
  console.log("Profile menu toggled:", isProfileMenuOpen.value);
};

const closeProfileMenu = () => {
  isProfileMenuOpen.value = false;
  console.log("Profile menu toggled:", isProfileMenuOpen.value);
};


const filteredMenu = computed(() => {
  if (!props.userPermissions) return menuItems;

  return menuItems.filter((item) => {
    if (!item.permission) return true;
    return props.userPermissions!.includes(item.permission);
  });
});



</script>

<template>

  
  <aside class= "card">
    <div  class="logo">
    <img :src="ubislogo" draggable="false"/>
    <p>Assets Management System</p>
    </div>
    
    <!-- Menu -->
    <nav class="mt-4">
      <ul >
        <li v-for="item in filteredMenu" :key="item.name">
          <SidebarItem
            :item="item"
            :is-collapsed="isCollapsed"
            :active="activeMenu === item.name"
            @select="setActiveMenu"
          />
        </li>
      </ul>
    </nav>
    
    <div
        v-if="isProfileMenuOpen"
        class="overlay"
        @click="closeProfileMenu"
      >
      <div class="Userpopup">


      </div>
    </div>

    <div class="menu-bottom">
      <div class="line"></div>
      <ul>
        <li v-for="user in UserItem" :key="user.id">
          
          <UserItemComponent
            :user="user"
            :is-collapsed="isCollapsed"
            :active="activeMenu === 'account'"
            @click="toggleProfileMenu"
          />
        </li>
      </ul>
    </div>

  </aside>
</template>

<style>
.card {
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  width: 260px;
  height: 100vh;
  background-color: #F6F6F6;
  gap: 0px;
}

.spacer {
  height: 120px;
}

.line{
  border-top: 1px solid #cecece;
  margin: 10px 20px;
}
.menu-bottom{
    margin-top: auto;   
  padding-bottom: 30px;
}

.logo{
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;

}
img{
    width: 200px;
    height: fit-content;
    padding: 30px 40px 10px;
}

.account-menu{
  background-color: azure;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.1);
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
}

.Userpopup{
  position: relative;
  top: 650px;
  left: 5px;
  width: 250px;
  height: 200px;
  border-radius: 20px;
  background-color: #d9d9d9;
  box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.4);
  padding: 10px;
  z-index: 20;
  transition: 0.3s;
}
</style>
