"use client";
import { createOperation } from "@athyper/platform-api-client";
import { type RichTextDocument } from "@athyper/platform-communications-collaboration-ui";
export interface AttachmentPreviewResult {
  state: "ready" | "processing" | "unavailable" | "unsupported";
  url?: string;
  expiresAt?: string;
  contentType?: string;
  detail?: string;
}
export const attachmentPreview = (id: string) => createOperation<AttachmentPreviewResult, { rendition: string }>({
  method: "POST", path: () => `/api/attachments/${encodeURIComponent(id)}/preview`,
});

export const commentCreate = createOperation<
  unknown,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: () => "/api/collab/comments",
  idempotency: "required",
});
export const commentDraft = createOperation<
  unknown,
  Readonly<Record<string, unknown>>
>({ method: "POST", path: () => "/api/collab/drafts" });
export const commentDraftCancel = createOperation<unknown>({
  method: "DELETE",
  path: () => "/api/collab/drafts",
});
export const attachmentStage = createOperation<
  { attachmentId: string; uploadUrl: string },
  {
    attachmentId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    entityType: string;
    entityId: string;
    parentAttachmentId?: string;
    expectedSeriesVersion?: number;
    duplicateNameChoice?: "new_version";
  }
>({
  method: "POST",
  path: () => "/api/attachments/stage",
  idempotency: "required",
});
export const attachmentFinalize = (attachmentId: string) =>
  createOperation<unknown, { contentType: string }>({
    method: "POST",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/finalize`,
    idempotency: "required",
  });
export const commentEdit = (commentId: string) =>
  createOperation<
    unknown,
    {
      text: string;
      expectedRevision: number;
      format?: string;
      content?: RichTextDocument;
      attachmentIds?: readonly string[];
    }
  >({
    method: "PATCH",
    path: () => `/api/collab/comments/${encodeURIComponent(commentId)}`,
  });
export const commentDelete = (commentId: string) =>
  createOperation<unknown>({
    method: "DELETE",
    path: () => `/api/collab/comments/${encodeURIComponent(commentId)}`,
  });
export const commentReply = (commentId: string) =>
  createOperation<unknown, Readonly<Record<string, unknown>>>({
    method: "POST",
    path: () => `/api/collab/comments/${encodeURIComponent(commentId)}/replies`,
    idempotency: "required",
  });
export const commentReaction = (commentId: string) =>
  createOperation<unknown, { code: string }>({
    method: "POST",
    path: () =>
      `/api/collab/comments/${encodeURIComponent(commentId)}/reactions`,
  });
export const commentReactionDelete = (commentId: string, code: string) =>
  createOperation<unknown>({
    method: "DELETE",
    path: () =>
      `/api/collab/comments/${encodeURIComponent(commentId)}/reactions/${encodeURIComponent(code)}`,
  });
export const commentFlag = (commentId: string) =>
  createOperation<unknown, { reasonCode: string; detail?: string }>({
    method: "POST",
    path: () => `/api/collab/comments/${encodeURIComponent(commentId)}/flag`,
  });
export const attachmentDownload = (attachmentId: string) =>
  createOperation<{ url: string }, { expirySeconds: number }>({
    method: "POST",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/download`,
  });
export const attachmentUnlink = (attachmentId: string) =>
  createOperation<unknown>({
    method: "DELETE",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}`,
    idempotency: "required",
  });
export const attachmentStatus = (attachmentId: string) =>
  createOperation<{ status: string; extractionStatus?: string | null }>({
    method: "GET",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/status`,
  });
export const attachmentBrowse = createOperation<
  { items: readonly Readonly<Record<string, unknown>>[]; nextCursor?: string },
  { entityType: string; entityId: string; name?: string; exactName?: boolean; folderId?: string; unfiled?: boolean; category?: string; after?: string; attachmentId?: string; includeHistory?: boolean }
>({ method: "POST", path: () => "/api/attachments/browse" });
export const attachmentRename = (attachmentId: string) =>
  createOperation<
    unknown,
    { displayName: string; expectedSeriesRevision: string }
  >({
    method: "PATCH",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}`,
    idempotency: "required",
  });
export const attachmentCategory = (attachmentId: string) =>
  createOperation<
    unknown,
    { entityType: string; entityId: string; category: "general" | "evidence" }
  >({
    method: "POST",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/category`,
    idempotency: "required",
  });
export const attachmentFolder = createOperation<
  { folderId: string | null; revision: number },
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: () => "/api/attachments/folders",
  idempotency: "required",
});
export const attachmentArchiveOutcome = (attachmentId: string) =>
  createOperation<{ activeLinks: number; legalHold: boolean }>({
    method: "GET",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/archive`,
  });
export const attachmentArchive = (attachmentId: string) =>
  createOperation<{ activeLinks: number; legalHold: boolean }>({
    method: "POST",
    path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/archive`,
    idempotency: "required",
  });
