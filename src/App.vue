<script setup lang="ts">
import { RouterView } from 'vue-router'
import { ref, computed, watch, onUnmounted } from 'vue'
import { useConnectionStore } from '@/shared/stores/connection'
import { isTokenValid } from '@/shared/services/auth.token'
import { useAuthStore } from './shared/stores/auth'

const connection = useConnectionStore()
const auth = useAuthStore()

// สีของ banner ตามสถานะสาย SSE - online เขียว, กำลังต่อ เหลือง, หลุด แดง
const statusAlertClass = computed(() => {
  switch (connection.status) {
    case 'connected':
      return 'alert-success'
    case 'connecting':
      return 'alert-warning'
    default:
      return 'alert-error'
  }
})

// ต่อ SSE เฉพาะตอนมี token ที่ยังไม่หมดอายุ (= login แล้ว) - login/reload = ต่อ, logout/หมดอายุ = ตัดสาย
// immediate: reload ที่ยังมี token valid อยู่ให้ต่อกลับเองโดยไม่ต้อง login ซ้ำ
const loggedIn = computed(() => isTokenValid(auth.token))
watch(
  loggedIn,
  (on) => (on ? connection.connect() : connection.disconnect()),
  { immediate: true },
)

// banner โผล่เฉพาะตอนสถานะ SSE "เปลี่ยน" (เช่นตอนต่อสำเร็จ/หลุด) แล้วซ่อนเองใน 3 วิ ไม่ค้างบังจอ
const AUTO_HIDE_MS = 1500
const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => connection.status,
  () => {
    visible.value = true
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => (visible.value = false), AUTO_HIDE_MS)
  },
)

onUnmounted(() => {
  clearTimeout(hideTimer)
  connection.disconnect()
})
</script>

<template>
  <!-- id="app" อยู่ที่ mount point ใน index.html แล้ว - ไม่ซ้ำที่นี่ (id ต้องไม่ซ้ำในหน้า) -->
  <div class="min-h-screen bg-base-200 text-base-content">
    <Transition name="sse-fade">
      <div v-if="visible" class="toast toast-top toast-center z-[9999] pointer-events-none">
        <div role="alert" class="alert alert-soft py-2 text-sm" :class="statusAlertClass">
          <span>{{ connection.statusText }}</span>
        </div>
      </div>
    </Transition>
    <RouterView />
  </div>
</template>

<style scoped>
.sse-fade-enter-active,
.sse-fade-leave-active {
  transition: opacity 0.25s ease;
}
.sse-fade-enter-from,
.sse-fade-leave-to {
  opacity: 0;
}
</style>
