<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen flex flex-col p-10">
    <div
      class="card flex-1 grid grid-cols-1 lg:grid-cols-10 gap-2 overflow-hidden rounded-xl 
      !shadow-[0_10px_30px_rgba(0,0,0,0.15)] !p-2"
    >
      <!-- Left -->
      <div
        class="lg:col-span-6 bg-gray-100 rounded-lg flex items-center justify-center"
      >
        <h2>Left Side</h2>
      </div>

      <!-- Right -->
      <div
        class="lg:col-span-4 bg-white rounded-lg flex items-center justify-center p-8"
      >
        <router-view />
      </div>
    </div>
  </div>
</template>