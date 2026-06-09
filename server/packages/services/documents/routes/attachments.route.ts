/**
 * Document Attachments Routes — S3-backed implementation
 *
 * GET    /documents/:docType/:id/attachments                         — list
 * POST   /documents/:docType/:id/attachments                         — upload
 * GET    /documents/:docType/:id/attachments/:attachmentId/download  — stream
 * DELETE /documents/:docType/:id/attachments/:attachmentId           — unlink
 *
 * Upload body (JSON — BFF relay converts multipart/form-data → base64 JSON):
 *   { filename, content_type?, size_bytes?, data_base64 }
 *
 * Storage: bytes in MinIO/S3 (master.attachment + master.entity_document_link).
 * Requires objectStorage adapter injected via deps.
 * When adapter is absent routes return 503 with STORAGE_UNAVAILABLE.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import busboy from "busboy";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import { JOB_NAME, type ExtractTextJobData, type SweepJobData } from "@athyper/svc-jobs";
import { resolveDocumentEntity } from "./entity-resolver.js";
import {
  ContentAttachmentService,
  type UploadResult,
} from "../services/attachment.service.js";

// ── Response shape (shared by JSON and multipart paths) ───────────────────────

function toAttachmentResponse(result: UploadResult, docType: string, docId: string) {
  return {
    id:              result.id,
    filename:        result.fileName,
    content_type:    result.contentType,
    size_bytes:      result.sizeBytes,
    created_at:      result.createdAt,
    status:          result.status,
    version_no:      result.versionNo,
    created_by_name: null,
    download_url: `/api/relay/api/documents/${encodeURIComponent(docType)}/${encodeURIComponent(docId)}/attachments/${encodeURIComponent(result.id)}/download`,
  };
}

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface AttachmentsRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  objectStorage?: {
    adapter:      ObjectStorageAdapter;
    bucket:       string;
    /** Maximum allowed multipart upload in MiB. Default: 100. */
    maxUploadMb?: number;
  };
  /**
   * BullMQ queue for attachment text extraction (Tika). When present, an
   * extract-text job is enqueued after each successful upload. Absent when
   * DOCPARSER_URL is unset — uploads still succeed; extraction simply never runs.
   *
   * Typed as ExtractTextJobData | SweepJobData to match the queue exported
   * by svc-jobs (the sweep scheduler shares the same queue). This route only
   * calls .add() with ExtractTextJobData, which is assignable to the union.
   */
  tikaQueue?: Queue<ExtractTextJobData | SweepJobData>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Principal resolver ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolvePrincipalId(db: Kysely<any>, sub: string, tenantId: string, realmKey = "athyper"): Promise<string> {
  if (!sub) return SYSTEM_PRINCIPAL_UUID;
  const existing = await db
    .selectFrom("master.principal_identity_binding as pab")
    .select("pab.principal_id")
    .where("pab.subject_id", "=", sub)
    .where("pab.realm_key", "=", realmKey)
    .where("pab.tenant_id", "=", tenantId)
    .executeTakeFirst();
  return existing ? (existing.principal_id as string) : SYSTEM_PRINCIPAL_UUID;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerAttachmentRoutes(router: Router, deps: AttachmentsRouteDeps): void {
  const { db, auth, objectStorage, tikaQueue, logger } = deps;

  /**
   * Fire-and-forget enqueue of a Tika extraction job. Never throws — upload
   * completion must not depend on Redis availability. Missing queue (no
   * DOCPARSER_URL configured) is a silent no-op.
   */
  function enqueueTikaExtract(attachmentId: string, tenantId: string): void {
    if (!tikaQueue) return;
    void tikaQueue
      .add(
        JOB_NAME.EXTRACT_TEXT,
        { attachmentId, tenantId },
        {
          jobId:       `tika:${attachmentId}`,  // dedup: repeat uploads of same id collapse
          attempts:    3,
          backoff:     { type: "exponential", delay: 30_000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail:     { age: 86_400 },
        },
      )
      .catch((err: unknown) => {
        logger?.warn("tika_enqueue_failed", {
          attachmentId, tenantId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }

  // ── Guard: no storage adapter → 503 on all attachment routes ───────────────
  if (!objectStorage) {
    const unavailable: RequestHandler = (_req, res) => {
      res.status(503).json({
        error:   "STORAGE_UNAVAILABLE",
        message: "Object storage is not configured for this runtime",
      });
    };
    router.get(    "/documents/:docType/:id/attachments/:attachmentId/download", unavailable);
    router.get(    "/documents/:docType/:id/attachments",                        unavailable);
    router.post(   "/documents/:docType/:id/attachments",                        unavailable);
    router.delete( "/documents/:docType/:id/attachments/:attachmentId",          unavailable);
    return;
  }

  const svc = new ContentAttachmentService(db, objectStorage.adapter, objectStorage.bucket);
  const maxUploadBytes = (objectStorage.maxUploadMb ?? 100) * 1024 * 1024;

  // ── LIST attachments ──────────────────────────────────────────────────────────
  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id } = req.params as { docType: string; id: string };
      if (!isUuid(id)) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
        return;
      }

      const items = await svc.list({
        tenantId,
        entityType: entity.name as string,
        entityId:   id,
      });

      // Fetch folder_id per link row (not on the attachment itself)
      const folderMap = await db
        .selectFrom("master.entity_document_link as edl")
        .select(["edl.attachment_id", "edl.folder_id"])
        .where("edl.tenant_id",  "=", tenantId)
        .where("edl.entity_type","=", entity.name as string)
        .where("edl.entity_id",  "=", id)
        .execute()
        .then((rows) => {
          const m: Record<string, string | null> = {};
          (rows as Record<string, unknown>[]).forEach((r) => {
            m[r["attachment_id"] as string] = (r["folder_id"] as string) ?? null;
          });
          return m;
        });

      res.json(
        items.map((item) => ({
          id:              item.id,
          filename:        item.fileName,
          content_type:    item.contentType,
          size_bytes:      item.sizeBytes,
          created_at:      item.createdAt,
          status:          item.status,
          created_by_name: item.uploadedByName,
          link_kind:       item.linkKind,
          version_no:      item.versionNo,
          folder_id:       folderMap[item.id] ?? null,
          download_url: `/api/relay/api/documents/${encodeURIComponent(docType)}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(item.id)}/download`,
        })),
      );
    } catch (err) {
      logger?.error("attachments_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── UPLOAD attachment (JSON base64 path) ─────────────────────────────────────
  // Used by the BFF relay which converts multipart → base64 JSON.
  // Capped by Express body parser at 256 KB (effective ~192 KB raw file).
  const uploadJsonHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id } = req.params as { docType: string; id: string };
      if (!isUuid(id)) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
        return;
      }

      const body = req.body as {
        filename?:     string;
        content_type?: string;
        size_bytes?:   number;
        data_base64?:  string;
      };

      if (!body.filename || !body.data_base64) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "filename and data_base64 are required" });
        return;
      }

      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data_base64)) {
        res.status(400).json({ error: "INVALID_BASE64", message: "data_base64 must be valid base64" });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);
      const fileBuffer  = Buffer.from(body.data_base64, "base64");
      const sizeBytes   = body.size_bytes ?? fileBuffer.length;
      const contentType = (body.content_type ?? "application/octet-stream").slice(0, 200);

      const tenantCode  = (xOrg.split("--")[0] ?? "").trim() || undefined;
      const companyCode = (xOrg.split("--")[1] ?? "").trim() || undefined;

      const result = await svc.upload({
        tenantId,
        tenantCode,
        companyCode,
        entityType:  entity.name as string,
        entityId:    id,
        fileBuffer,
        fileName:    body.filename.slice(0, 500),
        contentType,
        sizeBytes,
        principalId,
        linkKind: "related",
      });

      enqueueTikaExtract(result.id, tenantId);

      res.status(201).json(toAttachmentResponse(result, docType, id));
    } catch (err) {
      logger?.error("attachments_upload_error", { err: String(err) });
      next(err);
    }
  };

  // ── UPLOAD attachment (multipart/form-data streaming path) ───────────────────
  // For clients that POST multipart directly (no BFF base64 conversion).
  // The file stream is piped straight to S3 via putStream() — nothing buffered.
  // Form fields: no required fields beyond the file part itself.
  //   field "link_kind" — optional, defaults to "related"
  // File part: any field name; first file part wins.
  const uploadMultipartHandler: RequestHandler = (req, res, next) => {
    // Auth and param validation — must happen synchronously before piping
    void (async () => {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id } = req.params as { docType: string; id: string };
      if (!isUuid(id)) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);

      // ── Parse multipart with busboy ────────────────────────────────────────
      const bb = busboy({
        headers: req.headers,
        limits: {
          files:    1,                // accept first file only
          fileSize: maxUploadBytes,
        },
      });

      // Collect form fields (link_kind etc.) before/alongside the file part
      const fields: Record<string, string> = {};
      bb.on("field", (name, val) => { fields[name] = val; });

      // uploadPromise resolves when S3 + DB are both done
      let uploadPromise: Promise<UploadResult> | null = null;
      let fileLimitExceeded = false;

      const tenantCode  = (xOrg.split("--")[0] ?? "").trim() || undefined;
      const companyCode = (xOrg.split("--")[1] ?? "").trim() || undefined;

      bb.on("file", (_fieldName, fileStream, info) => {
        const { filename, mimeType } = info;

        fileStream.on("limit", () => {
          fileLimitExceeded = true;
          // Drain and abort — busboy won't emit "finish" until stream is consumed
          fileStream.resume();
        });

        uploadPromise = svc.uploadStream({
          tenantId,
          tenantCode,
          companyCode,
          entityType:    entity.name as string,
          entityId:      id,
          stream:        fileStream,
          fileName:      (filename || "upload").slice(0, 500),
          contentType:   (mimeType || "application/octet-stream").slice(0, 200),
          principalId,
          linkKind:      (fields["link_kind"] as "related" | undefined) ?? "related",
        });
      });

      bb.on("finish", () => {
        if (fileLimitExceeded) {
          res.status(413).json({
            error:   "FILE_TOO_LARGE",
            message: `File exceeds the ${objectStorage.maxUploadMb ?? 100} MB limit`,
          });
          return;
        }

        if (!uploadPromise) {
          res.status(400).json({ error: "NO_FILE", message: "No file part found in multipart body" });
          return;
        }

        uploadPromise
          .then((result) => {
            enqueueTikaExtract(result.id, tenantId);
            res.status(201).json(toAttachmentResponse(result, docType, id));
          })
          .catch((err: unknown) => {
            logger?.error("attachments_multipart_upload_error", { err: String(err) });
            next(err instanceof Error ? err : new Error(String(err)));
          });
      });

      bb.on("error", (err: unknown) => {
        logger?.error("attachments_multipart_parse_error", { err: String(err) });
        next(err instanceof Error ? err : new Error(String(err)));
      });

      req.pipe(bb);
    })();
  };

  // ── Content-type dispatcher ───────────────────────────────────────────────────
  // Single POST route; delegates to the right handler based on Content-Type.
  const uploadHandler: RequestHandler = (req, res, next) => {
    const ct = (req.headers["content-type"] ?? "").toLowerCase();
    if (ct.includes("multipart/form-data")) {
      uploadMultipartHandler(req, res, next);
    } else {
      uploadJsonHandler(req, res, next);
    }
  };

  // ── DOWNLOAD attachment (streaming) ──────────────────────────────────────────
  // Bytes flow from S3 directly to the HTTP response — no full-file buffer.
  // Headers (Content-Length, Content-Type, Content-Disposition) are written
  // before the pipe starts; mid-stream S3 errors are forwarded to next().
  const downloadHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id, attachmentId } = req.params as {
        docType: string; id: string; attachmentId: string;
      };

      if (!isUuid(id) || !isUuid(attachmentId)) {
        res.status(404).json({ error: "NOT_FOUND", message: "Attachment not found" });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
        return;
      }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);

      const file = await svc.downloadStream({
        tenantId,
        entityType:   entity.name as string,
        entityId:     id,
        attachmentId,
        principalId,
        requestId:    req.headers["x-request-id"] as string | undefined,
        userAgent:    req.headers["user-agent"] as string | undefined,
      });

      if (!file) {
        res.status(404).json({ error: "ATTACHMENT_NOT_FOUND", message: "Attachment not found" });
        return;
      }

      const safeFileName = file.fileName.replace(/"/g, '\\"');
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
      if (file.sizeBytes > 0) {
        res.setHeader("Content-Length", file.sizeBytes);
      }

      // Pipe S3 stream → HTTP response.
      // On stream error: destroy the response to unblock the client, then
      // forward to Express error handler for logging.
      file.stream.on("error", (streamErr: Error) => {
        logger?.error("attachments_download_stream_error", { err: streamErr.message });
        if (!res.headersSent) {
          next(streamErr);
        } else {
          res.destroy(streamErr);
        }
      });

      (file.stream as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      logger?.error("attachments_download_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE (unlink) attachment ────────────────────────────────────────────────
  const deleteHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id, attachmentId } = req.params as {
        docType: string; id: string; attachmentId: string;
      };

      if (!isUuid(id) || !isUuid(attachmentId)) {
        res.status(404).json({ error: "NOT_FOUND", message: "Attachment not found" });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
        return;
      }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);

      await svc.unlink({
        tenantId,
        entityType:   entity.name as string,
        entityId:     id,
        attachmentId,
        principalId,
      });

      res.status(204).end();
    } catch (err) {
      logger?.error("attachments_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── REINDEX attachment (force re-extraction of text + PII) ──────────────────
  // Resets text_extraction_status → NULL (so the worker re-processes even if
  // the row was previously extracted / skipped / failed) and enqueues a fresh
  // job with a reindex-scoped jobId — bypasses the dedup key used by the
  // normal upload path and the sweep.
  const reindexHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id, attachmentId } = req.params as {
        docType: string; id: string; attachmentId: string;
      };

      if (!isUuid(id) || !isUuid(attachmentId)) {
        res.status(404).json({ error: "NOT_FOUND", message: "Attachment not found" });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
        return;
      }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      if (!tikaQueue) {
        res.status(503).json({
          error:   "TIKA_UNAVAILABLE",
          message: "Text extraction is not configured on this runtime",
        });
        return;
      }

      // Verify attachment exists, belongs to this tenant, AND is linked to
      // the (entity_type, entity_id) pair the caller is authorised against.
      const link = await db
        .selectFrom("master.entity_document_link as edl")
        .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
        .select(["a.id" as never])
        .where("edl.tenant_id" as never,  "=", tenantId as never)
        .where("edl.entity_type" as never,"=", (entity.name as string) as never)
        .where("edl.entity_id" as never,  "=", id as never)
        .where("a.id" as never,           "=", attachmentId as never)
        .where("a.status" as never,       "=", "active" as never)
        .executeTakeFirst();

      if (!link) {
        res.status(404).json({ error: "ATTACHMENT_NOT_FOUND", message: "Attachment not found" });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);

      // Reset extraction + PII state so the worker doesn't short-circuit on
      // the "already extracted" check.
      await db
        .updateTable("master.attachment" as never)
        .set({
          text_extraction_status: null,
          text_extraction_error:  null,
          text_extracted_at:      null,
          extracted_text:         null,
          extracted_text_chars:   null,
          pii_detected:           false,
          pii_types:              JSON.stringify([]),
          pii_scanned_at:         null,
          updated_at:             new Date(),
          updated_by:             principalId,
        } as never)
        .where("id" as never,        "=", attachmentId as never)
        .where("tenant_id" as never, "=", tenantId     as never)
        .execute();

      // Fresh jobId so BullMQ doesn't collapse this onto an existing / stale job.
      await tikaQueue.add(
        JOB_NAME.EXTRACT_TEXT,
        { attachmentId, tenantId },
        {
          jobId:    `tika:${attachmentId}:reindex:${Date.now()}`,
          attempts: 3,
          backoff:  { type: "exponential", delay: 30_000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail:     { age: 86_400 },
        },
      );

      res.status(202).json({ status: "enqueued", attachment_id: attachmentId });
    } catch (err) {
      logger?.error("attachments_reindex_error", { err: String(err) });
      next(err);
    }
  };

  // ── RENAME attachment (PATCH) ────────────────────────────────────────────────
  const renameHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id, attachmentId } = req.params as {
        docType: string; id: string; attachmentId: string;
      };

      if (!isUuid(id) || !isUuid(attachmentId)) {
        res.status(404).json({ error: "NOT_FOUND", message: "Attachment not found" });
        return;
      }

      const body = req.body as { filename?: string };
      const newFilename = body.filename?.trim().slice(0, 500);
      if (!newFilename) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "filename is required" });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant" });
        return;
      }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);

      // Verify attachment belongs to this entity before renaming
      const link = await db
        .selectFrom("master.entity_document_link as edl")
        .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
        .select(["a.id"] as never[])
        .where("edl.tenant_id"  as never, "=", tenantId              as never)
        .where("edl.entity_type" as never, "=", (entity.name as string) as never)
        .where("edl.entity_id"  as never, "=", id                    as never)
        .where("a.id"           as never, "=", attachmentId           as never)
        .where("a.status"       as never, "=", "active"              as never)
        .executeTakeFirst();

      if (!link) {
        res.status(404).json({ error: "ATTACHMENT_NOT_FOUND", message: "Attachment not found" });
        return;
      }

      await db
        .updateTable("master.attachment" as never)
        .set({
          file_name:  newFilename as never,
          updated_at: new Date()  as never,
          updated_by: principalId as never,
        } as never)
        .where("id"        as never, "=", attachmentId as never)
        .where("tenant_id" as never, "=", tenantId     as never)
        .execute();

      res.json({ id: attachmentId, filename: newFilename });
    } catch (err) {
      logger?.error("attachments_rename_error", { err: String(err) });
      next(err);
    }
  };

  // Register routes — more specific paths first
  router.get(    "/documents/:docType/:id/attachments/:attachmentId/download", downloadHandler);
  router.post(   "/documents/:docType/:id/attachments/:attachmentId/reindex",  reindexHandler);
  router.patch(  "/documents/:docType/:id/attachments/:attachmentId",          renameHandler);
  router.get(    "/documents/:docType/:id/attachments",                        listHandler);
  router.post(   "/documents/:docType/:id/attachments",                        uploadHandler);
  router.delete( "/documents/:docType/:id/attachments/:attachmentId",          deleteHandler);
}
