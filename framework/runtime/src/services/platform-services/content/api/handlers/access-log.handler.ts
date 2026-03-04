/**
 * Access Log API Handlers
 *
 * Routes:
 * - GET /api/content/access/:attachmentId
 * - GET /api/content/access/:attachmentId/stats
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  HttpHandlerContext,
  RouteHandler,
} from "../../../../platform/foundation/http/types.js";
import type { AccessLogService } from "../../domain/services/AccessLogService.js";
import type { Request, Response } from "express";

/**
 * Get access history for attachment
 * GET /api/content/access/:attachmentId?limit=100
 */
export class GetAccessHistoryHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const accessLogService = await ctx.container.resolve<AccessLogService>(
        TOKENS.accessLogService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const attachmentId = req.params.attachmentId;
      const limit = parseInt(req.query.limit as string) || 100;

      if (!attachmentId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "attachmentId required" },
        });
        return;
      }

      const logs = await accessLogService.getAccessHistory(
        tenantId,
        attachmentId,
        { limit },
      );

      res.status(200).json({
        success: true,
        data: { logs, total: logs.length },
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
 * Get access statistics for attachment
 * GET /api/content/access/:attachmentId/stats?days=30
 */
export class GetAccessStatsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const accessLogService = await ctx.container.resolve<AccessLogService>(
        TOKENS.accessLogService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const attachmentId = req.params.attachmentId;
      const days = parseInt(req.query.days as string) || 30;

      if (!attachmentId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "attachmentId required" },
        });
        return;
      }

      const stats = await accessLogService.getAccessStats(
        tenantId,
        attachmentId,
      );

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}
