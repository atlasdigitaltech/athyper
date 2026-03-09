/**
 * Finance Module — Period Close Governance HTTP Handlers
 *
 * RouteHandler implementations for:
 *   - Checklist queries    (2 endpoints: list, progress)
 *   - Task operations      (5 endpoints: complete, waive, fail, block, execute)
 *   - Gate checks          (1 endpoint)
 *   - Period transition    (1 endpoint, gate-enforced)
 *   - Materialization      (1 endpoint)
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

function mapCloseErrorStatus(code: string): number {
  switch (code) {
    // Not found
    case "CHECKLIST_ITEM_NOT_FOUND":
    case "TASK_NOT_FOUND":
    case "PERIOD_NOT_FOUND":
      return 404;
    // Malformed input
    case "MISSING_REASON":
    case "MISSING_TARGET":
    case "INVALID_TARGET":
      return 400;
    // Unauthorized
    case "WAIVER_DENIED":
      return 403;
    // State conflict
    case "INVALID_TRANSITION":
      return 409;
    // Business rule violation
    case "NOT_SYSTEM_TASK":
    case "NO_HANDLER":
    case "GATE_DENIED":
      return 422;
    // Not implemented
    case "HANDLER_NOT_REGISTERED":
      return 501;
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
// GET /api/fin/period-close/:fiscalYear/:periodNumber/checklist
// ---------------------------------------------------------------------------

export class GetCloseChecklistHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);

      const result = await service.getChecklist(opCtx, entityCode, fiscalYear, periodNumber);
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/fin/period-close/:fiscalYear/:periodNumber/progress
// ---------------------------------------------------------------------------

export class GetCloseProgressHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);

      const result = await service.getProgress(opCtx, entityCode, fiscalYear, periodNumber);
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fiscalYear/:periodNumber/materialize
// ---------------------------------------------------------------------------

export class MaterializeChecklistHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const blueprint = req.body.blueprint as string | undefined;

      const result = await service.materializeChecklist(
        opCtx, entityCode, fiscalYear, periodNumber, blueprint,
      );
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/complete
// ---------------------------------------------------------------------------

export class CompleteTaskHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { taskCode } = req.params;

      const result = await service.completeTask(
        opCtx, entityCode, fiscalYear, periodNumber, taskCode,
        {
          completionNotes: req.body.completionNotes,
          evidencePayload: req.body.evidencePayload,
        },
      );
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/waive
// ---------------------------------------------------------------------------

export class WaiveTaskHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { taskCode } = req.params;

      if (!req.body.waiverReason) {
        res.status(400).json({ error: { code: "MISSING_REASON", message: "waiverReason is required" } });
        return;
      }

      const result = await service.waiveTask(
        opCtx, entityCode, fiscalYear, periodNumber, taskCode,
        {
          waiverReason: req.body.waiverReason,
          waiverApprovalRef: req.body.waiverApprovalRef,
        },
      );
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/fail
// ---------------------------------------------------------------------------

export class FailTaskHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { taskCode } = req.params;

      if (!req.body.failureReason) {
        res.status(400).json({ error: { code: "MISSING_REASON", message: "failureReason is required" } });
        return;
      }

      const result = await service.failTask(
        opCtx, entityCode, fiscalYear, periodNumber, taskCode,
        req.body.failureReason,
      );
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/block
// ---------------------------------------------------------------------------

export class BlockTaskHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { taskCode } = req.params;

      const result = await service.blockTask(
        opCtx, entityCode, fiscalYear, periodNumber, taskCode,
      );
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fiscalYear/:periodNumber/tasks/:taskCode/execute
// ---------------------------------------------------------------------------

export class ExecuteSystemHandlerTaskHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { taskCode } = req.params;

      const result = await service.executeSystemHandler(
        opCtx, entityCode, fiscalYear, periodNumber, taskCode,
      );
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/fin/period-close/:fiscalYear/:periodNumber/gate/:targetStatus
// ---------------------------------------------------------------------------

export class CheckGateHandler implements RouteHandler {
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

      const result = await service.checkTransitionGate(
        opCtx, entityCode, fiscalYear, periodNumber, targetStatus,
      );
      if (!result.ok) {
        res.status(mapCloseErrorStatus(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/fin/period-close/:fiscalYear/:periodNumber/transition
// ---------------------------------------------------------------------------

export class TransitionPeriodHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const service = await ctx.container.resolve<PeriodCloseService>(CLOSE_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { entityCode, fiscalYear, periodNumber } = parsePeriodParams(req);
      const { targetStatus } = req.body;

      if (!targetStatus) {
        res.status(400).json({
          error: { code: "MISSING_TARGET", message: "targetStatus is required in request body" },
        });
        return;
      }

      const result = await service.transitionPeriod(
        opCtx, entityCode, fiscalYear, periodNumber, targetStatus,
      );
      if (!result.ok) {
        // Gate denials return 422 with structured details
        const status = mapCloseErrorStatus(result.error.code);
        res.status(status).json({ error: result.error });
        return;
      }
      res.status(200).json(result.value);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
