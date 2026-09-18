<script setup lang="ts">
/**
 * คิวคำขอแก้ทะเบียนของบัญชี - ตัวเดียวใช้ได้ทั้งสองแท็บ (ย้ายสถานที่ / เปลี่ยนผู้ครอบครอง)
 *
 * ── ★★ คอลัมน์ "รหัส SAP" คือเหตุผลที่คิวนี้มีอยู่
 *
 * งานของบัญชีคือเปิดคิว → พิมพ์รหัสลง OITM ที่ SAP → กลับมากดยืนยัน ถ้าตารางโชว์แต่ชื่อ
 * สถานที่/ชื่อคน บัญชีต้องไปเปิด SAP ค้นรหัสเองทุกใบ ซึ่งเป็นงานที่คิวนี้ตั้งใจจะตัดออก
 *
 * ── ★ กดยืนยันแล้ว AMS เขียนค่าจริงทันที
 *
 * ไม่ใช่แค่ปิดใบ - ทะเบียนเปลี่ยนตรงนั้นเลยพร้อมลงประวัติ แล้วรอบ sync ถัดไปจะทับด้วย
 * ค่าจาก SAP อีกที (key ตรงกัน = ไม่มีอะไรเปลี่ยน / ลืม key = เด้งกลับ)
 * ข้อความบนปุ่มยืนยันจึงต้องบอกให้ชัดว่า "ต้อง key ที่ SAP ก่อน"
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import { ApiError } from '@/shared/services/httpClient'
import { formatDateTime } from '@/shared/utils/date'
import {
  applyChangeRequest,
  listChangeRequestQueue,
  rejectChangeRequest,
  type ChangeKind,
  type ChangeRequestRow,
} from '@/shared/services/assetChangeRequest.service'

const props = defineProps<{ kind: ChangeKind }>()

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

/** id ของใบที่กำลังยิงอยู่ - ล็อกปุ่มเฉพาะแถวนั้น ไม่ใช่ล็อกทั้งตาราง */
const busyId = ref<number | null>(null)
const rowError = ref<{ id: number; message: string } | null>(null)

const isMove = computed(() => props.kind === 'LOCATION')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await listChangeRequestQueue({ kind: props.kind, page: page.value, limit })
    rows.value = res.data
    total.value = res.total
    loadedOnce.value = true
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดคิวไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

async function onApply(row: ChangeRequestRow) {
  busyId.value = row.id
  rowError.value = null
  try {
    await applyChangeRequest(row.id)
    await load()
  } catch (e) {
    rowError.value = {
      id: row.id,
      message: e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ',
    }
  } finally {
    busyId.value = null
  }
}

async function onReject(row: ChangeRequestRow) {
  // ★ เหตุผลบังคับกรอก - ผู้ขอต้องรู้ว่าต้องแก้อะไรก่อนขอใหม่ ไม่งั้นเขาจะส่งใบเดิมซ้ำ
  const reason = window.prompt('เหตุผลที่ตีกลับ (ผู้ขอจะเห็นข้อความนี้)')?.trim()
  if (!reason) return

  busyId.value = row.id
  rowError.value = null
  try {
    await rejectChangeRequest(row.id, reason)
    await load()
  } catch (e) {
    rowError.value = {
      id: row.id,
      message: e instanceof ApiError ? e.message : 'ตีกลับไม่สำเร็จ',
    }
  } finally {
    busyId.value = null
  }
}

watch(() => props.kind, () => {
  page.value = 1
  void load()
})
watch(page, () => void load())
onMounted(load)
</script>

<template>
  <div class="mt-4">


    <div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-4">
      {{ loadError }}
    </div>

    <!-- ★ spinner เต็มพื้นที่เฉพาะรอบแรก - รอบถัดไปคาตารางไว้แล้วหรี่ ไม่งั้นกดข้ามหน้า
         แล้วตารางถูกถอดออก ความสูงยุบแล้วขยายกลับ = กระตุกทุกคลิก -->
    <div v-else-if="loading && !loadedOnce" class="py-10 text-center">
      <span class="loading loading-spinner"></span>
    </div>

    <div v-else-if="loadedOnce && !rows.length"
      class="mt-4 rounded-box border border-base-300 py-12 text-center">
      <Icon icon="lucide:check-check" class="mx-auto text-3xl text-base-content/30" />
      <p class="mt-2 text-sm text-base-content/60">ไม่มีคำขอรอดำเนินการ</p>
    </div>

    <div v-else class="relative mt-4 overflow-x-auto rounded-box border border-base-300"
      :class="loading ? 'opacity-50 transition-opacity' : ''">
      <span v-if="loading" class="loading loading-spinner loading-sm absolute right-3 top-3 z-10"></span>
      <table class="table table-sm" :class="loading ? 'pointer-events-none' : ''">
        <thead>
          <!-- ★ จำนวน th ต้องเท่ากับ td ของ tbody เสมอ - ขาดไปช่องเดียวคอลัมน์เหลื่อม
               ทั้งตารางโดยที่ไม่มี error อะไรฟ้อง (เคยขาดมาแล้วตอนถอดคอลัมน์รหัส SAP ออก) -->
          <tr>
            <th>สินทรัพย์</th>
            <th>{{ isMove ? 'ย้ายไป' : 'ผู้ครอบครองใหม่' }}</th>
            <th>เหตุผล</th>
            <th>ส่งเมื่อ</th>
            <th class="text-right">ดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr>
              <td>
                <div class="font-medium">{{ row.assetNumber ?? '-' }}</div>
                <div class="text-xs text-base-content/60">{{ row.assetDescription ?? '' }}</div>
              </td>
              <td>
                <span v-if="isMove">{{ row.toLocationName ?? '-' }}</span>
                <!-- null บนใบ HOLDER = ขอให้ว่าง ซึ่งเป็นคำขอที่ตั้งใจ ไม่ใช่ข้อมูลขาด -->
                <span v-else :class="row.toEmployeeName ? '' : 'italic text-base-content/60'">
                  {{ row.toEmployeeName ?? 'ไม่มีผู้ถือครอง' }}
                </span>
              </td>

              <td class="max-w-[14rem] truncate" :title="row.reason">{{ row.reason }}</td>
              <td class="whitespace-nowrap text-right">{{ formatDateTime(row.submittedAt) }}</td>
              <td class="whitespace-nowrap text-right">
                <button type="button" class="btn btn-primary btn-xs"
                  :disabled="busyId === row.id" @click="onApply(row)">
                  <span v-if="busyId === row.id" class="loading loading-spinner loading-xs"></span>
                  บันทึกแล้ว
                </button>
                <button type="button" class="btn btn-ghost btn-xs ml-1"
                  :disabled="busyId === row.id" @click="onReject(row)">
                  ตีกลับ
                </button>
              </td>
            </tr>
            <tr v-if="rowError?.id === row.id">
              <td colspan="5" class="bg-error/10 text-sm text-error">{{ rowError.message }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <AppPagination v-if="total > limit" class="mt-4" :page="page" :total="total" :limit="limit"
      @update:page="(p: number) => (page = p)" />
  </div>
</template>
