/**
 * Collab Attachment Upload Route
 *
 * POST /api/collab/attachments
 *   Accepts multipart/form-data (field name "file") OR
 *   JSON { filename, content_type?, size_bytes?, data_base64 }.
 *   Stores file in S3, inserts document.attachment row (status='active').
 *   Returns { attachment_id, file_name, content_type, size_bytes }.
 *   NOTE: No entity_document_link is created here. The link is created
 *   atomically when the comment is submitted (POST /api/collab/comments
 *   with attachment_ids[]).
 *
 * DELETE /api/collab/attachments/:attachmentId
 *   Soft-deletes a staged (unlinked) attachment the caller owns.
 *   Rejects if attachment already has links (i.e. has been committed).
 *
 * GET /api/collab/attachments/:attachmentId/download
 *   Presigned redirect (302) to S3 object. Logs access audit.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import busboy from "busboy";
import {
  verifyBearer,
  isUuid,
  resolveAttachmentAuthContext,
} from "@athyper/svc-shared";
import type { ObjectStorageAdapter } from "@athyper/adapter-object-storage";
import { createHash } from "node:crypto";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface CollabAttachmentsRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  objectStorage?: { adapterRef: { current: ObjectStorageAdapter | null }; bucket: string; maxUploadMb?: number };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
    info?(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.\-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);
}

function storageKey(tenantCode: string, companyCode: string, attachmentId: string, fileName: string): string {
  const now   = new Date();
  const year  = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${tenantCode}/${companyCode}/${year}/${month}/collab/${attachmentId}/v1/${sanitizeFileName(fileName)}`;
}

async function resolveAttachmentMaxBytes(
  db: Kysely<any>,
  tenantId: string,
  fallbackBytes: number,
): Promise<number> {
  try {
    const result = await sql<{ value_text: string | null }>`
      SELECT COALESCE(
        CASE
          WHEN tv.override_enabled IS TRUE THEN tv.value
          ELSE COALESCE(d.product_value, d.default_value)
        END,
        to_jsonb(${fallbackBytes}::int)
      ) #>> '{}' AS value_text
      FROM control.parameter_definition d
      LEFT JOIN master.tenant_parameter_value tv
        ON tv.tenant_id = ${tenantId}::uuid
       AND tv.parameter_code = d.code
       AND tv.status = 'active'
       AND now() >= tv.effective_from
       AND (tv.effective_to IS NULL OR now() < tv.effective_to)
      WHERE d.code = 'collab.attachments.max_file_bytes'
        AND d.status = 'active'
        AND d.is_enabled = true
      LIMIT 1
    `.execute(db);
    const n = Number(result.rows[0]?.value_text);
    return Number.isFinite(n) && n > 0 ? n : fallbackBytes;
  } catch {
    return fallbackBytes;
  }
}

function formatMegabytes(bytes: number): string {
  return Math.max(1, Math.floor(bytes / (1024 * 1024))).toString();
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerCollabAttachmentRoutes(router: Router, deps: CollabAttachmentsRouteDeps): void {
  const { db, auth, objectStorage, logger } = deps;

  const unavailable: RequestHandler = (_req, res) => {
    res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage is not configured" });
  };

  if (!objectStorage) {
    router.post(  "/collab/attachments",                               unavailable);
    router.delete("/collab/attachments/:attachmentId",                 unavailable);
    router.get(   "/collab/attachments/:attachmentId/download",        unavailable);
    router.post(  "/collab/attachments/:attachmentId/link",            unavailable);
    router.delete("/collab/attachments/:attachmentId/link",            unavailable);
    router.patch( "/collab/attachments/:attachmentId/properties",      unavailable);
    router.get(   "/collab/entity-attachments",                        unavailable);
    return;
  }

  const { adapterRef, bucket, maxUploadMb = 100 } = objectStorage;
  const fallbackMaxBytes = maxUploadMb * 1024 * 1024;

  // ── Shared upload core (used by both JSON and multipart paths) ───────────────

  async function authorize(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    claims: Record<string, unknown>,
  ): Promise<{ tenantId: string; principalId: string; tenantCode: string; companyCode: string } | null> {
    const headerOrg = (req.headers["x-org"] as string) ?? "";
    const headerRealm = (req.headers["x-realm-key"] as string | undefined) ?? (req.headers["x-realm"] as string | undefined);
    const authSource = {
      type: "token",
      headerOrgPresent: Boolean(headerOrg),
      headerRealmPresent: Boolean(headerRealm),
    };
    logger?.info?.("collab_attachment_auth_attempt", {
      authSource,
      tenantHeader: headerOrg,
      realmHeader: headerRealm,
    });
    const authAttempt = await resolveAttachmentAuthContext(db, claims, headerOrg, headerRealm);
    if (!authAttempt.ok) {
      logger?.warn?.("collab_attachment_auth_denied", {
        authSource,
        reason: authAttempt.error,
        tenantHeader: headerOrg,
        realmHeader: headerRealm,
      });
      res.status(authAttempt.status).json({ error: authAttempt.error, message: authAttempt.message });
      return null;
    }
    return {
      tenantId: authAttempt.context.tenantId,
      principalId: authAttempt.context.principalId,
      tenantCode: authAttempt.context.tenantCode,
      companyCode: authAttempt.context.companyCode || authAttempt.context.tenantId,
    };
  }

  async function performUpload(opts: {
    adapter:      ObjectStorageAdapter;
    tenantId:     string;
    tenantCode:   string;
    companyCode:  string;
    principalId:  string;
    fileName:     string;
    contentType:  string;
    sizeBytes:    number;
    fileBuffer:   Buffer;
  }): Promise<{ attachment_id: string; file_name: string; content_type: string; size_bytes: number; is_duplicate: boolean }> {
    const { adapter, tenantId, tenantCode, companyCode, principalId, fileName, contentType, sizeBytes, fileBuffer } = opts;
    const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
    const attachmentId = crypto.randomUUID();
    const key = storageKey(tenantCode, companyCode, attachmentId, fileName);

    // sha256 dedup — reuse only if the object lives in the CURRENT bucket.
    const existing = await db
      .selectFrom("document.attachment as a")
      .select(["a.id", "a.storage_key"])
      .where("a.tenant_id",      "=", tenantId)
      .where("a.sha256",         "=", sha256)
      .where("a.storage_bucket", "=", bucket)
      .where("a.is_current",     "=", true)
      .where("a.status",         "=", "active")
      .executeTakeFirst();

    if (existing) {
      const ex = existing as Record<string, unknown>;
      await db
        .updateTable("document.attachment" as never)
        .set({ reference_count: sql`reference_count + 1`, updated_at: new Date() } as never)
        .where("id"        as never, "=", ex["id"]  as never)
        .where("tenant_id" as never, "=", tenantId  as never)
        .execute();
      logger?.info?.("collab_attachment_upload_dedup_hit", {
        tenantId,
        attachmentId: ex["id"],
        originalFileName: fileName,
        contentType,
        sizeBytes,
      });
      return { attachment_id: ex["id"] as string, file_name: fileName, content_type: contentType, size_bytes: sizeBytes, is_duplicate: true };
    }

    await adapter.put(key, fileBuffer, { contentType });

    try {
      logger?.info?.("collab_attachment_upload_db_write_started", {
        tenantId,
        attachmentId,
        fileName,
        contentType,
        sizeBytes,
      });
      await db
        .insertInto("document.attachment" as never)
        .values({
          id:                           attachmentId,
          tenant_id:                    tenantId,
          file_name:                    fileName,
          original_filename:            fileName,
          content_type:                 contentType,
          size_bytes:                   sizeBytes,
          sha256,
          kind:                         "attachment",
          storage_bucket:               bucket,
          storage_key:                  key,
          version_no:                   1,
          reference_count:              0,
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
        .execute();

        logger?.info?.("collab_attachment_upload_created", {
          tenantId,
          attachmentId,
          fileName,
          contentType,
          sizeBytes,
        });
    } catch (dbErr) {
      const cleanupOutcome = await adapter.delete(key)
        .then(() => "object_deleted_on_db_failure" as const)
        .catch(() => "object_delete_failed_on_db_failure" as const);
      logger?.warn?.("collab_attachment_upload_cleanup_outcome", {
        tenantId,
        attachmentId,
        storageKey: key,
        phase: "single",
        outcome: cleanupOutcome,
      });
      throw dbErr;
    }

    return { attachment_id: attachmentId, file_name: fileName, content_type: contentType, size_bytes: sizeBytes, is_duplicate: false };
  }

  // ── POST /api/collab/attachments (multipart/form-data) ────────────────────

  const uploadMultipartHandler: RequestHandler = (req, res, next) => {
    void (async () => {
      logger?.info?.("collab_attachment_upload_request_started", {
        path: "multipart",
        tenantSource: "resolved_auth_context",
      });
      const adapter = adapterRef.current;
      if (!adapter) {
        res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage is not available" });
        return;
      }

      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId, principalId, tenantCode, companyCode } = authorized;
      const maxBytes    = await resolveAttachmentMaxBytes(db, tenantId, fallbackMaxBytes);

      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxBytes + 1 } });

      let uploadPromise: Promise<{ attachment_id: string; file_name: string; content_type: string; size_bytes: number; is_duplicate: boolean }> | null = null;
      let settled = false;
      let fileLimitExceeded = false;

      bb.on("file", (_fieldName, fileStream, info) => {
        const chunks: Buffer[] = [];

        fileStream.on("limit", () => {
          fileLimitExceeded = true;
          logger?.warn?.("collab_attachment_upload_request_invalid", {
            path: "multipart",
            reason: "file_too_large",
          });
          fileStream.resume();
        });

        uploadPromise = new Promise((resolve, reject) => {
          fileStream.on("data", (chunk: Buffer) => { chunks.push(chunk); });
          fileStream.on("end", () => {
            if (fileLimitExceeded) { resolve({ attachment_id: "", file_name: "", content_type: "", size_bytes: 0, is_duplicate: false }); return; }
            const fileBuffer  = Buffer.concat(chunks);
            const fileName    = sanitizeFileName(info.filename || "upload").slice(0, 500);
            const contentType = (info.mimeType || "application/octet-stream").slice(0, 200);
            resolve(performUpload({ adapter, tenantId, tenantCode, companyCode, principalId, fileName, contentType, sizeBytes: fileBuffer.length, fileBuffer }));
          });
          fileStream.on("error", reject);
        });
      });

      bb.on("finish", () => {
        if (fileLimitExceeded) {
          logger?.warn?.("collab_attachment_upload_request_invalid", {
            path: "multipart",
            reason: "file_too_large",
          });
          settled = true;
          res.status(413).json({ error: "FILE_TOO_LARGE", message: `File exceeds max size of ${formatMegabytes(maxBytes)} MB` });
          return;
        }
        if (!uploadPromise) {
          logger?.warn?.("collab_attachment_upload_request_invalid", {
            path: "multipart",
            reason: "no_file",
          });
          settled = true;
          res.status(400).json({ error: "NO_FILE", message: "No file part found in multipart body" });
          return;
        }
        if (settled) return;
        settled = true;
        uploadPromise
          .then((result) => {
            logger?.info?.("collab_attachment_upload_success", {
              attachmentId: result.attachment_id,
              isDuplicate: result.is_duplicate,
              path: "multipart",
            });
            res.status(201).json(result);
          })
          .catch((err: unknown) => {
            logger?.warn?.("collab_attachment_upload_cleanup_outcome", {
              path: "multipart",
              error: "UPLOAD_STREAM_FAILED",
              reason: err instanceof Error ? err.name : "error",
            });
            logger?.error("collab_attachment_upload_error", { err: String(err) });
            next(err instanceof Error ? err : new Error(String(err)));
          });
      });

      bb.on("error", (err: unknown) => {
        logger?.error("collab_attachment_multipart_parse_error", { err: String(err) });
        logger?.warn?.("collab_attachment_upload_request_invalid", {
          path: "multipart",
          reason: "parser_error",
          error: err instanceof Error ? err.name : "unknown",
        });
        res.status(400).json({
          error: "MULTIPART_PARSE_ERROR",
          message: String(err ?? "Multipart parser error"),
        });
        settled = true;
      });

      req.on("aborted", () => {
        if (settled) return;
        settled = true;
        logger?.warn?.("collab_attachment_upload_cleanup_outcome", {
          path: "multipart",
          reason: "stream_aborted",
          outcome: "client_aborted",
        });
        logger?.warn?.("collab_attachment_upload_request_invalid", {
          path: "multipart",
          reason: "upload_stream_aborted",
        });
        if (!res.headersSent) {
          res.status(400).json({
            error: "UPLOAD_STREAM_ABORTED",
            message: "Upload stream aborted by client",
            details: { reason: "request_aborted" },
          });
        }
      });

      req.pipe(bb);
    })();
  };

  // ── POST /api/collab/attachments (JSON base64) ────────────────────────────

  const uploadJsonHandler: RequestHandler = async (req, res, next) => {
    try {
      logger?.info?.("collab_attachment_upload_request_started", {
        path: "json",
        tenantSource: "resolved_auth_context",
      });
      const adapter = adapterRef.current;
      if (!adapter) {
        res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage is not available" });
        return;
      }

      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId, principalId, tenantCode, companyCode } = authorized;

      const body = req.body as { filename?: string; content_type?: string; size_bytes?: number; data_base64?: string };
      if (!body.filename || !body.data_base64) {
        logger?.warn?.("collab_attachment_upload_request_invalid", {
          path: "json",
          reason: "missing_fields",
        });
        res.status(400).json({ error: "MISSING_FIELDS", message: "filename and data_base64 are required" });
        return;
      }
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data_base64)) {
        logger?.warn?.("collab_attachment_upload_request_invalid", {
          path: "json",
          reason: "invalid_base64",
        });
        res.status(400).json({ error: "INVALID_BASE64" }); return;
      }

      const maxBytes   = await resolveAttachmentMaxBytes(db, tenantId, fallbackMaxBytes);
      const fileBuffer = Buffer.from(body.data_base64, "base64");
      if (fileBuffer.length > maxBytes) {
        logger?.warn?.("collab_attachment_upload_request_invalid", {
          path: "json",
          reason: "file_too_large",
          maxBytes,
          sizeBytes: fileBuffer.length,
        });
        res.status(413).json({
          error: "FILE_TOO_LARGE",
          message: `File exceeds max size of ${formatMegabytes(maxBytes)} MB`,
          details: { size_bytes: fileBuffer.length, max_bytes: maxBytes },
        });
        return;
      }

      const fileName    = sanitizeFileName(body.filename).slice(0, 500);
      const contentType = (body.content_type ?? "application/octet-stream").slice(0, 200);
      const sizeBytes   = body.size_bytes ?? fileBuffer.length;

      const result = await performUpload({ adapter, tenantId, tenantCode, companyCode, principalId, fileName, contentType, sizeBytes, fileBuffer });
      logger?.info?.("collab_attachment_upload_success", {
        attachmentId: result.attachment_id,
        path: "json",
        isDuplicate: result.is_duplicate,
      });
      res.status(201).json(result);
    } catch (err) {
      logger?.error("collab_attachment_upload_error", { err: String(err) });
      next(err);
    }
  };

  // ── Content-type dispatcher ───────────────────────────────────────────────

  const uploadHandler: RequestHandler = (req, res, next) => {
    const ct = (req.headers["content-type"] ?? "").toLowerCase();
    if (ct.includes("multipart/form-data")) {
      uploadMultipartHandler(req, res, next);
    } else {
      uploadJsonHandler(req, res, next);
    }
  };

  // ── DELETE /api/collab/attachments/:attachmentId ──────────────────────────

  const deleteHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { attachmentId } = req.params as { attachmentId: string };
      if (!isUuid(attachmentId)) {
        res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" });
        return;
      }

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId, principalId } = authorized;

      // Only allow delete if no links exist (staged only)
      const linkCount = await db
        .selectFrom("document.attachment_link as edl")
        .select(sql<string>`COUNT(*)`.as("cnt") as never)
        .where("edl.attachment_id" as never, "=", attachmentId as never)
        .where("edl.tenant_id"     as never, "=", tenantId     as never)
        .executeTakeFirst();

      const cnt = Number((linkCount as Record<string, unknown>)?.cnt ?? 0);
      if (cnt > 0) {
        res.status(409).json({ error: "ATTACHMENT_IN_USE", message: "Attachment has active links; cannot delete" });
        return;
      }

      await db
        .updateTable("document.attachment" as never)
        .set({ status: "deleted", is_active: false, updated_at: new Date() } as never)
        .where("id"        as never, "=", attachmentId as never)
        .where("tenant_id" as never, "=", tenantId     as never)
        .execute();

      res.status(204).send();
    } catch (err) {
      logger?.error("collab_attachment_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/attachments/:attachmentId/download ────────────────────

  const downloadHandler: RequestHandler = async (req, res, next) => {
    try {
      const adapter = adapterRef.current;
      if (!adapter) {
        res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage is not available" });
        return;
      }

      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { attachmentId } = req.params as { attachmentId: string };
      if (!isUuid(attachmentId)) {
        res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" });
        return;
      }

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId, principalId } = authorized;

      const row = await db
        .selectFrom("document.attachment as a")
        .select(["a.storage_key", "a.file_name", "a.content_type", "a.size_bytes", "a.status"])
        .where("a.id",        "=", attachmentId)
        .where("a.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }
      const r = row as Record<string, unknown>;
      if (r["status"] !== "active") {
        res.status(403).json({
          error: "QUARANTINE_VIOLATION",
          message: "Attachment is quarantined, failed, or not yet active.",
          status: r["status"] as string,
        });
        return;
      }

      const presignedUrl = await adapter.getPresignedUrl(r["storage_key"] as string, 300);

      // Append access audit — best-effort
      void db.insertInto("log.attachment_access_log" as never).values({
        tenant_id:             tenantId,
        principal_id:          principalId,
        attachment_id:         attachmentId,
        parent_entity_type:    "document.comment",
        access_type:           "download",
        attachment_name:       r["file_name"] as string,
        attachment_size_bytes: Number(r["size_bytes"] ?? 0),
        attachment_mime_type:  (r["content_type"] as string) ?? "application/octet-stream",
        outcome:               "success",
        created_by:            principalId,
      } as never).execute().catch(() => {});

      res.redirect(302, presignedUrl);
    } catch (err) {
      logger?.error("collab_attachment_download_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/attachments/:attachmentId/link ──────────────────────

  const linkHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { attachmentId } = req.params as { attachmentId: string };
      if (!isUuid(attachmentId)) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId, principalId } = authorized;

      const body = req.body as { entity_type?: string; entity_id?: string };
      if (!body.entity_type || !body.entity_id) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_type and entity_id are required" });
        return;
      }

      const row = await db
        .selectFrom("document.attachment as a")
        .select(["a.id", "a.status"])
        .where("a.id",        "=", attachmentId)
        .where("a.tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }
      if ((row as Record<string, unknown>)["status"] !== "active") {
        res.status(409).json({
          error: "QUARANTINE_VIOLATION",
          message: "Attachment is not eligible for linking while quarantined or failed.",
          status: (row as Record<string, unknown>)["status"] as string,
        });
        return;
      }

      await db.insertInto("document.attachment_link" as never).values({
        tenant_id:   tenantId,
        entity_type: body.entity_type,
        entity_id:   body.entity_id,
        attachment_id: attachmentId,
        linked_by:   principalId,
        created_by:  principalId,
      } as never).onConflict((oc) => (oc as unknown as { doNothing(): unknown }).doNothing() as never).execute();

      await db
        .updateTable("document.attachment" as never)
        .set({ reference_count: sql`reference_count + 1`, updated_at: new Date() } as never)
        .where("id"        as never, "=", attachmentId as never)
        .where("tenant_id" as never, "=", tenantId     as never)
        .execute();

      res.status(201).json({ ok: true });
    } catch (err) {
      logger?.error("collab_attachment_link_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /api/collab/attachments/:attachmentId/link ─────────────────────

  const unlinkHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { attachmentId } = req.params as { attachmentId: string };
      if (!isUuid(attachmentId)) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId } = authorized;

      const body = req.body as { entity_type?: string; entity_id?: string };
      if (!body.entity_type || !body.entity_id) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_type and entity_id are required" });
        return;
      }

      const deleted = await db
        .deleteFrom("document.attachment_link" as never)
        .where("tenant_id"    as never, "=", tenantId       as never)
        .where("attachment_id" as never, "=", attachmentId  as never)
        .where("entity_type"  as never, "=", body.entity_type as never)
        .where("entity_id"    as never, "=", body.entity_id as never)
        .executeTakeFirst();

      if (deleted) {
        await db
          .updateTable("document.attachment" as never)
          .set({ reference_count: sql`GREATEST(reference_count - 1, 0)`, updated_at: new Date() } as never)
          .where("id"        as never, "=", attachmentId as never)
          .where("tenant_id" as never, "=", tenantId     as never)
          .execute();
      }

      res.status(204).send();
    } catch (err) {
      logger?.error("collab_attachment_unlink_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/entity-attachments ────────────────────────────────────

  const listEntityAttachmentsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId } = authorized;

      const { entity_type, entity_id } = req.query as { entity_type?: string; entity_id?: string };
      if (!entity_type || !entity_id) {
        res.status(400).json({ error: "MISSING_PARAMS", message: "entity_type and entity_id are required" });
        return;
      }

      const rows = await db
        .selectFrom("document.attachment_link as edl")
        .innerJoin("document.attachment as a", "a.id" as never, "edl.attachment_id" as never)
        .leftJoin("master.principal as p", "p.id" as never, "a.uploaded_by" as never)
        .select([
          "a.id as attachment_id",
          "a.file_name",
          "a.content_type",
          "a.size_bytes",
          "a.kind",
          "a.version_no",
          "a.is_current",
          "a.is_virus_scanned",
          "a.preview_key",
          "a.is_preview_generation_failed",
          "a.text_extraction_status",
          "a.status",
          "edl.created_at as linked_at",
          "p.name as uploaded_by_name",
        ] as never[])
        .where("edl.tenant_id"   as never, "=", tenantId    as never)
        .where("edl.entity_type" as never, "=", entity_type as never)
        .where("edl.entity_id"   as never, "=", entity_id   as never)
        .where("a.status"        as never, "in", ["active", "quarantined"] as never)
        .orderBy("edl.created_at" as never, "desc")
        .execute();

      const data = rows.map((r) => {
        const row            = r as Record<string, unknown>;
        const attachmentId   = row["attachment_id"] as string;
        const contentType    = (row["content_type"] as string) ?? "application/octet-stream";
        const attachStatus   = (row["status"] as string) ?? "active";
        const isVirusScanned = Boolean(row["is_virus_scanned"]);
        const previewKey     = row["preview_key"] as string | null | undefined;
        const previewFailed  = Boolean(row["is_preview_generation_failed"]);

        // Derive previewKind from content type
        let previewKind: "image" | "pdf" | "text" | "none" = "none";
        if (contentType.startsWith("image/")) previewKind = "image";
        else if (contentType === "application/pdf") previewKind = "pdf";
        else if (contentType.startsWith("text/") || contentType === "application/json" || contentType === "application/xml") previewKind = "text";

        // Derive scanStatus — only surface quarantined, otherwise suppress until scan worker is wired
        const scanStatus: "pending" | "clean" | "quarantined" =
          attachStatus === "quarantined" ? "quarantined" :
          isVirusScanned                 ? "clean"       : "pending";

        // Derive previewStatus
        let previewStatus: "pending" | "ready" | "failed" | "none" = "none";
        if (previewKind !== "none") {
          if (previewFailed)   previewStatus = "failed";
          else if (previewKey) previewStatus = "ready";
          else                 previewStatus = "pending";
        }

        return {
          attachmentId,
          fileName:         row["file_name"]            as string,
          contentType,
          sizeBytes:        Number(row["size_bytes"] ?? 0),
          linkedAt:         row["linked_at"]            as string,
          downloadUrl:      `/api/collab/attachments/${attachmentId}/download`,
          uploadedByName:   (row["uploaded_by_name"]    as string) ?? null,
          kind:             (row["kind"]                as string) ?? "attachment",
          versionNo:        Number(row["version_no"]    ?? 1),
          isCurrent:        Boolean(row["is_current"]   ?? true),
          visibility:       "internal" as const,
          scanStatus,
          previewStatus,
          previewKind,
          extractionStatus: (row["text_extraction_status"] as string) ?? null,
        };
      });

      res.json({ data });
    } catch (err) {
      logger?.error("collab_entity_attachments_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /api/collab/attachments/:attachmentId/properties ─────────────────

  const patchPropertiesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { attachmentId } = req.params as { attachmentId: string };
      if (!isUuid(attachmentId)) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }

      const authorized = await authorize(req, res, claims);
      if (!authorized) return;
      const { tenantId } = authorized;

      const body = req.body as { file_name?: string };
      if (!body.file_name || typeof body.file_name !== "string" || !body.file_name.trim()) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "file_name is required" });
        return;
      }

      const existing = await db
        .selectFrom("document.attachment as a")
        .select(["a.id"])
        .where("a.id",        "=", attachmentId)
        .where("a.tenant_id", "=", tenantId)
        .where("a.status",    "=", "active")
        .executeTakeFirst();

      if (!existing) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }

      await db
        .updateTable("document.attachment" as never)
        .set({ file_name: body.file_name.trim().slice(0, 500), updated_at: new Date() } as never)
        .where("id"        as never, "=", attachmentId as never)
        .where("tenant_id" as never, "=", tenantId     as never)
        .execute();

      res.json({ ok: true });
    } catch (err) {
      logger?.error("collab_attachment_patch_properties_error", { err: String(err) });
      next(err);
    }
  };

  router.post(  "/collab/attachments",                               uploadHandler);
  router.delete("/collab/attachments/:attachmentId",                 deleteHandler);
  router.get(   "/collab/attachments/:attachmentId/download",        downloadHandler);
  router.post(  "/collab/attachments/:attachmentId/link",            linkHandler);
  router.delete("/collab/attachments/:attachmentId/link",            unlinkHandler);
  router.patch( "/collab/attachments/:attachmentId/properties",      patchPropertiesHandler);
  router.get(   "/collab/entity-attachments",                        listEntityAttachmentsHandler);
}
