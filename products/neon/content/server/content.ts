/**
 * Content Service - Pure Functions for Content Operations
 *
 * Primary path: delegates to the runtime API (RUNTIME_API_URL).
 * Fallback path: when the runtime API is unreachable, operates directly
 * against S3 (MinIO) and the database. This allows local development
 * without running the full runtime API service.
 *
 * Pattern: All functions are async and throw on error.
 */

import { createS3ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — @types/pg doesn't cover the ESM entry point
import { Pool } from "pg";

import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";

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

// ---------------------------------------------------------------------------
// S3 adapter singleton (lazy, only created when direct path is used)
// ---------------------------------------------------------------------------

let _s3: ObjectStorageAdapter | null = null;

function getS3(): ObjectStorageAdapter | null {
  if (_s3) return _s3;

  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey) return null;

  _s3 = createS3ObjectStorageAdapter({
    endpoint,
    accessKey,
    secretKey,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "athyper-local",
    useSSL: process.env.S3_USE_SSL === "true",
  });
  return _s3;
}

// ---------------------------------------------------------------------------
// Runtime API helper
// ---------------------------------------------------------------------------

/**
 * Try a fetch to the runtime API.
 * Returns the Response only if the request succeeded (2xx).
 * Returns null on network failure OR non-OK response (so callers
 * fall through to the direct S3/DB path).
 */
async function tryRuntimeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[content] Runtime API error ${res.status} for ${init?.method ?? "GET"} ${url}: ${body.slice(0, 200)}`,
      );
      return null;
    }
    return res;
  } catch {
    // Network error (ECONNREFUSED, DNS failure, etc.)
    return null;
  }
}

// ---------------------------------------------------------------------------
// DB row mapping helper
// ---------------------------------------------------------------------------

function rowToMetadata(r: Record<string, unknown>): AttachmentMetadata {
  return {
    id: r.id as string,
    fileName: r.file_name as string,
    originalFilename:
      (r.original_filename as string) ?? (r.file_name as string),
    contentType: r.content_type as string,
    sizeBytes: Number(r.size_bytes),
    kind: r.kind as DocumentKind,
    sha256: r.sha256 as string | null,
    storageKey: r.storage_key as string,
    uploadedBy: r.uploaded_by as string | null,
    createdAt: (r.created_at as Date).toISOString(),
    versionNo: Number(r.version_no ?? 1),
    isCurrent: r.is_current as boolean,
  };
}

// ---------------------------------------------------------------------------
// Initiate Upload
// ---------------------------------------------------------------------------

/**
 * Initiate file upload
 *
 * Creates a pending attachment record and returns a presigned URL
 * for direct upload to S3.
 */
export async function initiateUpload(
  params: InitiateUploadParams,
): Promise<InitiateUploadResult> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;

  // --- Primary path: runtime API ---
  if (runtimeApiUrl) {
    const res = await tryRuntimeFetch(
      `${runtimeApiUrl}/api/content/initiate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
    );

    if (res) return res.json();

    // Runtime API unreachable or errored — fall through to direct path
    console.warn(
      "[content] Runtime API unavailable, falling back to direct S3 path",
    );
  }

  // --- Fallback: direct S3 + DB ---
  return directInitiateUpload(params);
}

/**
 * Direct S3 upload initiation (fallback when runtime API is down).
 * Inserts a pending record in doc.attachment and generates a presigned PUT URL.
 */
async function directInitiateUpload(
  params: InitiateUploadParams,
): Promise<InitiateUploadResult> {
  const s3 = getS3();
  if (!s3) {
    throw new Error(
      "Neither RUNTIME_API_URL nor S3 env vars (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY) are configured. " +
        "Cannot initiate upload.",
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  try {
    const uploadId = crypto.randomUUID();
    const bucket = process.env.S3_BUCKET ?? "athyper-local";
    const storageKey = `${params.tenantId}/${params.entityType}/${params.entityId}/${uploadId}/${params.fileName}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    // Resolve tenant UUID
    const tenantResult = await pool.query(
      `SELECT id FROM core.tenant WHERE code = $1 LIMIT 1`,
      [params.tenantId],
    );
    const tenantUuid = tenantResult.rows[0]?.id ?? params.tenantId;

    // Insert pending attachment record
    await pool.query(
      `INSERT INTO doc.attachment (
        id, tenant_id,
        owner_entity, owner_entity_id,
        file_name, original_filename, content_type, size_bytes,
        storage_bucket, storage_key,
        kind, uploaded_by, created_by
      ) VALUES (
        $1::uuid, $2::uuid,
        $3, $4,
        $5, $5, $6, $7,
        $8, $9,
        $10, $11, $11
      )`,
      [
        uploadId,
        tenantUuid,
        params.entityType,
        params.entityId,
        params.fileName,
        params.contentType,
        params.sizeBytes,
        bucket,
        storageKey,
        params.kind,
        params.actorId,
      ],
    );

    // Generate presigned PUT URL
    const presignedUrl = await s3.putPresignedUrl(storageKey, 3600);

    return { uploadId, presignedUrl, expiresAt, storageKey };
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Complete Upload
// ---------------------------------------------------------------------------

/**
 * Complete file upload
 *
 * Finalizes the upload after client has uploaded to S3.
 * Verifies object exists and updates attachment record.
 */
export async function completeUpload(
  params: CompleteUploadParams,
): Promise<void> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;

  if (runtimeApiUrl) {
    const res = await tryRuntimeFetch(
      `${runtimeApiUrl}/api/content/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
    );

    if (res) return;

    console.warn(
      "[content] Runtime API unavailable, falling back to direct complete",
    );
  }

  // --- Fallback: update DB directly ---
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  try {
    await pool.query(
      `UPDATE doc.attachment SET sha256 = $1 WHERE id = $2::uuid`,
      [params.sha256, params.uploadId],
    );
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Download URL
// ---------------------------------------------------------------------------

/**
 * Get download URL for attachment
 */
export async function getDownloadUrl(
  attachmentId: string,
  tenantId: string,
  actorId: string,
): Promise<DownloadUrlResult> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;

  if (runtimeApiUrl) {
    const res = await tryRuntimeFetch(
      `${runtimeApiUrl}/api/content/download/${attachmentId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, actorId }),
      },
    );

    if (res) return res.json();

    console.warn(
      "[content] Runtime API unavailable, falling back to direct download",
    );
  }

  // --- Fallback: query DB + generate presigned GET URL ---
  const s3 = getS3();
  if (!s3) {
    throw new Error(
      "Neither RUNTIME_API_URL nor S3 env vars configured for download",
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  try {
    const result = await pool.query(
      `SELECT storage_key, file_name, content_type, size_bytes
       FROM doc.attachment WHERE id = $1::uuid`,
      [attachmentId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Attachment ${attachmentId} not found`);

    const url = await s3.getPresignedUrl(row.storage_key, 3600);
    return {
      url,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
    };
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Delete File
// ---------------------------------------------------------------------------

/**
 * Delete attachment
 */
export async function deleteFile(
  attachmentId: string,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;

  if (runtimeApiUrl) {
    const res = await tryRuntimeFetch(
      `${runtimeApiUrl}/api/content/delete/${attachmentId}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, actorId }),
      },
    );

    if (res) return;

    console.warn(
      "[content] Runtime API unavailable, falling back to direct delete",
    );
  }

  // --- Fallback: delete from S3 + DB ---
  const s3 = getS3();
  if (!s3) {
    throw new Error(
      "Neither RUNTIME_API_URL nor S3 env vars configured for deletion",
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  try {
    const result = await pool.query(
      `SELECT storage_key FROM doc.attachment WHERE id = $1::uuid`,
      [attachmentId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Attachment ${attachmentId} not found`);

    await s3.delete(row.storage_key);
    await pool.query(`DELETE FROM doc.attachment WHERE id = $1::uuid`, [
      attachmentId,
    ]);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// List By Entity
// ---------------------------------------------------------------------------

/**
 * List attachments by entity
 */
export async function listByEntity(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<AttachmentMetadata[]> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;

  if (runtimeApiUrl) {
    const params = new URLSearchParams({
      tenant: tenantId,
      entity: entityType,
      id: entityId,
    });

    const res = await tryRuntimeFetch(
      `${runtimeApiUrl}/api/content/by-entity?${params}`,
    );

    if (res) return res.json();

    console.warn(
      "[content] Runtime API unavailable, falling back to direct list",
    );
  }

  // --- Fallback: query DB directly ---
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  try {
    // Resolve tenant UUID
    const tenantResult = await pool.query(
      `SELECT id FROM core.tenant WHERE code = $1 LIMIT 1`,
      [tenantId],
    );
    const tenantUuid = tenantResult.rows[0]?.id ?? tenantId;

    const result = await pool.query(
      `SELECT id, file_name, original_filename, content_type, size_bytes,
              kind, sha256, storage_key, uploaded_by, created_at,
              version_no, is_current
       FROM doc.attachment
       WHERE tenant_id = $1::uuid
         AND owner_entity = $2
         AND owner_entity_id = $3
         AND is_current = true
       ORDER BY created_at DESC`,
      [tenantUuid, entityType, entityId],
    );

    return result.rows.map(rowToMetadata);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Get Metadata
// ---------------------------------------------------------------------------

/**
 * Get attachment metadata
 */
export async function getMetadata(
  attachmentId: string,
  tenantId: string,
): Promise<AttachmentMetadata> {
  const runtimeApiUrl = process.env.RUNTIME_API_URL;

  if (runtimeApiUrl) {
    const res = await tryRuntimeFetch(
      `${runtimeApiUrl}/api/content/meta/${attachmentId}?tenant=${tenantId}`,
    );

    if (res) return res.json();

    console.warn(
      "[content] Runtime API unavailable, falling back to direct metadata",
    );
  }

  // --- Fallback: query DB directly ---
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  try {
    const result = await pool.query(
      `SELECT id, file_name, original_filename, content_type, size_bytes,
              kind, sha256, storage_key, uploaded_by, created_at,
              version_no, is_current
       FROM doc.attachment WHERE id = $1::uuid`,
      [attachmentId],
    );
    const r = result.rows[0] as Record<string, unknown> | undefined;
    if (!r) throw new Error(`Attachment ${attachmentId} not found`);

    return rowToMetadata(r);
  } finally {
    await pool.end();
  }
}
