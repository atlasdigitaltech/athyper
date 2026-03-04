/**
 * Reaction Service
 *
 * Business logic for emoji reactions on comments.
 */

import type { AuditWriter } from "../../../../kernel/audit.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { ReactionRepository } from "../persistence/reaction.repository.js";
import type { ReactionSummary, ReactionType } from "../types.js";

/**
 * Reaction Service
 */
export class ReactionService {
  constructor(
    private readonly repo: ReactionRepository,
    private readonly auditWriter: AuditWriter,
    private readonly logger: Logger
  ) {}

  /**
   * Toggle a reaction on a comment
   *
   * If user already reacted with this emoji, remove it.
   * If not, add the reaction.
   */
  async toggleReaction(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    userId: string,
    reactionType: ReactionType
  ): Promise<{ action: "added" | "removed" }> {
    const result = await this.repo.toggle({
      tenantId,
      commentType,
      commentId,
      userId,
      reactionType,
    });

    // Emit audit event
    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: result.action === "added" ? "reaction.added" : "reaction.removed",
      level: "info",
      actor: { kind: "user", id: userId },
      meta: {
        tenantId,
        commentType,
        commentId,
        reactionType,
      },
    });

    this.logger.info(
      {
        action: result.action,
        commentId,
        userId,
        reactionType,
      },
      "[collab] Reaction toggled"
    );

    return result;
  }

  /**
   * Get reaction summary for a comment
   */
  async getReactions(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    currentUserId?: string
  ): Promise<ReactionSummary[]> {
    return this.repo.getSummary(tenantId, commentType, commentId, currentUserId);
  }

  /**
   * Get reactions for multiple comments (bulk)
   */
  async getReactionsForComments(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentIds: string[],
    currentUserId?: string
  ): Promise<Map<string, ReactionSummary[]>> {
    return this.repo.getSummariesForComments(tenantId, commentType, commentIds, currentUserId);
  }

  /**
   * Delete all reactions for a comment
   *
   * Called when a comment is deleted.
   */
  async deleteReactionsForComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string
  ): Promise<void> {
    await this.repo.deleteForComment(tenantId, commentType, commentId);

    this.logger.info(
      {
        commentType,
        commentId,
      },
      "[collab] Reactions deleted for comment"
    );
  }
}
