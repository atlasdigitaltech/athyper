/**
 * Preview API Handlers
 *
 * Routes:
 * - GET /api/content/preview/:attachmentId?type=thumbnail|preview
 * - POST /api/content/preview/generate
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type { HttpHandlerContext, RouteHandler } from "../../../../platform/foundation/http/types.js";
import type { PreviewService } from "../../domain/services/PreviewService.js";
import type { Request, Response } from "express";


/**
 * Get preview/thumbnail URL
 * GET /api/content/preview/:attachmentId?type=thumbnail|preview
 */
export class GetPreviewUrlHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const previewService = await ctx.container.resolve<PreviewService>(
        TOKENS.previewService
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";
      const attachmentId = req.params.attachmentId;
      const type = (req.query.type as string) ?? "preview";

      if (!attachmentId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "attachmentId required" },
        });
        return;
      }

      if (type !== "thumbnail" && type !== "preview") {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "type must be 'thumbnail' or 'preview'",
          },
        });
        return;
      }

      const result = await previewService.getPreviewUrl({
        tenantId,
        attachmentId,
        type,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: result,
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
 * Generate preview/thumbnail for attachment
 * POST /api/content/preview/generate
 * Body: { attachmentId }
 */
export class GeneratePreviewHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const previewService = await ctx.container.resolve<PreviewService>(
        TOKENS.previewService
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";
      const { attachmentId } = req.body as { attachmentId?: string };

      if (!attachmentId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "attachmentId required" },
        });
        return;
      }

      const result = await previewService.generatePreview({
        tenantId,
        attachmentId,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: result,
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
