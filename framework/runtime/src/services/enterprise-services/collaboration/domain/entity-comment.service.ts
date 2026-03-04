/**
 * Entity Comment Service
 *
 * Business logic for record-level comments including:
 * - Validation (comment length, ownership)
 * - Authorization (ownership checks, moderator privileges)
 * - Audit event emission
 * - Rate limiting integration (Phase 7)
 */

import type { CommentEventsService } from "./comment-events.service.js";
import type { MentionService } from "./mention.service.js";
import type { AuditWriter } from "../../../../kernel/audit.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { EntityCommentRepository, ListCommentOptions } from "../persistence/entity-comment.repository.js";
import type { EntityComment, CreateCommentRequest, UpdateCommentRequest } from "../types.js";

/**
 * Entity Comment Service
 */
export class EntityCommentService {
  constructor(
    private readonly repo: EntityCommentRepository,
    private readonly auditWriter: AuditWriter,
    private readonly logger: Logger,
    private readonly config?: {
      maxCommentLength?: number;
    },
    private readonly mentionService?: MentionService,
    private readonly eventsService?: CommentEventsService
  ) {}

  /**
   * Create a new comment
   */
  async create(req: CreateCommentRequest): Promise<EntityComment> {
    const maxLength = this.config?.maxCommentLength ?? 5000;

    // Validate comment length
    if (req.commentText.length > maxLength) {
      throw new Error(`Comment text exceeds maximum length of ${maxLength} characters`);
    }

    if (req.commentText.trim().length === 0) {
      throw new Error("Comment text cannot be empty");
    }

    // Create comment
    const comment = await this.repo.create(req);

    // Process mentions (Phase 5)
    if (this.mentionService) {
      try {
        const mentionResult = await this.mentionService.processMentions(
          req.tenantId,
          "entity_comment",
          comment.id,
          req.commentText
        );

        if (mentionResult.mentionsCreated > 0) {
          this.logger.info(
            {
              commentId: comment.id,
              mentionsCreated: mentionResult.mentionsCreated,
              mentionedUsers: mentionResult.mentionedUserIds,
            },
            "[collab] Processed mentions for comment"
          );
        }
      } catch (err) {
        this.logger.error(
          {
            commentId: comment.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "[collab] Failed to process mentions (non-fatal)"
        );
      }
    }

    // Emit audit event
    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.created",
      level: "info",
      actor: { kind: "user", id: req.commenterId },
      meta: {
        tenantId: req.tenantId,
        commentId: comment.id,
        entityType: req.entityType,
        entityId: req.entityId,
        commentLength: req.commentText.length,
        commentPreview: req.commentText.substring(0, 100),
      },
    });

    this.logger.info(
      {
        commentId: comment.id,
        entityType: req.entityType,
        entityId: req.entityId,
        commenterId: req.commenterId,
      },
      "[collab] Comment created"
    );

    // Broadcast real-time event
    if (this.eventsService) {
      this.eventsService.broadcast({
        type: "comment_created",
        tenantId: req.tenantId,
        entityType: req.entityType,
        entityId: req.entityId,
        commentId: comment.id,
        comment: {
          id: comment.id,
          commentText: comment.commentText,
          commenterId: comment.commenterId,
          commenterDisplayName: comment.commenterDisplayName,
          visibility: comment.visibility,
          createdAt: comment.createdAt,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return comment;
  }

  /**
   * Create a reply to a comment (Phase 6)
   */
  async createReply(
    req: CreateCommentRequest & { parentCommentId: string }
  ): Promise<EntityComment> {
    const maxLength = this.config?.maxCommentLength ?? 5000;
    const maxDepth = 5; // Hard limit

    // Validate comment length
    if (req.commentText.length > maxLength) {
      throw new Error(`Comment text exceeds maximum length of ${maxLength} characters`);
    }

    if (req.commentText.trim().length === 0) {
      throw new Error("Comment text cannot be empty");
    }

    // Create reply with thread depth validation
    const reply = await this.repo.createReply(req, maxDepth);

    // Process mentions (Phase 5)
    if (this.mentionService) {
      try {
        const mentionResult = await this.mentionService.processMentions(
          req.tenantId,
          "entity_comment",
          reply.id,
          req.commentText
        );

        if (mentionResult.mentionsCreated > 0) {
          this.logger.info(
            {
              replyId: reply.id,
              parentId: req.parentCommentId,
              mentionsCreated: mentionResult.mentionsCreated,
            },
            "[collab] Processed mentions for reply"
          );
        }
      } catch (err) {
        this.logger.error(
          {
            replyId: reply.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "[collab] Failed to process mentions in reply (non-fatal)"
        );
      }
    }

    // Emit audit event
    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.reply.created",
      level: "info",
      actor: { kind: "user", id: req.commenterId },
      meta: {
        tenantId: req.tenantId,
        replyId: reply.id,
        parentCommentId: req.parentCommentId,
        threadDepth: reply.threadDepth,
        commentLength: req.commentText.length,
        commentPreview: req.commentText.substring(0, 100),
      },
    });

    this.logger.info(
      {
        replyId: reply.id,
        parentId: req.parentCommentId,
        depth: reply.threadDepth,
      },
      "[collab] Reply created"
    );

    // Broadcast real-time event
    if (this.eventsService) {
      this.eventsService.broadcast({
        type: "reply_created",
        tenantId: req.tenantId,
        entityType: req.entityType,
        entityId: req.entityId,
        commentId: reply.id,
        parentCommentId: req.parentCommentId,
        comment: {
          id: reply.id,
          commentText: reply.commentText,
          commenterId: reply.commenterId,
          commenterDisplayName: reply.commenterDisplayName,
          visibility: reply.visibility,
          threadDepth: reply.threadDepth,
          createdAt: reply.createdAt,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return reply;
  }

  /**
   * List replies for a comment (Phase 6)
   */
  async listReplies(
    tenantId: string,
    parentCommentId: string,
    options?: ListCommentOptions
  ): Promise<EntityComment[]> {
    return this.repo.listReplies(tenantId, parentCommentId, options);
  }

  /**
   * Count replies for a comment (Phase 6)
   */
  async countReplies(tenantId: string, parentCommentId: string): Promise<number> {
    return this.repo.countReplies(tenantId, parentCommentId);
  }

  /**
   * Get comment by ID
   */
  async getById(tenantId: string, commentId: string): Promise<EntityComment | undefined> {
    return this.repo.getById(tenantId, commentId);
  }

  /**
   * List comments for an entity
   */
  async listByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: ListCommentOptions
  ): Promise<EntityComment[]> {
    return this.repo.listByEntity(tenantId, entityType, entityId, options);
  }

  /**
   * Count comments for an entity
   */
  async countByEntity(
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<number> {
    return this.repo.countByEntity(tenantId, entityType, entityId);
  }

  /**
   * Update a comment
   *
   * Authorization: Only the comment owner can update their own comments.
   * Moderators with COMMENT_MODERATE permission can update any comment.
   */
  async update(
    tenantId: string,
    commentId: string,
    commenterId: string,
    req: UpdateCommentRequest,
    isModerator: boolean = false
  ): Promise<EntityComment> {
    const maxLength = this.config?.maxCommentLength ?? 5000;

    // Validate comment length
    if (req.commentText.length > maxLength) {
      throw new Error(`Comment text exceeds maximum length of ${maxLength} characters`);
    }

    if (req.commentText.trim().length === 0) {
      throw new Error("Comment text cannot be empty");
    }

    // Get existing comment
    const existing = await this.repo.getById(tenantId, commentId);
    if (!existing) {
      throw new Error("Comment not found");
    }

    // Authorization: Check ownership or moderator status
    if (!isModerator && existing.commenterId !== commenterId) {
      throw new Error("You can only edit your own comments");
    }

    // Update comment
    await this.repo.update(tenantId, commentId, req);

    // Emit audit event
    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.updated",
      level: "info",
      actor: { kind: "user", id: commenterId },
      meta: {
        tenantId,
        commentId,
        entityType: existing.entityType,
        entityId: existing.entityId,
        originalCommenterId: existing.commenterId,
        isModerator,
        previousLength: existing.commentText.length,
        newLength: req.commentText.length,
      },
    });

    this.logger.info(
      {
        commentId,
        commenterId,
        isModerator,
      },
      "[collab] Comment updated"
    );

    // Fetch updated comment
    const updated = await this.repo.getById(tenantId, commentId);
    if (!updated) {
      throw new Error("Failed to retrieve updated comment");
    }

    // Broadcast real-time event
    if (this.eventsService) {
      this.eventsService.broadcast({
        type: "comment_updated",
        tenantId,
        entityType: existing.entityType,
        entityId: existing.entityId,
        commentId,
        comment: {
          id: updated.id,
          commentText: updated.commentText,
          updatedAt: updated.updatedAt,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return updated;
  }

  /**
   * Delete a comment (soft delete)
   *
   * Authorization: Only the comment owner can delete their own comments.
   * Moderators with COMMENT_MODERATE permission can delete any comment.
   */
  async delete(
    tenantId: string,
    commentId: string,
    requesterId: string,
    isModerator: boolean = false
  ): Promise<void> {
    // Get existing comment
    const existing = await this.repo.getById(tenantId, commentId);
    if (!existing) {
      throw new Error("Comment not found");
    }

    // Authorization: Check ownership or moderator status
    if (!isModerator && existing.commenterId !== requesterId) {
      throw new Error("You can only delete your own comments");
    }

    // Soft delete
    await this.repo.softDelete(tenantId, commentId, requesterId);

    // Emit audit event
    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.deleted",
      level: "warn",
      actor: { kind: "user", id: requesterId },
      meta: {
        tenantId,
        commentId,
        entityType: existing.entityType,
        entityId: existing.entityId,
        originalCommenterId: existing.commenterId,
        isModerator,
        commentLength: existing.commentText.length,
      },
    });

    this.logger.info(
      {
        commentId,
        requesterId,
        isModerator,
      },
      "[collab] Comment deleted"
    );

    // Broadcast real-time event
    if (this.eventsService) {
      this.eventsService.broadcast({
        type: "comment_deleted",
        tenantId,
        entityType: existing.entityType,
        entityId: existing.entityId,
        commentId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * List comments by commenter (for user activity view)
   */
  async listByCommenter(
    tenantId: string,
    commenterId: string,
    options?: ListCommentOptions
  ): Promise<EntityComment[]> {
    return this.repo.listByCommenter(tenantId, commenterId, options);
  }
}
