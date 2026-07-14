// services/attachmentApi.ts
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