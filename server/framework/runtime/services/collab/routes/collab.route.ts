/**
 * Collab Routes — comments on entity records
 *
 * GET    /api/collab/comments                     — list comments for an entity
 * POST   /api/collab/comments                     — create comment
 * GET    /api/collab/comments/unread-count         — unread count (returns 0)
 * PATCH  /api/collab/comments/:commentId          — update comment text
 * DELETE /api/collab/comments/:commentId          — soft-delete comment
 * POST   /api/collab/comments/:commentId/replies  — add reply
 *
 * Backed by master.comment. Tenant resolved from X-Org header.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
  resolvePrincipalIdWithJit,
} from "@athyper/svc-shared";

export interface CollabRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Row → API shape ───────────────────────────────────────────────────────────

function toComment(row: Record<string, unknown>) {
  return {
    id:              row.id,
    tenantId:        row.tenant_id,
    entityType:      row.entity_type,
    entityId:        row.entity_id,
    commenterId:     row.commenter_id ?? row.created_by,
    commenterName:   (row.commenter_name as string | undefined) ?? null,
    commentText:     row.comment_text,
    parentCommentId: row.parent_comment_id ?? null,
    threadDepth:     row.thread_depth ?? 0,
    visibility:      row.visibility ?? "public",
    createdAt:       row.created_at,
    updatedAt:       row.updated_at ?? null,
    replyCount:      Number(row.reply_count ?? 0),
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createCollabRoute(router: Router, deps: CollabRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /api/collab/comments ──────────────────────────────────────────────

  const listCommentsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityType = req.query["entityType"] as string | undefined;
      const entityId   = req.query["entityId"]   as string | undefined;
      const limit  = Math.min(100, Math.max(1, parseInt(String(req.query["limit"]  ?? "50"), 10)));
      const offset =                             parseInt(String(req.query["offset"] ?? "0"),  10);

      if (!entityType || !entityId) {
        res.status(400).json({ error: "entityType and entityId are required" });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.json({ ok: true, data: [], hasMore: false });
        return;
      }

      const rows = await db
        .selectFrom("master.comment as c")
        .select([
          "c.id", "c.tenant_id", "c.entity_type", "c.entity_id",
          "c.commenter_id", "c.comment_text", "c.parent_comment_id",
          "c.thread_depth", "c.visibility",
          "c.created_at", "c.updated_at", "c.created_by",
        ])
        .where("c.tenant_id",   "=", tenantId)
        .where("c.entity_type", "=", entityType)
        .where("c.entity_id",   "=", entityId)
        .where("c.deleted_at" as never, "is", null)
        .where("c.parent_comment_id", "is", null)
        .orderBy("c.created_at", "desc")
        .limit(limit + 1)
        .offset(offset)
        .execute() as Record<string, unknown>[];

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(toComment);

      res.json({ ok: true, data, hasMore });
    } catch (err) {
      logger?.error("collab_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/comments/unread-count ─────────────────────────────────

  const unreadCountHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      // Unread tracking not implemented yet — always return 0.
      res.json({ ok: true, count: 0 });
    } catch (err) {
      logger?.error("collab_unread_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/comments ─────────────────────────────────────────────

  const createCommentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { entityType, entityId, commentText, parentCommentId } =
        req.body as Record<string, string | undefined>;

      if (!entityType || !entityId || !commentText?.trim()) {
        res.status(400).json({ error: "entityType, entityId, and commentText are required" });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const commenterId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      let threadDepth = 0;
      if (parentCommentId && isUuid(parentCommentId)) {
        const parent = await db
          .selectFrom("master.comment as c")
          .select("c.thread_depth")
          .where("c.id", "=", parentCommentId)
          .where("c.tenant_id", "=", tenantId)
          .executeTakeFirst();
        threadDepth = Math.min(5, ((parent?.thread_depth as number) ?? 0) + 1);
      }

      const insertValues: Record<string, unknown> = {
        tenant_id:    tenantId,
        entity_type:  entityType,
        entity_id:    entityId,
        commenter_id: commenterId,
        comment_text: commentText.trim(),
        thread_depth: threadDepth,
        visibility:   "public",
        created_by:   commenterId,
      };
      if (parentCommentId && isUuid(parentCommentId)) {
        insertValues.parent_comment_id = parentCommentId;
      }

      const row = await db
        .insertInto("master.comment" as never)
        .values(insertValues as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: { id: (row as Record<string, unknown>).id } });
    } catch (err) {
      logger?.error("collab_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/comments/:commentId/replies ──────────────────────────

  const createReplyHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const parentCommentId = req.params["commentId"] as string;
      const { commentText } = req.body as Record<string, string | undefined>;

      if (!isUuid(parentCommentId)) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      if (!commentText?.trim()) {
        res.status(400).json({ error: "commentText is required" });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const parent = await db
        .selectFrom("master.comment as c")
        .select(["c.entity_type", "c.entity_id", "c.thread_depth"])
        .where("c.id", "=", parentCommentId)
        .where("c.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!parent) {
        res.status(404).json({ error: "Parent comment not found" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const commenterId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const row = await db
        .insertInto("master.comment" as never)
        .values({
          tenant_id:        tenantId,
          entity_type:      parent.entity_type,
          entity_id:        parent.entity_id,
          commenter_id:     commenterId,
          comment_text:     commentText.trim(),
          parent_comment_id: parentCommentId,
          thread_depth:     Math.min(5, ((parent.thread_depth as number) ?? 0) + 1),
          visibility:       "public",
          created_by:       commenterId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: { id: (row as Record<string, unknown>).id } });
    } catch (err) {
      logger?.error("collab_reply_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/comments/:commentId/replies ───────────────────────────

  const listRepliesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const parentId = req.params["commentId"] as string;
      if (!isUuid(parentId)) {
        res.json({ ok: true, data: [] });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      if (!tenantId) {
        res.json({ ok: true, data: [] });
        return;
      }

      const rows = await db
        .selectFrom("master.comment as c")
        .select([
          "c.id", "c.tenant_id", "c.entity_type", "c.entity_id",
          "c.commenter_id", "c.comment_text", "c.parent_comment_id",
          "c.thread_depth", "c.visibility", "c.created_at", "c.updated_at", "c.created_by",
        ])
        .where("c.tenant_id", "=", tenantId)
        .where("c.parent_comment_id", "=", parentId)
        .where("c.deleted_at" as never, "is", null)
        .orderBy("c.created_at", "asc")
        .execute() as Record<string, unknown>[];

      res.json({ ok: true, data: rows.map(toComment) });
    } catch (err) {
      logger?.error("collab_replies_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /api/collab/comments/:commentId ─────────────────────────────────

  const updateCommentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const commentId = req.params["commentId"] as string;
      const { commentText } = req.body as Record<string, string | undefined>;

      if (!isUuid(commentId)) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      if (!commentText?.trim()) {
        res.status(400).json({ error: "commentText is required" });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const row = await db
        .updateTable("master.comment" as never)
        .set({ comment_text: commentText.trim(), updated_at: new Date().toISOString() } as never)
        .where("id" as never, "=", commentId as never)
        .where("tenant_id" as never, "=", (tenantId ?? "") as never)
        .where("deleted_at" as never, "is", null)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }

      res.json({ ok: true, data: toComment(row as Record<string, unknown>) });
    } catch (err) {
      logger?.error("collab_update_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /api/collab/comments/:commentId ────────────────────────────────

  const deleteCommentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const commentId = req.params["commentId"] as string;
      if (!isUuid(commentId)) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const deletedBy = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId ?? "", claims)
        : SYSTEM_PRINCIPAL_UUID;

      const row = await db
        .updateTable("master.comment" as never)
        .set({ deleted_at: new Date().toISOString(), deleted_by: deletedBy } as never)
        .where("id" as never, "=", commentId as never)
        .where("tenant_id" as never, "=", (tenantId ?? "") as never)
        .where("deleted_at" as never, "is", null)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }

      res.status(204).end();
    } catch (err) {
      logger?.error("collab_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register routes ───────────────────────────────────────────────────────
  // Static paths must come before the :commentId param routes.
  router.get("/collab/comments/unread-count",         unreadCountHandler);
  router.get("/collab/comments",                       listCommentsHandler);
  router.post("/collab/comments",                      createCommentHandler);
  router.get("/collab/comments/:commentId/replies",    listRepliesHandler);
  router.post("/collab/comments/:commentId/replies",   createReplyHandler);
  router.patch("/collab/comments/:commentId",          updateCommentHandler);
  router.delete("/collab/comments/:commentId",         deleteCommentHandler);

  return router;
}
