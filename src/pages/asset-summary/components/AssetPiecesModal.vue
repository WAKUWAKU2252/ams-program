<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════════════════
// โมดัล "รายชิ้นในชั้นบัญชีนี้" — เปิดจากปุ่มบนแถวของ Asset-สรุป
//
// ★★ ยิง /dashboard/asset-summary/assets ไม่ใช่ /assets/inventory
//
// เส้น inventory ไม่มีราคาทุน/ค่าเสื่อมสะสมรายชิ้นให้เลย และ NBV ของมันเป็นยอด ณ งวด
// ล่าสุดที่บัญชีปิด ไม่ใช่ toPeriod ที่ผู้ใช้เลือกอยู่ — เอามาใช้แล้วผลรวมจะไม่เท่ากับแถว
// ที่เพิ่งกดมา ซึ่งเป็นสิ่งเดียวที่โมดัลนี้ต้องทำให้ได้ (backend คิดด้วยนิพจน์ชุดเดียวกับ
// ที่วาดแถวสรุป ดู assetValueExprs)
//
// ★ component นี้ถือ state ของตัวเอง (ต่างจากตารางสองใบ) เพราะมันมีวงจรชีวิตของตัวเอง
//   ทั้งการโหลด การแบ่งหน้า และ error — ไม่มีอะไรในนั้นที่หน้าแม่ต้องรู้ด้วย
//   หน้าแม่แค่เรียก open(row) แล้วส่ง "ขอบเขตงวด" ลงมาเป็น props
// ═══════════════════════════════════════════════════════════════════════════
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import { ApiError } from '@/shared/services/httpClient'
import { formatMonths } from '@/shared/utils/money'
import { cellText, labelOf, type AssetColumn } from '../asset-summary.helpers'
import {
  getAssetSummaryPieces,
  type AssetSummaryPiecesReport,
} from '@/shared/services/dashboard.service'

/**
 * แถวที่กดมา — รับแค่รูปร่างที่ใช้จริง ไม่ผูกกับ AssetSummaryRow
 *
 * ★ เปิดได้จากทั้งสองชีต: Asset-สรุป (AssetSummaryRow) และ DEP-สรุป (DepSummaryRow)
 *   สองชนิดนั้นมีช่องอื่นไม่เหมือนกันเลย แต่ตรงกันสองช่องนี้ ซึ่งเป็นทั้งหมดที่โมดัลใช้
 *   (assetClass ไปเป็นตัวกรองของ API · accountName ไปขึ้นหัวกล่อง)
 */
type OpenableRow = { assetClass: string | null; accountName: string | null }

/**
 * ขอบเขตที่หน้าแม่เลือกอยู่ — ต้องส่งครบทุกช่อง
 *
 * ★ ขาดช่องไหน backend จะหนีบงวดให้ใหม่ แล้วยอดในโมดัลจะเป็นของคนละงวดกับแถวที่ผู้ใช้
 *   เพิ่งกด โดยไม่มีอะไรบอกว่าต่างกัน
 */
const props = defineProps<{
  companyCode: string
  fiscalYear: number | null
  fromPeriod: number | null
  toPeriod: number | null
  /**
   * คอลัมน์ชุดเดียวกับที่ "ตารางแม่เปิดอยู่" — ส่ง shownColumns ลงมาตรง ๆ
   *
   * ★ ไม่ได้มีลิสต์คอลัมน์ของตัวเองโดยตั้งใจ: คนกดดูรายชิ้นคือคนที่กำลังกระทบยอดคอลัมน์
   *   ใดคอลัมน์หนึ่งบนตารางแม่อยู่พอดี ถ้าโมดัลโชว์คนละชุด เขาต้องไปหาเองว่าช่องที่สนใจ
   *   อยู่ตรงไหน — และตัวเลขที่เทียบกันก็จะเป็นคนละคอลัมน์
   * ★ ผลรวมท้ายตารางมาจาก totals ซึ่งเป็นแถวสรุปทั้งแถว จึงหยิบด้วยคีย์เดียวกันได้ครบ
   */
  columns: readonly AssetColumn[]
}>()

/** ★ ต้องตรงกับ PIECES_PAGE_SIZE ฝั่ง backend — ส่ง limit ไปเองทุกครั้งอยู่แล้ว แต่ถ้า
 *  สองฝั่งไม่ตรง เลขหน้าที่หน้าจอคำนวณจะเพี้ยนจากที่ server แบ่งจริง */
const PIECES_PAGE_SIZE = 15

const piecesDialog = ref<HTMLDialogElement | null>(null)
const pieces = ref<AssetSummaryPiecesReport | null>(null)
const piecesLoading = ref(false)
const piecesError = ref('')
const piecesPage = ref(1)

/**
 * ชั้นบัญชีที่กำลังเปิดอยู่ — null คือค่าที่ถูกต้อง (กลุ่ม "ยังไม่ระบุชั้นบัญชี")
 * ★ ห้ามใช้ค่านี้เป็นตัวบอกว่าโมดัลเปิดอยู่ไหม
 */
const openedClass = ref<string | null>(null)
const openedLabel = ref('')

async function loadPieces() {
  piecesLoading.value = true
  piecesError.value = ''
  try {
    pieces.value = await getAssetSummaryPieces({
      assetClass: openedClass.value ?? undefined,
      companyCode: props.companyCode || undefined,
      fiscalYear: props.fiscalYear ?? undefined,
      fromPeriod: props.fromPeriod ?? undefined,
      toPeriod: props.toPeriod ?? undefined,
      page: piecesPage.value,
      limit: PIECES_PAGE_SIZE,
    })
  } catch (e) {
    piecesError.value = e instanceof ApiError ? e.message : 'โหลดรายชิ้นไม่สำเร็จ'
    pieces.value = null
  } finally {
    piecesLoading.value = false
  }
}

/**
 * หน้าแม่เรียกตัวนี้ผ่าน template ref
 *
 * ★ ใช้ expose แทนการผูก v-model:open + props assetClass — เปิดโมดัลเป็น "เหตุการณ์"
 *   ไม่ใช่สถานะ ผูกเป็น props แล้วต้องคอยซิงก์กลับตอนผู้ใช้กด Esc ปิดเอง
 */
function open(row: OpenableRow) {
  openedClass.value = row.assetClass
  const label = labelOf(row)
  openedLabel.value = [label.code, label.name].filter(Boolean).join(' · ') || 'ยังไม่ระบุชั้นบัญชี'
  piecesPage.value = 1
  pieces.value = null
  piecesError.value = ''
  piecesDialog.value?.showModal()
  void loadPieces()
}

defineExpose({ open })

// ★ เปลี่ยนหน้าแล้วยิงใหม่ ไม่ได้ดึงมาทั้งชั้นบัญชีแล้วหั่นเอง — ชั้นที่ใหญ่สุดของ UBA
//   มี 667 ชิ้น (วัด 2026-09-17) ลากมาทั้งก้อนเพื่อโชว์ 20 แถวไม่คุ้ม
function goPiecesPage(next: number) {
  piecesPage.value = next
  void loadPieces()
}
</script>
<template>
  <!-- ── รายชิ้นในชั้นบัญชีเดียว ──────────────────────────────────────────
       เปิดจากปุ่ม detail บนแถวของ Asset-สรุป

       ★ แถวรวมท้ายตารางมาจาก totals ที่ backend ส่งมา **ไม่ได้บวกจากแถวในหน้านี้** —
         หน้าหนึ่งมี 20 แถว แต่บัญชีใหญ่สุดมี 667 ชิ้น ถ้าบวกจากหน้าที่เปิดอยู่
         ยอดรวมจะเปลี่ยนไปเรื่อย ๆ ตามหน้าที่กด และไม่มีทางเท่าแถวสรุป -->
  <!-- duration-150 ต้องติดทั้ง .modal และ .modal-box — daisyUI ตั้ง transition แยกกัน
       สองชั้น (ฉากหลังกับตัวกล่อง) ใส่ที่เดียวอีกชั้นจะยังเป็น 0.3s ตามเดิม
       วัดจริง 2026-09-17: default = translate/scale 0.3s + opacity 0.2s (หน่วง 0.05s)
       = เห็นกล่องไถขึ้นมาราว 350ms ทุกครั้งที่กด ซึ่งช้าเกินไปสำหรับของที่เปิด-ปิดถี่
       ★ ไม่ได้ไปแก้ค่า default ของ daisyUI — โมดัลอื่นทั้งระบบยังเป็น 0.3s เท่าเดิม -->
  <dialog ref="piecesDialog" class="modal duration-150">
    <!-- max-h ต้องระบุเอง — daisyUI build นี้ตั้ง .modal-box ไว้ที่ max-height: 100dvh
         และ .modal ไม่มี padding พอตารางยาวกล่องจึงสูงเท่าจอพอดี ชนขอบบน-ล่างของเบราว์เซอร์
         (วัดจริง 2026-09-17: top=0 bottom=0 ที่ viewport 820px)
         ★ ใช้ calc(100dvh-4rem) ให้ตรงกับ AssetDetailModal/AssetImageDialog ที่ตั้งไว้แล้ว
           — อย่าตั้งค่าใหม่เป็นตัวที่สาม · dvh ไม่ใช่ vh เพราะแถบ address bar ของมือถือ
           ยุบ/ขยายระหว่างเลื่อน ซึ่ง vh ไม่รู้เรื่องด้วย -->
    <!-- max-w-7xl ไม่ใช่ 5xl — ตอนเปิดคอลัมน์ครบชุดตารางนี้กว้าง 19 คอลัมน์ (3 ช่องระบุตัว
             + คอลัมน์ของตารางแม่สูงสุด 15 + อายุคงเหลือ) กล่องแคบทำให้ต้องเลื่อนแนวนอนตั้งแต่
             เปิดครบไม่กี่คอลัมน์ · ตารางยังอยู่ใน overflow-x-auto อยู่แล้วจึงไม่ล้นออกนอกกล่อง -->
        <div class="modal-box max-h-[calc(100dvh-4rem)] max-w-7xl duration-150">
      <form method="dialog">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" aria-label="ปิด">
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </form>

      <h3 class="pr-10 text-base font-semibold">{{ openedLabel }}</h3>
      <!-- ★ ติดป้ายงวด/ปีไว้เสมอ — ยอดในตารางนี้เป็นของ "ณ สิ้นงวด toPeriod" ไม่ใช่วันนี้
           ถ้าไม่บอก คนจะอ่านเลขปี 2569 งวด 5 เป็นมูลค่าปัจจุบัน -->
      <p v-if="pieces" class="mt-1 text-xs text-base-content/60">
        ปีบัญชี {{ pieces.fiscalYear }} · ยอด ณ สิ้นงวด {{ pieces.toPeriod }} ·
        {{ pieces.total.toLocaleString('th-TH') }} ชิ้น
        <span v-if="pieces.totals.assetsWithoutValue" class="text-warning">
          ({{ pieces.totals.assetsWithoutValue }} ชิ้นยังไม่มีตัวเลขบัญชี)
        </span>
        <!-- แยกจากป้ายข้างบน - "ยังไม่ได้ซื้อ ณ งวดนี้" ไม่ใช่ข้อมูลขาด ดูงวดถัดไปก็มีค่า -->
        <span v-if="pieces.totals.assetsNotYetAcquired" class="text-warning">
          ({{ pieces.totals.assetsNotYetAcquired }} ชิ้นยังไม่ได้ซื้อ ณ งวดนี้)
        </span>
      </p>

      <div v-if="piecesError" role="alert" class="alert alert-error alert-soft mt-4">
        <Icon icon="lucide:circle-alert" class="size-5 shrink-0" />
        <span>{{ piecesError }}</span>
      </div>

      <div v-else-if="piecesLoading && !pieces" class="flex justify-center py-12">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>

      <div v-else-if="pieces" class="mt-4">
        <div class="overflow-x-auto" :class="piecesLoading ? 'opacity-50' : ''">
          <!-- ★ table-freeze-always ไม่ใช่ table-freeze-first เฉย ๆ — ตัวหลังตรึงเฉพาะจอ
               แคบ (<1024px) แต่ตารางนี้กว้างจนต้องเลื่อนแนวนอนบน desktop อยู่แล้วเมื่อเปิด
               คอลัมน์ครบ (เหตุผลเดียวกับตาราง Asset summary ที่ติดป้ายคู่นี้ไว้)
               ★ ต้องติดป้าย freeze-col ที่ "เซลล์" ของคอลัมน์แรกทุกแถวเอง ทั้ง th/td/tfoot —
                 CSS ไม่ได้อิง :first-child (ดูเหตุผลที่ main.css) -->
          <table class="table table-sm table-pin-rows table-freeze-first table-freeze-always">
            <thead>
              <tr>
                <th scope="col" class="freeze-col">Asset no.</th>
                <th scope="col">Description</th>
                <th scope="col" class="text-center">Status</th>
                <th v-for="col in columns" :key="col.key" scope="col" :class="col.align">
                  {{ col.label }}
                </th>
                <th scope="col" class="text-right">อายุคงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="piece in pieces.rows" :key="piece.assetId" class="hover:bg-base-200">
                <td class="freeze-col whitespace-nowrap font-medium tabular-nums">
                  {{ piece.assetNumber ?? '-' }}
                </td>
                <td class="max-w-xs truncate" :title="piece.description ?? ''">
                  {{ piece.description ?? '-' }}
                </td>
                <td class="text-center">
                  <span class="badge badge-sm"
                    :class="piece.status === 'Active' ? 'badge-success badge-soft' : 'badge-ghost'">
                    {{ piece.status }}
                  </span>
                </td>
                <!-- ★ cellText คืน '-' ให้ null เอง ห้ามเขียน ?? 0 ทับ —
                     null = SAP ยังไม่ให้ตัวเลขมา คนละเรื่องกับตัดค่าเสื่อมครบแล้วซึ่งเป็น 0 จริง
                     ★ ใช้ cellText ตัวเดียวกับตารางแม่ เพื่อให้รูปแบบตัวเลขตรงกันทุกช่อง -->
                <td
                  v-for="col in columns"
                  :key="col.key"
                  class="tabular-nums"
                  :class="[col.align, col.strong ? 'font-medium' : '']"
                >
                  {{ cellText(piece, col) }}
                </td>
                <td class="whitespace-nowrap text-right">
                  {{ formatMonths(piece.remainingLifeMonths) }}
                </td>
              </tr>

              <tr v-if="!pieces.rows.length">
                <td :colspan="columns.length + 4" class="py-10 text-center text-base-content/70">
                  ไม่มีชิ้นในชั้นบัญชีนี้
                </td>
              </tr>
            </tbody>
            <tfoot v-if="pieces.total">
              <tr class="border-t-2 border-base-300 bg-base-200">
                <!-- ★ เดิมเป็น th เดียว colspan=3 — ตรึงแบบนั้นไม่ได้ เซลล์ที่ sticky จะกว้าง
                     คลุมสามคอลัมน์แล้วทับ Description/Status ตอนเลื่อน จึงแยกเป็นช่องแรก
                     ช่องเดียว (ตรึง) + สองช่องว่างที่เลื่อนไปตามปกติ
                     ★ bg-base-200 ต้องทึบ ห้ามใช้สีโปร่ง — เซลล์ที่ตรึงรับสีจาก tr ผ่าน
                     background: inherit ถ้าโปร่งตัวเลขที่เลื่อนอยู่ข้างใต้จะทะลุขึ้นมาซ้อน -->
                <th class="freeze-col bg-base-200 text-sm">
                  Total
                  <span class="ml-1 text-xs font-normal text-base-content/60">
                    {{ pieces.totals.assets.toLocaleString('th-TH') }} ชิ้น
                  </span>
                </th>
                <td></td>
                <td></td>
                <!-- ★ หยิบจาก totals ด้วยคีย์เดียวกับหัวคอลัมน์ — totals เป็นแถวสรุปทั้งแถว
                     ที่ backend ส่งมา ไม่ได้บวกจากแถวในหน้านี้ -->
                <td
                  v-for="col in columns"
                  :key="col.key"
                  class="tabular-nums"
                  :class="[col.align, col.strong ? 'font-semibold' : 'text-base-content/70']"
                >
                  {{ cellText(pieces.totals, col) }}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="flex w-full min-w-0 justify-center">
          <AppPagination
            class="mt-2"
            :page="piecesPage"
            :total="pieces.total"
            :limit="pieces.limit"
            @update:page="goPiecesPage"
          />
        </div>
      </div>
    </div>

    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
</template>
