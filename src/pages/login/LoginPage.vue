<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ApiError } from '@/shared/services/httpClient'
import { useAuthStore } from '@/shared/stores/auth'
import LoginForm from '@/pages/login/components/LoginForm.vue'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const loading = ref(false)
const success = ref(false)
const errorMsg = ref('')

/**
 * หน้าเริ่มต้นหลังล็อกอินคือ /dashboard เสมอ ยกเว้น deep link ที่ "ตั้งใจเปิดหน้านั้นจริง ๆ"
 *
 * ★ เดิมยอมรับ query.redirect ทุกค่า พอ token หมดอายุกลางทางแล้วล็อกอินใหม่ จะไปโผล่หน้า
 *   ที่ค้างไว้แทน dashboard ซึ่งไม่ใช่พฤติกรรมที่ต้องการ - ตอนนี้ allowlist เฉพาะ /assets/
 *   ซึ่งเป็น path ที่ QR บนสติกเกอร์พามา (คนเดินตรวจนับสแกนแล้วต้องได้หน้านั้น ไม่ใช่ dashboard)
 *
 * ★ ต้องขึ้นต้นด้วย '/' ตัวเดียวเท่านั้น - '//host' กับ 'http://host' คือ open redirect ออกนอกเว็บ
 */
function resolveTarget(raw: unknown): string {
  if (typeof raw !== 'string') return '/dashboard'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw.startsWith('/assets/') ? raw : '/dashboard'
}

/**
 * บอกผู้ใช้ว่า "ทำไมถึงมาอยู่หน้านี้"
 *
 * router guard ใส่ query.redirect มาให้เฉพาะตอนที่เด้งออกจากหน้าที่ต้องล็อกอิน (ไม่มี token
 * หรือ token หมดอายุ) ส่วนคนที่เปิด /login เองตรง ๆ จะไม่มี query นี้ — การมีอยู่ของมันจึงเป็น
 * สัญญาณที่เชื่อได้ว่า "เขากำลังทำอะไรค้างอยู่แล้วโดนตัดกลางคัน"
 *
 * ★ ข้อความต้องไม่ฟันธงว่า "หมดอายุ" อย่างเดียว - เคสที่ไม่เคยล็อกอินแล้วพิมพ์ URL ตรง ๆ
 *   ก็มาทางเดียวกัน บอกกลาง ๆ ให้ครอบคลุมทั้งสองเคสดีกว่าบอกผิดครึ่งหนึ่ง
 */
const notice = computed(() =>
  route.query.redirect
    ? 'เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ — กรุณาเข้าสู่ระบบอีกครั้ง'
    : '',
)

/**
 * หน่วงก่อนเปลี่ยนหน้าให้ปุ่มได้แสดงสถานะ "สำเร็จ" ทัน
 *
 * ★ สั้น ๆ พอให้ตาจับได้ว่าเกิดอะไรขึ้น ไม่ใช่ทำให้รอ - ยาวกว่านี้จะกลายเป็นความหน่วง
 *   ที่ผู้ใช้รู้สึกได้ทุกครั้งที่เข้าระบบ
 */
const SUCCESS_HOLD_MS = 550
let redirectTimer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => clearTimeout(redirectTimer))

/**
 * แปลง error ที่โยนมาเป็นข้อความที่ผู้ใช้ทำอะไรต่อได้
 *
 * ★ fetch ที่ต่อ backend ไม่ติด (ปิดเครื่อง/เน็ตหลุด/ยิงผิดพอร์ต) โยน TypeError ไม่ใช่
 *   ApiError - เดิมตกลงมาเป็น "เข้าสู่ระบบไม่สำเร็จ" เหมือนกรณีรหัสผิดเป๊ะ คนจึงนั่งพิมพ์
 *   รหัสซ้ำอยู่หลายรอบทั้งที่ปัญหาอยู่คนละที่กันเลย
 */
function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError) return 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่'
  return 'เข้าสู่ระบบไม่สำเร็จ'
}

async function handleSubmit(payload: { username: string; password: string }) {
  // กันกดซ้ำระหว่างรอ/ระหว่างกำลังพาไปหน้าถัดไป (ปุ่มถูก disable อยู่แล้ว แต่ Enter รัว ๆ
  // ยังส่ง submit ของฟอร์มได้)
  if (loading.value || success.value) return

  loading.value = true
  errorMsg.value = ''

  try {
    await authStore.login(payload)

    success.value = true
    const target = resolveTarget(route.query.redirect)
    redirectTimer = setTimeout(() => router.replace(target), SUCCESS_HOLD_MS)
  } catch (err) {
    errorMsg.value = toMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <LoginForm
    :loading="loading"
    :success="success"
    :error="errorMsg"
    :notice="notice"
    @submit="handleSubmit"
    @clear-error="errorMsg = ''"
  />
</template>
