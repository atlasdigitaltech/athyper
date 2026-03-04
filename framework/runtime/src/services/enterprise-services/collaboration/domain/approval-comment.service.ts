/**
 * Approval Comment Service
 *
 * Business logic for approval workflow comments.
 * These comments are specific to approval instances and tasks.
 */

import type { MentionService } from "./mention.service.js";
import type { AuditWriter } from "../../../../kernel/audit.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { ApprovalCommentRepository, ListApprovalCommentOptions } from "../persistence/approval-comment.repository.js";
import type { ApprovalComment, CreateApprovalCommentRequest } from "../types.js";

/**
 * Approval Comment Service
 */
export class ApprovalCommentService {
  constructor(
    private readonly repo: ApprovalCommentRepository,
    private readonly auditWriter: AuditWriter,
    private readonly logger: Logger,
    private readonly config?: {
      maxCommentLength?: number;
    },
    private readonly mentionService?: MentionService
  ) {}

  /**
   * Create a new approval comment
   */
  async create(req: CreateApprovalCommentRequest): Promise<ApprovalComment> {
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
          "approval_comment",
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
            "[collab] Processed mentions for approval comment"
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
      type: "approval.comment.created",
      level: "info",
      actor: { kind: "user", id: req.commenterId },
      meta: {
        tenantId: req.tenantId,
        commentId: comment.id,
        approvalInstanceId: req.approvalInstanceId,
        approvalTaskId: req.approvalTaskId,
        commentLength: req.commentText.length,
        commentPreview: req.commentText.substring(0, 100),
      },
    });

    this.logger.info(
      {
        commentId: comment.id,
        approvalInstanceId: req.approvalInstanceId,
        approvalTaskId: req.approvalTaskId,
        commenterId: req.commenterId,
      },
      "[collab] Approval comment created"
    );

    return comment;
  }

  /**
   * Get comment by ID
   */
  async getById(tenantId: string, commentId: string): Promise<ApprovalComment | undefined> {
    return this.repo.getById(tenantId, commentId);
  }

  /**
   * List comments for an approval instance
   */
  async listByInstance(
    tenantId: string,
    approvalInstanceId: string,
    options?: ListApprovalCommentOptions
  ): Promise<ApprovalComment[]> {
    return this.repo.listByInstance(tenantId, approvalInstanceId, options);
  }

  /**
   * Count comments for an approval instance
   */
  async countByInstance(
    tenantId: string,
    approvalInstanceId: string
  ): Promise<number> {
    return this.repo.countByInstance(tenantId, approvalInstanceId);
  }

  /**
   * List comments by commenter (for user activity view)
   */
  async listByCommenter(
    tenantId: string,
    commenterId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ApprovalComment[]> {
    return this.repo.listByCommenter(tenantId, commenterId, options);
  }
}
