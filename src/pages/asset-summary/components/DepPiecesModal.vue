<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════════════════
// โมดัล "รายชิ้นค่าเสื่อมของบัญชีนี้" — เปิดจากปุ่มบนแถวของ DEP-สรุป
//
// ── ★★ ทำไมเป็นคนละตัวกับ AssetPiecesModal
//
// ไฟล์ของ finance มีสี่ชีต ไม่ใช่สองชีต:
//
//   Asset-สรุป    แถวละชั้นบัญชี      →  Asset-ละเอียด  แตกรายชิ้น **คอลัมน์ชุดเดียวกับชีตแม่**
//   DEP-สรุป      แถวละชั้นบัญชี      →  DEP-ละเอียด    แตกรายชิ้น **คอลัมน์คนละชุด แค่ 3 ช่อง**
//
// DEP-ละเอียด มีแค่ Asset No. / Asset Description / Ordinary Depreciation — ไม่มีคอลัมน์
// ยอดคงเหลือเลย เพราะคนที่กดจากแถว DEP กำลังถามว่า "ใบสำคัญค่าเสื่อมใบนี้มาจากชิ้นไหนบ้าง"
// ไม่ได้ถามเรื่องราคาทุน/NBV — เอา AssetPiecesModal มาใช้ซ้ำจึงตอบผิดคำถาม
//
// ── ★ Special Depreciation ไม่มีในนี้
//
// ชีตมีคอลัมน์นี้และเป็น 0 ทั้ง 1,041 แถว ส่วน asset_accounting_period ไม่ได้เก็บเลย
// (connector วัดแล้วเป็น 0 ทั้ง 24,876 แถวของ UBA ปี 2026 จึงไม่สร้างคอลัมน์)
// ★ ตัดทิ้งดีกว่าโชว์ 0 ตายตัว — 0 ที่ฮาร์ดโค้ดคือคำสัญญาที่ระบบไม่ได้เก็บให้ วันที่ SAP
//   มีค่าจริงหน้าจอจะโกหกโดยไม่มีอะไรฟ้อง (connector มีด่านเตือนอยู่แล้ว ถ้าดังเมื่อไหร่
//   ต้องเพิ่มคอลัมน์ที่ตารางก่อน แล้วค่อยกลับมาเพิ่มที่นี่)
// ═══════════════════════════════════════════════════════════════════════════
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import { ApiError } from '@/shared/services/httpClient'
import { formatMoney } from '@/shared/utils/money'
import { labelOf } from '../asset-summary.helpers'
import {
  getDepSummaryPieces,
  type DepSummaryPiecesReport,
} from '@/shared/services/dashboard.service'

/** แถวที่กดมา — รับแค่รูปร่างที่ใช้จริง ไม่ผูกกับ DepSummaryRow ทั้งก้อน */
type OpenableRow = { assetClass: string | null; accountName: string | null }

/**
 * ขอบเขตที่หน้าแม่เลือกอยู่
 *
 * ★ ส่ง fromPeriod ไปด้วยแม้ชีตนี้ใช้แค่ toPeriod — backend ใช้ resolveReportScope ตัวเดียว
 *   กับรายงาน ซึ่งหนีบ fromPeriod ให้ไม่เกิน toPeriod ถ้าไม่ส่งไปมันจะตั้งค่าเริ่มต้นให้เอง
 *   แล้วอาจได้คนละงวดกับที่หน้าจอโชว์อยู่
 */
const props = defineProps<{
  companyCode: string
  fiscalYear: number | null
  fromPeriod: number | null
  toPeriod: number | null
}>()

/** ★ ต้องตรงกับ PIECES_PAGE_SIZE ฝั่ง backend */
const PIECES_PAGE_SIZE = 15

const dialog = ref<HTMLDialogElement | null>(null)
const data = ref<DepSummaryPiecesReport | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const page = ref(1)

const openedClass = ref<string | null>(null)
const openedLabel = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    data.value = await getDepSummaryPieces({
      assetClass: openedClass.value ?? undefined,
      companyCode: props.companyCode || undefined,
      fiscalYear: props.fiscalYear ?? undefined,
      fromPeriod: props.fromPeriod ?? undefined,
      toPeriod: props.toPeriod ?? undefined,
      page: page.value,
      limit: PIECES_PAGE_SIZE,
    })
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'โหลดรายชิ้นไม่สำเร็จ'
    data.value = null
  } finally {
    loading.value = false
  }
}

/** หน้าแม่เรียกผ่าน template ref — เปิดโมดัลเป็นเหตุการณ์ ไม่ใช่สถานะที่ต้องคอยซิงก์ */
function open(row: OpenableRow) {
  openedClass.value = row.assetClass
  const label = labelOf(row)
  openedLabel.value = [label.code, label.name].filter(Boolean).join(' · ') || 'ยังไม่ระบุชั้นบัญชี'
  page.value = 1
  data.value = null
  errorMsg.value = ''
  dialog.value?.showModal()
  void load()
}

defineExpose({ open })

function goPage(next: number) {
  page.value = next
  void load()
}
</script>

<template>
  <dialog ref="dialog" class="modal duration-150">
    <div class="modal-box max-h-[calc(100dvh-4rem)] max-w-3xl duration-150">
      <form method="dialog">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" aria-label="ปิด">
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </form>

      <h3 class="pr-10 text-base font-semibold">{{ openedLabel }}</h3>

      <!-- ★ ต้องบอกงวดเสมอ — ชีต DEP เป็นภาพของ "งวดเดียว" ไม่ใช่ช่วงงวดแบบชีต Asset
           ถ้าไม่เขียนไว้ คนจะอ่านยอดนี้เป็นค่าเสื่อมสะสมทั้งช่วงที่เลือกบนหน้ารายงาน -->
      <p v-if="data" class="mt-1 text-xs text-base-content/60">
        ค่าเสื่อมของ<strong>งวด {{ data.period }}</strong> ปีบัญชี {{ data.fiscalYear }} ·
        {{ data.total.toLocaleString('th-TH') }} ชิ้น
        <span v-if="data.totals?.journalEntry">
          · ใบสำคัญ {{ data.totals.journalEntry }}
        </span>
        <!-- ★ ปกติ = 1 ใบ ถ้าไม่ใช่แปลว่ามีใบกลับรายการหรือ SAP เปลี่ยนวิธีโพสต์ ต้องเตือน
             ไม่ใช่หยิบใบแรกมาแสดงเงียบ ๆ -->
        <span
          v-if="data.totals && data.totals.journalEntryCount > 1"
          class="badge badge-warning badge-xs ml-1"
        >
          +{{ data.totals.journalEntryCount - 1 }} ใบ
        </span>
      </p>

      <div v-if="errorMsg" role="alert" class="alert alert-error alert-soft mt-4">
        <Icon icon="lucide:circle-alert" class="size-5 shrink-0" />
        <span>{{ errorMsg }}</span>
      </div>

      <div v-else-if="loading && !data" class="flex justify-center py-12">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>

      <div v-else-if="data" class="mt-4">
        <div class="overflow-x-auto" :class="loading ? 'opacity-50' : ''">
          <!-- ★ ตรึงคอลัมน์แรกเหมือนตารางอื่นในหน้านี้ — ต้องติดป้าย freeze-col ที่เซลล์เอง
               ทั้ง th/td/tfoot (CSS ไม่ได้อิง :first-child ดูเหตุผลที่ main.css) -->
          <table class="table table-sm table-pin-rows table-freeze-first table-freeze-always">
            <thead>
              <tr>
                <th scope="col" class="freeze-col">Asset no.</th>
                <th scope="col">Description</th>
                <th scope="col" class="text-right">Ordinary Depreciation</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.rows" :key="row.assetId" class="hover:bg-base-200">
                <td class="freeze-col whitespace-nowrap font-medium tabular-nums">
                  {{ row.assetNumber ?? '-' }}
                  <!-- ใบกลับรายการปกติว่าง — โผล่เมื่อไหร่คือสัญญาณที่ต้องเห็น ไม่ใช่ซ่อน -->
                  <span
                    v-if="row.cancellationJournalEntry"
                    class="badge badge-warning badge-xs ml-1"
                    :title="`ใบกลับรายการ ${row.cancellationJournalEntry}`"
                  >
                    กลับรายการ
                  </span>
                </td>
                <td class="max-w-sm truncate" :title="row.description ?? ''">
                  {{ row.description ?? '-' }}
                </td>
                <td class="text-right font-medium tabular-nums">
                  {{ formatMoney(row.ordinaryDepreciation) }}
                </td>
              </tr>

              <tr v-if="!data.rows.length">
                <td colspan="3" class="py-10 text-center text-base-content/70">
                  งวดนี้ไม่มีค่าเสื่อมที่ลงบัญชีในชั้นบัญชีนี้
                </td>
              </tr>
            </tbody>
            <tfoot v-if="data.total">
              <tr class="border-t-2 border-base-300 bg-base-200">
                <th class="freeze-col bg-base-200 text-sm">
                  Total
                  <span class="ml-1 text-xs font-normal text-base-content/60">
                    {{ data.total.toLocaleString('th-TH') }} ชิ้น
                  </span>
                </th>
                <td></td>
                <!-- ★ มาจากแถว DEP-สรุป ที่กดมา ไม่ได้บวกจากแถวในหน้านี้ — หน้าหนึ่งมี 20 แถว
                     แต่บัญชีใหญ่สุดของงวดมีหลายร้อยชิ้น -->
                <td class="text-right text-base font-bold tabular-nums">
                  {{ formatMoney(data.totals?.ordinaryDepreciation ?? null) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="flex w-full min-w-0 justify-center">
          <AppPagination
            class="mt-2"
            :page="page"
            :total="data.total"
            :limit="data.limit"
            @update:page="goPage"
          />
        </div>
      </div>
    </div>

    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
</template>
