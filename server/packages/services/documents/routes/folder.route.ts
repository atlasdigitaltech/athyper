/**
 * Attachment Folder Routes
 *
 * GET    /documents/:docType/:id/folders                    — list folders for entity
 * POST   /documents/:docType/:id/folders                    — create folder
 * PATCH  /documents/:docType/:id/folders/:folderId          — rename folder
 * DELETE /documents/:docType/:id/folders/:folderId          — delete (files become uncategorized)
 * PATCH  /documents/:docType/:id/attachments/:attachmentId/move — move attachment to folder / root
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import { resolveDocumentEntity } from "./entity-resolver.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface FolderRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolvePrincipalId(db: Kysely<any>, sub: string, tenantId: string, realmKey = "athyper"): Promise<string> {
  if (!sub) return SYSTEM_PRINCIPAL_UUID;
  const row = await db
    .selectFrom("master.principal_identity_binding as pab")
    .select("pab.principal_id")
    .where("pab.subject_id", "=", sub)
    .where("pab.realm_key", "=", realmKey)
    .where("pab.tenant_id", "=", tenantId)
    .executeTakeFirst();
  return row ? (row.principal_id as string) : SYSTEM_PRINCIPAL_UUID;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerFolderRoutes(router: Router, deps: FolderRouteDeps): void {
  const { db, auth, logger } = deps;

  // ── LIST folders ────────────────────────────────────────────────────────────
  const listFoldersHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id } = req.params as { docType: string; id: string };
      if (!isUuid(id)) { res.status(404).json({ error: "DOCUMENT_NOT_FOUND" }); return; }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) { res.status(404).json({ error: "ENTITY_NOT_FOUND" }); return; }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const rows = await db
        .selectFrom("document.attachment_folder as f")
        .select(["f.id", "f.name", "f.parent_id", "f.display_order", "f.created_at"])
        .where("f.tenant_id",   "=", tenantId)
        .where("f.entity_type", "=", entity.name as string)
        .where("f.entity_id",   "=", id)
        .orderBy("f.display_order", "asc")
        .orderBy("f.name",          "asc")
        .execute();

      res.json((rows as Record<string, unknown>[]).map((r) => ({
        id:            r["id"]            as string,
        name:          r["name"]          as string,
        parent_id:     (r["parent_id"]    as string) ?? null,
        display_order: Number(r["display_order"] ?? 0),
        created_at:    r["created_at"],
      })));
    } catch (err) {
      logger?.error("folders_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── CREATE folder ───────────────────────────────────────────────────────────
  const createFolderHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id } = req.params as { docType: string; id: string };
      if (!isUuid(id)) { res.status(404).json({ error: "DOCUMENT_NOT_FOUND" }); return; }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) { res.status(404).json({ error: "ENTITY_NOT_FOUND" }); return; }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const body = req.body as { name?: string; parent_id?: string };
      const name = body.name?.trim().slice(0, 200);
      if (!name) { res.status(400).json({ error: "MISSING_FIELDS", message: "name is required" }); return; }

      if (body.parent_id && !isUuid(body.parent_id)) {
        res.status(400).json({ error: "INVALID_PARENT_ID" }); return;
      }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);
      const folderId    = crypto.randomUUID();

      await db
        .insertInto("document.attachment_folder" as never)
        .values({
          id:          folderId,
          tenant_id:   tenantId,
          entity_type: entity.name as string,
          entity_id:   id,
          name,
          parent_id:   body.parent_id ?? null,
          created_by:  principalId,
          updated_by:  principalId,
        } as never)
        .execute();

      res.status(201).json({ id: folderId, name, parent_id: body.parent_id ?? null });
    } catch (err) {
      logger?.error("folders_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── RENAME folder ───────────────────────────────────────────────────────────
  const renameFolderHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id, folderId } = req.params as { docType: string; id: string; folderId: string };
      if (!isUuid(id) || !isUuid(folderId)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) { res.status(404).json({ error: "ENTITY_NOT_FOUND" }); return; }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const body = req.body as { name?: string };
      const name = body.name?.trim().slice(0, 200);
      if (!name) { res.status(400).json({ error: "MISSING_FIELDS", message: "name is required" }); return; }

      const sub         = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalId(db, sub, tenantId, xRealm);

      await db
        .updateTable("document.attachment_folder" as never)
        .set({ name, updated_at: new Date(), updated_by: principalId } as never)
        .where("id"          as never, "=", folderId              as never)
        .where("tenant_id"   as never, "=", tenantId              as never)
        .where("entity_type" as never, "=", entity.name as never)
        .where("entity_id"   as never, "=", id                    as never)
        .execute();

      res.json({ id: folderId, name });
    } catch (err) {
      logger?.error("folders_rename_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE folder ───────────────────────────────────────────────────────────
  // Files in the deleted folder become uncategorized (folder_id → NULL via ON DELETE SET NULL).
  const deleteFolderHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id, folderId } = req.params as { docType: string; id: string; folderId: string };
      if (!isUuid(id) || !isUuid(folderId)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) { res.status(404).json({ error: "ENTITY_NOT_FOUND" }); return; }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      await db
        .deleteFrom("document.attachment_folder" as never)
        .where("id"          as never, "=", folderId              as never)
        .where("tenant_id"   as never, "=", tenantId              as never)
        .where("entity_type" as never, "=", entity.name as never)
        .where("entity_id"   as never, "=", id                    as never)
        .execute();

      res.status(204).end();
    } catch (err) {
      logger?.error("folders_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── MOVE attachment to folder (or root) ─────────────────────────────────────
  const moveAttachmentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { docType, id, attachmentId } = req.params as {
        docType: string; id: string; attachmentId: string;
      };
      if (!isUuid(id) || !isUuid(attachmentId)) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) { res.status(404).json({ error: "ENTITY_NOT_FOUND" }); return; }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const body     = req.body as { folder_id?: string | null };
      const folderId = body.folder_id ?? null;

      if (folderId !== null && !isUuid(folderId)) {
        res.status(400).json({ error: "INVALID_FOLDER_ID" }); return;
      }

      await db
        .updateTable("document.attachment_link" as never)
        .set({ folder_id: folderId } as never)
        .where("tenant_id"     as never, "=", tenantId      as never)
        .where("entity_type"   as never, "=", entity.name as never)
        .where("entity_id"     as never, "=", id            as never)
        .where("attachment_id" as never, "=", attachmentId  as never)
        .execute();

      res.json({ attachment_id: attachmentId, folder_id: folderId });
    } catch (err) {
      logger?.error("folders_move_error", { err: String(err) });
      next(err);
    }
  };

  // Register
  router.get(   "/documents/:docType/:id/folders",                              listFoldersHandler);
  router.post(  "/documents/:docType/:id/folders",                              createFolderHandler);
  router.patch( "/documents/:docType/:id/folders/:folderId",                    renameFolderHandler);
  router.delete("/documents/:docType/:id/folders/:folderId",                    deleteFolderHandler);
  router.patch( "/documents/:docType/:id/attachments/:attachmentId/move",       moveAttachmentHandler);
}
