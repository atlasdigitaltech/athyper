/**
 * Finance Module — Period Close Phase 3 HTTP Handlers
 *
 * RouteHandler implementations for:
 *   - Waiver request/approve/reject/status (4 endpoints)
 *   - Task assignment + bulk (2 endpoints)
 *   - Timeline (2 endpoints)
 *   - Handler recheck (1 endpoint)
 */

import type {
  HttpHandlerContext,
  RouteHandler,
} from "../../../../platform/foundation/http/types.js";
import type { OperationContext } from "../../../engines/shared/engine-base.js";
import type { PeriodCloseService } from "../../../engines/posting-engine/services/period-close-service.js";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const CLOSE_TOKEN = "fin.accounting.periodCloseService";

function buildOpCtx(ctx: HttpHandlerContext, req: Request): OperationContext {
  return {
    tenantId: ctx.tenant.realmKey,
    actorId: ctx.auth.userId ?? "system",
    actorType: "USER" as const,
    correlationId: ctx.request.requestId,
    entityCode: (req.query.entityCode as string) ?? ctx.tenant.orgKey ?? "",
  };
}

function mapPhase3ErrorStatus(code: string): number {
  switch (code) {
    // Not found
    case "CHECKLIST_ITEM_NOT_FOUND":
    case "TASK_NOT_FOUND":
      return 404;
    // Malformed input
    case "MISSING_REASON":
      return 400;
    // Authorization
    case "WAIVER_DENIED":
    case "ASSIGNMENT_DENIED":
      return 403;
    // State conflict
    case "INVALID_WAIVER_STATE":
      return 409;
    // Business rule
    case "APPROVAL_NOT_CONFIGURED":
    case "APPROVAL_CREATION_FAILED":
      return 422;
    default:
      return 500;
  }
}

function parsePeriodParams(req: Request): {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
} {
  return {
    entityCode: (req.query.entityCode as string) ?? "",
    fiscalYear: parseInt(req.params.fiscalYear ?? req.query.fiscalYear as string, 10),
    periodNumber: parseInt(req.params.periodNumber ?? req.query.periodNumber as string, 10),
  };
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fy/:pn/tasks/:taskCode/waiver/request
// ---------------------------------------------------------------------------

export class RequestTaskWaiverHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { taskCode } = req.params;

      if (!req.body.reason) {
        res.status(400).json({ error: { code: "MISSING_REASON", message: "reason is required" } });
        return;
      }

      const result = await service.requestTaskWaiver(
        opCtx, entityCode, fiscalYear, periodNumber, taskCode,
        {
          reason: req.body.reason,
          evidencePayload: req.body.evidencePayload,
        },
      );
      if (!result.ok) {
        res.status(mapPhase3ErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/waiver/:checklistId/approve
// ---------------------------------------------------------------------------

export class ApproveTaskWaiverHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { checklistId } = req.params;

      const result = await service.approveTaskWaiver(opCtx, checklistId);
      if (!result.ok) {
        res.status(mapPhase3ErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/waiver/:checklistId/reject
// ---------------------------------------------------------------------------

export class RejectTaskWaiverHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { checklistId } = req.params;

      const result = await service.rejectTaskWaiver(opCtx, checklistId);
      if (!result.ok) {
        res.status(mapPhase3ErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/fin/period-close/waiver/:checklistId
// ---------------------------------------------------------------------------

export class GetWaiverStatusHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { checklistId } = req.params;

      const result = await service.getWaiverStatus(opCtx, checklistId);
      if (!result.ok) {
        res.status(mapPhase3ErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fy/:pn/tasks/:taskCode/assign
// ---------------------------------------------------------------------------

export class AssignTaskHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { taskCode } = req.params;

      const result = await service.assignTask(
        opCtx, entityCode, fiscalYear, periodNumber, taskCode,
        {
          assignedRole: req.body.assignedRole ?? null,
          assignedUserId: req.body.assignedUserId ?? null,
          assignedGroupId: req.body.assignedGroupId ?? null,
          dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null,
        },
      );
      if (!result.ok) {
        res.status(mapPhase3ErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fy/:pn/tasks/assign/bulk
// ---------------------------------------------------------------------------

export class BulkAssignTasksHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);

      if (!Array.isArray(req.body.assignments)) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "assignments array is required" } });
        return;
      }

      const result = await service.bulkAssignTasks(opCtx, req.body.assignments);
      if (!result.ok) {
        res.status(mapPhase3ErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/fin/period-close/:fy/:pn/timeline
// ---------------------------------------------------------------------------

export class GetTimelineHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);

      const result = await service.getTimeline(
        opCtx, entityCode, fiscalYear, periodNumber,
        {
          limit: parseInt(req.query.limit as string, 10) || 50,
          offset: parseInt(req.query.offset as string, 10) || 0,
        },
      );
      if (!result.ok) {
        res.status(500).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/fin/period-close/tasks/:checklistId/timeline
// ---------------------------------------------------------------------------

export class GetTaskTimelineHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { checklistId } = req.params;

      const result = await service.getTaskTimeline(
        opCtx, checklistId,
        {
          limit: parseInt(req.query.limit as string, 10) || 50,
          offset: parseInt(req.query.offset as string, 10) || 0,
        },
      );
      if (!result.ok) {
        res.status(500).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fy/:pn/gate/:targetStatus/recheck
// ---------------------------------------------------------------------------

export class RecheckGateHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const targetStatus = req.params.targetStatus as "SOFT_CLOSE" | "HARD_CLOSE";

      if (targetStatus !== "SOFT_CLOSE" && targetStatus !== "HARD_CLOSE") {
        res.status(400).json({
          error: { code: "INVALID_TARGET", message: "targetStatus must be SOFT_CLOSE or HARD_CLOSE" },
        });
        return;
      }

      const result = await service.recheckTransitionTasks(
        opCtx, entityCode, fiscalYear, periodNumber, targetStatus,
      );
      if (!result.ok) {
        res.status(500).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
