<script setup lang="ts">
import DateDisplay from './DateDisplay.vue'
import SyncButton from './SyncButton.vue'
import AutoSyncToggle from './AutoSyncToggle.vue'
import { Icon } from '@iconify/vue'
import NotificationBell from './NotificationBell.vue'
import ProfileMenu from './ProfileMenu.vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/shared/stores/ui'
import { getTokenRole } from '@/shared/services/auth.token'
import { onlyPathForRole } from '@/shared/utils/role-scope'

const route = useRoute()

// ★ ไม่อ่าน isDarkTheme ที่นี่แล้ว - ปุ่มสลับธีมบน Topbar ถูกถอดออก (2026-09-21)
//   เหลือที่เดียวคือแถวในกล่องโปรไฟล์ ซึ่งอ่านจาก store ตัวเดียวกันนี้เอง
const uiStore = useUiStore()
const { isSidebarCollapsed } = storeToRefs(uiStore)

const canSync = computed(() => onlyPathForRole(getTokenRole()) === null)
// สวิตช์ sync อัตโนมัติ - แค่ซ่อนปุ่ม ตัวบังคับจริงคือ requireRole('ADMIN') ของ PUT /sync/schedule
const isAdmin = computed(() => getTokenRole() === 'ADMIN')

// เดินจาก child ขึ้น parent เอา title ที่ลึกสุดที่กำหนดไว้ (/create/:id ได้ title จาก parent 'create')
const title = computed(
  () => (([...route.matched].reverse().find((r) => r.meta.title)?.meta.title) as string) ?? ''
)
</script>

<template>
  <header class="bg-base-200 pt-1">
    <!-- ★ **ห้ามกลับไปใช้ navbar-start / navbar-end ของ daisyUI ที่นี่**
         สองคลาสนั้นคือ `width: 50%` ตายตัว ไม่ใช่ "ชิดซ้าย/ชิดขวา" อย่างที่ชื่อชวนให้คิด
         ฝั่งซ้ายมีแค่ปุ่มเมนูกับชื่อหน้า (สั้นเสมอ) แต่จองไปครึ่งจอ ส่วนฝั่งขวาที่มีของ
         จริงสี่ก้อน (ข้อความ sync / dropdown บริษัท / ปุ่ม Sync / วันที่เวลา) ถูกบีบให้อยู่
         ในอีกครึ่ง แล้วปุ่มสลับธีมที่เป็นลูกตัวที่สามยังไปกินจากโควตานั้นอีก - รวมแล้วเกิน
         100% flex จึงหดทุกก้อนจนข้อความตัดบรรทัดกลางคำ (วัดที่ 1024px = iPad แนวนอน
         ซึ่งเป็นจอที่บีบสุด: drawer เปิดค้างกินไป 256px แต่ยังไม่กว้างพอให้ครึ่งจอพอดี)
         flex ธรรมดาให้ผลที่ถูกกว่า: ซ้าย flex-1 ยืดกินที่ว่างและหดได้ ขวา shrink-0 ได้ที่
         เท่าที่ของมันต้องการจริง ที่เหลือเป็นช่องว่างตรงกลาง ไม่ใช่แรงบีบ -->
    <div class="navbar min-h-[70px] gap-3 rounded-t-box bg-base-100 px-4 sm:px-6">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <!-- ── สองปุ่มนี้ทำงานคนละ breakpoint และคนละกลไก ห้ามยุบเป็นปุ่มเดียว ──────────
             จอเล็ก: <label> ที่ชี้ไป checkbox ของ daisyUI ตรง ๆ - drawer เลื่อนเข้าออกด้วย
                     CSS ล้วน ไม่ต้องมี JS มาเกี่ยว
             จอ lg: checkbox ไม่มีผล เพราะ lg:drawer-open ตรึง sidebar ไว้ ต้องสลับ
                    isSidebarCollapsed แทน (ดู MainLayout / stores/ui.ts)
             ปุ่มเดียวที่ทำทั้งสองอย่างต้องรู้ว่าตอนนี้จออยู่ breakpoint ไหน = ต้องอ่าน
             matchMedia มาไว้ใน JS ซึ่งเป็นการเอา CSS breakpoint มาเขียนซ้ำอีกที่ -->
        <label for="ams-drawer" class="btn btn-ghost btn-square drawer-button lg:hidden" aria-label="เปิด/ปิดเมนูหลัก">
          <Icon icon="lucide:menu" class="text-xl" />
        </label>

        <!-- ★ อยู่ตำแหน่งเดียวกับ hamburger ของจอเล็กเป๊ะ - สองปุ่มนี้
             ไม่มีทางโผล่พร้อมกัน คนใช้จึงเห็นเป็น "ปุ่มเมนูปุ่มเดียวที่มุมซ้ายบน" ที่อยู่
             ที่เดิมทุก breakpoint ไม่ใช่ปุ่มที่ย้ายที่ไปมาเมื่อเปลี่ยนขนาดจอ
             ★ ค้างอยู่ตลอดไม่ใช่โผล่เฉพาะตอนพับ - ปุ่มที่หายไปหลังกดคือปุ่มที่กดกลับไม่ได้
             จากที่เดิม ผู้ใช้ต้องกวาดหาว่าปุ่มย้ายไปไหน -->
        <button
          type="button"
          class="btn btn-ghost btn-square hidden lg:inline-flex"
          :title="isSidebarCollapsed ? 'แสดงเมนู' : 'ซ่อนเมนู'"
          :aria-label="isSidebarCollapsed ? 'แสดงเมนู' : 'ซ่อนเมนู'"
          :aria-expanded="!isSidebarCollapsed"
          aria-controls="ams-drawer"
          @click="uiStore.toggleSidebarCollapsed"
        >
          <Icon icon="lucide:menu" class="text-xl" />
        </button>

        <!-- ไม่มีปุ่มย้อนกลับที่นี่โดยตั้งใจ - AMS เปิดในเบราว์เซอร์ ไม่ได้ห่อเป็นแอป
             ปุ่ม back ของเบราว์เซอร์ทำหน้าที่นี้อยู่แล้วและเป็นที่แรกที่คนใช้มองหา
             การมีปุ่มซ้ำบนจอมีแต่จะแย่งที่ของ navbar ไปเปล่า ๆ -->
        <div class="divider divider-horizontal mx-0 hidden lg:flex"></div>
        <!-- truncate ไม่ใช่ nowrap - ชื่อหน้ายาว ๆ ต้องยอมถูกตัดท้าย ไม่ใช่ดันฝั่งขวาให้แคบลง -->
        <span class="truncate text-sm text-base-content/70">{{ title }}</span>
      </div>

      <!-- ★ ปุ่ม sync อยู่ที่นี่จึงโผล่ "ทุกหน้าที่ล็อกอิน" ไม่ใช่แค่หน้าลงทะเบียนสินทรัพย์
           ตั้งใจแบบนั้น: ทุกคนกดได้ และคนที่อยากรู้ว่าข้อมูลสดแค่ไหนไม่ควรต้องเดินไปหน้าใดหน้าหนึ่งก่อน
           (AuthLayout/BlankLayout ไม่มี TopBar อยู่แล้ว หน้า login กับปลายทาง QR จึงไม่มีปุ่มนี้
            ซึ่งถูกต้อง - สองที่นั้นเปิดได้โดยไม่ต้องล็อกอิน) -->
      <div class="flex shrink-0 items-center gap-1">
        <SyncButton v-if="canSync" />
        <AutoSyncToggle v-if="isAdmin" />
        <!-- ★ ซ่อนวันที่/เวลาบนมือถือ - navbar กว้าง 390px ต้องแบ่งให้ปุ่มเมนู
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
          <DateDisplay locale="en" variant="short" :show-time="true" :live-time="true"
            class="text-sm text-base-content/70" />
        </div>

        <NotificationBell />

        <!-- ★ ปุ่มสลับธีมเคยอยู่ตรงนี้ - ถอดออกแล้ว (2026-09-21) เหลือทางเดียวคือแถวใน
             กล่องโปรไฟล์ ธีมไม่ใช่ของที่คนสลับวันละหลายรอบ การมีสวิตช์ถาวรบน Topbar
             จึงกินที่ของแถวไอคอนที่ใช้งานจริงทุกวัน (เดิมยังมีสองที่ให้ต้องดูแลให้ตรงกันด้วย)

             ★ ของที่ย้ายมาแทนคือเมนูบัญชี ซึ่งเดิมเป็นแถบเต็มความกว้างท้าย sidebar -
             เหตุผลเต็มอยู่ที่หัวไฟล์ ProfileMenu.vue -->
        <ProfileMenu />
      </div>
    </div>

  </header>
</template>
