export interface MenuItem {
  name: string;
  label: string;
  icon: string;
  active: boolean;
  to: string;
  permission?: string;
  // จำกัดให้เห็นเฉพาะบาง role — ต้องตรงกับ meta.roles ของ route เดียวกันใน router.ts
  // (ไม่ใส่ = ทุก role เห็น) ซ่อนเมนูเฉย ๆ ไม่ได้กันเข้าหน้า คนละชั้นกับ router guard/backend
  roles?: string[];
}

// ★ to ต้องเป็น absolute path (นำด้วย "/") เสมอ — router-link resolve relative path
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
    name: "Asset Movements",
    label: "Asset Movements",
    icon: "lucide:arrow-left-right",
    to: "/asset-movements", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    permission: "asset-movement:view",
  },
  {
    name: "Audit",
    label: "Audit",
    icon: "lucide:scan-search",
    to: "/audit", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    permission: "audit:view",
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
    // ไม่มี roles — ทุกคนค้นทะเบียนได้ (ตรงกับ route ที่ไม่มี meta.roles และ backend
    // ที่ไม่มี requireRole ที่ GET /assets/inventory)
  },
    {
    name: "Create User",
    label: "Create User",
    icon: "lucide:user-plus",
    to: "/users/create",
    active: false,
    roles: ["ADMIN"],
  },
];

