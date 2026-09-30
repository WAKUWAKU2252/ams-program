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

// desc = ข้อความในกล่องที่เปิดจากการกดป้าย - ป้ายมีที่ว่างแค่ไม่กี่คำ แต่คำถามจริงของผู้ขอ
// คือ "แล้วต้องทำอะไรต่อ" ซึ่งตอบบนป้ายไม่ได้ (หลักเดียวกับ STATUS_META ของ RequestTable)
const STATUS_META: Record<ChangeStatus, { label: string; cls: string; desc: string }> = {
  SUBMITTED: {
    label: 'รอบัญชีดำเนินการ',
    cls: 'badge-warning',
    desc: 'ส่งให้บัญชีแล้ว รอบัญชีคีย์ค่าใหม่ที่ SAP แล้วกดยืนยัน - ใบที่ส่งไปแล้วยกเลิกเองไม่ได้ ถ้าขอผิดให้แจ้งบัญชีตีกลับมาก่อน',
  },
  DONE: {
    label: 'ดำเนินการแล้ว',
    cls: 'badge-success',
    desc: 'บัญชีดำเนินการให้แล้ว ทะเบียนเปลี่ยนเป็นค่าที่ขอเรียบร้อย',
  },
  REJECTED: {
    label: 'ถูกตีกลับ',
    cls: 'badge-error',
    desc: 'บัญชีตีกลับใบนี้ อ่านเหตุผลด้านล่างแล้วแก้ตามนั้น จากนั้นกด Create ส่งใบใหม่ได้เลย - ใบเดิมแก้ไม่ได้',
  },
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

/**
 * กล่องรายละเอียดสถานะ - กล่องเดียวใช้ร่วมทุกแถว ไม่ใช่ <dialog> ต่อแถว
 * (กล่องต่อแถว = DOM node เท่าจำนวนแถวโดยที่เปิดทีละใบอยู่ดี)
 *
 * เก็บทั้งแถวเป็น snapshot: ลิสต์โหลดทับตัวเองได้จากการเปลี่ยนตัวกรอง/หน้า ถ้าอ้างกลับไปหา
 * แถวใน rows กล่องที่เปิดอยู่จะกลายเป็นว่างกลางคัน
 */
const noteTarget = ref<ChangeRequestRow | null>(null)

/**
 * ★ เปิดด้วย showModal() ไม่ใช่แปะ class `modal-open` ให้ <dialog> ที่ยังปิดอยู่
 *
 * สองทางนี้หน้าตาเหมือนกันเป๊ะ แต่ทางที่แปะ class เบราว์เซอร์ไม่ถือว่าเป็น modal จริง:
 * ปุ่ม ESC ไม่ทำงาน (ปิดได้แค่ปุ่ม "ปิด" กับ backdrop), โฟกัสยังวิ่งออกไปโดนตารางข้างหลังได้
 * ด้วยแท็บ และ ::backdrop เป็นของปลอมที่วาดเอง - showModal() ได้ทั้งสามอย่างฟรีจากเบราว์เซอร์
 *
 * ★ ต้องมี @close คู่กันเสมอ: ESC ปิดกล่องที่ระดับ DOM โดยที่ noteTarget ยังค้างค่าอยู่
 *   ถ้าไม่ล้างตาม กดป้ายใบเดิมซ้ำจะไม่มีอะไรเกิดขึ้น (ค่าไม่เปลี่ยน watcher ไม่วิ่ง)
 */
const noteDialog = ref<HTMLDialogElement | null>(null)

watch(noteTarget, (row) => {
  const el = noteDialog.value
  if (!el) return
  if (row) {
    if (!el.open) el.showModal()
  } else if (el.open) {
    el.close()
  }
})

function openNote(row: ChangeRequestRow) {
  noteTarget.value = row
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

/**
 * ── การโหลดผูกกับ "การกระทำ" ไม่ใช่ watch ที่ค่า page ──────────────────────────────
 *
 * ★ เดิมมี watch(page) อยู่ด้วย ซึ่งแยกไม่ออกว่าหน้าเปลี่ยนเพราะคนกดเปลี่ยนหน้า หรือเพราะ
 *   โค้ดดีดกลับหน้า 1 เอง ผลคือเปลี่ยนตัวกรอง/ส่งคำขอสำเร็จตอนอยู่หน้า 2 ขึ้นไป จะยิง
 *   GET /asset-change-requests สองครั้ง (watcher หนึ่งครั้ง + load() บรรทัดถัดมาอีกครั้ง)
 *   ตอนอยู่หน้า 1 อยู่แล้วกลับยิงครั้งเดียว - บั๊กที่โผล่เฉพาะบางหน้าแบบนี้หาเจอยากที่สุด
 *
 * ★ ตัวกรองยังต้องดีดกลับหน้า 1 เสมอ ไม่งั้นค้างอยู่หน้า 3 ของชุดเดิมแล้วเห็นตารางว่าง
 */
watch([kind, status], () => {
  page.value = 1
  void load()
})
onMounted(load)

/** คนกดเปลี่ยนหน้าเอง - ที่เดียวที่ page เปลี่ยนแล้วต้องโหลดตาม */
function goToPage(p: number) {
  page.value = p
  void load()
}

const modalOpen = ref(false)

/** ส่งคำขอสำเร็จ - โหลดลิสต์ใหม่ให้เห็นใบที่เพิ่งส่งทันที */
function onCreated() {
  page.value = 1
  void load()
}

const isEmpty = computed(
  () => loadedOnce.value && !loadError.value && rows.value.length === 0,
)

/**
 * มีตัวกรองอยู่ไหม - ตัวแยก "ยังไม่เคยส่งคำขอเลย" ออกจาก "กรองแล้วไม่เจอ"
 *
 * status = '' คือ "ทั้งหมด" (backend ไม่กรองสถานะ รวมใบ DONE ด้วย) จึงนับเป็น "ไม่ได้กรอง"
 */
const isFiltered = computed(() => kind.value !== '' || status.value !== '')
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

        <!-- ★ ค่าว่าง = "ทั้งหมด" จริง รวมใบที่ดำเนินการแล้ว (DONE) - backend ไม่กรองสถานะ
             เมื่อไม่ส่ง status มา (ดู listMine) ป้ายตัวเลือกต้องพูดตรงกับสิ่งที่ได้จริงเสมอ
             ★★ ตัวกรองนี้คือ **ทางเดียวในทั้งระบบ** ที่พาไปดูใบ DONE ได้ - คิวฝั่งบัญชี
               ไม่เคยส่ง status มาและ backend ตั้งต้นให้เป็น SUBMITTED เสมอ (ดู listQueue)
               ถอด "ทั้งหมด" กับ "ดำเนินการแล้ว" ออกพร้อมกันเมื่อไหร่ ใบที่ทำเสร็จแล้วจะไม่เหลือ
               หน้าจอไหนเปิดดูได้อีกเลย -->
        <select v-model="status" class="select select-bordered select-sm w-48">
          <option value="">ทั้งหมด</option>
          <option value="SUBMITTED">รอบัญชีดำเนินการ</option>
          <option value="REJECTED">ถูกตีกลับ</option>
          <option value="DONE">ดำเนินการแล้ว</option>
        </select>

        <span class="ml-auto text-sm text-base-content/60">{{ total.toLocaleString('th-TH') }} ใบ</span>

        <!-- ★ จุดเริ่มของคำขอทุกใบอยู่ที่ปุ่มนี้ที่เดียว - กล่องรายละเอียดสินทรัพย์ไม่มีปุ่มขอ
             (ค้นหาชิ้นในกล่องแทน เพื่อให้มีทางเข้าเดียว) -->
        <button type="button" class="btn btn-primary btn-sm gap-1" @click="modalOpen = true">
          <Icon icon="lucide:plus" class="size-4" />
          Create
        </button>
      
      </div>
      
      <div v-if="loadError" role="alert" class="alert alert-error alert-soft">{{ loadError }}</div>

      <!-- ★ spinner เต็มพื้นที่เฉพาะรอบแรก - รอบถัดไปคาตารางไว้แล้วหรี่ ไม่งั้นกดข้ามหน้า
           แล้วตารางถูกถอดออก ความสูงยุบแล้วขยายกลับ = กระตุกทุกคลิก -->
      <div v-else-if="loading && !loadedOnce" class="py-10 text-center">
        <span class="loading loading-spinner"></span>
      </div>

      <!-- ★ "ไม่มีอะไรเลย" กับ "กรองแล้วไม่เจอ" ต้องพูดคนละแบบ - ข้อความเดียวที่บอกว่า
           "ยังไม่มีคำขอ" ทำให้คนที่กรอง "ถูกตีกลับ" แล้วว่าง อ่านได้ว่าตัวเองไม่เคยส่งอะไรเลย
           ทั้งที่ใบยังอยู่ครบแค่ไม่ตรงตัวกรอง -->
      <div v-else-if="isEmpty" class="mt-2 rounded-box border border-base-300 py-12 text-center">
        <Icon icon="lucide:inbox" class="mx-auto text-3xl text-base-content/30" />
        <template v-if="isFiltered">
          <p class="mt-2 text-sm text-base-content/60">ไม่มีคำขอที่ตรงกับตัวกรอง</p>
          <p class="mt-1 text-xs text-base-content/50">ลองเปลี่ยนชนิดหรือสถานะด้านบน</p>
        </template>
        <template v-else>
          <p class="mt-2 text-sm text-base-content/60">ยังไม่มีคำขอ</p>
          <!-- ★ ชื่อปุ่มต้องตรงกับที่เขียนบนปุ่มจริง ("Create") - เคยเขียนว่า "สร้างคำขอ"
               ซึ่งไม่มีอยู่บนจอ คนอ่านต้องเดาเองว่าหมายถึงปุ่มไหน -->
          <p class="mt-1 text-xs text-base-content/50">
            กดปุ่ม "Create" ด้านบนเพื่อเริ่ม แล้วค้นหาสินทรัพย์ในกล่อง
          </p>
        </template>
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
              <td class="whitespace-nowrap">{{ formatDateTime(row.submittedAt) }}</td>
              <td>
                <!-- ★ เหตุผลที่ถูกตีกลับย้ายเข้ากล่องแล้ว ไม่แปะใต้ป้ายเหมือนเดิม - ข้อความที่
                     บัญชีพิมพ์มายาวเท่าไหร่ก็ได้ (ถึง 500 ตัว) พอแปะในช่องแคบ ๆ ของตารางจะดัน
                     ความสูงแถวจนตารางอ่านยาก และยังไม่มีที่ให้บอกว่า "แล้วต้องทำอะไรต่อ" -->
                <button
                  type="button"
                  class="badge badge-sm cursor-pointer transition hover:brightness-95"
                  :class="STATUS_META[row.status].cls"
                  :title="`${STATUS_META[row.status].label} กดเพื่อดูรายละเอียด`"
                  @click="openNote(row)"
                >
                  {{ STATUS_META[row.status].label }}
                  <Icon icon="lucide:info" class="ml-0.5 size-3 opacity-70" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ★ ต้องอยู่ "ใน" กล่อง min-h-screen เดียวกับตาราง - เคยห้อยอยู่นอกกล่อง ผลคือมันเริ่ม
           วาดหลังบล็อกที่สูงเต็มจอ ตาราง 10 แถวจบก่อนขอบล่างเยอะ คนที่มีคำขอเกินหนึ่งหน้า
           จึงต้องเลื่อนผ่านที่ว่างเกือบเต็มจอกว่าจะเจอปุ่มเปลี่ยนหน้า (และหลุด padding ของหน้าด้วย) -->
      <AppPagination v-if="total > limit" class="mt-4" :page="page" :total="total" :limit="limit"
        @update:page="goToPage" />
    </div>

    <CreateChangeRequestModal v-model:open="modalOpen" @created="onCreated" />

    <!-- ── กล่องรายละเอียดสถานะ (กดที่ป้าย) - กล่องเดียวใช้ร่วมทุกแถว
         modal-bottom บนมือถือ / กลางจอบนเดสก์ท็อป ตามแพตเทิร์นของกล่องอื่นในระบบ -->
    <dialog ref="noteDialog" class="modal modal-bottom sm:modal-middle" @close="noteTarget = null">
      <div v-if="noteTarget" class="modal-box text-left">
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge badge-sm" :class="STATUS_META[noteTarget.status].cls">
            {{ STATUS_META[noteTarget.status].label }}
          </span>
          <span class="text-sm text-base-content/60">
            {{ kindLabel(noteTarget.kind) }} · {{ noteTarget.assetNumber ?? '-' }}
          </span>
        </div>

        <!-- สิ่งที่ขอไว้ - กล่องบัง backdrop อยู่ ต้องอ่านซ้ำได้โดยไม่ต้องปิดกล่อง -->
        <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-base-content/60">ขอเปลี่ยนเป็น</dt>
          <dd class="font-medium">{{ destOf(noteTarget) }}</dd>
          <dt class="text-base-content/60">เหตุผลที่ขอ</dt>
          <dd class="whitespace-pre-wrap">{{ noteTarget.reason }}</dd>
          <dt class="text-base-content/60">ส่งเมื่อ</dt>
          <dd>{{ formatDateTime(noteTarget.submittedAt) }}</dd>
          <template v-if="noteTarget.appliedAt">
            <dt class="text-base-content/60">ทำรายการเมื่อ</dt>
            <dd>{{ formatDateTime(noteTarget.appliedAt) }}</dd>
          </template>
          <template v-if="noteTarget.rejectedAt">
            <dt class="text-base-content/60">ตีกลับเมื่อ</dt>
            <dd>{{ formatDateTime(noteTarget.rejectedAt) }}</dd>
          </template>
        </dl>

        <!-- เหตุผลที่บัญชีตีกลับ - whitespace-pre-wrap เพราะเขาขึ้นบรรทัดใหม่เองได้
             ★ ใบที่ถูกตีกลับต้องมีที่ให้อ่านเสมอ ถ้าใบเก่าไม่มีข้อความติดมาก็ต้องบอกว่าไม่มี
               ไม่ใช่ปล่อยกล่องหายไปเฉย ๆ แล้วผู้ขอเดาว่าตัวเองพลาดตรงไหน -->
        <div
          v-if="noteTarget.status === 'REJECTED'"
          class="mt-3 rounded-box bg-base-200 p-3 text-sm whitespace-pre-wrap text-error"
        >เหตุผล:
          {{ noteTarget.rejectReason?.trim() || 'ไม่ได้ระบุเหตุผล' }}
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" @click="noteTarget = null">ปิด</button>
          <!-- ใบที่ถูกตีกลับแก้ไม่ได้ ต้องยื่นใหม่ - พาไปที่กล่องสร้างคำขอให้เลย -->
          <button
            v-if="noteTarget.status === 'REJECTED'"
            type="button"
            class="btn btn-primary"
            @click="noteTarget = null; modalOpen = true"
          >
            ส่งคำขอใหม่
            <Icon icon="lucide:arrow-right" class="size-4" />
          </button>
        </div>
      </div>
      <!-- ★ ปุ่มนี้ไม่ต้องมี @click แล้ว - form method="dialog" ปิด <dialog> ให้ที่ระดับ DOM
           แล้ว @close ข้างบนล้าง noteTarget ตาม เส้นทางเดียวกับที่ ESC ใช้ -->
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  </section>

</template>
