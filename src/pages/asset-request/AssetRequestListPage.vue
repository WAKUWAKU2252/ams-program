<script setup lang="ts">
// หน้า Asset Request - คิวของบัญชี: ใบที่อนุมัติแล้ว รอออกเลขสินทรัพย์จาก SAP
//
// หน้านี้เป็น "คิว" อย่างเดียว ไม่มีการแก้ไขในตัวมันเอง - กด "แก้ไข" แล้วไปทำที่
// AssetRequestForm ทีละใบ เพราะการออกเลขต้องจองใบไว้ก่อน (lock) และการจองผูกกับหน้าที่
// เปิดอยู่ ถ้ากางแก้ในตารางได้หลายใบพร้อมกัน คนคนเดียวจะถือ lock ค้างหลายใบและบล็อกทั้งแถบ
//
// ── สาย lobby: บอกว่าใบไหนใครแก้อยู่ ─────────────────────────────────────────
// สายเดียวครอบทุกใบ ไม่ใช่สายต่อแถว - สายต่อแถวจะชนเพดาน connection ของ browser และ
// ที่แย่กว่าคือคนที่แค่เปิดดูคิวจะกลายเป็นสมาชิกทุกห้องแล้วไปแย่งคิวคนที่ตั้งใจจะแก้จริง
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppPagination from '@/shared/components/AppPagination.vue'
import {
  listPendingRegistration,
  listStuckNotifications,
} from '@/shared/services/assetRequest.service'
import type { PendingRegistrationRow, StuckNotification } from '@/shared/services/assetRequest.service'
import { openRegistrationLobby } from '@/shared/services/presence.service'
import type { PresenceConnection } from '@/shared/services/presence.service'
import { ApiError } from '@/shared/services/httpClient'
import { formatDateTime } from '@/shared/utils/date'
import { Icon } from '@iconify/vue'

const router = useRouter()
const rows = ref<PendingRegistrationRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const loading = ref(false)
const loadError = ref('')

/** requestId -> ชื่อคนที่กำลังแก้ใบนั้น (ไม่มี key = ใบว่าง) */
const holders = ref<Record<number, string>>({})
let lobbyConn: PresenceConnection | null = null

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await listPendingRegistration({ page: page.value, limit })
    rows.value = res.data
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการไม่สำเร็จ'
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * มีคนเปลี่ยนอะไรในคิว → โหลดตารางใหม่ แต่รวบหลายก้อนเป็นครั้งเดียว
 *
 * บัญชีไล่ออกเลขทีละชิ้นรัว ๆ - ใบที่มี 20 ชิ้นยิงมา 20 ก้อนติดกัน ถ้าโหลดทุกก้อนก็ได้
 * 20 request ทั้งที่ผลลัพธ์สุดท้ายเหมือนกันก้อนเดียว (และแต่ละ request กินโควตา connection
 * ที่สาย SSE เหลือให้อยู่แล้ว) หน่วงสั้น ๆ แล้วโหลดรอบเดียวพอ
 */
let reloadTimer: ReturnType<typeof setTimeout> | undefined

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined
    void load()
  }, 400)
}

function openLobby() {
  lobbyConn = openRegistrationLobby({
    // สายนี้ฟังอย่างเดียว ไม่ถือ lock ของใคร ปิดตอนแท็บถูกซ่อนได้โดยไม่มีผลข้างเคียง
    // - โควตา connection ของเบราว์เซอร์เป็นของทั้งโปรไฟล์ ไม่ใช่ของแต่ละแท็บ
    pauseWhenHidden: true,
    // ช่วงที่ปิดไปอาจมีใบถูกอนุมัติ/ออกเลขเพิ่ม โหลดหนึ่งรอบตอนกลับมา
    onResume: () => scheduleReload(),
    // ตารางนี้ไม่มีกล่องกรอกอะไร โหลดทับได้ตลอดเวลาโดยไม่ทำใครเสียงาน
    onStatus: () => scheduleReload(),
    onHolder: (h) => {
      // สร้าง object ใหม่ทุกครั้ง - Vue ไม่ track การ delete key ของ object เดิม
      const next = { ...holders.value }
      if (h.holderUserId === null) delete next[h.requestId]
      else next[h.requestId] = h.holderName ?? `ผู้ใช้ #${h.holderUserId}`
      holders.value = next
    },
    // สายหลุดไม่ใช่เรื่องคอขาดบาดตาย - ป้าย "กำลังแก้ไข" ค้างของเก่าไว้แป๊บหนึ่ง แล้ว
    // service ต่อใหม่ให้เอง (backend ส่ง snapshot ของใบที่มีคนถืออยู่ให้ตอนต่อติด)
    onError: (e) => console.error('lobby error:', e),
  })
}

/**
 * เข้าไปออกเลขในใบนี้
 *
 * ไม่บล็อกใบที่มีคนถืออยู่ - เข้าไปดูได้ แต่หน้าฟอร์มจะเป็นโหมดอ่านอย่างเดียวจนกว่าคนแรก
 * จะออก (แล้วมันปลดล็อกให้เองโดยไม่ต้อง reload) การเด้งกลับทำให้ดูสถานะใบไม่ได้เลย
 * ซึ่งเป็นสิ่งที่บัญชีเข้ามาทำบ่อยกว่าการแก้เสียอีก
 */
function openRequest(requestId: number) {
  router.push({ name: 'AssetRequestForm', params: { requestId: String(requestId) } })
}

function onPageChange(p: number) {
  page.value = p
  load()
}

// ── ใบที่การแจ้งเตือนไม่ถึงปลายทาง ─────────────────────────────────────────
//
// เหลือเฉพาะสองอาการที่ "บัญชีเป็นคนกดแก้" — แจ้งปิดงาน/ตีกลับไม่ออก ทั้งคู่กู้ด้วยการ
// เข้าไปกดปุ่มเดิมซ้ำในใบนั้น (ส่งล้ม = ไม่ปิดรอบ) จึงไม่มีปุ่มส่งซ้ำแยก มีแต่ทางเข้าใบ
//
// ★ "การ์ดไม่ถึงหัวหน้า" ไม่ได้อยู่ที่นี่ — ใบนั้นค้างของผู้ขอ เขารู้ก่อนและกดส่งซ้ำเองได้
//
// ★ ปกติต้องเป็นลิสต์ว่าง แถบทั้งแถบจึงซ่อนตัวเองเมื่อไม่มีอะไรค้าง ไม่ใช่โชว์ "0 รายการ"
//   ค้างไว้ให้ชิน จนวันที่มีของจริงไม่มีใครสังเกต
const stuck = ref<StuckNotification[]>([])
const stuckOpen = ref(false)

async function loadStuck() {
  try {
    stuck.value = await listStuckNotifications()
  } catch {
    // แถบเฝ้าพังไม่ควรลากหน้าหลักตาย — คิวออกเลขยังทำงานได้ครบโดยไม่มีแถบนี้
    stuck.value = []
  }
}


onMounted(() => {
  void load()
  void loadStuck()
  openLobby()
})

onUnmounted(() => {
  if (reloadTimer) clearTimeout(reloadTimer)
  lobbyConn?.close()
  lobbyConn = null
})
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="text-left">
      <h1 class="text-3xl font-semibold sm:text-4xl">Asset Request</h1>
      <p class="text-base-content/70">
        ใบที่ได้รับอนุมัติแล้ว รอออกเลขสินทรัพย์ 
      </p>
    </div>

    <div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-4">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
    </div>

    <!-- ── ใบที่การแจ้งเตือนไม่ถึงปลายทาง — ซ่อนทั้งแถบเมื่อไม่มีอะไรค้าง
         โชว์ "0 รายการ" ค้างไว้จะทำให้คนชินจนวันที่มีของจริงไม่มีใครสังเกต -->
    <div v-if="stuck.length" class="mt-4">
      <div role="alert" class="alert alert-warning alert-soft items-start">
        <Icon icon="mdi:bell-alert-outline" class="size-5 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-sm">
            มี <span class="font-semibold">{{ stuck.length }}</span> ใบที่แจ้งผลกลับผู้ขอไม่ออก
            — เข้าไปกดปุ่มเดิมซ้ำในใบนั้นเพื่อส่งใหม่
          </p>
        </div>
        <button type="button" class="btn btn-sm" @click="stuckOpen = !stuckOpen">
          {{ stuckOpen ? 'ซ่อน' : 'ดูรายการ' }}
        </button>
      </div>

      <div v-if="stuckOpen" class="mt-2 overflow-x-auto rounded-box border border-base-300">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Req No.</th>
              <th>PO No.</th>
              <th>อาการ</th>
              <th>สาเหตุ</th>
              <th class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in stuck" :key="s.id" class="hover:bg-base-200">
              <td class="font-mono whitespace-nowrap">#{{ s.id }}</td>
              <td class="font-mono whitespace-nowrap">{{ s.poNumber }}</td>
              <td class="whitespace-nowrap">
                <span class="badge badge-sm">
                  {{ s.kind === 'COMPLETE' ? 'แจ้งปิดงานไม่ออก' : 'แจ้งตีกลับไม่ออก' }}
                </span>
              </td>
              <td class="max-w-[26rem] truncate text-sm">{{ s.reason }}</td>
              <td class="text-center">
                <!-- ไม่มีปุ่มส่งซ้ำโดยตั้งใจ — สองอาการนี้กู้ด้วยการกดปุ่มเดิมซ้ำในใบ
                     (ส่งล้ม = ไม่ปิดรอบ) ปุ่มแยกจะกลายเป็นทางที่สองที่ต้องดูแลโดยไม่ได้อะไรเพิ่ม -->
                <button type="button" class="btn btn-xs" @click="openRequest(s.id)">เปิดใบ</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-6 overflow-x-auto rounded-box border border-base-300">
      <table class="table table-pin-rows table-freeze-first">
        <thead>
          <tr>
            <th class="freeze-col">Req No.</th>
            <th>PO No.</th>
            <th>Request by</th>
            <th>Approved by</th>
            <th>วันที่ส่งคำขอ</th>
            <th class="text-center">ชิ้น</th>
            <th class="text-center">สถานะการแก้ไข</th>
            <th class="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.requestId" class="hover:bg-base-200">
            <td class="freeze-col font-mono">#{{ r.requestId }}</td>
            <td class="font-mono">
              {{ r.poNumber }}
              <div class="text-xs font-sans text-base-content/60">{{ r.vendorName ?? '-' }}</div>
            </td>
            <td class="truncate">{{ r.submittedByName ?? '-' }}</td>
            <td class="truncate">{{ r.approvedByName ?? '-' }}</td>
            <td>{{ formatDateTime(r.submittedAt) }}</td>
            <!-- "ออกเลขแล้วกี่ชิ้น" ต้องหักทั้งที่รอบัญชีและที่รอผู้ขอ - ชิ้นที่ตีกลับยังไม่มีเลข
                 ถ้าหักแค่ pendingAssets มันจะถูกนับรวมว่าเสร็จแล้ว -->
            <td class="text-center">
              <span :class="r.pendingAssets > 0 ? 'text-warning' : 'text-success'">
                {{ r.totalAssets - r.pendingAssets - r.rejectedAssets }}/{{ r.totalAssets }}
              </span>
              <!-- ชิ้นที่รอผู้ขอแก้ = ไม่ใช่งานของบัญชีแล้ว แต่ใบยังไม่จบ ต้องแยกให้เห็น
                   ไม่งั้นบัญชีเห็นตัวเลขไม่เต็มแล้วนึกว่าตัวเองยังมีงานค้างในใบนี้ -->
              <div v-if="r.rejectedAssets > 0" class="text-xs text-warning">
                รอผู้ขอแก้ {{ r.rejectedAssets }} ชิ้น
              </div>
            </td>
            <!-- ใครแก้อยู่ - มาจากสาย lobby ไม่ใช่จาก list (list โหลดครั้งเดียว แต่ข้อมูลนี้
                 เปลี่ยนตลอดเวลา ถ้าเอามาจาก list จะค้างจนกว่าจะกดโหลดใหม่) -->
            <td class="text-center">
              <span v-if="holders[r.requestId]" class="badge badge-warning badge-soft gap-1"
                :title="`${holders[r.requestId]} กำลังแก้ไขใบนี้อยู่ - เข้าไปดูได้แต่ยังแก้ไม่ได้`">
                <Icon icon="lucide:lock" class="size-3.5" />
                {{ holders[r.requestId] }}
              </span>
              <span v-else class="text-sm text-base-content/40">ว่าง</span>
            </td>
            <!-- จุดแดงมุมขวาบนของปุ่ม = ผู้ขอแก้ชิ้นที่เราตีกลับไปแล้ว รอบัญชีตรวจซ้ำ
                 ต้องมีป้ายที่ระดับ "ใบ" เพราะการแก้ของผู้ขอเกิดหลังจากบัญชีปิดหน้าฟอร์มไปแล้ว
                 ถ้าไม่มีอะไรเตือนที่หน้าคิว บัญชีต้องเปิดเข้าไปดูทุกใบเพื่อหาว่าใบไหนมีของใหม่
                 (จุดหายเองเมื่อบัญชีตัดสินชิ้นนั้น - backend ล้าง rejectFixedAt ให้ทั้งสามปุ่ม) -->
            <td class="text-center">
              <div class="indicator">
                <span
                  v-if="r.fixedAssets > 0"
                  class="indicator-item size-2.5 rounded-full bg-error ring-2 ring-base-100"
                ></span>
                <button class="btn btn-sm"
                  :class="holders[r.requestId] ? 'btn-outline btn-neutral' : 'btn-primary'"
                  :title="r.fixedAssets > 0
                    ? `ผู้ขอแก้ชิ้นที่ตีกลับแล้ว ${r.fixedAssets} ชิ้น - ต้องตรวจซ้ำก่อนออกเลข`
                    : undefined"
                  @click="openRequest(r.requestId)">
                  <Icon :icon="holders[r.requestId] ? 'lucide:eye' : 'lucide:pencil'" class="size-4" />
                  {{ holders[r.requestId] ? 'ดู' : 'แก้ไข' }}
                </button>
              </div>
            </td>
          </tr>

          <tr v-if="loading">
            <td colspan="8" class="py-10 text-center text-base-content/50">
              <span class="loading loading-spinner loading-lg mb-2 block"></span>
              กำลังโหลด...
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td colspan="8" class="py-10 text-center text-base-content/50">
              ไม่มีใบรอออกเลข คำขอที่ผ่านการอนุมัติจะขึ้นที่นี่เอง
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppPagination v-if="total > limit" class="mt-4" :page="page" :total="total" :limit="limit"
      @update:page="onPageChange" />
  </div>
</template>
