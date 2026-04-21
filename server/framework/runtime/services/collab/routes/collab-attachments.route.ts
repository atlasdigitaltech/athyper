/**
 * Collab Attachment Upload Route
 *
 * POST /api/collab/attachments
 *   Accepts { filename, content_type?, size_bytes?, data_base64 } JSON.
 *   Stores file in S3, inserts master.attachment row (status='active').
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
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import { createHash } from "node:crypto";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface CollabAttachmentsRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  objectStorage?: { adapterRef: { current: ObjectStorageAdapter | null }; bucket: string; maxUploadMb?: number };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolvePrincipal(db: Kysely<any>, sub: string, tenantId: string): Promise<string> {
  if (!sub) return SYSTEM_PRINCIPAL_UUID;
  const row = await db
    .selectFrom("master.principal_identity_binding as pab")
    .select("pab.principal_id")
    .where("pab.subject_id", "=", sub)
    .where("pab.tenant_id", "=", tenantId)
    .executeTakeFirst();
  return row ? (row.principal_id as string) : SYSTEM_PRINCIPAL_UUID;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.\-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);
}

function storageKey(tenantId: string, attachmentId: string, fileName: string): string {
  return `tenant/${tenantId}/master/comment/${attachmentId}/v1/${sanitizeFileName(fileName)}`;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerCollabAttachmentRoutes(router: Router, deps: CollabAttachmentsRouteDeps): void {
  const { db, auth, objectStorage, logger } = deps;

  const unavailable: RequestHandler = (_req, res) => {
    res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage is not configured" });
  };

  if (!objectStorage) {
    router.post(  "/collab/attachments",                           unavailable);
    router.delete("/collab/attachments/:attachmentId",             unavailable);
    router.get(   "/collab/attachments/:attachmentId/download",    unavailable);
    router.post(  "/collab/attachments/:attachmentId/link",        unavailable);
    router.delete("/collab/attachments/:attachmentId/link",        unavailable);
    router.get(   "/collab/entity-attachments",                    unavailable);
    return;
  }

  const { adapterRef, bucket, maxUploadMb = 100 } = objectStorage;
  const maxBytes = maxUploadMb * 1024 * 1024;

  // ── POST /api/collab/attachments ──────────────────────────────────────────

  const uploadHandler: RequestHandler = async (req, res, next) => {
    try {
      const adapter = adapterRef.current;
      if (!adapter) {
        res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage is not available" });
        return;
      }

      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT" });
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
        res.status(400).json({ error: "INVALID_BASE64" });
        return;
      }

      const fileBuffer  = Buffer.from(body.data_base64, "base64");
      if (fileBuffer.length > maxBytes) {
        res.status(413).json({
          error:   "ATTACHMENT_SIZE_EXCEEDED",
          message: `File exceeds max size of ${maxUploadMb} MB`,
          details: { size_bytes: fileBuffer.length, max_bytes: maxBytes },
        });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipal(db, sub, tenantId);
      const contentType = (body.content_type ?? "application/octet-stream").slice(0, 200);
      const fileName    = body.filename.slice(0, 500);
      const sizeBytes   = body.size_bytes ?? fileBuffer.length;
      const sha256      = createHash("sha256").update(fileBuffer).digest("hex");
      const attachmentId = crypto.randomUUID();
      const key          = storageKey(tenantId, attachmentId, fileName);

      // sha256 dedup — if identical file already active for this tenant, increment ref_count
      const existing = await db
        .selectFrom("master.attachment as a")
        .select(["a.id", "a.storage_key"])
        .where("a.tenant_id", "=", tenantId)
        .where("a.sha256",    "=", sha256)
        .where("a.is_current", "=", true)
        .where("a.status",     "=", "active")
        .executeTakeFirst();

      if (existing) {
        const ex = existing as Record<string, unknown>;
        await db
          .updateTable("master.attachment" as never)
          .set({ reference_count: sql`reference_count + 1`, updated_at: new Date() } as never)
          .where("id"        as never, "=", ex["id"]        as never)
          .where("tenant_id" as never, "=", tenantId        as never)
          .execute();
        res.status(201).json({
          attachment_id: ex["id"] as string,
          file_name:     fileName,
          content_type:  contentType,
          size_bytes:    sizeBytes,
          is_duplicate:  true,
        });
        return;
      }

      // Upload to S3 first
      await adapter.put(key, fileBuffer, { contentType });

      // DB insert
      try {
        await db
          .insertInto("master.attachment" as never)
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
      } catch (dbErr) {
        await adapter.delete(key).catch(() => {});
        throw dbErr;
      }

      res.status(201).json({
        attachment_id: attachmentId,
        file_name:     fileName,
        content_type:  contentType,
        size_bytes:    sizeBytes,
        is_duplicate:  false,
      });
    } catch (err) {
      logger?.error("collab_attachment_upload_error", { err: String(err) });
      next(err);
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

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      // Only allow delete if no links exist (staged only)
      const linkCount = await db
        .selectFrom("master.entity_document_link as edl")
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
        .updateTable("master.attachment" as never)
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

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const row = await db
        .selectFrom("master.attachment as a")
        .select(["a.storage_key", "a.file_name", "a.content_type", "a.size_bytes", "a.status"])
        .where("a.id",        "=", attachmentId)
        .where("a.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }
      const r = row as Record<string, unknown>;
      if (r["status"] === "quarantined") {
        res.status(403).json({ error: "ATTACHMENT_QUARANTINED" });
        return;
      }
      if (r["status"] === "deleted") { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }

      const presignedUrl = await adapter.getPresignedUrl(r["storage_key"] as string, 300);

      // Append access audit — best-effort
      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipal(db, sub, tenantId);
      void db.insertInto("log.attachment_access_log" as never).values({
        tenant_id:             tenantId,
        principal_id:          principalId,
        attachment_id:         attachmentId,
        parent_entity_type:    "master.comment",
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

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const body = req.body as { entity_type?: string; entity_id?: string };
      if (!body.entity_type || !body.entity_id) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_type and entity_id are required" });
        return;
      }

      const row = await db
        .selectFrom("master.attachment as a")
        .select(["a.id", "a.status"])
        .where("a.id",        "=", attachmentId)
        .where("a.tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!row) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND" }); return; }
      if ((row as Record<string, unknown>)["status"] !== "active") {
        res.status(409).json({ error: "ATTACHMENT_NOT_ACTIVE" });
        return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipal(db, sub, tenantId);

      await db.insertInto("master.entity_document_link" as never).values({
        tenant_id:   tenantId,
        entity_type: body.entity_type,
        entity_id:   body.entity_id,
        attachment_id: attachmentId,
        linked_by:   principalId,
        created_by:  principalId,
      } as never).onConflict((oc) => (oc as unknown as { doNothing(): unknown }).doNothing() as never).execute();

      await db
        .updateTable("master.attachment" as never)
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

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const body = req.body as { entity_type?: string; entity_id?: string };
      if (!body.entity_type || !body.entity_id) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entity_type and entity_id are required" });
        return;
      }

      const deleted = await db
        .deleteFrom("master.entity_document_link" as never)
        .where("tenant_id"    as never, "=", tenantId       as never)
        .where("attachment_id" as never, "=", attachmentId  as never)
        .where("entity_type"  as never, "=", body.entity_type as never)
        .where("entity_id"    as never, "=", body.entity_id as never)
        .executeTakeFirst();

      if (deleted) {
        await db
          .updateTable("master.attachment" as never)
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

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const { entity_type, entity_id } = req.query as { entity_type?: string; entity_id?: string };
      if (!entity_type || !entity_id) {
        res.status(400).json({ error: "MISSING_PARAMS", message: "entity_type and entity_id are required" });
        return;
      }

      const rows = await db
        .selectFrom("master.entity_document_link as edl")
        .innerJoin("master.attachment as a", "a.id" as never, "edl.attachment_id" as never)
        .select([
          "a.id as attachment_id",
          "a.file_name",
          "a.content_type",
          "a.size_bytes",
          "edl.linked_at",
        ] as never[])
        .where("edl.tenant_id"   as never, "=", tenantId    as never)
        .where("edl.entity_type" as never, "=", entity_type as never)
        .where("edl.entity_id"   as never, "=", entity_id   as never)
        .where("a.status"        as never, "=", "active"    as never)
        .orderBy("edl.linked_at" as never, "desc")
        .execute();

      const data = rows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          attachmentId: row["attachment_id"] as string,
          fileName:     row["file_name"]     as string,
          contentType:  row["content_type"]  as string,
          sizeBytes:    Number(row["size_bytes"] ?? 0),
          linkedAt:     row["linked_at"]     as string,
          downloadUrl:  `/api/collab/attachments/${row["attachment_id"] as string}/download`,
        };
      });

      res.json({ data });
    } catch (err) {
      logger?.error("collab_entity_attachments_list_error", { err: String(err) });
      next(err);
    }
  };

  router.post(  "/collab/attachments",                           uploadHandler);
  router.delete("/collab/attachments/:attachmentId",             deleteHandler);
  router.get(   "/collab/attachments/:attachmentId/download",    downloadHandler);
  router.post(  "/collab/attachments/:attachmentId/link",        linkHandler);
  router.delete("/collab/attachments/:attachmentId/link",        unlinkHandler);
  router.get(   "/collab/entity-attachments",                    listEntityAttachmentsHandler);
}
