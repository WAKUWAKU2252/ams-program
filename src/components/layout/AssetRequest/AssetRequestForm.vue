<script setup lang="ts">
// หน้าออกเลขของบัญชี — ทีละใบ (โครงเดียวกับ DraftForm ของหน้า Create New Asset)
//
// ทำไมต้องเป็นหน้าแยก ไม่ใช่กางในตารางเหมือนเดิม: การออกเลขต้อง "จองใบ" ไว้ก่อน ไม่งั้น
// บัญชีสองคนกรอกเลขใบเดียวกันพร้อมกันแล้วทับกันเงียบ ๆ การจองผูกกับ "หน้าที่เปิดอยู่"
// (เปิดสาย SSE ค้าง = ถือ lock / ออกจากหน้า = ปล่อย) ซึ่งมีความหมายก็ต่อเมื่อเปิดได้ทีละใบ
// ถ้ากางหลายใบพร้อมกันในตาราง คนคนเดียวจะถือ lock ค้างหลายใบและบล็อกคนอื่นทั้งแถบ
//
// lock เป็นของ "ใบ" ไม่ใช่ของ "ชิ้น" — บัญชีคนที่สองที่เข้ามาจะเห็นทุกอย่างแต่กดอะไรไม่ได้
// จนกว่าคนแรกจะออก (backend บังคับซ้ำอีกชั้นที่ assertRegistrationHolder ไม่ใช่แค่ซ่อนปุ่ม)
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import QRCode from 'qrcode'
import AppAssetNumberInput from '@/components/common/AppAssetNumberInput.vue'
import InvoiceModal from '@/components/common/InvoiceModal.vue'
import {
  getPendingRegistration,
  assignAssetNumber,
  confirmRegistration,
  rejectAsset,
  cancelAsset,
  uncancelAsset,
} from '@/services/assetRequest.service'
import type { PendingRegistrationRow } from '@/services/assetRequest.service'
import { getAssetSlots } from '@/services/asset.service'
import type { AssetSlotsResponse, InvoiceFile, SlotDisplayStatus } from '@/services/asset.service'
import { openPresence } from '@/services/presence.service'
import type { PresenceState, PresenceConnection } from '@/services/presence.service'
import { fileBlobUrl } from '@/services/attachment.service'
import { invoiceBlobUrl } from '@/services/invoice.service'
import { ApiError } from '@/services/httpClient'
import { formatDate, formatDateTime } from '@/utils/date'
import { ASSET_NUMBER_REGEX } from '@contract/asset-number'
import { Icon } from '@iconify/vue'

const props = defineProps<{ requestId: string }>()
const router = useRouter()
const id = computed(() => Number(props.requestId))

const header = ref<PendingRegistrationRow | null>(null)
const slots = ref<AssetSlotsResponse | null>(null)
const loading = ref(true)
const loadError = ref('')

// ── lock: เปิดสายค้างไว้ = จองใบนี้ ──────────────────────────────────────────
const presenceState = ref<PresenceState | null>(null)
let presenceConn: PresenceConnection | null = null

const editable = computed(() => presenceState.value?.state === 'editable')

const lockBanner = computed(() => {
  const s = presenceState.value
  if (!s) return 'กำลังเชื่อมต่อ... ยังแก้ไขไม่ได้จนกว่าจะจองใบนี้สำเร็จ'
  if (s.state === 'pending') {
    const who = s.holderName ?? 'ผู้ใช้อื่น'
    const queue = s.position > 1 ? ` (คุณอยู่คิวที่ ${s.position})` : ''
    return `ใบนี้กำลังถูกแก้ไขโดย ${who} เปิดดูได้แต่แก้ไขไม่ได้ ${queue}`
  }
  return ''
})

async function loadHeader() {
  header.value = await getPendingRegistration(id.value)
}

async function loadSlots() {
  const res = await getAssetSlots(id.value)
  slots.value = res
  void loadThumbnails(res)
}

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    await Promise.all([loadHeader(), loadSlots()])
    openPresenceStream()
    startIdleTimer()
  } catch (e) {
    // 404 = ใบไม่อยู่ในคิวแล้ว (ยืนยันไปแล้ว/ถูกลบ) — ไม่ใช่ error ของผู้ใช้
    loadError.value =
      e instanceof ApiError ? e.message : 'เปิดใบนี้ไม่ได้ อาจถูกยืนยันหรือลบไปแล้ว'
  } finally {
    loading.value = false
  }
}

function openPresenceStream() {
  presenceConn = openPresence(
    id.value,
    {
      onState: (s) => {
        presenceState.value = s
      },
      // ใบนี้ถูกเปลี่ยนโดยคนอื่น — ที่พบจริงคือผู้ขอแก้ชิ้นที่เราตีกลับไป (ชิ้นนั้นกลับเข้าคิว
      // ออกเลขทันที) และบัญชีคนที่สองที่เปิดดูอยู่ต้องเห็นเลขที่ holder เพิ่งกรอก
      onStatus: () => scheduleRemoteRefresh(),
      onError: (e) => console.error('presence error:', e),
    },
    'registration',
  )
}

function closePresence() {
  presenceConn?.close()
  presenceConn = null
}

/**
 * ถือ lock ค้างไว้โดยไม่ทำอะไร = บล็อกคนอื่นฟรี ๆ — เตะออกเหมือนหน้า DraftForm
 * (10 นาทีตรงกับที่นั่น ส่วน backend มี TTL 15 นาทีเป็นตาข่ายอีกชั้นเผื่อแท็บถูกฆ่าทิ้ง)
 */
let idleTimer: ReturnType<typeof setTimeout> | undefined
const idleEvents: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll']

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(
    () => {
      closePresence()
      router.replace({ name: 'MainAssetRequest' })
    },
    10 * 60 * 1000,
  )
}

function startIdleTimer() {
  idleEvents.forEach((event) => window.addEventListener(event, resetIdleTimer))
  resetIdleTimer()
}

function stopIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }
  idleEvents.forEach((event) => window.removeEventListener(event, resetIdleTimer))
}

/**
 * จัดรายชิ้นใหม่เป็น "รอบรับของ → ชิ้น"
 *
 * getAssetSlots คืนมาเป็น poItem → slot (โครงของหน้าลงทะเบียนซึ่งมองเป็นบรรทัด PO)
 * แต่บัญชีอ่านเป็นล็อตของที่มาถึง จึงต้องกลับด้านตรงนี้ ไม่ใช่ไปแก้ endpoint
 * — หน้าลงทะเบียนยังต้องใช้โครงเดิมอยู่
 */
interface FlatSlot {
  assetId: number
  /** บรรทัดของ PO — ใช้คู่กับ unitNo เป็นเลขชิ้นที่คนอ่าน (poLine.unitNo) */
  poLine: number
  unitNo: number
  description: string
  serialNumber: string | null
  acquisitionCost: number
  location: string
  imageId: string | null
  lifecycle: string
  /** ผู้ถือครอง (null = ของกลาง) */
  employeeName: string | null
  departmentName: string | null
  /** ประกอบเป็นข้อความบรรทัดเดียวแล้ว — ดูเหตุผลที่ warrantyText() */
  warranty: string
  /** ป้ายที่ backend คำนวณมาให้ — ตัวตัดสินว่าแถวนี้โชว์ปุ่มอะไร */
  displayStatus: SlotDisplayStatus
  /** เลข SAP ที่ออกไปแล้ว (null = ยังไม่ออก) — กล่องจัดการเอาไปเติมในช่องเพื่อให้แก้ทับได้ */
  assetNumber: string | null
  /** URL ที่ฝังใน QR ของสติกเกอร์ (null = ยังไม่มีเลข) — วาดรูปจากค่านี้ ไม่ประกอบเอง */
  qrCode: string | null
  /** เคยถูกตีกลับแล้วผู้ขอแก้กลับมาแล้ว ยังไม่ได้ออกเลข — ป้าย "แก้ไขแล้ว" ในตาราง */
  rejectFixed: boolean
  rejectReason: string | null
  cancelReason: string | null
}

/**
 * ระยะประกันเป็นข้อความบรรทัดเดียว — สองคอลัมน์นี้ nullable อิสระจากกัน จึงมี 4 กรณีจริง
 * ปล่อยให้ template เขียน v-if ซ้อนกันเองแล้วจะได้ "— - 31/12/2570" ในกรณีที่มีแต่วันจบ
 */
function warrantyText(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`
  return start ? `เริ่ม ${formatDate(start)}` : `ถึง ${formatDate(end!)}`
}

/** ข้อมูลของ "รอบ" ที่ตารางกับกล่องจัดการต้องใช้ — invoice ผูกกับรอบ ไม่ใช่กับชิ้น */
interface RoundGroup {
  grpoNo: string
  grpoId: number
  invoices: InvoiceFile[]
  slots: FlatSlot[]
}

const rounds = computed<RoundGroup[]>(() => {
  const data = slots.value
  if (!data) return []

  // grpoNo -> grpoId + invoice ของรอบนั้น
  // ทำเป็น lookup แยกเพราะ slot ไม่ได้พก grpoId/invoices มาด้วย (มันอยู่ที่ระดับ grpoLine)
  // GRPO ใบเดียวคร่อมได้หลาย PO line จึงโผล่เป็น grpoLine หลายแถวที่มี grpoNo เดียวกัน —
  // grpoId กับ invoices เป็นของ "ใบ GRPO" จึงเหมือนกันทุกแถว หยิบแถวแรกที่เจอพอ
  const roundMeta = new Map<string, { grpoId: number; invoices: InvoiceFile[] }>()
  for (const item of data.items) {
    for (const l of item.grpoLines) {
      if (!roundMeta.has(l.grpoNo)) roundMeta.set(l.grpoNo, { grpoId: l.grpoId, invoices: l.invoices })
    }
  }

  const map = new Map<string, FlatSlot[]>()
  for (const item of data.items) {
    for (const slot of item.slots) {
      if (slot.status !== 'registered') continue
      // getAssetSlots นับช่องข้ามใบ (PO เดียวเปิดคำขอได้หลายรอบ) — ใบนี้ต้องแสดงเฉพาะ
      // ของที่ตัวเองขอ ไม่งั้นของจากใบก่อนจะโผล่มาปนในรายการที่ส่งให้บัญชีดู
      if (slot.requestId !== id.value) continue
      const list = map.get(slot.grpoNo) ?? []
      map.set(slot.grpoNo, list)
      list.push({
        assetId: slot.assetId,
        poLine: item.poLine,
        unitNo: slot.unitNo,
        description: item.itemDescription,
        serialNumber: slot.serialNumber,
        acquisitionCost: slot.acquisitionCost,
        location: [slot.locationName, slot.subLocationName].filter(Boolean).join(' - ') || '—',
        imageId: slot.imageId,
        lifecycle: slot.lifecycle,
        employeeName: slot.employeeName,
        departmentName: slot.departmentName,
        warranty: warrantyText(slot.warrantyStartDate, slot.warrantyEndDate),
        displayStatus: slot.displayStatus,
        rejectReason: slot.rejectReason,
        assetNumber: slot.assetNumber,
        qrCode: slot.qrCode,
        rejectFixed: slot.rejectFixed,
        cancelReason: slot.cancelReason,
      })
    }
  }
  // เรียงแบบเดียวกับหน้า Create New Asset: ตามบรรทัด PO ก่อน แล้วค่อยตามเลขชิ้นในบรรทัดนั้น
  // ได้ 0.1 0.2 0.3 → 1.1 1.2 — ไม่ใช่เรียงตาม unitNo ล้วนซึ่งจะสลับบรรทัดกันมั่ว
  const byLineThenUnit = (a: FlatSlot, b: FlatSlot) => a.poLine - b.poLine || a.unitNo - b.unitNo
  const list: RoundGroup[] = [...map].map(([grpoNo, s]) => ({
    grpoNo,
    grpoId: roundMeta.get(grpoNo)?.grpoId ?? 0,
    invoices: roundMeta.get(grpoNo)?.invoices ?? [],
    slots: s.sort(byLineThenUnit),
  }))
  // รอบเรียงตามชิ้นแรกของรอบ ไม่ใช่ตาม grpoNo (เลขเอกสารไม่ได้เรียงตามลำดับที่ของมาถึงเสมอ)
  return list.sort((a, b) =>
    a.slots[0] && b.slots[0] ? byLineThenUnit(a.slots[0], b.slots[0]) : 0,
  )
})

// ── รูป: /uploads/:id/file อยู่หลัง authGuard — ยัดใน <img src> ตรง ๆ จะโดน 401
// ต้องโหลดเป็น blob พร้อม token (ดู attachment.service.ts) แล้ว revoke ตอนออกจากหน้า
const imageUrls = ref<Record<string, string>>({})

async function loadThumbnails(data: AssetSlotsResponse) {
  for (const item of data.items) {
    for (const slot of item.slots) {
      if (slot.status !== 'registered' || !slot.imageId) continue
      if (imageUrls.value[slot.imageId]) continue
      try {
        imageUrls.value[slot.imageId] = await fileBlobUrl(slot.imageId)
      } catch {
        // รูปโหลดไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย — ปล่อยขึ้น placeholder
      }
    }
  }
}

// ── กล่องจัดการรายชิ้น — กล่องเดียวสำหรับทุกการตัดสินใจของบัญชี ─────────────
//
// สามทางเลือก (ออกเลข / ตีกลับ / ปิดถาวร) อยู่ในกล่องเดียวกันโดยตั้งใจ ไม่แยกเป็นสามปุ่ม
// ในตาราง เพราะทั้งสามอย่างตัดสินจาก "ข้อมูลชุดเดียวกัน" — รูปเต็ม S/N ราคา สถานที่
// ผู้ถือครอง แยกเป็นปุ่มในแถวแปลว่าบัญชีต้องตัดสินใจจากข้อมูลย่อบนตารางก่อนเปิดดูของจริง
// ซึ่งเป็นทางที่กดผิดง่ายที่สุด (ทั้งสามอย่างย้อนยากคนละแบบ)
type SlotAction = 'register' | 'reject' | 'cancel' | 'uncancel'

const target = ref<{ round: RoundGroup; slot: FlatSlot } | null>(null)
// รูปเต็มจอ — ซ้อนบนกล่องจัดการ ไม่ใช่กล่องแยก: บัญชีต้องซูมดู S/N บนตัวเครื่องแล้วปิดกลับ
// มาที่ฟอร์มเดิมทันที ถ้าเป็นกล่องแยกจะต้องปิดสองชั้นกว่าจะได้กรอกต่อ
const lightboxOpen = ref(false)
// invoice เป็นของ "รอบรับของ" ไม่ใช่ของชิ้น — ปุ่มจึงอยู่ที่หัวรอบในตาราง ไม่ใช่ในกล่องรายชิ้น
// (ของเดิมอยู่ในกล่อง ซึ่งแปลว่าต้องเปิดชิ้นสักชิ้นก่อนถึงจะดูใบกำกับของรอบได้ ทั้งที่ใบกำกับ
//  เป็นสิ่งที่บัญชีเปิดอ่านก่อนเริ่มไล่ตรวจทั้งรอบ)
//
// สองชั้นเหมือนเดิม:
//   invoiceViewOpen = ดูไฟล์เต็มจอ (ทางหลัก) ทำแบบเดียวกับรูปสินทรัพย์ ไม่เด้งแท็บใหม่
//   invoiceOpen     = กล่องจัดการไฟล์ (แนบ/ถอด) เปิดต่อจากตัวดูเมื่อจะแก้ของ
const invoiceRound = ref<RoundGroup | null>(null)
const invoiceOpen = ref(false)
const invoiceViewOpen = ref(false)
const invoiceIndex = ref(0)
const action = ref<SlotAction>('register')
const assetNumber = ref('')
const reason = ref('')
const saving = ref(false)
const saveError = ref('')

const ACTION_META: Record<
  SlotAction,
  { tab: string; icon: string; hint: string; hintIcon: string; confirm: string; btn: string }
> = {
  register: {
    tab: 'Registered',
    icon: 'oui:number',
    hint: 'เลขจาก SAP บันทึกเมื่อลงทะเบียนที่ SAP แล้วเท่านั้น',
    hintIcon: 'mdi:information-outline',
    confirm: 'บันทึกเลข',
    btn: 'btn-primary',
  },
  reject: {
    tab: 'Rejected',
    icon: 'mdi:undo-variant',
    hint: 'ตีกลับรายการ/ไม่ผ่านการตรวจสอบ กรุณาระบุเหตุผล',
    hintIcon: 'mdi:alert-outline',
    confirm: 'ตีกลับ',
    btn: 'btn-warning',
  },
  cancel: {
    tab: 'Cancel',
    icon: 'mdi:cancel',
    hint: 'ยกเลิกการสร้างรายการนี้ถาวร ไม่สามารถขึ้นเป็นสินทรัพย์ได้ และสร้างใหม่ไม่ได้อีก',
    hintIcon: 'mdi:alert-octagon-outline',
    confirm: 'ปิดถาวร',
    btn: 'btn-error',
  },
  uncancel: {
    tab: 'ปลดการปิด',
    icon: 'mdi:restore',
    hint: 'ชิ้นนี้จะกลับมาอยู่ในคิวออกเลขตามเดิม',
    hintIcon: 'mdi:information-outline',
    confirm: 'ปลดการปิด',
    btn: 'btn-primary',
  },
}

/**
 * ป้ายสถานะ "ตอนนี้" ของชิ้นที่เปิดอยู่ — กล่องนี้เปิดจากหลายสถานะ (รอออกเลข/ตีกลับ/ปิดถาวร)
 * แล้วแท็บที่เห็นก็ต่างกันไปตามนั้น ถ้าไม่ติดป้ายไว้ที่หัวกล่องจะเดาไม่ออกว่าทำไมแท็บหาย
 *
 * สีคู่กับความหมาย: ตีกลับ = warning (ผู้ขอแก้แล้วกลับเข้าคิวได้) / ปิดถาวร = error (ทางตัน)
 */
const SLOT_STATUS_BADGE: Partial<
  Record<SlotDisplayStatus, { label: string; class: string; icon: string }>
> = {
  approved: { label: 'รอออกเลข', class: 'badge-info badge-soft', icon: 'mdi:clock-outline' },
  rejected: { label: 'ตีกลับแล้ว', class: 'badge-warning badge-soft', icon: 'mdi:undo-variant' },
  cancelled: { label: 'ปิดถาวร', class: 'badge-error', icon: 'mdi:cancel' },
  registered: {
    label: 'ออกเลขแล้ว',
    class: 'badge-success badge-soft',
    icon: 'mdi:check-circle-outline',
  },
}

// ── รูป QR ของชิ้นที่เปิดอยู่ ──────────────────────────────────────────────
// วาดจาก slot.qrCode ที่ backend เก็บไว้ตอนออกเลข ไม่ประกอบ URL เองจาก assetNumber —
// ค่าที่เก็บไว้คือค่าที่ตรงกับสติกเกอร์ที่พิมพ์ไปแล้ว ถ้าจอประกอบเอง ความไม่ตรงกันระหว่าง
// จอกับของจริงจะไม่มีใครเห็น
//
// errorCorrectionLevel 'M' (กู้ได้ ~15%): สูงกว่านี้ทนรอยขีดข่วนดีขึ้นก็จริง แต่โมดูลจะถี่ขึ้น
// ซึ่งสวนทางกับสติกเกอร์ที่พิมพ์ขนาดเล็ก — ถ้าของจริงติดที่เครื่องจักรที่เลอะบ่อย ค่อยขยับเป็น 'Q'
// พร้อมขยายขนาดสติกเกอร์ไปด้วยกัน
const qrDataUrl = ref('')

watch(
  () => target.value?.slot.qrCode ?? null,
  async (value) => {
    if (!value) {
      qrDataUrl.value = ''
      return
    }
    try {
      qrDataUrl.value = await QRCode.toDataURL(value, {
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M',
      })
    } catch {
      // วาดไม่ได้ = ไม่โชว์รูป แต่ข้อความ URL ยังอยู่ให้ก๊อปไปใช้ต่อได้
      qrDataUrl.value = ''
    }
  },
  { immediate: true },
)

const slotStatus = computed(() =>
  target.value ? (SLOT_STATUS_BADGE[target.value.slot.displayStatus] ?? null) : null,
)

/** เหตุผลที่ชิ้นนี้ค้างอยู่ — เดิมมีแต่ในตาราง คนที่เปิดกล่องมาตัดสินใจต่อก็ต้องเห็นด้วย */
const blockedReason = computed(() => {
  const s = target.value?.slot
  if (!s) return null
  if (s.displayStatus === 'cancelled' && s.cancelReason)
    return { title: 'ปิดถาวรแล้ว', text: s.cancelReason, class: 'alert-error', icon: 'mdi:cancel' }
  if (s.rejectReason)
    return {
      title: 'เหตุผลที่ตีกลับ',
      text: s.rejectReason,
      class: 'alert-warning',
      icon: 'mdi:undo-variant',
    }
  return null
})

/**
 * ข้อมูลประกอบการตัดสินใจ — เขียนเป็นข้อมูลแทน markup ซ้ำเจ็ดรอบใน template
 * แบ่งสองกองตรง ๆ ไม่ใช่ตัดครึ่งอัตโนมัติ เพราะมันคือลำดับที่บัญชีไล่ตรวจจริง:
 *   ซ้าย  = ชิ้นนี้คืออะไร (ชื่อของ S/N ราคา ประกัน)
 *   ขวา   = อยู่กับใคร ที่ไหน (แผนก สถานที่ ผู้ถือครอง)
 * เพิ่ม/ย้ายช่องทีหลังแก้ที่อาร์เรย์นี้ที่เดียว
 */
interface SlotDetail {
  icon: string
  label: string
  value: string
  mono?: boolean
  /** ค่าที่ไม่ใช่ข้อมูลจริง (ว่าง/ของกลาง) — ทำให้จางลงเพื่อไม่ให้อ่านปนกับค่าที่กรอกมาแล้ว */
  muted?: boolean
}

const detailColumns = computed<SlotDetail[][]>(() => {
  const s = target.value?.slot
  if (!s) return [[], []]
  return [
    [
      // เลขที่ออกไปแล้วอยู่บนสุด — เป็นสิ่งที่ต้องตรวจก่อนตัดสินใจว่าจะแก้ไหม และยังเห็นได้
      // ตอนสลับไปแท็บอื่นด้วย (ช่องกรอกโชว์เฉพาะแท็บออกเลข)
      ...(s.assetNumber
        ? [{ icon: 'mdi:tag-check-outline', label: 'เลขสินทรัพย์', value: s.assetNumber, mono: true }]
        : []),
      { icon: 'mdi:package-variant-closed', label: 'รายการ', value: s.description },
      {
        icon: 'mdi:barcode',
        label: 'Serial No.',
        value: s.serialNumber ?? '—',
        mono: true,
        muted: !s.serialNumber,
      },
      {
        icon: 'mdi:cash-multiple',
        label: 'ราคาทุน',
        value: s.acquisitionCost.toLocaleString('th-TH') + ' ฿',
        mono: true,
      },
      { icon: 'mdi:shield-check-outline', label: 'ระยะประกัน', value: s.warranty },
    ],
    [
      {
        icon: 'mdi:domain',
        label: 'แผนก',
        value: s.departmentName ?? '—',
        muted: !s.departmentName,
      },
      { icon: 'mdi:map-marker-outline', label: 'สถานที่', value: s.location },
      // null = ของกลาง ไม่ใช่ข้อมูลขาด — ต้องเขียนให้ต่างจากช่องที่ยังไม่ได้กรอก
      {
        icon: 'mdi:account-outline',
        label: 'ผู้ถือครอง',
        value: s.employeeName ?? 'ไม่ระบุ (ของกลาง)',
        muted: !s.employeeName,
      },
    ],
  ]
})

/** แท็บที่เลือกได้ของชิ้นนี้ — ชิ้นที่ปิดถาวรแล้วทำได้อย่างเดียวคือปลดการปิด */
const availableActions = computed<SlotAction[]>(() => {
  if (!target.value) return []
  if (target.value.slot.displayStatus === 'cancelled') return ['uncancel']
  // ตีกลับซ้ำไม่ได้ (backend ตอบ 409) — ซ่อนแท็บไปเลยดีกว่าปล่อยให้กดแล้วเจอ error
  return target.value.slot.displayStatus === 'rejected'
    ? ['register', 'cancel']
    : ['register', 'reject', 'cancel']
})

/** ตีกลับชิ้นที่ออกเลขแล้ว = เลขจะถูกล้าง — ตัวตัดสินว่าจะขึ้นคำเตือนแทนคำอธิบายปกติ
 *  ปิดถาวรไม่เข้าเงื่อนไขนี้ เพราะเก็บเลขไว้ ปลดการปิดแล้วได้คืนเหมือนเดิม */
const clearsAssetNumber = computed(
  () => action.value === 'reject' && Boolean(target.value?.slot.assetNumber),
)

const canSave = computed(() => {
  // ไม่ถือ lock = กดไม่ได้ทุกกรณี (backend ก็ปฏิเสธอยู่แล้ว ตรงนี้กันไม่ให้เสียเวลากรอก)
  if (!editable.value) return false
  if (action.value === 'register') return ASSET_NUMBER_REGEX.test(assetNumber.value)
  if (action.value === 'uncancel') return true
  return reason.value.trim().length > 0
})

function openSlotAction(round: RoundGroup, slot: FlatSlot) {
  target.value = { round, slot }
  lightboxOpen.value = false
  // ชิ้นที่ถูกตีกลับอยู่ ออกเลขไม่ได้จนกว่าผู้ขอจะแก้ — เปิดมาที่แท็บที่กดได้จริงแทน
  action.value =
    slot.displayStatus === 'cancelled'
      ? 'uncancel'
      : slot.displayStatus === 'rejected'
        ? 'cancel'
        : 'register'
  // เติมเลขเดิมลงช่อง ไม่ใช่เปิดมาเป็นช่องว่าง — งานจริงคือ "แก้ตัวที่พิมพ์ผิด" ไม่ใช่พิมพ์ใหม่ทั้งเลข
  // และการเห็นเลขที่ลงไว้คือสิ่งแรกที่บัญชีต้องตรวจก่อนตัดสินใจว่าจะแก้ไหม
  assetNumber.value = slot.assetNumber ?? ''
  reason.value = ''
  saveError.value = ''
}

/**
 * แนบ/ถอด invoice เสร็จ → โหลด slots ใหม่แล้วชี้ invoiceRound ไปรอบตัวใหม่
 *
 * invoiceRound เป็น snapshot ที่ถ่ายไว้ตอนกดปุ่ม ไม่ได้ผูกกับ slots แบบ reactive
 * (มันมาจาก rounds ที่สร้าง object ใหม่ทุกครั้ง) ถ้าไม่ชี้ใหม่ ตัวเลขบนปุ่ม invoice
 * จะค้างของเดิมจนกว่าจะออกจากหน้า
 */
async function onInvoiceChanged() {
  const r = invoiceRound.value
  if (!r) return
  // ไฟล์ที่ถอดออกไปแล้วต้องคืน blob ทิ้ง ไม่งั้นตัวดูยังเปิดของที่ไม่อยู่ในรอบแล้วได้
  revokeInvoiceUrls()
  invoiceIndex.value = 0
  await loadSlots()
  invoiceRound.value = rounds.value.find((x) => x.grpoNo === r.grpoNo) ?? null
}

// ── ดู invoice เต็มจอ — ทางเดียวกับรูปสินทรัพย์ ไม่เปิดแท็บใหม่
//
// /uploads/:id/file อยู่หลัง authGuard เหมือนรูป จึงต้องดึงเป็น blob พร้อม token ก่อน
// (ยัดใน src/iframe ตรง ๆ ได้ 401) — แท็บใหม่ที่ชี้ blob: ยังทำให้หลุดจากงานที่ค้างอยู่
// ในกล่อง กลับมาต้องหาที่เดิมใหม่ทุกครั้ง จึงดูซ้อนบนกล่องแล้วปิดกลับมาที่ฟอร์มเดิมแทน
const invoiceUrls = ref<Record<string, string>>({})
const invoiceLoading = ref(false)
const invoiceError = ref('')

const currentInvoice = computed(() => invoiceRound.value?.invoices[invoiceIndex.value] ?? null)

/** ที่แนบได้มีแค่ pdf/jpg/png (ดู accept ของ InvoiceModal) — 'other' จึงเป็นของเก่าหรือของแปลก */
const invoiceKind = computed<'image' | 'pdf' | 'other'>(() => {
  const mime = currentInvoice.value?.mimeType ?? ''
  if (mime.startsWith('image/')) return 'image'
  return mime === 'application/pdf' ? 'pdf' : 'other'
})

function revokeInvoiceUrls() {
  for (const url of Object.values(invoiceUrls.value)) URL.revokeObjectURL(url)
  invoiceUrls.value = {}
}

async function loadInvoice(inv: InvoiceFile) {
  if (invoiceUrls.value[inv.id]) return
  invoiceLoading.value = true
  invoiceError.value = ''
  try {
    invoiceUrls.value[inv.id] = await invoiceBlobUrl(inv.id)
  } catch {
    invoiceError.value = 'โหลดไฟล์ invoice ไม่สำเร็จ'
  } finally {
    invoiceLoading.value = false
  }
}

/** ยังไม่มีไฟล์ในรอบ = ไม่มีอะไรให้ดู เปิดกล่องแนบไฟล์ไปเลยแทนที่จะโชว์จอว่าง */
function openInvoiceView(round: RoundGroup) {
  // เปลี่ยนรอบ = ไฟล์คนละชุด ต้องคืน blob ของรอบก่อนหน้า ไม่งั้นสะสมไว้จนออกจากหน้า
  if (invoiceRound.value && invoiceRound.value.grpoNo !== round.grpoNo) revokeInvoiceUrls()
  invoiceRound.value = round
  if (round.invoices.length === 0) {
    invoiceOpen.value = true
    return
  }
  invoiceIndex.value = 0
  invoiceError.value = ''
  invoiceViewOpen.value = true
  void loadInvoice(round.invoices[0]!)
}

/** ไปกล่องแนบ/ถอดไฟล์ — ต้องปิดตัวดูก่อน .modal ของ daisyUI อยู่ที่ z-999 ต่ำกว่าจอดำนี้ */
function openInvoiceManage() {
  invoiceViewOpen.value = false
  invoiceOpen.value = true
}

function showInvoice(i: number) {
  invoiceIndex.value = i
  invoiceError.value = ''
  const inv = invoiceRound.value?.invoices[i]
  if (inv) void loadInvoice(inv)
}

// ESC ปิดชั้นที่ซ้อนอยู่บนสุด — <dialog> ตัวนี้ไม่ได้เปิดด้วย showModal() จึงไม่มี ESC มาให้เอง
// กล่องจัดการไฟล์มี handler ของมันเอง ถ้าเปิดอยู่ให้มันจัดการไป ไม่งั้นปิดพรวดทีเดียวสองชั้น
function onEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || invoiceOpen.value) return
  if (invoiceViewOpen.value) invoiceViewOpen.value = false
  else if (lightboxOpen.value) lightboxOpen.value = false
}

function switchAction(next: SlotAction) {
  action.value = next
  // ล้าง error ของแท็บก่อนหน้า ไม่งั้นข้อความ "เลขซ้ำ" จะค้างอยู่บนหน้าจอตอนกดตีกลับ
  saveError.value = ''
}

async function onSave() {
  if (!target.value || !canSave.value) return
  saving.value = true
  saveError.value = ''
  try {
    const { slot } = target.value
    const text = reason.value.trim()

    // ออกเลขสำเร็จไม่ขึ้นข้อความอะไรบนหัวหน้าจอ — ผลของมันเห็นได้จากตัวเลข "x/y" กับป้าย
    // สถานะในตารางที่รีเฟรชท้ายฟังก์ชันนี้อยู่แล้ว
    if (action.value === 'register') {
      await assignAssetNumber(id.value, slot.assetId, assetNumber.value)
    } else if (action.value === 'reject') {
      await rejectAsset(id.value, slot.assetId, text)
    } else if (action.value === 'cancel') {
      await cancelAsset(id.value, slot.assetId, text)
    } else {
      await uncancelAsset(id.value, slot.assetId)
    }

    target.value = null
    await Promise.all([loadSlots(), loadHeader()])
  } catch (e) {
    // 409 เลขซ้ำ / ตีกลับซ้ำ / ออกเลขทับชิ้นที่ถูกตีกลับ / ไม่ได้ถือ lock แล้ว
    // — ข้อความจาก backend บอกครบแล้ว
    saveError.value = e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

// ── ปุ่มเดียว สองผลลัพธ์ (0018) ──────────────────────────────────────────────
//   ไม่มีชิ้นตีกลับ → ปิดงาน ใบหลุดจากคิว แจ้งเลขสินทรัพย์ให้ผู้ขอ
//   มีชิ้นตีกลับ    → ยังไม่จบ ใบอยู่ในคิวต่อ แจ้งผู้ขอว่าต้องแก้อะไรบ้าง
//
// เงื่อนไขเปิดปุ่มคือ pendingAssets (รอบัญชี) เท่านั้น ห้ามเอา rejectedAssets มารวม —
// ชิ้นที่ตีกลับรอผู้ขออยู่ ถ้าเอามานับด้วยปุ่มจะถูก disable ค้างจนกว่าผู้ขอจะแก้ แล้วเมลแจ้ง
// "มีรายการต้องแก้" จะไม่มีวันถูกส่งออกไปเลย
const confirming = ref(false)

/** ปุ่มนี้กดแล้วจะเกิดอะไร — ใช้ทั้งข้อความ สี และคำเตือนก่อนกด */
const willReject = computed(() => (header.value?.rejectedAssets ?? 0) > 0)

/** ออกเลขไปแล้วกี่ชิ้น — ต้องหักทั้งที่รอบัญชีและที่รอผู้ขอ ไม่งั้นชิ้นที่ตีกลับจะถูกนับว่าเสร็จ */
const registeredCount = computed(() => {
  const h = header.value
  return h ? h.totalAssets - h.pendingAssets - h.rejectedAssets : 0
})
const canConfirm = computed(
  () => Boolean(header.value) && header.value!.pendingAssets === 0 && editable.value && !confirming.value,
)

async function onConfirm() {
  if (!canConfirm.value) return
  confirming.value = true
  loadError.value = ''
  try {
    await confirmRegistration(id.value)

    // กดผ่านแล้วออกจากหน้านี้เสมอ ไม่ว่าเมลจะออกหรือไม่
    //
    // ผลของการกดถูกบันทึกลง DB ไปแล้วทุกกรณี ส่วนเมลที่ส่งไม่ออกถูกเก็บไว้ที่
    // completeNotifyError / rejectNotifyError ของใบนั้น — ไม่ได้หายไปไหน แค่ไม่เด้งขึ้นจอ
    // (ถ้าวันหลังอยากให้บัญชีเห็น ให้ทำเป็นคอลัมน์/ตัวกรองในหน้าคิว จะเห็นครบทุกใบทีเดียว
    //  ดีกว่าเด้งเป็นราย ๆ ตอนกด ซึ่งเห็นได้เฉพาะคนที่บังเอิญกดใบนั้น)
    //
    // ถือ lock ค้างอยู่หน้านี้เฉย ๆ จะบล็อกบัญชีคนอื่นที่อยากเข้ามาดู
    leave()
  } catch (e) {
    // 409: ยังตัดสินไม่ครบ / ปิดงานไปแล้ว / แจ้งตีกลับไปแล้วยังไม่มีอะไรเปลี่ยน
    loadError.value = e instanceof ApiError ? e.message : 'ยืนยันไม่สำเร็จ'
  } finally {
    confirming.value = false
  }
}

// ── มีคนอื่นเปลี่ยนใบนี้ → โหลดใหม่เอง (ก้อนที่เราเป็นคนทำถูกกรองที่ presence.service แล้ว)
//
// ★ ห้ามโหลดทับตอนกล่องจัดการ/ตัวดูไฟล์เปิดอยู่: target กับ invoiceRound เป็น snapshot ที่
//   ถ่ายไว้ตอนกดเปิด (rounds สร้าง object ใหม่ทุกครั้งที่ slots เปลี่ยน) โหลดทับแล้วกล่องจะ
//   ชี้ของเก่าค้าง และเลข/เหตุผลที่พิมพ์ไว้ก็หายไปกลางทาง — ตั้งธงรอไว้แล้วโหลดตอนเขาปิดกล่อง
const busyWithInput = computed(
  () =>
    target.value !== null ||
    invoiceOpen.value ||
    invoiceViewOpen.value ||
    saving.value ||
    confirming.value,
)

let remoteTimer: ReturnType<typeof setTimeout> | undefined
let remotePending = false

/** รวบหลายก้อนเป็นการโหลดครั้งเดียว — บัญชีอีกฝั่งออกเลขทีละชิ้นรัว ๆ ได้ */
function scheduleRemoteRefresh() {
  if (remoteTimer) clearTimeout(remoteTimer)
  remoteTimer = setTimeout(() => {
    remoteTimer = undefined
    void refreshFromRemote()
  }, 400)
}

async function refreshFromRemote() {
  if (busyWithInput.value) {
    remotePending = true
    return
  }
  remotePending = false
  try {
    // ไม่แตะ loading — นี่ไม่ใช่การเปิดหน้า จอไม่ควรกระพริบเป็นสปินเนอร์เพราะคนอื่นกดปุ่ม
    await Promise.all([loadSlots(), loadHeader()])
  } catch (e) {
    // 404 = บัญชีคนอื่นกดยืนยันปิดใบนี้ไปแล้ว ใบหลุดจากคิว — บอกให้รู้ ดีกว่าปล่อยให้กรอกต่อ
    // บนข้อมูลที่ใช้ไม่ได้แล้ว (ปุ่มจะ 409 อยู่ดีตอนกด)
    loadError.value = e instanceof ApiError ? e.message : 'ใบนี้ถูกเปลี่ยนแปลงแล้ว โหลดใหม่ไม่สำเร็จ'
  }
}

// ปิดกล่องแล้วมีของค้างรอ → โหลดตอนนี้
watch(busyWithInput, (busy) => {
  if (!busy && remotePending) void refreshFromRemote()
})

/** ออกจากใบนี้ = ปล่อย lock ให้คิวถัดไปทันที ไม่ต้องรอ timeout */
function leave() {
  stopIdleTimer()
  closePresence()
  router.replace({ name: 'MainAssetRequest' })
}

onMounted(() => {
  document.addEventListener('keydown', onEscape)
  void loadAll()
})

onBeforeRouteLeave(() => {
  stopIdleTimer()
  closePresence()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onEscape)
  stopIdleTimer()
  closePresence()
  if (remoteTimer) clearTimeout(remoteTimer)
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
  revokeInvoiceUrls()
})
</script>

<template>
  <div class="min-h-screen bg-base-100 px-4 py-6 md:px-10 lg:px-20">
    <div class="flex items-start justify-between gap-4 text-left">
      <div>
        <h1 class="text-3xl font-semibold sm:text-4xl">ออกเลขสินทรัพย์</h1>
        <p class="text-base-content/70">กรอกเลขจาก SAP ทีละชิ้น ครบแล้วกดยืนยันเพื่อแจ้งผลกลับผู้ขอ</p>
      </div>
    </div>

    <!-- โหลดอยู่ -->
    <section v-if="loading" class="flex items-center justify-center gap-2 py-20 text-base-content/70">
      <span class="loading loading-spinner loading-md"></span>กำลังโหลดใบคำขอ...
    </section>

    <!-- เปิดใบไม่ได้ (ยืนยันไปแล้ว / id มั่ว) -->
    <section v-else-if="!header" class="py-20 text-center">
      <div role="alert" class="alert alert-error alert-soft mx-auto mb-4 max-w-md">
        <Icon icon="mdi:alert-circle-outline" class="size-5" />
        <span>{{ loadError || 'ไม่พบใบคำขอนี้ในคิวออกเลข' }}</span>
      </div>
      <button type="button" class="btn btn-primary" @click="leave">กลับหน้าคิว</button>
    </section>

    <template v-else>
      <!-- ── สถานะ lock: ต้องอยู่บนสุดเพราะมันตัดสินว่าทุกปุ่มข้างล่างกดได้ไหม -->
<!-- ลำดับที่ 1: ถ้ามี loadError จะแสดงอันนี้ก่อน และไม่แสดงอันอื่นเลย -->
<div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-4">
  <Icon icon="mdi:alert-circle-outline" class="size-5" />
  <span>{{ loadError }}</span>
</div>

<!-- ลำดับที่ 2: ถ้าไม่มี loadError เลย แต่มี lockBanner ถึงจะแสดงอันนี้ -->
<div v-else-if="lockBanner" role="alert" class="alert alert-warning alert-soft mt-4">
  <Icon icon="lucide:lock" class="size-5" />
  <span class="text-sm">{{ lockBanner }}</span>
</div>

      <!-- ── หัวใบ — ข้อมูลที่บัญชีต้องเห็นค้างไว้ตลอดขณะไล่กรอกทีละชิ้น -->
      <section class="mt-6">
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body text-left">
            <div class="flex w-full flex-wrap items-start justify-between gap-4">
              <div>
                <h2 class="card-title">รายละเอียดใบคำขอ</h2>
                <p class="text-sm text-base-content/70">ใบที่อนุมัติแล้ว รอออกเลขสินทรัพย์</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="badge badge-ghost whitespace-nowrap font-mono">Request No. #{{ header.requestId }}</span>
                <span class="badge whitespace-nowrap"
                  :class="header.pendingAssets > 0 ? 'badge-warning badge-soft' : 'badge-success badge-soft'">
                  ออกเลขแล้ว {{ registeredCount }}/{{ header.totalAssets }}
                </span>
                <!-- แยกป้ายกันชัด ๆ — ชิ้นที่รอผู้ขอแก้ไม่ใช่งานของบัญชี แต่ยังไม่จบเหมือนกัน -->
                <span v-if="header.rejectedAssets > 0" class="badge badge-warning badge-soft whitespace-nowrap gap-1">
                  <Icon icon="mdi:undo-variant" class="size-3.5" />
                  รอผู้ขอแก้ {{ header.rejectedAssets }} ชิ้น
                </span>
              </div>
            </div>

            <div class="mt-6 grid w-full gap-4 md:grid-cols-4">
              <div>
                <p class="text-sm text-base-content/50">PO Number</p>
                <p class="font-mono">{{ header.poNumber }}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">Vendor</p>
                <p>{{ header.vendorName ?? '—' }}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">ผู้ส่งคำขอ</p>
                <p>{{ header.submittedByName ?? '—' }}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">ผู้อนุมัติ</p>
                <p>{{ header.approvedByName ?? '—' }}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">ขอซื้อโดย</p>
                <p>{{ header.ownerPrName ?? '—' }}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">วันที่สร้าง PO</p>
                <!-- formatDate ไม่ใช่ formatDateTime — poDate เป็น date เปล่า ๆ จาก SAP
                     ไม่มีเวลาให้แสดง (ต่างจาก submittedAt/approvedAt ที่เป็น timestamp) -->
                <p>{{ header.poDate ? formatDate(header.poDate) : '—' }}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">วันที่ส่งคำขอ</p>
                <p>{{ formatDateTime(header.submittedAt) }}</p>
              </div>
              <div>
                <p class="text-sm text-base-content/50">วันที่อนุมัติ</p>
                <p>{{ formatDateTime(header.approvedAt) }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── รอบรับของ → รายชิ้น -->
      <section class="mt-6 space-y-4">
        <div v-for="round in rounds" :key="round.grpoNo">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <Icon icon="mdi:truck-delivery-outline" class="size-3.5" />
            <span class="font-mono text-sm font-medium">Grpo no. {{ round.grpoNo }}</span>
            <span class="text-xs text-base-content/60">{{ round.slots.length }} ชิ้น</span>

            <!-- invoice ของรอบ — 1 รอบมีได้หลายใบ และทุกชิ้นในรอบใช้ชุดเดียวกัน จึงอยู่ที่หัวรอบ
                 ไม่ใช่ในกล่องรายชิ้น: บัญชีเปิดใบกำกับอ่านเทียบราคา/S/N ก่อนเริ่มไล่ตรวจทั้งรอบ
                 ถ้าซ่อนไว้ในกล่องจะต้องเปิดชิ้นสักชิ้นก่อนถึงจะดูของที่เป็นของทั้งรอบได้
                 รอบที่ยังไม่มีไฟล์ ปุ่มนี้พาไปกล่องแนบไฟล์แทน — ดู openInvoiceView() -->
            <button type="button" class="btn btn-xs "
              :class="round.invoices.length ? 'btn-success btn-soft' : 'btn-ghost'" :title="round.invoices.length
                ? 'ดู invoice ' + round.invoices.length + ' ใบ'
                : 'ยังไม่มี invoice ในรอบนี้ — กดเพื่อแนบ'
                " @click="openInvoiceView(round)">
              <Icon icon="lucide:receipt-text" class="size-3.5" />
              invoice
              <span v-if="round.invoices.length" class="badge badge-xs badge-success">
                {{ round.invoices.length }}
              </span>
            </button>
          </div>

          <div class="overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm bg-base-100">
              <thead>
                <tr>
                  <th class="w-16 text-center">Unit</th>
                  <th class="w-20 text-center">Img</th>
                  <th>Description</th>
                  <th>Serial No.</th>
                  <th class="text-right">Acquisition</th>
                  <th>Location</th>
                  <th class="w-32 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in round.slots" :key="s.assetId">
                  <td class="text-center font-mono">{{ s.poLine }}.{{ s.unitNo }}</td>
                  <td class="text-center">
                    <!-- object-contain ไม่ใช่ cover — รูปสินทรัพย์ส่วนใหญ่ไม่ใช่จัตุรัส
                         cover จะขยายแล้วเฉือนขอบทิ้ง ซึ่งตัดส่วนที่ใช้ระบุของ (ป้าย/serial)
                         ออกพอดี พื้นหลัง base-200 ทำให้แถบว่างดูตั้งใจ ไม่ใช่รูปโหลดพลาด -->
                    <img v-if="s.imageId && imageUrls[s.imageId]" :src="imageUrls[s.imageId]"
                      class="mx-auto size-14 rounded bg-base-200 object-contain" alt="" />
                    <div v-else class="mx-auto grid size-14 place-items-center rounded bg-base-200">
                      <Icon icon="mdi:image-off-outline" class="size-4 opacity-40" />
                    </div>
                  </td>
                  <td class="truncate text-sm">{{ s.description }}</td>
                  <td class="font-mono text-sm">{{ s.serialNumber ?? '—' }}</td>
                  <td class="text-right font-mono text-sm">
                    {{ s.acquisitionCost.toLocaleString('th-TH') }} ฿
                  </td>
                  <td class="truncate">{{ s.location }}</td>
                  <!-- ปุ่มเดียว เปิดกล่องเดียว แล้วเลือกในนั้นว่าจะออกเลข/ตีกลับ/ปิดถาวร
                       ทั้งสามอย่างตัดสินจากข้อมูลชุดเดียวกัน (รูปเต็ม S/N ราคา สถานที่)
                       จึงต้องให้เห็นของจริงก่อนเสมอ ไม่ใช่ตัดสินจากตารางย่อ
                       ★ ไม่ disable ตอนไม่ได้ถือ lock — เปิดดูรายละเอียดยังต้องทำได้
                         ตัวที่ถูกปิดคือปุ่มยืนยันในกล่อง (canSave) -->
                  <td class="text-center">
                    <button
                      class="btn btn-outline btn-xs"
                      :class="s.displayStatus === 'registered' ? 'btn-success' : 'btn-info'"
                      @click="openSlotAction(round, s)">
                      {{ s.displayStatus === 'registered' ? 'Registered' : 'Register' }}
                    </button>
                    <div class="space-y-1 text-center">
                      <span v-if="s.displayStatus === 'cancelled'" class="badge badge-error badge-sm">
                        ปิดถาวร
                      </span>
                      <span v-else-if="s.displayStatus === 'rejected'"
                        class="badge badge-warning badge-soft badge-sm">
                        ตีกลับแล้ว
                      </span>
                      <!-- ชิ้นที่เคยสั่งให้แก้ แล้วผู้ขอแก้กลับมาแล้ว (ยังไม่ได้ออกเลข)
                           ต้องเห็นจากตาราง ไม่งั้นบัญชีแยกไม่ออกจากชิ้นปกติที่ไม่เคยมีปัญหา
                           แล้วจะออกเลขให้โดยไม่ได้ตรวจซ้ำว่าแก้ตามที่สั่งไปจริงไหม -->
                      <span v-else-if="s.rejectFixed" class="badge badge-info badge-soft badge-sm gap-1"
                        title="ผู้ขอแก้ข้อมูลตามที่ตีกลับไปแล้ว — ตรวจซ้ำก่อนออกเลข">
                        <Icon icon="mdi:check-decagram-outline" class="size-3.5" />
                        แก้ไขแล้ว
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p v-if="rounds.length === 0" class="py-10 text-center text-sm text-base-content/50">
          ไม่มีรายการในใบนี้
        </p>
      </section>

      <!-- ── ยืนยันทั้งใบ — ปุ่มเดียวของงานนี้ กดได้เมื่อบัญชีตัดสินครบทุกชิ้นแล้ว
           ข้อความ/สีเปลี่ยนตามผลที่จะเกิด เพราะสองอย่างนี้ต่างกันคนละเรื่อง:
           ปิดงาน = ใบจบ แก้อะไรไม่ได้อีก / แจ้งตีกลับ = ส่งงานกลับไปให้ผู้ขอแก้ ใบยังอยู่ -->
      <footer class="mt-6 flex flex-wrap items-center justify-end gap-3 pb-10">
        <button type="button" class="btn btn-ghost" @click="leave">ออก</button>
        <button type="button" class="btn" :class="willReject ? 'btn-warning' : 'btn-primary'"
          :disabled="!canConfirm"
          :title="!editable
            ? 'ต้องเป็นผู้ที่กำลังแก้ไขใบนี้จึงจะกดได้'
            : header.pendingAssets > 0
              ? `เหลืออีก ${header.pendingAssets} ชิ้นที่บัญชียังไม่ได้ตัดสิน`
              : willReject
                ? 'ส่งรายการที่ต้องแก้กลับไปให้ผู้ขอ'
                : 'ปิดงานและแจ้งเลขสินทรัพย์ให้ผู้ขอ'" @click="onConfirm">
          <span v-if="confirming" class="loading loading-spinner loading-xs" />
          <Icon v-else :icon="willReject ? 'mdi:undo-variant' : 'mdi:check-circle-outline'" class="size-4" />
          {{ willReject ? 'แจ้งผู้ขอให้แก้ไข' : 'ยืนยันและแจ้งผลกลับผู้ขอ' }}
        </button>
      </footer>
    </template>

    <!-- กล่องออกเลข — โชว์รายละเอียดทั้งชิ้นพร้อมรูปเต็ม ให้ตรวจก่อนผูกเลขที่แก้ทีหลังยาก
         (เลขสินทรัพย์เข้าทะเบียน SAP แล้วเปลี่ยนฝั่งเดียวไม่ได้ ต้องแก้ที่ SAP ด้วย) -->
    <dialog class="modal" :class="{ 'modal-open': target !== null }">
      <!-- p-0 + flex-col: หัวกล่องกับแถวปุ่มตรึงไว้ ให้เลื่อนเฉพาะเนื้อหาตรงกลาง
           กล่องนี้สูงเกินจอบนโน้ตบุ๊กเสมอ ถ้าปล่อยให้ทั้งกล่องเลื่อน ปุ่ม "ปิดถาวร"
           กับเลขชิ้นที่กำลังตัดสินใจจะหลุดจอไปคนละทาง -->
      <div v-if="target && header" class="modal-box flex max-h-[88dvh] max-w-3xl flex-col overflow-hidden p-0">
        <!-- ── หัวกล่อง: ชิ้นไหน + ตอนนี้อยู่สถานะอะไร -->
        <div class="flex items-start justify-between gap-3 border-b border-base-300 px-5 py-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="grid size-10 shrink-0 place-items-center rounded-box bg-base-200">
              <Icon icon="mdi:cube-scan" class="size-5 opacity-70" />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg leading-tight font-semibold">จัดการสินทรัพย์รายชิ้น</h3>
                <span v-if="slotStatus" class="badge badge-sm gap-1" :class="slotStatus.class">
                  <Icon :icon="slotStatus.icon" class="size-3.5" />
                  {{ slotStatus.label }}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="badge badge-neutral badge-soft badge-sm gap-1 font-mono">
                  <Icon icon="mdi:file-document-outline" class="size-3.5" />#{{ header.requestId }}
                </span>
                <span class="badge badge-soft badge-sm gap-1 font-mono">
                  <Icon icon="mdi:cart-outline" class="size-3.5" />PO {{ header.poNumber }}
                </span>
                <span class="badge badge-soft badge-sm gap-1 font-mono">
                  <Icon icon="mdi:truck-delivery-outline" class="size-3.5" />GRPO
                  {{ target.round.grpoNo }}
                </span>
                <span class="badge badge-ghost badge-sm gap-1 font-mono">ชิ้นที่
                  {{ target.slot.poLine }}.{{ target.slot.unitNo }}
                </span>
              </div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm btn-circle shrink-0" :disabled="saving" @click="target = null">
            <Icon icon="mdi:close" class="size-5" />
          </button>
        </div>

        <!-- ── เนื้อหา (ส่วนที่เลื่อนได้) -->
        <div class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <!-- ไม่ได้ถือ lock = กล่องนี้เป็นโหมดอ่านอย่างเดียว ต้องบอกในกล่องด้วย ไม่ใช่แค่บนหน้า
               (คนเปิดกล่องมาแล้วเห็นปุ่มจางโดยไม่มีคำอธิบายจะนึกว่าระบบพัง) -->
          <div v-if="!editable" role="alert" class="alert alert-warning alert-soft items-start">
            <Icon icon="lucide:lock" class="size-5 shrink-0" />
            <span class="text-sm">{{ lockBanner }}</span>
          </div>

          <!-- เหตุผลที่ชิ้นนี้ค้าง — ขึ้นก่อนทุกอย่างเพราะมันคือสาเหตุที่กล่องนี้ถูกเปิด -->
          <div v-if="blockedReason" role="alert" class="alert alert-soft items-start" :class="blockedReason.class">
            <Icon :icon="blockedReason.icon" class="size-5 shrink-0" />
            <div class="min-w-0">
              <div class="text-sm font-medium">{{ blockedReason.title }}</div>
              <div class="text-sm break-words opacity-80">{{ blockedReason.text }}</div>
            </div>
          </div>

          <!-- รูป | การดำเนินการ — ตัดสินใจโดยเห็นของอยู่ข้าง ๆ ไม่ต้องเลื่อนสลับไปมา -->
          <div class="grid gap-4 md:grid-cols-2">
            <!-- ── รูป — object-cover ตรงนี้เพราะเป็นแค่ภาพนำสายตาให้รู้ว่าชิ้นไหน
                 ส่วนการตรวจ S/N บนตัวเครื่องทำในโหมดเต็มจอซึ่งเป็น contain ไม่มีอะไรถูกเฉือน -->
            <div class="relative h-52 overflow-hidden rounded-box bg-base-200 md:h-auto md:min-h-52">
              <button v-if="target.slot.imageId && imageUrls[target.slot.imageId]" type="button"
                class="group absolute inset-0 block h-full w-full cursor-zoom-in" title="กดเพื่อดูรูปเต็มจอ"
                @click="lightboxOpen = true">
                <img :src="imageUrls[target.slot.imageId]" alt="รูปสินทรัพย์"
                  class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                <span
                  class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Icon icon="lucide:maximize-2" class="size-3.5" />
                  กดเพื่อดูเต็มจอ
                </span>
              </button>
              <div v-else class="absolute inset-0 grid place-items-center text-base-content/40">
                <div class="text-center">
                  <Icon icon="mdi:image-off-outline" class="mx-auto size-8" />
                  <p class="mt-1 text-xs">ไม่มีรูป</p>
                </div>
              </div>
              <!-- ปุ่มมุมขวา: จอสัมผัสไม่มี hover ป้ายข้างล่างจึงไม่โผล่ ต้องมีสัญลักษณ์ค้างไว้ -->
              <span v-if="target.slot.imageId && imageUrls[target.slot.imageId]"
                class="pointer-events-none absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-base-100/80 text-base-content shadow-sm backdrop-blur-sm">
                <Icon icon="lucide:maximize-2" class="size-3.5" />
              </span>
            </div>

            <!-- ── การดำเนินการ -->
            <div class="flex flex-col rounded-box border border-base-300 bg-base-200/60 p-3">
              <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60">
                <Icon icon="mdi:gesture-tap-button" class="size-4" />
                การดำเนินการ
              </div>

              <div role="tablist" class="tabs tabs-box tabs-sm mt-2 bg-base-100">
                <button v-for="a in availableActions" :key="a" type="button" role="tab" class="tab gap-1"
                  :class="{ 'tab-active': action === a }" :disabled="saving" @click="switchAction(a)">
                  <Icon :icon="ACTION_META[a].icon" class="size-4" />
                  {{ ACTION_META[a].tab }}
                </button>
              </div>

              <!-- ออกเลข = ช่องเลข / ตีกลับกับปิดถาวร = ช่องเหตุผล (บังคับกรอกทั้งคู่)
                   ปลดการปิดไม่ต้องกรอกอะไร เป็นการย้อนคำสั่งเดิม ไม่ใช่คำสั่งใหม่ -->
              <fieldset class="fieldset mt-1">
                <AppAssetNumberInput v-if="action === 'register'" v-model="assetNumber"
                  :disabled="saving || !editable" @enter="onSave" />
                <template v-else-if="action !== 'uncancel'">
                  <textarea v-model="reason" class="textarea w-full"
                    :class="action === 'cancel' ? 'textarea-error' : 'textarea-warning'" rows="3" maxlength="500"
                    :disabled="saving || !editable" placeholder="ระบุเหตุผล (จำเป็น)"></textarea>
                  <div class="label justify-end font-mono text-xs">{{ reason.length }}/500</div>
                </template>

                <!-- ตีกลับชิ้นที่มีเลขแล้ว = เลขถูกล้าง (ck_asset_reject_only_draft ไม่ยอมให้ชิ้น
                     ที่ยังถือเลขอยู่มีสถานะตีกลับ) — เขียนทับคำอธิบายปกติไปเลย ไม่ใช่ขึ้นกล่องเตือน
                     เพิ่มอีกใบ: ตำแหน่งนี้คือที่ที่ผู้ใช้อ่านอยู่แล้วก่อนกดยืนยัน -->
                <p class="label flex w-full max-w-full items-start gap-1.5 break-words whitespace-normal" :class="clearsAssetNumber ? 'text-warning' : action === 'cancel' ? 'text-error' : ''
                  ">
                  <Icon :icon="clearsAssetNumber ? 'mdi:alert-outline' : ACTION_META[action].hintIcon"
                    class="mt-0.5 size-4 shrink-0" />
                  <span v-if="clearsAssetNumber">
                    ชิ้นนี้มีเลข
                    <span class="font-mono font-medium">{{ target.slot.assetNumber }}</span>
                    อยู่ ตีกลับแล้วเลขจะถูกล้าง ต้องออกเลขใหม่เมื่อผู้ขอแก้กลับมา
                  </span>
                  <span v-else>{{ ACTION_META[action].hint }}</span>
                </p>
              </fieldset>
            </div>
          </div>

          <!-- ── QR ของสติกเกอร์ — โผล่เฉพาะชิ้นที่ออกเลขแล้ว (ไม่มีเลข = ไม่มีอะไรให้ชี้ถึง)
               ตีกลับเมื่อไหร่ backend ล้าง qrCode พร้อมเลข บล็อกนี้จึงหายไปเองโดยไม่ต้องเช็คซ้ำ -->
          <!-- <div v-if="target.slot.qrCode"
            class="flex flex-wrap items-center gap-4 rounded-box border border-base-300 bg-base-200/60 p-3">
            <img v-if="qrDataUrl" :src="qrDataUrl" :alt="`QR ของ ${target.slot.assetNumber}`"
              class="size-28 shrink-0 rounded bg-white p-1" />
            <div class="grid size-28 shrink-0 place-items-center rounded bg-base-300" v-else>
              <Icon icon="mdi:qrcode-remove" class="size-6 opacity-40" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase opacity-60">
                <Icon icon="mdi:qrcode" class="size-4" />
                QR สำหรับติดตัวเครื่อง
              </div>
              <p class="mt-1 font-mono text-xs break-all opacity-80">{{ target.slot.qrCode }}</p>
              <p class="mt-1 text-xs opacity-60">
                สแกนด้วยกล้องมือถือแล้วเปิดหน้าสินทรัพย์ของชิ้นนี้ — ถ้าตีกลับ QR จะถูกล้างพร้อมเลข
                สติกเกอร์ที่พิมพ์ไปแล้วจะใช้ไม่ได้
              </p>
            </div>
          </div> -->

          <!-- ── รายละเอียด — สองกองแยกซ้าย/ขวา (มือถือยุบเป็นกองเดียวไล่ซ้ายก่อนแล้วต่อขวา)
               ใช้ list ไม่ใช่การ์ดแยกใบ: เจ็ดใบเรียงติดกันอ่านเป็นเจ็ดก้อน ต้องกวาดตาทีละใบ
               ส่วน list มีเส้นคั่นบาง ๆ ในกล่องเดียว ไล่ลงมาทีเดียวจบ -->
          <div class="grid gap-3 sm:grid-cols-8">
            <ul v-for="(col, i) in detailColumns" :key="i" class="list rounded-box bg-base-200 py-1"
              :class="i === 0 ? 'sm:col-span-5' : 'sm:col-span-3'">
              <li v-for="d in col" :key="d.label" class="list-row items-start gap-2.5 px-3 py-2.5">
                <Icon :icon="d.icon" class="mt-0.5 size-4 opacity-50" />
                <div class="min-w-0">
                  <div class="text-xs tracking-wide uppercase opacity-60">{{ d.label }}</div>
                  <div :class="[d.mono ? 'font-mono' : '', d.muted ? 'opacity-60' : '']">
                    {{ d.value }}
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <div v-if="saveError" role="alert" class="alert alert-error alert-soft">
            <Icon icon="mdi:alert-circle-outline" class="size-5 shrink-0" />
            <span class="text-sm">{{ saveError }}</span>
          </div>
        </div>

        <!-- ── แถวปุ่ม (ตรึงล่าง) — เหลือแต่ปุ่มที่เปลี่ยนสถานะจริง
             invoice ย้ายไปอยู่หัวรอบในตารางแล้ว (เป็นของทั้งรอบ ไม่ใช่ของชิ้นนี้) -->
        <div class="flex items-center justify-end gap-2 border-t border-base-300 bg-base-100 px-5 py-3">
          <div class="flex gap-2">
            <button class="btn btn-ghost" :disabled="saving" @click="target = null">ยกเลิก</button>
            <!-- ปุ่มยืนยันปุ่มเดียว เปลี่ยนข้อความ/สีตาม action ที่เลือก — สีแดงของ "ปิดถาวร"
                 เป็นสัญญาณสุดท้ายก่อนกดสิ่งที่ผู้ใช้ทั่วไปย้อนเองไม่ได้ -->
            <button class="btn" :class="ACTION_META[action].btn" :disabled="!canSave || saving" @click="onSave">
              <span v-if="saving" class="loading loading-spinner loading-xs" />
              <Icon v-else :icon="ACTION_META[action].icon" class="size-4" />
              {{ ACTION_META[action].confirm }}
            </button>
          </div>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="target = null">close</button>
      </form>
    </dialog>

    <!-- รูปเต็มจอ — object-contain ไม่เฉือนอะไรทิ้ง เพราะนี่คือโหมดที่บัญชีใช้ซูมอ่าน S/N
         บนตัวเครื่องจริง กดที่ไหนก็ปิด (ทั้งพื้นหลังและปุ่ม) แล้วกลับมาที่ฟอร์มเดิม
         z สูงกว่า .modal ของ daisyUI เพราะมันซ้อนบนกล่องที่ยังเปิดอยู่ -->
    <div v-if="lightboxOpen && target?.slot.imageId && imageUrls[target.slot.imageId]"
      class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4" role="dialog"
      aria-label="รูปสินทรัพย์ขนาดเต็ม" @click="lightboxOpen = false">
      <img :src="imageUrls[target.slot.imageId]" alt="รูปสินทรัพย์ขนาดเต็ม"
        class="max-h-full max-w-full rounded object-contain" />
      <button type="button" class="btn btn-circle btn-sm absolute top-4 right-4" aria-label="ปิดรูป"
        @click.stop="lightboxOpen = false">
        <Icon icon="mdi:close" class="size-5" />
      </button>
    </div>

    <!-- ── invoice เต็มจอ — โครงเดียวกับรูปสินทรัพย์ ซ้อนบนกล่องที่ยังเปิดอยู่ กดพื้นหลังหรือ ESC ปิด
         รูป = object-contain / PDF = iframe ทั้งคู่ดูจบในหน้านี้ ไม่เด้งแท็บใหม่
         (แท็บใหม่ทำให้หลุดจากฟอร์มที่กำลังกรอก กลับมาต้องไล่หาชิ้นเดิมใหม่ทุกครั้ง) -->
    <div v-if="invoiceViewOpen && invoiceRound" class="fixed inset-0 z-[1000] flex flex-col gap-3 bg-black/80 p-4"
      role="dialog" aria-label="ดู invoice ของรอบรับของ" @click="invoiceViewOpen = false">
      <div class="flex items-center justify-between gap-3 text-white" @click.stop>
        <div class="flex min-w-0 items-center gap-2">
          <Icon icon="lucide:receipt-text" class="size-5 shrink-0" />
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{{ currentInvoice?.originalName ?? '—' }}</div>
            <div class="font-mono text-xs opacity-70">
              GRPO {{ invoiceRound.grpoNo }} · {{ invoiceIndex + 1 }}/{{
                invoiceRound.invoices.length
              }}
            </div>
          </div>
          <button type="button" class="btn btn-sm ml-4" @click="openInvoiceManage">
            <Icon icon="lucide:paperclip" class="size-4" />
            จัดการไฟล์
          </button>
        </div>
        <!-- ทางไปแนบ/ถอดไฟล์ — งานส่วนน้อยของหน้านี้ จึงเป็นปุ่มรอง ไม่ใช่สิ่งที่เจอตอนกด invoice -->
        <div class="flex shrink-0 items-center gap-2">
          <button type="button" class="btn btn-circle btn-sm" aria-label="ปิด" @click="invoiceViewOpen = false">
            <Icon icon="mdi:close" class="size-5" />
          </button>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 items-center justify-center">
        <span v-if="invoiceLoading" class="loading loading-spinner loading-lg text-white" />
        <div v-else-if="invoiceError" role="alert" class="alert alert-error max-w-sm" @click.stop>
          <Icon icon="mdi:alert-circle-outline" class="size-5 shrink-0" />
          <span class="text-sm">{{ invoiceError }}</span>
        </div>
        <img v-else-if="invoiceKind === 'image' && currentInvoice && invoiceUrls[currentInvoice.id]"
          :src="invoiceUrls[currentInvoice.id]" alt="invoice ขนาดเต็ม"
          class="max-h-full max-w-full rounded bg-white object-contain" @click.stop />
        <!-- toolbar=0: ซ่อนแถบเครื่องมือของ pdf viewer ที่มีปุ่มดาวน์โหลด/เปิดแท็บ ซึ่งพาออกจากหน้านี้ -->
        <iframe v-else-if="invoiceKind === 'pdf' && currentInvoice && invoiceUrls[currentInvoice.id]"
          :src="`${invoiceUrls[currentInvoice.id]}#toolbar=0&navpanes=0`" class="h-full w-full rounded bg-white"
          title="invoice pdf" @click.stop />
        <div v-else class="rounded-box bg-base-100 px-6 py-5 text-center" @click.stop>
          <Icon icon="lucide:file" class="mx-auto size-8 opacity-50" />
          <p class="mt-2 text-sm">ไฟล์ชนิดนี้แสดงตัวอย่างไม่ได้</p>
          <p class="text-xs opacity-60">{{ currentInvoice?.originalName }}</p>
        </div>
      </div>

      <!-- สลับใบ — 1 รอบแนบได้หลายใบ ทุกชิ้นในรอบใช้ชุดเดียวกัน -->
      <div v-if="invoiceRound.invoices.length > 1" class="flex flex-wrap justify-center gap-1.5" @click.stop>
        <button v-for="(inv, i) in invoiceRound.invoices" :key="inv.id" type="button" class="btn btn-xs max-w-48"
          :class="i === invoiceIndex ? 'btn-primary' : 'btn-neutral'" @click="showInvoice(i)">
          <Icon :icon="inv.mimeType === 'application/pdf' ? 'lucide:file-text' : 'lucide:file-image'"
            class="size-3.5 shrink-0" />
          <span class="truncate">{{ inv.originalName }}</span>
        </button>
      </div>
    </div>

    <!-- @changed: แนบ/ถอด invoice แล้วต้องโหลด slots ใหม่ ไม่งั้นตัวเลขบนปุ่มค้างของเดิม
         อยู่นอก v-for ของรอบโดยตั้งใจ — เป็น overlay ตัวเดียว ถ้าเรนเดอร์ในลูปจะได้กล่อง
         เท่าจำนวนรอบซ้อนกันอยู่ในหน้า ตัวไหนเปิดอยู่ก็แยกไม่ออก -->
    <InvoiceModal v-if="invoiceRound && invoiceOpen" :open="true" :grpo-id="invoiceRound.grpoId"
      :grpo-no="invoiceRound.grpoNo" :invoices="invoiceRound.invoices" @update:open="invoiceOpen = false"
      @changed="onInvoiceChanged" />
  </div>
</template>
