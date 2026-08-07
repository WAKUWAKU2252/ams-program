import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './router'
import { getToken, isTokenValid, clearToken } from '@/services/auth.token'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// guard: ทุกหน้ายกเว้น /login ต้องมี token ที่ยังไม่หมดอายุ
// token หมด/ไม่มี → ล้างทิ้งแล้วเด้งไป /login (ตรวจทุกครั้งที่เปลี่ยนหน้า + ตอนโหลดครั้งแรก)
router.beforeEach((to) => {
  // /login เข้าได้เสมอ (เผื่อ login ใหม่ / สลับผู้ใช้)
   if (to.meta.requiresAuth === false) return

  if (!isTokenValid(getToken())) {
    clearToken()
    return { path: '/login' }
  }
})

export default router