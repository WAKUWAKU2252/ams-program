<script setup lang="ts">
/**
 * กล่องสร้างคำขอลงทะเบียนใหม่ — เลือก PO หนึ่งใบแล้วกด Create
 *
 * ── ทำไมเป็นตาราง ไม่ใช่ autocomplete อย่างเดียว (เปลี่ยนรอบนี้)
 *
 * ของเดิมเป็นช่องค้นที่มี dropdown ผลลัพธ์ลอยอยู่ ซึ่งบังคับให้ผู้ใช้ "รู้ก่อนว่าจะหาใบไหน"
 * แต่งานจริงคือเปิดกล่องมาแล้วไล่ดูว่ามีใบไหนรอลงทะเบียนอยู่บ้าง — ตารางตอบคำถามนั้นได้
 * ตั้งแต่วินาทีแรกโดยไม่ต้องพิมพ์อะไรเลย
 *
 * ★ มีที่แสดงผลที่เดียว: ช่องค้นกลายเป็น input ธรรมดาที่กรองตาราง ไม่ใช่ dropdown ซ้อน
 *   (จึงไม่ได้ใช้ Searching.vue ที่พก dropdown ของตัวเองมาด้วย)
 *
 * ── ตัวกรองบริษัทกับการเรียงส่งไปให้ backend ทำ ไม่ได้กรองฝั่งนี้
 *
 * ตาราง purchase_order มีหลายร้อยใบและโตขึ้นทุกวัน ดึงมาทั้งหมดแล้วกรองบนจอจะพังเงียบ ๆ
 * ตอนข้อมูลโต — และ `total` ที่มุมล่างจะโกหกทันทีเพราะนับจากชุดที่โหลดมาไม่ใช่ทั้งตาราง
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import PoSummaryCard from './PoSummaryCard.vue'
import {
  listPurchaseOrders,
  type PurchaseOrderSummary,
} from '@/shared/services/purchaseOrder.service'
import { listCompanies, type CompanyOption } from '@/shared/services/master.service'
import { createDraft } from '@/shared/services/assetRequest.service'

const props = defineProps<{
  open: boolean
  title?: string
  maxWidth?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'close'): void
  (e: 'created', selectedPO: number): void
}>()

/** 10 แถวพอดีกับความสูงของกล่อง — มากกว่านี้ต้องเลื่อนหน้าจอทั้งกล่องตาม */
const PAGE_SIZE = 10

const selectedPO = ref<PurchaseOrderSummary | null>(null)
const detailError = ref('')
const unSelect = ref(false)
const creating = ref(false) // กำลังยิง createDraft อยู่ → ล็อกปุ่มกันกดซ้ำ

// ── ตาราง PO
const rows = ref<PurchaseOrderSummary[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadError = ref('')

// ── ตัวกรอง
const search = ref('')
const companyCode = ref('')
const sort = ref<'date_desc' | 'date_asc'>('date_desc')
const companies = ref<CompanyOption[]>([])

const lastPage = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

/**
 * กันผลลัพธ์เก่าทับใหม่ — ผู้ใช้พิมพ์ค้น/สลับบริษัทรัวได้ ถ้าไม่เช็คว่า response ที่กลับมา
 * เป็นของคำขอล่าสุดจริง ตารางจะโชว์ผลของคำค้นก่อนหน้าโดยไม่มีอะไรฟ้อง
 * (หลักเดียวกับ requestSeq ใน AppEmployeeSelect / FloorPlanAssetList)
 */
let requestSeq = 0

async function load() {
  const seq = ++requestSeq
  loading.value = true
  loadError.value = ''
  try {
    const res = await listPurchaseOrders({
      search: search.value.trim() || undefined,
      companyCode: companyCode.value || undefined,
      sort: sort.value,
      page: page.value,
      limit: PAGE_SIZE,
    })
    if (seq !== requestSeq) return
    rows.value = res.data
    total.value = res.total
  } catch (e) {
    if (seq !== requestSeq) return
    console.error('โหลดรายการ PO ไม่สำเร็จ:', e)
    loadError.value = 'โหลดรายการ PO ไม่สำเร็จ กรุณาลองใหม่'
    rows.value = []
    total.value = 0
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

// พิมพ์ค้นแล้วรอให้หยุดพิมพ์ก่อนค่อยยิง — ไม่งั้นได้คำขอหนึ่งชุดต่อหนึ่งตัวอักษร
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1 // คำค้นใหม่ = ชุดผลลัพธ์ใหม่ หน้าเดิมอาจไม่มีอยู่แล้ว
    void load()
  }, 300)
})

// เปลี่ยนตัวกรอง/การเรียง = ยิงทันที ไม่ต้อง debounce (มาจากการคลิก ไม่ใช่การพิมพ์)
watch([companyCode, sort], () => {
  page.value = 1
  void load()
})

watch(page, () => void load())

function selectPO(po: PurchaseOrderSummary) {
  selectedPO.value = po
  unSelect.value = false // เลือกได้แล้ว → เคลียร์ warning
}

function clearSelectedPO() {
  selectedPO.value = null
  detailError.value = ''
  unSelect.value = false
}

function close() {
  if (creating.value) return // กำลังสร้างอยู่ห้ามปิด (กติกาเดียวกับ loading ของ AppConfirmDialog)
  clearSelectedPO() // ปิดแล้วล้างของเดิม กันค้างตอนเปิดใหม่
  emit('update:open', false)
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

// กด Create → สร้าง draft แล้วส่ง requestId ให้ parent เปิดหน้าฟอร์มต่อ
async function onCreateClick() {
  if (!selectedPO.value) {
    unSelect.value = true
    return
  }
  if (creating.value) return
  creating.value = true
  detailError.value = ''

  try {
    const { requestId } = await createDraft(selectedPO.value.poNumber)
    emit('created', requestId)
    close()
  } catch (e) {
    console.error('สร้าง draft ไม่สำเร็จ:', e)
    detailError.value = 'สร้างคำขอไม่สำเร็จ กรุณาลองใหม่'
  } finally {
    creating.value = false
  }
}

/**
 * โหลดตอนเปิดกล่อง ไม่ใช่ตอน mount — กล่องนี้ mount ค้างไว้ตลอดอายุหน้า คนที่เข้ามาแล้ว
 * ไม่กดสร้างคำขอเลยไม่ต้องจ่ายสองคำขอนี้
 *
 * รายชื่อบริษัทโหลดครั้งเดียวพอ (เปลี่ยนแค่ตอนเพิ่มบริษัทใหม่ ซึ่งต้อง deploy อยู่แล้ว)
 */
let companiesLoaded = false
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      document.removeEventListener('keydown', onKeydown)
      return
    }
    document.addEventListener('keydown', onKeydown)
    void load()
    if (companiesLoaded) return
    companiesLoaded = true
    listCompanies()
      .then((list) => (companies.value = list))
      // ตัวกรองบริษัทหายไปไม่ควรลากทั้งกล่องตาย — ตารางยังใช้งานได้ครบโดยไม่กรอง
      .catch(() => (companiesLoaded = false))
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  clearTimeout(debounce)
})

/** '2026-08-25T17:00:00.000Z' → '25/08/2026' — ตารางแคบ ใช้รูปสั้นที่สุดที่ยังอ่านออก */
function formatDate(v: string | null): string {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? '-'
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
</script>

<template>
  <Teleport to="body">
    <div class="modal backdrop-blur-sm" :class="{ 'modal-open': open }" role="dialog" aria-modal="true">
      <div class="modal-box" :class="maxWidth ?? 'max-w-3xl'">
        <!-- header - วางโครงเดียวกับ AppConfirmDialog: ไอคอนวงกลม + หัวข้อ + คำอธิบาย -->
        <div class="flex items-start justify-between gap-4">
          <slot name="header">
            <div class="flex flex-1 items-start gap-4">
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-info/10 text-xl text-info"
              >
                <Icon icon="lucide:file-plus-2" />
              </div>
              <div class="text-left">
                <h3 class="text-lg font-semibold">Create New Request</h3>
                <p class="mt-1 text-sm text-base-content/60">
                  สร้างคำขอลงทะเบียนใหม่ - เลือก PO ที่ต้องการลงทะเบียนสินทรัพย์
                </p>
              </div>
            </div>
          </slot>

          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            aria-label="Close"
            :disabled="creating"
            @click="close"
          >
            <Icon icon="lucide:x" />
          </button>
        </div>

        <div class="py-4">
          <slot name="body" />

          <!-- ── แถวตัวกรอง: ค้น / บริษัท / เรียงวันที่ -->
          <div class="flex flex-wrap items-end gap-2">
            <label class="input input-sm min-w-[12rem] flex-1">
              <Icon icon="lucide:search" class="opacity-60" />
              <input v-model="search" type="search" placeholder="PO No. / Vendor Name" />
            </label>

            <select v-model="companyCode" class="select select-sm w-[9rem]">
              <option value="">ทุกบริษัท</option>
              <option v-for="c in companies" :key="c.code" :value="c.code">{{ c.name }}</option>
            </select>

            <!-- ปุ่มเดียวสลับสองทิศ ไม่ใช่ dropdown — มีแค่สองค่า ทำเป็นตัวเลือกจะเปลืองคลิก -->
            <button
              type="button"
              class="btn btn-sm"
              :title="sort === 'date_desc' ? 'ตอนนี้: ใหม่สุดก่อน' : 'ตอนนี้: เก่าสุดก่อน'"
              @click="sort = sort === 'date_desc' ? 'date_asc' : 'date_desc'"
            >
              <Icon :icon="sort === 'date_desc' ? 'lucide:arrow-down-wide-narrow' : 'lucide:arrow-up-narrow-wide'" />
              วันที่
            </button>
          </div>
          <div v-if="selectedPO" class="mt-4">
            <PoSummaryCard :selectedPO="selectedPO" @clear="clearSelectedPO" />
          </div>
          <!-- ── ตาราง PO — ความสูงคงที่ ไม่ให้กล่องกระโดดตอนผลลัพธ์เหลือน้อย -->
          <div class="mt-3 h-[19rem] overflow-y-auto rounded-box border border-base-300">
            <table class="table table-pin-rows table-sm table-freeze-first">
              <thead>
                <tr>
                  <th class="freeze-col">PO No.</th>
                  <th>Vendor</th>
                  <th class="w-28">วันที่</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="po in rows"
                  :key="po.poNumber"
                  class="cursor-pointer hover:bg-base-200"
                  :class="{ 'bg-primary/10': po.poNumber === selectedPO?.poNumber }"
                  @click="selectPO(po)"
                >
                  <td class="freeze-col font-mono whitespace-nowrap">{{ po.poNumber }}</td>
                  <td class="max-w-[16rem] truncate">{{ po.vendorName ?? '-' }}</td>
                  <td class="whitespace-nowrap">{{ formatDate(po.poDate) }}</td>
                </tr>
              </tbody>
            </table>

            <div v-if="loading" class="flex justify-center py-10">
              <span class="loading loading-spinner"></span>
            </div>
            <p v-else-if="loadError" class="px-4 py-10 text-center text-sm text-error">
              {{ loadError }}
            </p>
            <p v-else-if="!rows.length" class="px-4 py-10 text-center text-sm text-base-content/60">
              ไม่พบ PO ที่ตรงกับเงื่อนไข
            </p>
          </div>

          <!-- ── แถบเลื่อนหน้า — ซ่อนทั้งแถบเมื่อมีหน้าเดียว ไม่ใช่โชว์ปุ่มจาง ๆ -->
          <div v-if="lastPage > 1" class="mt-2 flex items-center justify-between text-sm">
            <span class="text-base-content/60">{{ total }} ใบ · หน้า {{ page }}/{{ lastPage }}</span>
            <div class="join">
              <button
                type="button"
                class="btn btn-sm join-item"
                :disabled="page <= 1 || loading"
                @click="page--"
              >
                <Icon icon="lucide:chevron-left" />
              </button>
              <button
                type="button"
                class="btn btn-sm join-item"
                :disabled="page >= lastPage || loading"
                @click="page++"
              >
                <Icon icon="lucide:chevron-right" />
              </button>
            </div>
          </div>

          <div v-if="unSelect && !selectedPO" role="alert" class="alert alert-error alert-soft mt-2">
            <Icon icon="lucide:circle-alert" />
            <span>กรุณาเลือก PO ก่อนกด Create</span>
          </div>

          <div v-if="detailError" role="alert" class="alert alert-error alert-soft mt-2">
            <Icon icon="lucide:circle-alert" />
            <span>{{ detailError }}</span>
          </div>


        </div>

        <div class="modal-action">
          <slot name="footer" />
          <button type="button" class="btn btn-ghost" :disabled="creating" @click="close">
            ยกเลิก
          </button>
          <button type="button" class="btn btn-primary" :disabled="creating" @click="onCreateClick">
            <span v-if="creating" class="loading loading-spinner loading-sm"></span>
            Create
          </button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>
  </Teleport>
</template>
