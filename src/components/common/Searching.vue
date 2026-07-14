<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { listPurchaseOrders, getPurchaseOrderByNumber } from '@/services/purchaseOrderApi'
import { ApiError } from '@/services/httpClient'
import type { PurchaseOrderSummary } from '@/services/purchaseOrderApi'

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
let requestSeq = 0 // กันผล search เก่ากลับมาทับผล search ใหม่ (race condition)

// จำ prefix ล่าสุดที่ค้นแล้วได้ 0 ผล — พิมพ์ต่อยอดจาก prefix นี้ไม่ต้องยิงซ้ำ
// ใช้ได้เพราะ backend ค้นแบบ startsWith เท่านั้น: prefix สั้นไม่เจอ → prefix ยาวกว่าย่อมไม่เจอ
// (เทียบแบบ lowercase ให้ตรงกับ ilike ของ backend)
let emptyPrefix: string | null = null

function extendsEmptyPrefix(q: string): boolean {
  return emptyPrefix !== null && q.toLowerCase().startsWith(emptyPrefix.toLowerCase())
}

async function runSearch(search: string) {
  const seq = ++requestSeq
  loading.value = true
  try {
    const page = await listPurchaseOrders({ search: search || undefined, limit: 10})
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
  // ต่อยอดจากคำที่รู้แล้วว่าว่าง → สรุป "ไม่พบ" ได้ทันทีโดยไม่ยิง request
  if (trimmed && extendsEmptyPrefix(trimmed)) {
    results.value = []
    return
  }
  debounceTimer = setTimeout(() => runSearch(trimmed), 100)
})

// โฟกัสครั้งแรกโดยยังไม่พิมพ์ → โชว์ผลล่าสุด 8 ใบ
onMounted(() => runSearch(''))

function selectPO(po: PurchaseOrderSummary) {
  query.value = po.poNumber
  isOpen.value = false
  emit('select', po.poNumber)
}

// กด Enter: ขอ PO ตรงเลขที่พิมพ์ทันที ไม่ต้องรอ debounce ของ dropdown
async function searchPO() {
  const q = query.value.trim()
  if (!q) return

  // exact match เป็น subset ของ startsWith — ถ้า search ว่าง exact ย่อมไม่เจอเช่นกัน ตอบได้เลยไม่ต้องยิง
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

// ให้ parent (PurchaseOrder.vue) เคลียร์ query ได้ตอนกด Close — ไม่งั้น query เดิมค้างแล้วพิมพ์ต่อจะรวมกับข้อความใหม่
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
  <div ref="searchRef" class="relative w-full max-w-[560px]">
    <!-- ป้ายไม่พบ PO — เฉพาะกด Enter/ปุ่ม Search เท่านั้น ไม่นับตอนพิมพ์ (dropdown จัดการเอง) -->
    <span
      v-if="notFound"
      class="absolute -top-3 right-2 z-20 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-500 shadow-sm"
    >
      ไม่พบ PO "{{ query }}"
    </span>

    <!-- Input -->
    <input
      type="text"
      v-model="query"
      @keyup.enter="searchPO"
      @focus="isOpen = true"
      @input="isOpen = true"
      placeholder="Search PO number..."
      class="w-full rounded-[16px] border px-3 py-2 pr-10"
    />
    <!-- Icon -->
    <button
      type="button"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      aria-label="Search"
      @click="searchPO"
    >
      <i v-if="loading" class="fa-solid fa-spinner animate-spin" />
      <i v-else class="fa-solid fa-magnifying-glass" />
    </button>

    <!-- Dropdown -->
    <ul
      v-if="isOpen && results.length"
      class="absolute z-10 mt-1 w-full rounded-xl border bg-white shadow-lg text-left"
    >
      <li
        v-for="po in results"
        :key="po.poNumber"
        @mousedown.prevent="selectPO(po)"
        class="cursor-pointer px-4 py-2 hover:bg-gray-100"
      >
        <span class="font-medium text-[var(--primary-color)]">{{ po.poNumber }}</span>
        <span class="ml-2 text-sm text-gray-500">{{ po.vendorName}}</span>
      </li>
    </ul>

    <!-- ไม่พบผลลัพธ์ระหว่างพิมพ์ (dropdown) -->
    <div
      v-if="isOpen && !loading && query && !results.length"
      class="absolute z-10 mt-1 w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-400 shadow-lg truncate"
    >
      ไม่พบ PO "{{ query }}"
    </div>
  </div>
</template>