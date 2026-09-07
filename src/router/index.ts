import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { getToken, isTokenValid, clearToken, getTokenRole } from '@/shared/services/auth.token'

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
    // พากลับมาที่หน้าเดิมหลังล็อกอินเสร็จ (login.vue อ่าน query.redirect อยู่แล้ว)
    //
    // ★ จำเป็นกับ flow สแกน QR: คนเดินตรวจนับสแกนสติกเกอร์บนเครื่อง → มือถือยังไม่ได้
    //   ล็อกอิน → เด้งไป login ถ้าไม่พก path มาด้วย พอล็อกอินเสร็จจะไปโผล่ dashboard
    //   แล้วเขาต้องเดินกลับไปสแกนใหม่ ทั้งที่เพิ่งสแกนไปเมื่อกี้
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // หน้าที่จำกัด role (meta.roles) - role ไม่ตรงให้กลับ dashboard แทนที่จะปล่อยให้เห็นฟอร์ม
  // แล้วไปโดน 403 ตอนกดบันทึก; นี่เป็นแค่ UI guard ตัวบังคับจริงคือ requireRole ฝั่ง backend
  const roles = to.meta.roles as string[] | undefined
  if (roles?.length) {
    const role = getTokenRole()
    if (!role || !roles.includes(role)) return { path: '/dashboard' }
  }
})

export default router