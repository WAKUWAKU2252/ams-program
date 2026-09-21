<script setup lang="ts">
// เปลือกของหน้า /login — แผงซ้ายเป็นภาพแบรนด์ แผงขวาเป็นฟอร์ม (router-view)
import { Icon } from '@iconify/vue'
import { useUiStore } from '@/shared/stores/ui'
// ★ เป็น .jpg ไม่ใช่ .png โดยตั้งใจ - เป็นภาพถ่าย (ท้องฟ้า+ตึก) ไม่มีส่วนโปร่งใส
//   ของเดิมเป็น PNG 3375x3375 = 4.3 MB ซึ่งใหญ่กว่า bundle ทั้งแอปหลายเท่า
//   ย่อเหลือ 1600px + JPEG q85 = 184 KB (ลด 96%) โดยตาแยกไม่ออกที่ขนาดแสดงจริง
//   ★ 1600 มาจากการวัด ไม่ใช่เดา: แผงซ้ายกว้าง 726px ที่ viewport 1280 → ราว 1100px
//     ที่ 1920 คูณ ken-burns ที่ซูมถึง 1.14 เท่า คูณ DPR 1.25 = 1568
//   ★ ถ้าจะเปลี่ยนรูป อย่าเซฟกลับเป็น PNG - รูปถ่ายใน PNG ที่ขนาดเดียวกันคือ 1.4 MB
import login from '@/assets/login.jpg'

const uiStore = useUiStore()

// ข้อความบนแผงซ้าย — บอกว่า "ระบบนี้ทำอะไรได้" ให้คนที่เพิ่งได้รับบัญชีมาวันแรก
// ★ ทั้งสามข้อต้องเป็นของที่ระบบทำได้จริงเท่านั้น หน้า login เป็นที่แรกที่ผู้ใช้เห็น
//   การโฆษณาฟีเจอร์ที่ยังไม่มีคือการสร้างคำถามให้ IT ตอบ
const highlights = [
  { icon: 'lucide:qr-code', text: 'สแกน QR ดูข้อมูลสินทรัพย์ได้ทันที' },
  { icon: 'lucide:database', text: 'ข้อมูลตรงจาก SAP Business One' },
  { icon: 'lucide:line-chart', text: 'ติดตามมูลค่าและค่าเสื่อมรายสินทรัพย์' },
]
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-base-200 p-4 sm:p-10">
    <!-- แสงพื้นหลังจาง ๆ หลังการ์ด — กันไม่ให้ขอบนอกเป็นเทาเรียบทื่อ
         ★ pointer-events-none จำเป็น: มันคลุมพื้นที่กว้างกว่าการ์ด ถ้าไม่ปิดจะไปกินคลิก
           ของอะไรก็ตามที่วางทับทีหลัง -->
    <div class="pointer-events-none absolute -left-40 -top-40 size-150 rounded-full blur-3xl bg-accent/20  animate-ambient"
      aria-hidden="true"></div>
    <div class="pointer-events-none absolute -bottom-48 -right-32 size-[30rem] rounded-full bg-primary/20 blur-3xl animate-float-reverse"
      aria-hidden="true"></div>

    <div class="relative card min-h-[calc(100vh-2rem)] bg-base-100 shadow-xl sm:min-h-[calc(100vh-5rem)]">
      <div class="grid flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-10">
        <!-- Left - hero แบรนด์
             รูปเต็มแผงซ้ายชนขอบ ไม่มีกรอบสีคั่น

             ★ ไม่ใช้ .hero/.hero-content แล้ว - hero-content มี padding 1rem กับ
               max-width 80rem ในตัว รูปจึงลอยอยู่กลางแผงโดยมีขอบ base-200 ล้อมเสมอ
               ซึ่งตรงข้ามกับที่ต้องการ

             ★ overflow-hidden ต้องมาคู่กับ rounded-box - รูปเป็นสี่เหลี่ยมมุมฉาก
               ถ้าไม่ตัด มุมจะทะลุออกนอกโค้งของการ์ด เห็นเป็นเดือยแหลมสี่มุม

             ★ absolute inset-0 ไม่ใช่ h-full เฉย ๆ - ความสูงของช่องนี้มาจาก grid stretch
               ซึ่ง h-full ของ <img> จะอ่านได้บ้างไม่ได้บ้างแล้วแต่เบราว์เซอร์คำนวณ
               ทางนี้ผูกกับกล่องตรง ๆ ไม่ต้องลุ้น

             ★ เดิมแผงนี้ hidden บนจอเล็กทั้งแผง = มือถือเห็นฟอร์มลอยบนพื้นขาวเปล่า ๆ
               ไม่มีอะไรบอกว่านี่คือระบบของใคร ตอนนี้เป็นสัดส่วน 4:3 เต็มความกว้างบนมือถือ
               (aspect-[4/3]) แล้วยุบเป็นแถบเตี้ยตั้งแต่ sm ขึ้นไป แทนการซ่อน
               ใช้ element เดียวกันทั้งสองขนาด ไม่ต้องมีสำเนา markup ที่ drift กันทีหลัง -->
        <div class="relative aspect-[4/3] overflow-hidden rounded-box bg-base-200 sm:aspect-auto sm:h-56 lg:col-span-6 lg:h-auto">
          <!-- alt ว่างโดยตั้งใจ - เป็นภาพตกแต่งแบรนด์ ไม่ได้บอกข้อมูลที่จำเป็นต่อการล็อกอิน
               screen reader ควรข้ามไป ไม่ใช่อ่านว่า "Login" ซึ่งไปซ้ำกับปุ่มจริง -->
          <img :src="login" alt="" class="ken-burns absolute inset-0 h-full w-full object-cover" />

          <!-- ★ ม่านไล่สีจำเป็น ไม่ใช่ของประดับ - ครึ่งล่างของรูปเป็นผนังตึกสีขาว
               ตัวหนังสือขาวทับลงไปตรง ๆ อ่านไม่ออก -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" aria-hidden="true">
          </div>

          <!-- ★ text-white ตรง ๆ ไม่ใช่สี semantic ของ daisyUI โดยตั้งใจ - พื้นหลังตรงนี้
               เป็น "รูปถ่าย" ซึ่งไม่เปลี่ยนตามธีม สีตัวอักษรจึงต้องไม่เปลี่ยนตามไปด้วย
               (base-content บนธีมมืดคือสีอ่อน แต่บนธีมสว่างคือสีเข้ม = หายไปกับผนังตึก) -->
          <div class="absolute inset-0 flex flex-col justify-end p-5 text-white sm:p-7 lg:justify-between lg:p-10">
            <div class="rise hidden lg:block" style="--rise-delay: 150ms">

            </div>

            <div class="flex items-end justify-between gap-4">
              <div class="min-w-0">
                <h1 class="rise text-xl font-semibold tracking-tight drop-shadow-lg sm:text-2xl lg:text-4xl"
                  style="--rise-delay: 200ms">
                  Asset Management System
                </h1>
                <p class="rise mt-1 max-w-md text-xs text-white/80 drop-shadow lg:mt-3 lg:text-base"
                  style="--rise-delay: 260ms">
                  UBIS Fixed Asset Lifecycle Management: From Acquisition Throughout its Useful Life
                </p>

                <ul class="mt-3 hidden flex-row gap-5 lg:flex">
                  <li v-for="(item, i) in highlights" :key="item.text"
                    class="rise flex items-center gap-2.5 text-sm text-white/85"
                    :style="{ '--rise-delay': `${320 + i * 70}ms` }">
                    <Icon :icon="item.icon" class="size-5 shrink-0 opacity-80" />
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Right - ฟอร์ม
             ★ relative เพื่อให้ปุ่มสลับธีมเกาะ "แผงฟอร์ม" ไม่ใช่เกาะการ์ด - บนจอเล็ก
               มุมขวาบนของการ์ดคือรูปถ่าย ปุ่มสี base-content จะจมหายไปกับท้องฟ้า -->
        <div class="relative flex items-center justify-center rounded-box p-4 sm:p-8 lg:col-span-4">
          <!-- สลับธีมได้ตั้งแต่ก่อนล็อกอิน - คนที่ตั้งธีมมืดไว้แล้วโดนเด้งออกมาหน้านี้
               ไม่ควรต้องทนจอสว่างจนกว่าจะล็อกอินกลับเข้าไปได้
               ★ ต้องเรียก uiStore.toggleTheme เท่านั้น ห้ามใช้ class theme-controller
                 (ดูเหตุผลที่ TopBar.vue - CSS ล้วนจะข้าม applyTheme แล้วธีมหายตอนรีโหลด) -->
          <button type="button"
            class="btn btn-ghost btn-circle btn-sm absolute right-1 top-1 text-base-content/50 hover:text-base-content sm:right-3 sm:top-3"
            :aria-label="uiStore.isDarkTheme ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด'" @click="uiStore.toggleTheme">
            <Icon :icon="uiStore.isDarkTheme ? 'lucide:sun' : 'lucide:moon'" class="size-4" />
          </button>

          <router-view />
        </div>
      </div>
    </div>
  </div>
</template>
