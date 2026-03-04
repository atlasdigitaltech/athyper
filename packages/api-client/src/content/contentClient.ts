/**
 * Content API Client
 *
 * Clean wrapper around BFF content routes.
 * Handles fetch, serialization, and error mapping.
 */

import type {
  Attachment,
  InitiateUploadInput,
  InitiateUploadResult,
  CompleteUploadInput,
  DownloadUrlResult,
  ListAttachmentsQuery,
} from "./types";

type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

export class ContentApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ContentApiError";
  }
}

/**
 * Initiate file upload
 *
 * @param input - Upload parameters
 * @returns Upload ID and presigned URL
 * @throws ContentApiError on failure
 */
export async function initiateUpload(input: InitiateUploadInput): Promise<InitiateUploadResult> {
  const res = await fetch("/api/content/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });

  const data = (await res.json()) as ApiResponse<InitiateUploadResult>;

  if (!res.ok || !data.success) {
    throw new ContentApiError(
      data.error?.code ?? "UNKNOWN",
      data.error?.message ?? "Upload initiation failed",
      res.status,
    );
  }

  return data.data as InitiateUploadResult;
}

/**
 * Complete file upload after S3 upload
 *
 * @param input - Upload ID and checksum
 * @throws ContentApiError on failure
 */
export async function completeUpload(input: CompleteUploadInput): Promise<void> {
  const res = await fetch("/api/content/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });

  const data = (await res.json()) as ApiResponse;

  if (!res.ok || !data.success) {
    throw new ContentApiError(
      data.error?.code ?? "UNKNOWN",
      data.error?.message ?? "Upload completion failed",
      res.status,
    );
  }
}

/**
 * Get presigned download URL for attachment
 *
 * @param attachmentId - Attachment ID
 * @returns Presigned URL and metadata
 * @throws ContentApiError on failure
 */
export async function getDownloadUrl(attachmentId: string): Promise<DownloadUrlResult> {
  const res = await fetch(`/api/content/download/${attachmentId}`, {
    method: "GET",
    credentials: "include",
  });

  const data = (await res.json()) as ApiResponse<DownloadUrlResult>;

  if (!res.ok || !data.success) {
    throw new ContentApiError(
      data.error?.code ?? "UNKNOWN",
      data.error?.message ?? "Download URL generation failed",
      res.status,
    );
  }

  return data.data as DownloadUrlResult;
}

/**
 * Delete attachment
 *
 * @param attachmentId - Attachment ID
 * @throws ContentApiError on failure
 */
export async function deleteAttachment(attachmentId: string): Promise<void> {
  const res = await fetch(`/api/content/delete/${attachmentId}`, {
    method: "DELETE",
    credentials: "include",
  });

  const data = (await res.json()) as ApiResponse;

  if (!res.ok || !data.success) {
    throw new ContentApiError(
      data.error?.code ?? "UNKNOWN",
      data.error?.message ?? "File deletion failed",
      res.status,
    );
  }
}

/**
 * List attachments for entity
 *
 * @param query - Entity type and ID
 * @returns Array of attachments
 * @throws ContentApiError on failure
 */
export async function listByEntity(query: ListAttachmentsQuery): Promise<Attachment[]> {
  const params = new URLSearchParams({
    entity: query.entityType,
    id: query.entityId,
  });

  if (query.kind) {
    params.append("kind", query.kind);
  }

  const res = await fetch(`/api/content/by-entity?${params}`, {
    method: "GET",
    credentials: "include",
  });

  const data = (await res.json()) as ApiResponse<Attachment[]>;

  if (!res.ok || !data.success) {
    throw new ContentApiError(
      data.error?.code ?? "UNKNOWN",
      data.error?.message ?? "List attachments failed",
      res.status,
    );
  }

  return data.data as Attachment[];
}

/**
 * Compute SHA-256 hash of file (browser-side)
 *
 * @param file - File to hash
 * @returns SHA-256 hex string
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
