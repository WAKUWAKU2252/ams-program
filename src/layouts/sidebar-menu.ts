// ═══════════════════════════════════════════════════════════════════════════
// เมนูใน sidebar + การจัดกลุ่ม
//
// ── กลุ่มแบ่งตาม "สิ่งที่คนกำลังจะทำ" ไม่ใช่ตามสิทธิ์
//
//   work       ทำงานกับ **เอกสาร** — ภาพรวม / เปิดใบคำขอ / ออกเลข
//   registry   ตามหา **ตัวของ** — ของฉัน / ทะเบียน / ผัง / ตรวจนับ
//   restricted ของที่ role ทั่วไปไม่เห็นอยู่แล้ว — ลงล่างสุดตามธรรมเนียม sidebar
//
// ★★ กลุ่มว่างได้จริง และ **ห้ามวาดเส้นคั่นให้กลุ่มที่ว่าง**
//
//   Sidebar กรองเมนูตาม role ก่อนเสมอ (ดู isPathInRoleScope + item.roles) จำนวนเมนูที่
//   เหลือจริงต่อกลุ่มจึงต่างกันมาก — วัดจากของจริง:
//     ADMIN              4 / 4 / 2   → 2 เส้น
//     FINANCE            4 / 4 / 1   → 2 เส้น
//     MANAGER · EMPLOYEE 3 / 3 / 0   → 1 เส้น (กลุ่ม restricted หายทั้งกลุ่ม)
//     AUDIT              0 / 1 / 0   → ไม่มีเส้นเลย
//
//   (กลุ่ม work +1 ทุก role ตั้งแต่เพิ่ม My Change Requests เข้ามา)
//
//   ถ้าเผลอแทรก divider เป็นไอเทมใน `menuItems` ตัวกรองจะตัดเมนูออกแล้วเส้นค้าง —
//   AUDIT จะเจอเส้นลอยคร่อมเมนูเดียว การประกอบกลุ่มจึงต้องทำ**หลัง**กรอง (ดู Sidebar.vue)
//
// ★ to ต้องเป็น absolute path (นำด้วย "/") เสมอ - router-link resolve relative path
// (ไม่มี "/" นำหน้า) เทียบกับ URL ปัจจุบัน ไม่ใช่เทียบจาก root พอ user อยู่ใน route ลูก
// ที่ลึกกว่าปกติ (เช่น /create/:requestId) relative path จะเพี้ยนไปคนละทาง หรือ
// resolve กลับมาเป็น URL เดิม (คลิกแล้วไม่ไปไหนเลย เพราะ Router มองว่าปลายทาง = ที่อยู่ปัจจุบัน)
// ═══════════════════════════════════════════════════════════════════════════

export type MenuGroup = 'work' | 'registry' | 'restricted';

/** ลำดับกลุ่มบนจอ — Sidebar วนตามลิสต์นี้ ไม่ได้เรียงจากลำดับใน menuItems */
export const MENU_GROUP_ORDER: readonly MenuGroup[] = ['work', 'registry', 'restricted'];

export interface MenuItem {
  name: string;
  label: string;
  icon: string;
  to: string;
  group: MenuGroup;
  // จำกัดให้เห็นเฉพาะบาง role - ต้องตรงกับ meta.roles ของ route เดียวกันใน router.ts
  // (ไม่ใส่ = ทุก role เห็น) ซ่อนเมนูเฉย ๆ ไม่ได้กันเข้าหน้า คนละชั้นกับ router guard/backend
  roles?: string[];
}

// ── ไม่มีฟิลด์ `permission` และ `active` แล้ว (ถอดออก 2026-09-16)
//
//   permission  Sidebar รับ prop `userPermissions` ไว้กรองด้วยค่านี้ แต่ **ไม่เคยมีใคร
//               ส่ง prop นั้นมาสักที่** (MainLayout เรียก <Sidebar /> เปล่า ๆ) ตัวกรองจึง
//               ไม่เคยทำงานเลย — อ่านแล้วเข้าใจผิดว่ามีการกั้น ทั้งที่ตัวกั้นจริงคือ
//               `roles` กับ isPathInRoleScope อย่างเดียว
//   active      SidebarItem ไม่เคยอ่าน — มันคิด isActive จาก route ปัจจุบันเอง
//               (reload แล้วไฮไลต์ยังตรง URL ซึ่งฟิลด์ตายตัวทำไม่ได้)
//
// ★ วันไหนต้องการสิทธิ์ละเอียดกว่า role ให้ต่อ permission จริงตั้งแต่ backend → store →
//   Sidebar ให้ครบสาย อย่าเติมฟิลด์กลับมาเฉย ๆ แล้วปล่อยให้ไม่มีใครป้อนค่าอีกรอบ
export const menuItems: MenuItem[] = [
  // ── work: ทำงานกับเอกสาร ──────────────────────────────────────────────────
  {
    name: "dashboard",
    label: "Dashboard",
    icon: "lucide:layout-dashboard",
    to: "/dashboard",
    group: "work",
  },
  {
    name: "assets",
    label: "Create New Asset",
    icon: "lucide:file-plus-2",
    to: "/create",
    group: "work",
  },
  {
    // ★ อยู่กลุ่ม work ไม่ใช่ registry - ตามนิยามที่หัวไฟล์: work คือ "ทำงานกับเอกสาร"
    //   ส่วน registry คือ "ตามหาตัวของ" ใบคำขอแก้ทะเบียนเป็นเอกสาร ไม่ใช่ของ
    // ★ วางต่อจาก Create New Asset - สองอันนี้คือ "ใบคำขอของฉัน" เหมือนกัน ต่างกันแค่
    //   ขอขึ้นทะเบียนใหม่ กับ ขอแก้ของที่อยู่ในทะเบียนแล้ว
    name: "Create Requests",
    label: "Create Requests",
    icon: "lucide:file-pen-line",
    to: "/my-change-requests",
    group: "work",
  },
  {
    name: "Asset Request",
    label: "Asset Requests",
    icon: "lucide:clipboard-list",
    to: "/assetrequest",
    group: "work",
    roles: ["FINANCE", "ADMIN"],
  },

  // ── registry: ตามหาตัวของ ─────────────────────────────────────────────────
  {
    name: "My Assets",
    label: "My Assets",
    icon: "lucide:boxes",
    to: "/my-assets",
    group: "registry",
  },
  {
    name: "Asset Inventory",
    label: "Asset Inventory",
    icon: "lsicon:inventory-filled",
    to: "/asset-inventory",
    group: "registry",
  },
  {
    name: "Asset Location Map",
    label: "Asset Location Map",
    icon: "lucide:map",
    to: "/floor-plan",
    group: "registry",
  },
  {
    name: "Audit",
    label: "Audit",
    icon: "lucide:scan-search",
    to: "/audit",
    group: "registry",
    // ตรงกับ meta.roles ของ route 'audit' ใน router.ts — สองที่นี้เคยไม่ตรงกันมาแล้ว
    // (เมนูจำกัดไว้แต่ route ไม่ได้จำกัด = ซ่อนลิงก์แต่พิมพ์ URL เข้าได้)
    roles: ["FINANCE", "ADMIN", "AUDIT"],
  },

  // ── restricted: เฉพาะสิทธิ์ ────────────────────────────────────────────────
  {
    // ★ ต้องตรงกับ meta.roles ของ route 'asset-summary' และ requireRole ที่
    //   GET /dashboard/asset-summary — สามที่นี้ขยับพร้อมกันเสมอ (ดูคอมเมนต์ที่ routes.ts)
    name: "Asset Summary",
    label: "Asset Summary",
    icon: "lucide:table-2",
    to: "/asset-summary",
    group: "restricted",
    roles: ["FINANCE", "ADMIN"],
  },
  {
    name: "Admin",
    label: "Admin",
    // ★ ต้องเป็นชุด lucide — ชุดอื่นที่ใช้ตัวเดียวทำให้เสียคำขอออกเน็ตนอกเพิ่มทั้งชุด
    //   (@iconify/vue ดึงไอคอนตอนรันไทม์ รวมเป็นคำขอเดียวต่อ "ชุด" ไม่ใช่ต่อไอคอน)
    icon: "lucide:user-cog",
    to: "/users/admin",
    group: "restricted",
    roles: ["ADMIN"],
  },
];
