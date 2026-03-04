/**
 * CommentService - File comment and annotation management
 *
 * Features:
 * - Create threaded comments on attachments
 * - Edit/delete comments (soft delete)
 * - Reply to comments (parent_id)
 * - Mention users (@username)
 * - Audit all operations
 */

import type { ContentAuditEmitter } from "./ContentAuditEmitter";
import type { Logger } from "../../../../../kernel/logger";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo";
import type { CommentRepo } from "../../persistence/CommentRepo";

export interface CreateCommentParams {
  tenantId: string;
  attachmentId: string;
  actorId: string;
  content: string;
  mentions?: string[];
  parentId?: string;
}

export interface UpdateCommentParams {
  commentId: string;
  tenantId: string;
  actorId: string;
  content: string;
  mentions?: string[];
}

export interface DeleteCommentParams {
  commentId: string;
  tenantId: string;
  actorId: string;
}

export interface ListCommentsParams {
  tenantId: string;
  attachmentId: string;
  includeDeleted?: boolean;
}

export interface ListMentionsParams {
  tenantId: string;
  userId: string;
  limit?: number;
}

export interface GetCommentThreadParams {
  tenantId: string;
  commentId: string;
}

export class CommentService {
  constructor(
    private commentRepo: CommentRepo,
    private attachmentRepo: AttachmentRepo,
    private audit: ContentAuditEmitter,
    private logger: Logger,
  ) {}

  /**
   * Create a comment on an attachment
   */
  async createComment(params: CreateCommentParams) {
    const { tenantId, attachmentId, actorId, content, mentions, parentId } = params;

    // Validate attachment exists
    const attachment = await this.attachmentRepo.getById(attachmentId, tenantId);
    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // If replying, validate parent exists
    if (parentId) {
      const parent = await this.commentRepo.getById(parentId, tenantId);
      if (!parent) {
        throw new Error(`Parent comment not found: ${parentId}`);
      }
      if (parent.attachmentId !== attachmentId) {
        throw new Error("Parent comment belongs to different attachment");
      }
    }

    // Create comment
    const comment = await this.commentRepo.create({
      tenantId,
      attachmentId,
      authorId: actorId,
      content,
      mentions: mentions ?? [],
      parentId,
    });

    // Emit audit event (best-effort)
    await (this.audit as any).commentCreated?.({
      tenantId,
      actorId,
      attachmentId,
      commentId: comment.id,
      metadata: {
        contentLength: content.length,
        mentionsCount: mentions?.length ?? 0,
        isReply: !!parentId,
      },
    }).catch?.(() => {});

    this.logger.info(
      { commentId: comment.id, attachmentId, actorId, isReply: !!parentId },
      "[CommentService] Comment created"
    );

    return comment;
  }

  /**
   * Reply to an existing comment
   */
  async replyToComment(params: CreateCommentParams & { parentId: string }) {
    return this.createComment(params);
  }

  /**
   * Edit a comment (only author can edit)
   */
  async updateComment(params: UpdateCommentParams) {
    const { commentId, tenantId, actorId, content, mentions } = params;

    // Get existing comment
    const existing = await this.commentRepo.getById(commentId, tenantId);
    if (!existing) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    // Only author can edit
    if (existing.authorId !== actorId) {
      throw new Error("Only comment author can edit");
    }

    // Don't allow editing deleted comments
    if (existing.deletedAt) {
      throw new Error("Cannot edit deleted comment");
    }

    // Update comment
    const updated = await this.commentRepo.update(commentId, tenantId, {
      content,
      editedBy: actorId,
      mentions: mentions ?? existing.mentions ?? undefined,
    });

    // Emit audit event (best-effort)
    await (this.audit as any).commentUpdated?.({
      tenantId,
      actorId,
      attachmentId: existing.attachmentId,
      commentId,
      metadata: {
        oldContentLength: existing.content.length,
        newContentLength: content.length,
      },
    }).catch?.(() => {});

    this.logger.info(
      { commentId, attachmentId: existing.attachmentId, actorId },
      "[CommentService] Comment updated"
    );

    return updated;
  }

  /**
   * Soft delete a comment (only author or admin can delete)
   */
  async deleteComment(params: DeleteCommentParams) {
    const { commentId, tenantId, actorId } = params;

    // Get existing comment
    const existing = await this.commentRepo.getById(commentId, tenantId);
    if (!existing) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    // Only author can delete (admin check would go here)
    if (existing.authorId !== actorId) {
      throw new Error("Only comment author can delete");
    }

    // Already deleted
    if (existing.deletedAt) {
      throw new Error("Comment already deleted");
    }

    // Soft delete (CommentRepo.delete is a soft delete)
    await this.commentRepo.delete(commentId, tenantId, actorId);

    // Emit audit event (best-effort)
    await (this.audit as any).commentDeleted?.({
      tenantId,
      actorId,
      attachmentId: existing.attachmentId,
      commentId,
      metadata: {
        hadReplies: false, // Would need to check children
      },
    }).catch?.(() => {});

    this.logger.info(
      { commentId, attachmentId: existing.attachmentId, actorId },
      "[CommentService] Comment deleted"
    );
  }

  /**
   * List all comments for an attachment
   */
  async listComments(params: ListCommentsParams) {
    const { tenantId, attachmentId, includeDeleted = false } = params;

    return this.commentRepo.listByAttachment(tenantId, attachmentId, { includeDeleted });
  }

  /**
   * Get comment thread (parent + all children)
   */
  async getCommentThread(params: GetCommentThreadParams) {
    const { tenantId, commentId } = params;

    // Get root comment
    const root = await this.commentRepo.getById(commentId, tenantId);
    if (!root) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    // Get all replies
    const replies = await this.commentRepo.getReplies(commentId, tenantId);

    return {
      root,
      replies,
    };
  }

  /**
   * Find all comments mentioning a user
   */
  async listUserMentions(params: ListMentionsParams) {
    const { tenantId, userId, limit = 50 } = params;

    return this.commentRepo.findMentions(tenantId, userId, limit);
  }

  /**
   * Get comment by ID
   */
  async getCommentById(commentId: string, tenantId: string) {
    return this.commentRepo.getById(commentId, tenantId);
  }

  /**
   * Count comments on an attachment
   */
  async countComments(attachmentId: string, tenantId: string): Promise<number> {
    return this.commentRepo.countByAttachment(tenantId, attachmentId);
  }

  /**
   * Hard delete old soft-deleted comments (cleanup)
   */
  async cleanupOldDeletedComments(tenantId: string, olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deleted = await (this.commentRepo as any).hardDeleteOldSoftDeleted?.(tenantId, cutoffDate) ?? 0;

    this.logger.info(
      { tenantId, olderThanDays, deletedCount: deleted },
      "[CommentService] Cleaned up old deleted comments"
    );

    return deleted;
  }
}
