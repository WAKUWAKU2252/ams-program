<script setup lang="ts">
/**
 * สวิตช์ sync อัตโนมัติบน Topbar - ADMIN เท่านั้น (TopBar เป็นคนตัดสินว่าจะวาดไหม)
 *
 * ── ★ ทำไมเป็นกล่องที่ห้อยจากปุ่ม ไม่ใช่ toggle โผล่บน Topbar ตรง ๆ
 *
 * toggle ที่อยู่บนแถบเลยกดโดนง่ายเกินไป ปิดทีเดียวข้อมูลของทุกคนหยุดอัปเดตไปจนกว่าจะมีคนมาเปิด
 * การต้องกดเปิดกล่องก่อนหนึ่งครั้งคือการยืนยันไปในตัว และกล่องมีที่ให้บอกสองเรื่องที่ต้องรู้
 * ก่อนกด: ใครเปลี่ยนล่าสุด กับ "restart แล้วค่ากลับไปเป็นอะไร"
 *
 * ── ★ สถานะอยู่ในหน่วยความจำของ backend ไม่ใช่ DB (ตกลงกันแล้วว่าไม่ทำ migration)
 *
 * restart เมื่อไหร่ รวมถึง bun --watch ที่ restart เองตอนมีคนเซฟไฟล์ ค่าจะกลับไปเป็น
 * SAP_SYNC_AUTO_ENABLED ใน .env เงียบ ๆ - บรรทัดนั้นในกล่องจึงห้ามถอดออก
 *
 * โหลดสถานะใหม่ทุกครั้งที่เปิดกล่อง - ADMIN อีกคนอาจกดไปแล้ว หรือ backend เพิ่ง restart
 * (โครงกล่อง/คลิกนอกแล้วปิด/Esc ยกมาจาก NotificationBell.vue ทั้งชุด เหตุผลเต็มอยู่ที่นั่น)
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/shared/services/httpClient'
import { getAutoSync, setAutoSync, type AutoSyncState } from '@/shared/services/sync.service'
import { formatDateTime } from '@/shared/utils/date'

const state = ref<AutoSyncState | null>(null)
const open = ref(false)
const busy = ref(false)
const error = ref('')
const rootRef = ref<HTMLElement | null>(null)

async function load() {
  try {
    state.value = await getAutoSync()
    error.value = ''
  } catch (e) {
    // อ่านไม่ได้ไม่ควรลาก Topbar พัง - ปุ่มยังอยู่ กดเปิดกล่องแล้วเห็นเหตุผล
    error.value = e instanceof ApiError ? e.message : 'อ่านสถานะ sync อัตโนมัติไม่สำเร็จ'
  }
}

onMounted(() => {
  void load()
})

function toggleOpen() {
  open.value = !open.value
  if (open.value) void load()
}

async function onSwitch(e: Event) {
  const input = e.target as HTMLInputElement
  const next = input.checked
  busy.value = true
  error.value = ''
  try {
    state.value = await setAutoSync(next)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ'
  } finally {
    busy.value = false
    // ★ คืนสวิตช์ให้ตรงกับความจริงเสมอ - ถ้าส่งไม่ผ่าน checkbox ถูกเบราว์เซอร์สลับไปแล้ว
    //   แต่ state ไม่ได้เปลี่ยน :checked จึงไม่ถูกเขียนซ้ำ สวิตช์จะโกหกว่าเปลี่ยนสำเร็จ
    input.checked = state.value?.enabled ?? false
  }
}

function close() {
  open.value = false
}

function onDocumentPointerDown(e: PointerEvent) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !open.value) return
  close()
  rootRef.value?.querySelector<HTMLElement>('button')?.focus()
}

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
</script>

<template>
  <div ref="rootRef" class="relative">
    <!-- ★ ตอนปิดต้องเห็นได้โดยไม่ต้องกดอะไร (สีเตือน + ไอคอนเปลี่ยน) - ปิดแล้วลืมคือความเสี่ยง
         หลักของสวิตช์นี้ ข้อมูลจะหยุดอัปเดตโดยที่ไม่มีใครสังเกต -->
    <button
      type="button"
      class="btn btn-ghost btn-sm gap-1.5 rounded-[4px]"
      :class="state && !state.enabled ? 'text-warning' : ''"
      :aria-expanded="open"
      aria-haspopup="true"
      :title="state ? (state.enabled ? 'Sync อัตโนมัติ: เปิด' : 'Sync อัตโนมัติ: ปิดอยู่') : 'Sync อัตโนมัติ'"
      @click="toggleOpen"
    >
      <Icon :icon="state && !state.enabled ? 'lucide:timer-off' : 'lucide:timer'" class="size-4" />
      <span class="hidden sm:inline">Auto</span>
      <span
        v-if="state"
        class="status status-sm"
        :class="state.enabled ? 'status-success' : 'status-warning'"
        aria-hidden="true"
      ></span>
    </button>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-8"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4"
    >
      <div
        v-if="open"
        class="absolute right-0 top-full z-[60] mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-box border border-base-300 bg-base-100 shadow-lg"
      >
        <label class="flex cursor-pointer items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
          <span class="text-sm font-semibold">Sync อัตโนมัติจาก SAP</span>
          <span v-if="busy" class="loading loading-spinner loading-xs"></span>
          <input
            v-else
            type="checkbox"
            class="toggle toggle-sm toggle-success"
            :checked="state?.enabled ?? false"
            :disabled="!state || !state.canToggle"
            @change="onSwitch"
          />
        </label>

        <div class="space-y-2 px-4 py-3 text-sm">
          <p v-if="!state && !error" class="text-center">
            <span class="loading loading-spinner loading-sm"></span>
          </p>

          <template v-if="state">
            <p v-if="!state.canToggle" class="text-warning">
              .env ตั้ง SAP_SYNC_INTERVAL_MINUTES = 0 ไว้ - เปิดจากที่นี่ไม่ได้
            </p>
            <p v-else-if="state.enabled">ดึง PO / GRPO / สินทรัพย์ทุก {{ state.intervalMinutes }} นาที</p>
            <p v-else class="text-warning">ปิดอยู่ - ข้อมูลจะไม่อัปเดตเองจนกว่าจะเปิด</p>

            <p v-if="state.changedByName" class="text-xs text-base-content/60">
              {{ state.enabled ? 'เปิด' : 'ปิด' }}ล่าสุดโดย {{ state.changedByName }} ·
              {{ formatDateTime(state.changedAt) }}
            </p>

          </template>

          <p v-if="error" role="alert" class="text-xs text-error">{{ error }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>
