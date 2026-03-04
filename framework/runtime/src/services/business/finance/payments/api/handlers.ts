/**
 * Finance Module — Payment Entry HTTP Handlers
 *
 * RouteHandler implementations for the Payment Entry lifecycle:
 *   - Create, List, Get, Update      (DRAFT management)
 *   - Set Allocations                 (invoice allocation)
 *   - Submit, Post, Cancel, Reconcile (status transitions)
 *
 * All handlers resolve the PaymentEntryService from the scoped DI container.
 * Monetary values pass through as strings (MC-4 compliant).
 */

import type {
  HttpHandlerContext,
  RouteHandler,
} from "../../../../platform/foundation/http/types.js";
import type { OperationContext } from "../../../engines/shared/engine-base.js";
import type { PaymentStatus } from "../domain/types.js";
import type { PaymentEntryService } from "../services/payment-entry-service.js";
import type { Request, Response } from "express";

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
    case "JE_NOT_FOUND":
      return 404;
    case "VERSION_CONFLICT":
    case "ALREADY_POSTED":
      return 409;
    case "INVALID_STATUS":
    case "INVALID_TRANSITION":
    case "UNBALANCED":
    case "INVALID_LINES":
    case "NO_LINES":
    case "ZERO_AMOUNT":
    case "MISSING_ACCOUNTS":
      return 400;
    case "CROSS_SUPPLIER":
    case "INVALID_ALLOCATION":
    case "NO_ALLOCATIONS":
    case "INVALID_DEDUCTIONS":
      return 400;
    case "OVERPAYMENT":
      return 409;
    case "BLOCKED_BY_POLICY":
    case "SUBMISSION_BLOCKED":
      return 403;
    case "PERIOD_CLOSED":
      return 422;
    default:
      return 500;
  }
}

// ---------------------------------------------------------------------------
// Service token
// ---------------------------------------------------------------------------

const PAY_TOKEN = "fin.payments.paymentEntryService";

// ---------------------------------------------------------------------------
// Payment Entry Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/fin/payments
 *
 * Creates a new payment entry in DRAFT status.
 */
export class CreatePaymentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const opCtx = buildOpCtx(ctx, req);

      const result = await service.create(opCtx, {
        tenantId: opCtx.tenantId,
        entityCode: opCtx.entityCode ?? "",
        ...req.body,
      });

      if (!result.ok) {
        res
          .status(mapErrorStatus(result.error.code))
          .json({ error: result.error });
        return;
      }

      res.status(201).json(result.value);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * GET /api/fin/payments
 *
 * Lists payment entries with optional filters: entityCode, status, supplierId.
 * Supports pagination via limit/offset query params.
 */
export class ListPaymentsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const tenantId = ctx.tenant.realmKey;

      const repo = await ctx.container.resolve<{
        list(tenantId: string, filters: any, pagination: any): Promise<any>;
      }>("fin.payments.paymentEntryRepo");

      const filters: Record<string, unknown> = {
        entityCode: (req.query.entityCode as string) ?? ctx.tenant.orgKey,
        status: req.query.status as PaymentStatus | undefined,
        supplierId: req.query.supplierId as string | undefined,
        search: req.query.search as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };

      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const sort = (req.query.sort as string) || "created_at";
      const dir = (req.query.dir as "asc" | "desc") || "desc";

      const result = await repo.list(tenantId, filters, {
        limit,
        offset,
        sort,
        dir,
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * GET /api/fin/payments/:id
 *
 * Retrieves a single payment entry by ID.
 */
export class GetPaymentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const tenantId = ctx.tenant.realmKey;
      const { id } = req.params;

      const payment = await service.getById(tenantId, id);
      if (!payment) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: `Payment ${id} not found` },
        });
        return;
      }

      res.status(200).json(payment);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * PATCH /api/fin/payments/:id
 *
 * Updates a DRAFT payment entry. Requires `version` in the body for
 * optimistic concurrency control.
 */
export class UpdatePaymentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { id } = req.params;

      const result = await service.update(opCtx, id, req.body);

      if (!result.ok) {
        res
          .status(mapErrorStatus(result.error.code))
          .json({ error: result.error });
        return;
      }

      res.status(200).json(result.value);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * POST /api/fin/payments/:id/allocations
 *
 * Sets (upserts) the full allocation set for a DRAFT payment.
 * Expects `{ allocations: CreateAllocationInput[] }` in the body.
 * Each allocation specifies an invoiceId and the gross settlement amount.
 */
export class SetAllocationsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { id } = req.params;

      const allocations = req.body.allocations ?? req.body;
      if (!Array.isArray(allocations)) {
        res.status(400).json({
          error: {
            code: "INVALID_ALLOCATIONS",
            message: "Request body must contain an allocations array",
          },
        });
        return;
      }

      const version =
        typeof req.body.version === "number" ? req.body.version : undefined;
      const result = await service.addAllocations(
        opCtx,
        id,
        allocations,
        version,
      );

      if (!result.ok) {
        res
          .status(mapErrorStatus(result.error.code))
          .json({ error: result.error });
        return;
      }

      res.status(200).json(result.value);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * POST /api/fin/payments/:id/submit
 *
 * Transitions DRAFT -> SUBMITTED. Validates allocations, runs Decision
 * Grid evaluation, and determines approval route. Auto-approves for
 * ZERO_APPROVAL route.
 */
export class SubmitPaymentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { id } = req.params;

      const result = await service.submit(opCtx, id);

      if (!result.ok) {
        res
          .status(mapErrorStatus(result.error.code))
          .json({ error: result.error });
        return;
      }

      res.status(200).json(result.value);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * POST /api/fin/payments/:id/post
 *
 * Transitions APPROVED -> POSTED. Executes within a single database
 * transaction: locks invoices (prevents overpay), builds gross settlement
 * JE, posts to GL, and updates invoice paid amounts atomically.
 */
export class PostPaymentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { id } = req.params;

      const result = await service.post(opCtx, id);

      if (!result.ok) {
        res
          .status(mapErrorStatus(result.error.code))
          .json({ error: result.error });
        return;
      }

      res.status(200).json(result.value);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * POST /api/fin/payments/:id/cancel
 *
 * Cancels a payment. If POSTED, reverses the journal entry first.
 * Terminal status -- cannot be undone.
 */
export class CancelPaymentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { id } = req.params;

      const result = await service.cancel(opCtx, id);

      if (!result.ok) {
        res
          .status(mapErrorStatus(result.error.code))
          .json({ error: result.error });
        return;
      }

      res.status(200).json(result.value);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * POST /api/fin/payments/:id/reconcile
 *
 * Transitions POSTED -> RECONCILED. Marks the payment as reconciled
 * against the bank statement. Terminal status.
 */
export class ReconcilePaymentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    try {
      const service =
        await ctx.container.resolve<PaymentEntryService>(PAY_TOKEN);
      const opCtx = buildOpCtx(ctx, req);
      const { id } = req.params;

      const result = await service.reconcile(opCtx, id);

      if (!result.ok) {
        res
          .status(mapErrorStatus(result.error.code))
          .json({ error: result.error });
        return;
      }

      res.status(200).json(result.value);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
