/**
 * CommentRepo - Repository for file comments and annotations
 *
 * Features:
 * - Threaded replies (parent_id)
 * - Mentions support (JSONB array of user IDs)
 * - Soft delete (deleted_at)
 * - Edit tracking (edited_at, edited_by)
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.attachment_comment" as keyof DB & string;

export interface CreateCommentParams {
  tenantId: string;
  attachmentId: string;
  parentId?: string;
  authorId: string;
  content: string;
  mentions?: string[];
}

export interface UpdateCommentParams {
  content: string;
  editedBy: string;
  mentions?: string[];
}

export interface AttachmentComment {
  id: string;
  tenantId: string;
  attachmentId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  mentions: string[] | null;
  editedAt: Date | null;
  editedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CommentRepo {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create new comment
   */
  async create(params: CreateCommentParams): Promise<AttachmentComment> {
    const now = new Date();

    const result = await this.db
      .insertInto(TABLE as any)
      .values({
        tenant_id: params.tenantId,
        attachment_id: params.attachmentId,
        parent_id: params.parentId ?? null,
        author_id: params.authorId,
        content: params.content,
        mentions: params.mentions ? JSON.stringify(params.mentions) : null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToComment(result);
  }

  /**
   * Get comment by ID
   */
  async getById(
    id: string,
    tenantId: string,
  ): Promise<AttachmentComment | null> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return result ? this.mapToComment(result) : null;
  }

  /**
   * Update comment content
   */
  async update(
    id: string,
    tenantId: string,
    params: UpdateCommentParams,
  ): Promise<AttachmentComment> {
    const result = await this.db
      .updateTable(TABLE as any)
      .set({
        content: params.content,
        mentions: params.mentions ? JSON.stringify(params.mentions) : null,
        edited_at: new Date(),
        edited_by: params.editedBy,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToComment(result);
  }

  /**
   * Soft delete comment
   */
  async delete(id: string, tenantId: string, deletedBy: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        deleted_at: new Date(),
        deleted_by: deletedBy,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * List comments for attachment (including replies)
   */
  async listByAttachment(
    tenantId: string,
    attachmentId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<AttachmentComment[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("attachment_id", "=", attachmentId);

    if (!options?.includeDeleted) {
      query = query.where("deleted_at", "is", null);
    }

    query = query.orderBy("created_at", "asc");

    const results = await query.execute();
    return results.map((r) => this.mapToComment(r));
  }

  /**
   * Get replies to a comment
   */
  async getReplies(
    parentId: string,
    tenantId: string,
  ): Promise<AttachmentComment[]> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("parent_id", "=", parentId)
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .orderBy("created_at", "asc")
      .execute();

    return results.map((r) => this.mapToComment(r));
  }

  /**
   * Get comments by author
   */
  async listByAuthor(
    tenantId: string,
    authorId: string,
    limit = 50,
  ): Promise<AttachmentComment[]> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("author_id", "=", authorId)
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();

    return results.map((r) => this.mapToComment(r));
  }

  /**
   * Find comments mentioning a user
   */
  async findMentions(
    tenantId: string,
    userId: string,
    limit = 50,
  ): Promise<AttachmentComment[]> {
    // Use JSONB contains operator
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .where((eb) => eb.or([eb("mentions", "@>", JSON.stringify([userId]))]))
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();

    return results.map((r) => this.mapToComment(r));
  }

  /**
   * Count comments for attachment
   */
  async countByAttachment(
    tenantId: string,
    attachmentId: string,
  ): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("attachment_id", "=", attachmentId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  /**
   * Hard delete comments for attachment (cascade on attachment delete)
   */
  async hardDeleteByAttachment(
    tenantId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.db
      .deleteFrom(TABLE as any)
      .where("tenant_id", "=", tenantId)
      .where("attachment_id", "=", attachmentId)
      .execute();
  }

  /**
   * Map database row to AttachmentComment domain object
   */
  private mapToComment(row: any): AttachmentComment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      attachmentId: row.attachment_id,
      parentId: row.parent_id,
      authorId: row.author_id,
      content: row.content,
      mentions: row.mentions ? JSON.parse(row.mentions) : null,
      editedAt: row.edited_at ? new Date(row.edited_at) : null,
      editedBy: row.edited_by,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      deletedBy: row.deleted_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
