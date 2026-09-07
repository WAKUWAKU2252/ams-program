<script setup lang="ts">
import ubislogo from '@/assets/UBIS.png'
</script>

<template>
  <div class="min-h-screen bg-base-200 p-4 sm:p-10">
    <div class="card min-h-[calc(100vh-2rem)] bg-base-100 shadow-xl sm:min-h-[calc(100vh-5rem)]">
      <div class="grid flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-10">
        <!-- Left - hero แบรนด์ (ซ่อนบนจอเล็กเพื่อให้ฟอร์มเต็มพื้นที่) -->
        <div class="hero hidden rounded-box bg-base-200 lg:col-span-6 lg:flex">
          <div class="hero-content text-center">
            <div class="max-w-md">
              <img :src="ubislogo" alt="UBIS" class="mx-auto mb-6 w-56" />
              <h1 class="text-3xl font-bold">Assets Management System</h1>
              <p class="py-4 text-base-content/70">
                ระบบบริหารจัดการสินทรัพย์ - ลงทะเบียน ติดตาม และตรวจนับสินทรัพย์ขององค์กร
              </p>
            </div>
          </div>
        </div>

        <!-- Right - ฟอร์ม -->
        <div class="flex items-center justify-center rounded-box p-4 sm:p-8 lg:col-span-4">
          <router-view />
        </div>
      </div>
    </div>
  </div>
</template>
