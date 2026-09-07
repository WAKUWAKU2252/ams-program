<script setup lang="ts">
// ปุ่มย้อนกลับที่วางไว้หน้าหัวข้อของแต่ละหน้า
//
// ★ ใช้ประวัติของเบราว์เซอร์เป็นหลัก (router.back()) ไม่ใช่ push ไปหน้าที่ตั้งไว้ตายตัว -
//   คนที่กดเข้ามาจากตารางที่กรอง/ค้น/เปิดหน้า 4 ไว้ ต้องกลับไปเจอสภาพเดิม การ push จะได้
//   หน้าใหม่ที่รีเซ็ตทุกอย่าง (สภาพเดิมถูกเก็บไว้ให้เฉพาะทาง back เท่านั้น)
//
// ★ fallback ใช้เมื่อ "ไม่มีที่ให้กลับ" ซึ่งเกิดจริงสองทาง: เปิด URL ตรง ๆ (แชร์ลิงก์/
//   บุ๊กมาร์ก) กับกด F5 ค้างอยู่หน้านั้น - สองกรณีนี้ history.state.back เป็น null
//   ถ้าไม่กันไว้ การกดปุ่มจะพาผู้ใช้ออกนอกแอปไปหน้าก่อนหน้าของเบราว์เซอร์
//
// ★ หน้าที่เป็นหน้าลูกควรส่ง fallback เป็นหน้าแม่ (เช่น /create/:id ส่ง '/create')
//   ไม่ใช่ปล่อยเป็น /dashboard ซึ่งพาไปไกลกว่าที่ผู้ใช้ตั้งใจหนึ่งชั้น
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'

const props = withDefaults(defineProps<{ fallback?: string }>(), { fallback: '/dashboard' })

const router = useRouter()

function goBack() {
  // vue-router เก็บ back/current/forward ไว้ใน history.state เอง - ไม่มี back คือไม่มีที่ให้กลับ
  // (เช็ค history.length ไม่ได้: มันนับรวมหน้าก่อนหน้าที่เป็นเว็บอื่นด้วย)
  if (window.history.state?.back) router.back()
  else void router.push(props.fallback)
}
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-circle btn-sm shrink-0"
    title="ย้อนกลับ"
    aria-label="ย้อนกลับ"
    @click="goBack"
  >
    <Icon icon="lucide:arrow-left" class="size-5" />
  </button>
</template>
