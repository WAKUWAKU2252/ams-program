<script setup lang="ts">
import DateDisplay from './DateDisplay.vue'
import SyncButton from './SyncButton.vue'
import AppBackButton from '@/shared/components/AppBackButton.vue'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()

// เดินจาก child ขึ้น parent เอา title ที่ลึกสุดที่กำหนดไว้ (/create/:id ได้ title จาก parent 'create')
const title = computed(
  () => (([...route.matched].reverse().find((r) => r.meta.title)?.meta.title) as string) ?? ''
)

/**
 * ที่ให้ปุ่มย้อนกลับไปเมื่อไม่มีประวัติให้ถอย (เปิดลิงก์ตรง ๆ / กด F5 ค้างหน้านั้น)
 *
 * ไต่จาก route ปัจจุบันขึ้นไปหา "หน้าแม่ที่เปิดได้จริง" แทนการตรึงเป็น /dashboard เสมอ -
 * คนที่อยู่ /create/:requestId ควรกลับไปที่ /create ไม่ใช่ถูกดีดไปไกลกว่าที่ตั้งใจหนึ่งชั้น
 *
 * ★ ตัด path ที่มี ':' ทิ้ง (เปิดไม่ได้ถ้าไม่มีพารามิเตอร์) และตัด '/' ซึ่งเป็นเปลือก
 *   MainLayout ที่ redirect ไป /dashboard อยู่แล้ว
 */
const backFallback = computed(() => {
  const parents = [...route.matched].slice(0, -1).reverse()
  return parents.find((r) => r.path !== '/' && !r.path.includes(':'))?.path || '/dashboard'
})
</script>

<template>
  <header class="bg-base-200 pt-1">
    <div class="navbar min-h-[70px] rounded-t-box bg-base-100 px-4 sm:px-6">
      <div class="navbar-start gap-2">
        <!-- จอ lg ขึ้นไป drawer เปิดค้าง ไม่ต้องมีปุ่ม -->
        <label for="ams-drawer" class="btn btn-ghost btn-square drawer-button lg:hidden" aria-label="เปิด/ปิดเมนูหลัก">
          <Icon icon="lucide:menu" class="text-xl" />
        </label>
        
        <!-- ปุ่มย้อนกลับอยู่ที่นี่ที่เดียว ไม่ใช่ไปวางหน้าหัวข้อของแต่ละหน้า - title ของหน้า
             ถูกเขียนไว้ตรงนี้อยู่แล้ว (มาจาก meta.title ของ route) ปุ่มจึงควรอยู่คู่กับมัน
             และได้ทุกหน้าในคราวเดียวโดยไม่ต้องไล่แก้ทีละหน้า -->
        <AppBackButton :fallback="backFallback" />
        <div class="divider divider-horizontal mx-0 hidden lg:flex"></div>
        <span class="text-sm text-base-content/70">{{ title }}</span>
      </div>

      <!-- ★ ปุ่ม sync อยู่ที่นี่จึงโผล่ "ทุกหน้าที่ล็อกอิน" ไม่ใช่แค่หน้าลงทะเบียนสินทรัพย์
           ตั้งใจแบบนั้น: ทุกคนกดได้ และคนที่อยากรู้ว่าข้อมูลสดแค่ไหนไม่ควรต้องเดินไปหน้าใดหน้าหนึ่งก่อน
           (AuthLayout/BlankLayout ไม่มี TopBar อยู่แล้ว หน้า login กับปลายทาง QR จึงไม่มีปุ่มนี้
            ซึ่งถูกต้อง - สองที่นั้นเปิดได้โดยไม่ต้องล็อกอิน) -->
      <div class="navbar-end gap-1">
        <SyncButton />
        <!-- ★ ซ่อนวันที่/เวลาบนมือถือ - navbar กว้าง 390px ต้องแบ่งให้ปุ่มเมนู ปุ่มย้อนกลับ
             ชื่อหน้า และปุ่ม sync ก่อน วันที่เวลาเป็นของที่มือถือมีอยู่บนแถบสถานะของเครื่อง
             อยู่แล้ว จึงเป็นตัวแรกที่ควรตัดเมื่อที่ไม่พอ (sm ขึ้นไปยังเหมือนเดิมทุกอย่าง)

             ★ ต้อง "ห่อ" ไม่ใช่ส่ง class="hidden sm:block" เข้าไปที่ตัว component
               root ของ DateDisplay เป็น <span class="inline-flex ..."> ของตัวเอง class ที่
               ส่งเข้าไปจะไปรวมอยู่บน element เดียวกัน กลายเป็นมีทั้ง inline-flex และ hidden
               ซึ่งเป็น utility ระดับ display เหมือนกัน specificity เท่ากัน แล้วลำดับใน CSS
               ที่ Tailwind สร้างเป็นตัวตัดสิน - วัดจริงที่ 390px ได้ display: inline-flex
               คือ hidden แพ้ วันที่เลยยังโชว์อยู่ (บั๊กที่รายงานมารอบนี้)
               ห่อด้วย <div> ทำให้เป็นคนละ element กัน ไม่ต้องลุ้นลำดับอีก -->
        <div class="hidden sm:block">
          <DateDisplay
            locale="en"
            variant="short"
            :show-time="true"
            :live-time="true"
            class="text-sm text-base-content/70"
          />
        </div>
      </div>
    </div>
  </header>
</template>
