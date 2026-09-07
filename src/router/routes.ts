import type { RouteRecordRaw } from "vue-router";

// ทุกหน้าอยู่ใต้ MainLayout (Sidebar/Topbar) - path ลูกไม่นำด้วย "/" จะ resolve เป็น /dashboard, /create ฯลฯ
// ต้องตรงกับ `to` ใน config/sidebar-menu.ts เป๊ะ ไม่งั้นเมนูจะไม่ไฮไลต์ active (SidebarItem เทียบ route.path === item.to)
export const routes: RouteRecordRaw[] = [
  // กลุ่มหน้า auth (no-chrome) อยู่ใต้ AuthLayout - ไม่มี Sidebar/Topbar
  {
    path: "/login",
    component: () => import("@/layouts/AuthLayout.vue"),
    children: [
      {
        path: "",                    // → /login
        name: "Login",
        component: () => import("@/pages/login/LoginPage.vue"),
        meta: { requiresAuth: false, title: "Login" },
      },
    ],
  },
  // ปลายทางของ QR บนสติกเกอร์ - asset.qrCode เก็บเป็น <APP_BASE_URL>/assets/<เลข>
  //
  // ★ อยู่นอก MainLayout และ requiresAuth: false โดยตั้งใจ
  //   คนที่เปิดหน้านี้คือคนที่สแกนสติกเกอร์บนตัวเครื่อง อาจไม่มีบัญชีในระบบเลย (ช่างที่มาซ่อม/
  //   ผู้รับเหมา) ถ้าบังคับล็อกอินก่อน สติกเกอร์จะใช้ไม่ได้กับคนกลุ่มนั้นทั้งหมด และ Sidebar
  //   ที่พาไปหน้าที่เขากดไม่ได้มีแต่ทำให้สับสน - ใช้ BlankLayout ที่มีแค่แถบชื่อระบบ
  //
  // ★ path ต้องเป็น (.*) ไม่ใช่ :assetNumber เฉย ๆ - เลขจริงบางตัวมี '/' อยู่ข้างใน
  //   (MAC-212-13-001/1, MAC-1-21/12-002) ซึ่ง %2F จะถูก decode เป็น '/' ก่อน router match
  //   ทำให้ segment แตกเป็นสองท่อนแล้วตกไป catch-all → เด้ง dashboard โดยไม่มีอะไรบอกว่าทำไม
  //   (.*) กินทั้งหางจึงรอดทุกเคส รวมถึงเลขที่มีช่องว่าง/ภาษาไทย
  {
    path: "/assets",
    component: () => import("@/layouts/BlankLayout.vue"),
    children: [
      {
        // ★ บริษัทมาก่อนเลข (0021) - เลขสินทรัพย์ซ้ำกันข้ามบริษัทจริง 24 ตัว
        //   เลขเปล่าจึงชี้ได้สองชิ้น URL นี้คือสิ่งที่ QR บนสติกเกอร์พามา
        //   :company กินแค่ segment แรก ส่วน (.*) กินหางที่เหลือ เลขที่มี '/' จึงยังรอด
        path: ":company/:assetNumber(.*)",
        name: "asset-by-number",
        component: () => import("@/pages/asset-public/AssetByNumberPage.vue"),
        meta: { requiresAuth: false, title: "Asset" },
      },
      {
        // ── ทางเข้าเก่า: /assets/<เลข> (ไม่มีรหัสบริษัท) ────────────────────
        //
        // qrCode ที่เขียนลงทะเบียนไว้ก่อน 0021 เป็นรูปนี้ทั้งหมด (วัด 2026-09-01: 2,732
        // แถวจากทั้งหมด ไม่มีสักแถวที่มีบริษัท) พอ match ไม่ติดมันจะตกไป catch-all
        // ข้างล่างซึ่ง redirect ไป /dashboard ที่ต้องล็อกอิน = "สแกน QR แล้วเด้ง login"
        //
        // ★ ต้องอยู่ "หลัง" route ที่มีสอง param - vue-router ให้คะแนน path ที่ segment
        //   เยอะกว่าชนะอยู่แล้ว (ทดสอบยืนยันแล้ว: /assets/UBA/COM-1 ยังเข้าตัวบน)
        //   แต่เรียงตามลำดับที่อ่านแล้วเห็นเองปลอดภัยกว่าพึ่งคะแนนอย่างเดียว
        //
        // ★ requiresAuth: false เหมือนกัน - คนสแกนสติกเกอร์เก่าก็ยังไม่ได้ล็อกอินอยู่ดี
        //   ถ้าลืมใส่ตรงนี้ อาการเดิมจะกลับมาทั้งดุ้นโดยที่ route มีอยู่จริงแล้ว
        path: ":assetNumber(.*)",
        name: "asset-by-number-legacy",
        component: () => import("@/pages/asset-public/AssetByNumberLegacyPage.vue"),
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
        component: () => import("@/pages/dashboard/DashboardPage.vue"),
        meta: { requiresAuth: true, title: "Dashboard" },
      },
      {
        path: "create",
        component: () => import("@/pages/create-asset/CreateAssetPage.vue"),
        meta: { requiresAuth: true, title: "Create New Asset" },
        children: [
          {
            path: "",
            name: "DraftList",
            component: () =>
              import("@/pages/create-asset/DraftListPage.vue"),
          },
          {
            path: ":requestId",
            name: "DraftForm",
            component: () =>
              import("@/pages/create-asset/DraftFormPage.vue"),
            props: true,
          },
        ],
      },
      {
        path: "assetrequest",
        name: "assetrequest",
        component: () => import("@/pages/asset-request/AssetRequestPage.vue"),
        meta: { requiresAuth: true, title: "Asset Request", roles: ["FINANCE","ADMIN"] },
        children:[
          {
            path:"",
            name:"MainAssetRequest",
            component:()=>
              import("@/pages/asset-request/AssetRequestListPage.vue")
          },
          // ออกเลขทีละใบ - ต้องเป็นหน้าแยกเพราะการเปิดหน้านี้ = จองใบไว้ (lock)
          // ถ้ากางในตารางได้หลายใบพร้อมกัน คนคนเดียวจะถือ lock ค้างหลายใบ
          {
            path: ":requestId",
            name: "AssetRequestForm",
            component: () =>
              import("@/pages/asset-request/AssetRequestFormPage.vue"),
            props: true,
          }
        ],
      },
      {
        // แผนผังโรงงาน - ไม่มี meta.roles เหมือน asset-inventory: คนที่ตามหาเครื่องมัก
        // ไม่ใช่คนแผนกเดียวกับที่ของสังกัดอยู่ และ GET /master/floor-plans ฝั่ง backend
        // ก็เป็น authGuard เฉย ๆ ไม่ล็อก role เหมือนกัน
        path: "floor-plan",
        name: "floor-plan",
        component: () => import("@/pages/floor-plan/FloorPlanPage.vue"),
        meta: { requiresAuth: true, title: "Asset Location Map" },
      },
      {
        // ★ roles ต้องตรงกับ sidebar-menu.ts เสมอ — เมนูจำกัดไว้ที่ FINANCE/ADMIN มาตั้งแต่แรก
        //   แต่ route ไม่มี meta.roles ผลคือ "ซ่อนลิงก์แต่เข้าได้" พนักงานทั่วไปพิมพ์ /audit
        //   ลงแถบที่อยู่ก็เปิดได้ตามปกติ (เมนูที่หายไปไม่ใช่การกั้น มันแค่ไม่ชวนให้กด)
        //
        //   ⚠️ ต่างจากหน้าอื่นตรงที่ **ไม่มี requireRole ฝั่ง backend รองรับ** — หน้านี้กิน
        //   GET /assets/inventory ซึ่งจงใจเปิดให้ทุก role (ดูเหตุผลที่ assetInventoryQuery)
        //   ตัวนี้จึงเป็นการกั้น "หน้า" ไม่ใช่กั้น "ข้อมูล": ของชุดเดียวกันยังค้นได้จาก
        //   /asset-inventory อยู่ดี ถ้าวันไหนต้องกั้นข้อมูลจริง ต้องแยกเส้น API ก่อน
        path: "audit",
        name: "audit",
        component: () => import("@/pages/audit/AuditPage.vue"),
        meta: { requiresAuth: true, title: "Audit", roles: ["FINANCE", "ADMIN"] },
      },
      {
        path: "my-assets",
        name: "my-assets",
        component: () => import("@/pages/my-assets/MyAssetsPage.vue"),
        meta: { requiresAuth: true, title: "My Assets" },
      },
      {
        // ทะเบียนสินทรัพย์ทั้งบริษัท - ไม่มี meta.roles โดยตั้งใจ ทุก role ค้นได้
        // (คนที่ตามหาเครื่องมักไม่ใช่คนแผนกเดียวกับที่ของสังกัดอยู่) ฝั่ง backend
        // ก็ไม่มี requireRole ที่ GET /assets/inventory เหมือนกัน
        //
        // ★ ห้ามใช้ path "assets" - ชนกับ /assets/:assetNumber ที่เป็นปลายทางของ QR
        //   บนสติกเกอร์ ซึ่งอยู่นอก MainLayout และเปิดได้โดยไม่ต้องล็อกอิน
        path: "asset-inventory",
        name: "asset-inventory",
        component: () => import("@/pages/asset-inventory/AssetInventoryPage.vue"),
        meta: { requiresAuth: true, title: "Asset Inventory" },
      },
      {
        // POST /users ฝั่ง backend ใช้ requireRole('ADMIN') - หน้านี้จึงเป็นหน้าของแอดมิน
        // ไม่ใช่หน้าสมัครสมาชิก (เดิมวางไว้ที่ /login/createUser แบบไม่ต้องล็อกอิน
        // ทำให้ยิงไปแล้วโดน 401 แล้วเด้งกลับ /login โดยไม่มีข้อความบอก)
        // roles ใน meta ให้ router guard กันไว้ก่อน - ตัวบังคับจริงยังอยู่ที่ backend
        path: "users/admin",
        name: "admin",
        component: () => import("@/pages/admin/CreateUserPage.vue"),
        meta: { requiresAuth: true, title: "Admin", roles: ["ADMIN"] },
      },

    ],
    
  },

  // เข้า path ที่ไม่มีจริง → กลับ dashboard (กันหน้า blank เมื่อพิมพ์ URL มั่ว)
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
  
];
