<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppPagination from '@/shared/components/AppPagination.vue'
import CreateRequestModal from '@/pages/create-asset/components/CreateRequestModal.vue'
import AppConfirmDialog from '@/shared/components/AppConfirmDialog.vue'
import {
  listDrafts,
  leaveRequest,
  listMyStuckNotifications,
  retryNotifyApprover,
} from '@/shared/services/assetRequest.service'
import type { AssetRequestRow, ListDraftsParams, MyStuckRequest } from '@/shared/services/assetRequest.service'
import { useConnectionStore } from '@/shared/stores/connection'
import { ApiError } from '@/shared/services/httpClient'
import { formatDateTime } from '@/shared/utils/date'
import { requestStatusMeta } from '@/shared/utils/request-status'
import { Icon } from '@iconify/vue'

const router = useRouter()

const drafts = ref<AssetRequestRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const loading = ref(false)

// ตัวแปรสำหรับเก็บค่าค้นหา
const searchQuery = ref('')
const displayDrafts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return drafts.value
  
  return drafts.value.filter(d => 
    d.poNumber && d.poNumber.toLowerCase().includes(query)
  )
})

async function loadDrafts() {
  loading.value = true
  try {
    const params: ListDraftsParams = {
      page: page.value,
      limit,
      status: ['DRAFT', 'REJECTED'],
    }

    const res = await listDrafts(params)
    drafts.value = res.data
    total.value = res.total
  } catch (e) {
    console.error('โหลดรายการ draft ไม่สำเร็จ:', e)
    drafts.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadDrafts()
}

function onPageChange(p: number) {
  page.value = p
  loadDrafts()
}

// ── มีคนเปลี่ยนอะไรที่ทำให้ลิสต์นี้เปลี่ยน → โหลดใหม่เอง ────────────────────────
//
// เคสหลักคือบัญชีตีกลับรายชิ้น: ใบนั้นเข้าลิสต์นี้เอง (listMyDrafts รวมใบ APPROVED ที่มีชิ้น
// ถูกตีกลับ) แต่เกิดตอนผู้ขอไม่ได้ทำอะไรอยู่เลย ถ้าไม่มีสัญญาณก็ต้องเดารีเฟรชว่ามีงานเข้าหรือยัง
//
// ★ ไม่เปิดสาย SSE เองที่นี่ - ใช้สายเดียวของทั้งแอปที่ store ถืออยู่แล้ว (โควตา connection
//   ของ browser มีจำกัด ดู services/sse.service.ts) หน้าที่ของหน้านี้เหลือแค่ watch ตัวนับ
//
// สัญญาณไม่มี requestId ติดมา - backend กรองมาแล้วว่าเหตุการณ์ไหนทำให้ลิสต์เปลี่ยนได้ แต่
// กรองรายคนไม่ได้ จึงเป็นไปได้ที่โหลดใหม่แล้วลิสต์เหมือนเดิม ซึ่งไม่เสียหายอะไร: หน้านี้
// ไม่มีกล่องกรอก และ debounce รวบก้อนที่มาติด ๆ กันให้แล้ว
const connection = useConnectionStore()
let reloadTimer: ReturnType<typeof setTimeout> | undefined

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = undefined
    void loadDrafts()
  }, 400)
}

watch(() => connection.changeTick, scheduleReload)

// ── ใบที่ส่งไปแล้วแต่หัวหน้ายังไม่ได้รับการ์ด ────────────────────────────────
//
// ★ ต้องมีแถบนี้เพราะลิสต์ข้างล่างกรองแค่ DRAFT/REJECTED — ใบที่ส่งไปแล้วไม่โผล่ที่ไหนเลย
//   ฝั่งผู้ขอ ถ้าการ์ดไม่ถึงหัวหน้า ใบจะค้างโดยไม่มีใครรู้: ผู้ขอคิดว่าส่งแล้ว หัวหน้าไม่รู้ว่ามีงาน
//   และ submit ซ้ำก็ไม่ได้ (สถานะไม่ใช่ DRAFT/REJECTED แล้ว)
//
// ★ เตือนตอนกดส่งมีอยู่แล้วที่ DraftForm แต่เป็นข้อความครั้งเดียว ปิดเบราว์เซอร์ก็หาย
//   ตัวนี้คือร่องรอยถาวรที่ยังอยู่จนกว่าการ์ดจะไปถึงจริง
const stuck = ref<MyStuckRequest[]>([])
const retrying = ref<number | null>(null)
const retryMsg = ref('')

async function loadStuck() {
  try {
    stuck.value = await listMyStuckNotifications()
  } catch {
    // แถบเตือนพังไม่ควรลากหน้าหลักตาย — รายการคำขอยังใช้งานได้ครบ
    stuck.value = []
  }
}

async function onRetryCard(requestId: number) {
  if (retrying.value !== null) return
  retrying.value = requestId
  retryMsg.value = ''
  try {
    const res = await retryNotifyApprover(requestId)
    retryMsg.value = res.notified
      ? `ส่งการ์ดของคำขอ #${requestId} ใหม่เรียบร้อยแล้ว`
      : `ยังส่งไม่ผ่าน: ${res.notifyError ?? 'ไม่ทราบสาเหตุ'}`
    await loadStuck()
  } catch (e) {
    // ข้อความจาก backend บอกตรง ๆ ว่าต้องไปแก้อะไร (หัวหน้าไม่มีอีเมล/ไม่มีบัญชีใน AMS)
    // ต้องโชว์ตามตรง ไม่กลบเป็น "ส่งไม่สำเร็จ" เฉย ๆ
    retryMsg.value = e instanceof ApiError ? e.message : 'ส่งการ์ดซ้ำไม่สำเร็จ'
  } finally {
    retrying.value = null
  }
}

onMounted(() => {
  void loadDrafts()
  void loadStuck()
})

onUnmounted(() => {
  if (reloadTimer) clearTimeout(reloadTimer)
})

function goForm(requestId: number) {
  router.push({ name: 'DraftForm', params: { requestId: String(requestId) } })
}

const modalOpen = ref(false)

function onCreate() {
  modalOpen.value = true
}

function onCreated(requestId: number) {
  router.push({ name: 'DraftForm', params: { requestId: String(requestId) } })
}

const confirmOpen = ref(false)
const removing = ref(false)
const target = ref<AssetRequestRow | null>(null)
const removeError = ref('')

function onDelete(row: AssetRequestRow) {
  target.value = row
  removeError.value = ''
  confirmOpen.value = true
}

async function onConfirmRemove() {
  if (!target.value) return
  removing.value = true
  removeError.value = ''
  try {
    await leaveRequest(target.value.id)
    confirmOpen.value = false
    target.value = null
    await loadDrafts()
  } catch (e) {
    removeError.value = e instanceof ApiError ? e.message : 'ทำรายการไม่สำเร็จ โปรดลองอีกครั้ง'
  } finally {
    removing.value = false
  }
}

const clearSearch = () => {
  searchQuery.value = ''
  // ถ้าต้องการให้ค้นหาใหม่ทันทีหลังกดกากบาท ให้เรียกฟังก์ชัน onSearch() ตรงนี้ได้เลย
  // onSearch()
}
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="text-left">
        <h1 class="text-3xl font-semibold sm:text-4xl">Create New Asset</h1>
        <p class="text-base-content/70">รายการคำขอขึ้นทะเบียนของคุณ</p>
      </div>

      <!-- ── ใบที่ส่งไปแล้วแต่การ์ดไม่ถึงหัวหน้า — ซ่อนทั้งแถบเมื่อไม่มี
           ★ ผู้ขอเป็นคนเดียวที่รู้ว่าใบตัวเองค้าง (ลิสต์ข้างล่างกรองแค่ DRAFT/REJECTED
             ใบที่ส่งไปแล้วจึงไม่โผล่ที่ไหนเลย) และเป็นคนกดส่งซ้ำได้ด้วย -->
      <div v-if="stuck.length" role="alert" class="alert alert-warning alert-soft w-full items-start sm:order-last">
        <Icon icon="mdi:alert-outline" class="size-5 shrink-0" />
        <div class="min-w-0 flex-1 space-y-2">
          <p class="text-sm">
            มี <span class="font-semibold">{{ stuck.length }}</span> คำขอที่ส่งไปแล้ว
            <span class="font-semibold">แต่หัวหน้ายังไม่ได้รับการ์ดขออนุมัติ</span>
            — ใบจะค้างจนกว่าจะส่งการ์ดใหม่
          </p>
          <div v-for="s in stuck" :key="s.id" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-mono">#{{ s.id }}</span>
            <span class="font-mono opacity-70">{{ s.poNumber }}</span>
            <span v-if="s.notifyError" class="max-w-[22rem] truncate opacity-70">{{ s.notifyError }}</span>
            <button
              type="button"
              class="btn btn-xs"
              :disabled="retrying !== null"
              @click="onRetryCard(s.id)"
            >
              <span v-if="retrying === s.id" class="loading loading-spinner loading-xs"></span>
              ส่งการ์ดซ้ำ
            </button>
          </div>
          <p v-if="retryMsg" class="text-sm opacity-80">{{ retryMsg }}</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- ช่องค้นหา -->
        <label class="input input-md w-full max-w-[260px]">
    <Icon icon="lucide:search" class="opacity-60" />
    
    <input
      id="po-search"
      v-model="searchQuery"
      type="search"
      placeholder="Search PO number..."
      @keyup.enter="onSearch"
      class="grow [&::-webkit-search-cancel-button]:appearance-none"
    />
    
    <!-- แสดง Spinner ตอน Loading -->
    <span v-if="loading" class="loading loading-spinner loading-xs"></span>
    
    <!-- ปุ่มกากบาทของเราเอง จะโชว์เมื่อไม่ได้โหลดอยู่ และมีข้อความในช่องค้นหา -->
    <button 
      v-else-if="searchQuery" 
      @click="clearSearch"
      type="button"
      class="btn btn-xs btn-circle btn-ghost opacity-60 hover:opacity-100"
    >
      <Icon icon="lucide:x" />
    </button>
  </label>

        <button class="btn btn-primary btn-md" @click="onCreate">
          <Icon icon="lucide:plus" />Create
        </button>
      </div>
    </div>

    <!-- ── ตาราง draft ── -->
    <div class="mt-6 overflow-x-auto rounded-box border border-base-300">
      <!-- ★ --freeze-1-w ต้องเท่ากับความกว้างจริงของคอลัมน์แรก (คลาส w-20 ข้างล่าง = 5rem)
           CSS หาเองไม่ได้ ถ้าสองค่านี้ไม่ตรงกัน คอลัมน์ที่ตรึงจะซ้อนกันหรือมีช่องโหว่
           ให้เนื้อหาเลื่อนทะลุขึ้นมาตรงกลาง — แก้ค่าไหนต้องแก้คู่กันเสมอ -->
      <table class="table table-pin-rows table-freeze-first [--freeze-1-w:5rem]">
        <thead>
          <tr>
            <th class="freeze-col text-center lg:w-[10%]">Request</th>
            <th class="freeze-col-2 w-[20%] text-center">PO Number</th>
            <th class="w-[20%]">ผู้สร้าง</th>
            <th class="w-[20%]">ขอซื้อโดย</th>
            <th class="w-[20%]">แก้ล่าสุด</th>
            <th class="w-[10%] text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in displayDrafts" :key="d.id" 
          class="hover:bg-base-200 cursor-pointer"
          @click="goForm(d.id)"
          >
            <td class="freeze-col w-20 truncate text-center lg:w-auto">#{{ d.id }}</td>
            <td class="freeze-col-2 truncate text-center font-mono">{{ d.poNumber }}</td>
            <td class="truncate">{{ d.createdByName ?? '-' }}</td>
            <td class="truncate">{{ d.ownerPrName ?? '-' }}</td>
            <td class="truncate">{{ formatDateTime(d.updatedAt) }}</td>
            <td class="text-right">
              <div class="flex flex-wrap items-center justify-end gap-1">
                <span
                  class="badge whitespace-nowrap"
                  :class="requestStatusMeta(d.status).class"
                >
                  {{ requestStatusMeta(d.status).label }}
                </span>
                <span
                  v-if="(d.rejectedAssetCount ?? 0) > 0"
                  class="badge badge-warning badge-soft badge-sm gap-1 whitespace-nowrap"
                  :title="`บัญชีตีกลับ ${d.rejectedAssetCount} ชิ้น แก้แล้วชิ้นนั้นจะกลับเข้าคิวออกเลขเอง`"
                >
                  <Icon icon="mdi:undo-variant" class="size-3.5" />
                  ตีกลับ {{ d.rejectedAssetCount }} ชิ้น
                </span>
              </div>
            </td>
            <td class="text-left">
              <div class="flex gap-1">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-square hover:text-error"
                  title="เอาออกจากรายการของฉัน"
                  @click.stop="onDelete(d)"
                >
                  <Icon icon="lucide:trash-2" class="text-lg" />
                </button>
              </div>
            </td>
          </tr>

          <!-- ว่าง / กำลังโหลด -->
          <tr v-if="loading">
            <td colspan="7" class="py-10 text-center text-base-content/50">
              <span class="loading loading-spinner loading-lg mb-2 block"></span>
              กำลังโหลด...
            </td>
          </tr>
          <tr v-else-if="displayDrafts.length === 0">
            <td colspan="7" class="py-10 text-center text-base-content/50">
              {{ searchQuery ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีคำขอค้างอยู่ กด “Create” เพื่อเริ่มใบใหม่' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── pagination ── -->
    <div class="mt-6">
      <AppPagination :page="page" :total="total" :limit="limit" @update:page="onPageChange" />
    </div>

    <!-- ── modal ── -->
    <CreateRequestModal v-model:open="modalOpen" title="สร้างคำขอใหม่" @created="onCreated" />

    <!-- ── ยืนยันการเอาออกจากลิสต์ ── -->
    <AppConfirmDialog
      v-model="confirmOpen"
      variant="warning"
      title="เอาออกจากรายการของฉัน?"
      confirm-text="เอาออก"
      :loading="removing"
      @confirm="onConfirmRemove"
    >
      <div class="space-y-2">
        <p class="font-medium">
          คำขอ <span >#{{ target?.id }}</span> ·
          PO <span >{{ target?.poNumber }}</span>
          <span v-if="(target?.assetCount ?? 0) > 0"> <br>กรอกข้อมูลแล้ว {{ target?.assetCount }} ชิ้น</span>
        </p>
        <p class="text-md">
          คำขอนี้จะถูกซ่อนจากรายการของคุณเท่านั้น (ไม่ได้ถูกลบ และผู้ใช้อื่นยังคงใช้งานได้ตามปกติ) หากต้องการนำกลับมาที่รายการของคุณอีกครั้ง สามารถค้นหาด้วยรหัส
          <span class="font-medium">{{ target?.poNumber }}</span>
        </p>
        <div v-if="removeError" role="alert" class="alert alert-error alert-soft">
          <span>{{ removeError }}</span>
        </div>
      </div>
    </AppConfirmDialog>
  </div>
</template>