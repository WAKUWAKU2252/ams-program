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
import { requestStatusMeta } from '@/utils/request-status'
import type { RejectedPiece } from '@/types/rejected-piece'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  requestId: string
}>()
const router = useRouter()
const draft = ref<AssetRequestDetail | null>(null)
const loading = ref(true)
const loadError = ref('')
const submitError = ref('')
// คนละอันกับ submitError — คำขอ "ส่งสำเร็จแล้ว" แต่แจ้งเตือนเข้า Teams ไม่ผ่าน
// ต้องแยกให้ชัด ไม่งั้นผู้ใช้เห็นข้อความแดงแล้วกดส่งซ้ำทั้งที่ส่งไปแล้ว
const notifyWarning = ref('')
const submitting = ref(false)

const presenceState = ref<PresenceState | null>(null)
let presenceConn: PresenceConnection | null = null

// มีบรรทัดที่ราคารวมเกินยอด PO อยู่ไหม (มาจาก RequestTable) — ถ้ามี ส่งไม่ได้จนกว่าจะแก้
const hasOverCost = ref(false)

// ชิ้นที่บัญชีตีกลับและยังรอแก้ (มาจาก RequestTable ซึ่งเป็นแหล่งเดียวของ slots)
// piecesChecked แยกจาก length === 0 เพราะสองอย่างนี้คนละความหมาย: "ตรวจแล้วไม่มี" กับ
// "ยังไม่รู้" — ถ้าไม่แยก banner จะประกาศว่าไม่มีอะไรต้องแก้ระหว่างที่ตารางยังโหลดอยู่
const rejectedPieces = ref<RejectedPiece[]>([])
const piecesChecked = ref(false)

function onRejectedPieces(pieces: RejectedPiece[]) {
  rejectedPieces.value = pieces
  piecesChecked.value = true
}

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED']
const statusEditable = computed(() =>
  draft.value ? EDITABLE_STATUSES.includes(draft.value.status) : false,
)

/**
 * ใบที่อนุมัติแล้วยัง "แก้ได้บางส่วน" — เฉพาะชิ้นที่บัญชีตีกลับเท่านั้น
 *
 * การตีกลับรายชิ้นไม่เปลี่ยนสถานะใบ (ใบยังเป็น APPROVED) ถ้าหน้าจอบล็อกทั้งใบตามสถานะ
 * เหมือนเดิม ชิ้นที่บัญชีสั่งให้แก้จะไม่มีใครแก้ได้เลย แล้ววงจร "ตีกลับ → แก้ → กลับเข้าคิว"
 * ตันตรงกลาง (backend เปิดทางไว้แล้วด้วยเงื่อนไข status=APPROVED && asset.rejectedAt != null)
 *
 * ★ ห้ามขยายเป็น "แก้ได้ทั้งใบ" เด็ดขาด — ชิ้นอื่นในใบนี้ผ่านการอนุมัติของหัวหน้าไปแล้ว
 * ถ้าแก้ราคา/สเปกได้โดยไม่ต้องขออนุมัติใหม่ การอนุมัติจะไม่เหลือความหมาย
 */
const rejectedOnly = computed(() => draft.value?.status === 'APPROVED')
/** ขอบเขตที่แก้ได้ — RequestTable เอาไปตัดสินรายชิ้นอีกที */
const editableScope = computed<'all' | 'rejected'>(() => (statusEditable.value ? 'all' : 'rejected'))
// presence (กันสองคนแก้ใบเดียวกันพร้อมกัน) ใช้กับทั้งสองโหมด — การแก้ชิ้นที่ถูกตีกลับ
// ก็ชนกันได้เหมือนกัน
const editable = computed(
  () => (statusEditable.value || rejectedOnly.value) && presenceState.value?.state === 'editable',
)

const lockBanner = computed(() => {
  if (!draft.value) return ''
  if (!statusEditable.value && !rejectedOnly.value) {
    // ป้ายเดียวกับที่หน้ารายการใช้ — ผู้ใช้เพิ่งเห็น "Approved" ในตารางแล้วกดเข้ามา
    // ถ้าตรงนี้ขึ้น "APPROVED" ดิบ ๆ จะอ่านเหมือนคนละสถานะ
    return `คำขอนี้อยู่สถานะ ${requestStatusMeta(draft.value.status).label} เปิดดูได้อย่างเดียว`
  }
  if (presenceState.value?.state === 'pending') {
    return 'PO ใบนี้กำลังถูกใช้โดยผู้อื่น เปิดดูได้แต่แก้ไขไม่ได้ แก้ได้เมื่อผู้ใช้ก่อนหน้าออก'
  }
  if (rejectedOnly.value) {
    // ★ ใบอนุมัติแล้วแต่บัญชียังไม่ได้ตีกลับอะไร = ไม่มีอะไรให้แก้จริง ๆ ต้องพูดให้ตรง
    //   ข้อความ "แก้ได้เฉพาะชิ้นที่ตีกลับ" ในสภาพนั้นทำให้ผู้ขอไปนั่งไล่หาชิ้นที่ไม่มีอยู่
    // เลขชิ้นถูกต่อท้ายข้อความนี้ใน template (badge) — ไม่ต้องบอกให้ไปดูที่อื่น
    if (rejectedPieces.value.length > 0) {
      return 'คำขอนี้อนุมัติแล้ว แก้ได้เฉพาะชิ้นที่บัญชีตีกลับ รายการ:'
    }
    if (!piecesChecked.value) return 'คำขอนี้อนุมัติแล้ว — กำลังตรวจว่ามีชิ้นที่ต้องแก้ไหม'
    return 'คำขอนี้อนุมัติแล้ว รอบัญชีออกเลขสินทรัพย์ — ยังไม่มีชิ้นที่ต้องแก้'
  }
  return ''
})

async function loadDraft() {
  try {
    // GET /asset-requests/:id คืนแผนก/หัวหน้าของผู้ขอซื้อมาให้ในตัวแล้ว
    // (เดิมต้องยิง GET /purchase-orders/:poNumber ซ้ำอีกรอบแล้วคัดลอกทีละช่องมายัดใส่
    //  ซึ่งลืม departmentName ไปจริง ๆ แล้วค่าเป็น undefined โดยไม่มีอะไรฟ้อง —
    //  ห้ามกลับไปทำแบบนั้นอีก ถ้าขาดช่องไหนให้ไปเพิ่มที่ backend)
    draft.value = await getAssetRequest(Number(props.requestId))

    // เปิด presence ให้โหมด "แก้เฉพาะชิ้นที่ตีกลับ" ด้วย ไม่งั้น presenceState เป็น null
    // แล้ว editable จะ false ตลอด (ปุ่มแก้ไม่ติดทั้งที่ควรแก้ได้)
    if (statusEditable.value || rejectedOnly.value) {
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
    // ใบนี้ถูกเปลี่ยนโดยคนอื่น — ที่พบจริงคือหัวหน้ากดอนุมัติ/ตีกลับ หรือบัญชีตีกลับรายชิ้น
    // ระหว่างที่ผู้ขอยังเปิดหน้านี้ค้างอยู่ (ก้อนที่ตัวเองทำถูกกรองที่ presence.service แล้ว)
    onStatus: () => scheduleRemoteRefresh(),
    onError: (e) => console.error('presence error:', e),
  })
}

// ── มีคนอื่นเปลี่ยนใบนี้ → โหลดใหม่ทั้งหัวใบและตารางรายชิ้น ──────────────────
//
// หัวใบ (สถานะ/เหตุผลที่ตีกลับ) กับตารางรายชิ้นเป็นสองแหล่ง ต้องโหลดคู่กันเสมอ ไม่งั้นจะได้
// จอที่ป้ายบนหัวว่า "อนุมัติแล้ว" แต่ตารางยังให้แก้ได้อยู่ (หรือกลับกัน) ซึ่งอ่านไม่ออกเลยว่า
// อันไหนคือความจริง — ตัวตารางกันไม่ให้โหลดทับกล่องที่เปิดอยู่ด้วยตัวมันเองอีกชั้น
const tableRef = ref<{ reloadFromRemote: () => Promise<void> } | null>(null)
let remoteTimer: ReturnType<typeof setTimeout> | undefined

/** รวบหลายก้อนเป็นการโหลดครั้งเดียว — บัญชีตัดสินทีละชิ้นรัว ๆ ได้ */
function scheduleRemoteRefresh() {
  if (remoteTimer) clearTimeout(remoteTimer)
  remoteTimer = setTimeout(() => {
    remoteTimer = undefined
    void refreshFromRemote()
  }, 400)
}

async function refreshFromRemote() {
  try {
    // ไม่แตะ loading — จอไม่ควรกระพริบเป็นสปินเนอร์เพราะคนอื่นกดปุ่ม
    // ไม่ต้องเก็บข้อมูลแผนก/หัวหน้าข้ามรอบแล้ว — เส้นนี้คืนมาให้ครบเหมือน loadDraft
    draft.value = await getAssetRequest(Number(props.requestId))
  } catch (e) {
    console.error('โหลดคำขอใหม่ไม่สำเร็จ:', e)
  }
  await tableRef.value?.reloadFromRemote()
}

function closePresence() {
  presenceConn?.close()
  presenceConn = null
}
async function onSubmit() {
  if (!draft.value || submitting.value) return
  submitError.value = ''
  notifyWarning.value = ''
  submitting.value = true
  try {
    // call เดียวจบ — backend เปลี่ยนสถานะ แจ้ง Teams และบันทึกผลการแจ้งให้ในทีเดียว
    // (เดิมยิง notifyTeams() ต่อเองที่นี่ ซึ่งขาดกลางคันได้แล้วใบค้างโดยไม่มีใครรู้)
    const res = await submitRequest(Number(props.requestId), draft.value.updatedAt)
    if (!res.notified) {
      notifyWarning.value = `ส่งคำขอแล้ว แต่แจ้งเตือนเข้า Teams ไม่สำเร็จ — ${res.notifyError ?? 'ไม่ทราบสาเหตุ'} (แจ้งผู้อนุมัติด้วยวิธีอื่นด้วย)`
    }
    closePresence()
    // แจ้งเตือนพลาดแล้วเด้งออกทันทีผู้ใช้จะไม่ทันเห็นข้อความ — ค้างไว้ให้อ่านก่อน
    if (notifyWarning.value) return
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
  if (remoteTimer) clearTimeout(remoteTimer)
})


</script>

<template>
  <div class="grid min-h-screen min-w-[600px] grid-rows-[auto_auto_auto_1fr] gap-3 bg-base-100">
    <div class="px-4 pb-2 pt-8 text-left md:px-10 lg:px-20">
      <h1 class="text-3xl font-semibold sm:text-4xl">Create New Asset</h1>
      <p class="text-base-content/70">สร้างคำขอขึ้นทะเบียนสินทรัพย์ใหม่</p>
    </div>

    <!-- โหลดอยู่ -->
    <section v-if="loading" class="mx-4 flex items-center justify-center gap-2 py-16 text-base-content/70 md:mx-10 lg:mx-20">
      <span class="loading loading-spinner loading-md"></span>กำลังโหลดคำขอ...
    </section>

    <!-- เปิดใบไม่ได้ (id มั่ว / ถูกลบ) -->
    <section v-else-if="loadError" class="mx-4 py-16 text-center md:mx-10 lg:mx-20">
      <div role="alert" class="alert alert-error alert-soft mx-auto mb-4 max-w-md">
        <Icon icon="lucide:circle-alert" />
        <span>{{ loadError }}</span>
      </div>
      <button type="button" class="btn btn-primary" @click="router.replace({ name: 'DraftList' })">
        กลับหน้ารายการคำขอ
      </button>
    </section>

    <!-- เนื้อฟอร์ม — draft โหลดสำเร็จแล้วเท่านั้น -->
    <template v-else-if="draft">
      <!-- banner แจ้งเมื่อแก้ไม่ได้ (คนอื่นถือ lock / ส่งไปแล้ว) พร้อมเลขชิ้นที่ต้องแก้ต่อท้าย
           อยู่ใน alert เดียวกันโดยตั้งใจ — เป็นประโยคเดียวที่อ่านต่อกัน ("แก้ได้เฉพาะชิ้นที่
           ตีกลับ [1.3] [2.1]") แยกเป็นสอง alert แล้วผู้ใช้ต้องอ่านสองรอบเพื่อได้ความเดียวกัน

           บอกแค่เลขชิ้น ไม่เอาเหตุผลมาด้วย — เหตุผลอยู่ที่แถวนั้นในตารางข้างล่างแล้ว
           ตีกลับ 5 ชิ้นก็ยังเป็นบรรทัดเดียว (badge ตัดขึ้นบรรทัดใหม่เองถ้าไม่พอ)
           เลข poLine.unitNo ตรงกับที่ตารางโชว์เป๊ะ — อ่านจากที่นี่แล้วไล่หาแถวได้ตรง ๆ -->
      <div v-if="lockBanner" role="alert" class="alert alert-info alert-soft mx-4 md:mx-10 lg:mx-20">
        <Icon icon="lucide:lock" class="shrink-0" />
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-left">
          <span class="text-sm">{{ lockBanner }}</span>
          <span
            v-for="p in rejectedPieces"
            :key="`${p.poLine}.${p.unitNo}`"
            class="badge badge-info badge-sm font-mono"
          >
            {{ p.poLine }}.{{ p.unitNo }}
          </span>
        </div>
      </div>

      <!-- PO ของ draft — อ่านอย่างเดียว (PO ผูกกับ draft ตายตัวตั้งแต่ตอนสร้าง เปลี่ยนไม่ได้) -->
      <section class="mx-4 md:mx-10 lg:mx-20">
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body text-left">
            <div class="flex w-full items-start justify-between gap-4">
              <div>
                <h2 class="card-title">รายละเอียดใบสั่งซื้อ (Purchase Order)</h2>
                <p class="text-sm text-base-content/70">ข้อมูลการสั่งซื้อของคำขอนี้</p>
              </div>
              <span class="badge badge-ghost whitespace-nowrap">Request No. {{ draft.id }}</span>
            </div>

            <div class="mt-6 grid w-full gap-4 md:grid-cols-5">
              <div>
                <p class="text-sm text-base-content/50">PO Number</p>
                <p class="font-mono">{{ draft.poNumber }} </p>
              </div>

              <div>
                <p class="text-sm text-base-content/50">ผู้ขอซื้อ (Requester)</p>
                <p>{{ draft.purchaseOrder.ownerPrName }}</p>
              </div>
<div>
                <p class="text-sm text-base-content/50">แผนก</p>
                <p>{{ draft.purchaseOrder.departmentName}}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">Vendor</p>
                <p>{{ draft.purchaseOrder.vendorName }}</p>
              </div>

              <div>
                <p class="text-sm text-base-content/50">PO Date</p>
                <p>{{ formatDate(draft.purchaseOrder.poDate) }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="mx-4 md:mx-10 lg:mx-20">
        <RequestTable
          ref="tableRef"
          :request-id="Number(requestId)"
          :editable="editable"
          :editable-scope="editableScope"
          @over-cost="hasOverCost = $event"
          @rejected-pieces="onRejectedPieces"
        />
      </section>

      <footer class="mx-4 pb-10 md:mx-10 lg:mx-20">
        <p v-if="submitError" class="mb-2 text-right text-sm text-error">{{ submitError }}</p>

        <!-- ส่งสำเร็จแต่แจ้งเตือนไม่ผ่าน — เตือน ไม่ใช่ error เพราะคำขอถูกบันทึกแล้ว -->
        <div v-if="notifyWarning" role="alert" class="alert alert-warning alert-soft mb-2">
          <Icon icon="lucide:triangle-alert" />
          <span>{{ notifyWarning }}</span>
          <button type="button" class="btn btn-sm" @click="router.replace({ name: 'DraftList' })">
            รับทราบ
          </button>
        </div>
        <p v-else-if="hasOverCost" class="mb-2 text-right text-sm text-warning">
          มีบรรทัดที่ราคารวมเกินยอด PO — แก้ราคาให้ไม่เกินก่อนจึงจะส่งได้
        </p>
        <!-- ปุ่มส่งคำขอผูกกับ statusEditable ไม่ใช่ editable — ใบที่อนุมัติแล้วส่งซ้ำไม่ได้
             (แก้ชิ้นที่ตีกลับแล้วชิ้นนั้นกลับเข้าคิวบัญชีเอง ไม่ต้องส่งใบใหม่) -->
        <submit
          :editable="statusEditable && editable && !submitting && !hasOverCost"
          @cancel="router.replace({ name: 'DraftList' })"
          @submit="onSubmit"
        />
      </footer>
    </template>
  </div>
</template>
