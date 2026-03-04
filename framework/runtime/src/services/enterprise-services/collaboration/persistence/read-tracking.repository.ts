/**
 * Read Tracking Repository
 *
 * Tracks which comments have been read by users.
 * Dual storage: Redis (hot) + PostgreSQL (persistent/audit)
 */

import type { CommentReadStatus, MarkAsReadRequest } from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Cache interface for read tracking.
 * Accepts any object with get/set (e.g. RedisClient or MemoryCache).
 */
interface ReadTrackingCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
}

/**
 * Database row type (snake_case)
 */
interface CommentReadStatusRow {
  id: string;
  tenant_id: string;
  comment_type: string;
  comment_id: string;
  user_id: string;
  read_at: Date;
}

/**
 * Read Tracking Repository
 */
export class ReadTrackingRepository {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly cache?: ReadTrackingCache
  ) {}

  /**
   * Mark a comment as read
   *
   * Dual write: Redis (for fast queries) + PostgreSQL (for audit/persistence)
   */
  async markAsRead(req: MarkAsReadRequest): Promise<void> {
    const now = new Date();

    // Write to PostgreSQL (upsert)
    await this.db
      .insertInto("collab.comment_read")
      .values({
        id: crypto.randomUUID(),
        tenant_id: req.tenantId,
        comment_type: req.commentType,
        comment_id: req.commentId,
        user_id: req.userId,
        read_at: now,
      })
      .onConflict((oc) =>
        oc
          .columns(["tenant_id", "comment_type", "comment_id", "user_id"])
          .doUpdateSet({ read_at: now })
      )
      .execute();

    // Write to Redis (if available)
    if (this.cache) {
      const key = `comment_read:${req.userId}:${req.commentId}`;
      await this.cache.set(key, now.toISOString(), "EX", 90 * 24 * 60 * 60); // 90 days
    }
  }

  /**
   * Mark multiple comments as read (bulk operation)
   */
  async markMultipleAsRead(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentIds: string[],
    userId: string
  ): Promise<void> {
    if (commentIds.length === 0) return;

    const now = new Date();

    // Bulk insert to PostgreSQL
    const values = commentIds.map((commentId) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      comment_type: commentType,
      comment_id: commentId,
      user_id: userId,
      read_at: now,
    }));

    await this.db
      .insertInto("collab.comment_read")
      .values(values)
      .onConflict((oc) =>
        oc
          .columns(["tenant_id", "comment_type", "comment_id", "user_id"])
          .doUpdateSet({ read_at: now })
      )
      .execute();

    // Bulk write to Redis (if available)
    if (this.cache) {
      const pipeline = [];
      for (const commentId of commentIds) {
        const key = `comment_read:${userId}:${commentId}`;
        pipeline.push(this.cache.set(key, now.toISOString(), { ttl: 90 * 24 * 60 * 60 }));
      }
      await Promise.all(pipeline);
    }
  }

  /**
   * Check if a comment has been read by a user
   *
   * Fast path: Check Redis first, fallback to PostgreSQL
   */
  async isRead(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    userId: string
  ): Promise<boolean> {
    // Fast path: Check Redis
    if (this.cache) {
      const key = `comment_read:${userId}:${commentId}`;
      const cached = await this.cache.get(key);
      if (cached !== null) {
        return true;
      }
    }

    // Fallback: Check PostgreSQL
    const row = await this.db
      .selectFrom("collab.comment_read")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return !!row;
  }

  /**
   * Get unread status for multiple comments (bulk check)
   *
   * Returns Set of comment IDs that are UNREAD
   */
  async getUnreadComments(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentIds: string[],
    userId: string
  ): Promise<Set<string>> {
    if (commentIds.length === 0) {
      return new Set();
    }

    // Query PostgreSQL for read comments
    const readRows = await this.db
      .selectFrom("collab.comment_read")
      .select("comment_id")
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "in", commentIds)
      .where("user_id", "=", userId)
      .execute();

    const readCommentIds = new Set(readRows.map((r) => r.comment_id));

    // Return unread comments (those NOT in read set)
    const unreadCommentIds = new Set<string>();
    for (const commentId of commentIds) {
      if (!readCommentIds.has(commentId)) {
        unreadCommentIds.add(commentId);
      }
    }

    return unreadCommentIds;
  }

  /**
   * Count unread comments for a user (notification badge)
   */
  async countUnread(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    userId: string,
    entityType?: string,
    entityId?: string
  ): Promise<number> {
    // This requires joining with comment tables to get total count
    // For entity_comment:
    let totalCommentsQuery = this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null);

    if (entityType) {
      totalCommentsQuery = totalCommentsQuery.where("entity_type", "=", entityType);
    }
    if (entityId) {
      totalCommentsQuery = totalCommentsQuery.where("entity_id", "=", entityId);
    }

    const totalResult = await totalCommentsQuery.executeTakeFirst();
    const totalComments = Number(totalResult?.count ?? 0);

    // Count read comments
    let readCommentsQuery = this.db
      .selectFrom("collab.comment_read as crs")
      .innerJoin("collab.entity_comment as ec", (join) =>
        join
          .onRef("crs.comment_id", "=", "ec.id")
          .on("crs.comment_type", "=", commentType)
      )
      .select(({ fn }) => fn.count<number>("crs.id").as("count"))
      .where("crs.tenant_id", "=", tenantId)
      .where("crs.user_id", "=", userId)
      .where("ec.deleted_at", "is", null);

    if (entityType) {
      readCommentsQuery = readCommentsQuery.where("ec.entity_type", "=", entityType);
    }
    if (entityId) {
      readCommentsQuery = readCommentsQuery.where("ec.entity_id", "=", entityId);
    }

    const readResult = await readCommentsQuery.executeTakeFirst();
    const readComments = Number(readResult?.count ?? 0);

    return totalComments - readComments;
  }

  /**
   * Delete read status for a comment (cascade on comment delete)
   */
  async deleteForComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string
  ): Promise<void> {
    await this.db
      .deleteFrom("collab.comment_read")
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .execute();

    // Note: Redis keys will expire naturally (90-day TTL)
  }

  /**
   * Map database row to domain model
   */
  private mapRow(row: CommentReadStatusRow): CommentReadStatus {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      commentType: row.comment_type as "entity_comment" | "approval_comment",
      commentId: row.comment_id,
      userId: row.user_id,
      readAt: row.read_at,
    };
  }
}
