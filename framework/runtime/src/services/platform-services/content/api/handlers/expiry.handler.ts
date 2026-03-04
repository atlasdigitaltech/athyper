/**
 * Expiry API Handlers
 *
 * Routes:
 * - POST /api/content/expiry/set
 * - POST /api/content/expiry/clear
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  HttpHandlerContext,
  RouteHandler,
} from "../../../../platform/foundation/http/types.js";
import type { ExpiryService } from "../../domain/services/ExpiryService.js";
import type { Request, Response } from "express";

/**
 * Set expiration on attachment
 * POST /api/content/expiry/set
 * Body: { attachmentId, expiresAt } OR { attachmentId, ttlSeconds }
 */
export class SetExpirationHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const expiryService = await ctx.container.resolve<ExpiryService>(
        TOKENS.expiryService,
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";

      const { attachmentId, expiresAt, ttlSeconds } = req.body as {
        attachmentId?: string;
        expiresAt?: string;
        ttlSeconds?: number;
      };

      if (!attachmentId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "attachmentId required" },
        });
        return;
      }

      if (!expiresAt && !ttlSeconds) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Either expiresAt or ttlSeconds required",
          },
        });
        return;
      }

      let result;

      if (ttlSeconds) {
        // Use TTL
        result = await expiryService.setExpirationFromTtl(
          tenantId,
          attachmentId,
          ttlSeconds,
          actorId,
        );
      } else {
        // Use explicit date
        result = await expiryService.setExpiration({
          tenantId,
          attachmentId,
          expiresAt: new Date(expiresAt!),
          actorId,
        });
      }

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

/**
 * Clear expiration (make file permanent)
 * POST /api/content/expiry/clear
 * Body: { attachmentId }
 */
export class ClearExpirationHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const expiryService = await ctx.container.resolve<ExpiryService>(
        TOKENS.expiryService,
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

      const result = await expiryService.clearExpiration({
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
