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
    ],
  },
  // ปลายทางของ QR บนสติกเกอร์ — asset.qrCode เก็บเป็น <APP_BASE_URL>/assets/<เลข>
  //
  // ★ อยู่นอก MainLayout และ requiresAuth: false โดยตั้งใจ
  //   คนที่เปิดหน้านี้คือคนที่สแกนสติกเกอร์บนตัวเครื่อง อาจไม่มีบัญชีในระบบเลย (ช่างที่มาซ่อม/
  //   ผู้รับเหมา) ถ้าบังคับล็อกอินก่อน สติกเกอร์จะใช้ไม่ได้กับคนกลุ่มนั้นทั้งหมด และ Sidebar
  //   ที่พาไปหน้าที่เขากดไม่ได้มีแต่ทำให้สับสน — ใช้ BlankLayout ที่มีแค่แถบชื่อระบบ
  //
  // ★ path ต้องเป็น (.*) ไม่ใช่ :assetNumber เฉย ๆ — เลขจริงบางตัวมี '/' อยู่ข้างใน
  //   (MAC-212-13-001/1, MAC-1-21/12-002) ซึ่ง %2F จะถูก decode เป็น '/' ก่อน router match
  //   ทำให้ segment แตกเป็นสองท่อนแล้วตกไป catch-all → เด้ง dashboard โดยไม่มีอะไรบอกว่าทำไม
  //   (.*) กินทั้งหางจึงรอดทุกเคส รวมถึงเลขที่มีช่องว่าง/ภาษาไทย
  {
    path: "/assets",
    component: () => import("@/layouts/BlankLayout.vue"),
    children: [
      {
        path: ":assetNumber(.*)",
        name: "asset-by-number",
        component: () => import("@/views/AssetByNumber.vue"),
        meta: { requiresAuth: false, title: "Asset" },
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
        meta: { requiresAuth: true, title: "Asset Request", roles: ["FINANCE","ADMIN"] },
        children:[
          {
            path:"",
            name:"MainAssetRequest",
            component:()=>
              import("@/components/layout/AssetRequest/MainAssetRequest.vue")
          },
          // ออกเลขทีละใบ — ต้องเป็นหน้าแยกเพราะการเปิดหน้านี้ = จองใบไว้ (lock)
          // ถ้ากางในตารางได้หลายใบพร้อมกัน คนคนเดียวจะถือ lock ค้างหลายใบ
          {
            path: ":requestId",
            name: "AssetRequestForm",
            component: () =>
              import("@/components/layout/AssetRequest/AssetRequestForm.vue"),
            props: true,
          }
        ],
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
        children:[
          {
            path:"",
            name:"Myasset",
            component:()=>
              import("@/components/layout/MyAsset/MainMyasset.vue")
          },
        ]
      },
      {
        // ทะเบียนสินทรัพย์ทั้งบริษัท — ไม่มี meta.roles โดยตั้งใจ ทุก role ค้นได้
        // (คนที่ตามหาเครื่องมักไม่ใช่คนแผนกเดียวกับที่ของสังกัดอยู่) ฝั่ง backend
        // ก็ไม่มี requireRole ที่ GET /assets/inventory เหมือนกัน
        //
        // ★ ห้ามใช้ path "assets" — ชนกับ /assets/:assetNumber ที่เป็นปลายทางของ QR
        //   บนสติกเกอร์ ซึ่งอยู่นอก MainLayout และเปิดได้โดยไม่ต้องล็อกอิน
        path: "asset-inventory",
        name: "asset-inventory",
        component: () => import("@/views/AssetInventory.vue"),
        meta: { requiresAuth: true, title: "Asset Inventory" },
      },
      {
        // POST /users ฝั่ง backend ใช้ requireRole('ADMIN') — หน้านี้จึงเป็นหน้าของแอดมิน
        // ไม่ใช่หน้าสมัครสมาชิก (เดิมวางไว้ที่ /login/createUser แบบไม่ต้องล็อกอิน
        // ทำให้ยิงไปแล้วโดน 401 แล้วเด้งกลับ /login โดยไม่มีข้อความบอก)
        // roles ใน meta ให้ router guard กันไว้ก่อน — ตัวบังคับจริงยังอยู่ที่ backend
        path: "users/create",
        name: "createUser",
        component: () => import("@/views/createUser.vue"),
        meta: { requiresAuth: true, title: "Create User", roles: ["ADMIN"] },
      },

    ],
    
  },

  // เข้า path ที่ไม่มีจริง → กลับ dashboard (กันหน้า blank เมื่อพิมพ์ URL มั่ว)
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
  
];
