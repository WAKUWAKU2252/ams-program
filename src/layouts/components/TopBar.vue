<script setup lang="ts">
import DateDisplay from './Datedisplay.vue'
import { Icon } from '@iconify/vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()

// เดินจาก child ขึ้น parent เอา title ที่ลึกสุดที่กำหนดไว้ (/create/:id ได้ title จาก parent 'create')
const title = computed(
  () => (([...route.matched].reverse().find((r) => r.meta.title)?.meta.title) as string) ?? ''
)
</script>

<template>
  <header class="bg-base-200 pt-1">
    <div class="navbar min-h-[70px] rounded-t-box bg-base-100 px-4 sm:px-6">
      <div class="navbar-start gap-2">
        <!-- จอ lg ขึ้นไป drawer เปิดค้าง ไม่ต้องมีปุ่ม -->
        <label for="ams-drawer" class="btn btn-ghost btn-square drawer-button lg:hidden" aria-label="เปิด/ปิดเมนูหลัก">
          <Icon icon="lucide:menu" class="text-xl" />
        </label>
        <div class="divider divider-horizontal mx-0 hidden lg:flex"></div>
        <span class="text-sm text-base-content/70">{{ title }}</span>
      </div>

      <div class="navbar-end">
        <DateDisplay
          locale="en"
          variant="short"
          :show-time="true"
          :live-time="true"
          class="text-sm text-base-content/70"
        />
      </div>
    </div>
  </header>
</template>
