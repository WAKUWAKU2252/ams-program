<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount, useId } from 'vue'
import { Icon } from '@iconify/vue'

interface Props {
  modelValue: boolean
  title?: string
  message?: string
  variant?: 'info' | 'success' | 'warning' | 'danger'
  confirmText?: string
  cancelText?: string
  loading?: boolean
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

const titleId = useId()

const close = () => {
  if (props.loading || props.persistent) return
  emit('update:modelValue', false)
  emit('cancel')
}

const confirm = () => {
  emit('confirm')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

const confirmBtn = ref<HTMLButtonElement | null>(null)

// ไม่ต้องล็อก scroll เอง — daisyUI ทำให้แล้วผ่าน :root:has(.modal.modal-open)
// (ล็อกที่ :root พร้อม scrollbar-gutter: stable ล็อกเองที่ body จะทำให้หน้าเลื่อนเพราะ scrollbar หาย)
watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
      await nextTick()
      confirmBtn.value?.focus()
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

// สีของกล่อง = สี semantic ของ daisyUI ล้วน — เปลี่ยนธีมแล้วตามทันทีโดยไม่ต้องแก้ที่นี่
const theme = computed(() => {
  switch (props.variant) {
    case 'danger':
      return { icon: 'lucide:circle-alert', tone: 'text-error', bg: 'bg-error/10', btn: 'btn-error' }
    case 'warning':
      return {
        icon: 'lucide:triangle-alert',
        tone: 'text-warning',
        bg: 'bg-warning/10',
        btn: 'btn-warning',
      }
    case 'success':
      return {
        icon: 'lucide:circle-check',
        tone: 'text-success',
        bg: 'bg-success/10',
        btn: 'btn-success',
      }
    case 'info':
    default:
      return { icon: 'lucide:info', tone: 'text-info', bg: 'bg-info/10', btn: 'btn-primary' }
  }
})
</script>

<template>
  <!-- Teleport: ถ้าเรนเดอร์ในที่เดิม ancestor ที่มี transform/overflow จะกิน fixed จนกล่องเพี้ยน -->
  <Teleport to="body">
    <div
      class="modal backdrop-blur-sm"
      :class="{ 'modal-open': modelValue }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <div class="modal-box max-w-lg">
        <!-- ส่วนหัว: Icon + Title -->
        <div class="flex items-center gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xl"
            :class="[theme.bg, theme.tone]"
          >
            <Icon :icon="theme.icon" />
          </div>
          <h3 :id="titleId" class="text-lg font-semibold">{{ title }}</h3>
        </div>

        <!-- slot ไว้ใส่รายละเอียดที่ต้องให้ผู้ใช้ตรวจก่อนตัดสินใจ (รายการที่จะหาย/ส่วนต่าง/ผลกระทบ)
             ไม่มี slot ก็ใช้ message เป็นข้อความธรรมดา -->
        <div class="mt-4 text-left text-sm text-base-content/70">
          <slot>
            <p>{{ message }}</p>
          </slot>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="loading" @click="close">
            {{ cancelText }}
          </button>
          <button
            ref="confirmBtn"
            type="button"
            class="btn"
            :class="theme.btn"
            :disabled="loading"
            @click="confirm"
          >
            <span v-if="loading" class="loading loading-spinner loading-sm"></span>
            {{ confirmText }}
          </button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>
  </Teleport>
</template>
