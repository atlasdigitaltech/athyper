/**
 * Shared Content Management Types
 *
 * UI-side model for attachments. Decoupled from database schema.
 */

export type DocumentKind =
  | "attachment"
  | "generated"
  | "export"
  | "template"
  | "letterhead"
  | "avatar"
  | "signature"
  | "certificate"
  | "invoice"
  | "receipt"
  | "contract"
  | "report";

export interface Attachment {
  id: string;
  fileName: string;
  sizeBytes: number;
  contentType?: string;
  kind: DocumentKind;
  createdAt: string;
  createdBy?: {
    id: string;
    displayName?: string;
  };
  versionNo?: number;
  isCurrent?: boolean;
  sha256?: string;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  status: "queued" | "initiating" | "uploading" | "completing" | "done" | "failed";
  progress: number; // 0-100
  error?: string;
}

export interface InitiateUploadInput {
  entityType: string;
  entityId: string;
  kind: DocumentKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface InitiateUploadResult {
  uploadId: string;
  presignedUrl: string;
  expiresAt: string;
  storageKey: string;
}

export interface CompleteUploadInput {
  uploadId: string;
  sha256: string;
}

export interface DownloadUrlResult {
  url: string;
  expiresAt: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ListAttachmentsQuery {
  entityType: string;
  entityId: string;
  kind?: DocumentKind;
}
