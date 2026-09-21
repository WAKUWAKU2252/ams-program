<script setup lang="ts">
import ubislogo from '@/assets/UBIS.png'
import { computed } from 'vue'

import SidebarItem from './SidebarItem.vue'
import { MENU_GROUP_ORDER, menuItems } from '@/layouts/sidebar-menu'
import type { MenuItem } from '@/layouts/sidebar-menu'
import { getTokenRole } from '@/shared/services/auth.token'
import { isPathInRoleScope } from '@/shared/utils/role-scope'

// ★ ไม่มี props แล้ว - เคยรับ userPermissions ไว้กรองเมนูตาม permission แต่ไม่เคยมีใคร
//   ส่งมาสักที่ (MainLayout เรียก <Sidebar /> เปล่า ๆ) ตัวกรองนั้นจึงไม่เคยทำงาน
//   ถอดออกพร้อมฟิลด์ permission ใน sidebar-menu.ts (2026-09-16)

// ★ แถบผู้ใช้/กล่องโปรไฟล์ย้ายไปอยู่บน Topbar แล้ว (ProfileMenu.vue - 2026-09-21)
//   sidebar เหลือสองหน้าที่: โลโก้กับเมนู จึงไม่ต้องรู้จัก auth store / ui store อีก

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
</script>

<template>
  <!-- ★ สองแถวแล้ว ไม่ใช่สาม - แถวที่สาม (แถบผู้ใช้) ย้ายขึ้น Topbar ไปเป็น ProfileMenu
       เมนูจึงกินความสูงที่เหลือทั้งหมดแทนที่จะเว้นที่ไว้ให้ของที่ไม่อยู่แล้ว -->
  <aside class="grid h-full min-h-screen w-64 grid-rows-[auto_1fr] bg-base-200 text-base-content">
    <!-- ปุ่มพับ/กางเมนูอยู่ที่ TopBar ที่เดียว ไม่ใช่ในหัวนี้ - ปุ่มที่ใช้
         ซ่อนของต้องอยู่นอกของที่มันซ่อน ไม่งั้นพอกดแล้วปุ่มหายไปพร้อมกับ sidebar -->
    <div class="grid justify-items-center gap-1 px-8 pb-3 pt-7">
      <img :src="ubislogo" draggable="false" alt="UBIS" class="h-auto w-40" />
      <p class="text-center text-xs text-base-content/60">Assets Management System</p>
    </div>

    <nav class="overflow-y-auto pb-6">
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
  </aside>
</template>
