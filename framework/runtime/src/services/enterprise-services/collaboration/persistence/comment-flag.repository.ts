/**
 * Comment Flag Repository
 *
 * Manages comment flags and moderation status.
 */

import type {
  CommentFlag,
  CommentModerationStatus,
  CreateFlagRequest,
  ReviewFlagRequest,
} from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Database row types (snake_case)
 */
interface CommentFlagRow {
  id: string;
  tenant_id: string;
  comment_type: string;
  comment_id: string;
  flagger_user_id: string;
  flag_reason: string;
  flag_details: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  resolution: string | null;
  created_at: Date;
}

interface CommentModerationStatusRow {
  id: string;
  tenant_id: string;
  comment_type: string;
  comment_id: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: Date | null;
  hidden_by: string | null;
  flag_count: number;
  last_flagged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Comment Flag Repository
 */
export class CommentFlagRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Create a new flag
   */
  async createFlag(req: CreateFlagRequest): Promise<CommentFlag> {
    const id = crypto.randomUUID();
    const now = new Date();

    // Check if user already flagged this comment
    const existing = await this.db
      .selectFrom("collab.comment_flag")
      .select("id")
      .where("tenant_id", "=", req.tenantId)
      .where("comment_type", "=", req.commentType)
      .where("comment_id", "=", req.commentId)
      .where("flagger_user_id", "=", req.flaggerUserId)
      .executeTakeFirst();

    if (existing) {
      throw new Error("You have already flagged this comment");
    }

    // Create flag
    const row = await this.db
      .insertInto("collab.comment_flag")
      .values({
        id,
        tenant_id: req.tenantId,
        comment_type: req.commentType,
        comment_id: req.commentId,
        flagger_user_id: req.flaggerUserId,
        flag_reason: req.flagReason,
        flag_details: req.flagDetails ?? null,
        status: "pending",
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Update moderation status (increment flag count)
    await this.incrementFlagCount(req.tenantId, req.commentType, req.commentId);

    return this.mapFlagRow(row as CommentFlagRow);
  }

  /**
   * Get flags for a comment
   */
  async getFlagsForComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ): Promise<CommentFlag[]> {
    const rows = await this.db
      .selectFrom("collab.comment_flag")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => this.mapFlagRow(row as CommentFlagRow));
  }

  /**
   * Get pending flags (moderation queue)
   */
  async getPendingFlags(
    tenantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<CommentFlag[]> {
    const rows = await this.db
      .selectFrom("collab.comment_flag")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "pending")
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapFlagRow(row as CommentFlagRow));
  }

  /**
   * Count pending flags
   */
  async countPendingFlags(tenantId: string): Promise<number> {
    const result = await this.db
      .selectFrom("collab.comment_flag")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "pending")
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Review a flag
   */
  async reviewFlag(
    tenantId: string,
    flagId: string,
    req: ReviewFlagRequest,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .updateTable("collab.comment_flag")
      .set({
        status: req.action === "dismiss" ? "dismissed" : "actioned",
        reviewed_by: req.reviewedBy,
        reviewed_at: now,
        resolution: req.resolution,
      })
      .where("id", "=", flagId)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * Get moderation status for a comment
   */
  async getModerationStatus(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ): Promise<CommentModerationStatus | undefined> {
    const row = await this.db
      .selectFrom("collab.comment_moderation")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .executeTakeFirst();

    if (!row) return undefined;

    return this.mapModerationStatusRow(row as CommentModerationStatusRow);
  }

  /**
   * Hide a comment
   */
  async hideComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    hiddenBy: string,
    reason: string,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("collab.comment_moderation")
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        comment_type: commentType,
        comment_id: commentId,
        is_hidden: true,
        hidden_reason: reason,
        hidden_at: now,
        hidden_by: hiddenBy,
        flag_count: 0,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "comment_type", "comment_id"]).doUpdateSet({
          is_hidden: true,
          hidden_reason: reason,
          hidden_at: now,
          hidden_by: hiddenBy,
          updated_at: now,
        }),
      )
      .execute();
  }

  /**
   * Unhide a comment
   */
  async unhideComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ): Promise<void> {
    await this.db
      .updateTable("collab.comment_moderation")
      .set({
        is_hidden: false,
        hidden_reason: null,
        hidden_at: null,
        hidden_by: null,
        updated_at: new Date(),
      })
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .execute();
  }

  /**
   * Increment flag count (called when new flag is created)
   */
  private async incrementFlagCount(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("collab.comment_moderation")
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        comment_type: commentType,
        comment_id: commentId,
        is_hidden: false,
        flag_count: 1,
        last_flagged_at: now,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "comment_type", "comment_id"]).doUpdateSet({
          flag_count: (eb: any) =>
            eb.raw("collab.comment_moderation.flag_count + 1"),
          last_flagged_at: now,
          updated_at: now,
        } as any),
      )
      .execute();
  }

  /**
   * Map database row to domain model
   */
  private mapFlagRow(row: CommentFlagRow): CommentFlag {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      commentType: row.comment_type as "entity_comment" | "approval_comment",
      commentId: row.comment_id,
      flaggerUserId: row.flagger_user_id,
      flagReason: row.flag_reason as any,
      flagDetails: row.flag_details ?? undefined,
      status: row.status as any,
      reviewedBy: row.reviewed_by ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      resolution: row.resolution ?? undefined,
      createdAt: row.created_at,
    };
  }

  private mapModerationStatusRow(
    row: CommentModerationStatusRow,
  ): CommentModerationStatus {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      commentType: row.comment_type as "entity_comment" | "approval_comment",
      commentId: row.comment_id,
      isHidden: row.is_hidden,
      hiddenReason: row.hidden_reason ?? undefined,
      hiddenAt: row.hidden_at ?? undefined,
      hiddenBy: row.hidden_by ?? undefined,
      flagCount: row.flag_count,
      lastFlaggedAt: row.last_flagged_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
