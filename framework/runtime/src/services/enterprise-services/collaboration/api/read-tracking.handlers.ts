/**
 * Read Tracking API Handlers
 *
 * HTTP handlers for comment read/unread status.
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { HttpHandlerContext } from "./handlers.js";
import type { ReadTrackingService } from "../domain/read-tracking.service.js";

/**
 * POST /api/collab/comments/:id/read
 *
 * Mark a comment as read.
 */
export class MarkCommentAsReadHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ReadTrackingService>(TOKENS.collabReadTrackingService);
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.auth.userId || ctx.auth.subject || "anonymous";
    const commentId = ctx.request.params.id;

    await service.markAsRead(tenantId, "entity_comment", commentId, userId);

    return {
      ok: true,
      message: "Comment marked as read",
    };
  }
}

/**
 * POST /api/collab/comments/mark-all-read
 *
 * Mark multiple comments as read (bulk operation).
 *
 * Body: { commentIds: string[] }
 */
export class MarkAllCommentsAsReadHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ReadTrackingService>(TOKENS.collabReadTrackingService);
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.auth.userId || ctx.auth.subject || "anonymous";
    const { commentIds } = ctx.request.body;

    if (!Array.isArray(commentIds)) {
      return {
        ok: false,
        error: "commentIds must be an array",
        status: 400,
      };
    }

    await service.markMultipleAsRead(tenantId, "entity_comment", commentIds, userId);

    return {
      ok: true,
      message: `${commentIds.length} comments marked as read`,
      count: commentIds.length,
    };
  }
}

/**
 * GET /api/collab/comments/unread-count
 *
 * Get count of unread comments for the current user.
 *
 * Query params:
 * - entityType (optional)
 * - entityId (optional)
 */
export class GetUnreadCountHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ReadTrackingService>(TOKENS.collabReadTrackingService);
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.auth.userId || ctx.auth.subject || "anonymous";
    const { entityType, entityId } = ctx.request.query;

    const count = await service.countUnread(
      tenantId,
      "entity_comment",
      userId,
      entityType as string | undefined,
      entityId as string | undefined
    );

    return {
      ok: true,
      data: {
        unreadCount: count,
      },
    };
  }
}
