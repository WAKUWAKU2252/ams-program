<script setup lang="ts">
// Pagination กลาง — คุมด้วย page/total/limit (ตรงกับ envelope Paginated<T> ของ backend)
// ไม่ถือ state เอง: parent เป็นเจ้าของ page แล้วฟัง @update:page ไปโหลดหน้าใหม่
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  page: number
  total: number
  limit: number
}>()

const emit = defineEmits<{
  (e: 'update:page', page: number): void
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)))

// เลขหน้าแบบมี ... ย่อ (โชว์ครบถ้า <= 7 หน้า, ไม่งั้นย่อหัว-กลาง-ท้าย)
const pages = computed<(number | '...')[]>(() => {
  const tp = totalPages.value
  const cur = props.page
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)

  const out: (number | '...')[] = [1]
  const start = Math.max(2, cur - 1)
  const end = Math.min(tp - 1, cur + 1)
  if (start > 2) out.push('...')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < tp - 1) out.push('...')
  out.push(tp)
  return out
})

function go(p: number) {
  if (p < 1 || p > totalPages.value || p === props.page) return
  emit('update:page', p)
}
</script>

<template>
  <!-- ซ่อนทั้งแถบถ้ามีหน้าเดียว -->
  <nav v-if="totalPages > 1" class="flex select-none justify-center">
    <div class="join">
      <button
        type="button"
        class="btn btn-sm join-item"
        aria-label="หน้าก่อนหน้า"
        :disabled="page <= 1"
        @click="go(page - 1)"
      >
        <Icon icon="lucide:chevron-left" />
      </button>

      <template v-for="(p, i) in pages" :key="i">
        <button v-if="p === '...'" type="button" class="btn btn-sm join-item btn-disabled">…</button>
        <button
          v-else
          type="button"
          class="btn btn-sm join-item"
          :class="{ 'btn-active btn-primary': p === page }"
          @click="go(p)"
        >
          {{ p }}
        </button>
      </template>

      <button
        type="button"
        class="btn btn-sm join-item"
        aria-label="หน้าถัดไป"
        :disabled="page >= totalPages"
        @click="go(page + 1)"
      >
        <Icon icon="lucide:chevron-right" />
      </button>
    </div>
  </nav>
</template>
