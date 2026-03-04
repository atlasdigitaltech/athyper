/**
 * Lifecycle REST API HTTP Handlers
 *
 * Handlers for lifecycle state transitions, state queries, and history.
 */

import { META_TOKENS } from "@athyper/core/meta";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../foundation/http/types.js";
import type {
  GenericDataAPI,
  LifecycleManager,
  RequestContext,
} from "@athyper/core/meta";
import type { Request, Response } from "express";

// ============================================================================
// Helper Functions
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
// Transition Execution Handler
// ============================================================================

/**
 * POST /api/data/:entity/:id/transition/:operationCode
 *
 * Executes a lifecycle state transition.
 * Validates gates (RBAC, approval, threshold, conditions) before executing.
 */
export class TransitionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id, operationCode } = req.params as {
      entity: string;
      id: string;
      operationCode: string;
    };

    const lifecycleManager = await ctx.container.resolve<LifecycleManager>(
      META_TOKENS.lifecycleManager
    );
    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      // Fetch entity record for gate evaluation (record data needed for threshold/condition checks)
      const record = await dataAPI.get(entity, id, metaCtx);

      // Execute transition
      const result = await lifecycleManager.transition({
        entityName: entity,
        entityId: id,
        operationCode,
        payload: req.body,
        ctx: metaCtx,
      });

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            newStateId: result.newStateId,
            newStateCode: result.newStateCode,
            eventId: result.eventId,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: "TRANSITION_FAILED",
            message: result.error ?? result.reason ?? "Transition failed",
            details: { reason: result.reason },
          },
        });
      }
    } catch (error) {
      console.error(JSON.stringify({
        msg: "lifecycle_transition_handler_error",
        entity,
        id,
        operationCode,
        error: String(error),
      }));

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to execute transition",
          details: { error: String(error) },
        },
      });
    }
  }
}

// ============================================================================
// State Query Handler
// ============================================================================

/**
 * GET /api/data/:entity/:id/lifecycle
 *
 * Returns current lifecycle state and available transitions for an entity record.
 */
export class StateQueryHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id } = req.params as { entity: string; id: string };

    const lifecycleManager = await ctx.container.resolve<LifecycleManager>(
      META_TOKENS.lifecycleManager
    );
    const metaCtx = toMetaRequestContext(ctx);

    try {
      // Get current state
      const currentState = await lifecycleManager.getCurrentState(
        entity,
        id,
        metaCtx.tenantId
      );

      // Get available transitions
      const availableTransitions = await lifecycleManager.getAvailableTransitions(
        entity,
        id,
        metaCtx
      );

      res.status(200).json({
        success: true,
        data: {
          state: {
            id: currentState.state.id,
            code: currentState.state.code,
            name: currentState.state.name,
            isTerminal: currentState.state.isTerminal,
            sortOrder: currentState.state.sortOrder,
          },
          instance: {
            id: currentState.instance.id,
            lifecycleId: currentState.instance.lifecycleId,
            stateId: currentState.instance.stateId,
            updatedAt: currentState.instance.updatedAt,
            updatedBy: currentState.instance.updatedBy,
          },
          availableTransitions: availableTransitions.map((t) => ({
            transitionId: t.transitionId,
            operationCode: t.operationCode,
            toStateId: t.toStateId,
            toStateCode: t.toStateCode,
            authorized: t.authorized,
            unauthorizedReason: t.unauthorizedReason,
            requiresApproval: t.requiresApproval,
            approvalTemplateId: t.approvalTemplateId,
          })),
        },
      });
    } catch (error) {
      console.error(JSON.stringify({
        msg: "lifecycle_state_query_handler_error",
        entity,
        id,
        error: String(error),
      }));

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to query lifecycle state",
          details: { error: String(error) },
        },
      });
    }
  }
}

// ============================================================================
// History Query Handler
// ============================================================================

/**
 * GET /api/data/:entity/:id/lifecycle/history
 *
 * Returns paginated lifecycle event history for an entity record.
 */
export class HistoryHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id } = req.params as { entity: string; id: string };
    const { page, pageSize } = req.query as {
      page?: string;
      pageSize?: string;
    };

    const lifecycleManager = await ctx.container.resolve<LifecycleManager>(
      META_TOKENS.lifecycleManager
    );
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const parsedPage = page ? parseInt(page, 10) : 1;
      const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 50;

      // Validate pagination
      if (parsedPage < 1) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PAGE",
            message: "Page must be >= 1",
          },
        });
        return;
      }

      if (parsedPageSize < 1 || parsedPageSize > 100) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PAGE_SIZE",
            message: "Page size must be between 1 and 100",
          },
        });
        return;
      }

      // Get history
      const history = await lifecycleManager.getHistory(entity, id, {
        page: parsedPage,
        pageSize: parsedPageSize,
      });

      res.status(200).json({
        success: true,
        data: history.data,
        meta: history.meta,
      });
    } catch (error) {
      console.error(JSON.stringify({
        msg: "lifecycle_history_handler_error",
        entity,
        id,
        error: String(error),
      }));

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to query lifecycle history",
          details: { error: String(error) },
        },
      });
    }
  }
}
