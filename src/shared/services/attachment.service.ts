// services/attachment.service.ts
//
// ตัวแนบไฟล์ทั่วไป ผูกกับ upload module ของ backend (Elysia, prefix /uploads - ไม่มี /api นำหน้า)
//   POST   /uploads          multipart { entityKind, files } -> { files: [{ id, name, url, size }] }
//   GET    /uploads/:id/file เสิร์ฟไฟล์ (อยู่หลัง authGuard จึงต้องแนบ token → โหลดเป็น blob ดู fileBlobUrl)
//   DELETE /uploads/:id      -> { success: true }
//
// จังหวะการทำงาน: ไฟล์ถูกอัป "ทันทีที่เลือก" (ยังไม่มีเจ้าของ) แล้วฝั่งเจ้าของ (asset.imageId /
// grpo.invoiceId) มาชี้เข้ามาทีหลังตอน submit โดยใช้ id ที่ return กลับไป - ถ้าไม่ submit ไฟล์จะกำพร้า
// และ cleanupOrphans (backend) กวาดทิ้งหลัง 24 ชม.
//
// หมายเหตุ: การแนบ invoice ของรอบ GRPO ใช้ invoice.service.ts (มี link/unlink เข้ากับ grpo ให้ครบ)
import { request, BASE_URL } from './httpClient';
import { getToken } from './auth.token';

// ต้องตรงกับ pgEnum doc_type / uploadBody.entityKind ฝั่ง backend เป๊ะ
export type DocType = 'INVOICE' | 'ASSET_IMG';

export interface UploadResult {
  files: {
    id: string;
    name: string;
    // relative path '/uploads/:id/file' - ห้ามยัดใน <img src> ตรง ๆ (โดน 401) ให้ใช้ fileBlobUrl()
    url: string;
    size: number;
  }[];
}

/**
 * อัปโหลดไฟล์แนบ 1 ชนิด (INVOICE หรือ ASSET_IMG) ทันทีที่ผู้ใช้เลือก
 * - field ต้องชื่อ 'entityKind' และ 'files' ตรงกับ uploadBody ฝั่ง backend เป๊ะ
 * - append 'files' ซ้ำได้หลายรอบ = ส่งหลายไฟล์ใน field เดียว (ตรงกับ t.Files)
 * - "ห้าม" ตั้ง Content-Type เอง - browser ต้องเป็นคนแปะ multipart boundary (httpClient ไม่ยัด header นี้)
 */
export function uploadModuleFiles(entityKind: DocType, files: File[]): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('entityKind', entityKind);
  files.forEach((file) => formData.append('files', file));
  return request<UploadResult>('/uploads', { method: 'POST', body: formData });
}

/** soft delete ไฟล์แนบ - backend ไม่ลบไฟล์จริงทันที ปล่อย cleanupOrphans เก็บทีหลัง */
export function deleteUploadedFile(fileId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/uploads/${fileId}`, { method: 'DELETE' });
}

/**
 * โหลดไฟล์เป็น blob URL สำหรับแสดงใน <img src> / เปิดแท็บ - endpoint อยู่หลัง authGuard
 * จึงต้องแนบ token เอง (ใส่ URL ตรง ๆ จะได้ 401). ผู้เรียกต้อง URL.revokeObjectURL เองเมื่อเลิกใช้
 */
export async function fileBlobUrl(fileId: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/uploads/${fileId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

