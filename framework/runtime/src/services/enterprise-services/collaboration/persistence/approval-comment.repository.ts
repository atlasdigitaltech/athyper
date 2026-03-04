/**
 * Approval Comment Repository
 *
 * Kysely-based repository for wf.approval_comment table.
 * Handles comments specific to approval workflow instances.
 */

import type {
  ApprovalComment,
  CreateApprovalCommentRequest,
  Attachment,
} from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Database row type (snake_case)
 */
interface ApprovalCommentRow {
  id: string;
  tenant_id: string;
  approval_instance_id: string;
  approval_task_id: string | null;
  commenter_id: string;
  comment_text: string;
  visibility: string;
  created_at: Date;
  created_by: string;
}

/**
 * List options for pagination
 */
export interface ListApprovalCommentOptions {
  limit?: number;
  offset?: number;
  taskId?: string;
}

/**
 * Approval Comment Repository
 */
export class ApprovalCommentRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Get comment by ID
   */
  async getById(
    tenantId: string,
    commentId: string,
  ): Promise<ApprovalComment | undefined> {
    const row = await this.db
      .selectFrom("wf.approval_comment")
      .selectAll()
      .where("id", "=", commentId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!row) return undefined;

    const comment = this.mapRow(row as ApprovalCommentRow);

    // Fetch attachments
    const attachments = await this.fetchAttachmentsForComment(
      tenantId,
      commentId,
    );
    comment.attachments = attachments;

    return comment;
  }

  /**
   * List comments for an approval instance
   */
  async listByInstance(
    tenantId: string,
    approvalInstanceId: string,
    options?: ListApprovalCommentOptions,
  ): Promise<ApprovalComment[]> {
    const { limit = 100, offset = 0, taskId } = options ?? {};

    let query = this.db
      .selectFrom("wf.approval_comment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("approval_instance_id", "=", approvalInstanceId);

    // Optional: filter by specific task
    if (taskId) {
      query = query.where("approval_task_id", "=", taskId);
    }

    const rows = await query
      .orderBy("created_at", "asc") // Chronological order for workflow discussions
      .limit(limit)
      .offset(offset)
      .execute();

    const comments = rows.map((row) => this.mapRow(row as ApprovalCommentRow));

    // Fetch attachments for all comments
    if (comments.length > 0) {
      const commentIds = comments.map((c) => c.id);
      const attachmentsMap = await this.fetchAttachmentsForComments(
        tenantId,
        commentIds,
      );
      comments.forEach((comment) => {
        comment.attachments = attachmentsMap.get(comment.id) || [];
      });
    }

    return comments;
  }

  /**
   * Count comments for an approval instance
   */
  async countByInstance(
    tenantId: string,
    approvalInstanceId: string,
  ): Promise<number> {
    const result = await this.db
      .selectFrom("wf.approval_comment")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("approval_instance_id", "=", approvalInstanceId)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * Create a new approval comment
   */
  async create(req: CreateApprovalCommentRequest): Promise<ApprovalComment> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto("wf.approval_comment")
      .values({
        id,
        tenant_id: req.tenantId,
        approval_instance_id: req.approvalInstanceId,
        approval_task_id: req.approvalTaskId ?? null,
        commenter_id: req.commenterId,
        comment_text: req.commentText,
        visibility: req.visibility ?? "public",
        created_at: now,
        created_by: req.createdBy,
      })
      .execute();

    const created = await this.getById(req.tenantId, id);
    if (!created) {
      throw new Error("Failed to retrieve created approval comment");
    }

    return created;
  }

  /**
   * List comments by commenter (for user activity view)
   */
  async listByCommenter(
    tenantId: string,
    commenterId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ApprovalComment[]> {
    const { limit = 50, offset = 0 } = options ?? {};

    const rows = await this.db
      .selectFrom("wf.approval_comment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("commenter_id", "=", commenterId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const comments = rows.map((row) => this.mapRow(row as ApprovalCommentRow));

    // Fetch attachments for all comments
    if (comments.length > 0) {
      const commentIds = comments.map((c) => c.id);
      const attachmentsMap = await this.fetchAttachmentsForComments(
        tenantId,
        commentIds,
      );
      comments.forEach((comment) => {
        comment.attachments = attachmentsMap.get(comment.id) || [];
      });
    }

    return comments;
  }

  /**
   * Fetch attachments for a single comment
   */
  private async fetchAttachmentsForComment(
    tenantId: string,
    commentId: string,
  ): Promise<Attachment[]> {
    const rows = await this.db
      .selectFrom("doc.attachment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", "approval_comment")
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
    commentIds: string[],
  ): Promise<Map<string, Attachment[]>> {
    if (commentIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectFrom("doc.attachment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", "approval_comment")
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
  private mapRow(row: ApprovalCommentRow): ApprovalComment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      approvalInstanceId: row.approval_instance_id,
      approvalTaskId: row.approval_task_id ?? undefined,
      commenterId: row.commenter_id,
      commentText: row.comment_text,
      visibility: row.visibility as "public" | "internal" | "private",
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
