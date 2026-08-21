<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppPagination from '@/components/common/AppPagination.vue'
import AppModal from '@/components/common/AppModal.vue'
import AppConfirmDialog from '@/components/common/AppConfirmDialog.vue'
import { listDrafts, leaveRequest } from '@/services/assetRequest.service'
import type { AssetRequestRow, ListDraftsParams } from '@/services/assetRequest.service'
import { useConnectionStore } from '@/stores/connection'
import { ApiError } from '@/services/httpClient'
import { formatDateTime } from '@/utils/date'
import { requestStatusMeta } from '@/utils/request-status'
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
// ★ ไม่เปิดสาย SSE เองที่นี่ — ใช้สายเดียวของทั้งแอปที่ store ถืออยู่แล้ว (โควตา connection
//   ของ browser มีจำกัด ดู services/sse.service.ts) หน้าที่ของหน้านี้เหลือแค่ watch ตัวนับ
//
// สัญญาณไม่มี requestId ติดมา — backend กรองมาแล้วว่าเหตุการณ์ไหนทำให้ลิสต์เปลี่ยนได้ แต่
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

onMounted(loadDrafts)

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
      <table class="table table-zebra table-pin-rows">
        <thead>
          <tr>
            <th class="w-[15%] text-center">Request</th>
            <th class="w-[25%] text-center">PO Number</th>
            <th class="w-[20%]">ผู้สร้าง</th>
            <th class="w-[20%]">ขอซื้อโดย</th>
            <th class="w-[20%]">แก้ล่าสุด</th>
            <th class="w-[10%] text-right">Status</th>
            <th class="w-[10%]"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in displayDrafts" :key="d.id" class="hover:bg-base-200">
            <td class="truncate text-center">#{{ d.id }}</td>
            <td class="truncate text-center font-mono">{{ d.poNumber }}</td>
            <td class="truncate">{{ d.createdByName ?? '—' }}</td>
            <td class="truncate">{{ d.ownerPrName ?? '—' }}</td>
            <td class="truncate">{{ formatDateTime(d.updatedAt) }}</td>
            <td class="text-right">
              <!-- ใบที่บัญชีตีกลับรายชิ้นยังเป็น APPROVED (การตีกลับเกิดที่ "ชิ้น" ไม่ใช่ที่ใบ)
                   ป้ายสถานะจึงบอกไม่ได้ว่ามีงานค้างอยู่ ต้องมีตัวเลขกำกับว่าเหลือกี่ชิ้นที่ต้องแก้ -->
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
            <td>
              <div class="flex items-center justify-center gap-1">
                <!-- ปุ่ม Edit -->
                <button
                  class="btn btn-ghost btn-sm btn-square"
                  title="แก้ไขคำขอ"
                  @click="goForm(d.id)"
                >
                  <Icon icon="lucide:square-pen" class="text-lg" />
                </button>
                <!-- ปุ่มถังขยะ = เอาออกจากลิสต์ของตัวเองเท่านั้น ไม่ได้ลบใบคำขอ -->
                <button
                  class="btn btn-ghost btn-sm btn-square hover:text-error"
                  title="เอาออกจากรายการของฉัน"
                  @click="onDelete(d)"
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
    <AppModal v-model:open="modalOpen" title="สร้างคำขอใหม่" @created="onCreated" />

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