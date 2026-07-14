import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'CreateAsset',
    component: () => import('@/views/CreateNewAsset.vue'), // แก้ path ให้ตรงกับที่พี่เก็บไฟล์จริง
    meta: { requiresAuth: false },  // ปิด auth ชั่วคราว
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]