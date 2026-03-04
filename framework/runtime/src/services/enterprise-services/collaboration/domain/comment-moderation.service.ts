/**
 * Comment Moderation Service
 *
 * Handles flagging, auto-moderation, and moderator review.
 */

import type { AuditWriter } from "../../../../kernel/audit.js";
import type { Logger } from "../../../../kernel/logger.js";
import type { CommentFlagRepository } from "../persistence/comment-flag.repository.js";
import type {
  CommentFlag,
  CommentModerationStatus,
  CreateFlagRequest,
  ReviewFlagRequest,
} from "../types.js";

/**
 * Moderation Config
 */
interface ModerationConfig {
  autoHideThreshold?: number; // Auto-hide after N flags (default: 3)
  enableAutoHide?: boolean; // Enable auto-hide (default: true)
}

/**
 * Comment Moderation Service
 */
export class CommentModerationService {
  private readonly autoHideThreshold: number;
  private readonly enableAutoHide: boolean;

  constructor(
    private readonly repo: CommentFlagRepository,
    private readonly auditWriter: AuditWriter,
    private readonly logger: Logger,
    config?: ModerationConfig,
  ) {
    this.autoHideThreshold = config?.autoHideThreshold ?? 3;
    this.enableAutoHide = config?.enableAutoHide ?? true;
  }

  /**
   * Flag a comment
   */
  async flagComment(req: CreateFlagRequest): Promise<CommentFlag> {
    // Create flag
    const flag = await this.repo.createFlag(req);

    // Emit audit event
    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.flagged",
      level: "warn",
      actor: { kind: "user", id: req.flaggerUserId },
      meta: {
        tenantId: req.tenantId,
        commentType: req.commentType,
        commentId: req.commentId,
        flagReason: req.flagReason,
        flagId: flag.id,
      },
    });

    this.logger.info(
      {
        flagId: flag.id,
        commentId: req.commentId,
        reason: req.flagReason,
      },
      "[collab] Comment flagged",
    );

    // Check if auto-hide threshold is reached
    if (this.enableAutoHide) {
      await this.checkAutoHide(req.tenantId, req.commentType, req.commentId);
    }

    return flag;
  }

  /**
   * Get flags for a comment
   */
  async getFlagsForComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ): Promise<CommentFlag[]> {
    return this.repo.getFlagsForComment(tenantId, commentType, commentId);
  }

  /**
   * Get pending flags (moderation queue)
   */
  async getPendingFlags(
    tenantId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ flags: CommentFlag[]; total: number }> {
    const [flags, total] = await Promise.all([
      this.repo.getPendingFlags(tenantId, limit, offset),
      this.repo.countPendingFlags(tenantId),
    ]);

    return { flags, total };
  }

  /**
   * Review a flag (moderator action)
   */
  async reviewFlag(
    tenantId: string,
    flagId: string,
    req: ReviewFlagRequest,
  ): Promise<void> {
    // Get flag to know which comment it belongs to
    const flag = await this.repo.getPendingFlags(tenantId);
    const targetFlag = flag.find((f) => f.id === flagId);

    if (!targetFlag) {
      throw new Error("Flag not found");
    }

    // Update flag status
    await this.repo.reviewFlag(tenantId, flagId, req);

    // Take action on comment
    if (req.action === "hide_comment") {
      await this.repo.hideComment(
        tenantId,
        targetFlag.commentType,
        targetFlag.commentId,
        req.reviewedBy,
        req.resolution,
      );
    } else if (req.action === "dismiss") {
      // If dismissing, check if we should unhide the comment
      const status = await this.repo.getModerationStatus(
        tenantId,
        targetFlag.commentType,
        targetFlag.commentId,
      );

      // If auto-hidden and all flags are dismissed, unhide
      if (status?.isHidden && status.flagCount <= this.autoHideThreshold) {
        await this.repo.unhideComment(
          tenantId,
          targetFlag.commentType,
          targetFlag.commentId,
        );
      }
    }

    // Emit audit event
    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.flag_reviewed",
      level: "info",
      actor: { kind: "user", id: req.reviewedBy },
      meta: {
        tenantId,
        flagId,
        commentId: targetFlag.commentId,
        action: req.action,
        resolution: req.resolution,
      },
    });

    this.logger.info(
      {
        flagId,
        action: req.action,
        reviewedBy: req.reviewedBy,
      },
      "[collab] Flag reviewed",
    );
  }

  /**
   * Get moderation status for a comment
   */
  async getModerationStatus(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ): Promise<CommentModerationStatus | undefined> {
    return this.repo.getModerationStatus(tenantId, commentType, commentId);
  }

  /**
   * Manually hide a comment (moderator action)
   */
  async hideComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    moderatorId: string,
    reason: string,
  ): Promise<void> {
    await this.repo.hideComment(
      tenantId,
      commentType,
      commentId,
      moderatorId,
      reason,
    );

    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.hidden",
      level: "warn",
      actor: { kind: "user", id: moderatorId },
      meta: {
        tenantId,
        commentType,
        commentId,
        reason,
      },
    });

    this.logger.info(
      {
        commentId,
        moderatorId,
        reason,
      },
      "[collab] Comment manually hidden",
    );
  }

  /**
   * Manually unhide a comment (moderator action)
   */
  async unhideComment(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
    moderatorId: string,
  ): Promise<void> {
    await this.repo.unhideComment(tenantId, commentType, commentId);

    await this.auditWriter.write({
      ts: new Date().toISOString(),
      type: "comment.unhidden",
      level: "info",
      actor: { kind: "user", id: moderatorId },
      meta: {
        tenantId,
        commentType,
        commentId,
      },
    });

    this.logger.info(
      {
        commentId,
        moderatorId,
      },
      "[collab] Comment manually unhidden",
    );
  }

  /**
   * Check if comment should be auto-hidden based on flag count
   */
  private async checkAutoHide(
    tenantId: string,
    commentType: "entity_comment" | "approval_comment",
    commentId: string,
  ): Promise<void> {
    const status = await this.repo.getModerationStatus(
      tenantId,
      commentType,
      commentId,
    );

    if (!status) return;

    // Auto-hide if flag count reaches threshold and not already hidden
    if (status.flagCount >= this.autoHideThreshold && !status.isHidden) {
      await this.repo.hideComment(
        tenantId,
        commentType,
        commentId,
        "system",
        `Auto-hidden after ${this.autoHideThreshold} flags`,
      );

      await this.auditWriter.write({
        ts: new Date().toISOString(),
        type: "comment.auto_hidden",
        level: "warn",
        actor: { kind: "system", id: "auto-moderation" },
        meta: {
          tenantId,
          commentType,
          commentId,
          flagCount: status.flagCount,
          threshold: this.autoHideThreshold,
        },
      });

      this.logger.warn(
        {
          commentId,
          flagCount: status.flagCount,
          threshold: this.autoHideThreshold,
        },
        "[collab] Comment auto-hidden",
      );
    }
  }
}
