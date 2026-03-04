/**
 * Finance Module — Accounting HTTP Handlers
 *
 * RouteHandler implementations for:
 *   - Purchase Invoice  (9 endpoints)
 *   - Manual JE         (6 endpoints)
 *   - GL Inquiry        (3 endpoints)
 *
 * All handlers resolve services from the scoped DI container and delegate to
 * the corresponding service layer. Monetary values pass through as strings
 * (MC-4 compliant).
 */

import type { Request, Response } from "express";
import type { HttpHandlerContext, RouteHandler } from "../../../../platform/foundation/http/types.js";
import type { PurchaseInvoiceService } from "../services/purchase-invoice-service.js";
import type { ManualJEService } from "../services/manual-je-service.js";
import type { GLInquiryService } from "../services/gl-inquiry-service.js";
import type { PostingService } from "../../../engines/posting-engine/services/posting-service.js";
import type { OperationContext } from "../../../engines/shared/engine-base.js";
import type { InvoiceStatus } from "../domain/types.js";
import type { JEStatus } from "../../../engines/posting-engine/domain/types.js";

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
        case "OVERPAYMENT":
            return 400;
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
// Purchase Invoice Handlers
// ---------------------------------------------------------------------------

const PI_TOKEN = "fin.accounting.purchaseInvoiceService";

/**
 * POST /api/fin/purchase-invoices
 *
 * Creates a new purchase invoice in DRAFT status.
 */
export class CreatePurchaseInvoiceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const opCtx = buildOpCtx(ctx, req);

            const result = await service.create(opCtx, {
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
 * GET /api/fin/purchase-invoices
 *
 * Lists purchase invoices with optional filters: entityCode, status, supplierId.
 * Supports pagination via limit/offset query params.
 */
export class ListPurchaseInvoicesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const tenantId = ctx.tenant.realmKey;

            const filters: Record<string, unknown> = {
                entityCode: (req.query.entityCode as string) ?? ctx.tenant.orgKey,
                status: req.query.status as InvoiceStatus | undefined,
                supplierId: req.query.supplierId as string | undefined,
                search: req.query.search as string | undefined,
                dateFrom: req.query.dateFrom as string | undefined,
                dateTo: req.query.dateTo as string | undefined,
            };

            const limit = Math.min(Number(req.query.limit) || 50, 200);
            const offset = Number(req.query.offset) || 0;
            const sort = (req.query.sort as string) || "created_at";
            const dir = (req.query.dir as "asc" | "desc") || "desc";

            const repo = await ctx.container.resolve<{
                list(tenantId: string, filters: any, pagination: any): Promise<any>;
            }>("fin.accounting.purchaseInvoiceRepo");

            const result = await repo.list(tenantId, filters, { limit, offset, sort, dir });
            res.status(200).json(result);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * GET /api/fin/purchase-invoices/:id
 *
 * Retrieves a single purchase invoice by ID.
 */
export class GetPurchaseInvoiceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const tenantId = ctx.tenant.realmKey;
            const { id } = req.params;

            const invoice = await service.getById(tenantId, id);
            if (!invoice) {
                res.status(404).json({ error: { code: "NOT_FOUND", message: `Invoice ${id} not found` } });
                return;
            }

            res.status(200).json(invoice);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * PATCH /api/fin/purchase-invoices/:id
 *
 * Updates a DRAFT purchase invoice. Requires `version` in the body for
 * optimistic concurrency control.
 */
export class UpdatePurchaseInvoiceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.update(opCtx, id, req.body);

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
 * POST /api/fin/purchase-invoices/:id/lines
 *
 * Sets (upserts) the full line set for a DRAFT purchase invoice.
 * Expects `{ lines: CreateInvoiceLineInput[] }` in the body.
 */
export class SetInvoiceLinesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const lines = req.body.lines ?? req.body;
            if (!Array.isArray(lines)) {
                res.status(400).json({ error: { code: "INVALID_LINES", message: "Request body must contain a lines array" } });
                return;
            }

            const version = typeof req.body.version === "number" ? req.body.version : undefined;
            const result = await service.setLines(opCtx, id, lines, version);

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
 * GET /api/fin/purchase-invoices/:id/lines/defaults
 *
 * Resolves OU + Intent default values for a new line on the given invoice.
 * Called by the UI to pre-populate account, cost centre, etc.
 */
export class GetInvoiceLineDefaultsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.resolveLineDefaults(opCtx, id);

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
 * POST /api/fin/purchase-invoices/:id/submit
 *
 * Transitions DRAFT -> SUBMITTED. Runs Decision Grid evaluation,
 * reserves budget, and creates approval workflow instance (or auto-approves
 * for ZERO_APPROVAL route).
 */
export class SubmitInvoiceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.submit(opCtx, id);

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
 * POST /api/fin/purchase-invoices/:id/post
 *
 * Transitions APPROVED -> POSTED. Runs the 12-engine orchestration:
 * tax, JE creation, GL update, budget consume, asset, inventory,
 * commission, and federation.
 */
export class PostInvoiceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.post(opCtx, id);

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
 * POST /api/fin/purchase-invoices/:id/cancel
 *
 * Cancels an invoice. If POSTED, reverses the JE and releases budget.
 * If SUBMITTED, cancels the approval workflow and releases reserved budget.
 */
export class CancelInvoiceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<PurchaseInvoiceService>(PI_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.cancel(opCtx, id);

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

// ---------------------------------------------------------------------------
// Manual Journal Entry Handlers
// ---------------------------------------------------------------------------

const MJE_TOKEN = "fin.accounting.manualJEService";
const POSTING_TOKEN = "fin.posting.service";

/**
 * POST /api/fin/journal-entries
 *
 * Creates a new manual journal entry in CREATED (draft) status.
 * Body must include balanced lines (total debit === total credit).
 */
export class CreateManualJEHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<ManualJEService>(MJE_TOKEN);
            const opCtx = buildOpCtx(ctx, req);

            const result = await service.create(opCtx, {
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
 * GET /api/fin/journal-entries
 *
 * Lists journal entries with optional filters: entityCode, fiscalYear,
 * periodNumber, status, docId, txnId. Supports pagination.
 */
export class ListJournalEntriesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const tenantId = ctx.tenant.realmKey;

            // Resolve the JE repo through the posting service's backing repo
            const jeRepo = await ctx.container.resolve<{
                list(tenantId: string, filters: any, pagination: any): Promise<any>;
            }>("fin.posting.jeRepo");

            const filters: Record<string, unknown> = {};
            if (req.query.entityCode) filters.entityCode = req.query.entityCode as string;
            if (req.query.fiscalYear) filters.fiscalYear = Number(req.query.fiscalYear);
            if (req.query.periodNumber) filters.periodNumber = Number(req.query.periodNumber);
            if (req.query.status) filters.status = req.query.status as JEStatus;
            if (req.query.txnId) filters.txnId = req.query.txnId as string;
            if (req.query.docId) filters.docId = req.query.docId as string;
            if (req.query.search) filters.search = req.query.search as string;
            if (req.query.dateFrom) filters.dateFrom = req.query.dateFrom as string;
            if (req.query.dateTo) filters.dateTo = req.query.dateTo as string;

            const limit = Math.min(Number(req.query.limit) || 50, 200);
            const offset = Number(req.query.offset) || 0;
            const sort = (req.query.sort as string) || "created_at";
            const dir = (req.query.dir as "asc" | "desc") || "desc";

            const result = await jeRepo.list(tenantId, filters, { limit, offset, sort, dir });
            res.status(200).json(result);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * GET /api/fin/journal-entries/:id
 *
 * Retrieves a single journal entry by ID (with lines).
 */
export class GetJournalEntryHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const postingService = await ctx.container.resolve<PostingService>(POSTING_TOKEN);
            const tenantId = ctx.tenant.realmKey;
            const { id } = req.params;

            const je = await postingService.getById(tenantId, id);
            if (!je) {
                res.status(404).json({ error: { code: "JE_NOT_FOUND", message: `Journal entry ${id} not found` } });
                return;
            }

            res.status(200).json(je);
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * POST /api/fin/journal-entries/:id/submit
 *
 * Submits a CREATED manual JE for approval. Runs Decision Grid evaluation.
 * If zero-approval and `directPost` is true, auto-posts immediately.
 */
export class SubmitManualJEHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<ManualJEService>(MJE_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const options = req.body?.directPost === true ? { directPost: true } : undefined;
            const result = await service.submit(opCtx, id, options);

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
 * POST /api/fin/journal-entries/:id/post
 *
 * Posts an approved (CREATED + approved) manual JE. Re-validates
 * double-entry balance, account status, and fiscal period at post time.
 */
export class PostManualJEHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<ManualJEService>(MJE_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.post(opCtx, id);

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
 * POST /api/fin/journal-entries/:id/reverse
 *
 * Reverses a POSTED manual JE. Creates a new reversal JE with swapped
 * debit/credit lines and updates GL balances accordingly.
 */
export class ReverseManualJEHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<ManualJEService>(MJE_TOKEN);
            const opCtx = buildOpCtx(ctx, req);
            const { id } = req.params;

            const result = await service.reverse(opCtx, id);

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

// ---------------------------------------------------------------------------
// GL Inquiry Handlers
// ---------------------------------------------------------------------------

const GL_TOKEN = "fin.accounting.glInquiryService";

/**
 * GET /api/fin/gl/summary
 *
 * Returns GL summary rows (pre-aggregated from fin.gl_balance).
 * Required query params: fiscalYear.
 * Optional: periodNumber, accountId, costCenterId, accountType.
 */
export class GLSummaryHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<GLInquiryService>(GL_TOKEN);
            const opCtx = buildOpCtx(ctx, req);

            const fiscalYear = Number(req.query.fiscalYear);
            if (!fiscalYear || isNaN(fiscalYear)) {
                res.status(400).json({ error: { code: "MISSING_FISCAL_YEAR", message: "fiscalYear query parameter is required" } });
                return;
            }

            const filters = {
                tenantId: opCtx.tenantId,
                entityCode: opCtx.entityCode ?? "",
                fiscalYear,
                periodNumber: req.query.periodNumber ? Number(req.query.periodNumber) : undefined,
                accountId: req.query.accountId as string | undefined,
                costCenterId: req.query.costCenterId as string | undefined,
                accountType: req.query.accountType as string | undefined,
            };

            const rows = await service.getGLSummary(opCtx, filters);
            res.status(200).json({ data: rows });
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * GET /api/fin/gl/detail
 *
 * Returns GL detail rows (journal lines joined with journal entries).
 * Required query params: accountId, fiscalYear.
 * Optional: periodNumber, reversalMode (NETTED | SEPARATE | EXCLUDED).
 */
export class GLDetailHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<GLInquiryService>(GL_TOKEN);
            const opCtx = buildOpCtx(ctx, req);

            const fiscalYear = Number(req.query.fiscalYear);
            const accountId = req.query.accountId as string | undefined;

            if (!fiscalYear || isNaN(fiscalYear)) {
                res.status(400).json({ error: { code: "MISSING_FISCAL_YEAR", message: "fiscalYear query parameter is required" } });
                return;
            }
            if (!accountId) {
                res.status(400).json({ error: { code: "MISSING_ACCOUNT_ID", message: "accountId query parameter is required" } });
                return;
            }

            const filters = {
                tenantId: opCtx.tenantId,
                entityCode: opCtx.entityCode ?? "",
                accountId,
                fiscalYear,
                periodNumber: req.query.periodNumber ? Number(req.query.periodNumber) : undefined,
                reversalMode: (req.query.reversalMode as "NETTED" | "SEPARATE" | "EXCLUDED") ?? undefined,
            };

            const rows = await service.getGLDetail(opCtx, filters);
            res.status(200).json({ data: rows });
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

/**
 * GET /api/fin/gl/trial-balance
 *
 * Returns trial balance rows aggregated per account for a given period.
 * Required query params: fiscalYear, periodNumber.
 * Optional: reversalMode (NETTED | SEPARATE | EXCLUDED).
 */
export class TrialBalanceHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        try {
            const service = await ctx.container.resolve<GLInquiryService>(GL_TOKEN);
            const opCtx = buildOpCtx(ctx, req);

            const fiscalYear = Number(req.query.fiscalYear);
            const periodNumber = Number(req.query.periodNumber);

            if (!fiscalYear || isNaN(fiscalYear)) {
                res.status(400).json({ error: { code: "MISSING_FISCAL_YEAR", message: "fiscalYear query parameter is required" } });
                return;
            }
            if (!periodNumber || isNaN(periodNumber)) {
                res.status(400).json({ error: { code: "MISSING_PERIOD", message: "periodNumber query parameter is required" } });
                return;
            }

            const filters = {
                tenantId: opCtx.tenantId,
                entityCode: opCtx.entityCode ?? "",
                fiscalYear,
                periodNumber,
                reversalMode: (req.query.reversalMode as "NETTED" | "SEPARATE" | "EXCLUDED") ?? undefined,
            };

            const rows = await service.getTrialBalance(opCtx, filters);
            res.status(200).json({ data: rows });
        } catch (err) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}
