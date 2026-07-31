export interface MenuItem {
  name: string;
  label: string;
  icon: string;
  active: boolean;
  to: string;
  permission?: string;
}

// ★ to ต้องเป็น absolute path (นำด้วย "/") เสมอ — router-link resolve relative path
// (ไม่มี "/" นำหน้า) เทียบกับ URL ปัจจุบัน ไม่ใช่เทียบจาก root พอ user อยู่ใน route ลูก
// ที่ลึกกว่าปกติ (เช่น /create/:requestId) relative path จะเพี้ยนไปคนละทาง หรือ
// resolve กลับมาเป็น URL เดิม (คลิกแล้วไม่ไปไหนเลย เพราะ Router มองว่าปลายทาง = ที่อยู่ปัจจุบัน)
export const menuItems: MenuItem[] = [
  {
    name: "dashboard",
    label: "Dashboard",
    icon: "fi fi-br-layout-fluid",
    active: true,
    to: "/dashboard",
    permission: "asset-request:view",
  },
  {
    name: "assets",
    label: "Create New Asset",
    icon: "fi fi-br-square-plus",
    active: false,
    to: "/create",
    permission: "asset-request:view",
  },
  {
    name: "Asset Request",
    label: "Asset Requests",
    icon: "fi fi-br-clip-file",
    to: "/assetrequest", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    permission: "asset-request:view",
  },
  {
    name: "Asset Movements",
    label: "Asset Movements",
    icon: "fi fi-bs-exchange",
    to: "/asset-movements", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    permission: "asset-movement:view",
  },
  {
    name: "Audit",
    label: "Audit",
    icon: "fi fi-br-audit",
    to: "/audit", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    permission: "audit:view",
  },
  {
    name: "My Assets",
    label: "My Assets",
    icon: "fi fi-bs-boxes",
    to: "/my-assets", // TODO: ยังไม่มีหน้าเพจจริง
    active: false,
    permission: "my-assets:view",
  },
];

