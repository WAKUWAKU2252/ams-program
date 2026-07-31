<script setup lang="ts">
// โครงหลักของหน้าในระบบ — Sidebar + Topbar ครอบไว้ที่เดียว
// หน้าเนื้อหาเป็น child route มาแสดงใน <router-view/> ข้างล่าง
import Sidebar from '@/components/layout/Sidebar/Sidebar.vue'
import Topbar from '@/components/layout/Topbar/Topbar.vue'
</script>

<template>
  <div class="grid grid-cols-[260px_minmax(0,1fr)]">
    <Sidebar />

    <div class="grid grid-rows-[auto_1fr] min-w-0 bg-[var(--Side-background)] px-[5px] pt-[5px]">
      <Topbar />
      <div class="page">
        <router-view />
      </div>
    </div>
  </div>
</template>
