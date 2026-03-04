/**
 * Entity Page Descriptor HTTP Handlers
 *
 * Handlers for entity page orchestration endpoints:
 * - GET  /api/entity-page/:entityName       — static descriptor (cacheable)
 * - GET  /api/entity-page/:entityName/:id   — dynamic descriptor (per-request)
 * - POST /api/entity-page/:entityName/:id/actions/:actionCode — execute action
 */

import { META_TOKENS } from "@athyper/core/meta";

import { TOKENS } from "../../../../kernel/tokens.js";

import type { RouteHandler, HttpHandlerContext } from "../../foundation/http/types.js";
import type {
  ActionDispatcher,
  EntityPageDescriptorService,
  RequestContext,
  ViewMode,
} from "@athyper/core/meta";
import type { Request, Response } from "express";

// ============================================================================
// Helper
// ============================================================================

function toMetaRequestContext(ctx: HttpHandlerContext): RequestContext {
  return {
    userId: ctx.auth.userId ?? ctx.auth.subject ?? "system",
    tenantId: ctx.tenant.tenantKey ?? "default",
    realmId: ctx.tenant.realmKey,
    roles: ctx.auth.roles,
  };
}

// ============================================================================
// Static Descriptor Handler
// ============================================================================

/**
 * GET /api/entity-page/:entityName
 *
 * Returns the static descriptor for an entity type.
 * Cacheable by compiledModelHash (returned in response).
 */
export class StaticDescriptorHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entityName } = req.params as { entityName: string };

    const descriptorService = await ctx.container.resolve<EntityPageDescriptorService>(
      META_TOKENS.descriptorService,
    );
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const descriptor = await descriptorService.describeStatic(entityName, metaCtx);

      // Set cache headers using compiledModelHash as ETag
      res.setHeader("ETag", `"${descriptor.compiledModelHash}"`);
      res.setHeader("Cache-Control", "private, max-age=300");

      res.status(200).json({
        success: true,
        data: descriptor,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entityName }, "Failed to compute static descriptor");

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity '${entityName}' not found`,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "DESCRIPTOR_ERROR",
          message: "Failed to compute entity page descriptor",
        },
      });
    }
  }
}

// ============================================================================
// Dynamic Descriptor Handler
// ============================================================================

/**
 * GET /api/entity-page/:entityName/:id
 *
 * Returns the dynamic descriptor for a specific entity instance.
 * Never cached — computed per-request.
 *
 * Query params:
 * - viewMode: "view" | "edit" | "create" (default: "view")
 */
export class DynamicDescriptorHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entityName, id } = req.params as { entityName: string; id: string };
    const { viewMode } = req.query as { viewMode?: ViewMode };

    const descriptorService = await ctx.container.resolve<EntityPageDescriptorService>(
      META_TOKENS.descriptorService,
    );
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const descriptor = await descriptorService.describeDynamic(
        entityName,
        id,
        metaCtx,
        viewMode,
      );

      // No caching for dynamic descriptor
      res.setHeader("Cache-Control", "no-store");

      res.status(200).json({
        success: true,
        data: descriptor,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entityName, id }, "Failed to compute dynamic descriptor");

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity '${entityName}' or record '${id}' not found`,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "DESCRIPTOR_ERROR",
          message: "Failed to compute entity page descriptor",
        },
      });
    }
  }
}

// ============================================================================
// Action Execution Handler
// ============================================================================

/**
 * POST /api/entity-page/:entityName/:id/actions/:actionCode
 *
 * Executes an action on an entity instance.
 * The action is dispatched to the correct backend service based on the action code.
 *
 * Body: { payload?: Record<string, unknown> }
 */
export class ActionExecutionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entityName, id, actionCode } = req.params as {
      entityName: string;
      id: string;
      actionCode: string;
    };
    const payload = req.body?.payload as Record<string, unknown> | undefined;

    const actionDispatcher = await ctx.container.resolve<ActionDispatcher>(
      META_TOKENS.actionDispatcher,
    );
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const result = await actionDispatcher.execute(
        {
          actionCode,
          entityName,
          entityId: id,
          payload,
        },
        metaCtx,
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result,
        });
      } else {
        // Map reason codes to HTTP status
        const statusCode = this.getStatusCode(result.error?.reasonCode);
        res.status(statusCode).json({
          success: false,
          data: result,
        });
      }
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entityName, id, actionCode }, "Failed to execute action");

      res.status(500).json({
        success: false,
        error: {
          code: "ACTION_ERROR",
          message: "Failed to execute action",
        },
      });
    }
  }

  private getStatusCode(reasonCode?: string): number {
    switch (reasonCode) {
      case "policy_denied":
        return 403;
      case "not_found":
        return 404;
      case "validation_failed":
        return 400;
      case "terminal_state":
      case "approval_pending":
      case "approval_rejected":
      case "approval_canceled":
        return 409; // Conflict
      default:
        return 400;
    }
  }
}
