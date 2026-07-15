/**
 * ContentAttachmentService
 *
 * Application service for S3-backed document attachments.
 * All file bytes live in object storage; metadata lives in master.attachment;
 * entity ownership lives in master.entity_document_link.
 *
 * Transaction boundary (upload):
 *   1. PUT bytes → S3 first
 *   2. DB transaction: INSERT master.attachment + master.entity_document_link
 *   3. On DB failure → compensating S3 delete
 *
 * Download: resolve link → check status → S3 GET → write access audit (best-effort)
 *
 * Delete: remove entity_document_link row; if no remaining links, set
 *   master.attachment.status = 'deleted' (logical-only; physical S3 cleanup deferred).
 */

import { createHash, randomUUID } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { ObjectStorageAdapter } from "@athyper/adapter-object-storage";

// ── Param / result types ──────────────────────────────────────────────────────

export interface UploadParams {
  tenantId:    string;
  /** Tenant code (e.g. "athyper") — first segment of X-Org header. */
  tenantCode?: string;
  /** Company code (e.g. "ASAC") — second segment of X-Org header. */
  companyCode?: string;
  entityType:  string;
  /** UUID of the owning document record, passed as string (entity_id is text in DB). */
  entityId:    string;
  fileBuffer:  Buffer;
  fileName:    string;
  contentType: string;
  sizeBytes:   number;
  principalId: string;
  linkKind?:   "primary" | "related" | "supporting" | "compliance" | "audit";
  /** Uploads start as quarantined and enter active/failed via scan orchestration. */
  initialStatus?: "uploaded" | "active" | "quarantined";
  /**
   * Whether the file has been through virus scanning.
   * Default: false (scanning not configured or not yet run).
   */
  isVirusScanned?: boolean;
  idempotencyKey?: string;
  /**
   * Structured scan result stored in metadata.scan JSONB.
   * Included for both clean and quarantined results so admins have context.
   */
  scanMeta?: Record<string, unknown>;
}

export interface UploadResult {
  id:          string;
  fileName:    string;
  contentType: string;
  sizeBytes:   number;
  sha256:      string;
  status:      AttachmentStatus;
  versionNo:   number;
  createdAt:   unknown;
  storageKey:  string;
}

export interface PresignedUploadIntent {
  attachmentId: string;
  storageKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface CompletePresignedUploadParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  attachmentId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  expectedSizeBytes: number;
  expectedEtag?: string;
  expectedSha256?: string;
  principalId: string;
  tenantCode?: string;
  companyCode?: string;
  linkKind?: "primary" | "related" | "supporting" | "compliance" | "audit";
}

export interface AttachmentListItem {
  id:             string;
  fileName:       string;
  contentType:    string;
  sizeBytes:      number;
  createdAt:      unknown;
  status:         string;
  versionNo:      number;
  linkKind:       string;
  displayOrder:   number;
  uploadedByName: string | null;
}

export interface DownloadResult {
  buffer:      Buffer;
  fileName:    string;
  contentType: string;
}

export interface DownloadStreamResult {
  stream:      NodeJS.ReadableStream;
  fileName:    string;
  contentType: string;
  sizeBytes:   number;
}

type AttachmentLifecycleLogger = {
  info(event: string, fields?: Record<string, unknown>): void;
  warn?(event: string, fields?: Record<string, unknown>): void;
};

// ── Sha256PassThrough ─────────────────────────────────────────────────────────
// Wraps a readable stream, hashes every chunk inline, forwards data unchanged.
// Call digest() AFTER the stream has been fully consumed.

class Sha256PassThrough extends Transform {
  private readonly hash = createHash("sha256");
  private _byteCount = 0;

  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.hash.update(chunk);
    this._byteCount += chunk.length;
    this.push(chunk);
    cb();
  }

  digest(): string {
    return this.hash.digest("hex");
  }

  get byteCount(): number {
    return this._byteCount;
  }
}

// ── UploadStreamParams ────────────────────────────────────────────────────────

export interface UploadStreamParams {
  tenantId:    string;
  /** Tenant code (e.g. "athyper") — first segment of X-Org header. */
  tenantCode?: string;
  /** Company code (e.g. "ASAC") — second segment of X-Org header. */
  companyCode?: string;
  entityType:  string;
  entityId:    string;
  stream:      NodeJS.ReadableStream;
  fileName:    string;
  contentType: string;
  /** Declared byte count from the client (used as a hint; actual is measured). */
  contentLength?: number;
  principalId: string;
  linkKind?:   "primary" | "related" | "supporting" | "compliance" | "audit";
  idempotencyKey?: string;
}

export interface UploadReplayResult {
  id:            string;
  fileName:      string;
  contentType:   string;
  sizeBytes:     number;
  sha256:        string;
  status:        AttachmentStatus;
  versionNo:     number;
  createdAt:     unknown;
  storageKey:    string;
}

export interface FindAttachmentReplayParams {
  tenantId:      string;
  statuses:      Array<AttachmentStatus>;
  hash?:         string;
  idempotencyKey?: string;
}

export interface UploadSession {
  attachmentId: string;
  storageKey:   string;
  sha256:       string;
  sizeBytes:    number;
  status:       AttachmentStatus;
}

export type AttachmentStatus = "uploaded" | "active" | "quarantined" | "failed" | "orphaned" | "deleted" | "archived";
const isActiveAttachmentStatus: ReadonlySet<AttachmentStatus> = new Set(["active"]);
const allowedStatusTransitions: ReadonlyMap<AttachmentStatus, ReadonlySet<AttachmentStatus>> = new Map([
  ["uploaded",    new Set<AttachmentStatus>(["quarantined", "failed"])],
  ["quarantined", new Set<AttachmentStatus>(["active", "failed", "orphaned", "deleted", "archived"])],
  ["active",      new Set<AttachmentStatus>(["orphaned", "deleted", "archived"])],
  ["failed",      new Set<AttachmentStatus>(["active", "orphaned", "deleted", "archived"])],
  ["orphaned",    new Set<AttachmentStatus>(["deleted", "archived"])],
  ["deleted",     new Set<AttachmentStatus>()],
  ["archived",    new Set<AttachmentStatus>()],
]);

type AttachmentTransitionMetadata = {
  source?: string;
  actor?: string | null;
  reasonCode?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
};

// ── UUID guard ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Service ───────────────────────────────────────────────────────────────────

export class ContentAttachmentService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly db: Kysely<any>,
    private readonly storage: ObjectStorageAdapter,
    private readonly storageBucket: string,
    private readonly logger?: AttachmentLifecycleLogger,
  ) {}

  // ── Storage key ─────────────────────────────────────────────────────────────

  /** Strip path separators and unsafe chars; cap at 200 chars. */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[/\\]/g, "_")
      .replace(/[^\w.\-]/g, "_")
      .replace(/_{2,}/g, "_")
      .slice(0, 200);
  }

  /**
   * Generates a deterministic S3 key for a document attachment.
   *
   * Path: {tenantCode}/{companyCode}/{year}/{month}/{entityType}/{entityId}/{attachmentId}/v{N}/{fileName}
   * e.g.  athyper/ASAC/2026/04/document/invoice/019.../019.../v1/invoice.pdf
   *
   * Falls back to tenantId when tenant/company codes are unavailable.
   */
  generateStorageKey(
    tenantId:     string,
    entityType:   string,
    entityId:     string,
    attachmentId: string,
    fileName:     string,
    versionNo = 1,
    companyCode?: string,
    tenantCode?:  string,
  ): string {
    const now        = new Date();
    const year       = now.getUTCFullYear();
    const month      = String(now.getUTCMonth() + 1).padStart(2, "0");
    const safeType   = entityType.replace(/\./g, "/");
    const sanitized  = this.sanitizeFileName(fileName);
    const tCode      = tenantCode  ?? tenantId;
    const cCode      = companyCode ?? tenantId;
    return `${tCode}/${cCode}/${year}/${month}/${safeType}/${entityId}/${attachmentId}/v${versionNo}/${sanitized}`;
  }

  // ── Upload ───────────────────────────────────────────────────────────────────

  async upload(params: UploadParams): Promise<UploadResult> {
    const {
      tenantId, tenantCode, companyCode, entityType, entityId,
      fileBuffer, fileName, contentType, sizeBytes,
      principalId, linkKind = "related",
      initialStatus = "quarantined",
      isVirusScanned = false,
      idempotencyKey,
      scanMeta,
    } = params;

    const attachmentId = randomUUID();
    const storageKey = this.generateStorageKey(tenantId, entityType, entityId, attachmentId, fileName, 1, companyCode, tenantCode);
    const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

    // Step 1: upload to S3 before touching the DB
    try {
      await this.storage.put(storageKey, fileBuffer, { contentType });
    } catch (err) {
      try {
        await this.storage.delete(storageKey).catch(() => {});
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "json",
          outcome: "object_deleted_on_failure",
        });
      } catch {
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "json",
          outcome: "object_delete_failed",
        });
      }
      throw err;
    }

    // Step 2: DB transaction — compensate S3 on failure
    try {
      const attachment = await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto("master.attachment" as never)
          .values({
            id:                        attachmentId,
            tenant_id:                 tenantId,
            file_name:                 fileName.slice(0, 500),
            original_filename:         fileName.slice(0, 500),
            content_type:              contentType.slice(0, 200),
            size_bytes:                sizeBytes,
            sha256,
            kind:                      "attachment",
            storage_bucket:            this.storageBucket,
            storage_key:               storageKey,
            version_no:                1,
            reference_count:           1,
            is_current:                true,
            is_active:                 isActiveAttachmentStatus.has(initialStatus),
            is_virus_scanned:          isVirusScanned,
            is_preview_generation_failed: false,
            is_auto_delete_on_expiry:  false,
            metadata:                  {
              ...(scanMeta ? { scan: scanMeta } : {}),
              ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
            },
            status:                    initialStatus,
            status_changed_at:         new Date(),
            uploaded_by:               principalId,
            created_by:                principalId,
          } as never)
          .returning([
            "id", "file_name", "content_type", "size_bytes",
            "created_at", "status", "version_no", "storage_key",
          ] as never[])
          .executeTakeFirstOrThrow();

        await trx
          .insertInto("master.entity_document_link" as never)
          .values({
            tenant_id:     tenantId,
            entity_type:   entityType,
            entity_id:     entityId,
            attachment_id: attachmentId,
            link_kind:     linkKind,
            display_order: 0,
            created_by:    principalId,
          } as never)
          .execute();

        return row as Record<string, unknown>;
      });

      this.logger?.info("attachment_status_transition", {
        attachmentId,
        tenantId,
        entityType,
        entityId,
        fromStatus: null,
        toStatus: initialStatus,
        source: "upload",
      });

      return {
        id:          attachment["id"] as string,
        fileName:    attachment["file_name"] as string,
        contentType: attachment["content_type"] as string,
        sizeBytes:   Number(attachment["size_bytes"] ?? 0),
        sha256,
        status:      attachment["status"] as AttachmentStatus,
        versionNo:   Number(attachment["version_no"] ?? 1),
        createdAt:   attachment["created_at"],
        storageKey:  attachment["storage_key"] as string,
      };
    } catch (err) {
      try {
        await this.storage.delete(storageKey).catch(() => {});
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "json",
          outcome: "object_deleted_on_db_failure",
        });
      } catch {
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "json",
          outcome: "object_delete_failed_on_db_failure",
        });
      }
      throw err;
    }
  }

  /**
   * Creates a short-lived direct-upload intent. No database row is created
   * until completion verifies the object; this prevents abandoned intents
   * from becoming visible attachments.
   */
  async initiatePresignedUpload(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
    fileName: string;
    contentType: string;
    tenantCode?: string;
    companyCode?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadIntent> {
    const attachmentId = randomUUID();
    const storageKey = this.generateStorageKey(
      params.tenantId,
      params.entityType,
      params.entityId,
      attachmentId,
      params.fileName,
      1,
      params.companyCode,
      params.tenantCode,
    );
    const expiresInSeconds = params.expiresInSeconds ?? 900;
    const uploadUrl = await this.storage.putPresignedUrl(storageKey, expiresInSeconds);
    return { attachmentId, storageKey, uploadUrl, expiresInSeconds };
  }

  /**
   * Completes a direct upload only after object metadata and optional
   * checksum/ETag evidence match the client declaration. The attachment and
   * ownership link are then inserted in one transaction as quarantined.
   */
  async completePresignedUpload(params: CompletePresignedUploadParams): Promise<UploadResult> {
    const metadata = await this.storage.getMetadata(params.storageKey);
    if (metadata.size !== params.expectedSizeBytes) {
      throw new Error(`ATTACHMENT_SIZE_MISMATCH:${metadata.size}:${params.expectedSizeBytes}`);
    }
    if (params.expectedEtag && metadata.etag && metadata.etag.replaceAll('"', "") !== params.expectedEtag.replaceAll('"', "")) {
      throw new Error("ATTACHMENT_ETAG_MISMATCH");
    }
    const sha256 = params.expectedSha256
      ? createHash("sha256").update(await this.storage.get(params.storageKey)).digest("hex")
      : "";
    if (params.expectedSha256 && sha256 !== params.expectedSha256.toLowerCase()) {
      throw new Error("ATTACHMENT_CHECKSUM_MISMATCH");
    }
    const row = await this.db.transaction().execute(async (trx) => {
      const attachment = await trx.insertInto("master.attachment" as never).values({
        id: params.attachmentId,
        tenant_id: params.tenantId,
        file_name: params.fileName.slice(0, 500),
        original_filename: params.fileName.slice(0, 500),
        content_type: params.contentType.slice(0, 200),
        size_bytes: metadata.size,
        sha256: params.expectedSha256 ?? null,
        kind: "attachment",
        storage_bucket: this.storageBucket,
        storage_key: params.storageKey,
        version_no: 1,
        reference_count: 1,
        is_current: true,
        is_active: true,
        is_virus_scanned: false,
        is_preview_generation_failed: false,
        is_auto_delete_on_expiry: false,
        status: "quarantined",
        status_changed_at: new Date(),
        uploaded_by: params.principalId,
        created_by: params.principalId,
        metadata: { upload_mode: "presigned", etag: metadata.etag ?? null },
      } as never).returning(["id", "file_name", "content_type", "size_bytes", "created_at", "status", "version_no", "storage_key"] as never[]).executeTakeFirstOrThrow();
      await trx.insertInto("master.entity_document_link" as never).values({
        tenant_id: params.tenantId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        attachment_id: params.attachmentId,
        link_kind: params.linkKind ?? "related",
        display_order: 0,
        created_by: params.principalId,
      } as never).execute();
      return attachment as Record<string, unknown>;
    });
    return {
      id: row.id as string,
      fileName: row.file_name as string,
      contentType: row.content_type as string,
      sizeBytes: Number(row.size_bytes ?? metadata.size),
      sha256,
      status: row.status as AttachmentStatus,
      versionNo: Number(row.version_no ?? 1),
      createdAt: row.created_at,
      storageKey: row.storage_key as string,
    };
  }
  // ── Upload (streaming) ───────────────────────────────────────────────────────
  // Uses putStream() so file bytes are never fully buffered in memory.
  // SHA-256 and byte count are computed inline via Sha256PassThrough.
  // Same transaction boundary as upload(): S3 first, DB on success, compensating
  // S3 delete on DB failure.

  async uploadStream(params: UploadStreamParams): Promise<UploadResult> {
    const {
      tenantId, tenantCode, companyCode, entityType, entityId,
      stream, fileName, contentType,
      contentLength,
      principalId, linkKind = "related",
      idempotencyKey,
    } = params;

    const attachmentId  = randomUUID();
    const storageKey    = this.generateStorageKey(tenantId, entityType, entityId, attachmentId, fileName, 1, companyCode, tenantCode);

    // Pipe the incoming stream through the hashing transform before S3
    const sha256Stream  = new Sha256PassThrough();
    stream.pipe(sha256Stream);

    let finalSha256    = "";
    let finalSizeBytes = 0;

    // Step 1: stream to S3 via multipart
    try {
      await this.storage.putStream(storageKey, sha256Stream, {
        contentType,
        contentLength,
        partSize: 5 * 1024 * 1024,  // 5 MiB
      });
      finalSha256    = sha256Stream.digest();
      finalSizeBytes = sha256Stream.byteCount;
    } catch (err) {
      try {
        await this.storage.delete(storageKey).catch(() => {});
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "stream",
          outcome: "object_deleted_on_stream_failure",
        });
      } catch {
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "stream",
          outcome: "object_delete_failed_on_stream_failure",
        });
      }
      throw err;
    }

    // ── Step 2: DB transaction — compensate S3 on failure ───────────────────
    try {
      const attachment = await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto("master.attachment" as never)
          .values({
            id:                           attachmentId,
            tenant_id:                    tenantId,
            file_name:                    fileName.slice(0, 500),
            original_filename:            fileName.slice(0, 500),
            content_type:                 contentType.slice(0, 200),
            size_bytes:                   finalSizeBytes,
            sha256:                      finalSha256,
            kind:                         "attachment",
            storage_bucket:               this.storageBucket,
            storage_key:                  storageKey,
            version_no:                   1,
            reference_count:              1,
            is_current:                   true,
            is_active:                    isActiveAttachmentStatus.has("quarantined"),
            is_virus_scanned:             false,
            is_preview_generation_failed: false,
            is_auto_delete_on_expiry:     false,
            status:                       "quarantined",
            status_changed_at:            new Date(),
            uploaded_by:                  principalId,
            created_by:                   principalId,
            metadata:                     {
              ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
            },
          } as never)
          .returning([
            "id", "file_name", "content_type", "size_bytes",
            "created_at", "status", "version_no", "storage_key",
          ] as never[])
          .executeTakeFirstOrThrow();

        await trx
          .insertInto("master.entity_document_link" as never)
          .values({
            tenant_id:     tenantId,
            entity_type:   entityType,
            entity_id:     entityId,
            attachment_id: attachmentId,
            link_kind:     linkKind,
            display_order: 0,
            created_by:    principalId,
          } as never)
          .execute();

        return row as Record<string, unknown>;
      });

      this.logger?.info("attachment_status_transition", {
        attachmentId,
        tenantId,
        entityType,
        entityId,
        fromStatus: null,
        toStatus: "quarantined",
        source: "uploadStream",
      });

      return {
        id:          attachment["id"] as string,
        fileName:    attachment["file_name"] as string,
        contentType: attachment["content_type"] as string,
        sizeBytes:   Number(attachment["size_bytes"] ?? finalSizeBytes),
        sha256:      finalSha256,
        status:      attachment["status"] as AttachmentStatus,
        versionNo:   Number(attachment["version_no"] ?? 1),
        createdAt:   attachment["created_at"],
        storageKey:  attachment["storage_key"] as string,
      };
    } catch (err) {
      try {
        await this.storage.delete(storageKey).catch(() => {});
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "stream",
          outcome: "object_deleted_on_db_failure",
        });
      } catch {
        this.logger?.warn?.("attachment_upload_cleanup_outcome", {
          attachmentId,
          tenantId,
          storageKey,
          phase: "stream",
          outcome: "object_delete_failed_on_db_failure",
        });
      }
      throw err;
    }
  }

  // ── List ─────────────────────────────────────────────────────────────────────

  async list(params: {
    tenantId:   string;
    entityType: string;
    entityId:   string;
  }): Promise<AttachmentListItem[]> {
    const { tenantId, entityType, entityId } = params;

    const rows = await this.db
      .selectFrom("master.entity_document_link as edl")
      .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
      .leftJoin("master.principal as p", "p.id", "a.uploaded_by")
      .select([
        "a.id",
        "a.file_name",
        "a.content_type",
        "a.size_bytes",
        "a.created_at",
        "a.status",
        "a.version_no",
        "edl.link_kind",
        "edl.display_order",
        "p.name as uploaded_by_name",
      ])
      .where("edl.tenant_id", "=", tenantId)
      .where("edl.entity_type", "=", entityType)
      .where("edl.entity_id", "=", entityId)
      .where("a.status", "=", "active")
      .orderBy("edl.display_order", "asc")
      .orderBy("a.created_at", "asc")
      .execute();

    return (rows as Record<string, unknown>[]).map((row) => ({
      id:             row["id"] as string,
      fileName:       row["file_name"] as string,
      contentType:    row["content_type"] as string,
      sizeBytes:      Number(row["size_bytes"] ?? 0),
      createdAt:      row["created_at"],
      status:         row["status"] as string,
      versionNo:      Number(row["version_no"] ?? 1),
      linkKind:       row["link_kind"] as string,
      displayOrder:   Number(row["display_order"] ?? 0),
      uploadedByName: (row["uploaded_by_name"] as string) ?? null,
    }));
  }

  async findReplayAttachment(params: FindAttachmentReplayParams): Promise<UploadReplayResult | null> {
    let query = this.db
      .selectFrom("master.attachment as a")
      .select([
        "a.id",
        "a.file_name",
        "a.content_type",
        "a.size_bytes",
        "a.sha256",
        "a.status",
        "a.version_no",
        "a.created_at",
        "a.storage_key",
      ])
      .where("a.tenant_id", "=", params.tenantId)
      .where("a.storage_bucket", "=", this.storageBucket)
      .where("a.status", "in", params.statuses as never);

    if (params.idempotencyKey) {
      query = query.where(sql`a.metadata ->> 'idempotency_key'`, "=", params.idempotencyKey);
    }
    if (params.hash) {
      query = query.where("a.sha256", "=", params.hash);
    }
    const row = await query
      .orderBy("a.created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id:         row["id"] as string,
      fileName:   row["file_name"] as string,
      contentType: row["content_type"] as string,
      sizeBytes: Number(row["size_bytes"] ?? 0),
      sha256:    row["sha256"] as string,
      status:     row["status"] as AttachmentStatus,
      versionNo:  Number(row["version_no"] ?? 1),
      createdAt:  row["created_at"],
      storageKey: row["storage_key"] as string,
    };
  }

  // ── Download ─────────────────────────────────────────────────────────────────

  async download(params: {
    tenantId:    string;
    entityType:  string;
    entityId:    string;
    attachmentId: string;
    principalId:  string;
    requestId?:   string;
    userAgent?:   string;
  }): Promise<DownloadResult | null> {
    const { tenantId, entityType, entityId, attachmentId, principalId, requestId, userAgent } = params;

    const row = await this.db
      .selectFrom("master.entity_document_link as edl")
      .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
      .select([
        "a.id",
        "a.file_name",
        "a.content_type",
        "a.size_bytes",
        "a.storage_key",
        "a.status",
      ])
      .where("edl.tenant_id", "=", tenantId)
      .where("edl.entity_type", "=", entityType)
      .where("edl.entity_id", "=", entityId)
      .where("a.id", "=", attachmentId)
      .where("a.status", "=", "active")
      .executeTakeFirst();

    if (!row) return null;

    const r = row as Record<string, unknown>;
    const buffer = await this.storage.get(r["storage_key"] as string);

    // Access audit — best-effort; never blocks the response
    void this.writeAccessLog({
      tenantId,
      attachmentId,
      attachmentName:      r["file_name"] as string,
      attachmentSizeBytes: Number(r["size_bytes"] ?? 0),
      mimeType:            (r["content_type"] as string) ?? "application/octet-stream",
      principalId,
      entityType,
      entityId,
      requestId,
      userAgent,
      outcome:             "success",
    });

    return {
      buffer,
      fileName:    r["file_name"] as string,
      contentType: (r["content_type"] as string) ?? "application/octet-stream",
    };
  }

  // ── Download (streaming) ─────────────────────────────────────────────────────
  // Preferred for HTTP responses. Bytes flow directly from S3 to the client
  // without being buffered in the Node.js heap.
  // Caller is responsible for piping the stream and handling stream errors.

  async downloadStream(params: {
    tenantId:     string;
    entityType:   string;
    entityId:     string;
    attachmentId: string;
    principalId:  string;
    requestId?:   string;
    userAgent?:   string;
  }): Promise<DownloadStreamResult | null> {
    const { tenantId, entityType, entityId, attachmentId, principalId, requestId, userAgent } = params;

    const row = await this.db
      .selectFrom("master.entity_document_link as edl")
      .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
      .select([
        "a.id",
        "a.file_name",
        "a.content_type",
        "a.size_bytes",
        "a.storage_key",
        "a.status",
      ])
      .where("edl.tenant_id",  "=", tenantId)
      .where("edl.entity_type","=", entityType)
      .where("edl.entity_id",  "=", entityId)
      .where("a.id",           "=", attachmentId)
      .where("a.status",       "=", "active")
      .executeTakeFirst();

    if (!row) return null;

    const r      = row as Record<string, unknown>;
    const stream = await this.storage.getStream(r["storage_key"] as string);

    // Access audit — best-effort; never blocks the response
    void this.writeAccessLog({
      tenantId,
      attachmentId,
      attachmentName:      r["file_name"] as string,
      attachmentSizeBytes: Number(r["size_bytes"] ?? 0),
      mimeType:            (r["content_type"] as string) ?? "application/octet-stream",
      principalId,
      entityType,
      entityId,
      requestId,
      userAgent,
      outcome: "success",
    });

    return {
      stream,
      fileName:    r["file_name"] as string,
      contentType: (r["content_type"] as string) ?? "application/octet-stream",
      sizeBytes:   Number(r["size_bytes"] ?? 0),
    };
  }

  // ── Unlink / delete ──────────────────────────────────────────────────────────

  /**
   * Removes the entity→attachment link.
   * If no links remain, marks the attachment logical-deleted (status='deleted').
   * Physical S3 object deletion is deferred — not performed here.
   * Returns false when the link was not found.
   */
  async unlink(params: {
    tenantId:    string;
    entityType:  string;
    entityId:    string;
    attachmentId: string;
    principalId: string;
  }): Promise<boolean> {
    const { tenantId, entityType, entityId, attachmentId, principalId } = params;
    const authContext = `${entityType}:${entityId}`;

    // Remove the specific link first
    await this.db
      .deleteFrom("master.entity_document_link" as never)
      .where("tenant_id"    as never, "=", tenantId    as never)
      .where("entity_type"  as never, "=", entityType  as never)
      .where("entity_id"    as never, "=", entityId    as never)
      .where("attachment_id" as never, "=", attachmentId as never)
      .execute();

    // Count remaining links across all entities for this attachment
    const countRow = await this.db
      .selectFrom("master.entity_document_link" as never)
      .select(sql<string>`COUNT(*)`.as("count") as never)
      .where("attachment_id" as never, "=", attachmentId as never)
      .where("tenant_id"     as never, "=", tenantId     as never)
      .executeTakeFirst();

    const remaining = Number((countRow as Record<string, unknown>)?.count ?? 0);
    if (remaining === 0) {
      // Logical delete — no active links remain
      await this.markDeleted({
        tenantId,
        attachmentId,
        principalId,
        metadata: { authContext, remainingLinks: 0 },
      });
    } else {
      // Decrement reference_count (floor at 0)
      await this.db
        .updateTable("master.attachment" as never)
        .set({
          reference_count: sql`GREATEST(reference_count - 1, 0)`,
          updated_at:      new Date(),
          updated_by:      principalId,
        } as never)
        .where("id"        as never, "=", attachmentId as never)
        .where("tenant_id" as never, "=", tenantId     as never)
        .execute();

      this.logger?.info("attachment_reference_count_decremented", {
        attachmentId,
        tenantId,
        authContext,
        principalId,
        source: "unlink",
        remainingLinks: remaining,
      });
    }

    return true;
  }

  async markUploaded(params: {
    tenantId: string;
    attachmentId: string;
    principalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.transitionStatus({ ...params, toStatus: "uploaded" });
  }

  async markQuarantined(params: {
    tenantId: string;
    attachmentId: string;
    principalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.transitionStatus({ ...params, toStatus: "quarantined" });
  }

  async markActive(params: {
    tenantId: string;
    attachmentId: string;
    principalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.transitionStatus({ ...params, toStatus: "active" });
  }

  async markFailed(params: {
    tenantId: string;
    attachmentId: string;
    principalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.transitionStatus({ ...params, toStatus: "failed" });
  }

  async markOrphaned(params: {
    tenantId: string;
    attachmentId: string;
    principalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.transitionStatus({ ...params, toStatus: "orphaned" });
  }

  async markDeleted(params: {
    tenantId: string;
    attachmentId: string;
    principalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.transitionStatus({ ...params, toStatus: "deleted" });
  }

  async markArchived(params: {
    tenantId: string;
    attachmentId: string;
    principalId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.transitionStatus({ ...params, toStatus: "archived" });
  }

  private async transitionStatus(params: {
    tenantId: string;
    attachmentId: string;
    toStatus: AttachmentStatus;
    principalId?: string;
    metadata?: AttachmentTransitionMetadata | Record<string, unknown>;
  }): Promise<void> {
    const {
      tenantId,
      attachmentId,
      toStatus,
      principalId,
      metadata = {},
    } = params;

    const before = await this.db
      .selectFrom("master.attachment" as never)
      .select(["status" as never, "reference_count" as never])
      .where("id"        as never, "=", attachmentId as never)
      .where("tenant_id" as never, "=", tenantId     as never)
      .executeTakeFirst();

    const beforeStatus = (before as Record<string, unknown> | undefined)?.status as AttachmentStatus | undefined;
    const beforeReferenceCount = Number((before as Record<string, unknown> | undefined)?.reference_count ?? 0);

    if (!beforeStatus) {
      throw new Error(`attachment_not_found:${attachmentId}`);
    }
    if (!allowedStatusTransitions.get(beforeStatus)?.has(toStatus)) {
      throw new Error(`invalid_attachment_transition:${beforeStatus}->${toStatus}`);
    }

    await this.db
      .updateTable("master.attachment" as never)
      .set({
        status:            toStatus,
        status_changed_at:  new Date(),
        status_changed_by:  principalId ?? null,
        is_active:         isActiveAttachmentStatus.has(toStatus),
        updated_at:        new Date(),
        updated_by:        principalId ?? null,
        ...(toStatus === "deleted" && {
          reference_count: 0,
        }),
      } as never)
      .where("id"        as never, "=", attachmentId as never)
      .where("tenant_id" as never, "=", tenantId     as never)
      .execute();

    this.logger?.info("attachment_status_transition", {
      attachmentId,
      tenantId,
      fromStatus: beforeStatus ?? "unknown",
      toStatus,
      source: "attachment_service",
      principalId: principalId ?? null,
      beforeReferenceCount,
      metadata,
    });
  }

  // ── Access audit (best-effort) ────────────────────────────────────────────────

  private async writeAccessLog(params: {
    tenantId:            string;
    attachmentId:        string;
    attachmentName:      string;
    attachmentSizeBytes: number;
    mimeType:            string;
    principalId:         string;
    entityType:          string;
    entityId:            string;
    requestId?:          string;
    userAgent?:          string;
    outcome:             string;
  }): Promise<void> {
    // entity_id in log table is uuid (not text) — only set when it parses as UUID
    const entityUuid = UUID_RE.test(params.entityId) ? params.entityId : null;

    await this.db
      .insertInto("log.attachment_access_log" as never)
      .values({
        tenant_id:              params.tenantId,
        principal_id:           params.principalId,
        attachment_id:          params.attachmentId,
        parent_entity_type:     params.entityType,
        ...(entityUuid ? { parent_entity_id: entityUuid } : {}),
        access_type:            "download",
        attachment_name:        params.attachmentName,
        attachment_size_bytes:  params.attachmentSizeBytes,
        attachment_mime_type:   params.mimeType,
        ...(params.requestId ? { request_id: params.requestId } : {}),
        ...(params.userAgent ? { user_agent: params.userAgent } : {}),
        outcome:                params.outcome,
        created_by:             params.principalId,
      } as never)
      .execute();
  }
}
