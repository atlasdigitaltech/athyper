/**
 * Read Tracking Service
 *
 * Tracks which comments have been read by users.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { ReadTrackingRepository } from "../persistence/read-tracking.repository.js";

/**
 * Read Tracking Service
 */
export class ReadTrackingService {
  constructor(
    private readonly repo: ReadTrackingRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Mark a comment as read
   */
  async markAsRead(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    userId: string,
  ): Promise<void> {
    await this.repo.markAsRead({
      tenantId,
      commentType,
      commentId,
      userId,
    });

    this.logger.debug(
      {
        commentId,
        userId,
      },
      "[collab] Comment marked as read",
    );
  }

  /**
   * Mark multiple comments as read (bulk)
   *
   * Used for "mark all as read" functionality.
   */
  async markMultipleAsRead(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentIds: string[],
    userId: string,
  ): Promise<void> {
    await this.repo.markMultipleAsRead(
      tenantId,
      commentType,
      commentIds,
      userId,
    );

    this.logger.info(
      {
        count: commentIds.length,
        userId,
      },
      "[collab] Multiple comments marked as read",
    );
  }

  /**
   * Check if a comment is read
   */
  async isRead(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    userId: string,
  ): Promise<boolean> {
    return this.repo.isRead(tenantId, commentType, commentId, userId);
  }

  /**
   * Get unread status for multiple comments
   *
   * Returns Set of comment IDs that are UNREAD.
   */
  async getUnreadComments(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentIds: string[],
    userId: string,
  ): Promise<Set<string>> {
    return this.repo.getUnreadComments(
      tenantId,
      commentType,
      commentIds,
      userId,
    );
  }

  /**
   * Count unread comments for a user
   *
   * Used for notification badge counts.
   */
  async countUnread(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    userId: string,
    entityType?: string,
    entityId?: string,
  ): Promise<number> {
    return this.repo.countUnread(
      tenantId,
      commentType,
      userId,
      entityType,
      entityId,
    );
  }
}
