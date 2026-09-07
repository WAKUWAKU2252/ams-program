<script setup lang="ts">
// เปลือกบางที่สุด - ไม่มี Sidebar/Topbar ไม่มีการ์ดครอบ
//
// ใช้กับหน้าที่ "ไม่ได้เป็นส่วนหนึ่งของแอป" ในสายตาผู้ใช้ ตอนนี้คือปลายทางของ QR
// (/assets/:assetNumber) ซึ่งคนเปิดคือคนที่สแกนสติกเกอร์บนเครื่อง มักไม่ได้ล็อกอิน
// และไม่ได้ตั้งใจจะมาใช้ระบบ - เมนูข้างที่พาไปหน้าที่เขากดไม่ได้มีแต่ทำให้สับสน
//
// แถบบนพาไปหน้าแรกสำหรับคนที่อยากเข้าระบบต่อ (router guard จะพาไป login ให้เองถ้ายังไม่ได้
// ล็อกอิน) - ไม่ใส่ปุ่ม login ตรง ๆ เพราะคนที่ล็อกอินอยู่แล้วจะงงว่าให้ล็อกอินซ้ำทำไม
import ubislogo from '@/assets/UBIS.png'
</script>

<template>
  <div class="min-h-screen bg-base-200">
    <header class="border-b border-base-300 bg-base-100">
      <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        <RouterLink to="/" class="flex items-center gap-3">
          <img :src="ubislogo" alt="UBIS" class="h-7" />
          <span class="text-sm font-medium tracking-wide opacity-70">
            Assets Management System
          </span>
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto w-full max-w-2xl">
      <RouterView />
    </main>
  </div>
</template>
