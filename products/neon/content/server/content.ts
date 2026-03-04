/**
 * Content Service - Pure Functions for Content Operations
 *
 * These functions are thin wrappers around the runtime API.
 * They handle request/response serialization and error mapping.
 *
 * Pattern: All functions are async and throw on error.
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

export interface InitiateUploadParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  kind: DocumentKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  actorId: string;
}

export interface InitiateUploadResult {
  uploadId: string;
  presignedUrl: string;
  expiresAt: string;
  storageKey: string;
}

export interface CompleteUploadParams {
  uploadId: string;
  sha256: string;
  tenantId: string;
  actorId: string;
}

export interface DownloadUrlResult {
  url: string;
  expiresAt: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface AttachmentMetadata {
  id: string;
  fileName: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  kind: DocumentKind;
  sha256: string | null;
  storageKey: string;
  uploadedBy: string | null;
  createdAt: string;
  versionNo: number;
  isCurrent: boolean;
}

/**
 * Initiate file upload
 *
 * Creates a pending attachment record and returns a presigned URL
 * for direct upload to S3.
 *
 * @param params - Upload parameters
 * @returns Upload ID and presigned URL
 * @throws Error if validation fails or runtime API errors
 */
export async function initiateUpload(params: InitiateUploadParams): Promise<InitiateUploadResult> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Upload initiation failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Complete file upload
 *
 * Finalizes the upload after client has uploaded to S3.
 * Verifies object exists and updates attachment record.
 *
 * @param params - Completion parameters
 * @throws Error if upload not found or S3 object missing
 */
export async function completeUpload(params: CompleteUploadParams): Promise<void> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Upload completion failed: ${res.status}`);
  }
}

/**
 * Get download URL for attachment
 *
 * Generates a presigned URL for downloading the file from S3.
 *
 * @param attachmentId - Attachment ID
 * @param tenantId - Tenant ID
 * @param actorId - User ID requesting download
 * @returns Presigned download URL and metadata
 * @throws Error if attachment not found or permission denied
 */
export async function getDownloadUrl(
  attachmentId: string,
  tenantId: string,
  actorId: string,
): Promise<DownloadUrlResult> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/download/${attachmentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, actorId }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Download URL generation failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Delete attachment
 *
 * Removes file from S3 and deletes database record.
 *
 * @param attachmentId - Attachment ID to delete
 * @param tenantId - Tenant ID
 * @param actorId - User ID requesting deletion
 * @throws Error if attachment not found or permission denied
 */
export async function deleteFile(
  attachmentId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/delete/${attachmentId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, actorId }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `File deletion failed: ${res.status}`);
  }
}

/**
 * List attachments by entity
 *
 * Returns all attachments linked to a specific entity.
 *
 * @param tenantId - Tenant ID
 * @param entityType - Entity type (e.g., "invoice", "customer")
 * @param entityId - Entity ID
 * @returns Array of attachment metadata
 * @throws Error if query fails
 */
export async function listByEntity(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<AttachmentMetadata[]> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const params = new URLSearchParams({
    tenant: tenantId,
    entity: entityType,
    id: entityId,
  });

  const res = await fetch(`${runtimeApiUrl}/api/content/by-entity?${params}`);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `List attachments failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Get attachment metadata
 *
 * Returns metadata for a specific attachment without downloading the file.
 *
 * @param attachmentId - Attachment ID
 * @param tenantId - Tenant ID
 * @returns Attachment metadata
 * @throws Error if attachment not found
 */
export async function getMetadata(
  attachmentId: string,
  tenantId: string,
): Promise<AttachmentMetadata> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;
  if (!runtimeApiUrl) {
    throw new Error("RUNTIME_API_URL not configured");
  }

  const res = await fetch(`${runtimeApiUrl}/api/content/meta/${attachmentId}?tenant=${tenantId}`);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `Get metadata failed: ${res.status}`);
  }

  return res.json();
}
