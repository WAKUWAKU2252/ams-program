import { request } from './httpClient';
import type { PurchaseOrder, Paginated } from './purchaseOrder.service';

// ใบตอบแค่ "หัวหน้าอนุมัติจำนวนของรอบนี้แล้วหรือยัง" — จบที่ APPROVED
// REGISTERED/CANCELLED ถูกถอดใน 0014 ย้ายไปเป็น lifecycle ของ "ชิ้น" เพราะบัญชี
// ลงเลข/ตัดทิ้งทีละชิ้น ใบเดียวจึงมีทั้งชิ้นที่ลงแล้วและยังไม่ลงพร้อมกันได้เสมอ
export type AssetRequestStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

/** วงจรชีวิตของชิ้น — คนละแกนกับสถานะใบ */
export type AssetLifecycle = 'DRAFT' | 'REGISTERED' | 'CANCELLED';

export interface CreateDraftResponse {
  requestId: number;
  reused: boolean;
}

export interface AssetRequestRow {
  id: number;
  poNumber: string;
  status: AssetRequestStatus;
  createdBy: number;          // user id (audit) — ใช้ createdByName แสดงผล
  createdByName: string | null;   // คนเปิด draft ใน AMS
  ownerPrName: string | null;     // ผู้ขอซื้อจาก PO (OwnerPR) — คนละคนกับ createdByName
  updatedAt: string;
  assetCount?: number;
  /**
   * ชิ้นที่บัญชีตีกลับและยังไม่ได้แก้ (0 = ไม่มีอะไรค้าง)
   *
   * ใบที่โดนตีกลับรายชิ้นยังเป็น APPROVED — backend จึงส่งใบพวกนี้มาในลิสต์ด้วยแม้ตัวกรอง
   * จะมีแค่ DRAFT/REJECTED ไม่งั้นผู้ขอไม่มีทางเห็นงานที่รอตัวเองแก้
   *
   * เป็น "เหลือกี่ชิ้น" ไม่ใช่ "แก้ไปกี่ชิ้น" — พอแก้แล้ว backend ล้างธงตีกลับทิ้ง
   * จึงไม่มีข้อมูลว่าเคยถูกตีกลับมาก่อน (ตัวเลขจะลดลงเรื่อย ๆ จนใบหลุดจากลิสต์)
   */
  rejectedAssetCount?: number;
}

// lock ไม่ได้มาจาก backend response แล้ว — สถานะ lock มาจากสาย presence (presence.service)
export interface AssetRequestDetail extends AssetRequestRow {
  purchaseOrder: PurchaseOrder;
}

// identity มาจาก token (currentUser.id) — ไม่ส่ง createBy อีกต่อไป
export function createDraft(poNumber: string): Promise<CreateDraftResponse> {
  return request<CreateDraftResponse>('/asset-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poNumber }),
  });
}

// เปิดใบ = บันทึก opener + จับ lock (ถ้ามีสิทธิ์) → response มี lockState
export function getAssetRequest(id: number): Promise<AssetRequestDetail> {
  return request<AssetRequestDetail>(`/asset-requests/${id}`, { method: 'GET' });
}

export interface SubmitResult {
  id: number
  status: AssetRequestStatus
  /** แจ้งเข้า Teams สำเร็จไหม — false ไม่ได้แปลว่าส่งใบไม่สำเร็จ ใบเปลี่ยนสถานะไปแล้ว */
  notified: boolean
  /** เหตุผลที่แจ้งไม่ผ่าน (null เมื่อสำเร็จ) — backend บันทึกไว้ที่ notifyError ด้วย */
  notifyError: string | null
}

/**
 * ส่งคำขอเข้าอนุมัติ — แนบ updatedAt ที่โหลดมา (optimistic) โยน ApiError(409) ถ้าถูกแก้/เปลี่ยนสถานะ
 *
 * call เดียวจบ: เปลี่ยนสถานะ + แจ้ง Teams + บันทึกผลการแจ้ง
 * เดิมต้องยิง /teams/request-approval ต่อเองซึ่งขาดกลางคันได้ (ปิดเบราว์เซอร์ระหว่างสองขั้น
 * แล้วใบค้าง PENDING_APPROVAL โดยไม่มีใครได้รับแจ้ง และส่งซ้ำไม่ได้เพราะสถานะเปลี่ยนไปแล้ว)
 */
export function submitRequest(
  id: number,
  expectedUpdatedAt: string,
): Promise<SubmitResult> {
  return request(`/asset-requests/${id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUpdatedAt }),
  });
}

export interface ListDraftsParams {
  page?: number;
  limit?: number;
  status?: AssetRequestStatus | AssetRequestStatus[]; // หลายสถานะได้ (เช่น DRAFT + REJECTED)
}

export function listDrafts(params: ListDraftsParams = {}): Promise<Paginated<AssetRequestRow>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status) {
    // ส่งเป็น repeated param: ?status=DRAFT&status=REJECTED (backend รับ array)
    const statuses = Array.isArray(params.status) ? params.status : [params.status];
    statuses.forEach((s) => query.append('status', s));
  }

  const qs = query.toString();
  return request<Paginated<AssetRequestRow>>(`/asset-requests${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

// ── จำนวนชิ้นที่แจ้งเองต่อรอบรับของ (PO งานเหมา) ──
// ปกติจำนวนชิ้นที่ลงได้ = grpo_line.receivedQty จาก SAP แต่ PO ที่เปิดเป็น "งาน"
// (รับ 1 งาน = กล้อง 11 + NVR 1) หน่วยไม่ตรงกับจำนวนชิ้น จึงต้องให้คนแจ้งเองพร้อมเหตุผท

/** แจ้ง/แก้จำนวนชิ้นของรอบรับของหนึ่งรอบ — reason บังคับ (0 ได้ = รอบนี้ไม่เกิดสินทรัพย์) */
export function declareLine(
  requestId: number,
  grpoLineId: string,
  declaredQty: number,
  reason: string,
): Promise<{ requestId: number; grpoLineId: string; declaredQty: number; reason: string }> {
  return request(`/asset-requests/${requestId}/lines/${grpoLineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ declaredQty, reason }),
  });
}

/** ยกเลิกการแจ้ง กลับไปใช้จำนวนที่ SAP รับมา */
export function removeDeclaredLine(requestId: number, grpoLineId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/asset-requests/${requestId}/lines/${grpoLineId}`, {
    method: 'DELETE',
  });
}

// ── ขั้นบัญชี: ออกเลขสินทรัพย์ (FINANCE/ADMIN เท่านั้น) ──────────────────────
// หน่วยงานเป็น "ชิ้น" ไม่ใช่ "ใบ" เพราะเลขจาก SAP ทยอยออกทีละชิ้น
// ไม่มี endpoint 'ปิดใบ' — ใบจะกลายเป็น REGISTERED เองเมื่อชิ้นสุดท้ายได้เลข

/**
 * หนึ่งแถว = หนึ่งใบที่รอออกเลข (header ของตารางกาง)
 *
 * รายชิ้นไม่ได้มากับตัวนี้ — กางแล้วค่อยเรียก getAssetSlots(requestId) ต่อ
 * (เส้นเดียวกับหน้า Create New Asset ใช้)
 */
export interface PendingRegistrationRow {
  requestId: number
  poNumber: string
  submittedAt: string | null
  approvedAt: string | null
  submittedByName: string | null
  approvedByName: string | null
  vendorName: string | null
  ownerPrName: string | null
  /** วันที่บน PO จาก SAP (null = PO เก่าบางใบไม่มีวันที่ในต้นทาง) */
  poDate: string | null
  /** จำนวนชิ้นทั้งหมดในใบ (ไม่นับที่ถูกยกเลิก) */
  totalAssets: number
  /**
   * รอ "บัญชี" ตัดสิน (ยังไม่ออกเลข/ตีกลับ/ปิดถาวร) — 0 = กดปุ่มยืนยันได้แล้ว
   *
   * ไม่รวมชิ้นที่ถูกตีกลับ ซึ่งรอผู้ขออยู่คนละคน — รวมกันเมื่อไหร่ปุ่มยืนยันจะถูก disable
   * ค้างจนกว่าผู้ขอจะแก้ แล้วการแจ้ง "มีรายการต้องแก้" จะไปไม่ถึงผู้ขอเลย
   */
  pendingAssets: number
  /** รอ "ผู้ขอ" แก้ — > 0 แปลว่ากดปุ่มแล้วจะได้ผลลัพธ์ REJECTED ไม่ใช่ปิดงาน */
  rejectedAssets: number
  /**
   * ผู้ขอแก้ชิ้นที่ถูกตีกลับกลับมาแล้ว และยังไม่มีใครตรวจซ้ำ — ตัวจุดแดงบนปุ่มในหน้าคิว
   *
   * คนละเรื่องกับ rejectedAssets: ตัวนั้นคือ "ยังรอผู้ขอ" ตัวนี้คือ "ผู้ขอทำเสร็จแล้ว
   * ตาบัญชีต้องกลับไปตรวจ" — ไม่แยกสองตัวนี้ บัญชีจะไม่มีทางรู้ว่าใบไหนมีของใหม่รออยู่
   * นอกจากเปิดเข้าไปดูทีละใบ
   */
  fixedAssets: number
}

/** คิวใบที่รอออกเลข — เรียงตามวันอนุมัติ เก่าสุดอยู่บน */
export function listPendingRegistration(
  params: { page?: number; limit?: number } = {},
): Promise<Paginated<PendingRegistrationRow>> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  const qs = query.toString()
  return request<Paginated<PendingRegistrationRow>>(
    `/asset-requests/pending-registration${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  )
}

/**
 * หัวใบเดียวของคิวนี้ — หน้าฟอร์มออกเลขใช้โหลดข้อมูลหัวใบ
 *
 * ไม่ใช้ getAssetRequest (GET /:id) เพราะเส้นนั้นบันทึกคนเปิดเป็น "ผู้เปิดใบ" ให้ด้วย
 * แล้วใบจะไปโผล่ในลิสต์คำขอของบัญชี ทั้งที่บัญชีไม่ได้เป็นผู้ขอ
 *
 * 404 = ใบไม่อยู่ในคิวแล้ว (ยืนยันไปแล้ว/ถูกลบ) — หน้าฟอร์มเด้งกลับหน้าคิวได้เลย
 */
export function getPendingRegistration(requestId: number): Promise<PendingRegistrationRow> {
  return request<PendingRegistrationRow>(`/asset-requests/${requestId}/registration`, {
    method: 'GET',
  })
}

export interface AssignNumberResponse {
  asset: { id: number; assetNumber: string | null; lifecycle: AssetLifecycle }
  /** เหลืออีกกี่ชิ้นในใบนี้ที่ยังไม่มีเลข — ไว้โชว์ความคืบหน้าเฉย ๆ ใบไม่เปลี่ยนสถานะแล้ว */
  remaining: number
}

/**
 * ใส่เลขให้สินทรัพย์หนึ่งชิ้น
 *
 * โยน ApiError(409) เมื่อเลขซ้ำ — ข้อความจาก backend บอกว่าชนกับสินทรัพย์ id ไหน
 * มาจากทางไหน (SAP/AMS) และวันที่ได้มา เอาไปโชว์ตรง ๆ ได้เลย ผู้ใช้ต้องใช้ข้อมูลนั้น
 * ตัดสินว่าจะลบแถวที่ซ้ำทิ้งหรือกรอกเลขใหม่
 */
export function assignAssetNumber(
  requestId: number,
  assetId: number,
  assetNumber: string,
): Promise<AssignNumberResponse> {
  return request(`/asset-requests/${requestId}/assets/${assetId}/number`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetNumber }),
  })
}

export interface ConfirmResult {
  requestId: number
  /**
   * ผลของการกดปุ่ม — ปุ่มเดียวออกได้สองหน้า ขึ้นกับว่ามีชิ้นที่ตีกลับอยู่ไหม
   *   COMPLETE  ปิดงานแล้ว ใบหลุดจากคิว (แจ้งเลขสินทรัพย์ให้ผู้ขอ)
   *   REJECTED  ยังไม่จบ ใบอยู่ในคิวต่อ (แจ้งผู้ขอว่าต้องแก้อะไรบ้าง)
   */
  outcome: 'COMPLETE' | 'REJECTED'
  /** จำนวนชิ้นที่ผู้ขอต้องกลับมาแก้ — 0 เมื่อ outcome = COMPLETE */
  rejectedCount: number
  notified: boolean
  notifyError: string | null
  /** true = ล้มแบบลองใหม่ได้ (Teams ล่ม) กดซ้ำได้ / false = จบรอบแล้วแม้เมลจะไม่ออก */
  retryable: boolean
}

/**
 * บัญชีกด "ยืนยันและแจ้งกลับไปยังผู้ขอ" — ปุ่มเดียว สองผลลัพธ์ (ดู ConfirmResult.outcome)
 *
 * 409 เมื่อยังมีชิ้นที่บัญชีไม่ได้ตัดสิน / ปิดงานไปแล้ว / แจ้งตีกลับไปแล้วและยังไม่มีอะไรเปลี่ยน
 *
 * `notified: false` ไม่ใช่ error — งานถูกบันทึกแล้วแต่เมลไม่ออก (ผู้ขอไม่มีอีเมล หรือ Teams ล่ม)
 * ดู `retryable` ว่าเป็นเคสที่กดซ้ำแล้วช่วยได้ไหม
 */
export function confirmRegistration(id: number): Promise<ConfirmResult> {
  return request(`/asset-requests/${id}/confirm-registration`, { method: 'POST' })
}

/**
 * บัญชีตีกลับ "รายชิ้น" — ของมาถึงจริงและจะลงทะเบียน แต่ข้อมูลที่กรอกมาใช้ไม่ได้
 *
 * ต่างจาก cancelAsset ข้างล่างคนละเรื่อง: ตีกลับ = ผู้ขอแก้แล้วชิ้นเดิมกลับเข้าคิวเอง
 * (การแก้ล้างสถานะตีกลับให้เอง ไม่มีปุ่ม "ส่งกลับ" ให้ลืมกด) ส่วน cancel = ปิดช่องถาวร
 */
export function rejectAsset(
  requestId: number,
  assetId: number,
  reason: string,
): Promise<{ id: number; rejectedAt: string | null; rejectReason: string | null }> {
  return request(`/asset-requests/${requestId}/assets/${assetId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
}

/** ปลดการปิดถาวร — บัญชี/แอดมินเท่านั้น (คนที่ปิดได้เท่านั้นที่เปิดคืนได้) */
export function uncancelAsset(
  requestId: number,
  assetId: number,
): Promise<{ id: number; lifecycle: AssetLifecycle }> {
  return request(`/asset-requests/${requestId}/assets/${assetId}/uncancel`, { method: 'POST' })
}

/**
 * บัญชีปิดชิ้นถาวร — ของที่รับมาแล้วแต่จะไม่ลงทะเบียน (นับเกิน/ส่งคืน/ชำรุด)
 *
 * เป็น lifecycle ไม่ใช่การลบ: ต้องตอบย้อนหลังได้ว่าทำไมของที่รับมา 5 ชิ้นถึงลงทะเบียนแค่ 4
 * ★ ช่องที่ปิดแล้วไม่คืนให้ลงชิ้นทดแทน (ตั้งแต่ 0016) — ถ้าแค่อยากให้ผู้ขอกลับไปแก้ข้อมูล
 *   ต้องใช้ rejectAsset ไม่ใช่ตัวนี้ ปลดคืนได้ทางเดียวคือ uncancelAsset
 * ชิ้นที่ลงเลขไปแล้วยกเลิกที่นี่ไม่ได้ (อยู่ในทะเบียน SAP แล้ว) จะได้ 409 กลับมา
 */
export function cancelAsset(
  requestId: number,
  assetId: number,
  reason: string,
): Promise<{ id: number; lifecycle: AssetLifecycle }> {
  return request(`/asset-requests/${requestId}/assets/${assetId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
}

/**
 * เอาใบออกจากลิสต์ของตัวเอง — สิทธิ์เดียวที่ผู้ใช้มีกับใบคำขอ
 * ข้อมูลคำขอไม่ถูกแตะเลย คนอื่นยังทำต่อได้ และเปิดใบนั้นอีกครั้งก็กลับมาอยู่ในลิสต์
 */
export function leaveRequest(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/asset-requests/${id}/opener`, { method: 'DELETE' });
}
