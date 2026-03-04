/**
 * Collaboration API Handlers
 *
 * HTTP route handlers for timeline, comments, mentions, and attachments.
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { Container } from "../../../../kernel/container.js";
import type { ApprovalCommentService } from "../domain/approval-comment.service.js";
import type { AttachmentLinkService } from "../domain/attachment-link.service.js";
import type { CommentAnalyticsService } from "../domain/comment-analytics.service.js";
import type { CommentModerationService } from "../domain/comment-moderation.service.js";
import type { CommentRetentionService } from "../domain/comment-retention.service.js";
import type { CommentSearchService } from "../domain/comment-search.service.js";
import type { CommentSLAService } from "../domain/comment-sla.service.js";
import type { EntityCommentService } from "../domain/entity-comment.service.js";
import type { CollabTimelineService } from "../domain/timeline.service.js";
import type { Request, Response } from "express";

/**
 * HTTP Handler Context (simplified interface)
 */
export interface HttpHandlerContext {
  request: Request;
  response: Response;
  container: Container;
  tenant: { tenantId: string; tenantKey: string };
  auth: { userId?: string; subject?: string; persona?: string };
}

/**
 * GET /api/collab/timeline
 *
 * Query activity timeline for an entity or user.
 */
export class GetTimelineHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CollabTimelineService>(TOKENS.collabTimelineService);
    const { entityType, entityId, actorUserId, startDate, endDate, limit, offset } = ctx.request.query;

    const entries = await service.getTimeline({
      tenantId: ctx.tenant.tenantId,
      entityType: entityType as string | undefined,
      entityId: entityId as string | undefined,
      actorUserId: actorUserId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
    });

    ctx.response.status(200).json({ ok: true, data: entries });
  }
}

/**
 * GET /api/collab/comments
 *
 * List comments for an entity.
 */
export class ListCommentsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<EntityCommentService>(TOKENS.collabCommentService);
    const { entityType, entityId, limit, offset } = ctx.request.query;

    if (!entityType || !entityId) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required parameters: entityType and entityId",
      });
      return;
    }

    const comments = await service.listByEntity(
      ctx.tenant.tenantId,
      entityType as string,
      entityId as string,
      {
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      }
    );

    const count = await service.countByEntity(
      ctx.tenant.tenantId,
      entityType as string,
      entityId as string
    );

    ctx.response.status(200).json({
      ok: true,
      data: comments,
      meta: {
        total: count,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      },
    });
  }
}

/**
 * POST /api/collab/comments
 *
 * Create a new comment with optional file attachments.
 */
export class CreateCommentHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<EntityCommentService>(TOKENS.collabCommentService);
    const attachmentService = await ctx.container.resolve<AttachmentLinkService>(TOKENS.collabAttachmentService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const { entityType, entityId, commentText, attachmentIds } = ctx.request.body;

    if (!entityType || !entityId || !commentText) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required fields: entityType, entityId, commentText",
      });
      return;
    }

    try {
      // Create comment
      const comment = await service.create({
        tenantId: ctx.tenant.tenantId,
        entityType,
        entityId,
        commenterId: userId,
        commentText,
        createdBy: userId,
      });

      // Link attachments if provided
      if (attachmentIds && Array.isArray(attachmentIds) && attachmentIds.length > 0) {
        for (const attachmentId of attachmentIds) {
          await attachmentService.linkToComment(
            ctx.tenant.tenantId,
            attachmentId,
            "entity_comment",
            comment.id
          );
        }
      }

      ctx.response.status(201).json({ ok: true, data: comment });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to create comment",
      });
    }
  }
}

/**
 * PATCH /api/collab/comments/:id
 *
 * Update a comment.
 */
export class UpdateCommentHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<EntityCommentService>(TOKENS.collabCommentService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const commentId = ctx.request.params.id;
    const { commentText } = ctx.request.body;

    if (!commentText) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required field: commentText",
      });
      return;
    }

    try {
      // Check if user has COMMENT_MODERATE permission (future: integrate with PolicyGate)
      const isModerator = ctx.auth.persona === "admin" || ctx.auth.persona === "super_admin";

      const comment = await service.update(
        ctx.tenant.tenantId,
        commentId,
        userId,
        { commentText, updatedBy: userId },
        isModerator
      );

      ctx.response.status(200).json({ ok: true, data: comment });
    } catch (err) {
      const statusCode = err instanceof Error && err.message.includes("only edit your own") ? 403 : 400;
      ctx.response.status(statusCode).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to update comment",
      });
    }
  }
}

/**
 * DELETE /api/collab/comments/:id
 *
 * Delete a comment (soft delete).
 */
export class DeleteCommentHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<EntityCommentService>(TOKENS.collabCommentService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const commentId = ctx.request.params.id;

    try {
      // Check if user has COMMENT_MODERATE permission (future: integrate with PolicyGate)
      const isModerator = ctx.auth.persona === "admin" || ctx.auth.persona === "super_admin";

      await service.delete(ctx.tenant.tenantId, commentId, userId, isModerator);

      ctx.response.status(200).json({ ok: true });
    } catch (err) {
      const statusCode = err instanceof Error && err.message.includes("only delete your own") ? 403 : 400;
      ctx.response.status(statusCode).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to delete comment",
      });
    }
  }
}

/**
 * GET /api/collab/approval-comments/:instanceId
 *
 * List comments for an approval instance.
 */
export class ListApprovalCommentsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ApprovalCommentService>(TOKENS.collabApprovalCommentService);
    const approvalInstanceId = ctx.request.params.instanceId;
    const { limit, offset, taskId } = ctx.request.query;

    if (!approvalInstanceId) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required parameter: instanceId",
      });
      return;
    }

    const comments = await service.listByInstance(
      ctx.tenant.tenantId,
      approvalInstanceId,
      {
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
        taskId: taskId as string | undefined,
      }
    );

    const count = await service.countByInstance(
      ctx.tenant.tenantId,
      approvalInstanceId
    );

    ctx.response.status(200).json({
      ok: true,
      data: comments,
      meta: {
        total: count,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      },
    });
  }
}

/**
 * POST /api/collab/approval-comments
 *
 * Create a new approval comment with optional file attachments.
 */
export class CreateApprovalCommentHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ApprovalCommentService>(TOKENS.collabApprovalCommentService);
    const attachmentService = await ctx.container.resolve<AttachmentLinkService>(TOKENS.collabAttachmentService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const { approvalInstanceId, approvalTaskId, commentText, attachmentIds } = ctx.request.body;

    if (!approvalInstanceId || !commentText) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required fields: approvalInstanceId, commentText",
      });
      return;
    }

    try {
      // Create comment
      const comment = await service.create({
        tenantId: ctx.tenant.tenantId,
        approvalInstanceId,
        approvalTaskId,
        commenterId: userId,
        commentText,
        createdBy: userId,
      });

      // Link attachments if provided
      if (attachmentIds && Array.isArray(attachmentIds) && attachmentIds.length > 0) {
        for (const attachmentId of attachmentIds) {
          await attachmentService.linkToComment(
            ctx.tenant.tenantId,
            attachmentId,
            "approval_comment",
            comment.id
          );
        }
      }

      ctx.response.status(201).json({ ok: true, data: comment });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to create approval comment",
      });
    }
  }
}

/**
 * POST /api/collab/comments/:id/replies
 *
 * Create a reply to a comment (Phase 6: Threading)
 */
export class CreateReplyHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<EntityCommentService>(TOKENS.collabCommentService);
    const attachmentService = await ctx.container.resolve<AttachmentLinkService>(TOKENS.collabAttachmentService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const parentCommentId = ctx.request.params.id;
    const { entityType, entityId, commentText, attachmentIds } = ctx.request.body;

    if (!entityType || !entityId || !commentText) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required fields: entityType, entityId, commentText",
      });
      return;
    }

    try {
      // Create reply
      const reply = await service.createReply({
        tenantId: ctx.tenant.tenantId,
        entityType,
        entityId,
        commenterId: userId,
        commentText,
        createdBy: userId,
        parentCommentId,
      });

      // Link attachments if provided
      if (attachmentIds && Array.isArray(attachmentIds) && attachmentIds.length > 0) {
        for (const attachmentId of attachmentIds) {
          await attachmentService.linkToComment(
            ctx.tenant.tenantId,
            attachmentId,
            "entity_comment",
            reply.id
          );
        }
      }

      ctx.response.status(201).json({ ok: true, data: reply });
    } catch (err) {
      const statusCode = err instanceof Error && err.message.includes("depth") ? 400 : 400;
      ctx.response.status(statusCode).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to create reply",
      });
    }
  }
}

/**
 * GET /api/collab/comments/:id/replies
 *
 * List replies for a comment (Phase 6: Threading)
 */
export class ListRepliesHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<EntityCommentService>(TOKENS.collabCommentService);
    const parentCommentId = ctx.request.params.id;
    const { limit, offset } = ctx.request.query;

    try {
      const replies = await service.listReplies(
        ctx.tenant.tenantId,
        parentCommentId,
        {
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        }
      );

      const count = await service.countReplies(ctx.tenant.tenantId, parentCommentId);

      ctx.response.status(200).json({
        ok: true,
        data: replies,
        meta: {
          total: count,
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        },
      });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to list replies",
      });
    }
  }
}

/**
 * GET /api/collab/search
 *
 * Search comments by text query (Phase 7: Search)
 */
export class SearchCommentsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentSearchService>(TOKENS.collabSearchService);
    const { q, entityType, entityId, commenterId, limit, offset } = ctx.request.query;

    if (!q || typeof q !== "string") {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required parameter: q (search query)",
      });
      return;
    }

    try {
      const result = await service.searchComments(ctx.tenant.tenantId, q, {
        entityType: entityType as string | undefined,
        entityId: entityId as string | undefined,
        commenterId: commenterId as string | undefined,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      });

      ctx.response.status(200).json({
        ok: true,
        data: result.comments,
        meta: {
          total: result.total,
          query: result.query,
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        },
      });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to search comments",
      });
    }
  }
}

// ============================================================================
// Phase 3: Moderation & Flagging Handlers
// ============================================================================

/**
 * POST /api/collab/flags
 *
 * Flag a comment as inappropriate.
 */
export class FlagCommentHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentModerationService>(TOKENS.collabModerationService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const { commentId, flagReason, flagDetails } = ctx.request.body;

    if (!commentId || !flagReason) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required fields: commentId, flagReason",
      });
      return;
    }

    try {
      const flag = await service.flagComment({
        tenantId: ctx.tenant.tenantId,
        commentType: "entity_comment",
        commentId,
        flaggerUserId: userId,
        flagReason,
        flagDetails,
      });

      ctx.response.status(201).json({ ok: true, data: flag });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to flag comment",
      });
    }
  }
}

/**
 * GET /api/collab/moderation/flags
 *
 * List pending flags for moderation queue.
 */
export class ListFlagsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentModerationService>(TOKENS.collabModerationService);
    const { limit, offset } = ctx.request.query;

    try {
      const flags = await service.getPendingFlags(
        ctx.tenant.tenantId,
        limit ? Number(limit) : 50,
        offset ? Number(offset) : 0,
      );

      ctx.response.status(200).json({ ok: true, data: flags });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch flags",
      });
    }
  }
}

/**
 * POST /api/collab/moderation/flags/:id/review
 *
 * Review a flag (dismiss, hide comment, or delete comment).
 */
export class ReviewFlagHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentModerationService>(TOKENS.collabModerationService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const flagId = ctx.request.params.id;
    const { action } = ctx.request.body;

    if (!action || !["dismiss", "hide_comment", "delete_comment"].includes(action)) {
      ctx.response.status(400).json({
        ok: false,
        error: "Invalid action. Must be: dismiss, hide_comment, or delete_comment",
      });
      return;
    }

    try {
      await service.reviewFlag(
        ctx.tenant.tenantId,
        flagId,
        {
          action: action as "dismiss" | "hide_comment" | "delete_comment",
          reviewedBy: userId,
          resolution: action,
        }
      );

      ctx.response.status(200).json({ ok: true });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to review flag",
      });
    }
  }
}

// ============================================================================
// Phase 3: SLA Tracking Handlers
// ============================================================================

/**
 * GET /api/collab/sla/metrics
 *
 * Get SLA metrics for an entity.
 */
export class GetSLAMetricsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentSLAService>(TOKENS.collabSLAService);
    const { entityType, entityId } = ctx.request.query;

    if (!entityType || !entityId) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required parameters: entityType and entityId",
      });
      return;
    }

    try {
      const metrics = await service.getSLAMetrics(
        ctx.tenant.tenantId,
        entityType as string,
        entityId as string
      );

      ctx.response.status(200).json({ ok: true, data: metrics });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch SLA metrics",
      });
    }
  }
}

/**
 * GET /api/collab/sla/breaches
 *
 * Get SLA breaches for reporting.
 */
export class GetSLABreachesHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentSLAService>(TOKENS.collabSLAService);
    const { entityType, limit } = ctx.request.query;

    try {
      const breaches = await service.getSLABreaches(
        ctx.tenant.tenantId,
        entityType as string | undefined,
        limit ? Number(limit) : 50
      );

      ctx.response.status(200).json({ ok: true, data: breaches });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch SLA breaches",
      });
    }
  }
}

/**
 * POST /api/collab/sla/config
 *
 * Set SLA configuration for an entity type.
 */
export class SetSLAConfigHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentSLAService>(TOKENS.collabSLAService);
    const { entityType, slaTargetSeconds, businessHoursOnly } = ctx.request.body;

    if (!entityType || !slaTargetSeconds) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required fields: entityType, slaTargetSeconds",
      });
      return;
    }

    try {
      await service.setSLAConfig(
        ctx.tenant.tenantId,
        entityType,
        slaTargetSeconds,
        { businessHoursOnly }
      );

      ctx.response.status(200).json({ ok: true });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to set SLA config",
      });
    }
  }
}

// ============================================================================
// Phase 3: Analytics Handlers
// ============================================================================

/**
 * GET /api/collab/analytics/summary
 *
 * Get analytics summary for a date range.
 */
export class GetAnalyticsSummaryHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentAnalyticsService>(TOKENS.collabAnalyticsService);
    const { startDate, endDate } = ctx.request.query;

    if (!startDate || !endDate) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required parameters: startDate and endDate",
      });
      return;
    }

    try {
      const summary = await service.getAnalyticsSummary(
        ctx.tenant.tenantId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      ctx.response.status(200).json({ ok: true, data: summary });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch analytics summary",
      });
    }
  }
}

/**
 * GET /api/collab/analytics/daily
 *
 * Get daily analytics data.
 */
export class GetDailyAnalyticsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentAnalyticsService>(TOKENS.collabAnalyticsService);
    const { startDate, endDate, entityType } = ctx.request.query;

    if (!startDate || !endDate) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required parameters: startDate and endDate",
      });
      return;
    }

    try {
      const analytics = await service.getDailyAnalytics(
        ctx.tenant.tenantId,
        new Date(startDate as string),
        new Date(endDate as string),
        entityType as string | undefined
      );

      ctx.response.status(200).json({ ok: true, data: analytics });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch daily analytics",
      });
    }
  }
}

/**
 * GET /api/collab/analytics/leaderboard
 *
 * Get user engagement leaderboard.
 */
export class GetEngagementLeaderboardHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentAnalyticsService>(TOKENS.collabAnalyticsService);
    const { startDate, endDate, limit } = ctx.request.query;

    if (!startDate || !endDate) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required parameters: startDate and endDate",
      });
      return;
    }

    try {
      const leaderboard = await service.getUserEngagementLeaderboard(
        ctx.tenant.tenantId,
        new Date(startDate as string),
        new Date(endDate as string),
        limit ? Number(limit) : 10
      );

      ctx.response.status(200).json({ ok: true, data: leaderboard });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch leaderboard",
      });
    }
  }
}

/**
 * GET /api/collab/analytics/threads
 *
 * Get most active threads.
 */
export class GetActiveThreadsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentAnalyticsService>(TOKENS.collabAnalyticsService);
    const { entityType, limit, activeOnly } = ctx.request.query;

    try {
      const threads = await service.getMostActiveThreads(
        ctx.tenant.tenantId,
        entityType as string | undefined,
        limit ? Number(limit) : 10,
        activeOnly !== "false"
      );

      ctx.response.status(200).json({ ok: true, data: threads });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch active threads",
      });
    }
  }
}

// ============================================================================
// Phase 3: Retention Policy Handlers
// ============================================================================

/**
 * GET /api/collab/retention/policies
 *
 * List retention policies.
 */
export class ListRetentionPoliciesHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentRetentionService>(TOKENS.collabRetentionService);

    try {
      const policies = await service.listPolicies(ctx.tenant.tenantId);

      ctx.response.status(200).json({ ok: true, data: policies });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch retention policies",
      });
    }
  }
}

/**
 * POST /api/collab/retention/policies
 *
 * Create a retention policy.
 */
export class CreateRetentionPolicyHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentRetentionService>(TOKENS.collabRetentionService);
    const { policyName, entityType, retentionDays, action } = ctx.request.body;

    if (!policyName || !retentionDays || !action) {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required fields: policyName, retentionDays, action",
      });
      return;
    }

    try {
      const policy = await service.setRetentionPolicy(
        ctx.tenant.tenantId,
        policyName,
        retentionDays,
        action,
        entityType
      );

      ctx.response.status(201).json({ ok: true, data: policy });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to create retention policy",
      });
    }
  }
}

/**
 * PATCH /api/collab/retention/policies/:id
 *
 * Update a retention policy.
 */
export class UpdateRetentionPolicyHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentRetentionService>(TOKENS.collabRetentionService);
    const policyId = ctx.request.params.id;
    const { enabled } = ctx.request.body;

    if (typeof enabled !== "boolean") {
      ctx.response.status(400).json({
        ok: false,
        error: "Missing required field: enabled (boolean)",
      });
      return;
    }

    try {
      await service.updatePolicy(ctx.tenant.tenantId, policyId, { enabled });

      ctx.response.status(200).json({ ok: true });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to update retention policy",
      });
    }
  }
}

/**
 * DELETE /api/collab/retention/policies/:id
 *
 * Delete a retention policy.
 */
export class DeleteRetentionPolicyHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentRetentionService>(TOKENS.collabRetentionService);
    const policyId = ctx.request.params.id;

    try {
      await service.deletePolicy(ctx.tenant.tenantId, policyId);

      ctx.response.status(200).json({ ok: true });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to delete retention policy",
      });
    }
  }
}

/**
 * GET /api/collab/retention/archived
 *
 * List archived comments.
 */
export class ListArchivedCommentsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentRetentionService>(TOKENS.collabRetentionService);
    const { limit, offset } = ctx.request.query;

    try {
      const comments = await service.listArchivedComments(
        ctx.tenant.tenantId,
        {
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        }
      );

      ctx.response.status(200).json({ ok: true, data: comments });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch archived comments",
      });
    }
  }
}

/**
 * POST /api/collab/retention/archived/:id/restore
 *
 * Restore an archived comment.
 */
export class RestoreArchivedCommentHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<CommentRetentionService>(TOKENS.collabRetentionService);
    const userId = ctx.auth.userId || ctx.auth.subject;

    if (!userId) {
      ctx.response.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }

    const commentId = ctx.request.params.id;

    try {
      await service.restoreArchivedComment(
        ctx.tenant.tenantId,
        commentId,
        userId
      );

      ctx.response.status(200).json({ ok: true });
    } catch (err) {
      ctx.response.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to restore comment",
      });
    }
  }
}
