// stores/attachmentStore.ts
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