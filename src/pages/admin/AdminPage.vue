<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════════════════
// Admin — หน้าเดียว สามแท็บ (ADMIN เท่านั้น)
//
//   สิทธิ์ผู้ใช้    เปลี่ยน role ของบัญชีที่มีอยู่
//   หัวหน้าแผนก   ตั้งคนที่รับการ์ดขออนุมัติของแต่ละแผนก
//   Create user   สร้างบัญชีใหม่ (+ พนักงานใหม่ในคำสั่งเดียว)
//
// ── ★ ทำไมเป็นแท็บ ไม่ใช่สามหน้า/เมนูซ้อน
//
// สามงานนี้เป็นคำถามเดียวกันที่ถามคนละมุม: "ใครทำอะไรได้ในระบบ" และงานจริงมักต่อกัน
// (สร้างบัญชี → ให้สิทธิ์ → ตั้งเป็นหัวหน้าแผนก) แยกคนละหน้าแล้วต้องเดินเมนูกลับไปกลับมา
// ทุกครั้ง — และที่แย่กว่าคือคนจะตั้งหัวหน้าไว้ก่อนแล้วลืมไปให้สิทธิ์ (หรือกลับกัน) ซึ่ง
// ทำให้ใบคำขอของแผนกนั้นส่งไม่ออกโดยไม่มี error ตรงไหนบอกเลย
//
// ── ★ แต่ละแท็บโหลดข้อมูลของตัวเอง ไม่มี state ร่วมที่หน้านี้
//
// ใช้ v-if ไม่ใช่ v-show — สลับแท็บ = mount ใหม่ = ข้อมูลสดเสมอ ซึ่งสำคัญเพราะสองแท็บแรก
// เขียนลงฐานจริง แล้วผลของแท็บหนึ่งไปปรากฏในอีกแท็บ (ลดสิทธิ์คนที่เป็นหัวหน้าแผนกอยู่)
// ถ้าเก็บ state ค้างไว้ จะเห็นข้อมูลเก่าหลังเพิ่งแก้เสร็จ
// ═══════════════════════════════════════════════════════════════════════════
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import TopicCard from '@/shared/components/TopicCard.vue'
import UserRolesTab from '@/pages/admin/components/UserRolesTab.vue'
import DepartmentManagersTab from '@/pages/admin/components/DepartmentManagersTab.vue'
import CreateUserTab from '@/pages/admin/components/CreateUserTab.vue'

type Tab = 'roles' | 'managers' | 'create'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'roles', label: 'Permission', icon: 'lucide:shield-check' },
  { key: 'managers', label: 'Manager', icon: 'lucide:users' },
  { key: 'create', label: 'Create user', icon: 'lucide:user-plus' },
]

const tab = ref<Tab>('roles')
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <TopicCard value="admin" />

    <!-- ⚠️ ป้ายนี้อยู่บนสุดโดยตั้งใจ ไม่ใช่ซ่อนอยู่ในกล่องยืนยัน — คนที่เปิดหน้านี้ควรรู้
         ตั้งแต่ก่อนแตะอะไรว่ามันไม่ใช่หน้าตั้งค่าธรรมดา -->
    <div role="note" class="alert alert-warning alert-soft mt-4 max-w-4xl">
      <Icon icon="lucide:triangle-alert" class="size-5 shrink-0" />
      <span class="text-sm">
        การแก้ในหน้านี้มีผลทันทีและไม่มีปุ่มย้อนกลับ โดยเฉพาะ<strong>หัวหน้าแผนก</strong>
        ซึ่งเป็นปลายทางของการ์ดขออนุมัติใน Teams ของทั้งแผนก
      </span>
    </div>

    <!-- ★ role=tablist + aria-selected ไม่ใช่ปุ่มเปล่า — screen reader ต้องรู้ว่ามีกี่แท็บ
         และกำลังอยู่แท็บไหน (แพตเทิร์นเดียวกับแท็บสองชีตในหน้า Asset summary) -->
    <div role="tablist" class="tabs tabs-box tabs-sm mt-5 w-fit">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        class="tab gap-1.5"
        :class="{ 'tab-active': tab === t.key }"
        :aria-selected="tab === t.key"
        @click="tab = t.key"
      >
        <Icon :icon="t.icon" class="size-4" />
        {{ t.label }}
      </button>
    </div>

    <div class="mt-5">
      <UserRolesTab v-if="tab === 'roles'" />
      <DepartmentManagersTab v-else-if="tab === 'managers'" />
      <CreateUserTab v-else />
    </div>
  </div>
</template>
