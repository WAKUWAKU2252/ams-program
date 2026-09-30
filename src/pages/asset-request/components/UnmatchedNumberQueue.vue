<script setup lang="ts">
/**
 * เลขที่ยังไม่พบใน SAP - ชิ้นที่ออกเลขแล้ว แต่ sync ยังไม่เคยเจอเลขนั้นใน SAP
 *
 * ── ใช้ทำอะไร
 *
 * เลขที่พิมพ์ผิดหลังกดแจ้งผลกลับผู้ขอไปแล้วเคยเป็นทางตัน: ชิ้นในใบถือเลขที่ SAP ไม่มี
 * (ข้อมูลบัญชีไม่มีวันมา) ส่วนเลขที่ถูกถูก sync ดึงมาเป็นแถวแยก - ของชิ้นเดียวมีสองแถว
 * รายการนี้ให้บัญชีไล่หาเลขพวกนั้นแล้วแก้เลข/รวมแถวได้เอง
 *
 * ★ ไม่ใช่รายการ "ผิดแน่ ๆ" - ชิ้นที่เพิ่งออกเลขจะอยู่ที่นี่จนกว่า sync รอบถัดไป (ทุก 3 ชม.)
 *   จึงโชว์ว่าค้างมานานเท่าไร ให้บัญชีแยกเองว่าตัวไหนน่าสงสัย
 *
 * ★ ใบที่ยังไม่แจ้งผลกลับผู้ขอไม่มีปุ่มแก้ที่นี่ - มีทางปกติที่หน้าออกเลขซึ่งมี lock กันคนแก้ชน
 *   ปุ่มจึงพาไปเปิดใบแทน
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import AssetNumberInput from './AssetNumberInput.vue'
import { ApiError } from '@/shared/services/httpClient'
import {
  getSapMatch,
  listUnmatchedNumbers,
  renumberAsset,
  type RenumberResponse,
  type SapMatch,
  type UnmatchedNumberRow,
} from '@/shared/services/assetRequest.service'
import { openAssetLabel } from '@/shared/services/asset.service'
import { formatDate, formatDateTime } from '@/shared/utils/date'
import { formatMoney } from '@/shared/utils/money'

/** โหลดเสร็จทุกรอบ - หน้าแม่เอา total ไปขึ้นเลขบนแท็บ */
const emit = defineEmits<{ loaded: [total: number] }>()

const router = useRouter()

const rows = ref<UnmatchedNumberRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = 10
const loading = ref(false)
const loadError = ref('')
/** โหลดสำเร็จแล้วอย่างน้อยหนึ่งรอบ - ดูเหตุผลที่ ChangeRequestQueue (ตารางไม่กระตุกตอนเปลี่ยนหน้า) */
const loadedOnce = ref(false)
const searchText = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await listUnmatchedNumbers({ page: page.value, limit, search: searchText.value })
    rows.value = res.data
    total.value = res.total
    loadedOnce.value = true
    // ★ ส่งเลขบนแท็บเฉพาะตอนไม่ได้ค้น - ตัวเลขบนแท็บตอบว่า "เหลือทั้งหมดเท่าไร"
    //   ไม่ใช่ "ตรงกับคำค้นกี่ตัว"
    if (!searchText.value.trim()) emit('loaded', res.total)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

// พิมพ์ค้น = หน่วงก่อนยิง (กติกาเดียวกับคิวออกเลข) และกลับหน้า 1 เสมอ
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void load()
  }, 350)
})
watch(page, () => void load())
onMounted(load)
onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  window.removeEventListener('keydown', onKeydown)
})

const DAY_MS = 24 * 60 * 60 * 1000

/** ค้างมากี่วันนับจากวันออกเลข - 0 = วันนี้ ซึ่งส่วนใหญ่แค่ยังไม่ถึงรอบ sync */
function daysPending(row: UnmatchedNumberRow): number | null {
  if (!row.registeredAt) return null
  const t = new Date(row.registeredAt).getTime()
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY_MS))
}

function openRequest(requestId: number) {
  router.push({ name: 'AssetRequestForm', params: { requestId: String(requestId) } })
}

// ── กล่องแก้เลข ─────────────────────────────────────────────────────────────
//
// สามช่วงในกล่องเดียว: กรอกเลข → (ถ้าชนแถวจาก SAP) เทียบข้อมูลแล้วกดผูก → ผลลัพธ์
// ผลลัพธ์ต้องค้างไว้ในกล่อง ไม่ปิดหนี - ปุ่มพิมพ์สติกเกอร์ใหม่อยู่ตรงนั้น และสติกเกอร์เก่า
// ใช้ไม่ได้แล้วตั้งแต่วินาทีที่บันทึก ถ้าปิดกล่องทันทีบัญชีจะไม่มีอะไรเตือน
const target = ref<UnmatchedNumberRow | null>(null)
const newNumber = ref('')
const saving = ref(false)
const saveError = ref('')
const sapMatch = ref<SapMatch | null>(null)
const result = ref<RenumberResponse | null>(null)
const printing = ref(false)
const printError = ref('')

/** กำลังจะกดผูกกับแถวจาก SAP (ปุ่มเปลี่ยนเป็นสีเตือน) - เฉพาะเมื่อ backend บอกว่าผูกได้ */
const adopting = computed(() => sapMatch.value !== null && sapMatch.value.adoptable)

const canSave = computed(
  () =>
    !saving.value &&
    newNumber.value.trim().length > 0 &&
    newNumber.value.trim() !== target.value?.assetNumber &&
    // ชนแถวจาก SAP ที่ผูกไม่ได้ = กดซ้ำก็ได้ผลเดิม ต้องแก้เลขก่อน
    (sapMatch.value === null || sapMatch.value.adoptable),
)

// แก้เลขที่พิมพ์ = รายละเอียดของแถวจาก SAP ที่โชว์อยู่ไม่ใช่ของเลขนี้แล้ว
watch(newNumber, () => {
  sapMatch.value = null
  saveError.value = ''
})

function openRenumber(row: UnmatchedNumberRow) {
  target.value = row
  newNumber.value = ''
  saveError.value = ''
  sapMatch.value = null
  result.value = null
  printError.value = ''
}

function closeRenumber() {
  if (saving.value) return
  target.value = null
}

// ESC ปิดกล่อง - div ธรรมดาไม่ได้รับ keydown ถ้าไม่มี focus ต้องฟังที่ window ตอนกล่องเปิด
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeRenumber()
}
watch(
  () => target.value !== null,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

async function onSave() {
  const row = target.value
  if (!row || !canSave.value) return
  saving.value = true
  saveError.value = ''
  try {
    result.value = await renumberAsset(
      row.requestId,
      row.assetId,
      newNumber.value,
      adopting.value ? sapMatch.value!.assetId : undefined,
    )
    // โหลดตารางข้างหลังไปเลย - กล่องยังค้างผลลัพธ์อยู่ด้านหน้า
    void load()
  } catch (e) {
    // 409 อาจเป็น "เลขนี้ sync ดึงมาจาก SAP แล้ว" ซึ่งมีทางไปต่อ (ผูก) - ถามรายละเอียดมาโชว์แทน
    // ★ ไม่ถามซ้ำตอนกำลังผูกอยู่แล้ว - 409 รอบนั้นคือผูกไม่ผ่าน ให้ขึ้นข้อความของ backend ตรง ๆ
    if (!adopting.value && e instanceof ApiError && e.status === 409) {
      const match = await getSapMatch(row.requestId, row.assetId, newNumber.value)
        .then((r) => r.match)
        .catch(() => null)
      if (match) {
        sapMatch.value = match
        return
      }
    }
    saveError.value = e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'
    sapMatch.value = null
  } finally {
    saving.value = false
  }
}

async function printLabel() {
  const row = target.value
  if (!row || printing.value) return
  printing.value = true
  printError.value = ''
  try {
    await openAssetLabel(row.assetId)
  } catch (e) {
    printError.value = e instanceof Error ? e.message : 'พิมพ์สติกเกอร์ไม่สำเร็จ'
  } finally {
    printing.value = false
  }
}
</script>

<template>
  <div class="mt-4">
    <div class="flex flex-wrap items-end gap-3">
      <label class="form-control w-full max-w-md text-left">
        <span class="mb-1 text-xs text-base-content/60">ค้นหา</span>
        <div class="input input-sm flex w-full items-center gap-2">
          <Icon icon="lucide:search" class="size-4 shrink-0 opacity-50" />
          <input v-model="searchText" type="search" class="grow"
            placeholder="เลขสินทรัพย์ / S/N / ชื่อรายการ / เลขที่ PO" />
          <span v-if="loading" class="loading loading-spinner loading-xs shrink-0" />
        </div>
      </label>
    </div>



    <div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-4">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
    </div>

    <div v-else-if="loading && !loadedOnce" class="py-10 text-center">
      <span class="loading loading-spinner"></span>
    </div>

    <div v-else-if="loadedOnce && !rows.length"
      class="mt-4 rounded-box border border-base-300 py-12 text-center">
      <Icon icon="lucide:check-check" class="mx-auto text-3xl text-base-content/30" />
      <p class="mt-2 text-sm text-base-content/60">
        {{ searchText.trim() ? 'ไม่มีรายการที่ตรงกับคำค้น' : 'ทุกเลขที่ออกไปพบใน SAP แล้ว' }}
      </p>
    </div>

    <div v-else class="relative mt-4 overflow-x-auto rounded-box border border-base-300"
      :class="loading ? 'opacity-50 transition-opacity' : ''">
      <table class="table table-sm" :class="loading ? 'pointer-events-none' : ''">
        <thead>
          <!-- ★ จำนวน th ต้องเท่ากับ td ของ tbody เสมอ -->
          <tr>
            <th>เลขที่กรอกไว้</th>
            <th>รายการ</th>
            <th>ใบคำขอ / PO</th>
            <th>ออกเลขเมื่อ</th>
            <th class="text-right">ดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.assetId">
            <td class="whitespace-nowrap">
              <div class="font-mono font-medium">{{ row.assetNumber ?? '-' }}</div>
              <div class="text-xs text-base-content/60">{{ row.companyCode }}</div>
            </td>
            <td class="max-w-[18rem]">
              <div class="truncate" :title="row.description ?? ''">{{ row.description ?? '-' }}</div>
              <div class="font-mono text-xs text-base-content/60">S/N {{ row.serialNumber ?? '-' }}</div>
            </td>
            <td class="whitespace-nowrap">
              <div class="font-mono">#{{ row.requestId }} · {{ row.poNumber }}</div>
              <div class="max-w-[14rem] truncate text-xs text-base-content/60">{{ row.vendorName ?? '-' }}</div>
            </td>
            <td class="whitespace-nowrap">
              <div>{{ formatDateTime(row.registeredAt) }}</div>
              <div class="text-xs text-base-content/60">
                {{ row.registeredByName ?? '-' }}
                <template v-if="daysPending(row) !== null">
                  ·
                  <span :class="daysPending(row)! >= 1 ? 'font-medium text-warning' : ''">
                    {{ daysPending(row) === 0 ? 'วันนี้' : `ค้าง ${daysPending(row)} วัน` }}
                  </span>
                </template>
              </div>
            </td>
            <td class="whitespace-nowrap text-right">
              <button v-if="row.requestClosed" type="button" class="btn btn-primary btn-xs"
                @click="openRenumber(row)">
                <Icon icon="lucide:pencil" class="size-3.5" />
                แก้เลข
              </button>
              <!-- ใบยังอยู่ในคิวออกเลข - แก้ที่หน้าออกเลขของใบ (มี lock กันคนแก้ชน) -->
              <button v-else type="button" class="btn btn-ghost btn-xs"
                title="ใบนี้ยังไม่แจ้งผลกลับผู้ขอ แก้เลขได้ที่หน้าออกเลขของใบ" @click="openRequest(row.requestId)">
                <Icon icon="lucide:external-link" class="size-3.5" />
                เปิดใบ
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      
    </div>
    <p class="mt-3 flex items-start gap-1.5 text-sm text-base-content/60">
      <Icon icon="lucide:info" class="mt-0.5 size-4 shrink-0" />
      <span>
        ชิ้นที่ออกเลขแล้ว แต่ sync ไม่เจอเลขนั้นใน SAP ชิ้นที่เพิ่งออกเลขจะอยู่ที่นี่จนกว่า sync
        รอบถัดไป ถ้าค้างนานแปลว่าเลขอาจพิมพ์ผิด
      </span>
    </p>
    <AppPagination v-if="total > limit" class="mt-4" :page="page" :total="total" :limit="limit"
      @update:page="(p: number) => (page = p)" />

    <!-- ── กล่องแก้เลข
         Teleport: ancestor ที่มี transform/overflow จะกิน position fixed ของ modal
         (เหตุผลเดียวกับ AppConfirmDialog) -->
    <Teleport to="body">
      <div v-if="target" class="modal modal-open backdrop-blur-sm" role="dialog" aria-modal="true">
        <div class="modal-box max-w-lg">
          <h3 class="flex items-center gap-2 text-lg font-semibold">
            <Icon icon="lucide:pencil-line" class="size-5" />
            แก้เลขสินทรัพย์
          </h3>

          <!-- ชิ้นที่กำลังแก้ - ต้องเห็นซ้ำในกล่องเพราะตารางข้างหลังถูก backdrop บังอยู่ -->
          <div class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-box bg-base-200 p-3 text-sm">
            <span class="opacity-60">บริษัท</span>
            <span class="font-mono">{{ target.companyCode }}</span>
            <span class="opacity-60">เลขเดิม</span>
            <span class="font-mono" :class="result ? 'line-through opacity-60' : ''">
              {{ target.assetNumber ?? '-' }}
            </span>
            <span class="opacity-60">รายการ</span>
            <span class="break-words">{{ target.description ?? '-' }}</span>
            <span class="opacity-60">S/N</span>
            <span class="font-mono">{{ target.serialNumber ?? '-' }}</span>
            <span class="opacity-60">ราคาทุน</span>
            <span class="tabular-nums">{{ formatMoney(target.acquisitionCost) }}</span>
            <span class="opacity-60">ใบคำขอ</span>
            <span class="font-mono">#{{ target.requestId }} · {{ target.poNumber }}</span>
          </div>

          <!-- ── ผลลัพธ์ -->
          <div v-if="result" class="mt-4 space-y-3">
            <div role="alert" class="alert alert-success alert-soft items-start">
              <Icon icon="lucide:circle-check" class="size-5 shrink-0" />
              <div class="text-sm">
                <p class="font-medium">
                  เปลี่ยนเป็น <span class="font-mono">{{ result.asset.assetNumber }}</span> แล้ว
                </p>
                <p v-if="result.adopted" class="mt-1 opacity-80">
                  รวมกับรายการที่ sync ดึงมาจาก SAP เป็นรายการเดียวแล้ว ข้อมูลบัญชีแสดงได้ทันที
                </p>
                <p v-else class="mt-1 opacity-80">
                  ถ้าเลขนี้มีใน SAP sync รอบถัดไปจะจับคู่ให้เอง แล้วชิ้นนี้จะหายจากรายการนี้
                </p>
              </div>
            </div>
            <div role="alert" class="alert alert-warning alert-soft items-start">
              <Icon icon="mdi:qrcode-remove" class="size-5 shrink-0" />
              <span class="text-sm">
                QR เปลี่ยนตามเลขใหม่แล้ว สติกเกอร์เดิมสแกนแล้วจะขึ้นว่าไม่พบ ต้องพิมพ์ใหม่ไปติดแทน
              </span>
            </div>
            <p v-if="printError" class="text-sm text-error">{{ printError }}</p>
          </div>

          <!-- ── กรอกเลขใหม่ -->
          <template v-else>
            <fieldset class="fieldset mt-4">
              <legend class="fieldset-legend">เลขที่ถูกต้อง (ตามที่ออกใน SAP)</legend>
              <AssetNumberInput v-model="newNumber" :disabled="saving" @enter="onSave" />
              <p class="label whitespace-normal">
                เลขใหม่ใช้แทนเลขเดิมทันที QR เปลี่ยนตาม และไม่มีการแจ้งผู้ขอ
              </p>
            </fieldset>

            <!-- เลขนี้ sync ดึงมาจาก SAP ไปแล้ว - โครงเดียวกับกล่องในหน้าออกเลข -->
            <div v-if="sapMatch" role="alert" class="alert alert-soft mt-3 items-start"
              :class="sapMatch.adoptable ? 'alert-warning' : 'alert-error'">
              <Icon :icon="sapMatch.adoptable ? 'mdi:link-variant' : 'mdi:link-variant-off'"
                class="size-5 shrink-0" />
              <div class="min-w-0 space-y-2">
                <div class="text-sm font-medium">
                  เลข <span class="font-mono">{{ sapMatch.assetNumber }}</span> มีอยู่แล้วจากการ sync ของ SAP
                </div>
                <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                  <span class="opacity-60">ชื่อใน SAP</span>
                  <span class="break-words">{{ sapMatch.description || '-' }}</span>
                  <span class="opacity-60">SAP สร้างเลขเมื่อ</span>
                  <span>{{ sapMatch.sapCreatedDate ? formatDate(sapMatch.sapCreatedDate) : '-' }}</span>
                  <span class="opacity-60">ราคาทุนใน SAP</span>
                  <span class="tabular-nums">
                    {{ sapMatch.sapCost === null ? '-' : formatMoney(sapMatch.sapCost) }}
                    <span class="opacity-60">· ชิ้นนี้ {{ formatMoney(target.acquisitionCost) }}</span>
                  </span>
                  <span class="opacity-60">สถานะใน SAP</span>
                  <span>{{ sapMatch.status }}</span>
                </div>
                <p v-if="sapMatch.warning" class="flex items-start gap-1.5 text-sm font-medium">
                  <Icon icon="mdi:alert-outline" class="mt-0.5 size-4 shrink-0" />
                  <span>{{ sapMatch.warning }}</span>
                </p>
                <p class="text-sm break-words opacity-80">
                  <template v-if="sapMatch.adoptable">
                    ถ้าเป็นชิ้นเดียวกัน กด "ผูกกับรายการนี้" ระบบจะรวมเป็นรายการเดียว ถ้าไม่ใช่ ให้แก้เลขแล้วกดใหม่
                  </template>
                  <template v-else>{{ sapMatch.blockedReason }}</template>
                </p>
              </div>
            </div>

            <div v-if="saveError" role="alert" class="alert alert-error alert-soft mt-3">
              <Icon icon="lucide:circle-alert" class="size-5 shrink-0" />
              <span class="text-sm">{{ saveError }}</span>
            </div>
          </template>

          <div class="modal-action">
            <template v-if="result">
              <button type="button" class="btn btn-ghost" @click="closeRenumber">ปิด</button>
              <button type="button" class="btn btn-primary" :disabled="printing" @click="printLabel">
                <span v-if="printing" class="loading loading-spinner loading-xs" />
                <Icon v-else icon="lucide:printer" class="size-4" />
                พิมพ์สติกเกอร์ใหม่
              </button>
            </template>
            <template v-else>
              <button type="button" class="btn btn-ghost" :disabled="saving" @click="closeRenumber">
                ยกเลิก
              </button>
              <!-- ผูกกับแถวจาก SAP ใช้ปุ่มเดิม แค่เปลี่ยนข้อความ/สีเป็นสีเตือน - กดแล้วคือการรวมสองรายการ -->
              <button type="button" class="btn" :class="adopting ? 'btn-warning' : 'btn-primary'"
                :disabled="!canSave" @click="onSave">
                <span v-if="saving" class="loading loading-spinner loading-xs" />
                <Icon v-else :icon="adopting ? 'mdi:link-variant' : 'lucide:check'" class="size-4" />
                {{ adopting ? 'ผูกกับรายการนี้' : 'บันทึกเลขใหม่' }}
              </button>
            </template>
          </div>
        </div>
        <div class="modal-backdrop" @click="closeRenumber"></div>
      </div>
    </Teleport>
  </div>
</template>
