<script setup lang="ts">
// เมนู "เรียงตาม" - ใช้โครงเดียวกับแผงตัวกรองที่อยู่ข้าง ๆ กันเป๊ะ
//
// ปุ่มกดแล้วกางแผงลงมา เลือกค่าได้ในตัวเอง กดตัวเดิมซ้ำ = กลับไปค่าตั้งต้น ปิดด้วยคลิกนอก
// หรือ Escape - สองอย่างนี้ยืนติดกันบนแถบเดียว ถ้าหน้าตาคนละแบบจะอ่านเป็นของคนละระบบ
//
// ★ ทำเป็น component กลาง ไม่ใช่ copy markup ไปวางสองหน้า - หน้าทะเบียนกับตารางบน
//   Dashboard ใช้ตัวเดียวกัน สำเนาที่ drift กันจะไม่มีอะไรฟ้องจนกว่าจะมีคนสังเกตเอง
//
// ★ ค่าว่าง ('') = ค่าตั้งต้นของ backend (เรียงตามเลขสินทรัพย์) ไม่ใช่ "ไม่ได้เรียง" -
//   ผลลัพธ์มีลำดับเสมอ ปุ่มจึงไม่ต้องมีสถานะ "ปิด"
//
// ★ ทิศทางเป็น v-model แยกอีกตัว (v-model:direction) ไม่ยัดรวมเป็นสตริงเดียวอย่าง
//   'netBookValue:asc' - ฝั่ง backend รับสองพารามิเตอร์อยู่แล้ว การรวมแล้วแกะทีหลัง
//   คือการเพิ่มจุดที่พังโดยไม่ได้อะไรกลับมา
import { computed, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'

export type SortDirection = 'asc' | 'desc'

export interface SortOption {
  /** ค่าที่ส่งไป backend - ต้องตรงกับ union ของ assetInventoryQuery.sort */
  value: string
  label: string
  icon?: string
  /**
   * คำอธิบายทิศทางของแกนนี้ - ไม่ใส่ก็ใช้คำกลาง ๆ ("มาก → น้อย")
   * แกนที่เป็นวันที่ควรใส่เอง เพราะ "มาก" กับ "ใหม่" คนละคำในหัวคนอ่าน
   */
  descLabel?: string
  ascLabel?: string
}

const props = withDefaults(
  defineProps<{
    /** '' = ค่าตั้งต้น */
    modelValue: string
    direction: SortDirection
    options: SortOption[]
    /** ข้อความบนปุ่มตอนยังไม่ได้เลือกอะไร */
    defaultLabel?: string
  }>(),
  { defaultLabel: 'เรียงตาม' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:direction': [value: SortDirection]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const current = computed(() => props.options.find((o) => o.value === props.modelValue))

const descText = computed(() => current.value?.descLabel ?? 'มาก → น้อย')
const ascText = computed(() => current.value?.ascLabel ?? 'น้อย → มาก')

/**
 * กดตัวเดิมซ้ำ = กลับไปค่าตั้งต้น (ทางเดียวที่จะเลิกเรียงได้จากในลิสต์ กติกาเดียวกับตัวกรอง)
 *
 * ★ เปลี่ยนแกนแล้วรีเซ็ตทิศเป็น desc เสมอ - "มาก/ใหม่ก่อน" คือสิ่งที่คนเพิ่งเลือกแกนใหม่
 *   อยากเห็นก่อน ไม่ใช่ทิศที่ค้างมาจากแกนก่อนหน้าซึ่งคนละความหมายกัน
 */
function pick(value: string) {
  if (props.modelValue === value) {
    emit('update:modelValue', '')
    return
  }
  emit('update:modelValue', value)
  if (props.direction !== 'desc') emit('update:direction', 'desc')
}

// ปิดเมื่อคลิกนอกแผง - ไม่ปิดตอนคลิกในแผง ไม่งั้นกดเลือกทีเดียวแผงหุบทุกครั้ง
function onDocumentPointerDown(e: PointerEvent) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
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
    <button
      type="button"
      class="btn btn-sm"
      :class="modelValue ? 'btn-primary' : 'btn'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <!-- ไอคอนบอกทิศตั้งแต่บนปุ่ม ไม่ต้องกางดู - สลับทิศแล้วต้องเห็นว่าเปลี่ยนจริง -->
      <Icon
        :icon="
          !modelValue
            ? 'lucide:arrow-up-down'
            : direction === 'desc'
              ? 'lucide:arrow-down-wide-narrow'
              : 'lucide:arrow-up-narrow-wide'
        "
        class="size-4"
      />
      {{ modelValue ? current?.label : defaultLabel }}
      <Icon
        icon="lucide:chevron-down"
        class="size-4 transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>

    <div
      v-if="open"
      class="absolute left-0 z-30 mt-2 w-56 rounded-box border border-base-300 bg-base-100 text-left shadow-lg"
    >
      <div class="flex items-center justify-between border-b border-base-300 px-3 py-2">
        <span class="text-sm font-semibold">เรียงตาม</span>
        <button
          class="btn btn-ghost btn-xs"
          :disabled="!modelValue"
          @click="emit('update:modelValue', '')"
        >
          ค่าตั้งต้น
        </button>
      </div>

      <ul class="p-1.5">
        <li v-for="o in options" :key="o.value">
          <button
            class="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-left text-sm hover:bg-base-200"
            :class="{ 'bg-primary/10 font-medium': modelValue === o.value }"
            @click="pick(o.value)"
          >
            <Icon
              :icon="modelValue === o.value ? 'lucide:check' : 'lucide:minus'"
              class="size-3.5 shrink-0"
              :class="modelValue === o.value ? 'text-primary' : 'opacity-0'"
            />
            <Icon v-if="o.icon" :icon="o.icon" class="size-4 shrink-0 opacity-60" />
            <span class="truncate">{{ o.label }}</span>
          </button>
        </li>
      </ul>

      <!-- ── ทิศทาง ────────────────────────────────────────────────────────
           ★ จางและกดไม่ได้จนกว่าจะเลือกแกน - ทิศทางของ "ค่าตั้งต้น" ไม่ใช่สิ่งที่
             หน้าจอเปิดให้สลับ (เลขสินทรัพย์เรียง A→Z อย่างเดียว) ปุ่มที่กดแล้ว
             ไม่เกิดอะไรคือปุ่มที่ทำให้คนลังเลว่าตัวเองทำอะไรผิด
           ★ คำอธิบายเปลี่ยนตามแกนที่เลือก - วันที่ใช้ "ใหม่/เก่า" ส่วนตัวเลขใช้
             "มาก/น้อย" (ดู descLabel/ascLabel ของแต่ละตัวเลือก) -->
      <div class="border-t border-base-300 px-3 py-2" :class="{ 'opacity-40': !modelValue }">
        <div class="join w-full">
          <button
            type="button"
            class="btn join-item btn-xs flex-1"
            :class="direction === 'desc' ? 'btn-primary' : ''"
            :disabled="!modelValue"
            @click="emit('update:direction', 'desc')"
          >
            <Icon icon="lucide:arrow-down-wide-narrow" class="size-3.5" />
            {{ descText }}
          </button>
          <button
            type="button"
            class="btn join-item btn-xs flex-1"
            :class="direction === 'asc' ? 'btn-primary' : ''"
            :disabled="!modelValue"
            @click="emit('update:direction', 'asc')"
          >
            <Icon icon="lucide:arrow-up-narrow-wide" class="size-3.5" />
            {{ ascText }}
          </button>
        </div>
      </div>

      <!-- ต้องบอก ไม่งั้นคนกดแล้วงงว่าทำไมของที่ไม่มีตัวเลขไปกองท้ายทั้งสองทิศ -->

    </div>
  </div>
</template>
