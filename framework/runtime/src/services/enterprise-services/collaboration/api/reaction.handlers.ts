/**
 * Reaction API Handlers
 *
 * HTTP handlers for emoji reactions on comments.
 */

import { TOKENS } from "../../../../kernel/tokens.js";

import type { HttpHandlerContext } from "./handlers.js";
import type { ReactionService } from "../domain/reaction.service.js";
import type { ReactionType } from "../types.js";

/**
 * POST /api/collab/comments/:id/reactions
 *
 * Toggle a reaction on a comment.
 *
 * Body: { reactionType: ReactionType }
 */
export class ToggleReactionHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ReactionService>(TOKENS.collabReactionService);
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.auth.userId || ctx.auth.subject || "anonymous";
    const commentId = ctx.request.params.id;
    const { reactionType } = ctx.request.body;

    // Validate reaction type
    const validReactions: ReactionType[] = ['👍', '❤️', '🎉', '👀', '👎', '🚀', '💡', '🤔'];
    if (!validReactions.includes(reactionType)) {
      return {
        ok: false,
        error: "Invalid reaction type",
        status: 400,
      };
    }

    const result = await service.toggleReaction(
      tenantId,
      "entity_comment",
      commentId,
      userId,
      reactionType
    );

    return {
      ok: true,
      data: {
        action: result.action,
        reactionType,
      },
    };
  }
}

/**
 * GET /api/collab/comments/:id/reactions
 *
 * Get reaction summary for a comment.
 */
export class GetReactionsHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ReactionService>(TOKENS.collabReactionService);
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.auth.userId || ctx.auth.subject || "anonymous";
    const commentId = ctx.request.params.id;

    const reactions = await service.getReactions(
      tenantId,
      "entity_comment",
      commentId,
      userId
    );

    return {
      ok: true,
      data: reactions,
    };
  }
}

/**
 * POST /api/collab/approval-comments/:id/reactions
 *
 * Toggle a reaction on an approval comment.
 */
export class ToggleApprovalReactionHandler {
  async handle(ctx: HttpHandlerContext) {
    const service = await ctx.container.resolve<ReactionService>(TOKENS.collabReactionService);
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.auth.userId || ctx.auth.subject || "anonymous";
    const commentId = ctx.request.params.id;
    const { reactionType } = ctx.request.body;

    // Validate reaction type
    const validReactions: ReactionType[] = ['👍', '❤️', '🎉', '👀', '👎', '🚀', '💡', '🤔'];
    if (!validReactions.includes(reactionType)) {
      return {
        ok: false,
        error: "Invalid reaction type",
        status: 400,
      };
    }

    const result = await service.toggleReaction(
      tenantId,
      "approval_comment",
      commentId,
      userId,
      reactionType
    );

    return {
      ok: true,
      data: {
        action: result.action,
        reactionType,
      },
    };
  }
}
