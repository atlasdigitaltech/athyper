/**
 * MentionService — Phase 6.4
 *
 * Advanced Collaboration: @mention parsing, persistence, and notification dispatch.
 *
 * Design:
 *   - Parses @mention syntax from comment text:
 *       @[Display Name](userId)  — structured mention (preferred)
 *       @username                — plain mention (resolved from principal lookup)
 *   - Persists to document.comment_mention (one row per mentioned principal)
 *   - Dispatches mention notifications via NotificationOrchestrator (Phase 5.2)
 *
 * Integration:
 *   - Called from comment create/update routes AFTER the comment row is persisted.
 *   - The document.comment.mentions JSONB column stores the parsed mention objects
 *     ({user_id, display_name}) for denormalized display — written by the route,
 *     not by this service.
 *   - document.comment_mention rows are written by this service (or the DB trigger
 *     trg_validate_comment_mentions). The service is the authoritative path for
 *     notification dispatch; the DB trigger is the fallback for data integrity.
 *
 * Dedup:
 *   - Multiple mentions of the same principal in one comment → one notification.
 *   - Re-editing a comment to add/remove mentions → incremental diff:
 *       new mentions  → insert + notify
 *       removed mentions → delete (no retraction notification in v1)
 *
 * Depends on: Phase 5.2 NotificationOrchestrator (must be live before Phase 6.4).
 */

import type { Kysely } from "kysely";

interface MentionNotificationDispatcher {
  dispatch(input: {
    tenantId: string;
    eventCode: string;
    recipientId?: string;
    templateKey: string;
    subject?: string;
    payload: Record<string, unknown>;
    channels?: string[];
    dedupKey?: string;
    dedupWindowMs?: number;
    sourcePlane?: "neon" | "mesh" | "admin";
  }): Promise<unknown>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MentionObject {
  userId:      string;
  displayName: string;
}

export interface MentionParseResult {
  mentions:   MentionObject[];
  /** Raw mention strings that could not be resolved to a principal UUID */
  unresolved: string[];
}

export interface ProcessMentionsInput {
  commentId:   string;
  contextType: string;   // mirror of document.comment.context_type
  tenantId:    string;
  authorId:    string;
  commentText: string;
  entityType:  string;
  entityId:    string;
  /** Previously resolved mentions (for diff on edit — null on create) */
  previousMentions?: MentionObject[];
}

export interface ProcessMentionsResult {
  added:   MentionObject[];
  removed: MentionObject[];
  total:   MentionObject[];
}

// ── MentionParser ─────────────────────────────────────────────────────────────

/**
 * Parses @mention tokens from comment text.
 *
 * Supported formats:
 *   @[Display Name](550e8400-e29b-41d4-a716-446655440000)  → structured UUID mention
 *   @username                                               → plain mention (requires DB lookup)
 *
 * The structured format is produced by rich-text editors (Tiptap/Slate mention extension).
 * The plain format is accepted for API consumers posting raw text.
 */
export function parseMentionTokens(text: string): {
  structured: Array<{ displayName: string; userId: string }>;
  plain: string[];
} {
  const structured: Array<{ displayName: string; userId: string }> = [];
  const plain: string[] = [];

  // Structured: @[Display Name](uuid)
  const structuredRe = /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
  let match: RegExpExecArray | null;
  while ((match = structuredRe.exec(text)) !== null) {
    structured.push({ displayName: match[1]!, userId: match[2]! });
  }

  // Plain: @word (not followed by [ or overlap with structured)
  // Strip structured mentions first to avoid false positives
  const stripped = text.replace(structuredRe, "");
  const plainRe = /@([a-zA-Z][a-zA-Z0-9_.-]{1,63})/g;
  while ((match = plainRe.exec(stripped)) !== null) {
    plain.push(match[1]!);
  }

  return { structured, plain };
}

// ── MentionService ────────────────────────────────────────────────────────────

export class MentionService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db:           Kysely<any>;
  private readonly orchestrator: MentionNotificationDispatcher;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db:           Kysely<any>,
    orchestrator: MentionNotificationDispatcher,
  ) {
    this.db           = db;
    this.orchestrator = orchestrator;
  }

  /**
   * Parse @mentions from comment text, resolving plain mentions to principal UUIDs.
   * Plain mentions are looked up by principal.code or login_email in the tenant.
   */
  async parseMentions(
    text:     string,
    tenantId: string,
  ): Promise<MentionParseResult> {
    const { structured, plain } = parseMentionTokens(text);
    const mentions: MentionObject[] = [];
    const unresolved: string[] = [];

    // Structured mentions are already resolved
    for (const s of structured) {
      mentions.push({ userId: s.userId.toLowerCase(), displayName: s.displayName });
    }

    // Resolve plain mentions via principal lookup — try by code first, then by login_email
    if (plain.length > 0) {
      const byCode = await this.db
        .selectFrom("master.principal as p" as never)
        .select(["p.id", "p.name", "p.code"] as never[])
        .where("p.tenant_id" as never, "=", tenantId as never)
        .where("p.status" as never, "=", "active" as never)
        .where("p.code" as never, "in" as never, plain as never)
        .execute() as Array<{ id: string; name: string; code: string }>;

      const resolvedCodes = new Set(byCode.map((r) => r.code));
      const remaining = plain.filter((u) => !resolvedCodes.has(u));

      // Try remaining tokens as login_email
      const byEmail = remaining.length > 0
        ? await this.db
            .selectFrom("master.principal as p" as never)
            .select(["p.id", "p.name", "p.login_email as code"] as never[])
            .where("p.tenant_id" as never, "=", tenantId as never)
            .where("p.status" as never, "=", "active" as never)
            .where("p.login_email" as never, "in" as never, remaining as never)
            .execute() as Array<{ id: string; name: string; code: string }>
        : [];

      const allResolved = [...byCode, ...byEmail];
      const resolvedKeys = new Set(allResolved.map((r) => r.code));

      for (const row of allResolved) {
        mentions.push({ userId: row.id, displayName: row.name });
      }
      for (const username of plain) {
        if (!resolvedKeys.has(username)) {
          unresolved.push(username);
        }
      }
    }

    // Deduplicate by userId
    const seen = new Set<string>();
    const deduped = mentions.filter((m) => {
      if (seen.has(m.userId)) return false;
      seen.add(m.userId);
      return true;
    });

    return { mentions: deduped, unresolved };
  }

  /**
   * Process mentions for a comment (create or update).
   *
   * On create (previousMentions=undefined): inserts all mentions + notifies all.
   * On update (previousMentions provided): diffs — inserts new, removes stale, notifies only new.
   *
   * Returns the diff for notification and caller telemetry.
   */
  async processMentions(input: ProcessMentionsInput): Promise<ProcessMentionsResult> {
    const { mentions, unresolved } = await this.parseMentions(
      input.commentText,
      input.tenantId,
    );

    if (unresolved.length > 0) {
      // Non-fatal — unresolved mentions are silently dropped.
      // Callers that want to surface this can check the returned result.
    }

    const prev = input.previousMentions ?? [];
    const prevIds = new Set(prev.map((m) => m.userId));
    const currIds = new Set(mentions.map((m) => m.userId));

    // Diff
    const added   = mentions.filter((m) => !prevIds.has(m.userId));
    const removed = prev.filter((m) => !currIds.has(m.userId));

    // Persist new mention rows
    for (const mention of added) {
      await this.db
        .insertInto("document.comment_mention" as never)
        .values({
          tenant_id:    input.tenantId,
          comment_id:   input.commentId,
          mentioned_id: mention.userId,
          created_by:   input.authorId,
        } as never)
        .execute()
        .catch(() => { /* UNIQUE constraint violation = already exists, safe to ignore */ });
    }

    // Remove stale mention rows
    for (const mention of removed) {
      await this.db
        .deleteFrom("document.comment_mention" as never)
        .where("tenant_id" as never, "=", input.tenantId as never)
        .where("comment_id" as never, "=", input.commentId as never)
        .where("mentioned_id" as never, "=", mention.userId as never)
        .execute()
        .catch(() => { /* best-effort */ });
    }

    // Dispatch mention notifications for newly added mentions
    for (const mention of added) {
      // Skip self-mention
      if (mention.userId === input.authorId) continue;

      await this.orchestrator.dispatch({
        tenantId:    input.tenantId,
        eventCode:   "comment.mention",
        recipientId: mention.userId,
        templateKey: "comment_mention",
        subject:     "You were mentioned in a comment",
        sourcePlane: "neon",
        payload:     {
          commentId:   input.commentId,
          authorId:    input.authorId,
          entityType:  input.entityType,
          entityId:    input.entityId,
          contextType: input.contextType,
          excerpt:     buildExcerpt(input.commentText, 200),
        },
        dedupKey:     `mention:${input.commentId}:${mention.userId}`,
        dedupWindowMs: 5 * 60_000,
      }).catch(() => {
        // Notification dispatch failure is non-fatal — mention record already written.
      });
    }

    return { added, removed, total: mentions };
  }

  /**
   * Get all principals mentioned in a comment.
   * Uses document.comment_mention as the authoritative source (not the JSONB blob).
   */
  async getMentionsForComment(
    commentId:   string,
    tenantId:    string,
    contextType: string,
  ): Promise<MentionObject[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.db as any)
      .selectFrom("document.comment_mention as cm")
      .innerJoin("document.comment as c", (join: any) =>
        join
          .onRef("c.tenant_id", "=", "cm.tenant_id")
          .onRef("c.id", "=", "cm.comment_id"))
      .innerJoin("master.principal as p", (join: any) =>
        join
          .onRef("p.tenant_id", "=", "cm.tenant_id")
          .onRef("p.id", "=", "cm.mentioned_id"))
      .select(["cm.mentioned_id as user_id", "p.name as display_name"])
      .where("cm.tenant_id", "=", tenantId)
      .where("cm.comment_id", "=", commentId)
      .where("c.context_type", "=", contextType)
      .execute() as Array<{ user_id: string; display_name: string }>;

    return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name }));
  }

  /**
   * Get comments where a principal was mentioned (activity feed / notification history).
   * Returns the most recent N mentions for the principal.
   */
  async getMentionsForPrincipal(
    principalId: string,
    tenantId:    string,
    limit = 20,
    offset = 0,
  ): Promise<Array<{
    mentionId:   string;
    commentId:   string;
    contextType: string;
    entityType:  string;
    entityId:    string;
    authorId:    string;
    excerpt:     string;
    createdAt:   string;
  }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.db as any)
      .selectFrom("document.comment_mention as cm")
      .innerJoin("document.comment as c", (join: any) =>
        join
          .onRef("c.tenant_id", "=", "cm.tenant_id")
          .onRef("c.id", "=", "cm.comment_id"))
      .select([
        "cm.id as mention_id",
        "cm.comment_id",
        "c.context_type",
        "c.entity_type",
        "c.entity_id",
        "c.commenter_id as author_id",
        "c.comment_text",
        "cm.created_at",
      ])
      .where("cm.tenant_id", "=", tenantId)
      .where("cm.mentioned_id", "=", principalId)
      .where("c.deleted_at", "is", null)
      .orderBy("cm.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute() as Array<{
        mention_id: string; comment_id: string; context_type: string;
        entity_type: string; entity_id: string; author_id: string;
        comment_text: string; created_at: string;
      }>;

    return rows.map((r) => ({
      mentionId:   r.mention_id,
      commentId:   r.comment_id,
      contextType: r.context_type,
      entityType:  r.entity_type,
      entityId:    r.entity_id,
      authorId:    r.author_id,
      excerpt:     buildExcerpt(r.comment_text, 200),
      createdAt:   r.created_at,
    }));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExcerpt(text: string, maxLength: number): string {
  const stripped = text.replace(/@\[[^\]]+\]\([^)]+\)/g, (m) => {
    const nameMatch = m.match(/@\[([^\]]+)\]/);
    return nameMatch ? `@${nameMatch[1]}` : m;
  });
  return stripped.length <= maxLength
    ? stripped
    : stripped.substring(0, maxLength - 1) + "…";
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createMentionService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:           Kysely<any>,
  orchestrator: MentionNotificationDispatcher,
): MentionService {
  return new MentionService(db, orchestrator);
}
