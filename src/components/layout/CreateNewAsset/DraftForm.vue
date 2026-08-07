<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import RequestTable from './RequestTable.vue'
import submit from '@/components/common/submit.vue'
import { getAssetRequest, submitRequest } from '@/services/assetRequest.service'
import type { AssetRequestDetail } from '@/services/assetRequest.service'
import { openPresence } from '@/services/presence.service'
import type { PresenceState, PresenceConnection } from '@/services/presence.service'
import { ApiError } from '@/services/httpClient'
import { formatDate } from '@/utils/date'

const props = defineProps<{
  requestId: string
}>()
const router = useRouter()
const draft = ref<AssetRequestDetail | null>(null)
const loading = ref(true)
const loadError = ref('')
const submitError = ref('')
const submitting = ref(false)

const presenceState = ref<PresenceState | null>(null)
let presenceConn: PresenceConnection | null = null

// มีบรรทัดที่ราคารวมเกินยอด PO อยู่ไหม (มาจาก RequestTable) — ถ้ามี ส่งไม่ได้จนกว่าจะแก้
const hasOverCost = ref(false)

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED']
const statusEditable = computed(() =>
  draft.value ? EDITABLE_STATUSES.includes(draft.value.status) : false,
)
const editable = computed(() => statusEditable.value && presenceState.value?.state === 'editable')

const lockBanner = computed(() => {
  if (!draft.value) return ''
  if (!statusEditable.value) return `คำขอนี้อยู่สถานะ ${draft.value.status} จึงเปิดดูได้อย่างเดียว`
  if (presenceState.value?.state === 'pending') {
    return 'PO ใบนี้กำลังถูกใช้โดยผู้อื่น — เปิดดูได้แต่แก้ไขไม่ได้ (จะแก้ได้เมื่อผู้ใช้ก่อนหน้าออก)'
  }
  return ''
})

async function loadDraft() {
  try {
    const detail = await getAssetRequest(Number(props.requestId))
    draft.value = detail

    if (statusEditable.value) {
      openPresenceStream()
      startIdleTimer()
    }
  } catch (e) {
    console.error('โหลดคำขอไม่สำเร็จ:', e)
    loadError.value = 'ไม่พบคำขอนี้ หรือถูกลบไปแล้ว'
  } finally {
    loading.value = false
  }
}

function openPresenceStream() {
  presenceConn = openPresence(Number(props.requestId), {
    onState: (s) => { presenceState.value = s },
    onError: (e) => console.error('presence error:', e),
  })
}

function closePresence() {
  presenceConn?.close()
  presenceConn = null
}

async function onSubmit() {
  if (!draft.value || submitting.value) return
  submitError.value = ''
  submitting.value = true
  try {
    await submitRequest(Number(props.requestId), draft.value.updatedAt)
    closePresence() 
    router.replace({ name: 'DraftList' })
  } catch (e) {
    submitError.value = e instanceof ApiError ? e.message : 'ส่งคำขอไม่สำเร็จ'
  } finally {
    submitting.value = false
  }
}

let idleTimer: ReturnType<typeof setTimeout> | undefined

const idleEvents: Array<keyof WindowEventMap> = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
]

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
  }

  idleTimer = setTimeout(() => {
    closePresence()
    router.replace({ name: 'DraftList' })
  }, 10 * 60 * 1000)
}

function startIdleTimer() {
  idleEvents.forEach((event) => {
    window.addEventListener(event, resetIdleTimer)
  })

  resetIdleTimer()
}

function stopIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }

  idleEvents.forEach((event) => {
    window.removeEventListener(event, resetIdleTimer)
  })
}


onMounted(loadDraft)

onBeforeRouteLeave(() => {
  stopIdleTimer()
  closePresence()
})

onUnmounted(() => {
  stopIdleTimer()
  closePresence()
})
</script>

<template>
  <div class="min-h-screen grid grid-rows-[auto_auto_auto_1fr] gap-[10px] bg-white min-w-[600px]">
    <div class="m-6 grid min-h-[100px] px-4 py-5 sm:px-[50px]">
      <h1 class="text-left text-[28px] sm:text-[36px] text-[var(--primary-color)]">
        Create New Asset
      </h1>

      <p class="pl-2.5 text-left text-[var(--secondary-color)]">
        สร้างคำขอขึ้นทะเบียนสินทรัพย์ใหม่
      </p>
    </div>

    <!-- โหลดอยู่ -->
    <section v-if="loading" class="mx-4 md:mx-10 lg:mx-20 py-16 text-center text-[var(--secondary-color)]">
      <i class="fa-solid fa-spinner animate-spin mr-2" />กำลังโหลดคำขอ...
    </section>

    <!-- เปิดใบไม่ได้ (id มั่ว / ถูกลบ) -->
    <section v-else-if="loadError" class="mx-4 md:mx-10 lg:mx-20 py-16 text-center">
      <p class="mb-4 text-red-500">{{ loadError }}</p>
      <button type="button" class="rounded-[16px] bg-[var(--primary-color)] px-4 py-2 text-white hover:opacity-90"
        @click="router.replace({ name: 'DraftList' })">
        กลับหน้ารายการคำขอ
      </button>
    </section>

    <!-- เนื้อฟอร์ม — draft โหลดสำเร็จแล้วเท่านั้น -->
    <template v-else-if="draft">
      <!-- banner แจ้งเมื่อแก้ไม่ได้ (คนอื่นถือ lock / ส่งไปแล้ว) -->
      <div v-if="lockBanner"
        class="mx-4 md:mx-10 lg:mx-20 flex items-center gap-3 rounded-[12px] border border-[var(--pending)] bg-amber-50 px-5 py-3 text-[var(--lock-state)]">
        <i class="fa-solid fa-lock" />
        <span class="text-sm">{{ lockBanner }}</span>
      </div>

      <!-- PO ของ draft — อ่านอย่างเดียว (PO ผูกกับ draft ตายตัวตั้งแต่ตอนสร้าง เปลี่ยนไม่ได้) -->
      <section class="mx-4 md:mx-10 lg:mx-20">
        <div class="card ">
          <div class="flex flex-col items-start min-w-0 w-full">
            <div class="flex flex-col items-start min-w-0 w-full">
              <div class="flex justify-between items-start w-full">
                <div>
                  <h2 class="text-xl text-[var(--primary-color)] text-left">
                    รายละเอียดใบสั่งซื้อ (Purchase Order)
                  </h2>

                  <p class="mb-4 text-sm text-[var(--secondary-color)] text-left">
                    ข้อมูลการสั่งซื้อของคำขอนี้
                  </p>
                </div>

                <span class="text-sm text-[var(--secondary-color)]">
                  Request No. {{ draft.id }}
                </span>
              </div>
            </div>
            <div class="grid w-full gap-4 md:grid-cols-4 text-left mt-8">
              <div>
                <p class="text-sm text-gray-500">PO Number</p>
                <p> {{ draft.poNumber }}</p>
              </div>

              <div>
                <p class="text-sm text-gray-500">ขอซื้อโดย</p>
                <p> {{ draft.purchaseOrder.requesterName }}</p>
              </div>

              <div>
                <p class="text-sm text-gray-500">Vendor</p>
                <p> {{ draft.purchaseOrder.vendorName }}</p>
              </div>

              <div>
                <p class="text-sm text-gray-500">PO Date</p>
                <p> {{ formatDate(draft.purchaseOrder.poDate) }}</p>
              </div>

            </div>
          </div>
        </div>
      </section>

      <section class="mx-4 md:mx-10 lg:mx-20">
        <RequestTable :request-id="Number(requestId)" :editable="editable" @over-cost="hasOverCost = $event" />
      </section>

      <footer class="h-[150px] mx-20">
        <p v-if="submitError" class="text-right text-sm text-red-500 mb-2">{{ submitError }}</p>
        <p v-else-if="hasOverCost" class="text-right text-sm text-[var(--pending)] mb-2">
          มีบรรทัดที่ราคารวมเกินยอด PO — แก้ราคาให้ไม่เกินก่อนจึงจะส่งได้
        </p>
        <submit :editable="editable && !submitting && !hasOverCost" @cancel="router.replace({ name: 'DraftList' })"
          @submit="onSubmit" />
      </footer>
    </template>
  </div>
</template>
