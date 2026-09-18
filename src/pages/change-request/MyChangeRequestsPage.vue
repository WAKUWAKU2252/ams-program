<script setup lang="ts">
/**
 * หน้าติดตามคำขอแก้ทะเบียนของตัวเอง - ย้ายสถานที่ / เปลี่ยนผู้ครอบครอง
 *
 * ★ คนละหน้ากับคิวของบัญชี (แท็บใน /assetrequest) โดยตั้งใจ: ผู้ขอสนใจ "ใบของฉันถึงไหนแล้ว"
 *   ส่วนบัญชีสนใจ "เหลืออะไรให้ทำบ้าง" - ตารางเดียวกันตอบสองคำถามนี้พร้อมกันไม่ได้
 *   (ผู้ขอไม่ต้องเห็นรหัส SAP ส่วนบัญชีไม่ต้องเห็นว่าใบไหนของใคร)
 *
 * ★★ จุดเริ่มของคำขอทุกใบอยู่ที่ปุ่ม "สร้างคำขอ" ในหน้านี้ที่เดียว - ค้นหาสินทรัพย์ในกล่อง
 *   ที่เปิดขึ้นมา ไม่ได้เริ่มจากกล่องรายละเอียดสินทรัพย์แล้ว (ทางเข้าสองทางแปลว่าต้อง
 *   ดูแลกติกา "ชิ้นนี้มีใบค้างอยู่แล้วหรือยัง" สองที่)
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
/**
 * โหลดสำเร็จไปแล้วอย่างน้อยหนึ่งรอบ - ตัวแยก "ยังไม่มีอะไร" ออกจาก "กำลังโหลดชุดใหม่"
 *
 * ★ ถ้าไม่มี ทุกครั้งที่เปลี่ยนหน้า/ตัวกรอง ตารางจะถูกถอดออกแล้วเอา spinner มาแทน
 *   ความสูงยุบแล้วขยายกลับ = กระตุกทุกคลิก และ scroll เด้งกลับบนสุด
 */
const loadedOnce = ref(false)

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
    loadedOnce.value = true
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

const isEmpty = computed(
  () => loadedOnce.value && !loadError.value && rows.value.length === 0,
)
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
      
      </div>
      
      <div v-if="loadError" role="alert" class="alert alert-error alert-soft">{{ loadError }}</div>

      <!-- ★ spinner เต็มพื้นที่เฉพาะรอบแรก - รอบถัดไปคาตารางไว้แล้วหรี่ ไม่งั้นกดข้ามหน้า
           แล้วตารางถูกถอดออก ความสูงยุบแล้วขยายกลับ = กระตุกทุกคลิก -->
      <div v-else-if="loading && !loadedOnce" class="py-10 text-center">
        <span class="loading loading-spinner"></span>
      </div>

      <div v-else-if="isEmpty" class="mt-2 rounded-box border border-base-300 py-12 text-center">
        <Icon icon="lucide:inbox" class="mx-auto text-3xl text-base-content/30" />
        <p class="mt-2 text-sm text-base-content/60">ยังไม่มีคำขอ</p>
        <p class="mt-1 text-xs text-base-content/50">
          กดปุ่ม "สร้างคำขอ" ด้านบนเพื่อเริ่ม แล้วค้นหาสินทรัพย์ในกล่อง
        </p>
      </div>

      <div class="relative mt-2 overflow-x-auto rounded-box border border-base-300"
        v-else :class="loading ? 'opacity-50 transition-opacity' : ''">
        <span v-if="loading" class="loading loading-spinner loading-sm absolute right-3 top-3 z-10"></span>
        <table class="table table-sm" :class="loading ? 'pointer-events-none' : ''">
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
