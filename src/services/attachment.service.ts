// services/attachment.service.ts
//
// ═══ แผนปรับให้ตรงกับ backend จริง (Elysia — prefix /uploads) ═══
// ไฟล์นี้เขียนเดา endpoint ไว้ก่อน backend เกิด (/api/upload/...) — ต้องจูนให้ตรงของจริง
//
// STEP 1: uploadModuleFiles — แก้ signature เป็น (entityKind, files) แล้วปรับ 3 จุด
//   1.1 path: '/api/upload/${moduleKey}' -> '/uploads' เฉย ๆ
//       (backend มี endpoint เดียว แยกชนิดไฟล์ด้วย field ใน body ไม่ใช่ด้วย path)
//   1.2 FormData ต้องมี 2 field ชื่อตรงกับ uploadBody ใน upload.schema.ts เป๊ะ:
//       formData.append('entityKind', entityKind)   // 'INVOICE' | 'ASSET_IMG'
//       files.forEach((f) => formData.append('files', f))  // ชื่อ 'files' ห้ามเพี้ยน
//       (append ชื่อเดิมซ้ำหลายรอบ = ส่งหลายไฟล์ใน field เดียว — ตรงกับ t.Files ฝั่งรับ)
//   1.3 "ห้าม" ใส่ header Content-Type เอง — browser ต้องเป็นคนแปะ boundary ให้
//       (โค้ดตอนนี้ไม่ได้ใส่ = ถูกแล้ว ระวังอย่าเผลอเพิ่มทีหลัง)
//
// STEP 2: UploadResult — shape ตรงกับ backend อยู่แล้ว ({ files: [{ id, name, url, size }] })
//   ไม่ต้องแก้ แต่จำไว้ว่า url เป็น path relative ('/uploads/xx/file')
//   คนเอาไปใช้ใน <img> ต้องประกอบ BASE_URL เอง (BASE_URL ควร export จาก httpClient จุดเดียว)
//
// STEP 3: deleteUploadedFile — แก้ path เป็น `/uploads/${fileId}`
//   (response { success: true } ตรงกับที่ backend ตอบอยู่แล้ว)
//
// STEP 4: ตัวที่ "ยังไม่มี backend รองรับ" — อย่าเพิ่งเรียกใช้ที่ไหน
//   - uploadAttachments (ส่งรวมทุก module ตอน submit) ขัดกับวิธีใหม่ (upload ทันทีที่เลือก)
//     -> รอลบทิ้งพร้อมตอน refactor store
//   - getAttachments (ถามไฟล์ของ record) จะใช้ได้จริงหลัง asset module ผูก entityId แล้ว
//     -> คง interface ไว้ก่อน แต่ path จริงค่อยกำหนดตอนทำ asset module
import { request } from './httpClient.ts';

export interface UploadResult {
  message?: string;
  files: {
    id: string;
    name: string;
    url: string;
    size: number;
  }[];
}

export interface AttachmentRecord {
  id: string;
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
}

/**
 * อัปโหลดไฟล์แนบทั้งหมด (ข้าม module) พร้อมกันครั้งเดียว
 * @param formData - จาก attachmentStore.buildFormDataForSubmit()
 */
export function uploadAttachments(formData: FormData): Promise<UploadResult> {
  return request<UploadResult>('/api/upload', {
    method: 'POST',
    body: formData,
  });
}

export function uploadModuleFiles(moduleKey: string, files: File[]): Promise<UploadResult> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  return request<UploadResult>(`/api/upload/${moduleKey}`, {
    method: 'POST',
    body: formData,
  });
}

export function deleteUploadedFile(fileId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/upload/${fileId}`, { method: 'DELETE' });
}

export function getAttachments(recordType: string, recordId: string): Promise<AttachmentRecord[]> {
  return request<AttachmentRecord[]>(`/api/attachments/${recordType}/${recordId}`, {
    method: 'GET',
  });
}