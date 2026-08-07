<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppPagination from '@/components/common/AppPagination.vue'
import AppModal from '@/components/common/AppModal.vue'
import AppConfirmDialog from '@/components/common/AppConfirmDialog.vue'
import { listDrafts, leaveRequest } from '@/services/assetRequest.service'
import type { AssetRequestRow, ListDraftsParams } from '@/services/assetRequest.service'
import { ApiError } from '@/services/httpClient'
import { formatDateTime } from '@/utils/date'
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

onMounted(loadDrafts)

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

// ลบ STATUS_META อันเก่าออกแล้วแทนที่ด้วยโค้ดนี้ (ระบุ type ให้ชัดเจนเพื่อกัน error)
const STATUS_META: Record<string, { label: string, class: string, border: string }> = {
  DRAFT: { label: 'Draft', class: 'bg-gray-100 text-gray-600', border: 'border-gray-300' },
  REJECTED: { label: 'Rejected', class: 'bg-red-100 text-red-600', border: 'border-red-300' },
  REGISTERED: { label: 'Registered', class: 'bg-green-100 text-green-600', border: 'border-[var(--correct)]' },
  PENDING: { label: 'Pending', class: 'bg-amber-100 text-amber-600', border: 'border-[var(--pending)]' },
  NO_GRPO: { label: 'No GRPO', class: 'bg-[var(--noContent)] text-black-600', border: 'border-[var(--noContent)]' },
};
</script>

<template>
  <div class="min-h-screen bg-white px-4 py-6 md:px-10 lg:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-left text-[28px] sm:text-[36px] text-[var(--primary-color)]">
          Create New Asset
        </h1>
        <p class="pl-1 text-left text-[var(--secondary-color)]">
          รายการคำขอขึ้นทะเบียนของคุณ
        </p>
      </div>

      <div class="flex items-center gap-3">
        <!-- ช่องค้นหา -->
        <div class="relative">
          <input
            id="po-search"
            v-model="searchQuery"
            @keyup.enter="onSearch"
            type="text"
            placeholder="Search PO number..."
            class="input input-xs input-bordered w-full max-w-[250px] pr-10 text-sm"
          />

          <!-- Icon ค้นหา -->
          <button
            type="button"
            @click="onSearch"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[var(--primary-color)]"
            aria-label="Search"
            :disabled="loading"
          >
            <i v-if="loading" class="fa-solid fa-spinner animate-spin" />
            <i v-else class="fa-solid fa-magnifying-glass" />
          </button>
        </div> 
<button class="btn btn-primary btn-xs" @click="onCreate"> <Icon icon="fa-solid:plus" class="mr-2"   />Create</button>
       
      </div>
    </div>

<!-- ── ตาราง draft ── -->
    <div class="mt-6 overflow-x-auto rounded-xl border border-gray-200">
      <table class="w-full text-center text-sm table-fixed">
        <thead class="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-[var(--secondary-color)] rounded-tl-lg sticky top-0 z-10">
          <tr>
            <th class="px-4 py-3 border-b w-[15%]">Request</th>
            <th class="px-4 py-3 border-b w-[25%] text-center">PO Number</th>
            <th class="px-4 py-3 border-b w-[20%] text-left">ผู้สร้าง</th>
            <th class="px-4 py-3 border-b w-[20%] text-left">คำขอโดย</th>
            <th class="px-4 py-3 border-b w-[20%]">แก้ล่าสุด</th>
            <th class="px-4 py-3 border-b w-[10%] text-right">Status</th>
            <th class="px-4 py-3 border-b w-[10%]"></th>
          </tr>
        </thead>
        <tbody>
         <tr v-for="d in displayDrafts" :key="d.id" class="border-b border-gray-100 hover:bg-gray-50 last:border-0">
            <td class="px-4 py-3 truncate">#{{ d.id }}</td>
            <td class="px-4 py-3 text-center truncate">{{ d.poNumber }}</td>
            <td class="px-4 py-3 text-left truncate">{{ d.createdByName ?? '—' }}</td>
            <td class="px-4 py-3 text-left truncate">{{ d.requesterName}} </td>
            <td class="px-4 py-3 truncate">{{ formatDateTime(d.updatedAt) }}</td>
            <td class="px-4 py-3 text-right">
              <span class="px-4 py-1 text-xs rounded-full whitespace-nowrap"
                :class="STATUS_META[d.status]?.class || 'bg-gray-100 text-gray-600'">
                {{ STATUS_META[d.status]?.label || d.status }}
              </span>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center gap-2">
                <!-- ปุ่ม Edit -->
                <button 
                  class="p-1 rounded text-[var(--primary-color)] hover:text-blue-700 text-lg transition-colors" 
                  title="แก้ไขคำขอ"
                  @click="goForm(d.id)"
                >
                  <i class="fa-regular fa-pen-to-square"></i>
                </button>
                <!-- ปุ่มถังขยะ = เอาออกจากลิสต์ของตัวเองเท่านั้น ไม่ได้ลบใบคำขอ -->
                <button
                  class="p-1 rounded text-[var(--primary-color)] hover:text-red-500 text-lg transition-colors"
                  title="เอาออกจากรายการของฉัน"
                  @click="onDelete(d)"
                >
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </div>
            </td>
          </tr>

          <!-- ว่าง / กำลังโหลด -->
          <tr v-if="!loading && displayDrafts.length === 0">
            <!-- กลับมาใช้ py-10 แทน h-[400px] -->
            <td colspan="6" class="px-4 py-10 text-center text-gray-400">
              {{ searchQuery ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีคำขอค้างอยู่ — กด “Create” เพื่อเริ่มใบใหม่' }}
            </td>
          </tr>
          <tr v-else-if="loading">
            <!-- กลับมาใช้ py-10 แทน h-[400px] -->
            <td colspan="6" class="px-4 py-10 text-center text-gray-400">
              <i class="fa-solid fa-spinner animate-spin text-2xl mb-2 block"></i>
              กำลังโหลด...
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
        <p v-if="removeError" class="rounded-lg bg-red-50 px-3 py-2 text-red-600">{{ removeError }}</p>
      </div>
    </AppConfirmDialog>
  </div>
</template>