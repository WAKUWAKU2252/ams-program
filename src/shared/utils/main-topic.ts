interface TopicType {
  value: string
  header: string
  label: string
  icon: string
}

export const MAIN_TOPIC_OPTIONS: TopicType[] = [
  {
    value: 'dashboard', 
    header: 'Dashboard',
    label: 'ภาพรวมทะเบียนสินทรัพย์และมูลค่าทางบัญชี',
    icon: 'lucide:layout-dashboard',
  },
  {
    value: 'create',
    header: 'Create New Asset',
    label: 'รายการคำขอขึ้นทะเบียนของคุณ',
    icon: 'lucide:file-plus-2',
  },
  {
    value: 'asset-request',
    header: 'Asset Requests',
    label: 'ใบที่ได้รับอนุมัติแล้ว รอออกเลขสินทรัพย์',
    icon: 'lucide:clipboard-list',
  },
  {
    value: 'my-change-requests',
    header: 'My Change Requests',
    label: 'คำขอย้ายสถานที่/เปลี่ยนผู้ครอบครองของคุณ',
    icon: 'lucide:file-pen-line',
  },
  {
    value: 'floor-plan',
    header: 'Asset Location Map',
    label: 'แผนผังแสดงตำแหน่งสินทรัพย์',
    icon: 'lucide:map',
  },
  {
    value: 'audit',
    header: 'Audit',
    label: 'รายการตรวจสอบสินทรัพย์',
    icon: 'lucide:scan-search',
  },
  {
    value: 'MyAssets',
    header: 'My Assets',
    label: 'สินทรัพย์ของฉัน',
    icon: 'lucide:boxes',
  },
  {
    value: 'asset-inventory',
    header: 'Asset Inventory',
    label: 'ทะเบียนสินทรัพย์ทั้งหมด ค้นหาและดูรายละเอียดรายชิ้น',
    icon: 'lsicon:inventory-filled',
  },
    {
    value: 'asset-summary',
    header: 'Asset Summary',
    label: 'สรุปสินทรัพย์ตามหมวดหมู่ทางบัญชี',
    icon: 'lucide:table-2',
  },
  {
    value: 'admin',
    header: 'Admin',
    label: 'สร้างบัญชีผู้ใช้และกำหนดสิทธิ์การเข้าใช้ระบบ',
    icon: 'lucide:user-cog',
  }
]

