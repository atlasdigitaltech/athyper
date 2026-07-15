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
  extractVerifiedRequestContextHints,
  resolveVerifiedRequestContext,
} from "@athyper/svc-shared";
import type { ObjectStorageAdapter } from "@athyper/adapter-object-storage";
import { JOB_NAME, type ExtractTextJobData, type SweepJobData } from "@athyper/svc-jobs";
import { createHash } from "node:crypto";
import { resolveDocumentEntity } from "./entity-resolver.js";
import {
  ContentAttachmentService,
  type UploadResult,
  type UploadReplayResult,
} from "../services/attachment.service.js";
import {
  authorizeAttachmentAccess,
  type AttachmentAuthorizationAction,
} from "../services/attachment-authorization.service.js";

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
    ...(result.status === "active" ? {
      download_url: `/api/relay/api/documents/${encodeURIComponent(docType)}/${encodeURIComponent(docId)}/attachments/${encodeURIComponent(result.id)}/download`,
    } : {}),
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
    info?(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Principal resolver ────────────────────────────────────────────────────────

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerAttachmentRoutes(router: Router, deps: AttachmentsRouteDeps): void {
  const { db, auth, objectStorage, tikaQueue, logger } = deps;
  const attachmentLogger = logger
    ? {
        info: (...args: Parameters<typeof logger.warn>) => logger.warn(...args),
        warn: (...args: Parameters<typeof logger.warn>) => logger.warn(...args),
      }
    : undefined;

  /**
   * Fire-and-forget enqueue of a Tika extraction job. Never throws — upload
   * completion must not depend on Redis availability. Missing queue (no
   * DOCPARSER_URL configured) is a silent no-op.
   */
  function enqueueTikaExtract(
    attachmentId: string,
    tenantId: string,
    versionNo?: number,
    sha256?: string,
  ): void {
    if (!tikaQueue) return;
    void tikaQueue
      .add(
        JOB_NAME.EXTRACT_TEXT,
        { attachmentId, tenantId, versionNo, sha256 },
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

  const svc = new ContentAttachmentService(
    db,
    objectStorage.adapter,
    objectStorage.bucket,
    attachmentLogger,
  );
  const maxUploadBytes = (objectStorage.maxUploadMb ?? 100) * 1024 * 1024;
  // JSON/base64 is retained only for small compatibility uploads; larger
  // files must use the streaming/direct-object-storage path.
  const maxCompatibilityJsonBytes = 5 * 1024 * 1024;
  const maxUploadMb = objectStorage.maxUploadMb ?? 100;
  const parseTimeoutMs = 30_000;

  function parseUploadedByteLimit(header: unknown): number | null {
    if (typeof header !== "string") return null;
    const parsed = Number.parseInt(header, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function parseIdempotencyKey(req: Parameters<RequestHandler>[0]): string | undefined {
    const value = req.headers["idempotency-key"];
    if (typeof value !== "string" || value.trim().length === 0) return undefined;
    return value.trim();
  }

  function parseContentShaHeader(req: Parameters<RequestHandler>[0]): string | undefined {
    const value = req.headers["content-sha256"];
    return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value.trim())
      ? value.toLowerCase()
      : undefined;
  }

 function respondFileTooLarge(res: Parameters<RequestHandler>[1], path: "json" | "multipart", sizeBytes?: number): void {
    res.status(413).json({
      error: "FILE_TOO_LARGE",
      message: `File exceeds the ${maxUploadMb} MB limit`,
      details: {
        limit_bytes: maxUploadBytes,
        limit_mb: maxUploadMb,
        ...(typeof sizeBytes === "number" ? { received_bytes: sizeBytes } : {}),
      },
    });
  }

  function respondTypedUploadError(
    res: Parameters<RequestHandler>[1],
    error: string,
    message: string,
    status = 400,
    details: Record<string, unknown> = {},
  ): void {
    res.status(status).json({ error, message, details });
  }

  function normalizeUploadError(err: unknown): { error: string; message: string; status: number; details?: Record<string, unknown> } {
    if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
      return { error: "UPLOAD_STREAM_ABORTED", message: "Upload stream aborted before completion", status: 400, details: { reason: "stream_aborted" } };
    }
    if (err instanceof Error && (err as { code?: string }).code === "ECONNRESET") {
      return { error: "UPLOAD_STREAM_ABORTED", message: "Upload stream connection reset", status: 400, details: { reason: "stream_reset" } };
    }
    return {
      error: "UPLOAD_FAILED",
      message: err instanceof Error ? err.message : String(err),
      status: 500,
    };
  }

  function toReplayResponse(result: UploadReplayResult): UploadResult {
    return {
      id: result.id,
      fileName: result.fileName,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
      status: result.status,
      versionNo: result.versionNo,
      createdAt: result.createdAt,
      storageKey: result.storageKey,
    };
  }

  async function findExistingUpload(params: {
    tenantId: string;
    idempotencyKey?: string;
    hash?: string;
  }): Promise<UploadReplayResult | null> {
    if (!params.idempotencyKey && !params.hash) return null;
    return svc.findReplayAttachment({
      tenantId: params.tenantId,
      statuses: ["active", "quarantined"],
      idempotencyKey: params.idempotencyKey,
      hash: params.hash,
    });
  }

  async function authorize(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    claims: Record<string, unknown>,
    entityType: string,
    entityId: string,
    action: AttachmentAuthorizationAction,
  ): Promise<{ tenantId: string; principalId: string; tenantCode: string; companyCode?: string } | null> {
    const headerOrg = (req.headers["x-org"] as string) ?? "";
    const headerRealm = (req.headers["x-realm-key"] as string | undefined) ?? (req.headers["x-realm"] as string | undefined) ?? null;
    const authSource = {
      type: "token",
      headerOrgPresent: Boolean(headerOrg),
      headerRealmPresent: Boolean(headerRealm),
    };
    logger?.info?.("attachments_authorization_attempt", {
      action,
      entityType,
      entityId,
      authSource,
      orgHeader: headerOrg,
      realmHeader: headerRealm,
      claimSub: typeof claims["sub"] === "string" ? "present" : "absent",
      claimRealm: typeof (claims["realm_key"] ?? claims["realm"]) === "string" ? "present" : "absent",
      claimIssuerRealm: typeof claims["iss"] === "string" ? "present" : "absent",
    });
    const resolved = await resolveVerifiedRequestContext(
      db,
      claims,
      extractVerifiedRequestContextHints(req),
    );
    if (!resolved.ok) {
      logger?.warn?.("attachments_authorization_denied", {
        action,
        entityType,
        entityId,
        authSource: "token",
        reason: resolved.error,
        orgHeader: headerOrg,
        realmHeader: headerRealm,
      });
      res.status(resolved.status).json({ error: resolved.error, message: resolved.message });
      return null;
    }
    const outcome = await authorizeAttachmentAccess({
      db,
      context: resolved.context,
      entityCode: entityType,
      entityId,
      action,
      logger: attachmentLogger,
    });
    if (!outcome.allowed) {
      logger?.warn?.("attachments_authorization_denied", {
      action,
      entityType,
      entityId,
      reason: outcome.error,
      orgHeader: headerOrg,
      realmHeader: headerRealm,
    });
      res.status(403).json({ error: outcome.error, message: outcome.message });
      return null;
    }
    logger?.info?.("attachments_authorization_allowed", {
      action,
      tenantId: outcome.tenantId,
      entityType,
      entityId,
      principalId: outcome.principalId,
      realmKey: outcome.realmKey,
    });
    return {
      tenantId: outcome.tenantId,
      principalId: outcome.principalId,
      tenantCode: resolved.context.tenantCode,
      companyCode: resolved.context.companyCode,
    };
  }

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

      const authorized = await authorize(req, res, claims, entity.name as string, id, "read");
      if (!authorized) return;
      const { tenantId } = authorized;

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

      const authorized = await authorize(req, res, claims, entity.name as string, id, "create_attachment");
      if (!authorized) return;
      const { tenantId, principalId, tenantCode, companyCode } = authorized;

      const body = req.body as {
        filename?:     string;
        content_type?: string;
        size_bytes?:   number;
        data_base64?:  string;
      };
      const idempotencyKey = parseIdempotencyKey(req);
      const headerSha = parseContentShaHeader(req);

      if (!body.filename || !body.data_base64) {
        logger?.warn?.("attachments_upload_request_invalid", {
          path: "json",
          docType,
          id,
          reason: "missing_fields",
        });
        res.status(400).json({ error: "MISSING_FIELDS", message: "filename and data_base64 are required" });
        return;
      }

      if (!isCanonicalBase64(body.data_base64)) {
        logger?.warn?.("attachments_upload_request_invalid", {
          path: "json",
          docType,
          id,
          reason: "invalid_base64",
        });
        res.status(400).json({ error: "INVALID_BASE64", message: "data_base64 must be valid base64" });
        return;
      }

      const declaredSize = typeof body.size_bytes === "number" ? body.size_bytes : decodedBase64Size(body.data_base64);
      if (declaredSize > maxCompatibilityJsonBytes) {
        logger?.warn?.("attachments_upload_request_invalid", {
          path: "json",
          docType,
          id,
          reason: "file_too_large",
          maxBytes: maxCompatibilityJsonBytes,
          declaredBytes: declaredSize,
        });
        respondFileTooLarge(res, "json", declaredSize);
        return;
      }

      const fileBuffer  = Buffer.from(body.data_base64, "base64");
      const sizeBytes   = fileBuffer.length;
      const contentType = (body.content_type ?? "application/octet-stream").slice(0, 200);

      if (sizeBytes > maxCompatibilityJsonBytes) {
        logger?.warn?.("attachments_upload_request_invalid", {
          path: "json",
          docType,
          id,
          reason: "file_too_large",
          actualBytes: sizeBytes,
          maxBytes: maxCompatibilityJsonBytes,
        });
        respondFileTooLarge(res, "json", sizeBytes);
        return;
      }

      const bodySha = createHash("sha256").update(fileBuffer).digest("hex");
      const replay = await findExistingUpload({
        tenantId,
        idempotencyKey,
        hash: headerSha ?? bodySha,
      });
      if (replay && ["active", "quarantined"].includes(replay.status)) {
        const replayResult = toReplayResponse(replay);
        res.status(200).json(toAttachmentResponse(replayResult, docType, id));
        return;
      }

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
        idempotencyKey,
        linkKind: "related",
      });

      enqueueTikaExtract(result.id, tenantId, result.versionNo, result.sha256);
      logger?.info?.("attachments_upload_success", {
        path: "json",
        tenantId,
        attachmentId: result.id,
        entityType: entity.name as string,
        entityId: id,
        status: result.status,
        sizeBytes: result.sizeBytes,
      });

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
    void (async () => {
      try {
        logger?.info?.("attachments_upload_request_started", {
          path: "multipart",
          docType: req.params["docType"] as string,
          id: req.params["id"] as string,
        });
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

        const authorized = await authorize(req, res, claims, entity.name as string, id, "create_attachment");
        if (!authorized) return;
        const { tenantId, principalId, tenantCode, companyCode } = authorized;
        const idempotencyKey = parseIdempotencyKey(req);
        const declaredContentLength = parseUploadedByteLimit(req.headers["content-length"]);
        const headerSha = parseContentShaHeader(req);
        const fields: Record<string, string> = {};

        if (declaredContentLength !== null && declaredContentLength > maxUploadBytes) {
          respondFileTooLarge(res, "multipart", declaredContentLength);
          return;
        }

        const replay = await findExistingUpload({
          tenantId,
          idempotencyKey,
          hash: headerSha,
        });
        if (replay) {
          req.resume();
          res.status(200).json(toAttachmentResponse(toReplayResponse(replay), docType, id));
          return;
        }

        const result = await new Promise<UploadResult>((resolve, reject) => {
          let settled = false;
          let uploadPromise: Promise<UploadResult> | null = null;
          let seenFiles = 0;
          let receivedBytes = 0;
          let parseTimeout: NodeJS.Timeout | null = null;

          const bb = busboy({
            headers: req.headers,
            limits: {
              files: 1,
              fileSize: maxUploadBytes,
            },
          });

          const finish = (
            error: { status?: number; error: string; message: string; details?: Record<string, unknown> } | null,
            value?: UploadResult,
          ) => {
            if (settled) return;
            settled = true;
            if (parseTimeout) clearTimeout(parseTimeout);
            req.unpipe(bb);
            req.removeAllListeners();
            bb.removeAllListeners();
            if (error) {
              reject(error);
            } else if (value) {
              resolve(value);
            }
          };

          const fail = (
            code: string,
            message: string,
            status = 400,
            details: Record<string, unknown> = {},
          ) => {
            logger?.warn?.("attachments_upload_request_invalid", {
              path: "multipart",
              docType,
              id,
              reason: code,
            });
            finish({ status, error: code, message, details });
          };

          parseTimeout = setTimeout(() => {
            fail("MULTIPART_PARSE_TIMEOUT", `Multipart parsing exceeded ${parseTimeoutMs} ms`, 408, {
              timeout_ms: parseTimeoutMs,
            });
            bb.removeAllListeners("file");
            req.destroy(new Error("multipart parse timeout"));
          }, parseTimeoutMs);

          bb.on("field", (name, value) => {
            fields[name] = value;
          });

          bb.on("file", (_fieldName, fileStream, info) => {
            seenFiles += 1;
            if (seenFiles > 1) {
              fileStream.resume();
              return;
            }

            const { filename, mimeType } = info;
            fileStream.on("data", (chunk: Buffer) => {
              receivedBytes += chunk.length;
              if (receivedBytes > maxUploadBytes) {
                fail("FILE_TOO_LARGE", `File exceeds the ${maxUploadMb} MB limit`, 413, {
                  limit_bytes: maxUploadBytes,
                  limit_mb: maxUploadMb,
                  received_bytes: receivedBytes,
                });
                fileStream.destroy();
                req.destroy();
              }
            });

            fileStream.on("limit", () => {
              fail("FILE_TOO_LARGE", `File exceeds the ${maxUploadMb} MB limit`, 413, {
                limit_bytes: maxUploadBytes,
                limit_mb: maxUploadMb,
              });
              fileStream.destroy();
              req.destroy();
            });

            fileStream.on("error", (streamErr: unknown) => {
              fail("MULTIPART_STREAM_ERROR", String(streamErr ?? "Multipart stream error"), 400, {
                reason: "stream_error",
              });
            });

            uploadPromise = svc.uploadStream({
              tenantId,
              tenantCode,
              companyCode,
              entityType: entity.name as string,
              entityId: id,
              stream: fileStream,
              fileName: (filename || "upload").slice(0, 500),
              contentType: (mimeType || "application/octet-stream").slice(0, 200),
              contentLength: declaredContentLength ?? undefined,
              principalId,
              linkKind: (fields["link_kind"] as "related" | undefined) ?? "related",
              idempotencyKey,
            });
          });

          bb.on("finish", () => {
            if (settled) return;
            if (!uploadPromise) {
              fail("NO_FILE", "No file part found in multipart body", 400, {
                reason: "missing_file",
              });
              return;
            }

            uploadPromise
              .then((uploadResult) => finish(null, uploadResult))
              .catch((err: unknown) => {
                const uploadErr = normalizeUploadError(err);
                logger?.warn?.("attachments_upload_cleanup_outcome", {
                  path: "multipart",
                  error: uploadErr.error,
                  reason: uploadErr.details?.reason ?? "stream_error",
                });
                finish(uploadErr);
              });
          });

          bb.on("error", (err: unknown) => {
            fail("MULTIPART_PARSE_ERROR", String(err ?? "Multipart parser error"), 400, {
              reason: "parser_error",
            });
          });

        req.on("aborted", () => {
          fail("UPLOAD_STREAM_ABORTED", "Request aborted by client", 400, {
            reason: "request_aborted",
          });
        });

          req.pipe(bb);
        });

        enqueueTikaExtract(result.id, tenantId, result.versionNo, result.sha256);
        logger?.info?.("attachments_upload_success", {
          path: "multipart",
          tenantId,
          attachmentId: result.id,
          entityType: entity.name as string,
          entityId: id,
          status: result.status,
        });
        res.status(201).json(toAttachmentResponse(result, docType, id));
      } catch (err: unknown) {
        if (
          typeof err === "object"
          && err !== null
          && "error" in err
          && "message" in err
          && typeof (err as { error?: unknown }).error === "string"
          && typeof (err as { message?: unknown }).message === "string"
        ) {
          const e = err as { error: string; message: string; status?: number; details?: Record<string, unknown> };
          respondTypedUploadError(res, e.error, e.message, e.status ?? 400, e.details ?? {});
          return;
        }

        logger?.error("attachments_upload_error", { err: String(err) });
        next(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  };
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

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const authorized = await authorize(req, res, claims, entity.name as string, id, "read_attachment");
      if (!authorized) return;
      const { tenantId, principalId } = authorized;

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
        const attachment = await db
          .selectFrom("master.attachment as a")
          .select("status")
          .where("a.id", "=", attachmentId)
          .where("a.tenant_id", "=", tenantId)
          .executeTakeFirst();
        if (attachment && attachment.status !== "active") {
          res.status(409).json({
            error: "QUARANTINE_VIOLATION",
            message: "Attachment download blocked while quarantine/scan is not complete.",
            status: attachment.status,
          });
          return;
        }
        res.status(404).json({ error: "ATTACHMENT_NOT_FOUND", message: "Attachment not found" });
        return;
      }

      const safeFileName = file.fileName.replace(/"/g, '\\"');
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
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

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const authorized = await authorize(req, res, claims, entity.name as string, id, "delete_attachment");
      if (!authorized) return;
      const { tenantId, principalId } = authorized;

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

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const authorized = await authorize(req, res, claims, entity.name as string, id, "reindex_attachment");
      if (!authorized) return;
      const { tenantId, principalId } = authorized;

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
        .select(["a.id" as never, "a.version_no" as never, "a.sha256" as never])
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
      const linkRow = link as Record<string, unknown>;
      await tikaQueue.add(
        JOB_NAME.EXTRACT_TEXT,
        {
          attachmentId,
          tenantId,
          versionNo: Number(linkRow["version_no"] ?? 1),
          sha256: linkRow["sha256"] as string | undefined,
        },
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

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const authorized = await authorize(req, res, claims, entity.name as string, id, "update_attachment");
      if (!authorized) return;
      const { tenantId, principalId } = authorized;

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

function isCanonicalBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
    && (value.indexOf("=") === -1 || /^[A-Za-z0-9+/]+={1,2}$/.test(value));
}

function decodedBase64Size(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}
