<script setup lang="ts">
import { RouterView } from 'vue-router'
import { ref, computed, watch, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { isTokenValid } from '@/services/auth.token'
import { useAuthStore } from './stores/auth'

const connection = useConnectionStore()
const auth = useAuthStore()

// ต่อ SSE เฉพาะตอนมี token ที่ยังไม่หมดอายุ (= login แล้ว) — login/reload = ต่อ, logout/หมดอายุ = ตัดสาย
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
  <div id="app">
    <Transition name="sse-fade">
      <div v-if="visible" class="sse-status">{{ connection.statusText }}</div>
    </Transition>
    <RouterView />
  </div>
</template>

<style scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  text-align: center;
  margin-top: 0;
}

.sse-status {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 6px 30px;
  border-radius: 9999px;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.708);
  color: #fff;
  pointer-events: none;
}

.sse-fade-enter-active,
.sse-fade-leave-active {
  transition: opacity 0.25s ease;
}
.sse-fade-enter-from,
.sse-fade-leave-to {
  opacity: 0;
}
</style>
