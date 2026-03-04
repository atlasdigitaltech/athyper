/**
 * Comment Events API Handlers
 *
 * SSE endpoint for real-time comment updates.
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { HttpHandlerContext } from "./handlers.js";
import type { CommentEventsService } from "../domain/comment-events.service.js";

/**
 * SSE Stream Handler
 *
 * Establishes SSE connection for real-time comment updates.
 *
 * GET /api/collab/events/stream?entityType=...&entityId=...
 */
export class CommentEventsStreamHandler {
  async handle(ctx: HttpHandlerContext) {
    const eventsService = await ctx.container.resolve<CommentEventsService>(
      TOKENS.collabEventsService
    );

    const { entityType, entityId } = ctx.request.query;
    const userId = ctx.auth.userId || ctx.auth.subject || "anonymous";

    // Register client and keep connection open
    const clientId = eventsService.registerClient(
      ctx.tenant.tenantId,
      userId,
      ctx.response,
      {
        entityType: entityType as string | undefined,
        entityId: entityId as string | undefined,
      }
    );

    // Connection will stay open until client disconnects
    // No response returned (SSE keeps connection alive)
  }
}

/**
 * Get Active Connections Handler
 *
 * Returns count of active SSE connections (for monitoring).
 *
 * GET /api/collab/events/stats
 */
export class CommentEventsStatsHandler {
  async handle(ctx: HttpHandlerContext) {
    const eventsService = await ctx.container.resolve<CommentEventsService>(
      TOKENS.collabEventsService
    );

    const { entityType, entityId } = ctx.request.query;

    let count: number;
    if (entityType && entityId) {
      count = eventsService.getEntityClientCount(
        ctx.tenant.tenantId,
        entityType as string,
        entityId as string
      );
    } else {
      count = eventsService.getClientCount();
    }

    return {
      ok: true,
      data: {
        activeConnections: count,
      },
    };
  }
}
