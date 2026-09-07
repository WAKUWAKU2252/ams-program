export interface MenuItem {
  name: string;
  label: string;
  icon: string;
  active: boolean;
  to: string;
  permission?: string;
  // จำกัดให้เห็นเฉพาะบาง role - ต้องตรงกับ meta.roles ของ route เดียวกันใน router.ts
  // (ไม่ใส่ = ทุก role เห็น) ซ่อนเมนูเฉย ๆ ไม่ได้กันเข้าหน้า คนละชั้นกับ router guard/backend
  roles?: string[];
}

// ★ to ต้องเป็น absolute path (นำด้วย "/") เสมอ - router-link resolve relative path
// (ไม่มี "/" นำหน้า) เทียบกับ URL ปัจจุบัน ไม่ใช่เทียบจาก root พอ user อยู่ใน route ลูก
// ที่ลึกกว่าปกติ (เช่น /create/:requestId) relative path จะเพี้ยนไปคนละทาง หรือ
// resolve กลับมาเป็น URL เดิม (คลิกแล้วไม่ไปไหนเลย เพราะ Router มองว่าปลายทาง = ที่อยู่ปัจจุบัน)
export const menuItems: MenuItem[] = [
  {
    name: "dashboard",
    label: "Dashboard",
    icon: "lucide:layout-dashboard",
    active: true,
    to: "/dashboard",
    permission: "asset-request:view",
  },
  {
    name: "assets",
    label: "Create New Asset",
    icon: "lucide:file-plus-2",
    active: false,
    to: "/create",
    permission: "asset-request:view",
  },
  {
    name: "Asset Request",
    label: "Asset Requests",
    icon: "lucide:clipboard-list",
    to: "/assetrequest", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    roles: ["FINANCE","ADMIN"],
  },
  {
    name: "Asset Location Map",
    label: "Asset Location Map",
    icon: "lucide:map",
    to: "/floor-plan",
    active: false,
  },
  {
    name: "Audit",
    label: "Audit",
    icon: "lucide:scan-search",
    to: "/audit",
    active: false,
    // ตรงกับ meta.roles ของ route 'audit' ใน router.ts — สองที่นี้เคยไม่ตรงกันมาแล้ว
    // (เมนูจำกัดไว้แต่ route ไม่ได้จำกัด = ซ่อนลิงก์แต่พิมพ์ URL เข้าได้)
    roles: ["FINANCE","ADMIN"],
  },
  {
    name: "My Assets",
    label: "My Assets",
    icon: "lucide:boxes",
    to: "/my-assets", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    permission: "my-assets:view",
  },
  {
    name: "Asset Inventory",
    label: "Asset Inventory",
    icon: "lsicon:inventory-filled",
    to: "/asset-inventory",
    active: false,
  },
    {
    name: "Admin",
    label: "Admin",
    icon: "dashicons:admin-users",
    to: "/users/admin",
    active: false,
    roles: ["ADMIN"],
  },
];

