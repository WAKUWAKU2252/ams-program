<script setup lang="ts">
/**
 * เมนูบัญชีผู้ใช้บน Topbar - ปุ่มเป็น "รูปโปรไฟล์อย่างเดียว"
 *
 * ── ★★ ย้ายมาจากท้าย Sidebar (2026-09-21)
 *
 * ของเดิมเป็นแถบเต็มความกว้างท้าย sidebar (รูป + ชื่อ + อีเมล + ลูกศร) ซึ่งพาปัญหามาด้วย
 * ชุดหนึ่งที่หายไปทั้งหมดเมื่อขึ้นมาอยู่บน Topbar:
 *
 *   - .drawer-side ตั้ง overflow-x: hidden กล่องที่กางในนั้นถูกเฉือนที่ 256px กล่องเดิม
 *     จึงต้อง Teleport ไป body แล้วคำนวณพิกัดเองจาก getBoundingClientRect() ทุกครั้งที่เปิด
 *   - พิกัดที่คำนวณไว้ค้างทันทีที่ sidebar พับ/drawer ปิด ซึ่ง daisyUI ทำด้วย CSS transform
 *     ล้วน ไม่ยิง event ให้ใครเลย ต้องเฝ้า store สองตัวแยกเพื่อสั่งปิดกล่องตาม
 *   - ต้องเช็ค "คลิกนอกกล่อง" สองก้อน (ปุ่มใน sidebar + กล่องที่ถูก teleport ไปแล้ว)
 *
 * Topbar ไม่มี overflow ที่เฉือน กล่องจึงห้อยจากปุ่มด้วย absolute ธรรมดาได้ ไม่ต้อง Teleport
 * ไม่ต้องคำนวณพิกัด และไม่ต้องเฝ้าสถานะ sidebar - โครงเดียวกับ NotificationBell ที่อยู่ข้าง ๆ
 *
 * ★ ปุ่มเหลือแค่รูปโปรไฟล์ ไม่มีชื่อ/อีเมล/ลูกศร - Topbar เป็นแถวของไอคอนขนาดเท่ากัน
 *   ชื่อกับอีเมลย้ายไปอยู่หัวกล่องที่กางออกมาแทน (ซึ่งมีอยู่แล้วตั้งแต่เดิม ไม่ได้หายไปไหน)
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/shared/stores/auth'
import { useUiStore } from '@/shared/stores/ui'

const router = useRouter()
const authStore = useAuthStore()
const { user } = storeToRefs(authStore)

// ★ เดิมโหลดที่ Sidebar ตอน mount - ย้ายมาพร้อมกัน เพราะที่นี่คือที่เดียวที่ใช้ข้อมูลผู้ใช้
//   (ทั้งสองอยู่ใน MainLayout เหมือนกัน ความครอบคลุมจึงเท่าเดิม: ทุกหน้าที่ล็อกอิน)
onMounted(() => {
  if (!authStore.user) authStore.getCurrentUser().catch(() => { })
})

const open = ref(false)
/** ปุ่ม + กล่อง - ใช้ตัดสินว่าคลิกที่เกิดขึ้น "อยู่นอก" หรือเปล่า */
const rootRef = ref<HTMLElement | null>(null)

function close() {
  open.value = false
}

/**
 * ชื่อที่โชว์ - ชื่อจริงจาก HR ก่อน ถ้าไม่มีค่อยถอยไปใช้ displayName ของบัญชี
 *
 * ★ สองอย่างนี้คนละแกน: displayName เป็นชื่อที่ตั้งให้ "บัญชี" (service account มีได้ทั้งที่
 *   ไม่ใช่คน) ส่วน firstName/lastName มาจาก HR ซึ่งเป็นชื่อที่คนอื่นในระบบเห็นในเอกสาร
 */
const displayName = computed(() => {
  const e = user.value?.employee
  const full = [e?.firstName, e?.lastName].filter(Boolean).join(' ').trim()
  return full || user.value?.displayName || '-'
})

/**
 * รายการในกล่อง - เตรียมเป็นลิสต์เพื่อให้ template ไม่ต้องเขียนเงื่อนไข "ไม่มีค่า" ซ้ำทุกแถว
 *
 * ★ ช่องที่ไม่มีค่าแสดง "ไม่ได้ระบุ" ไม่ใช่เว้นว่าง - พนักงาน 254 จาก 396 คนไม่มีอีเมล
 *   (วัด 2026-09-09) ช่องว่างเปล่าอ่านแล้วเหมือนระบบลืมแสดง ซึ่งคนละความหมายกับ
 *   "HR ยังไม่ได้กรอก" ที่เป็นความจริง
 */
const NOT_SET = 'ไม่ได้ระบุ'
const profileRows = computed(() => {
  const e = user.value?.employee
  return [
    { icon: 'lucide:id-card', label: 'ID', value: e?.empId || NOT_SET },
    { icon: 'lucide:building-2', label: 'Department', value: e?.department?.name || NOT_SET },
    { icon: 'lucide:shield-check', label: 'Role', value: user.value?.role?.name || NOT_SET },
  ]
})

/**
 * ── รูปโปรไฟล์ = ตัวอักษรย่อ ไม่ใช่รูปจริง
 *
 * ★ ระบบไม่มีที่เก็บรูปพนักงาน (employee ไม่มีคอลัมน์รูป) และ HR ก็ไม่ได้ส่งรูปมา
 *   ตัวย่อจึงไม่ใช่ "ของชั่วคราวระหว่างรอรูปจริง" แต่เป็นสิ่งที่ต้องมีอยู่ดี — วันที่ต่อ SSO
 *   แล้วดึงรูปจาก Entra ได้ ก็ยังต้องใช้ตัวนี้กับคนที่ไม่มีรูปในระบบนั้น
 *
 * ★ ใช้ชื่ออังกฤษตัวแรก (Natdanai → N) ไม่ใช่ชื่อไทย — ตัวอักษรไทยบางตัวมีสระ/วรรณยุกต์
 *   ลอยอยู่นอกกรอบตัวอักษร พอย่อลงในวงกลม 36px จะถูกเฉือนหัว-ท้าย
 *
 * ★ ทางถอยสามชั้นเพราะทุกชั้นว่างได้จริง: HR ไม่ได้กรอกชื่ออังกฤษครบทุกคน ส่วน
 *   displayName กับ username เป็น NOT NULL ที่ DB จึงเป็นชั้นที่รับประกันว่ามีตัวอักษรเสมอ
 */
const avatarLetter = computed(() => {
  const e = user.value?.employee
  const source = e?.firstNameEn?.trim() || user.value?.displayName?.trim() || user.value?.username?.trim()
  return source ? source[0]!.toUpperCase() : '?'
})

/**
 * สีพื้นของวงกลม — สีเดียวทั้งระบบ ไม่ได้สุ่มตามคน
 *
 * ★ เป็นสีดิบ (#2867e4) ไม่ใช่ตัวแปร semantic ของธีมโดยตั้งใจ — ต้องคงที่ทั้งธีมสว่าง
 *   และมืด ไม่เปลี่ยนตามธีมเหมือนที่อื่นในแอป
 *   (กรณีที่กติกา "ใช้สี semantic เท่านั้น" ยอมให้ใช้สีดิบได้ = สีที่ต้องไม่ขึ้นกับธีม)
 *
 * ★ ค่านี้ **คือ** --color-primary ของธีม ams แปลงเป็น hex แล้ว (oklch(55% 0.2 262))
 *   ไม่ใช่สีที่เลือกมาใกล้ ๆ - ของเดิมเป็น #5557db ซึ่งสว่างและอิ่มสีเท่ากันแต่เฉดต่าง 14.7°
 *   ไกลพอให้เห็นว่าเพี้ยน แต่ไม่ไกลพอให้อ่านว่าเป็นสีเน้นที่ตั้งใจ
 *   ★ ถ้าแก้ --color-primary ในธีม ต้องมาแก้ค่านี้ตามด้วย ไม่มีอะไรฟ้องให้
 *
 * ★ ประกาศเป็นค่าคงที่ที่เดียว แล้วสองที่ในไฟล์อ้างตัวนี้ — คลาสยังเป็นสตริงตายตัวใน
 *   ซอร์ส Tailwind จึงยังสร้างให้ (ห้ามประกอบชื่อคลาสจากตัวแปรตอนรันไทม์)
 */
const AVATAR_CLASS = 'bg-[#2867e4] text-white'

// ── สลับธีมสว่าง/มืด ────────────────────────────────────────────────────────
//
// ★ ตั้งแต่ 2026-09-21 นี่คือ "ที่เดียว" ที่สลับธีมได้ - ปุ่ม toggle บน Topbar ถูกถอดออก
//   สถานะยังอยู่ใน ui store เหมือนเดิม (ห้ามย้ายมาเป็น ref ของไฟล์นี้ - ธีมถูกอ่าน/เขียน
//   จากที่อื่นด้วยตอนบูตแอป ดูคอมเมนต์ใน stores/ui.ts)
const uiStore = useUiStore()
const { isDarkTheme: dark } = storeToRefs(uiStore)
const onToggleTheme = uiStore.toggleTheme

function onLogout() {
  close()
  // ★ ไม่เรียก authService.logout() - backend ไม่มีเส้นนั้น (JWT เป็น stateless ไม่มี session
  //   ให้ทำลายฝั่ง server) store ล้าง token ในเครื่องพอ ซึ่งเป็นการออกจากระบบจริง
  authStore.logout()
  router.replace({ path: '/login' })
}

// ── คลิกนอกกล่องแล้วปิด + Esc ────────────────────────────────────────────────────
//
// ★ pointerdown ไม่ใช่ click - click เกิดตอนปล่อยเมาส์ คนที่กดค้างแล้วลากไปปล่อยนอกกล่อง
//   (เช่น ลากเลือกอีเมลในหัวกล่อง) จะทำให้กล่องหุบทั้งที่ไม่ได้ตั้งใจปิด
// ★ เทียบกับ rootRef ที่ครอบ "ปุ่ม + กล่อง" - ไม่งั้นการกดปุ่มตอนเปิดอยู่จะนับเป็นคลิก
//   ข้างนอก ปิดไปหนึ่งที แล้ว toggle เปิดกลับมาอีกที = กล่องกะพริบแทนที่จะปิด
function onDocumentPointerDown(e: PointerEvent) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !open.value) return
  close()
  // คืนโฟกัสให้ปุ่มเฉพาะทาง Esc - โฟกัสอาจอยู่ในกล่องที่กำลังจะหายไป ปล่อยไว้แล้วคนที่ใช้
  // คีย์บอร์ดจะเด้งกลับไปเริ่มไล่ tab ใหม่จากต้นหน้า (ทางคลิกข้างนอกไม่ต้องคืน)
  rootRef.value?.querySelector<HTMLElement>('button')?.focus()
}

// ฟังเฉพาะตอนเปิด - listener ที่ค้างตลอดอายุหน้าคือของที่ต้องไล่ตรวจทุกครั้งที่มีคนคลิก
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
})

// เปลี่ยนหน้า = ปิดกล่อง - กดเมนูใน sidebar ตอนกล่องเปิดค้างอยู่ กล่องจะบังเนื้อหาหน้าใหม่
watch(() => router.currentRoute.value.fullPath, close)
</script>

<template>
  <div ref="rootRef" class="relative">
    <!-- ★ ปุ่มเป็นรูปอย่างเดียว - ชื่อ/อีเมลอยู่ในหัวกล่องที่กางออกมา
         btn-circle ให้พื้นที่กดเท่าปุ่มไอคอนตัวอื่นบน Topbar (รูปเล็กกว่ากรอบปุ่มเล็กน้อย
         โดยตั้งใจ ไม่งั้นวงกลมสีจะดูใหญ่กว่าไอคอนข้าง ๆ ทั้งแถว) -->
    <button type="button" class="btn btn-ghost btn-circle" :class="{ 'bg-base-300': open }"
      :aria-expanded="open" aria-haspopup="menu" :aria-label="`บัญชีของ ${displayName}`" @click="open = !open">
      <div class="avatar avatar-placeholder">
        <div class="w-9 rounded-full" :class="AVATAR_CLASS">
          <span class="text-sm font-semibold">{{ avatarLetter }}</span>
        </div>
      </div>
    </button>

    <!-- ชุดคลาสเดียวกับกระดิ่ง - สองกล่องนี้ห้อยจากปุ่มที่อยู่ติดกัน ถ้าจังหวะต่างกัน
         จะรู้สึกได้ทันทีว่าเป็นคนละแอป -->
    <Transition enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-8" enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in" leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4">
      <div v-if="open" role="menu"
        class="absolute right-0 top-full z-[60] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-box border border-base-300 bg-base-100 shadow-lg">
        <div class="flex items-center gap-3 border-b border-base-300 p-4">
          <div class="avatar avatar-placeholder">
            <div class="w-10 rounded-full" :class="AVATAR_CLASS">
              <span class="text-base font-semibold">{{ avatarLetter }}</span>
            </div>
          </div>
          <div class="min-w-0 text-left">
            <p class="truncate text-sm font-semibold" :title="displayName">{{ displayName }}</p>
            <!-- ยาวเกินกล่องยังเป็นไปได้ (อีเมลบางคนยาวมาก) - ตัดท้ายแล้วให้ hover อ่านเต็ม -->
            <p class="truncate text-xs text-base-content/60" :title="user?.employee?.email ?? ''">
              {{ user?.employee?.email || NOT_SET }}
            </p>
          </div>
        </div>

        <!-- ── รายการ: ไอคอน + ค่า คั่นด้วยเส้นบาง
           divide-y ที่ตัวครอบ ไม่ใช่ border-b รายแถว - แถวสุดท้ายจะได้ไม่มีเส้นห้อยลอย
           แล้วไปชนกับเส้นของบล็อกข้างล่างเป็นสองเส้นซ้อน

           ★ **ระยะขอบต้องอยู่ที่แถว ไม่ใช่ที่ <dl>** - divide-y วาดเส้นเป็น border-top ของ
             "ลูก" ถ้าตัวครอบมี px-2 ลูกจะแคบลง 8px ทั้งสองข้าง เส้นในบล็อกนี้เลยร่นเข้ามา
             ขณะที่อีก 3 เส้นในกล่อง (ใต้หัว / เหนือ Dark Mode / เหนือ Logout) เป็น
             border บนตัวครอบที่กว้างเต็มกล่องจึงชนขอบ = เส้นในกล่องเดียวกันยาวไม่เท่ากัน
             ย้าย px มาไว้ที่แถวแล้วรวมเป็น px-4 ระยะของเนื้อหาเท่าเดิมเป๊ะ (8+8) แต่เส้นชนขอบ -->
        <dl class="divide-y divide-base-300 py-1 ">
          <div v-for="row in profileRows" :key="row.label" class="flex items-center gap-3 px-4 py-2.5">
            <Icon :icon="row.icon" class="size-5 shrink-0 opacity-70" />
            <dd class="min-w-0 flex-1 truncate text-left text-sm font-medium" :title="row.value">
              {{ row.value }}
            </dd>
          </div>
        </dl>

        <!-- โหมดมืด - เป็นแถวเดียวกับรายการข้างบน แต่กดได้ทั้งแถว (ไม่ใช่กดโดนแค่ตัว toggle)
           ★ ธีม amsdark เตรียมไว้ใน assets/main.css อยู่แล้ว ที่นี่แค่สลับ data-theme

           ★ **เป็น <label> ไม่ใช่ <button>** - ข้างในมี <input> ซึ่งเป็น interactive element
             วางใน <button> ไม่ได้ (content model ของ button ไม่รับ) เบราว์เซอร์จะแยก DOM
             ออกจากกันเองตอน parse แบบเดียวกับ button ซ้อน button - label ให้พฤติกรรมที่
             ต้องการอยู่แล้ว: คลิกที่ไหนในแถวก็ถูกส่งไปที่ input ตัวเดียวข้างใน ครั้งเดียว
             จึงไม่ต้องมี pointer-events-none กันสลับสองรอบเหมือนตอนที่แถวเป็นปุ่ม
             (ของแถมคือคีย์บอร์ด: input โฟกัสได้ กด space สลับได้เลย)

           ★ **ห้ามใส่ class theme-controller ของ daisyUI ที่นี่** - มันสลับธีมด้วย CSS ล้วน
             (:root:has(.theme-controller[value=…]:checked)) ซึ่งข้าม applyTheme() ทั้งดุ้น
             = ไม่มีใครเขียน localStorage รีโหลดแล้วธีมหายทุกครั้ง และ value ต้องเป็นชื่อธีม
             ที่คอมไพล์ไว้จริงคือ ams/amsdark ไม่ใช่ dim ที่เป็นธีม built-in คนละชุดสี
             ที่นี่ใช้ .toggle เป็น "หน้าตา" อย่างเดียว ตัวสลับจริงคือ uiStore.toggleTheme() -->
        <div class="border-t border-base-300 px-2 py-1">
          <label
            class="flex w-full cursor-pointer items-center gap-3 rounded-box px-2 py-2.5 text-left transition hover:bg-base-200">
            <Icon icon="lucide:palette" class="size-5 shrink-0 opacity-70" />
            <span class="flex-1 text-sm">{{ dark ? 'Light Mode' : 'Dark Mode' }}</span>

            <!-- ★ ลำดับลูกสามตัวนี้ห้ามสลับ - daisyUI ซ่อน/โชว์ไอคอนด้วยลำดับตรง ๆ
               (.toggle:has(:checked) > :nth-child(2) จาง, :nth-child(3) ชัด)
               input = ลูกที่ 1, sun = ลูกที่ 2 (เห็นตอนธีมสว่าง), moon = ลูกที่ 3
               สลับที่กันเมื่อไหร่ ไอคอนจะกลับด้านโดยไม่มีอะไร error ให้เห็น -->
            <span class="toggle toggle-sm text-base-content">
              <input type="checkbox" :checked="dark" aria-label="สลับธีมสว่าง/มืด" @change="onToggleTheme" />

              <svg aria-label="sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <g stroke-linejoin="round" stroke-linecap="round" stroke-width="2" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2"></path>
                  <path d="M12 20v2"></path>
                  <path d="m4.93 4.93 1.41 1.41"></path>
                  <path d="m17.66 17.66 1.41 1.41"></path>
                  <path d="M2 12h2"></path>
                  <path d="M20 12h2"></path>
                  <path d="m6.34 17.66-1.41 1.41"></path>
                  <path d="m19.07 4.93-1.41 1.41"></path>
                </g>
              </svg>

              <svg aria-label="moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <g stroke-linejoin="round" stroke-linecap="round" stroke-width="2" fill="none" stroke="currentColor">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                </g>
              </svg>
            </span>
          </label>
        </div>

        <div class="border-t border-base-300 px-2 py-1">
          <button type="button"
            class="flex w-full items-center gap-3 rounded-box px-2 py-2.5 text-left text-sm text-error transition hover:bg-error/10"
            @click="onLogout">
            <Icon icon="lucide:log-out" class="size-5 shrink-0" />
            Logout
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
