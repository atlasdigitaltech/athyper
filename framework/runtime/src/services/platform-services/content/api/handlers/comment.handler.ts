/**
 * Comment API Handlers
 *
 * Routes:
 * - GET /api/content/comments/:attachmentId
 * - POST /api/content/comments
 * - PUT /api/content/comments/:id
 * - DELETE /api/content/comments/:id
 * - POST /api/content/comments/:id/reply
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  HttpHandlerContext,
  RouteHandler,
} from "../../../../platform/foundation/http/types.js";
import type { CommentService } from "../../domain/services/CommentService.js";
import type { Request, Response } from "express";

/**
 * List comments for attachment
 * GET /api/content/comments/:attachmentId?includeDeleted=false
 */
export class ListCommentsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const commentService = await ctx.container.resolve<CommentService>(
        TOKENS.commentService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const attachmentId = req.params.attachmentId;
      const includeDeleted = req.query.includeDeleted === "true";

      if (!attachmentId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "attachmentId required" },
        });
        return;
      }

      const comments = await commentService.listComments({
        tenantId,
        attachmentId,
        includeDeleted,
      });

      res.status(200).json({
        success: true,
        data: { comments },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}

/**
 * Create comment
 * POST /api/content/comments
 * Body: { attachmentId, content, mentions?, parentId? }
 */
export class CreateCommentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const commentService = await ctx.container.resolve<CommentService>(
        TOKENS.commentService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";

      const { attachmentId, content, mentions, parentId } = req.body as {
        attachmentId?: string;
        content?: string;
        mentions?: string[];
        parentId?: string;
      };

      if (!attachmentId || !content) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "attachmentId and content required",
          },
        });
        return;
      }

      const comment = await commentService.createComment({
        tenantId,
        attachmentId,
        actorId,
        content,
        mentions,
        parentId,
      });

      res.status(201).json({
        success: true,
        data: { comment },
      });
    } catch (error: any) {
      const statusCode = error.message.includes("not found") ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}

/**
 * Update comment
 * PUT /api/content/comments/:id
 * Body: { content, mentions? }
 */
export class UpdateCommentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const commentService = await ctx.container.resolve<CommentService>(
        TOKENS.commentService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";
      const commentId = req.params.id;

      const { content, mentions } = req.body as {
        content?: string;
        mentions?: string[];
      };

      if (!commentId || !content) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "commentId and content required",
          },
        });
        return;
      }

      const comment = await commentService.updateComment({
        commentId,
        tenantId,
        actorId,
        content,
        mentions,
      });

      res.status(200).json({
        success: true,
        data: { comment },
      });
    } catch (error: any) {
      const statusCode = error.message.includes("not found") ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}

/**
 * Delete comment
 * DELETE /api/content/comments/:id
 */
export class DeleteCommentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const commentService = await ctx.container.resolve<CommentService>(
        TOKENS.commentService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";
      const commentId = req.params.id;

      if (!commentId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "commentId required" },
        });
        return;
      }

      await commentService.deleteComment({
        commentId,
        tenantId,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: { commentId },
      });
    } catch (error: any) {
      const statusCode = error.message.includes("not found") ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}

/**
 * Reply to comment
 * POST /api/content/comments/:id/reply
 * Body: { content, mentions? }
 */
export class ReplyToCommentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const commentService = await ctx.container.resolve<CommentService>(
        TOKENS.commentService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";
      const parentId = req.params.id;

      const { content, mentions } = req.body as {
        content?: string;
        mentions?: string[];
      };

      if (!parentId || !content) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "parentId and content required",
          },
        });
        return;
      }

      // Get parent comment to get attachmentId
      const parent = await commentService.getCommentById(parentId, tenantId);
      if (!parent) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Parent comment not found" },
        });
        return;
      }

      const comment = await commentService.replyToComment({
        tenantId,
        attachmentId: parent.attachmentId,
        actorId,
        content,
        mentions,
        parentId,
      });

      res.status(201).json({
        success: true,
        data: { comment },
      });
    } catch (error: any) {
      const statusCode = error.message.includes("not found") ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}
