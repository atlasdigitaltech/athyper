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

import { createHash } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";

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
  /**
   * Override the initial attachment status.
   * Default: "active". Set to "quarantined" when a virus is detected so the
   * file is stored for admin review but blocked from normal downloads.
   */
  initialStatus?: "active" | "quarantined";
  /**
   * Whether the file has been through virus scanning.
   * Default: false (scanning not configured or not yet run).
   */
  isVirusScanned?: boolean;
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
  status:      string;
  versionNo:   number;
  createdAt:   unknown;
  storageKey:  string;
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
}

// ── UUID guard ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Service ───────────────────────────────────────────────────────────────────

export class ContentAttachmentService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly db: Kysely<any>,
    private readonly storage: ObjectStorageAdapter,
    private readonly storageBucket: string,
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
      initialStatus = "active",
      isVirusScanned = false,
      scanMeta,
    } = params;

    const attachmentId = crypto.randomUUID();
    const storageKey   = this.generateStorageKey(tenantId, entityType, entityId, attachmentId, fileName, 1, companyCode, tenantCode);
    const sha256       = createHash("sha256").update(fileBuffer).digest("hex");

    // ── Step 1: upload to S3 before touching the DB ──────────────────────────
    await this.storage.put(storageKey, fileBuffer, { contentType });

    // ── Step 2: DB transaction — compensate S3 on failure ────────────────────
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
            is_active:                 initialStatus !== "quarantined",
            is_virus_scanned:          isVirusScanned,
            is_preview_generation_failed: false,
            is_auto_delete_on_expiry:  false,
            status:                    initialStatus,
            status_changed_at:         initialStatus === "quarantined" ? new Date() : null,
            uploaded_by:               principalId,
            created_by:                principalId,
            metadata:                  scanMeta ? { scan: scanMeta } : {},
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
            entity_id:     entityId,   // text column — no cast needed
            attachment_id: attachmentId,
            link_kind:     linkKind,
            display_order: 0,
            created_by:    principalId,
          } as never)
          .execute();

        return row as Record<string, unknown>;
      });

      return {
        id:          attachment["id"] as string,
        fileName:    attachment["file_name"] as string,
        contentType: attachment["content_type"] as string,
        sizeBytes:   Number(attachment["size_bytes"] ?? 0),
        status:      attachment["status"] as string,
        versionNo:   Number(attachment["version_no"] ?? 1),
        createdAt:   attachment["created_at"],
        storageKey:  attachment["storage_key"] as string,
      };
    } catch (err) {
      // Compensating delete — best effort; log silently
      await this.storage.delete(storageKey).catch(() => {});
      throw err;
    }
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
    } = params;

    const attachmentId  = crypto.randomUUID();
    const storageKey    = this.generateStorageKey(tenantId, entityType, entityId, attachmentId, fileName, 1, companyCode, tenantCode);

    // Pipe the incoming stream through the hashing transform before S3
    const sha256Stream  = new Sha256PassThrough();
    stream.pipe(sha256Stream);

    // ── Step 1: stream to S3 via multipart ──────────────────────────────────
    await this.storage.putStream(storageKey, sha256Stream, {
      contentType,
      contentLength,
      partSize: 5 * 1024 * 1024,  // 5 MiB
    });

    // Stream fully consumed — hash and byte count are now stable
    const sha256    = sha256Stream.digest();
    const sizeBytes = sha256Stream.byteCount;

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
            size_bytes:                   sizeBytes,
            sha256,
            kind:                         "attachment",
            storage_bucket:               this.storageBucket,
            storage_key:                  storageKey,
            version_no:                   1,
            reference_count:              1,
            is_current:                   true,
            is_active:                    true,
            is_virus_scanned:             false,
            is_preview_generation_failed: false,
            is_auto_delete_on_expiry:     false,
            status:                       "active",
            uploaded_by:                  principalId,
            created_by:                   principalId,
            metadata:                     {},
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

      return {
        id:          attachment["id"] as string,
        fileName:    attachment["file_name"] as string,
        contentType: attachment["content_type"] as string,
        sizeBytes:   Number(attachment["size_bytes"] ?? sizeBytes),
        status:      attachment["status"] as string,
        versionNo:   Number(attachment["version_no"] ?? 1),
        createdAt:   attachment["created_at"],
        storageKey:  attachment["storage_key"] as string,
      };
    } catch (err) {
      await this.storage.delete(storageKey).catch(() => {});
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
      await this.db
        .updateTable("master.attachment" as never)
        .set({
          status:             "deleted",
          status_changed_at:  new Date(),
          status_changed_by:  principalId,
          is_active:          false,
          reference_count:    0,
          updated_at:         new Date(),
          updated_by:         principalId,
        } as never)
        .where("id"        as never, "=", attachmentId as never)
        .where("tenant_id" as never, "=", tenantId     as never)
        .execute();
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
    }

    return true;
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
