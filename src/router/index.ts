import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// TODO: เปิดใช้ตอน auth/permission service พร้อมจริง
// router.beforeEach(async (to, from, next) => {
//   const appStore = useAppStore()
//   const authStore = useAuthStore()
//   if (!appStore.isInitialized) {
//     try {
//       await appStore.initializeApp()
//     } catch (err) {}
//   }
//   const requiresAuth = to.meta.requiresAuth as boolean
//   if (requiresAuth && !authStore.isAuthenticated) {
//     return next({ name: 'Login' })
//   }
//   next()
// })

export default router