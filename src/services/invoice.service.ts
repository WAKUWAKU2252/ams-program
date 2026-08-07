// services/invoice.service.ts
//
// flow แนบ invoice ของ "รอบรับของ" (GRPO): อัปโหลดไฟล์ทันที → ผูกเข้ากับ grpo
//   1. POST /uploads (multipart, entityKind=INVOICE) -> ได้ attachmentId
//   2. PATCH /grpo/:id/invoice { attachmentId }        -> ผูกไฟล์เข้ารอบ
// ดูไฟล์ผ่าน GET /uploads/:id/file (ผ่าน authGuard จึงต้องแนบ token เอง → fetch เป็น blob)
import { request, BASE_URL } from './httpClient';
import { getToken } from './auth.token';

interface UploadResponse {
  files: { id: string; name: string; url: string; size: number }[];
}

/** อัปโหลดไฟล์ invoice → คืน attachmentId (ยังไม่ผูกกับใคร จนกว่าจะ link) */
export async function uploadInvoice(file: File): Promise<string> {
  const form = new FormData();
  // ชื่อ field ต้องตรงกับ uploadBody (entityKind / files) เป๊ะ — ห้ามใส่ Content-Type เอง
  // (browser ต้องเป็นคนแปะ boundary ให้ multipart)
  form.append('entityKind', 'INVOICE');
  form.append('files', file);
  const res = await request<UploadResponse>('/uploads', { method: 'POST', body: form });
  return res.files[0].id;
}

/** ผูก invoice ที่อัปโหลดแล้วเข้ากับรอบ GRPO */
export function linkGrpoInvoice(grpoId: number, attachmentId: string): Promise<unknown> {
  return request(`/grpo/${grpoId}/invoice`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attachmentId }),
  });
}

/** ถอด invoice ใบที่ระบุออกจากรอบ (1 รอบมีหลายใบ) — ไม่ลบไฟล์ทิ้ง cleanupOrphans จัดการเอง */
export function unlinkGrpoInvoice(grpoId: number, attachmentId: string): Promise<unknown> {
  return request(`/grpo/${grpoId}/invoice/${attachmentId}`, { method: 'DELETE' });
}

/** โหลดไฟล์ invoice เป็น blob URL (endpoint ผ่าน authGuard ต้องแนบ token) — ใช้ preview inline / เปิดแท็บ
 *  ผู้เรียกต้อง revokeObjectURL เองเมื่อเลิกใช้ */
export async function invoiceBlobUrl(attachmentId: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/uploads/${attachmentId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/** เปิดไฟล์ invoice ในแท็บใหม่ */
export async function openInvoiceFile(attachmentId: string): Promise<void> {
  const url = await invoiceBlobUrl(attachmentId);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
