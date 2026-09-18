import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { getToken, isTokenValid, clearToken, getTokenRole } from '@/shared/services/auth.token'
import { homePathForRole, isPathInRoleScope } from '@/shared/utils/role-scope'

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
    // ส่ง path เดิมไปกับ query.redirect ให้ login.vue ตัดสินใจ
    //
    // ★ login.vue กลับไปหน้าเดิมเฉพาะ /assets/ (deep link จาก QR บนสติกเกอร์) นอกนั้น
    //   ล็อกอินเสร็จไป /dashboard เสมอ - token หมดอายุกลางทางแล้วล็อกอินใหม่ ไม่ควรเด้ง
    //   กลับหน้าที่ค้างไว้
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  const role = getTokenRole()

  // role ที่ถูกจำกัดให้ใช้ได้หน้าเดียว (AUDIT) - ดักก่อน meta.roles เพราะเป็นกติกาที่กว้างกว่า:
  // หน้าที่ "ไม่มี meta.roles" คือหน้าที่เปิดให้ทุก role ซึ่งรวม AUDIT ด้วยถ้าไม่มีตัวนี้
  if (!isPathInRoleScope(role, to.path)) return { path: homePathForRole(role) }

  // หน้าที่จำกัด role (meta.roles) - role ไม่ตรงให้กลับหน้าเริ่มต้นของ role นั้นแทนที่จะ
  // ปล่อยให้เห็นฟอร์มแล้วไปโดน 403 ตอนกดบันทึก; นี่เป็นแค่ UI guard ตัวบังคับจริงคือ
  // requireRole/auditScopeGuard ฝั่ง backend
  //
  // ★ ปลายทางต้องมาจาก homePathForRole ไม่ใช่ '/dashboard' ตรง ๆ - role ที่เข้า dashboard
  //   ไม่ได้จะถูกดีดไปหน้าที่ตัวเองก็เข้าไม่ได้ แล้ววนซ้ำไม่จบ
  const roles = to.meta.roles as string[] | undefined
  if (roles?.length) {
    if (!role || !roles.includes(role)) return { path: homePathForRole(role) }
  }
})

export default router
