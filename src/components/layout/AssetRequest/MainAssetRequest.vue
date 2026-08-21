<script setup lang="ts">
// หน้า Asset Request — คิวของบัญชี: ใบที่อนุมัติแล้ว รอออกเลขสินทรัพย์จาก SAP
//
// หน้านี้เป็น "คิว" อย่างเดียว ไม่มีการแก้ไขในตัวมันเอง — กด "แก้ไข" แล้วไปทำที่
// AssetRequestForm ทีละใบ เพราะการออกเลขต้องจองใบไว้ก่อน (lock) และการจองผูกกับหน้าที่
// เปิดอยู่ ถ้ากางแก้ในตารางได้หลายใบพร้อมกัน คนคนเดียวจะถือ lock ค้างหลายใบและบล็อกทั้งแถบ
//
// ── สาย lobby: บอกว่าใบไหนใครแก้อยู่ ─────────────────────────────────────────
// สายเดียวครอบทุกใบ ไม่ใช่สายต่อแถว — สายต่อแถวจะชนเพดาน connection ของ browser และ
// ที่แย่กว่าคือคนที่แค่เปิดดูคิวจะกลายเป็นสมาชิกทุกห้องแล้วไปแย่งคิวคนที่ตั้งใจจะแก้จริง
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppPagination from '@/components/common/AppPagination.vue'
import { listPendingRegistration } from '@/services/assetRequest.service'
import type { PendingRegistrationRow } from '@/services/assetRequest.service'
import { openRegistrationLobby } from '@/services/presence.service'
import type { PresenceConnection } from '@/services/presence.service'
import { ApiError } from '@/services/httpClient'
import { formatDateTime } from '@/utils/date'
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
 * บัญชีไล่ออกเลขทีละชิ้นรัว ๆ — ใบที่มี 20 ชิ้นยิงมา 20 ก้อนติดกัน ถ้าโหลดทุกก้อนก็ได้
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
    // ตารางนี้ไม่มีกล่องกรอกอะไร โหลดทับได้ตลอดเวลาโดยไม่ทำใครเสียงาน
    onStatus: () => scheduleReload(),
    onHolder: (h) => {
      // สร้าง object ใหม่ทุกครั้ง — Vue ไม่ track การ delete key ของ object เดิม
      const next = { ...holders.value }
      if (h.holderUserId === null) delete next[h.requestId]
      else next[h.requestId] = h.holderName ?? `ผู้ใช้ #${h.holderUserId}`
      holders.value = next
    },
    // สายหลุดไม่ใช่เรื่องคอขาดบาดตาย — ป้าย "กำลังแก้ไข" ค้างของเก่าไว้แป๊บหนึ่ง แล้ว
    // service ต่อใหม่ให้เอง (backend ส่ง snapshot ของใบที่มีคนถืออยู่ให้ตอนต่อติด)
    onError: (e) => console.error('lobby error:', e),
  })
}

/**
 * เข้าไปออกเลขในใบนี้
 *
 * ไม่บล็อกใบที่มีคนถืออยู่ — เข้าไปดูได้ แต่หน้าฟอร์มจะเป็นโหมดอ่านอย่างเดียวจนกว่าคนแรก
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

onMounted(() => {
  void load()
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

    <div class="mt-6 overflow-x-auto rounded-box border border-base-300">
      <table class="table table-pin-rows">
        <thead>
          <tr>
            <th>Req No.</th>
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
            <td class="font-mono">#{{ r.requestId }}</td>
            <td class="font-mono">
              {{ r.poNumber }}
              <div class="text-xs font-sans text-base-content/60">{{ r.vendorName ?? '—' }}</div>
            </td>
            <td class="truncate">{{ r.submittedByName ?? '—' }}</td>
            <td class="truncate">{{ r.approvedByName ?? '—' }}</td>
            <td>{{ formatDateTime(r.submittedAt) }}</td>
            <!-- "ออกเลขแล้วกี่ชิ้น" ต้องหักทั้งที่รอบัญชีและที่รอผู้ขอ — ชิ้นที่ตีกลับยังไม่มีเลข
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
            <!-- ใครแก้อยู่ — มาจากสาย lobby ไม่ใช่จาก list (list โหลดครั้งเดียว แต่ข้อมูลนี้
                 เปลี่ยนตลอดเวลา ถ้าเอามาจาก list จะค้างจนกว่าจะกดโหลดใหม่) -->
            <td class="text-center">
              <span v-if="holders[r.requestId]" class="badge badge-warning badge-soft gap-1"
                :title="`${holders[r.requestId]} กำลังแก้ไขใบนี้อยู่ — เข้าไปดูได้แต่ยังแก้ไม่ได้`">
                <Icon icon="lucide:lock" class="size-3.5" />
                {{ holders[r.requestId] }}
              </span>
              <span v-else class="text-sm text-base-content/40">ว่าง</span>
            </td>
            <!-- จุดแดงมุมขวาบนของปุ่ม = ผู้ขอแก้ชิ้นที่เราตีกลับไปแล้ว รอบัญชีตรวจซ้ำ
                 ต้องมีป้ายที่ระดับ "ใบ" เพราะการแก้ของผู้ขอเกิดหลังจากบัญชีปิดหน้าฟอร์มไปแล้ว
                 ถ้าไม่มีอะไรเตือนที่หน้าคิว บัญชีต้องเปิดเข้าไปดูทุกใบเพื่อหาว่าใบไหนมีของใหม่
                 (จุดหายเองเมื่อบัญชีตัดสินชิ้นนั้น — backend ล้าง rejectFixedAt ให้ทั้งสามปุ่ม) -->
            <td class="text-center">
              <div class="indicator">
                <span
                  v-if="r.fixedAssets > 0"
                  class="indicator-item size-2.5 rounded-full bg-error ring-2 ring-base-100"
                ></span>
                <button class="btn btn-sm"
                  :class="holders[r.requestId] ? 'btn-outline btn-neutral' : 'btn-primary'"
                  :title="r.fixedAssets > 0
                    ? `ผู้ขอแก้ชิ้นที่ตีกลับแล้ว ${r.fixedAssets} ชิ้น — ต้องตรวจซ้ำก่อนออกเลข`
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
