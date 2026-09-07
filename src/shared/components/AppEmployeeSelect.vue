<script setup lang="ts">
// เลือกผู้ถือครองสินทรัพย์ — dropdown ที่มีช่องค้นอยู่ในตัว
//
// ทำแบบเดียวกับ Searching.vue (ค้น PO): ดึงมาชุดเดียวแล้วให้พิมพ์ค้นเพื่อกรองให้แคบลง
// ไม่มีแถบเลขหน้า — /master/employees แบ่งหน้าอยู่ก็จริง แต่หน้าจอนี้ขอแค่หน้าแรก
// เพราะคนหาพนักงานจะพิมพ์ชื่อ ไม่ได้ไล่พลิกหน้าทีละ 8 คนจนครบ 257 คน
import { ref, watch, onMounted, onUnmounted, useId, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { listEmployees, type EmployeeOption } from '@/services/master.service'

const props = withDefaults(
  defineProps<{
    modelValue: number
    disabled?: boolean
    placeholder?: string
    departmentId?: number
  }>(),
  { disabled: false, placeholder: 'เลือกผู้ถือครอง', departmentId: undefined },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>()

const LIMIT = 8

const uid = useId()
const popoverId = `empselect-${uid}`
const anchorName = `--empselect-${uid}`

const rootRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

const query = ref('')
const rows = ref<EmployeeOption[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')

const selectedName = ref('')

const hiddenCount = computed(() => Math.max(0, total.value - rows.value.length))

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let requestSeq = 0 

async function load() {
  const seq = ++requestSeq
  loading.value = true
  loadError.value = ''
  try {
    const res = await listEmployees({
      search: query.value.trim() || undefined,
      departmentId: props.departmentId,
      page: 1,
      limit: LIMIT,
    })
    if (seq !== requestSeq) return // มี request ใหม่กว่าเกิดขึ้นระหว่างรอ — ทิ้งผลนี้
    rows.value = res.data
    total.value = res.total
  } catch (e) {
    if (seq !== requestSeq) return
    console.error('โหลดรายชื่อพนักงานไม่สำเร็จ:', e)
    rows.value = []
    total.value = 0
    loadError.value = 'โหลดรายชื่อไม่สำเร็จ'
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(query, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 300)
})

// เปลี่ยนแผนกที่กรองอยู่ → ผลชุดเดิมใช้ไม่ได้แล้ว
watch(() => props.departmentId, load)

function select(emp: EmployeeOption) {
  selectedName.value = emp.name
  emit('update:modelValue', emp.id)
  popoverRef.value?.hidePopover()
}

function clear() {
  selectedName.value = ''
  emit('update:modelValue', 0)
}

/**
 * แปลง id ที่ parent ส่งมาให้เป็นชื่อ — ใช้ตอนฟอร์มโหลดผู้ถือครองเดิมของ asset มา
 *
 * selectedName ถูกเซ็ตเฉพาะตอนผู้ใช้คลิกเลือกเท่านั้น ค่าที่มาจาก DB จึงไม่มีชื่อคู่มาด้วย
 * ถ้าไม่ยิงถามชื่อ ปุ่มจะโชว์ placeholder ทั้งที่ในฐานข้อมูลมีผู้ถือครองอยู่จริง
 * — ผู้ใช้จะเข้าใจว่ายังไม่เคยกรอก แล้วกดบันทึกทับด้วยค่าว่าง
 *
 * includeInactive: true — คนที่ลาออกแล้วยังต้องรู้ว่าเคยถือครองอะไรอยู่
 * (ค่าเริ่มต้นกรองคนที่ปิดใช้งานออก ซึ่งจะทำให้ชื่อหายไปเฉพาะคนกลุ่มนั้น)
 */
async function resolveName(id: number) {
  try {
    const res = await listEmployees({ id, includeInactive: true, page: 1, limit: 1 })
    // ระหว่างรอ ผู้ใช้อาจเลือกคนอื่นหรือกดล้างไปแล้ว — ห้ามเขียนทับของใหม่ด้วยของเก่า
    if (props.modelValue !== id) return
    selectedName.value = res.data[0]?.name ?? ''
  } catch (e) {
    console.error('หาชื่อผู้ถือครองไม่สำเร็จ:', e)
  }
}

// parent เคลียร์ค่า (เช่นเปิด modal ใหม่) → ชื่อที่โชว์ต้องหายตาม
// parent ส่ง id มา (โหลดข้อมูลเดิม) → ต้องไปหาชื่อมาแสดง
watch(
  () => props.modelValue,
  (v) => {
    if (v === 0) selectedName.value = ''
    else if (!selectedName.value) void resolveName(v)
  },
  { immediate: true },
)

// ปิด popover เมื่อคลิกนอก — popover API ปิดให้เองเฉพาะ light dismiss ซึ่งใช้ไม่ได้
// เมื่ออยู่ใน modal ที่ดักคลิกไว้
function onClickOutside(e: MouseEvent) {
  if (!rootRef.value?.contains(e.target as Node)) popoverRef.value?.hidePopover()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  load()
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
  clearTimeout(debounceTimer)
})
</script>

<template>
  <div ref="rootRef" class="w-full">
    <button
      type="button"
      class="input w-full cursor-pointer text-left"
      :popovertarget="popoverId"
      :disabled="disabled"
      :style="{ anchorName }"
    >
      <Icon icon="lucide:user" class="opacity-60" />
      <span class="grow truncate" :class="{ 'text-base-content/40': !selectedName }">
        <!-- เลือกไว้แต่ไม่รู้ชื่อ = ค่ามาจากข้อมูลเดิมที่ยังไม่ได้เปิด dropdown หาชื่อ -->
        {{ selectedName || (modelValue > 0 ? `ค้นชื่อหรือรหัสพนักงาน` : placeholder) }}
      </span>
      <span
        v-if="modelValue > 0 && !disabled"
        role="button"
        tabindex="0"
        class="btn btn-ghost btn-xs btn-square"
        aria-label="ล้างผู้ถือครอง"
        @click.stop="clear"
        @keydown.enter.stop="clear"
      >
        <Icon icon="lucide:x" />
      </span>
    </button>

    <div
      :id="popoverId"
      ref="popoverRef"
      popover
      class="dropdown w-80 rounded-box bg-base-100 p-2 shadow-lg"
      :style="{ positionAnchor: anchorName }"
    >
      <label class="input input-sm w-full">
        <Icon icon="lucide:search" class="opacity-60" />
        <input v-model="query" type="search" placeholder="ค้นชื่อ หรือรหัสพนักงาน" />
        <span v-if="loading" class="loading loading-spinner loading-xs"></span>
      </label>

      <ul class="menu menu-sm w-full flex-nowrap px-0">
        <li v-for="emp in rows" :key="emp.id">
          <a :class="{ 'menu-active': emp.id === modelValue }" @click="select(emp)">
            <!-- empId ว่างได้ (HR ยังไม่ให้รหัสบางคน) — ไม่งั้นจะขึ้นเป็น " - ชื่อ" ห้อยไว้ -->
            <span class="font-mono text-xs opacity-60">{{ emp.empId || '-------' }}</span>
            <span class="truncate">{{ emp.name }}</span>
          </a>
        </li>
      </ul>

      <p v-if="loadError" class="px-2 py-3 text-center text-sm text-error">{{ loadError }}</p>
      <p v-else-if="!loading && !rows.length" class="px-2 py-3 text-center text-sm text-base-content/50">
        {{ query ? `ไม่พบพนักงานที่ตรงกับ "${query}"` : 'ไม่มีรายชื่อ' }}
      </p>
      <p v-else-if="hiddenCount" class="px-2 pb-1 pt-2 text-center text-xs text-base-content/50">
        {{ rows.length }} จาก {{ total }} คน 
      </p>
    </div>
  </div>
</template>
