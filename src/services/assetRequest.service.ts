import { request } from './httpClient';
import type { PurchaseOrder, Paginated } from './purchaseOrder.service';

export type AssetRequestStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'REGISTERED'
  | 'CANCELLED';

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
  requesterName: string | null;   // ผู้ขอซื้อจาก PO (คนละคนกับ createdByName)
  updatedAt: string;
  assetCount?: number;    
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

// ส่งคำขอเข้าอนุมัติ — แนบ updatedAt ที่โหลดมา (optimistic) โยน ApiError(409) ถ้าถูกแก้/เปลี่ยนสถานะ
export function submitRequest(
  id: number,
  expectedUpdatedAt: string,
): Promise<{ id: number; status: AssetRequestStatus }> {
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

/**
 * เอาใบออกจากลิสต์ของตัวเอง — สิทธิ์เดียวที่ผู้ใช้มีกับใบคำขอ
 * ข้อมูลคำขอไม่ถูกแตะเลย คนอื่นยังทำต่อได้ และเปิดใบนั้นอีกครั้งก็กลับมาอยู่ในลิสต์
 */
export function leaveRequest(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/asset-requests/${id}/opener`, { method: 'DELETE' });
}
