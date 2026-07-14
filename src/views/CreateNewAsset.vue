<script setup lang="ts">
import Sidebar from '@/components/layout/Sidebar/Sidebar.vue'
import Topbar from '@/components/layout/Topbar/Topbar.vue'
import CreateNewAsset from '@/components/layout/CreateNewAsset/CreateNewAsset.vue';

</script>

<template>
  <div class="grid grid-cols-[260px_minmax(0,1fr)]">
    <Sidebar />

    <div class="grid grid-rows-[auto_1fr] min-w-0 h-[2000px] bg-[var(--Side-background)] p-[5px]">
      <Topbar />
      <div class="page">
        <router-view />
        <CreateNewAsset/>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
}
</style>