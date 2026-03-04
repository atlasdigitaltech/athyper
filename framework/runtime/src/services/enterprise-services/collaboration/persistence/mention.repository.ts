/**
 * Mention Repository
 *
 * Handles persistence for comment mentions (@username, @{uuid}).
 * Stores parsed mentions in collab.comment_mention table.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Comment Mention domain object
 */
export interface CommentMention {
  id: string;
  tenantId: string;
  commentType: string;
  commentId: string;
  mentionedUserId: string;
  mentionText: string;
  position: number;
  createdAt: string;
}

/**
 * Raw database row type
 */
interface CommentMentionRow {
  id: string;
  tenant_id: string;
  comment_type: string;
  comment_id: string;
  mentioned_user_id: string;
  mention_text: string;
  position: number;
  created_at: Date;
}

/**
 * Create mention request
 */
export interface CreateMentionRequest {
  tenantId: string;
  commentType: "entity_comment" | "approval_comment";
  commentId: string;
  mentionedUserId: string;
  mentionText: string;
  position: number;
}

/**
 * Mention Repository
 */
export class MentionRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Create a new mention record
   */
  async create(req: CreateMentionRequest): Promise<CommentMention> {
    const id = crypto.randomUUID();

    await this.db
      .insertInto("collab.comment_mention")
      .values({
        id,
        tenant_id: req.tenantId,
        comment_type: req.commentType,
        comment_id: req.commentId,
        mentioned_user_id: req.mentionedUserId,
        mention_text: req.mentionText,
        position: req.position,
      })
      .execute();

    const mention = await this.getById(req.tenantId, id);
    if (!mention) {
      throw new Error("Failed to create mention");
    }

    return mention;
  }

  /**
   * Get mention by ID
   */
  async getById(tenantId: string, mentionId: string): Promise<CommentMention | undefined> {
    const row = await this.db
      .selectFrom("collab.comment_mention")
      .selectAll()
      .where("id", "=", mentionId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return row ? this.mapRow(row as CommentMentionRow) : undefined;
  }

  /**
   * List mentions for a specific comment
   */
  async listByComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string
  ): Promise<CommentMention[]> {
    const rows = await this.db
      .selectFrom("collab.comment_mention")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .orderBy("position", "asc")
      .execute();

    return rows.map((row) => this.mapRow(row as CommentMentionRow));
  }

  /**
   * List mentions for a specific user (for notification inbox)
   *
   * Returns mentions where the user was mentioned, ordered by most recent first.
   */
  async listByUser(
    tenantId: string,
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<CommentMention[]> {
    const { limit = 50, offset = 0 } = options ?? {};

    const rows = await this.db
      .selectFrom("collab.comment_mention")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("mentioned_user_id", "=", userId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRow(row as CommentMentionRow));
  }

  /**
   * Count mentions for a user
   */
  async countByUser(tenantId: string, userId: string): Promise<number> {
    const result = await this.db
      .selectFrom("collab.comment_mention")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("tenant_id", "=", tenantId)
      .where("mentioned_user_id", "=", userId)
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  /**
   * Delete mentions for a comment (when comment is deleted)
   */
  async deleteByComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string
  ): Promise<void> {
    await this.db
      .deleteFrom("collab.comment_mention")
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .execute();
  }

  /**
   * Map database row to domain object
   */
  private mapRow(row: CommentMentionRow): CommentMention {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      commentType: row.comment_type,
      commentId: row.comment_id,
      mentionedUserId: row.mentioned_user_id,
      mentionText: row.mention_text,
      position: row.position,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}
