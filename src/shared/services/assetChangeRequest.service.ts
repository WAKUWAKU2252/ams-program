// ═══ คำขอย้ายสถานที่ / เปลี่ยนผู้ครอบครอง ═══
//
// flow: ผู้ใช้ส่งคำขอ -> บัญชีเห็นในคิว -> บัญชี key ที่ SAP + กดปุ่ม -> AMS เขียนค่าจริง
//       -> sync รอบถัดไปทับด้วยค่าจาก SAP
//
// ★ ผู้ใช้แก้ค่าเองไม่ได้แล้ว - ปุ่มแก้ตรงถูกแทนที่ด้วยปุ่ม "ขอ..." ทั้งหมด
import { request } from './httpClient'
import type { Paginated } from './master.service'

export type ChangeKind = 'LOCATION' | 'HOLDER'
export type ChangeStatus = 'SUBMITTED' | 'DONE' | 'REJECTED'

export interface ChangeRequestRow {
  id: number
  kind: ChangeKind
  status: ChangeStatus
  assetId: number
  assetNumber: string | null
  assetDescription: string | null
  companyCode: string
  reason: string
  submittedAt: string
  appliedAt: string | null
  rejectedAt: string | null
  rejectReason: string | null
  fromLocationId: number | null
  toLocationId: number | null
  fromEmployeeId: number | null
  toEmployeeId: number | null
  /**
   * ชื่อสถานที่ปลายทาง - null บนใบชนิด HOLDER
   *
   * ★ มีแค่ชื่อ ไม่มีรหัส SAP โดยตั้งใจ - บัญชีเลือกจากชื่อในหน้าจอ SAP ไม่ได้คีย์รหัส
   *   (เคยส่งรหัสมาด้วยเพราะเข้าใจผิด แล้วไม่มีใครใช้)
   */
  toLocationName: string | null
  /** null บนใบ LOCATION **และ** บนใบ HOLDER ที่ขอให้ว่าง - แยกกันที่ `kind` */
  toEmployeeName: string | null
}

export interface SubmitBody {
  assetId: number
  kind: ChangeKind
  toLocationId?: number
  /** null = ขอให้ไม่มีผู้ถือครอง (คนละเรื่องกับ "ไม่ได้ส่งมา") */
  toEmployeeId?: number | null
  reason: string
}

export function submitChangeRequest(body: SubmitBody) {
  return request<ChangeRequestRow>('/asset-change-requests', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function qs(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** ใบของฉัน - backend ล็อกที่ token ไม่ต้องส่ง userId */
export function listMyChangeRequests(
  params: { kind?: ChangeKind; status?: ChangeStatus; page?: number; limit?: number } = {},
) {
  return request<Paginated<ChangeRequestRow>>(`/asset-change-requests${qs(params)}`)
}

/** คิวของบัญชี - ค่าตั้งต้นฝั่ง backend คือใบที่ยังค้าง */
export function listChangeRequestQueue(
  params: {
    kind?: ChangeKind
    status?: ChangeStatus
    companyCode?: string
    page?: number
    limit?: number
  } = {},
) {
  return request<Paginated<ChangeRequestRow>>(`/asset-change-requests/queue${qs(params)}`)
}

/**
 * บัญชีกด "ทำแล้ว" - ไม่มี body โดยตั้งใจ
 *
 * ค่าที่จะเขียนมาจากใบฝั่ง backend บัญชีจึงไม่มีทางเขียนค่าที่ไม่ตรงกับที่ผู้ขอขอไว้
 */
export function applyChangeRequest(id: number) {
  return request<{ id: number; status: 'DONE' }>(`/asset-change-requests/${id}/apply`, {
    method: 'POST',
  })
}

export function rejectChangeRequest(id: number, reason: string) {
  return request<{ id: number; status: 'REJECTED' }>(`/asset-change-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

/** ใบที่ยังค้างของชิ้นหนึ่ง - ใช้ปิดปุ่ม "ขอ..." ไม่ให้กดซ้ำแล้วไปเจอ 409 */
export function openChangeRequestsFor(assetId: number) {
  return request<{ id: number; kind: ChangeKind }[]>(`/asset-change-requests/open/${assetId}`)
}
