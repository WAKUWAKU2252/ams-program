export interface MenuItem {
  name: string;
  label: string;
  icon: string;
  active: boolean;
  to: string;
  permission?: string;
}

export const menuItems: MenuItem[] = [
  {
    name: "dashboard",
    label: "Dashboard",
    icon: "fi fi-br-layout-fluid",
    active: true,
    to: "#",
    permission: "asset-request:view",
  },
  {
    name: "assets",
    label: "Create New Asset",
    icon: "fi fi-br-square-plus",
    active: false,
    to: "/asset",
    permission: "asset-request:view",
  },
  {
    name: "Asset Request",
    label: "Asset Requests",
    icon: "fi fi-br-clip-file",
    to: "/asset-requests",
    active: false,
    permission: "asset-request:view",
  },
  {
    name: "Asset Movements",
    label: "Asset Movements",
    icon: "fi fi-bs-exchange",
    to: "/asset-movements",
    active: false,
    permission: "asset-movement:view",
  },
  {
    name: "Audit",
    label: "Audit",
    icon: "fi fi-br-audit",
    to: "/audit",
    active: false,
    permission: "audit:view",
  },
  {
    name: "My Assets",
    label: "My Assets",
    icon: "fi fi-bs-boxes",
    to: "/my-assets",
    active: false,
    permission: "my-assets:view",
  },
];

