/**
 * Reaction Repository
 *
 * Manages emoji reactions on comments.
 */

import type { CommentReaction, CreateReactionRequest, ReactionSummary, ReactionType } from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Database row type (snake_case)
 */
interface CommentReactionRow {
  id: string;
  tenant_id: string;
  comment_type: string;
  comment_id: string;
  user_id: string;
  reaction_type: string;
  created_at: Date;
}

/**
 * Reaction Repository
 */
export class ReactionRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Toggle a reaction (add if not exists, remove if exists)
   */
  async toggle(req: CreateReactionRequest): Promise<{ action: "added" | "removed" }> {
    // Check if reaction exists
    const existing = await this.db
      .selectFrom("collab.comment_reaction")
      .select("id")
      .where("tenant_id", "=", req.tenantId)
      .where("comment_type", "=", req.commentType)
      .where("comment_id", "=", req.commentId)
      .where("user_id", "=", req.userId)
      .where("reaction_type", "=", req.reactionType)
      .executeTakeFirst();

    if (existing) {
      // Remove reaction
      await this.db
        .deleteFrom("collab.comment_reaction")
        .where("id", "=", existing.id)
        .execute();

      return { action: "removed" };
    } else {
      // Add reaction
      const id = crypto.randomUUID();
      await this.db
        .insertInto("collab.comment_reaction")
        .values({
          id,
          tenant_id: req.tenantId,
          comment_type: req.commentType,
          comment_id: req.commentId,
          user_id: req.userId,
          reaction_type: req.reactionType,
          created_at: new Date(),
        })
        .execute();

      return { action: "added" };
    }
  }

  /**
   * Get reaction summary for a single comment
   */
  async getSummary(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    currentUserId?: string
  ): Promise<ReactionSummary[]> {
    const rows = await this.db
      .selectFrom("collab.comment_reaction")
      .select(["reaction_type", "user_id"])
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .execute();

    // Group by reaction type
    const grouped = new Map<ReactionType, string[]>();
    for (const row of rows) {
      const reactionType = row.reaction_type as ReactionType;
      if (!grouped.has(reactionType)) {
        grouped.set(reactionType, []);
      }
      grouped.get(reactionType)!.push(row.user_id);
    }

    // Convert to summary format
    return Array.from(grouped.entries()).map(([reactionType, userIds]) => ({
      reactionType,
      count: userIds.length,
      userIds,
      currentUserReacted: currentUserId ? userIds.includes(currentUserId) : false,
    }));
  }

  /**
   * Get reaction summaries for multiple comments (bulk fetch)
   */
  async getSummariesForComments(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentIds: string[],
    currentUserId?: string
  ): Promise<Map<string, ReactionSummary[]>> {
    if (commentIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom("collab.comment_reaction")
      .select(["comment_id", "reaction_type", "user_id"])
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "in", commentIds)
      .execute();

    // Group by comment_id and reaction_type
    const grouped = new Map<string, Map<ReactionType, string[]>>();
    for (const row of rows) {
      if (!grouped.has(row.comment_id)) {
        grouped.set(row.comment_id, new Map());
      }

      const commentReactions = grouped.get(row.comment_id)!;
      const reactionType = row.reaction_type as ReactionType;

      if (!commentReactions.has(reactionType)) {
        commentReactions.set(reactionType, []);
      }
      commentReactions.get(reactionType)!.push(row.user_id);
    }

    // Convert to summary format
    const summaries = new Map<string, ReactionSummary[]>();
    for (const [commentId, reactions] of grouped.entries()) {
      const summary = Array.from(reactions.entries()).map(([reactionType, userIds]) => ({
        reactionType,
        count: userIds.length,
        userIds,
        currentUserReacted: currentUserId ? userIds.includes(currentUserId) : false,
      }));
      summaries.set(commentId, summary);
    }

    return summaries;
  }

  /**
   * Get all reactions by a user (for activity feed)
   */
  async listByUser(
    tenantId: string,
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<CommentReaction[]> {
    const { limit = 50, offset = 0 } = options ?? {};

    const rows = await this.db
      .selectFrom("collab.comment_reaction")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRow(row as CommentReactionRow));
  }

  /**
   * Delete all reactions for a comment (cascade on comment delete)
   */
  async deleteForComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string
  ): Promise<void> {
    await this.db
      .deleteFrom("collab.comment_reaction")
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .execute();
  }

  /**
   * Map database row to domain model
   */
  private mapRow(row: CommentReactionRow): CommentReaction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      commentType: row.comment_type as "entity_comment" | "approval_comment",
      commentId: row.comment_id,
      userId: row.user_id,
      reactionType: row.reaction_type as ReactionType,
      createdAt: row.created_at,
    };
  }
}
