<script setup lang="ts">
// กล่องยืนยันกลางของระบบ — ใช้กับทุกจุดที่ผู้ใช้ต้อง "ตัดสินใจ" (ลบ / ส่งอนุมัติ / ปฏิเสธ / ยกเลิก)
//
// ตั้งใจไม่ปิดตัวเองตอนกด confirm: งานส่วนใหญ่เป็น async ผู้เรียกต้องคุมจังหวะเอง
// (set loading -> ยิง API -> ค่อยปิด) ถ้าปิดทันทีผู้ใช้จะไม่เห็นสถานะกำลังทำงานและกดซ้ำได้
import { computed, nextTick, ref, watch, onBeforeUnmount, useId } from 'vue'

interface Props {
  modelValue: boolean
  title?: string
  message?: string
  variant?: 'info' | 'success' | 'warning' | 'danger'
  confirmText?: string
  cancelText?: string
  loading?: boolean
  /** ปิดด้วย Esc/คลิกฉากหลังไม่ได้ — ใช้กับการตัดสินใจที่ต้องเลือกจริงจังเท่านั้น */
  persistent?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: 'ยืนยันการทำรายการ',
  message: 'คุณแน่ใจหรือไม่ที่ต้องการดำเนินการนี้?',
  variant: 'info',
  confirmText: 'ตกลง',
  cancelText: 'ยกเลิก',
  loading: false,
  persistent: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

// id ไม่ซ้ำต่อ instance — สองกล่องบนหน้าเดียวกันใช้ id เดียวกันไม่ได้ (aria ชี้ผิดตัว)
const titleId = useId()

const close = () => {
  if (props.loading || props.persistent) return // กำลังทำงานอยู่/บังคับเลือก = ปิดเองไม่ได้
  emit('update:modelValue', false)
  emit('cancel')
}

const confirm = () => {
  emit('confirm')
}

// Esc = ยกเลิก (พฤติกรรมมาตรฐานของ dialog) — ผูก/ถอด listener ตามการเปิดปิด ไม่ค้างไว้ตลอด
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

const confirmBtn = ref<HTMLButtonElement | null>(null)

// กันหน้าหลังฉากเลื่อนตามขณะกล่องเปิด (mobile จะเลื่อนทะลุถ้าไม่ล็อก) + โฟกัสปุ่มยืนยันให้กด Enter ต่อได้เลย
watch(
  () => props.modelValue,
  async (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) {
      window.addEventListener('keydown', onKeydown)
      await nextTick()
      confirmBtn.value?.focus()
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

// กล่องถูก unmount ทั้งที่ยังเปิดอยู่ (เช่นเปลี่ยนหน้า) — ต้องคืน scroll ไม่งั้นหน้าถัดไปเลื่อนไม่ได้
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})

// จัดการสีและไอคอนตาม variant ที่ส่งมา
const theme = computed(() => {
  switch (props.variant) {
    case 'danger':
      return {
        icon: 'fa-solid fa-circle-exclamation',
        iconColor: 'text-red-500',
        iconBg: 'bg-red-100',
        btnConfirm: 'bg-red-500 hover:bg-red-600 focus:ring-red-500',
      }
    case 'warning':
      return {
        icon: 'fa-solid fa-triangle-exclamation',
        iconColor: 'text-orange-500',
        iconBg: 'bg-orange-100',
        btnConfirm: 'bg-orange-500 hover:bg-orange-600 focus:ring-orange-500',
      }
    case 'success':
      return {
        icon: 'fa-regular fa-circle-check',
        iconColor: 'text-green-500',
        iconBg: 'bg-green-100',
        btnConfirm: 'bg-green-500 hover:bg-green-600 focus:ring-green-500',
      }
    case 'info':
    default:
      return {
        icon: 'fa-solid fa-circle-info',
        iconColor: 'text-blue-500',
        iconBg: 'bg-blue-100',
        btnConfirm: 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500',
      }
  }
})
</script>

<template>
  <!-- Teleport: ถ้าเรนเดอร์ในที่เดิม ancestor ที่มี transform/overflow จะกิน fixed จนกล่องเพี้ยน -->
  <Teleport to="body">
  <Transition name="fade">
    <div v-if="modelValue" class="relative z-50" :aria-labelledby="titleId" role="dialog" aria-modal="true">
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" @click="close"></div>

      <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
          <!-- Modal Panel -->
          <div class="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
            <div class="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
              
              <div class="w-full">
                <!-- ส่วนหัว: Icon + Title -->
                <div class="flex items-center justify-center sm:justify-start gap-3 sm:gap-4">
                  <!-- Icon -->
                  <div :class="[theme.iconBg, theme.iconColor]" class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10 text-xl">
                    <i :class="theme.icon"></i>
                  </div>

                  <!-- Title -->
                  <h3 :id="titleId" class="text-lg font-semibold leading-6 text-gray-900">
                    {{ title }}
                  </h3>
                </div>

                <!-- Text Content (ข้อความรายละเอียด) -->
                <!-- sm:pl-14 เพื่อให้เว้นวรรคตรงกับหัวข้อพอดีในหน้าจอ Desktop (ความกว้าง icon 10 + gap 4 = 14) -->
                <div class="mt-3 sm:mt-4 text-center sm:text-left sm:pl-2 w-full">
                  <div class="text-sm text-gray-500">
                    <!-- slot ไว้ใส่รายละเอียดที่ต้องให้ผู้ใช้ตรวจก่อนตัดสินใจ (รายการที่จะหาย/ส่วนต่าง/ผลกระทบ)
                         ไม่มี slot ก็ใช้ message เป็นข้อความธรรมดา -->
                    <slot>
                      <p>{{ message }}</p>
                    </slot>
                  </div>
                </div>
              </div>
              
            </div>
            
            <!-- Actions -->
            <div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
              <button
                type="button"
                ref="confirmBtn"
                :class="[theme.btnConfirm]"
                class="inline-flex w-full justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 sm:w-auto transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading"
                @click="confirm"
              >
                <i v-if="loading" class="fa-solid fa-spinner animate-spin mr-2 mt-0.5"></i>
                {{ confirmText }}
              </button>
              <button
                type="button"
                class="mt-3 inline-flex w-full justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading"
                @click="close"
              >
                {{ cancelText }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>