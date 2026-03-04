/**
 * Finance Module — Bank Reconciliation HTTP Handlers
 *
 * RouteHandler implementations for:
 *   - Bank Statement import + inquiry  (3 endpoints)
 *   - Reconciliation lifecycle          (6 endpoints)
 *
 * All handlers resolve services from the scoped DI container and delegate to
 * the corresponding service layer. Monetary values pass through as strings
 * (MC-4 compliant).
 */

import type { Request, Response } from "express";
import type { HttpHandlerContext, RouteHandler } from "../../../../platform/foundation/http/types.js";
import type { BankReconciliationService } from "../services/bank-reconciliation-service.js";
import type { OperationContext } from "../../../engines/shared/engine-base.js";
import type { StatementStatus } from "../domain/types.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildOpCtx(ctx: HttpHandlerContext, req: Request): OperationContext {
    return {
        tenantId: ctx.tenant.realmKey,
        actorId: ctx.auth.userId ?? "system",
        actorType: "USER" as const,
        correlationId: ctx.request.requestId,
        entityCode: (req.query.entityCode as string) ?? ctx.tenant.orgKey ?? "",
    };
}

function mapErrorStatus(code: string): number {
    switch (code) {
        case "NOT_FOUND":
            return 404;
        case "ALREADY_COMPLETED":
        case "ALREADY_MATCHED":
            return 409;
        case "SESSION_CLOSED":
        case "NOT_MATCHED":
        case "CONFIRMED":
            return 400;
        default:
            return 500;
    }
}

// ---------------------------------------------------------------------------
// Service token
// ---------------------------------------------------------------------------

const RECON_TOKEN = "fin.banking.bankReconciliationService";

// ---------------------------------------------------------------------------
// Bank Statement Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/fin/bank-statements
 *
 * Imports a new bank statement with embedded lines. Creates the statement
 * in IMPORTED status and bulk-inserts all lines as UNMATCHED.
 */
export class ImportStatementHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<BankReconciliationService>(RECON_TOKEN);
            const opCtx = buildOpCtx(ctx, req);

            const result = await service.importStatement(opCtx, {
                tenantId: opCtx.tenantId,
                entityCode: opCtx.entityCode ?? "",
                ...req.body,
            });

            if (!result.ok) {
                res.status(mapErrorStatus(result.error.code)).json({ error: result.error });
                return;
            }

            res.status(201).json(result.value);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * GET /api/fin/bank-statements
 *
 * Lists bank statements with optional filters: entityCode, bankAccountId, status.
 * Supports pagination via limit/offset query params.
 */
export class ListStatementsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const tenantId = ctx.tenant.realmKey;

            const repo = await ctx.container.resolve<{
                list(tenantId: string, filters: any, pagination: any): Promise<any>;
            }>("fin.banking.bankStatementRepo");

            const filters: Record<string, unknown> = {
                entityCode: (req.query.entityCode as string) ?? ctx.tenant.orgKey,
                bankAccountId: req.query.bankAccountId as string | undefined,
                status: req.query.status as StatementStatus | undefined,
            };

            const limit = Math.min(Number(req.query.limit) || 50, 200);
            const offset = Number(req.query.offset) || 0;
            const sort = (req.query.sort as string) || "created_at";
            const dir = (req.query.dir as "asc" | "desc") || "desc";

            const result = await repo.list(tenantId, filters, { limit, offset, sort, dir });
            res.status(200).json(result);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * GET /api/fin/bank-statements/:id
 *
 * Retrieves a single bank statement by ID with all lines embedded.
 */
export class GetStatementHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<BankReconciliationService>(RECON_TOKEN);
            const tenantId = ctx.tenant.realmKey;
            const { id } = req.params;

            const statement = await service.getStatement(tenantId, id);
            if (!statement) {
                res.status(404).json({ error: { code: "NOT_FOUND", message: `Statement ${id} not found` } });
                return;
            }

            // Embed lines in the response
            const lineRepo = await ctx.container.resolve<{
                getByStatementId(tenantId: string, statementId: string): Promise<any[]>;
            }>("fin.banking.bankStatementLineRepo");

            const lines = await lineRepo.getByStatementId(tenantId, id);
            res.status(200).json({ ...statement, lines });
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

// ---------------------------------------------------------------------------
// Reconciliation Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/fin/bank-statements/:id/reconcile
 *
 * Starts a new reconciliation session for the given bank statement.
 * Transitions the statement to IN_PROGRESS and creates a session in OPEN status.
 */
export class StartReconciliationHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<BankReconciliationService>(RECON_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.startReconciliation(opCtx, id);

            if (!result.ok) {
                res.status(mapErrorStatus(result.error.code)).json({ error: result.error });
                return;
            }

            res.status(201).json(result.value);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * POST /api/fin/reconciliation/:id/auto-match
 *
 * Runs the 3-pass auto-matching algorithm on the reconciliation session.
 * Returns the list of matches found (above and below threshold).
 */
export class AutoMatchHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<BankReconciliationService>(RECON_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.runAutoMatch(opCtx, id);

            if (!result.ok) {
                res.status(mapErrorStatus(result.error.code)).json({ error: result.error });
                return;
            }

            res.status(200).json(result.value);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * POST /api/fin/reconciliation/:id/match
 *
 * Manually matches a bank statement line to a payment entry.
 * Expects `{ lineId, paymentId }` in the body.
 */
export class ManualMatchHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<BankReconciliationService>(RECON_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const { lineId, paymentId } = req.body;
            if (!lineId || !paymentId) {
                res.status(400).json({ error: { code: "INVALID_INPUT", message: "lineId and paymentId are required" } });
                return;
            }

            const result = await service.manualMatch(opCtx, lineId, paymentId);

            if (!result.ok) {
                res.status(mapErrorStatus(result.error.code)).json({ error: result.error });
                return;
            }

            res.status(200).json(result.value);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * POST /api/fin/reconciliation/:id/unmatch
 *
 * Removes the match for a bank statement line, reverting it to UNMATCHED.
 * Expects `{ lineId }` in the body.
 */
export class UnmatchHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<BankReconciliationService>(RECON_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const { lineId } = req.body;
            if (!lineId) {
                res.status(400).json({ error: { code: "INVALID_INPUT", message: "lineId is required" } });
                return;
            }

            const result = await service.unmatch(opCtx, lineId);

            if (!result.ok) {
                res.status(mapErrorStatus(result.error.code)).json({ error: result.error });
                return;
            }

            res.status(200).json(result.value);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * POST /api/fin/reconciliation/:id/complete
 *
 * Finalizes the reconciliation session. Transitions to COMPLETED status,
 * marks all confirmed matches as CONFIRMED, and updates the statement
 * status to COMPLETED.
 */
export class CompleteReconciliationHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<BankReconciliationService>(RECON_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.completeReconciliation(opCtx, id);

            if (!result.ok) {
                res.status(mapErrorStatus(result.error.code)).json({ error: result.error });
                return;
            }

            res.status(200).json(result.value);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * GET /api/fin/reconciliation/:id/report
 *
 * Returns the reconciliation session summary with match counts,
 * discrepancy, and current status.
 */
export class ReconciliationReportHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const tenantId = ctx.tenant.realmKey;
            const { id } = req.params;

            const reconRepo = await ctx.container.resolve<{
                getById(tenantId: string, id: string): Promise<any>;
            }>("fin.banking.reconciliationSessionRepo");

            const session = await reconRepo.getById(tenantId, id);
            if (!session) {
                res.status(404).json({ error: { code: "NOT_FOUND", message: `Reconciliation session ${id} not found` } });
                return;
            }

            res.status(200).json(session);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}
