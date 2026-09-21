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
 * ปุ่มทั้งสองจึงไม่ยิงทันทีที่กด - ผ่านกล่องยืนยันก่อนเสมอ และกล่องนั้นเป็นที่ที่บอกว่า
 * "ต้อง key ที่ SAP ก่อน" (ปุ่มกว้างไม่พอจะอธิบายผลที่ตามมา ส่วนคนกดผิดแถวจะได้เห็นเลข
 * สินทรัพย์กับค่าปลายทางอีกรอบก่อนตัดสินใจ)
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppConfirmDialog from '@/shared/components/AppConfirmDialog.vue'
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

const isMove = computed(() => props.kind === 'LOCATION')

/**
 * ค่าปลายทางที่ผู้ขอขอไว้ - ที่เดียวทั้งไฟล์ (ตาราง + กล่องยืนยันทั้งสองใบใช้ตัวนี้)
 *
 * ★ null บนใบ HOLDER = "ขอให้ไม่มีผู้ถือครอง" ซึ่งเป็นคำขอที่ตั้งใจ ไม่ใช่ข้อมูลขาด -
 *   ถ้าปล่อยให้แต่ละที่เขียน fallback เอง จะมีที่ที่โชว์ '-' แล้วบัญชีอ่านว่าใบนั้นกรอกไม่ครบ
 */
function targetValueOf(row: ChangeRequestRow | null): string {
  if (!row) return '-'
  if (row.kind === 'LOCATION') return row.toLocationName ?? '-'
  return row.toEmployeeName ?? 'ไม่มีผู้ถือครอง'
}

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

// ── บันทึกแล้ว: ถามก่อนเสมอ ───────────────────────────────────────────────────
//
// ★ ปุ่มนี้ไม่ใช่ "ปิดใบ" แต่เป็น "เขียนทะเบียนจริงเดี๋ยวนี้" กดพลาดแล้วสินทรัพย์ย้ายห้อง/
//   เปลี่ยนมือในระบบทันทีพร้อมลงประวัติ - ถอยได้ทางเดียวคือให้ผู้ขอยื่นใบใหม่
const applyOpen = ref(false)
const applyTarget = ref<ChangeRequestRow | null>(null)
const applyError = ref('')

function onApply(row: ChangeRequestRow) {
  applyTarget.value = row
  applyError.value = ''
  applyOpen.value = true
}

async function onConfirmApply() {
  const row = applyTarget.value
  if (!row) return
  busyId.value = row.id
  applyError.value = ''
  try {
    await applyChangeRequest(row.id)
    applyOpen.value = false
    applyTarget.value = null
    await load()
  } catch (e) {
    // ★ ค้างกล่องไว้ ไม่ปิดหนี - ที่พังบ่อยสุดคือ 409 (คนอื่นปิดใบไปแล้ว) ซึ่งบัญชีต้องอ่าน
    //   ให้จบก่อนว่าเกิดอะไร ปิดกล่องแล้วโยนข้อความไปไว้ใต้ตารางคือทำให้มันหลุดสายตา
    applyError.value = e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'
  } finally {
    busyId.value = null
  }
}

// ── ตีกลับ: เหตุผลบังคับกรอก ─────────────────────────────────────────────────
//
// ★ เดิมใช้ window.prompt ซึ่งพิมพ์ข้อความยาว ๆ ไม่ไหว (ช่องบรรทัดเดียว ไม่มี maxlength
//   จึงไม่มีอะไรบอกเพดาน 500 ตัวอักษรของ backend) และหน้าตาเป็นของเบราว์เซอร์ คนละใบกับทั้งระบบ
const rejectOpen = ref(false)
const rejectTarget = ref<ChangeRequestRow | null>(null)
const rejectReason = ref('')
const rejectError = ref('')

function onReject(row: ChangeRequestRow) {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectError.value = ''
  rejectOpen.value = true
}

async function onConfirmReject() {
  const row = rejectTarget.value
  if (!row) return

  // ★ เหตุผลบังคับกรอก - ผู้ขอต้องรู้ว่าต้องแก้อะไรก่อนขอใหม่ ไม่งั้นเขาจะส่งใบเดิมซ้ำ
  //   (backend บังคับ minLength 1 อยู่แล้ว ดักที่นี่เพื่อไม่ให้เสียรอบไป-กลับเปล่า ๆ)
  const reason = rejectReason.value.trim()
  if (!reason) {
    rejectError.value = 'กรุณากรอกเหตุผล - ผู้ขอจะเห็นข้อความนี้'
    return
  }

  busyId.value = row.id
  rejectError.value = ''
  try {
    await rejectChangeRequest(row.id, reason)
    rejectOpen.value = false
    rejectTarget.value = null
    await load()
  } catch (e) {
    rejectError.value = e instanceof ApiError ? e.message : 'ตีกลับไม่สำเร็จ'
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
            <th class="text-right">ส่งเมื่อ</th>
            <th class="text-right">ดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <div class="font-medium">{{ row.assetNumber ?? '-' }}</div>
              <div class="text-xs text-base-content/60">{{ row.assetDescription ?? '' }}</div>
            </td>
            <td>
              <!-- เอียง = ใบที่ "ขอให้ว่าง" ซึ่งเป็นคำขอที่ตั้งใจ ไม่ใช่ช่องที่กรอกไม่ครบ -->
              <span :class="isMove || row.toEmployeeName ? '' : 'italic text-base-content/60'">
                {{ targetValueOf(row) }}
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
        </tbody>
      </table>
    </div>

    <AppPagination v-if="total > limit" class="mt-4" :page="page" :total="total" :limit="limit"
      @update:page="(p: number) => (page = p)" />

    <!-- ── ยืนยันก่อนเขียนทะเบียนจริง
         ★ variant="info" ไม่ใช่ danger - นี่คือทางปกติของงานนี้ ไม่ใช่ปุ่มทำลายของ สิ่งที่ต้อง
           เด่นคือเงื่อนไข "คีย์ที่ SAP ก่อนหรือยัง" ซึ่งอยู่ในกล่องเตือนข้างในแล้ว -->
    <AppConfirmDialog v-model="applyOpen" variant="info" title="ยืนยันว่าคีย์ที่ SAP แล้ว"
      confirm-text="ยืนยัน" :loading="busyId !== null" @confirm="onConfirmApply">
      <div class="space-y-3 text-left">
        <p>
          สินทรัพย์ <span class="font-semibold">{{ applyTarget?.assetNumber ?? '-' }}</span>
          <span v-if="applyTarget?.assetDescription" class="text-base-content/60">
            · {{ applyTarget.assetDescription }}
          </span>
        </p>
        <p>
          {{ isMove ? 'ย้ายไป' : 'ผู้ครอบครองใหม่' }}:
          <span class="font-semibold">{{ targetValueOf(applyTarget) }}</span>
        </p>

        <div role="alert" class="alert alert-warning alert-soft">
          <Icon icon="lucide:triangle-alert" />
          <span>
            ตรวจสอบความถูกต้องก่อนกดยืนยัน
          </span>
        </div>

        <div v-if="applyError" role="alert" class="alert alert-error alert-soft">
          <Icon icon="lucide:circle-alert" />
          <span>{{ applyError }}</span>
        </div>
      </div>
    </AppConfirmDialog>

    <!-- ── ตีกลับ + เหตุผล -->
    <AppConfirmDialog v-model="rejectOpen" variant="warning" title="ตีกลับคำขอ"
      confirm-text="ตีกลับ" :loading="busyId !== null" @confirm="onConfirmReject">
      <div class="space-y-3 text-left">
        <p>
          สินทรัพย์ <span class="font-semibold">{{ rejectTarget?.assetNumber ?? '-' }}</span> ·
          {{ isMove ? 'ย้ายไป' : 'ผู้ครอบครองใหม่' }}
          <span class="font-semibold">{{ targetValueOf(rejectTarget) }}</span>
        </p>
        <!-- เหตุผลของผู้ขอ - ตารางข้างหลังถูก backdrop บังอยู่ ต้องมีให้อ่านซ้ำตรงนี้
             ไม่งั้นบัญชีต้องปิดกล่องไปอ่านแล้วเปิดใหม่ ซึ่งล้างสิ่งที่พิมพ์ค้างไว้ทิ้ง -->
        <p v-if="rejectTarget?.reason" class="border-l-2 border-base-300 pl-3 text-base-content/60">
          ผู้ขอให้เหตุผลว่า: {{ rejectTarget.reason }}
        </p>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">เหตุผลที่ตีกลับ (บังคับ)*</legend>
          <!-- maxlength 500 = เพดานจริงของ backend (rejectBody) บอกที่ช่องดีกว่าให้ไปเจอ 422 -->
          <textarea v-model="rejectReason" rows="3" maxlength="500"
            class="textarea textarea-warning w-full" :disabled="busyId !== null"
            placeholder="เช่น ห้องปลายทางเต็มแล้ว ให้เลือกห้องอื่นแล้วยื่นใหม่"></textarea>
          <p class="label">ผู้ขอจะเห็นข้อความนี้ในการตอบกลับ</p>
        </fieldset>

        <div v-if="rejectError" role="alert" class="alert alert-error alert-soft">
          <Icon icon="lucide:circle-alert" />
          <span>{{ rejectError }}</span>
        </div>
      </div>
    </AppConfirmDialog>
  </div>
</template>
