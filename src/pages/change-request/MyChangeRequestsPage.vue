<script setup lang="ts">
/**
 * หน้าติดตามคำขอแก้ทะเบียนของตัวเอง - ย้ายสถานที่ / เปลี่ยนผู้ครอบครอง
 *
 * ★ คนละหน้ากับคิวของบัญชี (แท็บใน /assetrequest) โดยตั้งใจ: ผู้ขอสนใจ "ใบของฉันถึงไหนแล้ว"
 *   ส่วนบัญชีสนใจ "เหลืออะไรให้ทำบ้าง" - ตารางเดียวกันตอบสองคำถามนี้พร้อมกันไม่ได้
 *   (ผู้ขอไม่ต้องเห็นรหัส SAP ส่วนบัญชีไม่ต้องเห็นว่าใบไหนของใคร)
 *
 * ★ ไม่มีปุ่มสร้างคำขอที่นี่ - คำขอเกิดจาก "ตัวชิ้น" เสมอ จึงเปิดจากกล่องรายละเอียดสินทรัพย์
 *   (Asset Inventory / My Assets / ผัง) ที่ซึ่งคนเห็นของแล้วรู้ว่าอยากขออะไร
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import TopicCard from '@/shared/components/TopicCard.vue'
import CreateChangeRequestModal from './components/CreateChangeRequestModal.vue'
import { ApiError } from '@/shared/services/httpClient'
import { formatDateTime } from '@/shared/utils/date'
import {
  listMyChangeRequests,
  type ChangeKind,
  type ChangeRequestRow,
  type ChangeStatus,
} from '@/shared/services/assetChangeRequest.service'

const rows = ref<ChangeRequestRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const loading = ref(false)
const loadError = ref('')

/** '' = ทุกชนิด/ทุกสถานะ - ค่ามาจากปุ่ม จึงเก็บเป็น string แล้วแปลงตอนส่งที่เดียว */
const kind = ref<'' | ChangeKind>('')
const status = ref<'' | ChangeStatus>('')

const STATUS_META: Record<ChangeStatus, { label: string; cls: string }> = {
  SUBMITTED: { label: 'รอบัญชีดำเนินการ', cls: 'badge-warning' },
  DONE: { label: 'ดำเนินการแล้ว', cls: 'badge-success' },
  REJECTED: { label: 'ถูกตีกลับ', cls: 'badge-error' },
}

const kindLabel = (k: ChangeKind) => (k === 'LOCATION' ? 'ย้ายสถานที่' : 'เปลี่ยนผู้ครอบครอง')

/**
 * ปลายทางที่ขอ - ต้องอ่าน kind ก่อนเสมอ
 *
 * ★ toEmployeeName เป็น null ได้สองความหมาย: ใบชนิด LOCATION (ไม่เกี่ยว) กับใบ HOLDER
 *   ที่ขอให้ว่าง - แยกกันที่ kind ไม่ใช่ที่ค่า null
 */
function destOf(row: ChangeRequestRow): string {
  if (row.kind === 'LOCATION') return row.toLocationName ?? '-'
  return row.toEmployeeName ?? 'ไม่มีผู้ถือครอง'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await listMyChangeRequests({
      kind: kind.value || undefined,
      status: status.value || undefined,
      page: page.value,
      limit,
    })
    rows.value = res.data
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

// เปลี่ยนตัวกรองแล้วต้องกลับหน้า 1 - ไม่งั้นค้างอยู่หน้า 3 ของชุดเดิมแล้วเห็นตารางว่าง
watch([kind, status], () => {
  page.value = 1
  void load()
})
watch(page, () => void load())
onMounted(load)

const modalOpen = ref(false)

/** ส่งคำขอสำเร็จ - โหลดลิสต์ใหม่ให้เห็นใบที่เพิ่งส่งทันที */
function onCreated() {
  page.value = 1
  void load()
}

const isEmpty = computed(() => !loading.value && !loadError.value && rows.value.length === 0)
</script>

<template>
  <section class="space-y-4">
    
    <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
      <TopicCard value="create-request" />
      <div class="mt-5 flex flex-wrap items-center gap-2 ">
        <div role="tablist" class="tabs tabs-box tabs-sm">
          <button type="button" role="tab" class="tab" :class="kind === '' ? 'tab-active' : ''"
            @click="kind = ''">ทั้งหมด</button>
          <button type="button" role="tab" class="tab" :class="kind === 'LOCATION' ? 'tab-active' : ''"
            @click="kind = 'LOCATION'">ย้ายสถานที่</button>
          <button type="button" role="tab" class="tab" :class="kind === 'HOLDER' ? 'tab-active' : ''"
            @click="kind = 'HOLDER'">เปลี่ยนผู้ครอบครอง</button>
            
        </div>

        <select v-model="status" class="select select-bordered select-sm w-48">
          <option value="">ทุกสถานะ</option>
          <option value="SUBMITTED">รอบัญชีดำเนินการ</option>
          <option value="DONE">ดำเนินการแล้ว</option>
          <option value="REJECTED">ถูกตีกลับ</option>
        </select>

        <span class="ml-auto text-sm text-base-content/60">{{ total.toLocaleString('th-TH') }} ใบ</span>

        <!-- ★ จุดเริ่มของคำขอทุกใบอยู่ที่ปุ่มนี้ที่เดียว - กล่องรายละเอียดสินทรัพย์ไม่มีปุ่มขอ
             (ค้นหาชิ้นในกล่องแทน เพื่อให้มีทางเข้าเดียว) -->
        <button type="button" class="btn btn-primary btn-sm gap-1" @click="modalOpen = true">
          <Icon icon="lucide:plus" class="size-4" />
          สร้างคำขอ
        </button>
      <button class="btn btn-info btn-md">สร้าง</button>
      </div>
      
      <div v-if="loadError" role="alert" class="alert alert-error alert-soft">{{ loadError }}</div>

      <div v-else-if="loading" class="py-10 text-center">
        <span class="loading loading-spinner"></span>
      </div>

      <div v-else-if="isEmpty" class="mt-2 rounded-box border border-base-300 py-12 text-center">
        <Icon icon="lucide:inbox" class="mx-auto text-3xl text-base-content/30" />
        <p class="mt-2 text-sm text-base-content/60">ยังไม่มีคำขอ</p>
        <p class="mt-1 text-xs text-base-content/50">
          เปิดคำขอได้จากกล่องรายละเอียดสินทรัพย์ในหน้าทะเบียนหรือผังชั้น
        </p>
      </div>
      
      <div v-else class="mt-2 overflow-x-auto rounded-box border border-base-300">
        <table class=" table table-sm">
          <thead>
            <tr>
              <th>สินทรัพย์</th>
              <th>ชนิด</th>
              <th>ขอเปลี่ยนเป็น</th>
              <th>เหตุผล</th>
              <th>ส่งเมื่อ</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                <div class="font-medium">{{ row.assetNumber ?? '-' }}</div>
                <div class="text-xs text-base-content/60">{{ row.assetDescription ?? '' }}</div>
              </td>
              <td>{{ kindLabel(row.kind) }}</td>
              <td>{{ destOf(row) }}</td>
              <td class="max-w-[16rem] truncate" :title="row.reason">{{ row.reason }}</td>
              <td class="whitespace-nowrap">{{ formatDateTime(row.submittedAt) }}</td>
              <td>
                <span class="badge badge-sm" :class="STATUS_META[row.status].cls">
                  {{ STATUS_META[row.status].label }}
                </span>
                <!-- เหตุผลที่ถูกตีกลับต้องอ่านได้จากแถวเลย ไม่ใช่ต้องกดเข้าไปดู -
                   มันคือสิ่งเดียวที่บอกว่าต้องแก้อะไรก่อนขอใหม่ -->
                <div v-if="row.rejectReason" class="mt-1 text-xs text-error">
                  {{ row.rejectReason }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <AppPagination v-if="total > limit" :page="page" :total="total" :limit="limit"
      @update:page="(p: number) => (page = p)" />

    <CreateChangeRequestModal v-model:open="modalOpen" @created="onCreated" />
  </section>

</template>
