// composables/useFileAttachment.ts
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useAttachmentStore, type AttachedFile } from '@/stores/Attachmentstore';

export interface UseFileAttachmentOptions {
  acceptedTypes?: string[];
  maxSizeMB?: number;
  maxFiles?: number | null;
}

export interface UseFileAttachmentReturn {
  files: ComputedRef<AttachedFile[]>;
  error: Ref<string>;
  onFileChange: (event: Event) => void;
  onDrop: (event: DragEvent) => void;
  removeFile: (index: number) => void;
  clearAll: () => void;
  formatSize: (bytes: number) => string;
}

/**
 * Reusable file-attachment logic.
 * @param moduleKey - unique key for this attachment context
 *   e.g. 'invoice', `grpo-item-${grpoId}`, 'asset-registration'
 */
export function useFileAttachment(
  moduleKey: string,
  options: UseFileAttachmentOptions = {}
): UseFileAttachmentReturn {
  const {
    acceptedTypes = ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeMB = 10,
    maxFiles = null,
  } = options;

  const store = useAttachmentStore();
  const error = ref('');

  const files = computed(() => store.getFiles(moduleKey));

  function validate(file: File): string | null {
    if (acceptedTypes.length && !acceptedTypes.includes(file.type)) {
      return `ไฟล์ "${file.name}" ไม่ใช่ประเภทที่รองรับ`;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return `ไฟล์ "${file.name}" มีขนาดเกิน ${maxSizeMB}MB`;
    }
    return null;
  }

  function attachPreview(file: AttachedFile): AttachedFile {
    if (file.type?.startsWith('image/')) {
      file.previewUrl = URL.createObjectURL(file);
    }
    return file;
  }

  function addFiles(rawFiles: FileList | null): void {
    error.value = '';
    const incoming = Array.from(rawFiles || []) as AttachedFile[];

    if (maxFiles && files.value.length + incoming.length > maxFiles) {
      error.value = `แนบไฟล์ได้สูงสุด ${maxFiles} ไฟล์`;
      return;
    }

    const valid: AttachedFile[] = [];
    for (const f of incoming) {
      const err = validate(f);
      if (err) {
        error.value = err;
        continue;
      }
      valid.push(attachPreview(f));
    }
    if (valid.length) store.addFiles(moduleKey, valid);
  }

  function onFileChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    addFiles(target.files);
    target.value = '';
  }

  function onDrop(event: DragEvent): void {
    addFiles(event.dataTransfer?.files ?? null);
  }

  function removeFile(index: number): void {
    const file = files.value[index];
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    store.removeFile(moduleKey, index);
  }

  function clearAll(): void {
    files.value.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    store.clearModule(moduleKey);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  return {
    files,
    error,
    onFileChange,
    onDrop,
    removeFile,
    clearAll,
    formatSize,
  };
}