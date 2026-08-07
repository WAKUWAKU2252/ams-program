import type { RouteRecordRaw } from "vue-router";

// ทุกหน้าอยู่ใต้ MainLayout (Sidebar/Topbar) — path ลูกไม่นำด้วย "/" จะ resolve เป็น /dashboard, /create ฯลฯ
// ต้องตรงกับ `to` ใน config/sidebar-menu.ts เป๊ะ ไม่งั้นเมนูจะไม่ไฮไลต์ active (SidebarItem เทียบ route.path === item.to)
export const routes: RouteRecordRaw[] = [
  // กลุ่มหน้า auth (no-chrome) อยู่ใต้ AuthLayout — ไม่มี Sidebar/Topbar
  {
    path: "/login",
    component: () => import("@/layouts/AuthLayout.vue"),
    children: [
      {
        path: "",                    // → /login
        name: "Login",
        component: () => import("@/views/login.vue"),
        meta: { requiresAuth: false, title: "Login" },
      },
      {
        path: "createUser",          // → /login/createUser
        name: "createUser",
        component: () => import("@/views/createUser.vue"),
        meta: { requiresAuth: false, title: "Create User" },
      },
    ],
  },
  {
    path: "/",
    component: () => import("@/layouts/MainLayout.vue"),
    children: [
      { path: "", redirect: "/dashboard" },
      {
        path: "dashboard",
        name: "dashboard",
        component: () => import("@/views/dashboard.vue"),
        meta: { requiresAuth: true, title: "Dashboard" },
      },
      {
        path: "create",
        component: () => import("@/views/CreateAssetSection.vue"),
        meta: { requiresAuth: true, title: "Create New Asset" },
        children: [
          {
            path: "",
            name: "DraftList",
            component: () =>
              import("@/components/layout/CreateNewAsset/Draft.vue"),
          },
          {
            path: ":requestId",
            name: "DraftForm",
            component: () =>
              import("@/components/layout/CreateNewAsset/DraftForm.vue"),
            props: true,
          },
        ],
      },
      {
        path: "assetrequest",
        name: "assetrequest",
        component: () => import("@/views/assetRequest.vue"),
        meta: { requiresAuth: true, title: "Asset Request" },
      },
      {
        path: "asset-movements",
        name: "asset-movements",
        component: () => import("@/views/AssetMovements.vue"),
        meta: { requiresAuth: true, title: "Asset Movements" },
      },
      {
        path: "audit",
        name: "audit",
        component: () => import("@/views/audit.vue"),
        meta: { requiresAuth: true, title: "Audit" },
      },
      {
        path: "my-assets",
        name: "my-assets",
        component: () => import("@/views/MyAssets.vue"),
        meta: { requiresAuth: true, title: "My Assets" },
      },
      
    ],
    
  },

  // เข้า path ที่ไม่มีจริง → กลับ dashboard (กันหน้า blank เมื่อพิมพ์ URL มั่ว)
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
  
];
