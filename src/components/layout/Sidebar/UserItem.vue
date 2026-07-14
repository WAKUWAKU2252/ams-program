<script setup lang="ts">
import type { User } from "@/types/user.ts"

const props = defineProps<{
  user: User;
  isCollapsed?: boolean;
  active: boolean;
  toggleProfileMenu?: boolean;
}>()

const emit = defineEmits<{
  (e: "click", toggleProfileMenu: boolean): void;
}>()
</script>

<template>
  <button
    type="button"
    class="font-[Arial,Helvetica,sans-serif] grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-[18px] text-[var(--secondary-color)] [padding:12px_16px_12px_30px] rounded-[0.8rem] cursor-pointer mx-[15px] text-sm transition duration-200 text-left w-[calc(100%-30px)] border-none bg-transparent"
    :class="{ active: active }"
    @click="emit('click', !toggleProfileMenu)"
  >
    <span class="w-6 h-6 grid place-items-center">
      <i 
        v-if="user.avatar" 
        :class="user.avatar" 
        class="text-[18px] leading-[8px] text-[#393c39]"
      ></i>
    </span>

    <span>
      {{ user.fullName }}
    </span>
  </button>
</template>