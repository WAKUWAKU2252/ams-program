      search: search.value.trim() || undefined,
<script setup lang="ts">
/**
 * กล่องสร้างคำขอแก้ทะเบียน - ค้นหาสินทรัพย์ แล้วเลือกว่าจะขออะไร
 *
 * ── ★ จุดเริ่มคือ "ปุ่ม Create ในหน้านี้" ไม่ใช่กล่องรายละเอียดสินทรัพย์
 *
 * โครงเดียวกับ CreateRequestModal ของหน้า Create New Asset (ค้น → เลือกจากตาราง → กรอก)
 * ต่างกันแค่ของที่ค้นเป็น "ชิ้นในทะเบียน" แทน "ใบ PO"
 *
 * ── ★★ สองขั้นในกล่องเดียว ไม่ใช่ wizard หลายหน้า
 *
 * ขั้นสองสั้นมาก (เลือกชนิด + ปลายทาง + เหตุผล) แยกหน้าแล้วต้องมีปุ่มถอยหลัง/สถานะค้าง
 * ระหว่างหน้า ซึ่งมากกว่าที่งานนี้ต้องการ - เลือกชิ้นแล้วฟอร์มโผล่ต่อท้ายเลย กดเปลี่ยน
 * ชิ้นได้ตลอดจากปุ่มบนการ์ดสรุป
 *
 * ── ★ ต้องยิง getAsset() ซ้ำหลังเลือก
 *
 * ตารางทะเบียน (GET /assets/inventory) คืนแต่ "ชื่อ" ที่คนอ่าน ไม่มี employeeId/locationId
 * ซึ่งฟอร์มต้องใช้เทียบว่าปลายทางซ้ำกับค่าปัจจุบันไหม - ดึงทีละชิ้นตอนเลือกถูกกว่าการไป
 * ขยาย payload ของเส้นทะเบียนที่ทั้งระบบใช้ร่วมกัน
 */
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppEmployeeSelect from '@/shared/components/AppEmployeeSelect.vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import { ApiError } from '@/shared/services/httpClient'
import { getAsset, getAssetInventory, type InventoryItem } from '@/shared/services/asset.service'
import { listLocations, type LocationOption } from '@/shared/services/master.service'
import {
  openChangeRequestsFor,
  submitChangeRequest,
  type ChangeKind,
} from '@/shared/services/assetChangeRequest.service'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'created'): void
}>()

const PAGE_SIZE = 8

/* ── ขั้น 1: ค้นหาสินทรัพย์ ─────────────────────────────────────────────── */
const search = ref('')
const rows = ref<InventoryItem[]>([])
const total = ref(0)
const page = ref(1)
const loadingList = ref(false)
const listError = ref('')
/**
 * โหลดสำเร็จไปแล้วอย่างน้อยหนึ่งรอบ - ตัวแยก "ยังไม่มีอะไรให้ดู" ออกจาก "กำลังโหลดของชุดใหม่"
 *
 * ★ ถ้าไม่มีตัวนี้ ทุกครั้งที่เปลี่ยนหน้าตารางจะถูกถอดออกแล้วเอา spinner มาแทน ความสูงกล่อง
 *   ยุบแล้วขยายกลับ = กระตุกทุกคลิก (และ scroll เด้งกลับบนสุดด้วย)
 */
const loadedOnce = ref(false)

/**
 * ตัวกันผลเก่ามาทับผลใหม่
 *
 * ★ พิมพ์เร็ว ๆ หรือกดข้ามหน้ารัว ๆ แล้ว response ของคำขอเก่ามาถึงทีหลัง จะเขียนทับแถว
 *   ของคำขอล่าสุด - ผู้ใช้เห็นหน้า 2 ทั้งที่กดหน้า 3 ไปแล้ว (ทรงเดียวกับ AppEmployeeSelect)
 */
let requestSeq = 0

/** ชิ้นที่เลือก - null = ยังอยู่ขั้นค้นหา */
const picked = ref<InventoryItem | null>(null)
/** ค่าปัจจุบันของชิ้นนั้น (ต้องยิงซ้ำ ดูหัวไฟล์) */
const pickedDetail = ref<{ locationId: number; employeeId: number | null } | null>(null)
/**
 * ชนิดของใบที่ชิ้นนี้ยังค้างอยู่ที่บัญชี - โหลดพร้อม pickedDetail ตอนเลือกชิ้น
 *
 * ★ เส้น GET /asset-change-requests/open/:id จงใจไม่ล็อกที่เจ้าของใบ เพราะ "ชิ้นนี้มีคนขอ
 *   อยู่แล้ว" เป็นข้อเท็จจริงของชิ้น ไม่ใช่ความลับของผู้ขอ - คนที่เปิดกล่องนี้จึงเห็นใบค้าง
 *   ของคนอื่นด้วย (คืนมาแค่ id กับ kind ไม่มีเนื้อหาใบ)
 */
const pickedOpenKinds = ref<ChangeKind[]>([])
const loadingDetail = ref(false)

async function loadList() {
  const seq = ++requestSeq
  loadingList.value = true
  listError.value = ''
  try {
    const res = await getAssetInventory({
      search: search.value.trim() || undefined,
      page: page.value,
      limit: PAGE_SIZE,
    })
    if (seq !== requestSeq) return // มีคำขอใหม่กว่าเกิดขึ้นระหว่างรอ - ทิ้งผลนี้
    rows.value = res.data
    total.value = res.total
    loadedOnce.value = true
  } catch (e) {
    if (seq !== requestSeq) return
    listError.value = e instanceof ApiError ? e.message : 'ค้นหาสินทรัพย์ไม่สำเร็จ'
  } finally {
    if (seq === requestSeq) loadingList.value = false
  }
}

/**
 * ── ค้นหา/เปลี่ยนหน้า ผูกกับ "การกระทำของผู้ใช้" ไม่ใช่ watch ที่ค่า ────────────────
 *
 * ★ เดิมเป็น watch(search) + watch(page) ซึ่งแยกไม่ออกว่าค่าเปลี่ยนเพราะคนพิมพ์/กดหน้า
 *   หรือเพราะโค้ดรีเซ็ตเอง ผลคือยิงซ้ำสองครั้งอยู่สองทาง:
 *     1. เปิดกล่องรอบสอง - watcher ของ props.open เซ็ต search='' + page=1 ปลุกทั้งคู่
 *        แล้วยังเรียก loadList() ตรง ๆ ต่อท้ายอีก
 *     2. ค้นหาตอนอยู่หน้า 2 ขึ้นไป - debounce เซ็ต page=1 ปลุก watch(page) ซ้อนกับ
 *        loadList() บรรทัดถัดมา
 *   requestSeq ทิ้งผลที่มาช้าให้ก็จริง แต่ request ถูกส่งออกไปจริงทั้งสองครั้ง
 *
 * ★ debounce อ่าน search.value ตอน "ยิง" ไม่ใช่ตอนพิมพ์ ลำดับระหว่าง v-model กับ @input
 *   จึงไม่สำคัญ - อีก 300ms ค่าอัปเดตไปแล้วแน่นอน
 */
let debounce: ReturnType<typeof setTimeout> | undefined

/** พิมพ์แล้วรอให้หยุดก่อนค่อยยิง - ไม่งั้นยิงทุกตัวอักษร */
function onSearchInput() {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void loadList()
  }, 300)
}

function goToPage(p: number) {
  page.value = p
  void loadList()
}

async function pick(item: InventoryItem) {
  picked.value = item
  pickedDetail.value = null
  pickedOpenKinds.value = []
  error.value = ''
  loadingDetail.value = true
  try {
    /**
     * ยิงคู่กัน - ทั้งสองเส้นถามเรื่องชิ้นเดียวกันและไม่มีใครต้องรอผลของอีกฝั่ง
     *
     * ★ เส้น open/ ล้มแล้วไม่ต้องล้มทั้งการเลือกชิ้น - มันเป็นแค่ "บอกก่อน" ด่านจริงอยู่ที่
     *   partial unique ฝั่ง DB ซึ่งยังกันให้อยู่ดี ถ้าปล่อยให้ reject ทั้งก้อน คนจะเลือกชิ้น
     *   ไม่ได้เลยเพราะเส้นที่เป็นแค่ของเสริมล่ม (แย่กว่าการตกไปเจอ 409 แบบเดิม)
     */
    const [d, open] = await Promise.all([
      getAsset(item.id),
      openChangeRequestsFor(item.id).catch(() => []),
    ])
    pickedDetail.value = { locationId: d.locationId, employeeId: d.employeeId }
    pickedEmployee.value = d.employeeId ?? 0
    pickedOpenKinds.value = open.map((o) => o.kind)

    // เปิดมาที่แท็บที่ส่งได้จริง - ค่าตั้งต้นคือ HOLDER ถ้าฝั่งนั้นมีใบค้างแต่ฝั่งสถานที่ว่าง
    // การเปิดมาที่แท็บที่กดไม่ได้แปลว่าผู้ใช้ต้องเดาเองว่าให้ไปกดอีกแท็บ
    if (kindTaken(kind.value)) {
      const free = (['HOLDER', 'LOCATION'] as const).find((k) => !kindTaken(k))
      if (free) kind.value = free
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'โหลดรายละเอียดสินทรัพย์ไม่สำเร็จ'
    picked.value = null
  } finally {
    loadingDetail.value = false
  }
}

function unpick() {
  picked.value = null
  pickedDetail.value = null
  pickedOpenKinds.value = []
  resetForm()
}

/* ── ขั้น 2: ขออะไร ────────────────────────────────────────────────────── */
const kind = ref<ChangeKind>('HOLDER')
const pickedEmployee = ref(0)
const pickedLocation = ref(0)
const reason = ref('')
const saving = ref(false)
const error = ref('')

const locations = ref<LocationOption[]>([])
const loadingLocations = ref(false)

const isMove = computed(() => kind.value === 'LOCATION')

/**
 * ชนิดที่ชิ้นนี้มีใบค้างอยู่แล้ว - กติกาเดียวกับ partial unique (assetId, kind)
 * WHERE status='SUBMITTED' ฝั่ง DB คือ "ค้างได้ชนิดละหนึ่งใบ" ไม่ใช่ชิ้นละหนึ่งใบ
 * (ขอย้ายสถานที่กับขอเปลี่ยนผู้ครอบครองพร้อมกันได้)
 */
const kindTaken = (k: ChangeKind) => pickedOpenKinds.value.includes(k)
const currentKindTaken = computed(() => kindTaken(kind.value))
const bothKindsTaken = computed(() => kindTaken('HOLDER') && kindTaken('LOCATION'))

function resetForm() {
  kind.value = 'HOLDER'
  pickedEmployee.value = 0
  pickedLocation.value = 0
  reason.value = ''
  error.value = ''
}

/** โหลดรายการสถานที่ครั้งเดียวตอนสลับมาแท็บย้าย - ไม่ต้องโหลดถ้าไม่มีใครใช้ */
watch([kind, () => props.open], async ([k, isOpen]) => {
  if (!isOpen || k !== 'LOCATION' || locations.value.length) return
  loadingLocations.value = true
  try {
    locations.value = await listLocations()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'โหลดรายการสถานที่ไม่สำเร็จ'
  } finally {
    loadingLocations.value = false
  }
})

/**
 * ★ ปลายทางต้องต่างจากค่าปัจจุบัน - backend ปฏิเสธอยู่แล้ว แต่บอกตั้งแต่ก่อนกดดีกว่า
 *   ปล่อยให้กดแล้วเจอข้อความสีแดงโดยไม่รู้ว่าพลาดตรงไหน
 * ★ ฝั่งผู้ครอบครอง 0 เป็นค่าที่ใช้ได้จริง (= ขอให้ว่าง) จึงเทียบกับค่าปัจจุบัน
 *   ไม่ใช่เช็คว่า "เลือกหรือยัง"
 * ★ currentKindTaken ต้องอยู่ในนี้ด้วย ไม่ใช่เช็คแค่ตอน save() - ฟอร์มถูกซ่อนตอนแท็บนั้น
 *   มีใบค้างก็จริง แต่ reason/ปลายทางที่กรอกค้างไว้จากแท็บก่อนหน้ายังอยู่ ปุ่มส่งจะกดได้
 *   ทั้งที่ยิงไปก็โดน 409
 */
const canSubmit = computed(() => {
  if (!picked.value || !pickedDetail.value || !reason.value.trim()) return false
  if (currentKindTaken.value) return false
  return isMove.value
    ? pickedLocation.value > 0 && pickedLocation.value !== pickedDetail.value.locationId
    : pickedEmployee.value !== (pickedDetail.value.employeeId ?? 0)
})

function close() {
  emit('update:open', false)
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    // ★ ล้าง debounce ที่ค้างจากตัวอักษรสุดท้ายก่อนปิดกล่องรอบก่อน - ไม่งั้นมันจะตื่นมา
    //   ยิงค้นหาด้วยคำที่ถูกล้างไปแล้วทับผลของรอบนี้ (ตอนนี้ search='' มันจึงกลายเป็นการ
    //   ยิงซ้ำเปล่า ๆ อีกครั้ง)
    clearTimeout(debounce)
    loadedOnce.value = false
    rows.value = []
    search.value = ''
    page.value = 1
    unpick()
    void loadList()
  },
)

async function save() {
  if (!picked.value || !canSubmit.value) return
  saving.value = true
  error.value = ''
  try {
    await submitChangeRequest({
      assetId: picked.value.id,
      kind: kind.value,
      ...(isMove.value
        ? { toLocationId: pickedLocation.value }
        : // 0 บน AppEmployeeSelect = "ไม่ระบุ" ซึ่งฝั่ง API คือ null (ขอให้ว่าง)
          { toEmployeeId: pickedEmployee.value === 0 ? null : pickedEmployee.value }),
      reason: reason.value.trim(),
    })
    emit('created')
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'ส่งคำขอไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog class="modal" :open="open" @close="close">
    <div class="modal-box max-w-4xl">
      <h3 class="flex items-center gap-2 text-base font-semibold">
        <Icon icon="lucide:file-pen-line" class="text-lg" />
        สร้างคำขอใหม่
      </h3>
      <!-- ★ ต้องบอกตั้งแต่บรรทัดแรกว่านี่คือ "คำขอ" ไม่ใช่การแก้ - ไม่งั้นผู้ใช้จะปิดกล่อง
           แล้วคาดว่าทะเบียนเปลี่ยนทันที แล้วกดซ้ำ -->
      <p class="mt-1 text-xs text-base-content/60">
        สร้างคำขอเปลี่ยนผู้ถือครองหรือเปลี่ยนสถานที่ใหม่
      </p>

      <!-- ── ขั้น 1: ค้นหาและเลือกสินทรัพย์ ─────────────────────────────── -->
      <template v-if="!picked">
        <label class="input input-bordered mt-4 flex w-full items-center gap-2">
          <Icon icon="lucide:search" class="size-4 opacity-60" />
          <input v-model="search" type="search" class="grow" placeholder="ค้นเลขสินทรัพย์ / ชื่อ / S/N"
            @input="onSearchInput" />
        </label>

        <div v-if="listError" role="alert" class="alert alert-error alert-soft mt-3 text-sm">
          {{ listError }}
        </div>

        <!-- ★ spinner เต็มพื้นที่เฉพาะรอบแรกเท่านั้น - รอบถัด ๆ ไปคาตารางไว้แล้วหรี่แทน
             (ดูเหตุผลที่ loadedOnce) -->
        <div v-else-if="loadingList && !loadedOnce" class="py-10 text-center">
          <span class="loading loading-spinner"></span>
        </div>

        <p v-else-if="loadedOnce && !rows.length" class="py-10 text-center text-sm text-base-content/60">
          ไม่พบสินทรัพย์ที่ตรงกับคำค้น
        </p>

        <!-- ★ min-h ล็อกความสูงไว้เท่าหน้าเต็ม - หน้าสุดท้ายมีแถวน้อยกว่า ถ้าไม่ล็อก
             กล่องจะหดตอนกดไปหน้านั้นแล้วขยายกลับตอนถอยออกมา -->
        <div v-else
          class="relative mt-3 min-h-[19rem] overflow-x-auto rounded-box border border-base-300"
          :class="loadingList ? 'opacity-50 transition-opacity' : ''">
          <span v-if="loadingList"
            class="loading loading-spinner loading-sm absolute right-3 top-3 z-10"></span>
          <table class="table table-sm" :class="loadingList ? 'pointer-events-none' : ''">
            <thead>
              <tr>
                <th>เลขสินทรัพย์</th>
                <th>รายละเอียด</th>
                <th>บริษัท</th>
                <th>สถานที่</th>
                <th>ผู้ถือครอง</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in rows" :key="item.id" class="hover">
                <td class="font-medium">{{ item.assetNumber }}</td>
                <td class="max-w-[14rem] truncate" :title="item.description ?? ''">
                  {{ item.description ?? '-' }}
                </td>
                <td>{{ item.companyCode }}</td>
                <td>{{ item.locationName }}</td>
                <td>{{ item.holderName ?? '-' }}</td>
                <td class="text-right">
                  <button type="button" class="btn btn-primary btn-xs" @click="pick(item)">
                    เลือก
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AppPagination v-if="total > PAGE_SIZE" class="mt-3" :page="page" :total="total"
          :limit="PAGE_SIZE" @update:page="goToPage" />
      </template>

      <!-- ── ขั้น 2: ขออะไร ────────────────────────────────────────────── -->
      <template v-else>
        <div class="mt-4 flex items-start gap-3 rounded-box bg-base-200 px-3 py-2">
          <div class="min-w-0 flex-1 text-sm">
            <div class="font-medium">{{ picked.assetNumber }}</div>
            <div class="truncate text-xs text-base-content/70">{{ picked.description ?? '-' }}</div>
            <div class="mt-1 text-xs text-base-content/60">
              {{ picked.companyCode }} · {{ picked.locationName }} ·
              {{ picked.holderName ?? 'ไม่มีผู้ถือครอง' }}
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs" @click="unpick">เปลี่ยนชิ้น</button>
        </div>

        <div v-if="loadingDetail" class="py-8 text-center">
          <span class="loading loading-spinner loading-sm"></span>
        </div>

        <div v-else class="mt-4 space-y-4">
          <!-- ★ แท็บที่มีใบค้างอยู่ยังกดได้ - ปิดไปเลยแปลว่าผู้ใช้เห็นแท็บเทา ๆ โดยไม่มีที่ไหน
               บอกว่าทำไม ให้กดเข้าไปอ่านเหตุผลในกล่องเตือนแทน (ทรงเดียวกับชิ้นที่ถูกตีกลับ
               ในหน้าออกเลข) - ไอคอนนาฬิกาบอกล่วงหน้าว่าแท็บนั้นมีใบค้าง -->
          <div role="tablist" class="tabs tabs-box tabs-sm w-fit">
            <button type="button" role="tab" class="tab" :class="kind === 'HOLDER' ? 'tab-active' : ''"
              @click="kind = 'HOLDER'">
              เปลี่ยนผู้ครอบครอง
              <Icon v-if="kindTaken('HOLDER')" icon="lucide:clock" class="ml-1 size-3.5 opacity-60" />
            </button>
            <button type="button" role="tab" class="tab" :class="kind === 'LOCATION' ? 'tab-active' : ''"
              @click="kind = 'LOCATION'">
              ย้ายสถานที่
              <Icon v-if="kindTaken('LOCATION')" icon="lucide:clock" class="ml-1 size-3.5 opacity-60" />
            </button>
          </div>

          <!-- ── ชิ้นนี้มีใบชนิดเดียวกันค้างอยู่: ซ่อนฟอร์มไปเลย ────────────────────
               ★ ปล่อยให้กรอกได้แล้วค่อยเด้ง 409 ตอนกดส่ง = เสียเวลาทั้งรอบโดยที่รู้ได้ตั้งแต่
                 ตอนเลือกชิ้น (DB มี partial unique (assetId, kind) WHERE status='SUBMITTED'
                 ฝั่ง backend อยู่แล้ว ตรงนี้แค่เอามาบอกก่อน ไม่ได้แทนด่านนั้น) -->
          <div v-if="currentKindTaken" role="alert" class="alert alert-warning alert-soft text-sm">
            <Icon icon="lucide:clock" class="size-4 shrink-0" />
            <span>
              ชิ้นนี้มีคำขอ{{ isMove ? 'ย้ายสถานที่' : 'เปลี่ยนผู้ครอบครอง' }}รอบัญชีอยู่แล้ว
              ส่งซ้ำไม่ได้จนกว่าบัญชีจะดำเนินการหรือตีกลับใบเดิม
              <template v-if="bothKindsTaken">
                - ชิ้นนี้มีใบค้างครบทั้งสองเรื่อง ต้องกด "เปลี่ยนชิ้น" ถึงจะส่งใบใหม่ได้
              </template>
              <template v-else>
                - ถ้าจะขออีกเรื่องให้สลับไปอีกแท็บด้านบน
              </template>
            </span>
          </div>

          <template v-else>
            <label class="form-control">
              <span class="label-text mb-1 block text-sm">
                {{ isMove ? 'สถานที่ปลายทาง' : 'ผู้ครอบครองคนใหม่' }}
              </span>

              <select v-if="isMove" v-model.number="pickedLocation"
                class="select select-bordered w-full" :disabled="loadingLocations || saving">
                <option :value="0" disabled>
                  {{ loadingLocations ? 'กำลังโหลด...' : 'เลือกสถานที่' }}
                </option>
                <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
              </select>

              <!-- ★ ส่ง companyCode ของชิ้นเข้าไป - ตัวเลือกจะปิดคนที่ไม่มีรหัสใน SAP ของ
                   บริษัทนั้นพร้อมบอกเหตุผล (ไม่งั้นเลือกได้แล้วไปเจอ error ตอนกดส่ง) -->
              <AppEmployeeSelect v-else v-model="pickedEmployee" :disabled="saving"
                :company-code="picked.companyCode" />

              <span v-if="!isMove" class="mt-1 text-xs text-base-content/60">
                หากไม่มีผู้ถือครองให้เว้นว่างไว้
              </span>
            </label>

            <label class="form-control">
              <span class="label-text mb-1 block text-sm">เหตุผล</span>
              <textarea v-model="reason" class="textarea textarea-bordered w-full" rows="3"
                maxlength="500" placeholder="บัญชีใช้ข้อมูลนี้ตัดสินใจก่อนบันทึกที่ SAP"
                :disabled="saving"></textarea>
            </label>
          </template>
        </div>
      </template>

      <div v-if="error" role="alert" class="alert alert-error alert-soft mt-3 text-sm">
        {{ error }}
      </div>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="close">
          ยกเลิก
        </button>
        <button v-if="picked" type="button" class="btn btn-primary btn-sm"
          :disabled="!canSubmit || saving" @click="save">
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          ส่งคำขอ
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button @click="close">close</button>
    </form>
  </dialog>
</template>
