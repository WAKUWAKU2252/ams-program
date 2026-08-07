// stores/attachmentStore.ts
//
// ═══ แผน refactor เป็น "วิธีที่ 2": เก็บใบทะเบียนจาก server ไม่เก็บ File object ═══
// แนวคิดเดิม (โค้ดข้างล่างนี้): ถือ File ไว้ในเครื่อง -> รอ submit ค่อยส่งทั้งก้อน (buildFormDataForSubmit)
// แนวคิดใหม่: เลือกไฟล์ปุ๊บ upload ขึ้น server ทันที -> store เก็บแค่ "ผลตอบกลับ" (id, name, url, size)
// ผลคือ File object หมดหน้าที่ทันทีที่ upload เสร็จ — ทุกอย่างหลังจากนั้นอ้างจาก server ล้วน ๆ
//
// STEP 1: เปลี่ยน type — ทิ้ง AttachedFile (extends File) ทั้งก้อน แล้วใช้:
//   interface UploadedFile { id: string; name: string; url: string; size: number }
//   - id   = attachment.id ใน DB — กุญแจที่จะรวมเป็น attachmentIds ตอน submit ฟอร์ม asset
//   - url  = path ไฟล์บน server ('/uploads/<id>/file')
//     preview รูปใช้ <img :src="BASE_URL + url"> ได้เลย (รูปถูกโหลดกลับจาก server)
//     -> ไม่ต้องใช้ URL.createObjectURL / revokeObjectURL อีก (ตัด previewUrl + logic revoke ทิ้ง)
//
// STEP 2: state — เปลี่ยน filesByModule เป็น
//   uploadedByModule: Record<string, UploadedFile[]>
//   (คง concept แยกตาม moduleKey ไว้ เช่น 'invoice' / 'assetImage' — สอดคล้อง entityKind ฝั่ง backend)
//
// STEP 3: actions ชุดใหม่
//   uploadFiles(moduleKey: string, files: File[]) — async
//     3.1 แปลง moduleKey -> entityKind: 'invoice' -> 'INVOICE', 'assetImage' -> 'ASSET_IMG'
//         (ทำเป็น map กลาง ๆ ไว้ตัวเดียว อย่า if/else กระจาย)
//     3.2 เรียก attachmentApi.uploadModuleFiles(...) -> ได้ { files: [...] } กลับมา
//     3.3 append ต่อท้าย state ของ module นั้น — ลำดับใน response ตรงกับลำดับไฟล์ที่ส่งเสมอ
//     3.4 ระหว่างรอ อาจมี state isUploading ไว้ disable ปุ่ม/โชว์ spinner
//   removeFile(moduleKey: string, id: string) — async
//     - เปลี่ยนจากลบด้วย index เป็นลบด้วย id (list re-render แล้ว index เพี้ยนได้ แต่ id ไม่มีวันชนกัน)
//     - ยิง attachmentApi.deleteUploadedFile(id) ให้สำเร็จก่อน แล้วค่อย filter ออกจาก state
//       (ถ้าเอาออกจาก state ก่อนแล้ว API พัง จะเกิดไฟล์ผี: หายจากจอแต่ยังอยู่บน server)
//   getter attachmentIdsFor(moduleKey): string[] — map เอาเฉพาะ id ไว้ยัดใส่ body ตอน POST /assets
//   clearAll() — เรียกหลัง submit สำเร็จ (เหลือแค่ล้าง object — ไม่มี objectURL ให้ revoke แล้ว)
//   buildFormDataForSubmit() — "ลบทิ้ง" ตอน submit ไม่มีไฟล์ให้ส่งอีกแล้ว มีแต่ attachmentIds
//
// เรื่อง refresh: state นี้หายเมื่อ refresh = พฤติกรรมที่ตั้งใจ (ผู้ใช้เริ่มฟอร์มใหม่ก็แนบใหม่)
// ขยะที่ค้างฝั่ง server (แถว entityId NULL + ไฟล์บน disk) เป็นหน้าที่ cleanupOrphans ของ backend
// ไม่ใช่หน้าที่ browser — ห้ามพยายามยิง DELETE ตอน beforeunload (เชื่อถือไม่ได้)
import { defineStore } from 'pinia';

// File ธรรมดา + previewUrl ที่เราแปะเพิ่มเข้าไปเอง (image preview)
export interface AttachedFile extends File {
  previewUrl?: string;
}

interface AttachmentState {
  filesByModule: Record<string, AttachedFile[]>;
}

export const useAttachmentStore = defineStore('attachments', {
  state: (): AttachmentState => ({
    filesByModule: {},
  }),

  getters: {
    getFiles:
      (state) =>
      (moduleKey: string): AttachedFile[] =>
        state.filesByModule[moduleKey] || [],

    // Handy for final submit: gather everything across every module at once
    allFiles: (state): { moduleKey: string; file: AttachedFile }[] => {
      return Object.entries(state.filesByModule).flatMap(([moduleKey, files]) =>
        files.map((file) => ({ moduleKey, file }))
      );
    },

    totalFileCount: (state): number =>
      Object.values(state.filesByModule).reduce((sum, arr) => sum + arr.length, 0),
  },

  actions: {
    addFiles(moduleKey: string, newFiles: AttachedFile[]): void {
      const existing = this.filesByModule[moduleKey] || [];
      this.filesByModule[moduleKey] = [...existing, ...newFiles];
    },

    removeFile(moduleKey: string, index: number): void {
      const existing = this.filesByModule[moduleKey] || [];
      this.filesByModule[moduleKey] = existing.filter((_, i) => i !== index);
    },

    clearModule(moduleKey: string): void {
      delete this.filesByModule[moduleKey];
    },

    clearAll(): void {
      Object.values(this.filesByModule).forEach((files) => {
        files.forEach((f) => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
      });
      this.filesByModule = {};
    },

    /**
     * Build one FormData containing every attached file across all modules,
     * tagged with their module key so the backend can route them
     * (e.g. to REQUEST -> GRPO -> GRPO_ITEM -> ASSET as per the AMS schema).
     */
    buildFormDataForSubmit(): FormData {
      const formData = new FormData();
      this.allFiles.forEach(({ moduleKey, file }) => {
        formData.append(`files[${moduleKey}]`, file);
      });
      return formData;
    },
  },
});