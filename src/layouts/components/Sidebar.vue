<script setup lang="ts">
import ubislogo from '@/assets/UBIS.png'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Icon } from '@iconify/vue'

import SidebarItem from './SidebarItem.vue'
import { MENU_GROUP_ORDER, menuItems } from '@/layouts/sidebar-menu'
import type { MenuItem } from '@/layouts/sidebar-menu'
import { useAuthStore } from '@/shared/stores/auth'
import { useUiStore } from '@/shared/stores/ui'
import { getTokenRole } from '@/shared/services/auth.token'
import { isPathInRoleScope } from '@/shared/utils/role-scope'

// ★ ไม่มี props แล้ว - เคยรับ userPermissions ไว้กรองเมนูตาม permission แต่ไม่เคยมีใคร
//   ส่งมาสักที่ (MainLayout เรียก <Sidebar /> เปล่า ๆ) ตัวกรองนั้นจึงไม่เคยทำงาน
//   ถอดออกพร้อมฟิลด์ permission ใน sidebar-menu.ts (2026-09-16)

const authStore = useAuthStore()

// ผู้ใช้ที่ล็อกอินอยู่ - มาจาก Auth store (service คืน mock ชั่วคราวจนกว่า backend auth พร้อม)
const { user } = storeToRefs(authStore)

// สถานะ drawer บนจอเล็ก - กล่องโปรไฟล์ต้องปิดตามเมื่อ sidebar ถูกเก็บ (ดู watch ข้างล่าง)
const uiStore = useUiStore()
const { isSidebarOpen, isSidebarCollapsed } = storeToRefs(uiStore)

onMounted(() => {
  if (!authStore.user) authStore.getCurrentUser().catch(() => { })
})

// role มาจาก token (ไม่ต้องรอ /auth/me โหลดเสร็จ) เมนูจึงไม่กะพริบตอนเข้าหน้าครั้งแรก
const currentRole = computed(() => getTokenRole())

/**
 * เมนูที่ role นี้เห็นจริง จัดเป็นกลุ่มแล้ว — **ตัดกลุ่มที่ว่างทิ้ง**
 *
 * ★★ ต้องกรองก่อนแล้วค่อยจัดกลุ่ม ห้ามสลับลำดับ และห้ามเอา divider ไปแทรกใน menuItems
 *
 *   ถ้าจัดกลุ่มไว้ตายตัวแล้วค่อยกรอง จะเหลือกลุ่มว่างที่ยังกินเส้นคั่นอยู่ — AUDIT ซึ่งเห็น
 *   เมนูเดียว (/audit) จะได้เส้นลอยคร่อมหัวท้าย ส่วน EMPLOYEE จะได้เส้นห้อยท้ายเมนูสุดท้าย
 *   เพราะกลุ่ม restricted ของเขาว่างเปล่า (ดูตารางจำนวนเมนูต่อ role ที่ sidebar-menu.ts)
 *
 * ★ คืนเป็นอาร์เรย์ของกลุ่ม ไม่ใช่อาร์เรย์แบน — template วาดเส้นจาก "ช่องว่างระหว่างกลุ่ม"
 *   (v-if="i > 0") ซึ่งไม่มีทางเกิดเส้นหัวหรือท้ายโดยโครงสร้าง
 */
/** เมนูตัวนี้ role ปัจจุบันเห็นไหม */
function canSee(item: MenuItem): boolean {
  // role ที่ใช้ได้หน้าเดียว (AUDIT) - เมนูอื่นทั้งหมดหายไป ไม่ใช่แค่ตัวที่มี item.roles
  // เพราะเมนูที่ไม่ได้ระบุ roles แปลว่า "ทุก role เห็น" ซึ่งจะรวม AUDIT ด้วยถ้าไม่ดักตรงนี้
  if (!isPathInRoleScope(currentRole.value, item.to)) return false

  // เมนูเฉพาะบาง role (เช่น Admin) - role ไม่ตรงก็ไม่ต้องแสดง
  if (item.roles?.length && !item.roles.includes(currentRole.value ?? '')) return false

  return true
}

const menuGroups = computed(() =>
  MENU_GROUP_ORDER.map((group) =>
    menuItems.filter((item) => item.group === group && canSee(item)),
  ).filter((items) => items.length > 0),
)

// ── กล่องโปรไฟล์ (กดที่แถบผู้ใช้มุมซ้ายล่าง) ────────────────────────────────
//
// ★ กล่องต้อง Teleport ออกไปที่ body ห้ามวางไว้ใน <aside> เด็ดขาด
//
//   .drawer-side ของ daisyUI ตั้ง overflow-x: hidden ไว้ ทุกอย่างที่ล้นออกนอกความกว้าง
//   sidebar (w-64 = 256px) จะถูกเฉือนทิ้ง กล่องที่วางไว้ข้างในจึงกว้างได้ไม่เกินแถบ
//   แล้วอีเมล/ชื่อแผนกยาว ๆ ถูกตัดจนอ่านไม่ออก — เป็นอาการที่รายงานมา
//
//   position: fixed ช่วยไม่ได้ถ้ายังอยู่ในกรอบนั้น (overflow ของ ancestor ยัง clip อยู่ดี)
//   ทางเดียวคือย้าย DOM node ออกไปนอก .drawer-side ทั้งก้อน
const router = useRouter()
const profileOpen = ref(false)
const profileRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

/** ความกว้างของกล่อง (px) — กว้างกว่า sidebar โดยตั้งใจ ให้อีเมลเต็ม ๆ มีที่อยู่ */
const PANEL_WIDTH = 250
const GAP = 8

/**
 * ตำแหน่งกล่อง — คิดจากกรอบจริงของปุ่มทุกครั้งที่เปิด ไม่ใช่ค่าคงที่
 *
 * ต้องคิดสด เพราะ sidebar เลื่อนได้ (.drawer-side มี overflow-y: auto) และบนจอเล็ก
 * มันเป็น drawer ที่เลื่อนเข้า-ออก ตำแหน่งปุ่มจึงไม่คงที่
 */
const panelStyle = ref<Record<string, string>>({})


function anchorVisible(r: DOMRect): boolean {
  return r.width > 0 && r.right > 0 && r.left < window.innerWidth
}

function placePanel() {
  const el = profileRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  // sidebar ถูกเก็บไปแล้ว = ไม่มีที่ให้ยึด ปิดกล่องทิ้งดีกว่าปล่อยให้ลอย
  if (!anchorVisible(r)) {
    profileOpen.value = false
    return
  }
  // ไม่ให้ล้นขอบขวาจอ (จอแคบ/sidebar กว้างกว่าปกติ) และไม่ให้ติดขอบซ้ายจนเบียด
  const left = Math.max(GAP, Math.min(r.left, window.innerWidth - PANEL_WIDTH - GAP))
  panelStyle.value = {
    left: `${left}px`,
    // วางเหนือแถบเสมอ — แถบอยู่ติดขอบล่างจอ กางลงล่างจะตกจอทันที
    bottom: `${window.innerHeight - r.top - 35 + GAP}px`,
    width: `${PANEL_WIDTH}px`,
  }
}

function toggleProfile() {
  profileOpen.value = !profileOpen.value
  if (profileOpen.value) placePanel()
}

/**
 * drawer ถูกปิด = ปิดกล่องตาม
 *
 * ★ ต้อง watch state ตัวนี้ ไม่ใช่พึ่ง resize/scroll อย่างเดียว — daisyUI เลื่อน drawer
 *   ด้วย CSS transform จาก checkbox ซึ่ง**ไม่ยิง event อะไรให้เลย** กล่องจึงค้างอยู่บนจอ
 *   หลังผู้ใช้กด overlay ปิดเมนู (หรือกดเมนูแล้ว drawer ปิดเอง)
 */
watch(isSidebarOpen, (open) => {
  if (!open) profileOpen.value = false
})

/**
 * พับ sidebar บนจอใหญ่ = ปิดกล่องตาม — เหตุผลเดียวกับ watch ข้างบนเป๊ะ
 *
 * ★ ต้องแยก watch ไม่ใช่พึ่ง anchorVisible() ใน placePanel() — ตัวนั้นถูกเรียกจาก
 *   scroll/resize เท่านั้น ส่วนการพับเป็นการถอดคลาส CSS ซึ่งไม่ยิง event ใดเลย
 *   กล่องโปรไฟล์จึงค้างลอยอยู่กลางจอหลัง sidebar ที่มันเกาะอยู่หายไปแล้ว
 */
watch(isSidebarCollapsed, (collapsed) => {
  if (collapsed) profileOpen.value = false
})

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
 * ★ เป็นสีดิบ (#4f86b2) ไม่ใช่สี semantic ของธีมโดยตั้งใจ — ผู้ใช้เลือกสีนี้มาเอง
 *   จึงต้องคงที่ทั้งธีมสว่างและมืด ไม่เปลี่ยนตามธีมเหมือนที่อื่นในแอป
 *   (กรณีที่กติกา "ใช้สี semantic เท่านั้น" ยอมให้ใช้สีดิบได้ = สีที่ต้องไม่ขึ้นกับธีม)
 *
 * ★ ประกาศเป็นค่าคงที่ที่เดียว แล้วสองที่ในหน้าอ้างตัวนี้ — คลาสยังเป็นสตริงตายตัวใน
 *   ซอร์ส Tailwind จึงยังสร้างให้ (ห้ามประกอบชื่อคลาสจากตัวแปรตอนรันไทม์)
 */
const AVATAR_CLASS = 'bg-[#5557db] text-white'

// ── สลับธีมสว่าง/มืด ────────────────────────────────────────────────────────
// สถานะอยู่ใน ui store ไม่ใช่ ref ของไฟล์นี้ - ปุ่มสลับธีมมีสองที่ (ที่นี่กับ TopBar)
// ถ้าต่างคนต่างถือ ref เอง กดที่หนึ่งแล้วอีกที่จะวาดสถานะเก่าค้างไว้ (ดูคอมเมนต์ใน ui.ts)
const { isDarkTheme: dark } = storeToRefs(uiStore)
const onToggleTheme = uiStore.toggleTheme

function onLogout() {
  profileOpen.value = false
  // ★ ไม่เรียก authService.logout() - backend ไม่มีเส้นนั้น (JWT เป็น stateless ไม่มี session
  //   ให้ทำลายฝั่ง server) store ล้าง token ในเครื่องพอ ซึ่งเป็นการออกจากระบบจริง
  authStore.logout()
  router.replace({ path: '/login' })
}

/**
 * ปิดเมื่อคลิกนอกกล่อง — ★ ต้องเช็คสองก้อน ไม่ใช่ก้อนเดียว
 *
 * กล่องถูก Teleport ไป body แล้ว มันจึงไม่ได้อยู่ใน profileRef อีกต่อไป ถ้าเช็คแต่ตัวนั้น
 * คลิกในกล่องตัวเองจะนับเป็น "คลิกข้างนอก" แล้วกล่องปิดทันทีก่อนปุ่มข้างในจะได้ทำงาน
 */
function onDocumentPointerDown(e: PointerEvent) {
  if (!profileOpen.value) return
  const target = e.target as Node
  if (profileRef.value?.contains(target)) return
  if (panelRef.value?.contains(target)) return
  profileOpen.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') profileOpen.value = false
}
// จอเปลี่ยนขนาด/เลื่อน = ตำแหน่งปุ่มขยับ กล่องที่ค้างอยู่จะลอยผิดที่ — คำนวณใหม่ให้ตาม
// (ใช้ capture เพื่อจับการเลื่อนของ .drawer-side ด้วย ไม่ใช่แค่ของหน้าต่าง)
function onViewportChange() {
  if (profileOpen.value) placePanel()
}

// ปิดกล่องเมื่อเปลี่ยนหน้า - เมนูอยู่ใน sidebar เดียวกัน กดเมนูแล้วกล่องค้างจะบังเนื้อหา
watch(() => router.currentRoute.value.fullPath, () => { profileOpen.value = false })

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <aside class="grid h-full min-h-screen w-64 grid-rows-[auto_1fr_auto] bg-base-200 text-base-content">
    <!-- ปุ่มพับ/กางเมนูอยู่ที่ TopBar ที่เดียว ไม่ใช่ในหัวนี้ - ปุ่มที่ใช้
         ซ่อนของต้องอยู่นอกของที่มันซ่อน ไม่งั้นพอกดแล้วปุ่มหายไปพร้อมกับ sidebar -->
    <div class="grid justify-items-center gap-1 px-8 pb-3 pt-7">
      <img :src="ubislogo" draggable="false" alt="UBIS" class="h-auto w-40" />
      <p class="text-center text-xs text-base-content/60">Assets Management System</p>
    </div>

    <nav class="overflow-y-auto">
      <ul class="menu w-full gap-1 px-3">
        <!-- ── วนสองชั้น: กลุ่ม → เมนูในกลุ่ม ────────────────────────────────
             ★ เส้นคั่นวาดจาก "ช่องว่างระหว่างกลุ่ม" (i > 0) ไม่ใช่ท้ายทุกกลุ่ม —
               แบบนี้ไม่มีทางเกิดเส้นหัวหรือเส้นห้อยท้ายโดยโครงสร้าง ไม่ว่า role ไหน
               จะเหลือกี่กลุ่ม (menuGroups ตัดกลุ่มว่างทิ้งให้แล้ว)
             ★ เส้นเป็น <li> เปล่าที่มีขอบบน ไม่ใช่ <div class="divider"> - divider ของ
               daisyUI มี margin ของตัวเองและไม่ใช่ลูกที่ถูกต้องของ <ul class="menu">
             ★ key ใช้ชื่อเมนูตัวแรกของกลุ่ม ไม่ใช่ index - กลุ่มที่หายไปตาม role ทำให้
               index ของกลุ่มเดียวกันเลื่อนได้ แล้ว Vue จะ reuse DOM ผิดตัว -->
        <template v-for="(group, i) in menuGroups" :key="group[0]!.name">
          <li v-if="i > 0" class="mx-2 my-2 border-t border-base-500" aria-hidden="true"></li>
          <li v-for="item in group" :key="item.name">
            <SidebarItem :item="item" />
          </li>
        </template>
      </ul>
    </nav>

    <!-- ── แถบผู้ใช้ (ตัวกล่องอยู่ท้ายไฟล์ - Teleport ออกไป body)
         ★ min-w-0 ห้ามถอด: <aside> เป็น grid และ grid item มี min-width: auto โดยปริยาย
           แปลว่ามันจะ "ไม่ยอมหด" ต่ำกว่าความกว้างเนื้อหา แล้วดันล้นออกนอก track ทั้งที่
           aside กว้าง w-64 ตายตัว — อีเมลยาว ๆ จึงทะลุขอบ sidebar ออกมาแทนที่จะถูก truncate
           (truncate ข้างในไม่มีผลเลยถ้าตัวครอบยังยืดได้ไม่จำกัด) -->
    <div ref="profileRef" class="min-w-0 px-3 pb-6">
      <div class="divider my-2"></div>

      <!-- ★ ทั้งแถบเป็นปุ่ม ไม่ใช่ไอคอนเล็ก ๆ ข้าง ๆ - แถบนี้คือสิ่งที่ผู้ใช้มองอยู่แล้วเวลา
           หาเมนูของตัวเอง (แพตเทิร์นเดียวกับป้ายสถานะที่เป็นปุ่มในตารางรายชิ้น) -->
      <button type="button"
        class="flex w-full items-center gap-3 rounded-box px-3 py-2 text-left transition hover:bg-base-300"
        :class="{ 'bg-base-300': profileOpen }" :aria-expanded="profileOpen" aria-haspopup="menu"
        @click="toggleProfile">
        <!-- shrink-0: รูปต้องคงขนาด ให้ข้อความเป็นตัวที่หดแทน ไม่งั้นรูปแบนตอนอีเมลยาว -->
        <div class="avatar avatar-placeholder shrink-0">
          <div class="w-9 rounded-full" :class="AVATAR_CLASS">
            <span class="text-sm font-semibold">{{ avatarLetter }}</span>
          </div>
        </div>
        <div class="min-w-0 flex-1 text-left">
          <p class="truncate text-sm font-medium">{{ displayName }}</p>
          <p class="truncate text-xs text-base-content/60">
            {{ user?.employee?.email || user?.username || '-' }}
          </p>
        </div>
        <Icon icon="lucide:chevron-up" class="size-4 shrink-0 opacity-60 transition-transform"
          :class="{ 'rotate-180': profileOpen }" />
      </button>
    </div>
  </aside>

  <!-- ── กล่องโปรไฟล์ - อยู่นอก <aside> โดยตั้งใจ
       .drawer-side ของ daisyUI ตั้ง overflow-x: hidden ไว้ กล่องที่อยู่ข้างในจะถูกเฉือน
       ตามความกว้าง sidebar (256px) แล้วอีเมล/ชื่อแผนกยาว ๆ ถูกตัดจนอ่านไม่ออก
       ตำแหน่งคิดจากกรอบจริงของปุ่มทุกครั้งที่เปิด (ดู placePanel) -->
  <Teleport to="body">
    <Transition enter-active-class="transition-all duration-200 ease-out" enter-from-class="opacity-0 translate-y-8"
      enter-to-class="opacity-100 translate-y-0" leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-4">
      <div v-if="profileOpen" ref="panelRef" role="menu" :style="panelStyle"
        class="fixed z-[60] rounded-[8px] border border-base-300 bg-base-100 shadow-lg ">
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

        <!-- ── รายการ: ไอคอน + ป้าย + ค่า คั่นด้วยเส้นบาง
           divide-y ที่ตัวครอบ ไม่ใช่ border-b รายแถว - แถวสุดท้ายจะได้ไม่มีเส้นห้อยลอย
           แล้วไปชนกับเส้นของบล็อกข้างล่างเป็นสองเส้นซ้อน -->
        <dl class="divide-y divide-base-300 px-2 py-1">
          <div v-for="row in profileRows" :key="row.label" class="flex items-center gap-3 px-2 py-2.5">
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
  </Teleport>
</template>
