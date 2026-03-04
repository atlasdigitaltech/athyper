/**
 * Entity Comment Repository
 *
 * Kysely-based repository for collab.entity_comment table.
 * Handles CRUD operations for record-level comments.
 */

import type { EntityComment, CreateCommentRequest, UpdateCommentRequest, Attachment } from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Database row type (snake_case)
 */
interface EntityCommentRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  commenter_id: string;
  comment_text: string;
  parent_comment_id: string | null;
  thread_depth: number;
  visibility: string;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at: Date;
  created_by: string;
  updated_at: Date | null;
  updated_by: string | null;
}

/**
 * List options for pagination and filtering
 */
export interface ListCommentOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
  currentUserId?: string;
  isInternalUser?: boolean;
  isAdmin?: boolean;
}

/**
 * Entity Comment Repository
 */
export class EntityCommentRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Get comment by ID
   */
  async getById(tenantId: string, commentId: string): Promise<EntityComment | undefined> {
    const row = await this.db
      .selectFrom("collab.entity_comment")
      .selectAll()
      .where("id", "=", commentId)
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (!row) return undefined;

    const comment = this.mapRow(row as EntityCommentRow);

    // Fetch attachments
    const attachments = await this.fetchAttachmentsForComment(tenantId, commentId);
    comment.attachments = attachments;

    return comment;
  }

  /**
   * List comments for an entity (Phase 2: flat only, no threading)
   */
  async listByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: ListCommentOptions
  ): Promise<EntityComment[]> {
    const {
      limit = 50,
      offset = 0,
      includeDeleted = false,
      currentUserId,
      isInternalUser = false,
      isAdmin = false
    } = options ?? {};

    let query = this.db
      .selectFrom("collab.entity_comment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .where("parent_comment_id", "is", null); // Phase 2: top-level only

    if (!includeDeleted) {
      query = query.where("deleted_at", "is", null);
    }

    // Apply visibility filtering
    if (!isAdmin && currentUserId) {
      // Non-admin users: filter based on visibility
      const allowedVisibilities: string[] = ["public"];
      if (isInternalUser) allowedVisibilities.push("internal");

      query = query.where((eb) =>
        eb.or([
          eb("visibility", "in", allowedVisibilities),
          eb.and([
            eb("visibility", "=", "private"),
            eb("commenter_id", "=", currentUserId)
          ])
        ])
      );
    }

    const rows = await query
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const comments = rows.map((row) => this.mapRow(row as EntityCommentRow));

    // Fetch attachments for all comments
    if (comments.length > 0) {
      const commentIds = comments.map((c) => c.id);
      const attachmentsMap = await this.fetchAttachmentsForComments(tenantId, commentIds);
      comments.forEach((comment) => {
        comment.attachments = attachmentsMap.get(comment.id) || [];
      });
    }

    return comments;
  }

  /**
   * Count comments for an entity
   */
  async countByEntity(
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<number> {
    const result = await this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("entity_type", "=", entityType)
      .where("entity_id", "=", entityId)
      .where("deleted_at", "is", null)
      .where("parent_comment_id", "is", null)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Create a new comment
   */
  async create(req: CreateCommentRequest): Promise<EntityComment> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("collab.entity_comment")
      .values({
        id,
        tenant_id: req.tenantId,
        entity_type: req.entityType,
        entity_id: req.entityId,
        commenter_id: req.commenterId,
        comment_text: req.commentText,
        parent_comment_id: req.parentCommentId ?? null,
        thread_depth: 0, // Phase 2: always 0 (no threading yet)
        visibility: req.visibility ?? 'public',
        created_at: now,
        created_by: req.createdBy,
      })
      .execute();

    const created = await this.getById(req.tenantId, id);
    if (!created) {
      throw new Error("Failed to retrieve created comment");
    }

    return created;
  }

  /**
   * Update a comment
   */
  async update(
    tenantId: string,
    commentId: string,
    req: UpdateCommentRequest
  ): Promise<void> {
    const now = new Date();

    await this.db
      .updateTable("collab.entity_comment")
      .set({
        comment_text: req.commentText,
        updated_at: now,
        updated_by: req.updatedBy,
      })
      .where("id", "=", commentId)
      .where("tenant_id", "=", tenantId)
      .where("deleted_at", "is", null)
      .execute();
  }

  /**
   * Soft delete a comment
   */
  async softDelete(tenantId: string, commentId: string, deletedBy: string): Promise<void> {
    const now = new Date();

    await this.db
      .updateTable("collab.entity_comment")
      .set({
        deleted_at: now,
        deleted_by: deletedBy,
      })
      .where("id", "=", commentId)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * Get comments by commenter (for user activity view)
   */
  async listByCommenter(
    tenantId: string,
    commenterId: string,
    options?: ListCommentOptions
  ): Promise<EntityComment[]> {
    const { limit = 50, offset = 0 } = options ?? {};

    const rows = await this.db
      .selectFrom("collab.entity_comment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("commenter_id", "=", commenterId)
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const comments = rows.map((row) => this.mapRow(row as EntityCommentRow));

    // Fetch attachments for all comments
    if (comments.length > 0) {
      const commentIds = comments.map((c) => c.id);
      const attachmentsMap = await this.fetchAttachmentsForComments(tenantId, commentIds);
      comments.forEach((comment) => {
        comment.attachments = attachmentsMap.get(comment.id) || [];
      });
    }

    return comments;
  }

  /**
   * Create a reply to a comment (Phase 6)
   *
   * Validates thread depth and sets parent_comment_id.
   */
  async createReply(
    req: CreateCommentRequest & { parentCommentId: string },
    maxDepth: number = 5
  ): Promise<EntityComment> {
    // Get parent comment to determine thread depth
    const parent = await this.getById(req.tenantId, req.parentCommentId);
    if (!parent) {
      throw new Error(`Parent comment ${req.parentCommentId} not found`);
    }

    // Check max depth
    const newDepth = parent.threadDepth + 1;
    if (newDepth > maxDepth) {
      throw new Error(`Maximum thread depth of ${maxDepth} exceeded`);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("collab.entity_comment")
      .values({
        id,
        tenant_id: req.tenantId,
        entity_type: req.entityType,
        entity_id: req.entityId,
        commenter_id: req.commenterId,
        comment_text: req.commentText,
        parent_comment_id: req.parentCommentId,
        thread_depth: newDepth,
        visibility: req.visibility ?? 'public',
        created_at: now,
        created_by: req.createdBy,
      })
      .execute();

    const created = await this.getById(req.tenantId, id);
    if (!created) {
      throw new Error("Failed to retrieve created reply");
    }

    return created;
  }

  /**
   * List replies for a comment (Phase 6)
   */
  async listReplies(
    tenantId: string,
    parentCommentId: string,
    options?: ListCommentOptions
  ): Promise<EntityComment[]> {
    const {
      limit = 50,
      offset = 0,
      includeDeleted = false,
      currentUserId,
      isInternalUser = false,
      isAdmin = false
    } = options ?? {};

    let query = this.db
      .selectFrom("collab.entity_comment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("parent_comment_id", "=", parentCommentId);

    if (!includeDeleted) {
      query = query.where("deleted_at", "is", null);
    }

    // Apply visibility filtering
    if (!isAdmin && currentUserId) {
      const allowedVisibilities: string[] = ["public"];
      if (isInternalUser) allowedVisibilities.push("internal");

      query = query.where((eb) =>
        eb.or([
          eb("visibility", "in", allowedVisibilities),
          eb.and([
            eb("visibility", "=", "private"),
            eb("commenter_id", "=", currentUserId)
          ])
        ])
      );
    }

    const rows = await query
      .orderBy("created_at", "asc") // Chronological for threads
      .limit(limit)
      .offset(offset)
      .execute();

    const comments = rows.map((row) => this.mapRow(row as EntityCommentRow));

    // Fetch attachments for all comments
    if (comments.length > 0) {
      const commentIds = comments.map((c) => c.id);
      const attachmentsMap = await this.fetchAttachmentsForComments(tenantId, commentIds);
      comments.forEach((comment) => {
        comment.attachments = attachmentsMap.get(comment.id) || [];
      });
    }

    return comments;
  }

  /**
   * Count replies for a comment (Phase 6)
   */
  async countReplies(tenantId: string, parentCommentId: string): Promise<number> {
    const result = await this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("parent_comment_id", "=", parentCommentId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Fetch attachments for a single comment
   */
  private async fetchAttachmentsForComment(
    tenantId: string,
    commentId: string
  ): Promise<Attachment[]> {
    const rows = await this.db
      .selectFrom("doc.attachment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", "entity_comment")
      .where("comment_id", "=", commentId)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      ownerEntity: row.owner_entity ?? undefined,
      ownerEntityId: row.owner_entity_id ?? undefined,
      fileName: row.file_name,
      contentType: row.content_type ?? undefined,
      sizeBytes: row.size_bytes ? Number(row.size_bytes) : undefined,
      storageBucket: row.storage_bucket,
      storageKey: row.storage_key,
      isVirusScanned: row.is_virus_scanned,
      retentionUntil: row.retention_until?.toISOString() ?? undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      commentType: row.comment_type ?? undefined,
      commentId: row.comment_id ?? undefined,
      createdAt: row.created_at.toISOString(),
      createdBy: row.created_by,
    }));
  }

  /**
   * Fetch attachments for multiple comments (bulk fetch for performance)
   */
  private async fetchAttachmentsForComments(
    tenantId: string,
    commentIds: string[]
  ): Promise<Map<string, Attachment[]>> {
    if (commentIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom("doc.attachment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", "entity_comment")
      .where("comment_id", "in", commentIds)
      .execute();

    // Group attachments by comment ID
    const attachmentsByComment = new Map<string, Attachment[]>();
    for (const row of rows) {
      if (!row.comment_id) continue;

      const attachment = {
        id: row.id,
        tenantId: row.tenant_id,
        ownerEntity: row.owner_entity ?? undefined,
        ownerEntityId: row.owner_entity_id ?? undefined,
        fileName: row.file_name,
        contentType: row.content_type ?? undefined,
        sizeBytes: row.size_bytes ? Number(row.size_bytes) : undefined,
        storageBucket: row.storage_bucket,
        storageKey: row.storage_key,
        isVirusScanned: row.is_virus_scanned,
        retentionUntil: row.retention_until?.toISOString() ?? undefined,
        metadata: row.metadata as Record<string, unknown> | undefined,
        commentType: row.comment_type ?? undefined,
        commentId: row.comment_id,
        createdAt: row.created_at.toISOString(),
        createdBy: row.created_by,
      };

      if (!attachmentsByComment.has(row.comment_id)) {
        attachmentsByComment.set(row.comment_id, []);
      }
      attachmentsByComment.get(row.comment_id)!.push(attachment);
    }

    return attachmentsByComment;
  }

  /**
   * Map database row to domain model
   */
  private mapRow(row: EntityCommentRow): EntityComment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      commenterId: row.commenter_id,
      commentText: row.comment_text,
      parentCommentId: row.parent_comment_id ?? undefined,
      threadDepth: row.thread_depth,
      visibility: row.visibility as 'public' | 'internal' | 'private',
      deletedAt: row.deleted_at ?? undefined,
      deletedBy: row.deleted_by ?? undefined,
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at ?? undefined,
      updatedBy: row.updated_by ?? undefined,
    };
  }
}
