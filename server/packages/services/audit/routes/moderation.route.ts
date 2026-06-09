/**
 * Comment Moderation Routes
 *
 * GET  /moderation/flags                    — list flags (all 4 statuses)
 * GET  /moderation/flags/:id                — single flag detail
 * POST /moderation/flags/:id/review         — status → reviewed
 * POST /moderation/flags/:id/dismiss        — status → dismissed
 * POST /moderation/flags/:id/action         — status → actioned (requires review_note; hides comment)
 * GET  /moderation/comments/:commentId      — governance.comment_moderation state (O(1) render-time)
 *
 * Backed by event.comment_flag + governance.comment_moderation.
 * All 4 flag statuses exposed: pending, reviewed, dismissed, actioned.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  parsePagination,
} from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface ModerationRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

function toFlag(r: Record<string, unknown>) {
  return {
    id:           r["id"],
    tenantId:     r["tenant_id"],
    contextType:  r["context_type"],
    commentId:    r["comment_id"],
    flaggedBy:    r["flagged_by"],
    flagReason:   r["flag_reason"],
    note:         r["note"] ?? null,
    status:       r["status"],
    reviewedBy:   r["reviewed_by"] ?? null,
    reviewedAt:   r["reviewed_at"] ?? null,
    reviewNote:   r["review_note"] ?? null,
    createdAt:    r["created_at"],
    updatedAt:    r["updated_at"] ?? null,
  };
}

function toModerationState(r: Record<string, unknown>) {
  return {
    id:            r["id"],
    tenantId:      r["tenant_id"],
    contextType:   r["context_type"],
    commentId:     r["comment_id"],
    isHidden:      r["is_hidden"],
    hiddenReason:  r["hidden_reason"] ?? null,
    hiddenAt:      r["hidden_at"] ?? null,
    hiddenBy:      r["hidden_by"] ?? null,
    flagCount:     r["flag_count"],
    lastFlaggedAt: r["last_flagged_at"] ?? null,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createModerationRoutes(router: Router, deps: ModerationRouteDeps): void {
  const { db, auth, logger } = deps;

  async function ctx(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const { xOrg, xRealm } = extractOrgHeaders(req);
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return null; }
    const sub = claims["sub"] as string ?? "";
    const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId) ?? sub;
    return { tenantId, principalId };
  }

  // ── GET /moderation/flags ─────────────────────────────────────────────────
  // All 4 statuses: pending, reviewed, dismissed, actioned

  router.get("/moderation/flags", async (req, res, next) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const status      = req.query["status"]      as string | undefined;
      const contextType = req.query["contextType"] as string | undefined;
      const commentId   = req.query["commentId"]   as string | undefined;

      if (commentId && !isUuid(commentId)) {
        res.status(400).json({ error: "INVALID_PARAM", message: "commentId must be a UUID" }); return;
      }

      let q = db
        .selectFrom("event.comment_flag as cf" as never)
        .selectAll("cf" as never)
        .where("cf.tenant_id" as never, "=", c.tenantId as never)
        .orderBy("cf.created_at" as never, "desc")
        .limit(limit + 1).offset(offset);

      if (status)      q = q.where("cf.status" as never,       "=", status as never);
      if (contextType) q = q.where("cf.context_type" as never, "=", contextType as never);
      if (commentId)   q = q.where("cf.comment_id" as never,   "=", commentId as never);

      const rows = await q.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toFlag), hasMore });
    } catch (err) {
      logger?.error("moderation_list_flags_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /moderation/flags/:id ─────────────────────────────────────────────

  router.get("/moderation/flags/:id", async (req, res, next) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .selectFrom("event.comment_flag as cf" as never)
        .selectAll("cf" as never)
        .where("cf.id" as never, "=", id as never)
        .where("cf.tenant_id" as never, "=", c.tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toFlag(row) });
    } catch (err) {
      logger?.error("moderation_get_flag_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /moderation/flags/:id/review ────────────────────────────────────

  router.post("/moderation/flags/:id/review", async (req, res, next) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { reviewNote } = req.body as Record<string, unknown>;
      const row = await db
        .updateTable("event.comment_flag" as never)
        .set({ status: "reviewed", reviewed_by: c.principalId, reviewed_at: new Date(), review_note: reviewNote ?? null, updated_at: new Date(), updated_by: c.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .where("status" as never, "=", "pending" as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE", message: "Flag must be in pending status" }); return; }
      res.json({ ok: true, data: toFlag(row) });
    } catch (err) {
      logger?.error("moderation_review_flag_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /moderation/flags/:id/dismiss ───────────────────────────────────

  router.post("/moderation/flags/:id/dismiss", async (req, res, next) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { reviewNote } = req.body as Record<string, unknown>;
      const row = await db
        .updateTable("event.comment_flag" as never)
        .set({ status: "dismissed", reviewed_by: c.principalId, reviewed_at: new Date(), review_note: reviewNote ?? null, updated_at: new Date(), updated_by: c.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .where("status" as never, "in", ["pending", "reviewed"] as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(409).json({ error: "INVALID_STATE" }); return; }
      res.json({ ok: true, data: toFlag(row) });
    } catch (err) {
      logger?.error("moderation_dismiss_flag_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /moderation/flags/:id/action ────────────────────────────────────
  // Requires review_note. Upserts governance.comment_moderation → is_hidden=true.

  router.post("/moderation/flags/:id/action", async (req, res, next) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { reviewNote } = req.body as Record<string, unknown>;
      if (!reviewNote) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "reviewNote is required when actioning a flag" }); return;
      }

      await db.transaction().execute(async (trx) => {
        // Update flag to actioned
        const flag = await trx
          .updateTable("event.comment_flag" as never)
          .set({ status: "actioned", reviewed_by: c.principalId, reviewed_at: new Date(), review_note: reviewNote, updated_at: new Date(), updated_by: c.principalId } as never)
          .where("id" as never, "=", id as never)
          .where("tenant_id" as never, "=", c.tenantId as never)
          .where("status" as never, "in", ["pending", "reviewed"] as never)
          .returning(["id", "comment_id", "context_type"] as never[])
          .executeTakeFirst() as Record<string, unknown> | undefined;

        if (!flag) throw Object.assign(new Error("INVALID_STATE"), { code: 409 });

        // Upsert governance.comment_moderation — hide the comment
        await trx
          .insertInto("governance.comment_moderation" as never)
          .values({
            tenant_id: c.tenantId, context_type: flag["context_type"],
            comment_id: flag["comment_id"], is_hidden: true,
            hidden_reason: reviewNote as string,
            hidden_at: new Date(), hidden_by: c.principalId,
            created_by: c.principalId,
          } as never)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .onConflict((oc: any) =>
            oc.columns(["tenant_id", "context_type", "comment_id"]).doUpdateSet({
              is_hidden: true, hidden_reason: reviewNote,
              hidden_at: new Date(), hidden_by: c.principalId,
              updated_at: new Date(), updated_by: c.principalId,
            } as never)
          )
          .execute();
      });

      res.json({ ok: true });
    } catch (err) {
      const e = err as { code?: number };
      if (e.code === 409) { res.status(409).json({ error: "INVALID_STATE" }); return; }
      logger?.error("moderation_action_flag_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /moderation/comments/:commentId ──────────────────────────────────
  // O(1) render-time moderation state check from governance.comment_moderation.

  router.get("/moderation/comments/:commentId", async (req, res, next) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const { commentId } = req.params;
      if (!isUuid(commentId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .selectFrom("governance.comment_moderation as cm" as never)
        .selectAll("cm" as never)
        .where("cm.tenant_id" as never, "=", c.tenantId as never)
        .where("cm.comment_id" as never, "=", commentId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      // No moderation record = comment is visible
      if (!row) { res.json({ ok: true, data: { isHidden: false, flagCount: 0 } }); return; }
      res.json({ ok: true, data: toModerationState(row) });
    } catch (err) {
      logger?.error("moderation_get_comment_state_error", { err: String(err) });
      next(err);
    }
  });
}
