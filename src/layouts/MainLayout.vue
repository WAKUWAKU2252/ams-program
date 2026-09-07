<script setup lang="ts">
// โครงหลักของหน้าในระบบ - daisyUI drawer: sidebar ค้างไว้บนจอใหญ่ (lg:drawer-open)
// จอเล็กพับเก็บแล้วเปิดด้วยปุ่ม hamburger ใน Topbar (label ที่ชี้มาที่ checkbox ตัวเดียวกัน)
// หน้าเนื้อหาเป็น child route มาแสดงใน <router-view/> ข้างล่าง
import Sidebar from '@/layouts/components/Sidebar.vue'
import Topbar from '@/layouts/components/TopBar.vue'
import { useUiStore } from '@/shared/stores/ui'
import { storeToRefs } from 'pinia'

const uiStore = useUiStore()
const { isSidebarOpen } = storeToRefs(uiStore)
</script>

<template>
  <div class="drawer lg:drawer-open">
    <input id="ams-drawer" v-model="isSidebarOpen" type="checkbox" class="drawer-toggle" />

    <div class="drawer-content grid min-w-0 grid-rows-[auto_1fr] bg-base-200">
      <Topbar />
      <main class="min-w-0 bg-base-100">
        <router-view />
      </main>
    </div>

    <div class="drawer-side z-40">
      <label for="ams-drawer" aria-label="ปิดเมนู" class="drawer-overlay"></label>
      <Sidebar />
    </div>
  </div>
</template>
