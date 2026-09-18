// ═══ กระดิ่งแจ้งเตือน - ทางคุยกับ /notifications ทั้งหมด ═══
//
// ★ ไม่มีเส้นไหนรับ userId - ผู้รับมาจาก token ฝั่ง backend เสมอ ถ้าวันไหนมีพารามิเตอร์
//   userId โผล่ในไฟล์นี้ แปลว่ามีคนเปิดช่องให้อ่านกระดิ่งของคนอื่น
import { request } from './httpClient'

/** ต้องตรงกับ notification_kind ฝั่ง DB - ใช้เลือกไอคอน */
export type NotificationKind =
  | 'REQUEST_SUBMITTED_ACK'
  | 'REQUEST_SUBMITTED_APPROVER'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_COMPLETED'
  | 'ASSET_PIECE_REJECTED'
  | 'ASSET_PIECE_CANCELLED'
  | 'CHANGE_REQUEST_SUBMITTED'
  | 'CHANGE_REQUEST_DONE'
  | 'CHANGE_REQUEST_REJECTED'
  | 'NOTIFY_FAILED'

export interface NotificationItem {
  id: number
  kind: NotificationKind
  title: string
  body: string | null
  /** path ในแอป - backend การันตีว่าไม่มีโดเมน ใช้กับ router.push ได้ตรง ๆ */
  linkPath: string | null
  /** null = ยังไม่อ่าน */
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  items: NotificationItem[]
  total: number
  /** จำนวนที่ยังไม่อ่าน - มาพร้อมลิสต์เพื่อให้ป้ายกับรายการเปลี่ยนพร้อมกัน ไม่กระพริบ */
  unread: number
}

export function listNotifications(params: { page?: number; limit?: number } = {}) {
  const q = new URLSearchParams()
  if (params.page) q.set('page', String(params.page))
  if (params.limit) q.set('limit', String(params.limit))
  const qs = q.toString()
  return request<NotificationList>(`/notifications${qs ? `?${qs}` : ''}`)
}

/**
 * เลขบนป้าย - เส้นแยกจากลิสต์โดยตั้งใจ
 *
 * หน้าจอเรียกตัวนี้บ่อยกว่ามาก (ทุกครั้งที่ได้สัญญาณจากสาย SSE) ส่วนลิสต์เรียกเฉพาะตอน
 * กดเปิดกระดิ่ง - ยิงเส้นเดียวกันแปลว่าดึงข้อความมาทิ้งทุกครั้ง
 */
export function fetchUnreadCount() {
  return request<{ unread: number }>('/notifications/unread-count')
}

/** มาร์คหลายใบทีเดียว - เปิดกระดิ่งหนึ่งครั้งถือว่าอ่านทุกใบที่เห็น */
export function markNotificationsRead(ids: number[]) {
  return request<{ updated: number }>('/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export function markAllNotificationsRead() {
  return request<{ updated: number }>('/notifications/read-all', { method: 'POST' })
}
