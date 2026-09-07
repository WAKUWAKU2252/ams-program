<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { fileBlobUrl } from '@/services/attachment.service';
import HeadtableCreateNewAsset from '@/components/common/PolineTable/HeadtableCreateNewAsset.vue';
import AppConfirmDialog from '@/components/common/AppConfirmDialog.vue';
import {
  getAssetSlots,
  type AssetSlot,
  type AssetSlotItem,
  type InvoiceFile,
  type SlotDisplayStatus,
} from '@/services/asset.service';
import {
  declareLine,
  removeDeclaredLine,
  type AssetRequestStatus,
} from '@/services/assetRequest.service';
import InvoiceModal from '@/components/common/InvoiceModal.vue';
import AppAssetFormDialog from '@/components/common/AppAssetFormDialog.vue';
import type { AssetFormTarget } from '@/types/asset-form';
import type { RejectedPiece } from '@/types/rejected-piece';
import {
  listDepartments,
  listLocations,
  listSubLocations,
  type DepartmentOption,
  type MasterOption,
  type SubLocationOption,
} from '@/services/master.service';
import { ApiError } from '@/services/httpClient';
import { formatDate } from '@/utils/date';
import { rejectRoleLabel } from '@/utils/reject-role';
import { Icon } from '@iconify/vue';

const props = withDefaults(
  defineProps<{
    requestId: number;
    editable?: boolean;
    /**
     * ขอบเขตที่แก้ได้
     *   all      = ใบยังเป็น DRAFT/REJECTED แก้ได้ทุกอย่างตามปกติ
     *   rejected = ใบอนุมัติแล้ว เปิดให้แก้เฉพาะ "ชิ้นที่บัญชีตีกลับ" เท่านั้น
     *              ชิ้นอื่นผ่านการอนุมัติของหัวหน้าไปแล้ว ห้ามแก้ย้อนหลัง และงานระดับรอบ
     *              (invoice / แจ้งจำนวน) ก็ห้ามด้วย เพราะมันกระทบทั้งรอบ ไม่ใช่แค่ชิ้นที่ตีกลับ
     */
    editableScope?: 'all' | 'rejected';
  }>(),
  {
    editable: true,
    editableScope: 'all',
  },
);

/** งานระดับรอบ/ใบ (invoice, แจ้งจำนวน, ลบชิ้น) — ทำได้เฉพาะตอนแก้ได้ทั้งใบ */
const canEditRound = computed(() => props.editable && props.editableScope === 'all');

const emit = defineEmits<{
  (e: 'over-cost', value: boolean): void;
  /** ชิ้นที่ยังรอผู้ขอแก้ — DraftForm เอาไปขึ้น banner ว่าต้องแก้ชิ้นไหนบ้าง */
  (e: 'rejected-pieces', value: RejectedPiece[]): void;
}>();

const items = ref<AssetSlotItem[]>([]);
// สถานะของ "ใบคำขอ" ไม่ใช่ของชิ้น — ตัวตัดสินว่า badge รายชิ้นเป็น Saved / Requested / Rejected
const requestStatus = ref<AssetRequestStatus>('DRAFT');
// เหตุผลที่ถูกตีกลับ (มีเฉพาะตอน REJECTED) — ป้าย Rejected บอกแค่ว่า "ไม่ผ่าน"
// ผู้ใช้ต้องได้เหตุผลในจอเดียวกันถึงจะรู้ว่าต้องแก้อะไรก่อนกดส่งใหม่
const rejectReason = ref<string | null>(null);
const loading = ref(true);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await getAssetSlots(props.requestId);
    items.value = res.items;
    requestStatus.value = res.status;
    rejectReason.value = res.rejectReason;
    void loadThumbnails();
  } catch (e) {
    console.error('โหลดรายการ asset ไม่สำเร็จ:', e);
    loadError.value = 'โหลดรายการไม่สำเร็จ';
  } finally {
    loading.value = false;
  }
}

// ── รูปย่อในตาราง ────────────────────────────────────────────────────────────
//
// GET /uploads/:id/file อยู่หลัง authGuard ใส่ URL ตรง ๆ ใน <img src> จะได้ 401
// (browser ไม่แนบ Authorization header ให้) จึงต้องโหลดเป็น blob เองแล้วค่อยผูกเข้า src
//
// cache ตาม imageId: บันทึกทีนึงตารางโหลดใหม่ทั้งหน้า ถ้าไม่ cache จะดาวน์โหลดรูปเดิมซ้ำทุกรอบ
const thumbUrls = ref(new Map<string, string>());

/**
 * โหลดเฉพาะรูปของแถวที่ "เรนเดอร์อยู่จริง" ไม่ใช่ทุกใบในใบคำขอ
 *
 * ตารางกางเป็นชั้น: PO line ต้องกดกางก่อน (expandedIds เริ่มว่าง = ปิดหมด) แล้วในนั้น
 * ยังมีรอบรับของที่พับได้อีกชั้น — ช่องจะถูกเรนเดอร์ต่อเมื่อกางทั้งสองชั้น
 *
 * ถ้าโหลดทุกใบตั้งแต่เปิดหน้า จะดาวน์โหลดรูปที่ไม่มีใครเห็นทั้งหมด และ endpoint
 * ส่งไฟล์เต็ม (ไม่มี thumbnail ฝั่ง server) ใบที่มี 50 ชิ้นจึงกินแบนด์วิดท์เป็นร้อย MB เปล่า ๆ
 */
function visibleImageIds(): Set<string> {
  const ids = new Set<string>();
  for (const item of items.value) {
    if (!isExpanded(item.poItemId)) continue;
    for (const round of item.grpoLines) {
      if (!isRoundOpen(round.id)) continue;
      for (const slot of item.slots) {
        if (slot.status === 'registered' && slot.grpoLineId === round.id && slot.imageId) {
          ids.add(slot.imageId);
        }
      }
    }
  }
  return ids;
}

/** id ที่ยังมีอยู่ในข้อมูล — ใช้ตัดสินว่า blob ไหนควรเก็บไว้ (คนละชุดกับที่ต้องโหลด) */
function referencedImageIds(): Set<string> {
  const ids = new Set<string>();
  for (const item of items.value) {
    for (const slot of item.slots) {
      if (slot.status === 'registered' && slot.imageId) ids.add(slot.imageId);
    }
  }
  return ids;
}

async function loadThumbnails() {
  // พับแถวกลับไม่ทิ้ง blob — ไม่งั้นกางซ้ำทีก็โหลดใหม่ทุกที
  // ทิ้งเฉพาะรูปที่หายไปจากข้อมูลจริง (ถูกถอดออกจาก asset) ไม่งั้นค้างใน memory ทั้ง session
  const keep = referencedImageIds();
  for (const [id, url] of thumbUrls.value) {
    if (!keep.has(id)) {
      URL.revokeObjectURL(url);
      thumbUrls.value.delete(id);
    }
  }

  // โหลดพร้อมกัน — เรียงกันจะรอทีละรูป รอบที่กางอยู่มีได้หลายชิ้น
  await Promise.all(
    [...visibleImageIds()]
      .filter((id) => !thumbUrls.value.has(id))
      .map(async (id) => {
        try {
          thumbUrls.value.set(id, await fileBlobUrl(id));
        } catch (e) {
          // รูปเดียวโหลดไม่ขึ้นไม่ควรทำให้ทั้งตารางพัง — ช่องนั้นแสดงไอคอนแทน
          console.error(`โหลดรูปย่อ ${id} ไม่สำเร็จ:`, e);
        }
      }),
  );
}

/** null = ช่องนี้ไม่มีรูป หรือรูปยังโหลดไม่เสร็จ/โหลดไม่ขึ้น */
function slotThumb(slot: AssetSlot): string | undefined {
  if (slot.status !== 'registered' || !slot.imageId) return undefined;
  return thumbUrls.value.get(slot.imageId);
}

onMounted(load);
watch(() => props.requestId, load);

onUnmounted(() => {
  for (const url of thumbUrls.value.values()) URL.revokeObjectURL(url);
  thumbUrls.value.clear();
});

const hasOverCost = computed(() => items.value.some((i) => i.overCost));
watch(hasOverCost, (v) => emit('over-cost', v), { immediate: true });

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ฿';
}

const expandedIds = ref(new Set<string>());
const collapsedRounds = ref(new Set<string>());

function toggleExpand(poItemId: string) {
  const next = new Set(expandedIds.value);
  if (next.has(poItemId)) next.delete(poItemId);
  else next.add(poItemId);
  expandedIds.value = next;
}

function isExpanded(poItemId: string) {
  return expandedIds.value.has(poItemId);
}

function toggleRound(grpoLineId: string) {
  const next = new Set(collapsedRounds.value);
  if (next.has(grpoLineId)) next.delete(grpoLineId);
  else next.add(grpoLineId);
  collapsedRounds.value = next;
}

function isRoundOpen(grpoLineId: string) {
  return !collapsedRounds.value.has(grpoLineId);
}

// กางแถวเมื่อไหร่ค่อยโหลดรูปของแถวนั้น — ตัวที่โหลดไว้แล้วถูก cache ไว้ กางซ้ำไม่ยิงใหม่
// (ทั้งสอง ref ถูกแทนที่ทั้งก้อนตอน toggle จึงไม่ต้อง deep watch)
watch([expandedIds, collapsedRounds], () => void loadThumbnails());
// ราคาต่อชิ้นที่จะโชว์: ลงทะเบียนแล้ว = ราคาจริงที่เก็บไว้ / ยังไม่ลง = ชิ้นที่เกิน receivedQty
// (แตกเพิ่มเอง) เริ่มที่ 0 ตรงกับ default ฝั่ง backend ส่วนชิ้นตาม SAP ใช้ unitPrice
// ช่องที่ผูกกับรอบรับของแล้วเท่านั้น (noGrpo ไม่มีรอบให้สังกัด จึงไม่มาถึงตาราง)
// — แคบชนิดตั้งแต่ตรงนี้ ตารางจะได้อ่าน unitNo/grpoLineId ได้โดยไม่ต้องเช็ค status ซ้ำ
type RoundSlot = Exclude<AssetSlot, { status: 'noGrpo' }> & { price: number };

/** ชิ้นนี้เป็นของใบคำขออื่นที่ลง PO line เดียวกันไว้ก่อน — ดูได้อย่างเดียว */
function isFromOtherRequest(slot: RoundSlot): boolean {
  return slot.status === 'registered' && slot.requestId !== props.requestId;
}

interface RoundGroup {
  id: string;
  grpoId: number;
  grpoNo: string;
  grpoDate: string;
  receivedQty: number;
  declaredQty: number | null;
  declaredReason: string | null;
  /** จำนวนชิ้นที่ลงได้จริงของรอบนี้ = ที่แจ้งไว้ ถ้าไม่แจ้งก็ตามที่ SAP รับมา */
  qty: number;
  invoices: InvoiceFile[];
  slots: RoundSlot[];
}

const grouped = computed(() =>
  items.value.map((item) => {
    const rounds: RoundGroup[] = item.grpoLines.map((l) => ({
      id: l.id,
      grpoId: l.grpoId,
      grpoNo: l.grpoNo,
      grpoDate: l.grpoDate,
      receivedQty: l.receivedQty,
      declaredQty: l.declaredQty,
      declaredReason: l.declaredReason,
      qty: l.declaredQty ?? l.receivedQty,
      invoices: l.invoices,
      slots: item.slots
        .filter(
          (s): s is Exclude<AssetSlot, { status: 'noGrpo' }> =>
            s.status !== 'noGrpo' && s.grpoLineId === l.id,
        )
        .map((s, i): RoundSlot => ({
          ...s,
          price:
            s.status === 'registered'
              ? s.acquisitionCost
              : i < l.receivedQty
                ? item.unitPrice
                : 0,
        })),
    }));

    return {
      item,
      rounds: rounds.filter((r) => r.qty > 0 || r.slots.length > 0 || r.declaredQty !== null),
      noGrpoSlots: item.slots.filter((s) => s.status === 'noGrpo'),
    };
  }),
);

/**
 * ชิ้นที่บัญชีตีกลับและยังรอผู้ขอแก้ — ส่งขึ้นให้ DraftForm ขึ้น banner (เลขชิ้นเท่านั้น)
 *
 * ★ นับเฉพาะชิ้นของใบนี้: getAssetSlots คืนช่องของ PO line เดียวกันข้ามใบมาด้วย (ใบก่อนหน้า
 *   ที่ลง PO line เดียวกันไว้ — ดู isFromOtherRequest) ชิ้นพวกนั้นผู้ขอแก้ไม่ได้ ถ้านับรวมมา
 *   banner จะสั่งให้ไปแก้ชิ้นที่กดไม่ได้เลย
 *
 * ลำดับตาม grouped อยู่แล้ว = ลำดับเดียวกับที่ตารางเรียง คนอ่าน banner แล้วไล่หาแถวได้ตรง ๆ
 */
const rejectedPieces = computed<RejectedPiece[]>(() =>
  grouped.value.flatMap(({ item, rounds }) =>
    rounds.flatMap((round) =>
      round.slots
        .filter(
          (s) => s.status === 'registered' && s.displayStatus === 'rejected' && !isFromOtherRequest(s),
        )
        .map((s) => ({ poLine: item.poLine, unitNo: s.unitNo })),
    ),
  ),
);
// ★ ผูกกับ loading ด้วย ไม่ใช่ immediate ล้วน ๆ: emit ตอนยังโหลดไม่เสร็จ = ส่ง [] ขึ้นไปก่อน
//   แล้ว banner ของ DraftForm จะขึ้น "ยังไม่มีชิ้นที่ต้องแก้" อยู่ครู่หนึ่งแล้วเด้งเป็น
//   "มี 2 ชิ้นต้องแก้" — ผิดก่อนแล้วถูก ซึ่งแย่กว่าไม่พูดอะไรเลยระหว่างรอ
//   (loading เริ่มเป็น true อยู่แล้ว immediate จึงไม่ยิงตอน mount)
watch(
  [rejectedPieces, loading],
  () => {
    if (!loading.value) emit('rejected-pieces', rejectedPieces.value);
  },
  { immediate: true },
);

const declareOpen = ref(false);
const declareTarget = ref<RoundGroup | null>(null);
const declareQty = ref(0);
const declareReason = ref('');
const declareSaving = ref(false);
const declareError = ref('');

function openDeclare(round: RoundGroup) {
  declareTarget.value = round;
  declareQty.value = round.qty;
  declareReason.value = round.declaredReason ?? '';
  declareError.value = '';
  declareOpen.value = true;
}

async function onConfirmDeclare() {
  const round = declareTarget.value;
  if (!round) return;
  // แจ้งเท่ากับที่ SAP รับมา = ไม่ได้แตกรายการ (backend จะถือว่าไม่แจ้ง) จึงไม่ต้องบังคับเหตุผล
  if (declareQty.value !== round.receivedQty && !declareReason.value.trim()) {
    declareError.value = 'กรุณาระบุเหตุผลที่จำนวนไม่ตรงกับที่ PO แจ้ง';
    return;
  }
  declareSaving.value = true;
  declareError.value = '';
  try {
    await declareLine(props.requestId, round.id, declareQty.value, declareReason.value.trim());
    declareOpen.value = false;
    await load();
  } catch (e) {
    declareError.value = e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ โปรดลองอีกครั้ง';
  } finally {
    declareSaving.value = false;
  }
}

async function onRevertToSap() {
  const round = declareTarget.value;
  if (!round) return;
  declareSaving.value = true;
  declareError.value = '';
  try {
    await removeDeclaredLine(props.requestId, round.id);
    declareOpen.value = false;
    await load();
  } catch (e) {
    declareError.value = e instanceof ApiError ? e.message : 'ยกเลิกไม่สำเร็จ โปรดลองอีกครั้ง';
  } finally {
    declareSaving.value = false;
  }
}

// ── modal จัดการ invoice ต่อรอบ (แนบ/ถอด/preview — 1 รอบหลายใบ) ──
// เก็บเป็น grpoId แล้ว compute รอบสดจาก grouped เพื่อให้ modal เห็น invoices ล่าสุดหลัง load()
const invoiceGrpoId = ref<number | null>(null);
const invoiceRound = computed(
  () => grouped.value.flatMap((g) => g.rounds).find((r) => r.grpoId === invoiceGrpoId.value) ?? null,
);

// ป้ายสถานะต่อชิ้น — สี/ข้อความตาม badgeKey
//   requested  = กรอกเป็น asset แล้วแต่ยังไม่เข้า SAP (lifecycle=DRAFT)
//   registered = ลงทะเบียนใน SAP แล้ว มี assetNumber (lifecycle=REGISTERED)
// desc = คำอธิบายที่โผล่ในกล่องตอนกดป้าย — ป้ายมีที่ว่างแค่คำเดียว ส่วนคำถามจริงของผู้ใช้
// คือ "แล้วต้องทำอะไรต่อ" ซึ่งตอบในป้ายไม่ได้ จึงย้ายมาไว้ในกล่องคู่กับเหตุผล
const STATUS_META: Record<
  SlotDisplayStatus,
  { label: string; class: string; border: string; desc: string }
> = {
  noGrpo: {
    label: 'No GRPO',
    class: 'badge-ghost',
    border: 'border-l-base-300',
    desc: 'ของยังมาไม่ถึง ต้องรอ GRPO จาก SAP ก่อนจึงจะกรอกช่องนี้ได้',
  },
  pendingCreation: {
    label: 'Pending Creation',
    class: 'badge-warning badge-soft',
    border: 'border-l-warning',
    desc: 'ของมาถึงแล้วแต่ยังไม่ได้กรอก กดปุ่มแก้ไขท้ายแถวเพื่อกรอกรายละเอียด',
  },
  saved: {
    label: 'Saved',
    class: 'badge-neutral badge-soft',
    border: 'border-l-neutral',
    desc: 'กรอกและบันทึกแล้ว แต่ยังไม่ได้ส่งใบคำขอ ยังไม่มีใครเห็นคำขอนี้',
  },
  pendingManager: {
    label: 'Pending Manager',
    class: 'badge-info badge-soft',
    border: 'border-l-info',
    desc: 'ส่งไปหาหัวหน้าแล้ว รออนุมัติ ระหว่างนี้แก้ไขไม่ได้',
  },
  rejected: {
    label: 'Rejected',
    class: 'badge-error badge-soft',
    border: 'border-l-error',
    desc: 'ถูกตีกลับ แก้ไขตามเหตุผลด้านล่างแล้วส่งใหม่',
  },
  approved: {
    label: 'Approved',
    class: 'badge-accent badge-soft',
    border: 'border-l-accent',
    desc: 'อนุมัติแล้ว รอบัญชีออกเลขสินทรัพย์',
  },
  registered: {
    label: 'Registered',
    class: 'badge-success badge-soft',
    border: 'border-l-success',
    desc: 'อยู่ในทะเบียน SAP แล้ว แก้ไขที่นี่ไม่ได้ ต้องแก้ที่ SAP',
  },
  cancelled: {
    label: 'Cancelled',
    class: 'badge-error',
    border: 'border-l-error',
    desc: 'บัญชีปิดถาวร ช่องนี้จะไม่รับสินทรัพย์อีก ปลดคืนได้เฉพาะบัญชี/แอดมิน',
  },
};

// ── กล่องดูรายละเอียดสถานะ (กดที่ป้าย) ───────────────────────────────────────
//
// กล่องเดียวที่ใช้ร่วมกันทุกแถว ไม่ใช่ <dialog> ต่อชิ้น — วิธีหลังต้องตั้ง id ให้ไม่ซ้ำ
// ซึ่ง slot.index ทำไม่ได้: มันเป็นลำดับ "ภายใน PO line" จึงซ้ำกันข้ามบรรทัด/ข้ามรอบ
// (PO line 1 กับ 2 ต่างก็มี index 1) แล้ว getElementById จะคว้ากล่องของชิ้นอื่นมาเปิด
// นอกจากนี้กล่องต่อชิ้นยังหมายถึง DOM node เท่าจำนวนแถวโดยที่เปิดทีละอันอยู่ดี
const noteTarget = ref<{ slot: RoundSlot; poLine: number } | null>(null);

function openNote(slot: RoundSlot, poLine: number) {
  noteTarget.value = { slot, poLine };
}

/**
 * ข้อความอธิบายใต้ป้าย — เฉพาะสถานะที่ "มีคนตัดสินใจอะไรบางอย่าง" เท่านั้น
 * ป้ายบอกว่าเกิดอะไรขึ้น ส่วนบรรทัดนี้บอกว่าใครทำและเพราะอะไร ซึ่งเป็นสิ่งเดียวที่ทำให้
 * ผู้ใช้รู้ว่าต้องไปคุยกับใคร/แก้อะไรต่อ
 */
function slotNote(slot: RoundSlot): string {
  if (slot.status !== 'registered') return '';
  switch (slot.displayStatus) {
    case 'rejected': {
      // ชื่อมาก่อน role — คนอ่านถามว่า "ใครตีกลับ" ก่อนเสมอ ส่วน role เป็นข้อมูลประกอบว่า
      // ตีกลับทั้งใบ (หัวหน้า) หรือรายชิ้น (บัญชี) ซึ่งต้องแก้คนละแบบ
      // ลำดับต้องตรงกับแถบในกล่องกรอก (AppAssetFormDialog) ไม่งั้นคนอ่านสองที่แล้วสับสน
      // ว่าเป็นคนละเหตุการณ์กัน
      //
      // ใช้ label สั้น (หัวหน้า/บัญชี/แอดมิน) ไม่ใช่ detail แบบเต็ม — note นี้อยู่ในตารางที่
      // พื้นที่จำกัด ส่วนคำอธิบายว่าต้องทำอะไรต่ออยู่ในกล่องกรอกซึ่งเป็นที่ที่ลงมือแก้จริง
      const who = [slot.rejectedByName, rejectRoleLabel(slot.rejectedRole)]
        .filter(Boolean)
        .join(' · ');
      const reason = slot.rejectReason?.trim() || 'ไม่ได้ระบุเหตุผล';
      return who ? `ตีกลับโดยคุณ ${who} \nเหตุผล: ${reason}` : `ตีกลับ  ${reason}`;
    }
    case 'cancelled': {
      const who = slot.cancelledByName ? `โดย ${slot.cancelledByName}` : '';
      return `ปิดถาวร ${who} — ${slot.cancelReason?.trim() || 'ไม่ได้ระบุเหตุผล'}`.trim();
    }
    case 'approved':
      return slot.approvedByName ? `อนุมัติโดย ${slot.approvedByName}` : '';
    case 'registered': {
      // ชิ้นที่จบแล้วต้องตอบได้ว่า "ใครอนุมัติ ใครออกเลข" — เลขสินทรัพย์เข้าทะเบียน SAP แล้ว
      // แก้ฝั่งเดียวไม่ได้ ถ้าเลขผิดต้องรู้ว่าไปถามใคร ไม่ใช่ไล่หาเองจาก log
      //
      // ชิ้นเก่าก่อน 0019 ไม่ได้บันทึก registeredBy ไว้ — บรรทัดนั้นหายไปเฉย ๆ ไม่ขึ้น '—'
      // เพราะ "ไม่รู้" กับ "ไม่มีคนทำ" คนละความหมาย และช่องว่างเปล่าอ่านแล้วชวนสงสัยกว่า
      const lines = [
        slot.assetNumber ? `เลขสินทรัพย์ ${slot.assetNumber}` : '',
        slot.approvedByName ? `Approved by: ${slot.approvedByName}` : '',
        slot.registeredByName ? `Complete by: ${slot.registeredByName}` : '',
      ].filter(Boolean);
      return lines.join('\n');
    }
    default:
      return '';
  }
}

/**
 * badge รายชิ้น — ไล่จากเจาะจงที่สุดไปหาทั่วไป
 *
 * ★ ป้ายทั้งหมดคำนวณที่ backend (slotDisplayStatus ใน asset.service.ts) แล้วส่งมาเป็น
 *   slot.displayStatus — ที่นี่แค่หยิบไปเปิดตาราง STATUS_META ห้าม derive ใหม่
 *
 *   เดิมหน้านี้คิดเองจาก lifecycle + สถานะของ "ใบที่กำลังเปิดดู" ซึ่งผิดเสมอเมื่อ PO เดียว
 *   มีหลายรอบ: findSlotsByRequest นับช่องข้ามใบ ชิ้นของใบก่อน (อนุมัติไปแล้ว) จึงติดมาด้วย
 *   แล้วโดนตีตราด้วยสถานะของใบใหม่ (DRAFT) กลายเป็น Saved ทั้งที่อนุมัติไปแล้ว
 */
function badgeKey(slot: RoundSlot): SlotDisplayStatus {
  return slot.displayStatus;
}

/** ชิ้นที่ "จบแล้ว" — แก้ไม่ได้อีกไม่ว่าใบจะอยู่สถานะไหน (ตรงกับด่านใน asset.service.update) */
function isSlotClosed(slot: RoundSlot): boolean {
  return slot.displayStatus === 'registered' || slot.displayStatus === 'cancelled';
}

/**
 * ชิ้นนี้กดแก้ได้ไหม — รวมทุกด่านไว้ที่เดียว (เดิมกระจายอยู่ใน :disabled ของปุ่ม)
 *
 * โหมด rejected (ใบอนุมัติแล้ว) เปิดเฉพาะชิ้นที่บัญชีตีกลับ ตรงกับที่ backend บังคับไว้
 * ใน asset.service.update() — หน้าจอกับ API ต้องตอบเหมือนกัน ไม่งั้นกดได้แล้วเจอ 400
 */
function canEditSlot(slot: RoundSlot): boolean {
  if (!props.editable || isSlotClosed(slot) || isFromOtherRequest(slot)) return false;
  if (props.editableScope === 'rejected') return slot.displayStatus === 'rejected';
  return true;
}

// ── ฟอร์มกรอกรายละเอียดสินทรัพย์รายชิ้น (popup) ────────────────────────────
// เก็บ target เป็น object สำเร็จรูป ไม่ใช่ ref ไปยัง slot — slot ถูกสร้างใหม่ทุกครั้งที่
// grouped คำนวณใหม่ (หลัง load()) ถ้าถือ reference ไว้ modal จะชี้ของเก่าที่หลุดจาก tree แล้ว
const assetFormOpen = ref(false);
const assetFormTarget = ref<AssetFormTarget | null>(null);

function openAssetForm(item: AssetSlotItem, round: RoundGroup, slot: RoundSlot) {
  assetFormTarget.value = {
    assetId: slot.status === 'registered' ? slot.assetId : undefined,
    // เลขชิ้นจริงจาก backend ไม่ใช่ลำดับบนจอ — ช่องว่างของ PO line ที่เคยลงในใบก่อน
    // ต้องได้เลขที่ยังไม่มีใครใช้ ไม่งั้น POST /assets จะชน unique แล้วได้ 409 ทุกครั้ง
    unitNo: slot.unitNo,
    poLine: item.poLine,
    grpoLineId: round.id,
    grpoNo: round.grpoNo,
    itemDescription: item.itemDescription,
    serialNumber: slot.status === 'registered' ? slot.serialNumber : null,
    acquisitionCost: slot.price,
    // ส่งเฉพาะตอนที่ยังถูกตีกลับอยู่จริง — ชิ้นที่แก้ไปแล้ว backend ล้าง rejectReason ให้
    // และ displayStatus เด้งกลับเป็น approved แถบเตือนในฟอร์มจึงหายเองตามสถานะ
    ...(slot.status === 'registered' && slot.displayStatus === 'rejected'
      ? {
          rejectReason: slot.rejectReason,
          rejectedByName: slot.rejectedByName,
          rejectedRole: slot.rejectedRole,
        }
      : {}),
  };
  assetFormOpen.value = true;
}

// บันทึกสำเร็จ → โหลด slots ใหม่ ให้สถานะ/ราคา/badge ในตารางตรงกับของที่เพิ่งเขียน
async function onAssetSaved() {
  await load();
}
const departments = ref<DepartmentOption[]>([]);
const locations = ref<MasterOption[]>([]);
const subLocations = ref<SubLocationOption[]>([]);
const masterError = ref('');

// ยิงพร้อมกันทั้งสามเส้น — เรียงกันจะรอ 3 รอบ round-trip ทั้งที่ไม่มีตัวไหนต้องใช้ผลของตัวก่อน
//
// ต้องจับ error ให้เห็น ไม่ใช่แค่ console.error: locations ว่าง = กดบันทึกไม่ได้เลย (locationId
// เป็น FK NOT NULL) ถ้าเงียบ ผู้ใช้จะเจอปุ่มที่กดไม่ได้โดยไม่รู้ว่าเพราะอะไร
async function loadMasterData() {
  masterError.value = '';
  try {
    const [dept, loc, sub] = await Promise.all([
      listDepartments(),
      listLocations(),
      listSubLocations(),
    ]);
    departments.value = dept;
    locations.value = loc;
    subLocations.value = sub;
  } catch (e) {
    console.error('โหลดข้อมูลอ้างอิงไม่สำเร็จ:', e);
    masterError.value =
      e instanceof ApiError ? e.message : 'โหลดข้อมูลอ้างอิงไม่สำเร็จ — กรอกรายละเอียดสินทรัพย์ไม่ได้';
  }
}

onMounted(loadMasterData);

// ── โหลดใหม่เมื่อมีคนอื่นเปลี่ยนใบนี้ — DraftForm เรียกเข้ามาตอนได้ก้อนจากสาย presence ──
//
// ที่พบจริงคือบัญชีตีกลับ/ปิดถาวรชิ้นหนึ่งระหว่างที่ผู้ขอเปิดหน้านี้ค้างอยู่ ป้ายรายชิ้นกับ
// เหตุผลต้องขึ้นเอง ไม่ใช่รอให้เขาเดาว่าต้องกด F5
//
// ★ กล่องที่เปิดอยู่ต้องไม่ถูกโหลดทับ: assetFormTarget/noteTarget ถ่าย snapshot ไว้ตอนกดเปิด
//   (slot ถูกสร้างใหม่ทุกครั้งที่ grouped คำนวณใหม่ — ดูคอมเมนต์ที่ openAssetForm) และ
//   ที่แย่กว่าคือกล่องกรอกรายละเอียดสินทรัพย์จะถูกล้างทั้งที่ผู้ใช้กรอกค้างอยู่
//   invoiceGrpoId ไม่ต้องกัน เพราะมันคำนวณรอบสดจาก grouped ให้อยู่แล้ว
const modalOpen = computed(
  () => assetFormOpen.value || declareOpen.value || noteTarget.value !== null,
);
let remotePending = false;

async function reloadFromRemote() {
  if (modalOpen.value) {
    remotePending = true;
    return;
  }
  remotePending = false;
  await load();
}

watch(modalOpen, (open) => {
  if (!open && remotePending) void reloadFromRemote();
});

defineExpose({ reloadFromRemote });



</script>

<template>
  <div class="card bg-base-100 shadow-sm">
    <div class="card-body items-start text-left">
      <h2 class="card-title">Select PO Line</h2>
      <p class="mb-2 text-sm text-base-content/70">
        เลือกรายการ PO Line ที่ต้องการลงทะเบียน Asset*
      </p>

      <!-- ข้อมูลอ้างอิงโหลดไม่ขึ้น = กรอกฟอร์มไม่ได้ ต้องบอกตรงนี้ ไม่ใช่ให้ไปเจอปุ่มที่กดไม่ได้ -->
      <div v-if="masterError" role="alert" class="alert alert-warning alert-soft mb-2 w-full">
        <Icon icon="lucide:triangle-alert" />
        <span>{{ masterError }}</span>
        <button type="button" class="btn btn-ghost btn-xs" @click="loadMasterData">ลองใหม่</button>
      </div>

      <div class="w-full overflow-x-auto rounded-box border border-base-300">
        <table class="table table-sm">
          <HeadtableCreateNewAsset />
          <tbody>
            <!-- โหลดอยู่ / error / ว่าง -->
            <tr v-if="loading">
              <td colspan="4" class="py-6 text-center text-base-content/50">
                <span class="loading loading-spinner loading-sm mr-2 align-middle"></span>กำลังโหลดรายการ...
              </td>
            </tr>
            <tr v-else-if="loadError">
              <td colspan="4" class="py-6 text-center text-base-content/50">{{ loadError }}</td>
            </tr>
            <tr v-else-if="items.length === 0">
              <td colspan="4" class="py-6 text-center text-base-content/50">
                ยังไม่มี PO Line ให้เลือก
              </td>
            </tr>

            <template v-for="{ item, rounds } in grouped" :key="item.poItemId">
              <tr class="cursor-pointer transition-colors hover:bg-base-200" @click="toggleExpand(item.poItemId)">
                <td class="font-mono">
                  <span class="inline-flex items-center gap-3">
                    <Icon
                      icon="lucide:chevron-right"
                      class="text-base-content/50 transition-transform"
                      :class="{ 'rotate-90': isExpanded(item.poItemId) }"
                    />
                    {{ item.poLine }}
                  </span>
                </td>
                <td>
                  {{ item.itemDescription }}
                  <span v-if="item.isDeclared" class="badge badge-secondary badge-soft badge-sm ml-2">
                    แตกรายการเอง
                  </span>
                </td>

                <td class="text-center font-mono">
                  <span
                    v-if="item.isDeclared && item.planned !== item.ordered"
                    class="text-secondary"
                    :title="`PO สั่ง ${item.ordered} — แจ้งไว้ ${item.planned}`"
                  >
                    {{ item.planned }}
                  </span>
                  <span v-else>{{ item.ordered }}</span>
                </td>
                <td class="text-right font-mono">{{ formatCurrency(item.lineTotal) }}</td>
              </tr>

              <tr v-if="isExpanded(item.poItemId)">
                <td colspan="4" class="bg-base-200 px-6 py-4 lg:px-14">
                  <div v-if="item.overCost" role="alert" class="alert alert-warning alert-soft mb-3 text-xs">
                    <Icon icon="lucide:triangle-alert" />
                    <span>
                      ราคารวมที่กรอก {{ formatCurrency(item.registeredCost) }}
                      เกินยอดของบรรทัดนี้ใน PO ({{ formatCurrency(item.lineAmount) }})
                    </span>
                  </div>

                  <div v-for="round in rounds" :key="round.id" class="mb-3 last:mb-0">
                    <div class="flex w-full flex-wrap items-center gap-2 rounded-t-box bg-base-100 px-3 py-2">
                      <!-- toggle: caret + เลข GRPO + วันที่ (ครอบแค่นี้ ห้ามครอบปุ่มอื่น = button ซ้อน button) -->
                      <button type="button" class="btn btn-ghost btn-sm" @click="toggleRound(round.id)">
                        <Icon
                          icon="lucide:chevron-down"
                          class="text-base-content/50 transition-transform duration-200"
                          :class="isRoundOpen(round.id) ? 'rotate-0' : '-rotate-90'"
                        />
                        <span class="font-mono text-sm font-medium">{{ round.grpoNo }}</span>
                        <span class="text-xs font-normal text-base-content/50">{{ formatDate(round.grpoDate) }}</span>
                      </button>

                      <!-- action: invoice — เปิด modal จัดการ (แนบ/ถอด/preview 1 รอบหลายใบ) -->
                      <button
                        type="button"
                        class="btn btn-outline btn-xs ml-auto"
                        :class="round.invoices.length ? 'btn-success' : ''"
                        :disabled="!canEditRound"
                        :title="!canEditRound ? 'ไม่มีสิทธิ์จัดการ invoice' : (round.invoices.length ? `invoice ${round.invoices.length} ใบ` : 'ยังไม่มี invoice')"
                        @click="invoiceGrpoId = round.grpoId"
                      >
                        <Icon icon="lucide:receipt-text" />
                        <span v-if="round.invoices.length">invoice ({{ round.invoices.length }})</span>
                        <span v-else>{{ canEditRound ? 'แนบ invoice' : 'ไม่มี invoice' }}</span>
                      </button>

                      <!-- เส้นคั่น action | info -->
                      <div class="divider divider-horizontal mx-0" aria-hidden="true"></div>

                      <!-- info: จำนวนที่กรอก -->
                      <span class="text-xs text-base-content/70">
                        กรอกแล้ว
                        <span class="font-mono font-medium text-base-content">
                          {{ round.slots.filter((s) => s.status === 'registered').length }}
                        </span>
                        / <span class="font-mono">{{ round.qty }}</span> ชิ้น
                      </span>

                      <span
                        v-if="round.declaredQty !== null"
                        class="badge badge-secondary badge-soft badge-sm"
                        :title="round.declaredReason ?? ''"
                      >
                        แจ้งเอง (GRPO เดิมรับ {{ round.receivedQty }})
                      </span>

                      <!-- action: แก้จำนวนที่แจ้ง (icon) -->
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm btn-square"
                        :disabled="!canEditRound"
                        :title="round.declaredQty !== null ? 'แก้จำนวนที่แจ้งไว้' : 'แจ้งจำนวนชิ้นของรอบนี้'"
                        @click="openDeclare(round)"
                      >
                        <Icon icon="lucide:file-pen-line" />
                      </button>
                    </div>

                    <table v-if="isRoundOpen(round.id)" class="table table-sm rounded-box bg-base-10">
                      <tbody>
                        <tr
                          v-for="slot in round.slots"
                          :key="slot.unitNo"
                          class="border-l-4 transition-colors"
                          :class="[
                            STATUS_META[badgeKey(slot)].border,
                            slot.status === 'registered' ? 'bg-base-200' : 'bg-base-100 hover:bg-base-200',
                          ]"
                        >
                          <!-- เลขชิ้นจริง (unitNo) ไม่ใช่ลำดับบนจอ — PO line ที่ลงมาแล้วหลายใบ
                               จะเดินเลขต่อจากของเดิม ตรงกับที่เก็บในระบบ -->
                          <td class="w-[20px] text-right font-mono ">
                            {{ item.poLine }}.{{ slot.unitNo }}
                          </td>

                          <!-- Image — รูปที่แนบไว้ ถ้ายังไม่มี/ยังโหลดไม่เสร็จใช้ไอคอนแทน -->
                          <td class="text-center">
                            <img
                              v-if="slotThumb(slot)"
                              :src="slotThumb(slot)"
                              alt="รูปสินทรัพย์"
                              loading="lazy"
                              class="mx-auto h-10 w-10 rounded object-cover ring-1 ring-base-300"
                            />
                            <Icon v-else icon="lucide:image" class="mx-auto text-base-content/40" />
                          </td>

                          <!-- Serial -->
                          <td>
                            <div class="flex flex-col">
                              <span class="text-xs uppercase text-base-content/50">Serial number</span>
                              <span :class="slot.status === 'registered' ? 'text-base-content/60' : ''">
                                {{ slot.status === 'registered' ? (slot.serialNumber ?? 'Not assigned') : 'Not assigned' }}
                              </span>
                            </div>
                          </td>

                          <td class="text-right">
                            <div class="flex flex-col">
                              <span class="text-xs uppercase text-base-content/50">Price per unit</span>
                              <span
                                class="font-mono"
                                :class="slot.status === 'registered' ? 'text-base-content/60' : ''"
                              >
                                {{ formatCurrency(slot.price) }}
                              </span>
                            </div>
                          </td>

                          <!-- Status — ป้าย + บรรทัดบอกว่าใครทำอะไรเพราะอะไร
                               (เหตุผลตีกลับ/ปิดถาวร, ผู้อนุมัติ, เลขสินทรัพย์) -->

                          
                          <!-- ป้ายเป็นปุ่มในตัว — กดแล้วเปิดกล่องอธิบายสถานะ + เหตุผล
                               ไม่แยกเป็นปุ่ม "ดูหมายเหตุ" ข้าง ๆ: ป้ายคือสิ่งที่ผู้ใช้มองอยู่แล้ว
                               และช่องนี้แคบ สองปุ่มติดกันจะดันคอลัมน์จนตารางเบียด -->
                          <td class="text-right">
                            <button
                              type="button"
                              class="badge badge-sm cursor-pointer transition hover:brightness-95"
                              :class="STATUS_META[badgeKey(slot)].class"
                              :title="`${STATUS_META[badgeKey(slot)].label} กดเพื่อดูรายละเอียด`"
                              @click.stop="openNote(slot, item.poLine)"
                            >
                              {{ STATUS_META[badgeKey(slot)].label }}
                              <Icon icon="lucide:info" class="ml-0.5 size-3 opacity-70" />
                            </button>
                          </td>
                          

                          <!-- Action — เปิดฟอร์มรายชิ้น (ช่องว่าง = กรอกใหม่ / ช่องที่กรอกแล้ว = แก้)
                               ปิดปุ่มเมื่อชิ้นนั้น "จบแล้ว" ไม่ว่าจะจบแบบไหน:
                                 registered  อยู่ใน SAP แล้ว ต้องแก้ที่ SAP
                                 cancelled   ปิดถาวร ต้องให้บัญชีปลดก่อน
                               ★ rejected ไม่ปิด — นั่นคือชิ้นที่ผู้ใช้ "ต้องแก้" โดยเฉพาะ -->
                          <td class="text-center">
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm btn-square"
                              :disabled="!canEditSlot(slot)"
                              :title="
                                isFromOtherRequest(slot)
                                  ? 'ชิ้นนี้ลงทะเบียนไว้ในใบคำขออื่นของ PO เดียวกัน แก้ไขที่ใบนั้น'
                                  : props.editableScope === 'rejected' && badgeKey(slot) !== 'rejected'
                                    ? 'คำขอนี้อนุมัติแล้ว — แก้ได้เฉพาะชิ้นที่บัญชีตีกลับ'
                                    : badgeKey(slot) === 'registered'
                                    ? 'ลงทะเบียนใน SAP แล้ว แก้ไขที่นี่ไม่ได้'
                                    : badgeKey(slot) === 'cancelled'
                                      ? 'ชิ้นนี้ถูกปิดถาวร — ให้บัญชีปลดการปิดก่อนจึงจะแก้ได้'
                                      : badgeKey(slot) === 'rejected'
                                        ? 'ถูกตีกลับ — แก้ไขแล้วจะกลับเข้าคิวให้เอง'
                                        : slot.status === 'registered'
                                          ? 'แก้ไขรายละเอียดสินทรัพย์'
                                          : 'กรอกรายละเอียดสินทรัพย์'
                              "
                              @click="openAssetForm(item, round, slot)"
                            >
                              <Icon icon="lucide:square-pen" class="text-lg" />
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p
                    v-if="rounds.length === 0"
                    class="rounded-box bg-base-100 px-3 py-3 text-left text-sm text-base-content/50"
                  >
                    ยังไม่มีรอบรับของ (GRPO) สำหรับรายการนี้ — ลงทะเบียนได้เมื่อคลังตรวจรับแล้ว
                  </p>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── แจ้งจำนวนชิ้นของรอบรับของ ── -->
    <AppConfirmDialog v-model="declareOpen" variant="info" title="แก้ไขจำนวนชิ้นการขึ้นทะเบียนสินทรัพย์"
      confirm-text="บันทึก" :loading="declareSaving" @confirm="onConfirmDeclare">
      <div class="space-y-3 text-left">
        <p>
          GRPO <span class="font-semibold"><u>{{ declareTarget?.grpoNo }}</u></span> ·
          SAP รับมา <span class="font-semibold">{{ declareTarget?.receivedQty }}</span> ชิ้น
          กรอกแล้ว
          {{declareTarget?.slots.filter((s) => s.status === 'registered').length ?? 0}} ชิ้น
        </p>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">จำนวนชิ้นที่จะขึ้นทะเบียน*</legend>
          <input v-model.number="declareQty" type="number" min="0" class="input w-full" />
          <p class="label">*ลดต่ำกว่าจำนวนที่ลงทะเบียนไปแล้วไม่ได้</p>

          <legend class="fieldset-legend">เหตุผล (บังคับ)*</legend>
          <textarea
            v-model="declareReason"
            rows="2"
            class="textarea w-full"
            placeholder="เช่น งานเหมา 1 งาน ประกอบด้วยกล้อง 11 ตัว + NVR 1 เครื่อง ตามใบส่งของ"
          />
          <p class="label">ผู้อนุมัติจะเห็นข้อความนี้พร้อมส่วนต่างจากเอกสาร SAP</p>
        </fieldset>

        <!-- รอบที่เคยแจ้งไว้แล้ว: เปิดทางกลับไปเชื่อตัวเลข SAP -->
        <button
          v-if="declareTarget?.declaredQty !== null && declareTarget"
          type="button"
          class="btn btn-link btn-sm px-0"
          :disabled="declareSaving"
          @click="onRevertToSap"
        >
          กลับไปใช้จำนวนที่ GRPO เดิมรับมา ({{ declareTarget.receivedQty }})
        </button>

        <div v-if="declareError" role="alert" class="alert alert-error alert-soft">
          <Icon icon="lucide:circle-alert" />
          <span>{{ declareError }}</span>
        </div>
      </div>
    </AppConfirmDialog>

    <!-- จัดการ invoice ของรอบที่เลือก — เปิดเมื่อ invoiceGrpoId ถูกเซ็ต, ปิด = คืนเป็น null -->
    <InvoiceModal v-if="invoiceRound" :open="true" :grpo-id="invoiceRound.grpoId" :grpo-no="invoiceRound.grpoNo"
      :invoices="invoiceRound.invoices" :editable="canEditRound" @update:open="invoiceGrpoId = null"
      @changed="load" />

    <AppAssetFormDialog
      v-model:open="assetFormOpen"
      :request-id="props.requestId"
      :target="assetFormTarget"
      :editable="props.editable"
      :departments="departments"
      :locations="locations"
      :sub-locations="subLocations"
      @saved="onAssetSaved"
    />

    <!-- กล่องรายละเอียดสถานะ — กล่องเดียวใช้ร่วมทุกแถว (ดู noteTarget ใน script)
         modal-bottom บนมือถือ / กลางจอบนเดสก์ท็อป ตามแพตเทิร์นของ daisyUI -->
    <dialog class="modal modal-bottom sm:modal-middle" :class="{ 'modal-open': noteTarget !== null }">
      <div v-if="noteTarget" class="modal-box text-left">
        <div class="flex items-center gap-2">
          <span class="badge badge-sm" :class="STATUS_META[badgeKey(noteTarget.slot)].class">
            {{ STATUS_META[badgeKey(noteTarget.slot)].label }}
          </span>
          <span class="font-mono text-sm text-base-content/60">
            ชิ้นที่ {{ noteTarget.poLine }}.{{ noteTarget.slot.unitNo }}
          </span>
        </div>

        <p class="mt-3 text-sm">{{ STATUS_META[badgeKey(noteTarget.slot)].desc }}</p>

        <!-- เหตุผล/ผู้ตัดสินใจ — มีเฉพาะสถานะที่มีคนไปกดอะไรมา (ตีกลับ/ปิดถาวร/อนุมัติ/ออกเลข)
             whitespace-pre-wrap: เหตุผลที่บัญชีพิมพ์มาอาจขึ้นบรรทัดใหม่เอง -->
        <div
          v-if="slotNote(noteTarget.slot)"
          class="mt-3 rounded-box bg-base-200 p-3 text-sm whitespace-pre-wrap"
          :class="{ 'text-error': badgeKey(noteTarget.slot) === 'rejected' }"
        >
          {{ slotNote(noteTarget.slot) }}
        </div>

        <div class="modal-action">
          <button class="btn" @click="noteTarget = null">ปิด</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="noteTarget = null">close</button>
      </form>
    </dialog>
  </div>
</template>
