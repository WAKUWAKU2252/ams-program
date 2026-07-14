# CLAUDE.md

> ไฟล์นี้ให้ Claude Code อ่านเพื่อทำความเข้าใจและพัฒนา Frontend ของโปรเจกต์ AMS ได้ทันที
> อัปเดตไฟล์นี้ทุกครั้งที่มีการเปลี่ยนแปลงสำคัญของโครงสร้าง, API, component หรือ business rule

---

## 1. Project Overview

**ชื่อโปรเจกต์:** Asset Management System Frontend (AMS Frontend)

ระบบนี้เป็น Frontend สำหรับจัดการสินทรัพย์ขององค์กร โดยพัฒนาด้วย Vue.js เพื่อให้พนักงาน ผู้จัดการ และฝ่ายบัญชีสามารถติดตามข้อมูลสินทรัพย์ได้จากศูนย์กลางเดียว

ปัญหาหลักของระบบเดิมคือ พนักงานไม่สามารถตรวจสอบสินทรัพย์ที่อยู่ในความรับผิดชอบของตนได้ง่าย การตรวจสอบสินทรัพย์สำหรับ Audit ใช้เวลานาน ข้อมูลตำแหน่งและสถานะสินทรัพย์ไม่เป็นปัจจุบัน และแต่ละหน่วยงานไม่สามารถตรวจสอบมูลค่าคงเหลือของสินทรัพย์ได้ด้วยตนเอง

AMS จึงถูกออกแบบเพื่อเป็น Single Source of Truth สำหรับข้อมูลสินทรัพย์ โดยรองรับการสร้างคำขอขึ้นทะเบียนสินทรัพย์ การอนุมัติ การย้ายสินทรัพย์ การตรวจสอบ Audit และการดูสินทรัพย์ของพนักงานแต่ละคน

### ผู้ใช้งานหลัก

* Employee / User
* Manager
* Finance
* Admin
* Super Admin

### สถานะปัจจุบัน

`In Development`

---

## 2. Main Modules

Frontend ต้องรองรับหน้าจอและ workflow หลักดังนี้

### 2.1 Create New Asset

หน้าสำหรับ Warehouse หรือผู้เกี่ยวข้องสร้างคำขอลงทะเบียนสินทรัพย์ โดยมี flow ดังนี้

1. ค้นหา Purchase Order
2. เลือก PO Number
3. แสดง PO Line ที่มี GRPO แล้ว
4. เลือก PO Line ที่ต้องการลงทะเบียน
5. กรอกข้อมูลสินทรัพย์
6. แนบ Invoice และรูปสินค้า
7. ส่งคำขอให้ Manager ตรวจสอบ

ข้อมูลสำคัญที่ต้องแสดงในหน้าจอ ได้แก่

* PO Number
* Vendor Name
* PO Date
* PO Line
* Item Description
* Quantity
* Quantity ที่ใช้ลงทะเบียนไปแล้ว
* Quantity ที่ยังสามารถลงทะเบียนได้
* GRPO Number
* Invoice Attachment
* Asset Image

### 2.2 Dashboard

หน้าสรุปข้อมูลสินทรัพย์ โดยข้อมูลที่แสดงต้องเปลี่ยนตาม Permission ของผู้ใช้

ตัวอย่างข้อมูลที่อาจแสดง

* จำนวนสินทรัพย์ทั้งหมด
* มูลค่ารวมของสินทรัพย์
* มูลค่าคงเหลือ
* สินทรัพย์ตามสถานะ
* สินทรัพย์ตาม Location
* สินทรัพย์ที่กำลังรออนุมัติ
* สินทรัพย์ที่ใกล้หมดประกัน

### 2.3 Asset Request

หน้ารวมคำขอของระบบ เช่น

* คำขอลงทะเบียน Asset
* คำขอย้าย Asset


### 2.4 Asset Movement

หน้าสำหรับสร้างและติดตามคำขอย้ายสินทรัพย์

ข้อมูลหลัก

* Asset Number
* Asset Name
* Current Location
* Destination Location
* Request Date
* Requester
* Approver
* Movement Status
* Transfer History

### 2.5 Audit

หน้าสำหรับฝ่ายบัญชีหรือ Auditor ตรวจสอบสินทรัพย์

Flow หลัก

1. ระบบสุ่มรายการสินทรัพย์ตามจำนวนที่กำหนด
2. Auditor Scan QR Code
3. ระบบแสดงข้อมูลสินทรัพย์
4. Auditor ตรวจสอบสถานะและตำแหน่ง
5. กด Confirm Audit
6. ระบบอัปเดตวันที่ตรวจสอบล่าสุด

### 2.6 My Asset

หน้าสำหรับพนักงานดูสินทรัพย์ที่อยู่ในความรับผิดชอบของตนเอง

ข้อมูลหลัก

* Asset Number
* Asset Name
* Category
* Serial Number
* Current Location
* Status
* Warranty Date
* Last Audit Date

---

## 3. Tech Stack

### Framework และ Language

* Vue.js 3
* Vite
* TypeScript

### Styling

* Tailwind CSS v4
* Global CSS Variables
* Kanit / Be Vietnam Pro สำหรับ font

### State Management

* Pinia

### Routing

* Vue Router

### HTTP Client

* Fetch API หรือ Axios ผ่าน service layer เท่านั้น

### UI / Design

* Figma
* Flaticon UIcons
* PrimeIcons

### Development Tools

* npm
* Git
* GitHub
* Visual Studio Code

---

## 4. Repository Structure

```text
ams-frontend/
├── public/                         # Static files เช่น favicon และรูปภาพทั่วไป
├── src/
│   ├── assets/                     # รูปภาพ, fonts และ static files ที่ import ใน Vue
│   ├── components/
│   │   ├── common/                 # Component ใช้งานร่วมกัน
│   │   ├── layout/                 # Sidebar, Topbar และ layout components
│   │   │   ├── Sidebar.vue
│   │   │   ├── Topbar.vue
│   │   ├── asset/                  # Components เกี่ยวกับ Asset
│   │   └── purchase-order/         # Components เกี่ยวกับ PO
│   ├── config/
│   │   └── sidebar-menu.ts         # Sidebar menu configuration
│   ├── layouts/
│   │   └── MainLayout.vue
│   ├── router/
│   │   └── index.ts
│   ├── services/
│   │   ├── apiClient.ts             # HTTP client และ base URL
│   │   ├── purchaseOrderApi.ts      # API สำหรับ PO และ PO Line
│   │   ├── assetApi.ts              # API สำหรับ Asset
│   │   ├── assetRequestApi.ts       # API สำหรับ Asset Request
│   │   ├── movementApi.ts           # API สำหรับ Asset Movement
│   │   └── auditApi.ts              # API สำหรับ Audit
│   ├── stores/
│   │   ├── ui.ts                    # Sidebar, profile menu และ UI state
│   │   ├── asset.ts                 # Asset state
│   │   ├── purchaseOrder.ts         # PO state
│   │   └── auth.ts                  # Login user และ permission state
│   ├── styles/
│   │   ├── main.css
│   │   └── variables.css
│   ├── types/
│   │   ├── asset.ts
│   │   ├── purchaseOrder.ts
│   │   ├── assetRequest.ts
│   │   ├── movement.ts
│   │   ├── audit.ts
│   │   └── user.ts
│   ├── views/
│   │   ├── dashboard/
│   │   │   └── DashboardView.vue
│   │   ├── assets/
│   │   │   ├── AssetListView.vue
│   │   │   ├── AssetDetailView.vue
│   │   │   └── CreateAssetView.vue
│   │   ├── purchase-order/
│   │   │   └── PurchaseOrderView.vue
│   │   ├── requests/
│   │   │   └── AssetRequestView.vue
│   │   ├── movement/
│   │   │   └── AssetMovementView.vue
│   │   ├── audit/
│   │   │   └── AuditView.vue
│   │   ├── my-assets/
│   │   │   └── MyAssetView.vue
│   │   └── settings/
│   │       └── SettingsView.vue
│   ├── App.vue
│   └── main.ts
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 5. Environment Variables

```bash
VITE_API_BASE_URL=http://localhost:3000/api
```

ห้าม hardcode URL ของ Backend ภายใน Vue component หรือ service อื่น ๆ ให้ใช้ `VITE_API_BASE_URL` ผ่าน `apiClient.ts` เท่านั้น

---

## 6. Current State

### เสร็จแล้ว

* สร้าง Vue 3 + Vite + TypeScript Frontend
* ติดตั้งและตั้งค่า Tailwind CSS v4
* สร้าง Main Layout
* สร้าง Sidebar และ Topbar
* ตั้งค่า Vue Router
* ตั้งค่า Pinia สำหรับ UI State
* สร้างหน้าและ Component สำหรับ Search PO
* สร้าง Mock Data สำหรับ Purchase Order และ PO Line
* สร้าง service สำหรับ Purchase Order เบื้องต้น

### กำลังทำ

* เชื่อม Frontend Search PO กับ NestJS API
* แสดง PO Line หลังจากเลือก PO Number
* สร้างหน้า Create New Asset
* สร้าง Asset Registration Form
* เพิ่ม validation จำนวน Asset ตาม GRPO Quantity
* เพิ่ม upload Invoice และ Asset Image
* สร้าง Pinia Store สำหรับ Purchase Order และ Asset

### TODO ถัดไป

* สร้าง Login Page
* สร้าง Auth Store
* สร้าง Route Guard
* สร้าง Role-Based UI
* สร้าง Asset Request Page
* สร้าง Asset Movement Page
* สร้าง Audit Page และ QR Scanner
* สร้าง My Asset Page
* สร้าง Dashboard ตาม Permission
* สร้าง Notification Center
* เพิ่ม Loading State, Empty State และ Error State ทุก API Page
* เพิ่ม Unit Test สำหรับ Components และ Stores

---

## 7. Purchase Order Flow

Flow ของหน้า Create New Asset ต้องเป็นดังนี้

```text
User เปิดหน้า Create New Asset
        ↓
ค้นหา PO Number
        ↓
เลือก Purchase Order
        ↓
เรียก API เพื่อดึง PO Line
        ↓
แสดงเฉพาะ PO Line ที่มี GRPO แล้ว
        ↓
User เลือก PO Line
        ↓
แสดงจำนวนที่สามารถสร้าง Asset ได้
        ↓
User กรอก Asset Form
        ↓
Upload Invoice และ Asset Image
        ↓
Submit Asset Request
```

### Business Rules

* PO ที่ค้นหาได้ต้องรองรับการค้นหาด้วย PO Number 
* PO Line ที่ไม่มี GRPO ต้องไม่แสดง Asset 
* จำนวน Asset ที่สร้างต้องไม่เกิน Quantity ที่รับผ่าน GRPO
* หาก PO Line ถูกลงทะเบียนครบแล้ว ต้องแสดงสถานะ `DONE` ให้ PO
* รูปสินค้าอัปโหลดหนึ่งครั้งต่อ PO Line หรือต่อ asset ได้
* Invoice สามารถแนบในระดับ Asset Request 
* Parent Component เป็นผู้จัดการ state ของ PO ที่ถูกเลือก

---

## 8. TypeScript Conventions

### Naming

* Variables และ functions ใช้ `camelCase`
* Classes, interfaces, types และ Vue components ใช้ `PascalCase`
* Constants ใช้ `SCREAMING_SNAKE_CASE`
* Vue component ใช้ชื่อไฟล์แบบ `PascalCase.vue`

ตัวอย่าง

```ts
const selectedPurchaseOrder = ref<PurchaseOrder | null>(null)

function handleSelectPurchaseOrder(po: PurchaseOrder): void {
  selectedPurchaseOrder.value = po
}
```

### Type Rules

* ห้ามใช้ `any`
* หากยังไม่ทราบชนิดข้อมูล ให้ใช้ `unknown`
* ต้องตรวจสอบ `unknown` ก่อนนำไปใช้
* API response ต้องมี interface หรือ type รองรับเสมอ
* Props และ emits ต้องกำหนด type ทุกครั้ง

ตัวอย่าง

```ts
interface Props {
  selectedPO: PurchaseOrder | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [purchaseOrder: PurchaseOrder]
}>()
```

---

## 9. Vue Component Rules

ทุก Vue component ต้องใช้รูปแบบนี้

```vue
<script setup lang="ts">
</script>

<template>
</template>

<style scoped>
</style>
```

### Props

ใช้ `defineProps<Type>()`

```ts
const props = defineProps<{
  title: string
  disabled?: boolean
}>()
```

### Events

ใช้ `defineEmits<Type>()`

```ts
const emit = defineEmits<{
  submit: []
  cancel: []
}>()
```

### Component Responsibilities

* Component ขนาดเล็กควรทำหน้าที่เดียว
* Page View เป็นผู้จัดการ API call และ page-level state
* Reusable component ไม่ควรเรียก API โดยตรง หากสามารถรับข้อมูลผ่าน props ได้
* Component ลูกต้อง emit event กลับไปยัง parent แทนการแก้ state ของ parent โดยตรง
* หลีกเลี่ยงการส่ง props หลายระดับ หาก state นั้นใช้ร่วมกันหลายหน้า ให้ใช้ Pinia Store

---

## 10. API Service Rules

ห้ามเรียก `fetch()` หรือ `axios` โดยตรงใน Vue component

ให้เรียกผ่านไฟล์ใน `src/services/` เท่านั้น

ตัวอย่างโครงสร้าง

```ts
// src/services/purchaseOrderApi.ts

import { apiClient } from '@/services/apiClient'
import type { PurchaseOrder, PurchaseOrderLine } from '@/types/purchaseOrder'

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  return apiClient.get<PurchaseOrder[]>('/purchase-orders')
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder> {
  return apiClient.get<PurchaseOrder>(`/purchase-orders/${id}`)
}

export async function getPurchaseOrderLines(
  purchaseOrderId: string,
): Promise<PurchaseOrderLine[]> {
  return apiClient.get<PurchaseOrderLine[]>(
    `/purchase-orders/${purchaseOrderId}/lines`,
  )
}
```

### API States

ทุกหน้าที่เรียก API ต้องมี state อย่างน้อยดังนี้

```ts
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
```

เมื่อ API error ต้องแสดงข้อความที่ผู้ใช้เข้าใจได้ ไม่แสดง raw error จาก Backend โดยตรง

---

## 11. Pinia Store Rules

ใช้ Pinia สำหรับ state ที่ต้องใช้ร่วมกันหลาย component หรือหลายหน้า

ตัวอย่าง state ที่ควรอยู่ใน Store

* ข้อมูลผู้ใช้ที่ Login
* Permission ของผู้ใช้
* Sidebar collapsed state
* Profile menu state
* Selected Purchase Order ที่ใช้ข้ามหลาย component
* Asset list ที่ใช้หลายหน้า
* Notification count

ไม่ควรใช้ Pinia สำหรับ state ที่ใช้เฉพาะ component เดียว เช่น

* Input value ของ form field เดียว
* Modal ที่ใช้เฉพาะใน component เดียว
* Dropdown ที่ไม่เกี่ยวข้องกับ component อื่น

---

## 12. UI Rules

* ใช้ Tailwind CSS เป็นหลัก
* ใช้ CSS variables สำหรับสีหลักของระบบ
* รองรับ Responsive Design อย่างน้อย Desktop และ Tablet
* Form ทุกตัวต้องมี label
* Input ที่ required ต้องแสดง required indicator
* Button ที่กำลัง submit ต้อง disabled
* ต้องมี loading state ระหว่างเรียก API
* ต้องมี empty state เมื่อไม่มีข้อมูล
* ต้องมี error state เมื่อโหลดข้อมูลไม่สำเร็จ
* หลีกเลี่ยงการใช้ inline style
* หลีกเลี่ยงการเขียน CSS ซ้ำ หากสามารถสร้าง reusable component ได้

---

## 13. Routing Rules

ทุกหน้าในระบบต้องอยู่ภายใต้ `MainLayout` ยกเว้นหน้า Login

ตัวอย่าง route

```text
/login
/dashboard
/assets
/assets/create
/assets/:id
/purchase-orders
/requests
/movements
/audit
/my-assets
/settings
```

เมื่อเพิ่ม route ใหม่ ต้องเพิ่ม menu configuration ใน `src/config/sidebar-menu.ts` หากหน้านั้นควรแสดงใน Sidebar

---

## 14. Useful Links

* Figma Design: https://www.figma.com/design/38FpS2qlL0ZD0wmNJBCB1d/Asset-management-system?node-id=0-1&p=f&t=ATlrxniOJyNOmFyK-0
* Presentation: https://docs.google.com/document/d/1iaxDLqOBsJ6mnEPinhBi08VPWV6J-4V9KdgmGP-glhM/edit?tab=t.jw93aumzqhqe

## 15. Improvement Guidelines

Claude Code สามารถเสนอแนวทางปรับปรุง Frontend ได้ หากพบว่าโค้ด โครงสร้าง หรือ UX ปัจจุบันมีจุดที่ควรพัฒนา โดยต้องปฏิบัติตามกฎต่อไปนี้

### หลักการปรับปรุง

* สามารถ refactor code เพื่อให้อ่านง่าย ดูแลรักษาง่าย และลด code ซ้ำได้
* สามารถเสนอ reusable component ใหม่ได้ หากพบ UI หรือ logic ที่ถูกใช้งานซ้ำ
* สามารถเสนอ Pinia Store ใหม่ได้ หาก state ถูกส่งผ่าน props หลายระดับ หรือถูกใช้งานหลายหน้า
* สามารถเสนอ TypeScript type หรือ interface เพิ่มเติมได้ หากช่วยลด type error และทำให้ API contract ชัดเจนขึ้น
* สามารถเสนอ composable ใน `src/composables/` ได้ สำหรับ logic ที่ใช้ซ้ำ เช่น pagination, debounce search, file upload หรือ API loading state
* สามารถเสนอการปรับ UX เช่น loading state, empty state, error state, confirmation modal, validation message และ responsive layout ได้
* สามารถเสนอการแยก component หาก component หนึ่งมีหน้าที่มากเกินไป หรือมีโค้ดยาวเกินความจำเป็น
* สามารถเสนอการปรับ API service layer เพื่อให้จัดการ error, authorization header และ response format ได้มาตรฐานมากขึ้น
* สามารถเสนอ route guard และ permission guard ได้ เมื่อเริ่มทำระบบ authentication และ role-based access control
* สามารถเสนอ test สำหรับ component, store และ service ที่มี business rule สำคัญได้

### ข้อจำกัดในการ Improve

* ห้ามเปลี่ยน business rule ของระบบโดยไม่ได้อธิบายผลกระทบ
* ห้ามเปลี่ยนชื่อ field ของ API, TypeScript type หรือ component ที่มีการใช้งานอยู่แล้ว โดยไม่ตรวจสอบจุดที่เกี่ยวข้องทั้งหมด
* ห้ามลบ component, route, service หรือ store ที่มีอยู่โดยไม่ตรวจสอบการใช้งานก่อน
* ห้ามเพิ่ม library ใหม่โดยไม่แจ้งชื่อ library, เหตุผล และผลกระทบต่อ bundle size หรือ project structure
* ห้ามใช้ `any`
* ห้ามเรียก API โดยตรงใน Vue component
* ห้ามย้าย logic สำคัญไปไว้ใน component หาก logic นั้นควรอยู่ใน service, store หรือ composable
* ห้ามแก้ UI ที่มีอยู่จนต่างจาก Figma อย่างมีนัยสำคัญ หากไม่ได้รับคำสั่งให้ redesign
* ห้าม hardcode API URL, user role, permission หรือ mock data ภายใน component
* ห้ามเปลี่ยน state management จาก Pinia ไปใช้ library อื่นโดยไม่ได้รับอนุมัติ

### รูปแบบการเสนอ Improvement

ก่อนแก้ไขโค้ดที่มีผลกระทบหลายไฟล์ ให้สรุปสั้น ๆ ดังนี้

1. ปัญหาที่พบ
2. แนวทางแก้ไข
3. ไฟล์ที่ได้รับผลกระทบ
4. ความเสี่ยงหรือผลกระทบที่อาจเกิดขึ้น
5. เหตุผลที่แนวทางนี้เหมาะกับโครงสร้าง AMS ปัจจุบัน

หากเป็นการปรับปรุงเล็กน้อย เช่น แก้ type, เพิ่ม loading state, แก้ naming หรือแยก function ภายในไฟล์เดียว สามารถแก้ไขได้ทันทีพร้อมอธิบายสิ่งที่เปลี่ยนแปลง

### Priority สำหรับการ Improve

ให้เรียงลำดับความสำคัญของการปรับปรุงดังนี้

1. ความถูกต้องของ business rule และข้อมูล
2. Type safety และการลด TypeScript error
3. การจัดการ API error และ loading state
4. ความปลอดภัย เช่น authentication และ permission
5. การลด code ซ้ำ
6. ความสามารถในการดูแลรักษา codebase
7. UX และ responsive design
8. Performance เช่น debounce search, pagination, lazy loading และ component optimization

### ตัวอย่าง Improvement ที่สามารถทำได้

* เปลี่ยน Search PO ให้ใช้ debounce ก่อนเรียก API
* เพิ่ม pagination สำหรับหน้า Asset List
* แยก API loading และ error logic เป็น composable
* สร้าง `BaseTable`, `BaseModal`, `BaseButton` และ `BasePagination`
* เพิ่ม `AssetStatusBadge` เพื่อรวม logic สีของสถานะ Asset
* เพิ่ม validation ก่อน submit Asset Registration Form
* เพิ่ม confirmation modal ก่อน approve หรือ reject request
* เพิ่ม route guard สำหรับหน้า Manager, Finance และ Admin
* เพิ่ม permission-based sidebar menu
* เพิ่ม empty state เมื่อไม่พบ Purchase Order
* เพิ่ม skeleton loading ระหว่างโหลดข้อมูล PO หรือ Asset
* เพิ่ม file validation สำหรับ Invoice และ Asset Image
* เพิ่ม unit test สำหรับ validation จำนวน Asset ตาม GRPO Quantity

