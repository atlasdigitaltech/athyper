/**
 * Collab Routes — comments, reactions, drafts, mentions, and flags
 *
 * GET    /api/collab/comments                              — list root comments
 * POST   /api/collab/comments                             — create comment
 * GET    /api/collab/comments/unread-count                — unread count via cursor
 * POST   /api/collab/comments/mark-all-read               — upsert read cursor
 * PATCH  /api/collab/comments/:commentId                  — update comment text
 * DELETE /api/collab/comments/:commentId                  — soft-delete comment
 * GET    /api/collab/comments/:commentId/replies          — list replies
 * POST   /api/collab/comments/:commentId/replies          — add reply
 * GET    /api/collab/comments/:commentId/reactions        — list reactions with emoji
 * POST   /api/collab/comments/:commentId/reactions        — toggle reaction on/off
 * POST   /api/collab/comments/:commentId/flag             — submit abuse flag
 * GET    /api/collab/drafts                               — load draft for entity
 * POST   /api/collab/drafts                               — upsert draft
 * DELETE /api/collab/drafts                               — discard draft
 * GET    /api/collab/mentions                             — search principals for @-mention
 *
 * Backed by master.comment / master.comment_reaction / master.comment_draft /
 * master.comment_feed_cursor / event.comment_flag.
 * Tenant resolved from X-Org header.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
  resolvePrincipalIdWithJit,
} from "@athyper/svc-shared";
import type { RedisClient } from "@athyper/adapter-memorycache";

// Local duck-type for MentionService (avoids cross-package rootDir import)
interface MentionObject { userId: string; displayName: string }
interface ProcessMentionsInput {
  commentId: string; contextType: string; tenantId: string; authorId: string;
  commentText: string; entityType: string; entityId: string;
  previousMentions?: MentionObject[];
}
interface ProcessMentionsResult { added: MentionObject[]; removed: MentionObject[]; total: MentionObject[] }
interface MentionService {
  processMentions(input: ProcessMentionsInput): Promise<ProcessMentionsResult>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CONTEXT_TYPE = "entity";

// Canonical 8 reaction codes shown in the UI picker (matches REACTIONS in CommentReactions.tsx).
const REACTION_CODES = new Set([
  "thumbs_up", "thumbs_down", "heart", "celebrate",
  "eyes", "rocket", "idea", "thinking",
]);

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface CollabRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  mentionService?: MentionService;
  /** Optional ioredis client for pub/sub activity delivery. When absent the
   *  SSE stream degrades gracefully to 12-second DB polling. */
  redis?: RedisClient;
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
    contentFormat:   (row.content_format as string | undefined) ?? "plain",
    contentJson:     (row.content_json as unknown) ?? null,
    contentHtml:     (row.content_html as string | undefined) ?? null,
    parentCommentId: row.parent_comment_id ?? null,
    threadDepth:     row.thread_depth ?? 0,
    visibility:      row.visibility ?? "public",
    createdAt:       row.created_at,
    updatedAt:       row.updated_at ?? null,
    replyCount:      Number(row.reply_count ?? 0),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates entity_document_link rows linking pre-uploaded attachments to a
 * comment. Called inside the comment insert flow — any DB error rolls back
 * the whole operation via the caller's try/catch.
 * reference_count on master.attachment is incremented for each valid link.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function linkAttachmentsToComment(
  db: Kysely<any>,
  tenantId: string,
  commentId: string,
  principalId: string,
  attachmentIds: string[],
): Promise<void> {
  const validIds = attachmentIds.filter(isUuid).slice(0, 10); // spec: max 10
  if (validIds.length === 0) return;

  // Verify all attachment_ids belong to this tenant and are active
  const rows = await db
    .selectFrom("master.attachment as a")
    .select(["a.id"])
    .where("a.tenant_id", "=", tenantId)
    .where("a.status",    "=", "active")
    .where("a.id",        "in", validIds)
    .execute() as { id: string }[];

  const confirmedIds = rows.map((r) => r.id);
  if (confirmedIds.length === 0) return;

  // Insert link rows
  await db
    .insertInto("master.entity_document_link" as never)
    .values(
      confirmedIds.map((aid) => ({
        tenant_id:     tenantId,
        entity_type:   "master.comment",
        entity_id:     commentId,
        attachment_id: aid,
        link_kind:     "related",
        display_order: 0,
        created_by:    principalId,
      })),
    )
    .onConflict((oc) => oc.doNothing() as never)
    .execute();

  // Increment reference_count on each linked attachment
  if (confirmedIds.length > 0) {
    await db
      .updateTable("master.attachment" as never)
      .set({ reference_count: sql`reference_count + 1`, updated_at: new Date() } as never)
      .where("id"        as never, "in", confirmedIds as never)
      .where("tenant_id" as never, "=",  tenantId     as never)
      .execute();
  }
}

/** Resolve org headers → tenantId, 400 on failure. */
async function resolveTenant(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
): Promise<string | null> {
  const xOrg   = (req.headers["x-org"]   as string) ?? "";
  const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
  return resolveTenantId(db, xOrg, xRealm);
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createCollabRoute(router: Router, deps: CollabRouteDeps): Router {
  const { db, auth, mentionService, logger, redis } = deps;

  // ── Pub/Sub & activity-log helpers ────────────────────────────────────────

  /** PUBLISH an activity event to all SSE subscribers of this entity. Fire-and-forget. */
  const publishActivity = (
    tenantId: string, entityType: string, entityId: string,
    eventType: string, data: unknown, createdAt: string,
  ): void => {
    if (!redis) return;
    const ch = `activity:${tenantId}:${entityType}:${entityId}`;
    redis.publish(ch, JSON.stringify({ eventType, createdAt, data })).catch((err: unknown) => {
      logger?.error("collab_pubsub_publish_error", { err: String(err) });
    });
  };

  /** Insert a row into log.activity_log. Best-effort — non-fatal. */
  const logActivity = async (
    tenantId: string, entityType: string, entityId: string,
    activityType: string, actorId: string, detail: Record<string, unknown>,
  ): Promise<void> => {
    try {
      await db
        .insertInto("log.activity_log" as never)
        .values({
          tenant_id:     tenantId,
          log_type:      "business",
          domain:        "user",
          activity_type: activityType,
          entity_type:   entityType,
          entity_id:     entityId,
          actor_id:      actorId,
          actor_type:    "principal",
          detail:        JSON.stringify(detail),
          created_by:    actorId,
        } as never)
        .execute();
    } catch { /* best-effort — main operation already succeeded */ }
  };

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
      if (!isUuid(entityId)) {
        res.json({ ok: true, data: [], hasMore: false });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.json({ ok: true, data: [], hasMore: false });
        return;
      }

      const rows = await db
        .selectFrom("master.comment as c")
        .leftJoin("master.principal as p", "p.id" as never, "c.commenter_id" as never)
        .select([
          "c.id", "c.tenant_id", "c.entity_type", "c.entity_id",
          "c.commenter_id", "c.comment_text", "c.content_format" as never,
          "c.content_json" as never, "c.content_html" as never,
          "c.parent_comment_id",
          "c.thread_depth", "c.visibility",
          "c.created_at", "c.updated_at", "c.created_by",
          "p.name as commenter_name" as never,
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
      const pageRows = rows.slice(0, limit);

      // Bulk-count replies for each root comment in this page
      let replyCounts: Record<string, number> = {};
      if (pageRows.length > 0) {
        const commentIds = pageRows.map((r) => r.id as string);
        const rcResult = await sql<{ parent_comment_id: string; cnt: string }>`
          SELECT parent_comment_id, COUNT(*)::text AS cnt
          FROM master.comment
          WHERE parent_comment_id = ANY(${sql.val(commentIds)}::uuid[])
            AND deleted_at IS NULL
          GROUP BY parent_comment_id
        `.execute(db);
        for (const r of rcResult.rows) {
          replyCounts[r.parent_comment_id] = Number(r.cnt);
        }
      }

      const data = pageRows.map((row) => ({
        ...toComment(row),
        replyCount: replyCounts[row.id as string] ?? 0,
      }));

      res.json({ ok: true, data, hasMore });
    } catch (err) {
      logger?.error("collab_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/comments/unread-count ─────────────────────────────────
  // Uses master.comment_feed_cursor for O(1) lookup.

  const unreadCountHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityType = req.query["entityType"] as string | undefined;
      const entityId   = req.query["entityId"]   as string | undefined;

      if (!entityType || !entityId || !isUuid(entityId)) {
        res.json({ ok: true, count: 0 });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.json({ ok: true, count: 0 });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      if (!sub) {
        res.json({ ok: true, count: 0 });
        return;
      }
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, claims);

      // Fetch cursor
      const cursor = await db
        .selectFrom("master.comment_feed_cursor as cfc" as never)
        .select("cfc.last_read_at" as never)
        .where("cfc.tenant_id" as never, "=", tenantId as never)
        .where("cfc.principal_id" as never, "=", principalId as never)
        .where("cfc.entity_type" as never, "=", entityType as never)
        .where("cfc.entity_id" as never, "=", entityId as never)
        .executeTakeFirst() as { last_read_at: string } | undefined;

      if (!cursor) {
        // No cursor means never opened — count all non-own comments
        const result = await db
          .selectFrom("master.comment as c")
          .select(db.fn.countAll<string>().as("n"))
          .where("c.tenant_id" as never, "=", tenantId as never)
          .where("c.entity_type" as never, "=", entityType as never)
          .where("c.entity_id" as never, "=", entityId as never)
          .where("c.commenter_id" as never, "!=" as never, principalId as never)
          .where("c.deleted_at" as never, "is", null)
          .executeTakeFirst() as { n: string } | undefined;

        res.json({ ok: true, count: parseInt(result?.n ?? "0", 10) });
        return;
      }

      const result = await db
        .selectFrom("master.comment as c")
        .select(db.fn.countAll<string>().as("n"))
        .where("c.tenant_id" as never, "=", tenantId as never)
        .where("c.entity_type" as never, "=", entityType as never)
        .where("c.entity_id" as never, "=", entityId as never)
        .where("c.created_at" as never, ">" as never, cursor.last_read_at as never)
        .where("c.commenter_id" as never, "!=" as never, principalId as never)
        .where("c.deleted_at" as never, "is", null)
        .executeTakeFirst() as { n: string } | undefined;

      res.json({ ok: true, count: parseInt(result?.n ?? "0", 10) });
    } catch (err) {
      logger?.error("collab_unread_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/comments/mark-all-read ───────────────────────────────

  const markAllReadHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityType = (req.query["entityType"] ?? req.body?.entityType) as string | undefined;
      const entityId   = (req.query["entityId"]   ?? req.body?.entityId)   as string | undefined;

      if (!entityType || !entityId) {
        res.status(400).json({ error: "entityType and entityId are required" });
        return;
      }
      if (!isUuid(entityId)) {
        res.json({ ok: true });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const now = new Date().toISOString();

      await db
        .insertInto("master.comment_feed_cursor" as never)
        .values({
          tenant_id:    tenantId,
          principal_id: principalId,
          entity_type:  entityType,
          entity_id:    entityId,
          last_read_at: now,
          created_by:   principalId,
        } as never)
        .onConflict((oc) =>
          oc.columns(["tenant_id", "principal_id", "entity_type", "entity_id"] as never[])
            .doUpdateSet({ last_read_at: now, updated_at: now } as never),
        )
        .execute();

      res.json({ ok: true });
    } catch (err) {
      logger?.error("collab_mark_read_error", { err: String(err) });
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
      const attachmentIds: string[] = Array.isArray((req.body as Record<string, unknown>).attachment_ids)
        ? ((req.body as Record<string, unknown>).attachment_ids as string[])
        : [];
      const contentJson = (req.body as Record<string, unknown>).contentJson ?? null;
      const contentHtml = typeof (req.body as Record<string, unknown>).contentHtml === "string"
        ? (req.body as Record<string, unknown>).contentHtml as string
        : null;
      const VALID_VISIBILITIES = ["internal", "public", "private"] as const;
      type CommentVis = typeof VALID_VISIBILITIES[number];
      const rawVis = (req.body as Record<string, unknown>).visibility;
      const visibility: CommentVis = (VALID_VISIBILITIES as readonly string[]).includes(rawVis as string)
        ? rawVis as CommentVis
        : "internal";

      const hasContent = commentText?.trim() || attachmentIds.length > 0 || contentJson;
      if (!entityType || !entityId || !hasContent) {
        res.status(400).json({ error: "entityType, entityId, and content are required" });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
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

      const trimmedText = commentText?.trim() || (attachmentIds.length > 0 ? "[attachment]" : "[rich comment]");
      const isRich = !!contentJson;
      const insertValues: Record<string, unknown> = {
        tenant_id:      tenantId,
        context_type:   DEFAULT_CONTEXT_TYPE,
        entity_type:    entityType,
        entity_id:      entityId,
        commenter_id:   commenterId,
        comment_text:   trimmedText.slice(0, 50000),
        content_format: isRich ? "rich_json" : "plain",
        thread_depth:   threadDepth,
        visibility,
        created_by:     commenterId,
      };
      if (contentJson)     insertValues.content_json = JSON.stringify(contentJson);
      if (contentHtml)     insertValues.content_html = contentHtml;
      if (parentCommentId && isUuid(parentCommentId)) {
        insertValues.parent_comment_id = parentCommentId;
      }

      const row = await db
        .insertInto("master.comment" as never)
        .values(insertValues as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      const commentId = (row as Record<string, unknown>).id as string;
      const createdAt  = (row as Record<string, unknown>).created_at instanceof Date
        ? ((row as Record<string, unknown>).created_at as Date).toISOString()
        : String((row as Record<string, unknown>).created_at);

      // Link pre-uploaded attachments to this comment — best-effort, non-fatal
      if (attachmentIds.length > 0) {
        await linkAttachmentsToComment(db, tenantId, commentId, commenterId, attachmentIds).catch(() => {});
      }

      // Publish to Redis pub/sub and write to activity log — both fire-and-forget
      const commentEvt = {
        id:              commentId,
        commenterId,
        commentText:     trimmedText,
        parentCommentId: (parentCommentId && isUuid(parentCommentId)) ? parentCommentId : null,
        threadDepth,
        createdAt,
      };
      void logActivity(tenantId, entityType, entityId, "user.comment_posted", commenterId, commentEvt);
      publishActivity(tenantId, entityType, entityId, "activity:comment", commentEvt, createdAt);

      // Process @mentions: persist mention rows + dispatch notifications
      if (mentionService) {
        try {
          const mentionResult = await mentionService.processMentions({
            commentId,
            contextType: DEFAULT_CONTEXT_TYPE,
            tenantId,
            authorId: commenterId,
            commentText: trimmedText,
            entityType,
            entityId,
          });

          if (mentionResult.total.length > 0) {
            const mentionsJson = JSON.stringify(
              mentionResult.total.map((m: { userId: string; displayName: string }) => ({ user_id: m.userId, display_name: m.displayName })),
            );
            await db
              .updateTable("master.comment" as never)
              .set({ mentions: mentionsJson } as never)
              .where("id" as never, "=", commentId as never)
              .where("tenant_id" as never, "=", tenantId as never)
              .execute();
          }
        } catch {
          // Mention processing failure is non-fatal — comment was already saved.
        }
      }

      res.status(201).json({ ok: true, data: { id: commentId } });
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
      const { commentText: replyText } = req.body as Record<string, string | undefined>;
      const replyAttachmentIds: string[] = Array.isArray((req.body as Record<string, unknown>).attachment_ids)
        ? ((req.body as Record<string, unknown>).attachment_ids as string[])
        : [];
      const replyContentJson = (req.body as Record<string, unknown>).contentJson ?? null;
      const replyContentHtml = typeof (req.body as Record<string, unknown>).contentHtml === "string"
        ? (req.body as Record<string, unknown>).contentHtml as string
        : null;
      const REPLY_VALID_VIS = ["internal", "public", "private"] as const;
      type ReplyVis = typeof REPLY_VALID_VIS[number];
      const rawReplyVis = (req.body as Record<string, unknown>).visibility;
      const replyVisibility: ReplyVis = (REPLY_VALID_VIS as readonly string[]).includes(rawReplyVis as string)
        ? rawReplyVis as ReplyVis
        : "internal";

      if (!isUuid(parentCommentId)) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      const hasReplyContent = replyText?.trim() || replyAttachmentIds.length > 0 || replyContentJson;
      if (!hasReplyContent) {
        res.status(400).json({ error: "Reply must have text, attachments, or rich content" });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
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

      const trimmedText = replyText?.trim() || (replyAttachmentIds.length > 0 ? "[attachment]" : "[rich comment]");
      const replyInsertValues: Record<string, unknown> = {
        tenant_id:         tenantId,
        context_type:      DEFAULT_CONTEXT_TYPE,
        entity_type:       parent.entity_type,
        entity_id:         parent.entity_id,
        commenter_id:      commenterId,
        comment_text:      trimmedText.slice(0, 50000),
        content_format:    replyContentJson ? "rich_json" : "plain",
        parent_comment_id: parentCommentId,
        thread_depth:      Math.min(5, ((parent.thread_depth as number) ?? 0) + 1),
        visibility:        replyVisibility,
        created_by:        commenterId,
      };
      if (replyContentJson) replyInsertValues.content_json = JSON.stringify(replyContentJson);
      if (replyContentHtml) replyInsertValues.content_html = replyContentHtml;

      const row = await db
        .insertInto("master.comment" as never)
        .values(replyInsertValues as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      const commentId = (row as Record<string, unknown>).id as string;
      const createdAt  = (row as Record<string, unknown>).created_at instanceof Date
        ? ((row as Record<string, unknown>).created_at as Date).toISOString()
        : String((row as Record<string, unknown>).created_at);

      if (replyAttachmentIds.length > 0) {
        await linkAttachmentsToComment(db, tenantId, commentId, commenterId, replyAttachmentIds).catch(() => {});
      }

      // Publish to Redis pub/sub and write to activity log — both fire-and-forget
      const replyEvt = {
        id:              commentId,
        commenterId,
        commentText:     trimmedText,
        parentCommentId,
        threadDepth:     Math.min(5, ((parent.thread_depth as number) ?? 0) + 1),
        createdAt,
      };
      void logActivity(
        tenantId, parent.entity_type as string, parent.entity_id as string,
        "user.comment_posted", commenterId, replyEvt,
      );
      publishActivity(
        tenantId, parent.entity_type as string, parent.entity_id as string,
        "activity:comment", replyEvt, createdAt,
      );

      // Process @mentions in reply
      if (mentionService) {
        try {
          const mentionResult = await mentionService.processMentions({
            commentId,
            contextType: DEFAULT_CONTEXT_TYPE,
            tenantId,
            authorId: commenterId,
            commentText: trimmedText,
            entityType: parent.entity_type as string,
            entityId: parent.entity_id as string,
          });

          if (mentionResult.total.length > 0) {
            const mentionsJson = JSON.stringify(
              mentionResult.total.map((m: { userId: string; displayName: string }) => ({ user_id: m.userId, display_name: m.displayName })),
            );
            await db
              .updateTable("master.comment" as never)
              .set({ mentions: mentionsJson } as never)
              .where("id" as never, "=", commentId as never)
              .where("tenant_id" as never, "=", tenantId as never)
              .execute();
          }
        } catch {
          // Non-fatal
        }
      }

      res.status(201).json({ ok: true, data: { id: commentId } });
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

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.json({ ok: true, data: [] });
        return;
      }

      const rows = await db
        .selectFrom("master.comment as c")
        .leftJoin("master.principal as p", "p.id" as never, "c.commenter_id" as never)
        .select([
          "c.id", "c.tenant_id", "c.entity_type", "c.entity_id",
          "c.commenter_id", "c.comment_text", "c.content_format" as never,
          "c.content_json" as never, "c.content_html" as never,
          "c.parent_comment_id",
          "c.thread_depth", "c.visibility", "c.created_at", "c.updated_at", "c.created_by",
          "p.name as commenter_name" as never,
        ])
        .where("c.tenant_id", "=", tenantId)
        .where("c.parent_comment_id", "=", parentId)
        .where("c.deleted_at" as never, "is", null)
        .orderBy("c.created_at", "asc")
        .execute() as Record<string, unknown>[];

      // Bulk-count nested replies for each reply in this thread
      let replyCounts: Record<string, number> = {};
      if (rows.length > 0) {
        const replyIds = rows.map((r) => r.id as string);
        const rcResult = await sql<{ parent_comment_id: string; cnt: string }>`
          SELECT parent_comment_id, COUNT(*)::text AS cnt
          FROM master.comment
          WHERE parent_comment_id = ANY(${sql.val(replyIds)}::uuid[])
            AND deleted_at IS NULL
          GROUP BY parent_comment_id
        `.execute(db);
        for (const r of rcResult.rows) {
          replyCounts[r.parent_comment_id] = Number(r.cnt);
        }
      }

      const data = rows.map((row) => ({
        ...toComment(row),
        replyCount: replyCounts[row.id as string] ?? 0,
      }));

      res.json({ ok: true, data });
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
      const updateContentJson = (req.body as Record<string, unknown>).contentJson ?? null;
      const updateContentHtml = typeof (req.body as Record<string, unknown>).contentHtml === "string"
        ? (req.body as Record<string, unknown>).contentHtml as string
        : null;

      if (!isUuid(commentId)) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      const hasUpdateContent = commentText?.trim() || updateContentJson;
      if (!hasUpdateContent) {
        res.status(400).json({ error: "commentText or contentJson is required" });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const trimmedText = commentText?.trim() ?? "";
      const now = new Date().toISOString();

      // Fetch existing comment for mention diff
      const existing = mentionService
        ? (await db
            .selectFrom("master.comment as c")
            .select(["c.mentions", "c.commenter_id", "c.entity_type", "c.entity_id"])
            .where("c.id" as never, "=", commentId as never)
            .where("c.tenant_id" as never, "=", tenantId as never)
            .where("c.deleted_at" as never, "is", null)
            .executeTakeFirst() as Record<string, unknown> | undefined)
        : undefined;

      if (mentionService && !existing) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }

      const updateSet: Record<string, unknown> = {
        comment_text:   (trimmedText || "[rich comment]").slice(0, 50000),
        content_format: updateContentJson ? "rich_json" : "plain",
        updated_at:     now,
      };
      if (updateContentJson !== null) updateSet.content_json = JSON.stringify(updateContentJson);
      if (updateContentHtml !== null) updateSet.content_html = updateContentHtml;

      const row = await db
        .updateTable("master.comment" as never)
        .set(updateSet as never)
        .where("id" as never, "=", commentId as never)
        .where("tenant_id" as never, "=", (tenantId ?? "") as never)
        .where("deleted_at" as never, "is", null)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }

      // Process mention diff on edit
      if (mentionService && existing) {
        try {
          const sub = typeof claims.sub === "string" ? claims.sub : "";
          const authorId = sub
            ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
            : (existing.commenter_id as string);

          const prevRaw = existing.mentions as unknown;
          const previousMentions = Array.isArray(prevRaw)
            ? (prevRaw as Array<{ user_id: string; display_name: string }>).map((m) => ({
                userId: m.user_id,
                displayName: m.display_name,
              }))
            : [];

          const mentionResult = await mentionService.processMentions({
            commentId,
            contextType: DEFAULT_CONTEXT_TYPE,
            tenantId,
            authorId,
            commentText: trimmedText,
            entityType: existing.entity_type as string,
            entityId: existing.entity_id as string,
            previousMentions,
          });

          if (mentionResult.total.length > 0) {
            const mentionsJson = JSON.stringify(
              mentionResult.total.map((m: { userId: string; displayName: string }) => ({ user_id: m.userId, display_name: m.displayName })),
            );
            await db
              .updateTable("master.comment" as never)
              .set({ mentions: mentionsJson } as never)
              .where("id" as never, "=", commentId as never)
              .where("tenant_id" as never, "=", tenantId as never)
              .execute();
          } else if (previousMentions.length > 0) {
            // All mentions removed — clear the JSONB
            await db
              .updateTable("master.comment" as never)
              .set({ mentions: null } as never)
              .where("id" as never, "=", commentId as never)
              .where("tenant_id" as never, "=", tenantId as never)
              .execute();
          }
        } catch {
          // Non-fatal
        }
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

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const deletedBy = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
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

  // ── GET /api/collab/comments/:commentId/reactions ─────────────────────────
  // Returns reactions with emoji from the master.reaction_type lookup.

  const listReactionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const commentId = req.params["commentId"] as string;
      if (!isUuid(commentId)) {
        res.json({ ok: true, data: [] });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.json({ ok: true, data: [] });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      // Aggregate reaction counts
      type ReactionRow = { reaction_type: string; cnt: string; self_count: string };
      const rows = await db
        .selectFrom("master.comment_reaction as cr" as never)
        .select([
          "cr.reaction_type" as never,
          db.fn.countAll<string>().as("cnt") as never,
          db.fn.count<string>("cr.id" as never)
            .filterWhere("cr.principal_id" as never, "=" as never, principalId as never)
            .as("self_count") as never,
        ])
        .where("cr.tenant_id" as never, "=", tenantId as never)
        .where("cr.comment_id" as never, "=", commentId as never)
        .groupBy("cr.reaction_type" as never)
        .orderBy("cnt" as never, "desc")
        .execute() as ReactionRow[];

      // Fetch emoji metadata from lookup
      const codes = rows.map((r) => r.reaction_type);
      type LookupRow = { code: string; metadata: Record<string, unknown> };
      const lookupRows = codes.length > 0
        ? (await db
            .selectFrom("control.lookup_value as lv" as never)
            .select(["lv.code" as never, "lv.metadata" as never])
            .where("lv.domain_code" as never, "=", "master.reaction_type" as never)
            .where("lv.code" as never, "in" as never, codes as never)
            .where("lv.tenant_id" as never, "is", null)
            .execute() as LookupRow[])
        : [];

      const emojiMap = new Map(
        lookupRows.map((r) => [r.code, (r.metadata?.emoji as string | undefined) ?? r.code]),
      );

      const data = rows.map((r) => ({
        reactionType: r.reaction_type,
        emoji:        emojiMap.get(r.reaction_type) ?? r.reaction_type,
        count:        parseInt(r.cnt, 10),
        reacted:      parseInt(r.self_count, 10) > 0,
      }));

      res.json({ ok: true, data });
    } catch (err) {
      logger?.error("collab_reactions_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/comments/:commentId/reactions ────────────────────────
  // Toggle: if the caller has already reacted with this type → remove it.
  // Otherwise → add it. Returns { ok, reacted: bool }.

  const toggleReactionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const commentId = req.params["commentId"] as string;
      const { reactionType } = req.body as { reactionType?: string };

      if (!isUuid(commentId)) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      if (!reactionType || !REACTION_CODES.has(reactionType)) {
        res.status(400).json({ error: `reactionType must be one of: ${[...REACTION_CODES].join(", ")}` });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      // Fetch comment for pub/sub channel routing (entity_type / entity_id)
      const commentCtx = await db
        .selectFrom("master.comment as c")
        .select(["c.entity_type", "c.entity_id"])
        .where("c.id",        "=", commentId)
        .where("c.tenant_id", "=", tenantId)
        .executeTakeFirst() as { entity_type: string; entity_id: string } | undefined;

      // Check if reaction already exists
      const existing = await db
        .selectFrom("master.comment_reaction as cr" as never)
        .select("cr.id" as never)
        .where("cr.tenant_id" as never,    "=", tenantId as never)
        .where("cr.comment_id" as never,   "=", commentId as never)
        .where("cr.principal_id" as never, "=", principalId as never)
        .where("cr.reaction_type" as never,"=", reactionType as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (existing) {
        // Toggle off — delete
        await db
          .deleteFrom("master.comment_reaction" as never)
          .where("id" as never, "=", existing.id as never)
          .where("tenant_id" as never, "=", tenantId as never)
          .execute();
        if (commentCtx) {
          const at = new Date().toISOString();
          const evtData = { commentId, reactionCode: reactionType, reactorId: principalId, isActive: false };
          void logActivity(tenantId, commentCtx.entity_type, commentCtx.entity_id, "user.reaction_toggled", principalId, evtData);
          publishActivity(tenantId, commentCtx.entity_type, commentCtx.entity_id, "activity:reaction", evtData, at);
        }
        res.json({ ok: true, reacted: false });
      } else {
        // Toggle on — insert (ignore conflict in case of race)
        await db
          .insertInto("master.comment_reaction" as never)
          .values({
            tenant_id:     tenantId,
            context_type:  DEFAULT_CONTEXT_TYPE,
            comment_id:    commentId,
            principal_id:  principalId,
            reaction_type: reactionType,
            created_by:    principalId,
          } as never)
          .execute()
          .catch(() => { /* UNIQUE constraint — already exists */ });
        if (commentCtx) {
          const at = new Date().toISOString();
          const evtData = { commentId, reactionCode: reactionType, reactorId: principalId, isActive: true };
          void logActivity(tenantId, commentCtx.entity_type, commentCtx.entity_id, "user.reaction_toggled", principalId, evtData);
          publishActivity(tenantId, commentCtx.entity_type, commentCtx.entity_id, "activity:reaction", evtData, at);
        }
        res.json({ ok: true, reacted: true });
      }
    } catch (err) {
      logger?.error("collab_reaction_toggle_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/comments/:commentId/flag ─────────────────────────────

  const flagCommentHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const commentId = req.params["commentId"] as string;
      const { flagReason, note } = req.body as { flagReason?: string; note?: string };

      if (!isUuid(commentId)) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }
      if (!flagReason) {
        res.status(400).json({ error: "flagReason is required" });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const flaggedBy = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const row = await db
        .insertInto("event.comment_flag" as never)
        .values({
          tenant_id:    tenantId,
          context_type: DEFAULT_CONTEXT_TYPE,
          comment_id:   commentId,
          flagged_by:   flaggedBy,
          flag_reason:  flagReason,
          note:         note ?? null,
          status:       "pending",
          created_by:   flaggedBy,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ok: true, data: { id: (row as Record<string, unknown>).id } });
    } catch (err) {
      logger?.error("collab_flag_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/drafts ────────────────────────────────────────────────

  const getDraftHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityType      = req.query["entityType"]      as string | undefined;
      const entityId        = req.query["entityId"]        as string | undefined;
      const parentCommentId = req.query["parentCommentId"] as string | undefined;

      if (!entityType || !entityId) {
        res.json({ ok: true, draft: null });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.json({ ok: true, draft: null });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      let query = db
        .selectFrom("master.comment_draft as cd" as never)
        .select([
          "cd.id" as never, "cd.draft_text" as never,
          "cd.content_json" as never,
          "cd.updated_at" as never, "cd.created_at" as never,
        ])
        .where("cd.tenant_id" as never,   "=", tenantId as never)
        .where("cd.principal_id" as never, "=", principalId as never)
        .where("cd.entity_type" as never,  "=", entityType as never)
        .where("cd.entity_id" as never,    "=", entityId as never)

      if (parentCommentId && isUuid(parentCommentId)) {
        query = query.where("cd.parent_comment_id" as never, "=", parentCommentId as never);
      } else {
        query = query.where("cd.parent_comment_id" as never, "is", null);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (query as any).executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) {
        res.json({ ok: true, draft: null });
        return;
      }

      res.json({
        ok: true,
        draft: {
          id:          row.id,
          draftText:   row.draft_text,
          contentJson: (row.content_json as unknown) ?? null,
          updatedAt:   row.updated_at ?? row.created_at,
        },
      });
    } catch (err) {
      logger?.error("collab_draft_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/drafts ───────────────────────────────────────────────
  // Upsert: one draft per (tenant, principal, entity_type, entity_id, parent_comment_id).

  const saveDraftHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { entityType, entityId, draftText, parentCommentId } =
        req.body as Record<string, string | undefined>;
      const draftContentJson = (req.body as Record<string, unknown>).contentJson ?? null;

      if (!entityType || !entityId || draftText === undefined) {
        res.status(400).json({ error: "entityType, entityId, and draftText are required" });
        return;
      }
      if (draftText.length > 50000) {
        res.status(400).json({ error: "draftText exceeds 50000 characters" });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.status(400).json({ error: "Could not resolve tenant" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const now = new Date().toISOString();
      const insertValues: Record<string, unknown> = {
        tenant_id:    tenantId,
        context_type: DEFAULT_CONTEXT_TYPE,
        principal_id: principalId,
        entity_type:  entityType,
        entity_id:    entityId,
        draft_text:   draftText,
        created_by:   principalId,
      };
      if (parentCommentId && isUuid(parentCommentId)) {
        insertValues.parent_comment_id = parentCommentId;
      }

      const draftConflictUpdate: Record<string, unknown> = { draft_text: draftText, updated_at: now };
      if (draftContentJson !== null) draftConflictUpdate.content_json = JSON.stringify(draftContentJson);

      await db
        .insertInto("master.comment_draft" as never)
        .values({
          ...insertValues,
          ...(draftContentJson !== null ? { content_json: JSON.stringify(draftContentJson) } : {}),
        } as never)
        .onConflict((oc) =>
          oc
            .columns(["tenant_id", "principal_id", "entity_type", "entity_id", "parent_comment_id"] as never[])
            .doUpdateSet(draftConflictUpdate as never),
        )
        .execute();

      res.json({ ok: true });
    } catch (err) {
      logger?.error("collab_draft_save_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /api/collab/drafts ─────────────────────────────────────────────

  const deleteDraftHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityType      = req.query["entityType"]      as string | undefined;
      const entityId        = req.query["entityId"]        as string | undefined;
      const parentCommentId = req.query["parentCommentId"] as string | undefined;

      if (!entityType || !entityId) {
        res.status(400).json({ error: "entityType and entityId are required" });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.status(204).end();
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      let query = db
        .deleteFrom("master.comment_draft" as never)
        .where("tenant_id" as never,   "=", tenantId as never)
        .where("principal_id" as never, "=", principalId as never)
        .where("entity_type" as never,  "=", entityType as never)
        .where("entity_id" as never,    "=", entityId as never);

      if (parentCommentId && isUuid(parentCommentId)) {
        query = (query as typeof query).where("parent_comment_id" as never, "=", parentCommentId as never);
      } else {
        query = (query as typeof query).where("parent_comment_id" as never, "is", null);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (query as any).execute();

      res.status(204).end();
    } catch (err) {
      logger?.error("collab_draft_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/mentions ──────────────────────────────────────────────
  // Principal autocomplete for @-mention. Returns up to 10 matching principals.

  const listMentionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = ((req.query["q"] as string | undefined) ?? "").trim();
      if (!q || q.length < 1) {
        res.json({ ok: true, data: [] });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) {
        res.json({ ok: true, data: [] });
        return;
      }

      type PrincipalRow = { id: string; code: string; name: string };
      const pattern = `%${q}%`;
      const rows = await db
        .selectFrom("master.principal as p" as never)
        .select(["p.id" as never, "p.code" as never, "p.name" as never])
        .where("p.tenant_id" as never, "=", tenantId as never)
        .where("p.status" as never, "=", "active" as never)
        .where((eb: { or: (c: unknown[]) => unknown }) =>
          eb.or([
            (eb as unknown as { ilike: (col: unknown, val: unknown) => unknown })
              .ilike("p.code" as never, pattern as never),
            (eb as unknown as { ilike: (col: unknown, val: unknown) => unknown })
              .ilike("p.name" as never, pattern as never),
          ]) as never,
        )
        .orderBy("p.name" as never, "asc")
        .limit(10)
        .execute() as PrincipalRow[];

      res.json({
        ok: true,
        data: rows.map((r) => ({
          id:          r.id,
          username:    r.code,
          displayName: r.name,
        })),
      });
    } catch (err) {
      logger?.error("collab_mentions_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/comments/:commentId/attachments ─────────────────────
  // Returns attachments linked to a specific comment (entity_document_link
  // where entity_type='master.comment' and entity_id=commentId).

  const listCommentAttachmentsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const commentId = req.params["commentId"] as string;
      if (!isUuid(commentId)) { res.json({ ok: true, data: [] }); return; }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) { res.json({ ok: true, data: [] }); return; }

      const rows = await db
        .selectFrom("master.entity_document_link as edl")
        .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
        .select([
          "a.id as attachment_id",
          "a.file_name",
          "a.content_type",
          "a.size_bytes",
        ])
        .where("edl.tenant_id"   as never, "=", tenantId              as never)
        .where("edl.entity_type" as never, "=", "master.comment"      as never)
        .where("edl.entity_id"   as never, "=", commentId             as never)
        .where("a.status"        as never, "=", "active"              as never)
        .orderBy("edl.display_order" as never, "asc")
        .execute() as Record<string, unknown>[];

      res.json({
        ok: true,
        data: rows.map((r) => ({
          attachmentId: r["attachment_id"] as string,
          fileName:     r["file_name"]     as string,
          contentType:  r["content_type"]  as string,
          sizeBytes:    Number(r["size_bytes"] ?? 0),
          downloadUrl:  `/api/collab/attachments/${r["attachment_id"] as string}/download`,
        })),
      });
    } catch (err) {
      logger?.error("collab_comment_attachments_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/collab/bookmarks — toggle bookmark for current principal ────────

  const toggleBookmarkHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const body       = req.body as { entity_code?: string; record_id?: string } | undefined;
      const entityCode = (body?.entity_code ?? "").trim();
      const recordId   = (body?.record_id   ?? "").trim();
      if (!entityCode || !recordId) {
        res.status(400).json({ error: "entity_code and record_id are required" });
        return;
      }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) return;

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const existing = await (db
        .selectFrom("master.record_bookmark as rb" as never)
        .select("rb.id" as never)
        .where("rb.tenant_id"    as never, "=", tenantId    as never)
        .where("rb.principal_id" as never, "=", principalId as never)
        .where("rb.entity_code"  as never, "=", entityCode  as never)
        .where("rb.record_id"    as never, "=", recordId    as never)
        .executeTakeFirst() as Promise<{ id: string } | undefined>);

      if (existing) {
        await (db
          .deleteFrom("master.record_bookmark" as never)
          .where("id" as never, "=", existing.id as never)
          .execute() as Promise<unknown>);
        res.json({ bookmarked: false });
      } else {
        await (db
          .insertInto("master.record_bookmark" as never)
          .values({
            tenant_id:    tenantId,
            principal_id: principalId,
            entity_code:  entityCode,
            record_id:    recordId,
            created_at:   new Date().toISOString(),
          } as never)
          .execute() as Promise<unknown>);
        res.json({ bookmarked: true });
      }
    } catch (err) {
      logger?.error("collab_bookmark_toggle_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/bookmarks/batch — batch membership check ─────────────────

  const batchBookmarksHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = ((req.query["entity_code"] as string) ?? "").trim();
      const idsRaw     = ((req.query["ids"]        as string) ?? "").trim();
      if (!entityCode || !idsRaw) { res.json({ bookmarked_ids: [] }); return; }

      const allBookmarkIds = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      if (allBookmarkIds.length > 100) {
        res.status(400).json({ error: "MAX_100_IDS", max: 100 });
        return;
      }
      const recordIds = allBookmarkIds.filter(isUuid);
      if (recordIds.length === 0) { res.json({ bookmarked_ids: [] }); return; }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) { res.json({ bookmarked_ids: [] }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const rows = await (db
        .selectFrom("master.record_bookmark as rb" as never)
        .select("rb.record_id" as never)
        .where("rb.tenant_id"    as never, "=",  tenantId    as never)
        .where("rb.principal_id" as never, "=",  principalId as never)
        .where("rb.entity_code"  as never, "=",  entityCode  as never)
        .where("rb.record_id"    as never, "in", recordIds   as never)
        .execute() as Promise<{ record_id: string }[]>);

      res.json({ bookmarked_ids: rows.map((r) => r.record_id) });
    } catch (err) {
      logger?.error("collab_bookmark_batch_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /api/collab/comments/batch-count — per-record comment counts ──────────

  const batchCommentCountHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = ((req.query["entity_type"] as string) ?? "").trim();
      const idsRaw     = ((req.query["ids"]        as string) ?? "").trim();
      if (!entityCode || !idsRaw) { res.json({ counts: {} }); return; }

      const allIds    = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      if (allIds.length > 100) {
        res.status(400).json({ error: "MAX_100_IDS", max: 100 });
        return;
      }
      const recordIds = allIds.filter(isUuid);
      if (recordIds.length === 0) { res.json({ counts: {} }); return; }

      const tenantId = await resolveTenant(req, res, db);
      if (!tenantId) { res.json({ counts: {} }); return; }

      type CountRow = { record_id: string; total: unknown };
      const rows = await (db
        .selectFrom("master.comment as c" as never)
        .select([
          "c.entity_id as record_id" as never,
          sql`count(*)`.as("total"),
        ])
        .where("c.tenant_id"   as never, "=",  tenantId   as never)
        .where("c.entity_type" as never, "=",  entityCode  as never)
        .where("c.entity_id"   as never, "in", recordIds   as never)
        .where("c.deleted_at"  as never, "is", null        as never)
        .groupBy("c.entity_id" as never)
        .execute() as Promise<CountRow[]>);

      const counts: Record<string, { total: number; hasOpen: boolean }> = {};
      for (const row of rows) {
        const total = Number(row.total);
        counts[row.record_id] = { total, hasOpen: total > 0 };
      }

      res.json({ counts });
    } catch (err) {
      logger?.error("collab_comment_batch_count_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register routes ───────────────────────────────────────────────────────
  // Static paths must come before the :commentId param routes.
  router.post("/collab/bookmarks",           toggleBookmarkHandler);
  router.get("/collab/bookmarks/batch",      batchBookmarksHandler);
  router.get("/collab/comments/batch-count", batchCommentCountHandler);
  router.get("/collab/comments/unread-count",           unreadCountHandler);
  router.post("/collab/comments/mark-all-read",         markAllReadHandler);
  router.get("/collab/comments",                         listCommentsHandler);
  router.post("/collab/comments",                        createCommentHandler);
  router.get("/collab/comments/:commentId/attachments",  listCommentAttachmentsHandler);
  router.get("/collab/comments/:commentId/replies",      listRepliesHandler);
  router.post("/collab/comments/:commentId/replies",     createReplyHandler);
  router.get("/collab/comments/:commentId/reactions",    listReactionsHandler);
  router.post("/collab/comments/:commentId/reactions",   toggleReactionHandler);
  router.post("/collab/comments/:commentId/flag",        flagCommentHandler);
  router.patch("/collab/comments/:commentId",            updateCommentHandler);
  router.delete("/collab/comments/:commentId",           deleteCommentHandler);
  router.get("/collab/drafts",                           getDraftHandler);
  router.post("/collab/drafts",                          saveDraftHandler);
  router.delete("/collab/drafts",                        deleteDraftHandler);
  router.get("/collab/mentions",                         listMentionsHandler);

  // ══════════════════════════════════════════════════════════════════════════
  // SSE ACTIVITY STREAM  (44-06 / 44-07)
  // GET /collab/activity/stream?entityType=<type>&entityId=<uuid>
  //
  // Streams live activity events for a specific entity to the client.
  //
  // Events emitted:
  //   activity:comment  — new comment or reply posted
  //   activity:reaction — reaction toggled on a comment
  //   activity:count    — total comment count (on connect, gap-fill, and change)
  //   :heartbeat        — SSE keep-alive comment every 15 s
  //
  // Feed modes (X-Feed-Mode response header):
  //   pubsub  — Redis SUBSCRIBE delivers events in < 100 ms
  //   polling — 12-second DB poll when Redis is unavailable
  //
  // Reconnection gap-fill (44-07):
  //   Send Last-Event-ID: <ISO timestamp> to replay missed events from
  //   log.activity_log before the live subscription resumes.
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/collab/activity/stream", async (req, res) => {
    // ── Auth ──────────────────────────────────────────────────────────────────
    let claims: Record<string, unknown> | null = null;
    try {
      claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    } catch {
      res.status(401).end(); return;
    }
    if (!claims) return;

    const xOrg   = (req.headers["x-org"]   as string) ?? "";
    const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) { res.status(400).end(); return; }

    const entityType = (req.query["entityType"] as string | undefined)?.trim();
    const entityId   = (req.query["entityId"]   as string | undefined)?.trim();

    if (!entityType || !entityId || !isUuid(entityId)) {
      res.status(400).json({ error: "entityType and entityId (uuid) are required" });
      return;
    }

    // ── Reconnect cursor (44-07) ──────────────────────────────────────────────
    // Last-Event-ID is an ISO timestamp set on every emitted event id: field.
    const rawLastEventId = req.headers["last-event-id"] as string | undefined;
    let lastEventTs: string | undefined;
    if (rawLastEventId) {
      const d = new Date(rawLastEventId);
      if (!isNaN(d.getTime())) lastEventTs = d.toISOString();
    }

    // ── Determine feed mode ───────────────────────────────────────────────────
    // Race subscribe() against a 2-second timeout so a down Redis degrades
    // gracefully instead of blocking the response.
    const channel = `activity:${tenantId}:${entityType}:${entityId}`;
    let subscriber: RedisClient | undefined;
    let feedMode: "pubsub" | "polling" = "polling";

    if (redis) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        subscriber = redis.duplicate();
        await Promise.race([
          subscriber.subscribe(channel),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("pubsub_timeout")), 2_000);
          }),
        ]);
        clearTimeout(timeoutId);
        feedMode = "pubsub";
      } catch (err) {
        clearTimeout(timeoutId);
        logger?.error("collab_pubsub_subscribe_error", { err: String(err) });
        try { subscriber?.disconnect(); } catch { /* ignore */ }
        subscriber = undefined;
      }
    }

    // ── SSE headers ───────────────────────────────────────────────────────────
    res.setHeader("Content-Type",      "text/event-stream");
    res.setHeader("Cache-Control",     "no-cache, no-transform");
    res.setHeader("Connection",        "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Feed-Mode",       feedMode);
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown, id?: string): void => {
      let chunk = id ? `id: ${id}\n` : "";
      chunk += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(chunk);
    };
    const sendComment = (text: string): void => { res.write(`:${text}\n\n`); };

    // ── Comment count helper ──────────────────────────────────────────────────
    const getCount = async (): Promise<number> => {
      try {
        const row = await db
          .selectFrom("master.comment as c")
          .select(db.fn.count("c.id").as("cnt"))
          .where("c.tenant_id",   "=", tenantId)
          .where("c.entity_type", "=", entityType)
          .where("c.entity_id",   "=", entityId)
          .where("c.deleted_at" as never, "is", null)
          .executeTakeFirst() as { cnt: number | string } | undefined;
        return row ? Number(row.cnt) : 0;
      } catch { return 0; }
    };

    // ── Initial count ─────────────────────────────────────────────────────────
    sendEvent("activity:count", { count: await getCount() });

    // ── Gap-fill burst (44-07) ────────────────────────────────────────────────
    // Query log.activity_log for events missed since the last-seen timestamp.
    // The detail column stores the original SSE event payload verbatim.
    if (lastEventTs) {
      try {
        const missed = await db
          .selectFrom("log.activity_log as al" as never)
          .select([
            "al.activity_type" as never,
            "al.detail"        as never,
            "al.created_at"    as never,
          ])
          .where("al.tenant_id"   as never, "=",        tenantId   as never)
          .where("al.entity_type" as never, "=",        entityType as never)
          .where("al.entity_id"   as never, "=",        entityId   as never)
          .where("al.domain"      as never, "=",        "user"     as never)
          .where("al.created_at"  as never, ">" as never, lastEventTs as never)
          .orderBy("al.created_at" as never, "asc")
          .limit(100)
          .execute() as Array<{
            activity_type: string;
            detail: Record<string, unknown> | null;
            created_at: Date | string;
          }>;

        for (const row of missed) {
          const at = row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at);
          const evtType =
            row.activity_type === "user.comment_posted"   ? "activity:comment"  :
            row.activity_type === "user.reaction_toggled" ? "activity:reaction" :
            null;
          if (evtType) sendEvent(evtType, row.detail ?? {}, at);
        }

        if (missed.length > 0) {
          sendEvent("activity:count", { count: await getCount() });
        }
      } catch (err) {
        logger?.error("collab_activity_gapfill_error", { err: String(err) });
      }
    }

    // ── Poll function (used in polling mode and as pub/sub fallback) ──────────
    let lastSeenAt = new Date().toISOString();
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const poll = async (): Promise<void> => {
      try {
        const newComments = await db
          .selectFrom("master.comment as c")
          .select([
            "c.id", "c.commenter_id", "c.comment_text",
            "c.parent_comment_id", "c.thread_depth",
            "c.created_at", "c.visibility",
          ])
          .where("c.tenant_id",   "=", tenantId)
          .where("c.entity_type", "=", entityType)
          .where("c.entity_id",   "=", entityId)
          .where("c.deleted_at" as never,  "is",  null)
          .where("c.created_at" as never,  ">",   lastSeenAt as never)
          .orderBy("c.created_at", "asc")
          .limit(20)
          .execute() as Record<string, unknown>[];

        for (const row of newComments) {
          const at = row["created_at"] instanceof Date
            ? (row["created_at"] as Date).toISOString()
            : String(row["created_at"]);
          sendEvent("activity:comment", {
            id:              row["id"],
            commenterId:     row["commenter_id"],
            commentText:     row["comment_text"],
            parentCommentId: row["parent_comment_id"] ?? null,
            threadDepth:     row["thread_depth"] ?? 0,
            createdAt:       at,
          }, at);
        }

        const newReactions = await db
          .selectFrom("master.comment_reaction as cr")
          .innerJoin("master.comment as c", "c.id" as never, "cr.comment_id" as never)
          .select([
            "cr.id" as never, "cr.comment_id" as never,
            "cr.reaction_code" as never, "cr.reactor_id" as never,
            "cr.is_active" as never, "cr.created_at" as never,
          ])
          .where("c.tenant_id"   as never, "=", tenantId   as never)
          .where("c.entity_type" as never, "=", entityType as never)
          .where("c.entity_id"   as never, "=", entityId   as never)
          .where("cr.created_at" as never, ">", lastSeenAt as never)
          .orderBy("cr.created_at" as never, "asc")
          .limit(50)
          .execute() as Record<string, unknown>[];

        for (const row of newReactions) {
          const at = row["created_at"] instanceof Date
            ? (row["created_at"] as Date).toISOString()
            : String(row["created_at"]);
          sendEvent("activity:reaction", {
            commentId:    row["comment_id"],
            reactionCode: row["reaction_code"],
            reactorId:    row["reactor_id"],
            isActive:     Boolean(row["is_active"]),
          }, at);
        }

        if (newComments.length > 0 || newReactions.length > 0) {
          sendEvent("activity:count", { count: await getCount() });
          const allRows = [...newComments, ...newReactions];
          const latest = allRows.reduce((a, b) =>
            String(a["created_at"]) > String(b["created_at"]) ? a : b
          );
          lastSeenAt = latest["created_at"] instanceof Date
            ? (latest["created_at"] as Date).toISOString()
            : String(latest["created_at"]);
        }
      } catch (err) {
        logger?.error("collab_activity_stream_poll_error", { err: String(err) });
      }
    };

    // ── Live events ───────────────────────────────────────────────────────────
    if (feedMode === "pubsub" && subscriber) {
      subscriber.on("message", (_ch: string, message: string) => {
        try {
          const { eventType, createdAt, data } = JSON.parse(message) as {
            eventType: string; createdAt: string; data: unknown;
          };
          sendEvent(eventType, data, createdAt);
          if (eventType === "activity:comment" || eventType === "activity:reaction") {
            void getCount().then(count => sendEvent("activity:count", { count }));
          }
        } catch { /* malformed publish payload — discard */ }
      });

      subscriber.on("error", (err: unknown) => {
        logger?.error("collab_pubsub_subscriber_error", { err: String(err) });
        // ioredis reconnects automatically; start polling as graceful fallback.
        if (!pollTimer) {
          pollTimer = setInterval(() => void poll(), 12_000);
        }
      });
    } else {
      // Polling mode
      pollTimer = setInterval(() => void poll(), 12_000);
    }

    const heartbeatTimer = setInterval(() => sendComment("heartbeat"), 15_000);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    const cleanup = () => {
      clearInterval(heartbeatTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (subscriber) {
        try { subscriber.disconnect(); } catch { /* ignore */ }
      }
    };

    req.on("close",  cleanup);
    req.on("end",    cleanup);
    res.on("finish", cleanup);
    res.on("close",  cleanup);
  });

  return router;
}
