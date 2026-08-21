<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { listPurchaseOrders } from '@/services/purchaseOrder.service'
import type { PurchaseOrderSummary } from '@/services/purchaseOrder.service'

const props = withDefaults(
  defineProps<{
    // class คุมความกว้างกล่อง search ทั้งก้อน — ส่งได้ทั้ง w-/min-w-/max-w-
    // เช่น 'w-[100px]', 'w-full max-w-[560px]', 'min-w-[100px] w-auto'
    widthClass?: string
    // ป้ายกำกับเหนือช่อง search (ไม่ส่ง = ไม่มี label)
    label?: string
    // parent สั่งให้ขอบ input แดง (เช่น validation ยังไม่ได้เลือก PO)
    invalid?: boolean
  }>(),
  { widthClass: 'w-full max-w-lg' },
)

const emit = defineEmits<{
  (e: 'select', po: PurchaseOrderSummary): void
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
  // ต่อยอดจากคำที่รู้แล้วว่าว่าง → สรุป "ไม่พบ" ได้ทันทีโดยไม่ยิง request
  if (trimmed && extendsEmptyPrefix(trimmed)) {
    results.value = []
    return
  }
  debounceTimer = setTimeout(() => runSearch(trimmed), 50)
})

// โฟกัสครั้งแรกโดยยังไม่พิมพ์ → โชว์ผลล่าสุด 8 ใบ
onMounted(() => runSearch(''))

function selectPO(po: PurchaseOrderSummary) {
  query.value = po.poNumber
  isOpen.value = false
  emit('select', po)
}

// กด Enter: หา PO ที่เลขตรงเป๊ะจากผลค้นหา — ใช้เส้น search เส้นเดียว ไม่ยิง /:poNumber ซ้ำ
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
    const page = await listPurchaseOrders({ search: q, limit: 6 })
    const exact = page.data.find((po) => po.poNumber.toLowerCase() === q.toLowerCase())
    if (exact) {
      isOpen.value = false
      emit('select', exact)
    } else {
      notFound.value = true
      isOpen.value = true
    }
  } catch (e) {
    console.error('ค้นหา PO ไม่สำเร็จ:', e)
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
  <!-- ตัวนอก: คุมความกว้าง + เป็นขอบเขต click-outside (ผ่าน searchRef) -->
  <div ref="searchRef" :class="props.widthClass">
    <!-- label อยู่นอกกรอบ relative — ไม่ไปดึงจุดกึ่งกลางของ icon/dropdown -->
    <label v-if="label" for="po-search" class="label mb-1 text-sm font-medium">
      {{ label }}
    </label>

    <!-- กรอบ relative เฉพาะ input+icon+dropdown → icon/dropdown อิงจาก input เท่านั้น -->
    <div class="relative">
      <label
        class="input w-full"
        :class="notFound || invalid ? 'input-error shake' : ''"
      >
        <input
          id="po-search"
          v-model="query"
          type="text"
          placeholder="Search PO number..."
          @keyup.enter="searchPO"
          @focus="isOpen = true"
          @input="isOpen = true"
        />
        <button type="button" class="btn btn-ghost btn-xs btn-square" aria-label="Search" @click="searchPO">
          <span v-if="loading" class="loading loading-spinner loading-xs"></span>
          <Icon v-else icon="lucide:search" class="opacity-60" />
        </button>
      </label>

      <!-- Dropdown ผลค้นหา -->
      <ul
        v-if="isOpen && results.length"
        class="menu absolute z-20 mt-1 w-full rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
      >
        <li v-for="po in results" :key="po.poNumber">
          <a @mousedown.prevent="selectPO(po)">
            <span class="font-mono font-medium">{{ po.poNumber }}</span>
            <span class="truncate text-sm text-base-content/60">{{ po.vendorName }}</span>
          </a>
        </li>
      </ul>

      <!-- ไม่พบผลลัพธ์ระหว่างพิมพ์ (dropdown) -->
      <div
        v-if="isOpen && !loading && query && !results.length"
        class="absolute z-20 mt-1 w-full truncate rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm text-base-content/50 shadow-lg"
      >
        ไม่พบ PO "{{ query }}"
      </div>
    </div>
  </div>
</template>


