<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { listPurchaseOrders, getPurchaseOrderByNumber } from '@/services/purchaseOrder.service'
import { ApiError } from '@/services/httpClient'
import type { PurchaseOrderSummary } from '@/services/purchaseOrder.service'

const props = withDefaults(
  defineProps<{
    widthClass?: string
    label?: string
    invalid?: boolean
  }>(),
  { widthClass: 'w-full max-w-[560px]' },
)

const emit = defineEmits<{
  (e: 'select', poNumber: string): void
}>()

const query = ref('')
const results = ref<PurchaseOrderSummary[]>([])
const loading = ref(false)
const notFound = ref(false)
const isOpen = ref(false)
const searchRef = ref<HTMLElement | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let requestSeq = 0 
let emptyPrefix: string | null = null

function extendsEmptyPrefix(q: string): boolean {
  return emptyPrefix !== null && q.toLowerCase().startsWith(emptyPrefix.toLowerCase())
}

async function runSearch(search: string) {
  const seq = ++requestSeq
  loading.value = true
  try {
    const page = await listPurchaseOrders({ search: search || undefined, limit: 6})
    if (seq !== requestSeq) return // มี search ใหม่กว่าเกิดขึ้นระหว่างรอ — ทิ้งผลนี้
    results.value = page.data
    // จำคำที่ค้นแล้วว่าง (เฉพาะผลจริงจาก server ไม่นับ error) — watch ใช้ตัดสินว่าไม่ต้องยิงซ้ำ
    emptyPrefix = search && page.data.length === 0 ? search : null
  } catch (e) {
    if (seq !== requestSeq) return
    console.error('ค้นหา PO ไม่สำเร็จ:', e)
    results.value = []
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(query, (q) => {
  notFound.value = false
  clearTimeout(debounceTimer)
  const trimmed = q.trim()
  if (trimmed && extendsEmptyPrefix(trimmed)) {
    results.value = []
    return
  }
  debounceTimer = setTimeout(() => runSearch(trimmed), 50)
})

onMounted(() => runSearch(''))

function selectPO(po: PurchaseOrderSummary) {
  query.value = po.poNumber
  isOpen.value = false
  emit('select', po.poNumber)
}
async function searchPO() {
  const q = query.value.trim()
  if (!q) return
  if (extendsEmptyPrefix(q)) {
    notFound.value = true
    isOpen.value = true
    return
  }

  loading.value = true
  notFound.value = false
  try {
    const po = await getPurchaseOrderByNumber(q)
    isOpen.value = false
    emit('select', po.poNumber)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      notFound.value = true
      isOpen.value = true
    } else {
      console.error('ค้นหา PO ไม่สำเร็จ:', e)
    }
  } finally {
    loading.value = false
  }
}

// ปิด dropdown เมื่อ click นอก
function handleClickOutside(e: MouseEvent) {
  if (searchRef.value && !searchRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))

defineExpose({
  clearQuery() {
    query.value = ''
    results.value = []
    notFound.value = false
    isOpen.value = false
    emptyPrefix = null
  },
})
</script>

<template>
 
</template>


