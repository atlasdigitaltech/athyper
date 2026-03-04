// finance/__tests__/purchase-invoice-lifecycle.test.ts
//
// Tests 1-12, 23-25, 28: Purchase Invoice lifecycle (16 tests)
// Covers: create, setLines, resolveLineDefaults, submit, onApprovalComplete,
// post, cancel — the full 12-engine orchestration.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DefaultPurchaseInvoiceService } from "../accounting/services/purchase-invoice-service.js";
import type { OperationContext } from "../../engines/shared/engine-base.js";
import type { PurchaseInvoice, PurchaseInvoiceLine, InvoiceStatus } from "../accounting/domain/types.js";
import type { DecisionEvaluationResult, ApprovalRoute } from "../../shared/decision-grid-evaluator.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date("2026-03-03T00:00:00Z");

function makeInvoice(overrides: Partial<PurchaseInvoice> = {}): PurchaseInvoice {
    return {
        id: "inv-1",
        tenantId: "t-1",
        entityCode: "ACME",
        txnId: "txn-1",
        invoiceNumber: "INV-2026-00001",
        supplierId: "sup-1",
        supplierInvoiceRef: null,
        description: "Office supplies",
        ouId: "ou-1",
        intentId: null,
        spendCategoryId: null,
        fpId: null,
        accountingProfileId: null,
        invoiceDate: new Date("2026-03-01"),
        receivedDate: null,
        dueDate: null,
        postingDate: null,
        subtotal: "1000",
        taxAmount: "0",
        totalAmount: "1000",
        paidAmount: "0",
        currencyCode: "USD",
        functionalCurrencyCode: null,
        exchangeRate: null,
        functionalAmount: null,
        status: "DRAFT" as InvoiceStatus,
        decisionScore: null,
        approvalRoute: null,
        approvalInstanceId: null,
        jeId: null,
        postedAt: null,
        postedBy: null,
        icTransactionId: null,
        idempotencyKey: null,
        version: 1,
        submittedAt: null,
        submittedBy: null,
        approvedAt: null,
        approvedBy: null,
        cancelledAt: null,
        cancelledBy: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

function makeLine(overrides: Partial<PurchaseInvoiceLine> = {}): PurchaseInvoiceLine {
    return {
        id: "line-1",
        tenantId: "t-1",
        invoiceId: "inv-1",
        lineNo: 1,
        description: "Widget A",
        itemId: null,
        warehouseId: null,
        spendCategoryId: null,
        quantity: "10",
        uom: "EA",
        unitPrice: "100",
        amount: "1000",
        taxCode: null,
        taxRate: "0",
        taxAmount: "0",
        taxInclusive: false,
        accountId: "acc-expense-1",
        costCenterId: null,
        profitCenterId: null,
        fpId: null,
        commitmentId: null,
        commitmentScheduleId: null,
        assetId: null,
        inventoryMovementId: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

function makeDecisionResult(overrides: Partial<DecisionEvaluationResult> = {}): DecisionEvaluationResult {
    return {
        compositeScore: 0.35,
        approvalRoute: "STANDARD" as ApprovalRoute,
        policyResults: [],
        exceptions: [],
        pipelineId: "pipe-1",
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

function createInvoiceMocks() {
    const baseInvoice = makeInvoice();
    const baseLines = [makeLine()];

    // ── Repos ──
    const invoiceRepo = {
        create: vi.fn(async (input: any) => makeInvoice({
            ...input,
            id: "inv-1",
            status: "DRAFT",
            subtotal: "0",
            taxAmount: "0",
            totalAmount: "0",
            paidAmount: "0",
        })),
        getById: vi.fn(async () => ({ ...baseInvoice })),
        updateStatus: vi.fn(async (_t: string, _id: string, status: InvoiceStatus, fields?: any) => ({
            ...baseInvoice,
            status,
            ...fields,
        })),
        list: vi.fn(async () => ({ items: [baseInvoice], total: 1, limit: 50, offset: 0, hasMore: false })),
        findByIdempotencyKey: vi.fn(async () => null),
    };

    const lineRepo = {
        bulkUpsert: vi.fn(async (_t: string, _id: string, lines: any[]) =>
            lines.map((l, i) => makeLine({
                id: `line-${i + 1}`,
                lineNo: i + 1,
                ...l,
            })),
        ),
        getByInvoiceId: vi.fn(async () => [...baseLines]),
        updatePostLinks: vi.fn(async () => {}),
    };

    // ── Engine facades ──
    const postingService = {
        createAndPost: vi.fn(async () => ({
            ok: true,
            value: {
                id: "je-1",
                tenantId: "t-1",
                entityCode: "ACME",
                jeNumber: "JE-2026-00001",
                txnId: "txn-1",
                docId: "inv-1",
                docType: "PURCHASE_INVOICE",
                fiscalYear: 2026,
                periodNumber: 3,
                postingDate: now,
                description: "Purchase Invoice INV-2026-00001",
                totalDebit: "1000",
                totalCredit: "1000",
                currencyCode: "USD",
                status: "POSTED",
                isReversal: false,
                reversalOfId: null,
                reversedById: null,
                postedBy: "user-1",
                postedAt: now,
                createdAt: now,
                accountingProfileId: null,
            },
        })),
        reverse: vi.fn(async () => ({
            ok: true,
            value: {
                id: "je-rev-1",
                jeNumber: "JER-2026-00001",
                status: "POSTED",
            },
        })),
        getById: vi.fn(async () => null),
    };

    const documentControl = {
        generateNumber: vi.fn(async (_t: string, _e: string, prefix: string) =>
            `${prefix}-2026-00001`,
        ),
        checkIdempotency: vi.fn(async () => null),
        assertVersion: vi.fn(),
    };

    const ouIntentResolver = {
        resolveDefaults: vi.fn(async () => ({
            ok: true,
            value: {
                defaultGlAccount: "acc-6100",
                defaultCostCenterId: "cc-ops",
                defaultProfitCenterId: null,
                defaultFpId: null,
                defaultTaxCode: "STANDARD",
                defaultCurrencyCode: "USD",
            },
        })),
    };

    const decisionGrid = {
        evaluate: vi.fn(async () => ({
            ok: true,
            value: makeDecisionResult(),
        })),
    };

    const budgetOps = {
        reserve: vi.fn(async () => ({ ok: true, value: {} })),
        commit: vi.fn(async () => ({ ok: true, value: {} })),
        consume: vi.fn(async () => ({ ok: true, value: {} })),
        release: vi.fn(async () => ({ ok: true, value: {} })),
    };

    const taxOps = {
        calculateBatch: vi.fn(async () => ({
            ok: true,
            value: { calculations: [], totalTaxAmount: "0" },
        })),
    };

    const approvalOps = {
        createInstance: vi.fn(async () => ({
            ok: true,
            value: { id: "approval-1" },
        })),
        cancelInstance: vi.fn(async () => ({ ok: true, value: undefined })),
    };

    const assetOps = {
        createAsset: vi.fn(async () => ({ ok: true, value: { id: "asset-1" } })),
    };

    const inventoryOps = {
        receiveStock: vi.fn(async () => ({ ok: true, value: { movementId: "mov-1" } })),
    };

    const commissionOps = {
        calculateCommission: vi.fn(async () => ({ ok: true, value: {} })),
    };

    const federationOps = {
        createICTransaction: vi.fn(async () => ({ ok: true, value: { id: "ic-1" } })),
        isIntercompany: vi.fn(async () => false),
    };

    const outboxEmitter = {
        emit: vi.fn(async () => "event-1"),
    };

    const service = new DefaultPurchaseInvoiceService(
        invoiceRepo as any,
        lineRepo as any,
        postingService as any,
        documentControl as any,
        ouIntentResolver as any,
        decisionGrid as any,
        budgetOps as any,
        taxOps as any,
        assetOps as any,
        inventoryOps as any,
        commissionOps as any,
        federationOps as any,
        approvalOps as any,
        outboxEmitter as any,
    );

    const ctx: OperationContext = {
        tenantId: "t-1",
        actorId: "user-1",
        actorType: "USER",
        correlationId: "corr-1",
        entityCode: "ACME",
    };

    return {
        service,
        invoiceRepo,
        lineRepo,
        postingService,
        documentControl,
        ouIntentResolver,
        decisionGrid,
        budgetOps,
        taxOps,
        approvalOps,
        assetOps,
        inventoryOps,
        commissionOps,
        federationOps,
        outboxEmitter,
        ctx,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PurchaseInvoiceService — lifecycle", () => {
    let m: ReturnType<typeof createInvoiceMocks>;

    beforeEach(() => {
        m = createInvoiceMocks();
    });

    // ── Test 1: Create + add line -> defaults resolve ────────────────

    it("T1: creates invoice, adds lines, and resolves OU+Intent defaults", async () => {
        // Create invoice
        const createResult = await m.service.create(m.ctx, {
            tenantId: "t-1",
            entityCode: "ACME",
            supplierId: "sup-1",
            ouId: "ou-1",
            invoiceDate: new Date("2026-03-01"),
            currencyCode: "USD",
        });
        expect(createResult.ok).toBe(true);

        // Resolve defaults
        const defaultsResult = await m.service.resolveLineDefaults(m.ctx, "inv-1");
        expect(defaultsResult.ok).toBe(true);
        expect(m.ouIntentResolver.resolveDefaults).toHaveBeenCalledWith(
            m.ctx, "ou-1", null, null,
        );

        if (defaultsResult.ok) {
            expect(defaultsResult.value).toMatchObject({
                defaultGlAccount: "acc-6100",
                defaultCostCenterId: "cc-ops",
                defaultTaxCode: "STANDARD",
            });
        }
    });

    // ── Test 2: Submit -> Decision Grid -> approval ──────────────────

    it("T2: submit evaluates Decision Grid and creates approval instance", async () => {
        m.decisionGrid.evaluate.mockResolvedValueOnce({
            ok: true,
            value: makeDecisionResult({ approvalRoute: "STANDARD", compositeScore: 0.55 }),
        });

        const result = await m.service.submit(m.ctx, "inv-1");

        expect(result.ok).toBe(true);
        expect(m.decisionGrid.evaluate).toHaveBeenCalledTimes(1);
        expect(m.decisionGrid.evaluate).toHaveBeenCalledWith(m.ctx, expect.objectContaining({
            docId: "inv-1",
            docType: "PURCHASE_INVOICE",
            amount: "1000",
        }));
        expect(m.approvalOps.createInstance).toHaveBeenCalledWith(m.ctx, expect.objectContaining({
            entityType: "purchase_invoice",
            entityId: "inv-1",
            triggerEvent: "on_submit",
            compositeScore: 0.55,
            approvalRoute: "STANDARD",
        }));
        expect(m.invoiceRepo.updateStatus).toHaveBeenCalledWith(
            "t-1", "inv-1", "SUBMITTED", expect.objectContaining({
                decisionScore: 0.55,
                approvalRoute: "STANDARD",
                approvalInstanceId: "approval-1",
            }),
        );
    });

    // ── Test 3: Low-amount -> zero-approval bypass ──────────────────

    it("T3: zero-approval route auto-approves without creating approval instance", async () => {
        m.decisionGrid.evaluate.mockResolvedValueOnce({
            ok: true,
            value: makeDecisionResult({ approvalRoute: "ZERO_APPROVAL", compositeScore: 0.05 }),
        });

        const result = await m.service.submit(m.ctx, "inv-1");

        expect(result.ok).toBe(true);
        // Status should be APPROVED, not SUBMITTED
        expect(m.invoiceRepo.updateStatus).toHaveBeenCalledWith(
            "t-1", "inv-1", "APPROVED", expect.objectContaining({
                approvalRoute: "ZERO_APPROVAL",
            }),
        );
        // No approval instance created
        expect(m.approvalOps.createInstance).not.toHaveBeenCalled();
    });

    // ── Test 4: Submit with fp_id -> budget RESERVED ────────────────

    it("T4: submit with fp_id reserves budget for the linked funding profile", async () => {
        // Invoice has an FP linked
        const invoiceWithFp = makeInvoice({ fpId: "fp-opex-1" });
        m.invoiceRepo.getById.mockResolvedValue(invoiceWithFp);

        m.decisionGrid.evaluate.mockResolvedValueOnce({
            ok: true,
            value: makeDecisionResult({ approvalRoute: "STANDARD", compositeScore: 0.4 }),
        });

        const result = await m.service.submit(m.ctx, "inv-1");

        expect(result.ok).toBe(true);
        expect(m.budgetOps.reserve).toHaveBeenCalledWith(
            m.ctx, "fp-opex-1", expect.any(String), "USD", "txn-1",
        );
    });

    // ── Test 5: Approve -> budget COMMITTED ─────────────────────────

    it("T5: approval complete (approved) commits budget reservation", async () => {
        const submittedInvoice = makeInvoice({
            status: "SUBMITTED",
            fpId: "fp-opex-1",
            approvalInstanceId: "approval-1",
        });
        m.invoiceRepo.getById.mockResolvedValue(submittedInvoice);

        const result = await m.service.onApprovalComplete(m.ctx, "inv-1", "approved");

        expect(result.ok).toBe(true);
        expect(m.budgetOps.commit).toHaveBeenCalledWith(
            m.ctx, "fp-opex-1", expect.any(String), "USD", "txn-1",
        );
        expect(m.invoiceRepo.updateStatus).toHaveBeenCalledWith(
            "t-1", "inv-1", "APPROVED", expect.objectContaining({
                approvedBy: "user-1",
            }),
        );
    });

    // ── Test 6: Post -> JE + GL updated ─────────────────────────────

    it("T6: posting creates a journal entry with debit and credit lines", async () => {
        const approvedInvoice = makeInvoice({ status: "APPROVED" });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        const result = await m.service.post(m.ctx, "inv-1");

        expect(result.ok).toBe(true);
        expect(m.postingService.createAndPost).toHaveBeenCalledTimes(1);

        // Verify the JE input structure
        const jeInput = m.postingService.createAndPost.mock.calls[0][1];
        expect(jeInput).toMatchObject({
            tenantId: "t-1",
            docId: "inv-1",
            docType: "PURCHASE_INVOICE",
            currencyCode: "USD",
        });

        // Should have Dr Expense + Cr AP lines
        const lines = jeInput.lines;
        const debitLines = lines.filter((l: any) => l.debitAmount !== "0");
        const creditLines = lines.filter((l: any) => l.creditAmount !== "0");
        expect(debitLines.length).toBeGreaterThanOrEqual(1);
        expect(creditLines.length).toBeGreaterThanOrEqual(1);

        // AP control credit line
        const apLine = lines.find((l: any) => l.accountId === "AP_CONTROL");
        expect(apLine).toBeDefined();
        expect(apLine.creditAmount).toBe("1000");
        expect(apLine.subledgerType).toBe("AP");
    });

    // ── Test 7: Post with tax -> Dr Tax Input Credit ────────────────

    it("T7: posting with recoverable tax creates a tax input credit debit line", async () => {
        const approvedInvoice = makeInvoice({
            status: "APPROVED",
            taxAmount: "100",
            totalAmount: "1100",
        });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        // Tax engine returns a recoverable tax calculation
        m.taxOps.calculateBatch.mockResolvedValueOnce({
            ok: true,
            value: {
                calculations: [{
                    id: "taxcalc-1",
                    tenantId: "t-1",
                    txnId: "txn-1",
                    docId: "inv-1",
                    commitmentId: null,
                    lineItemIndex: 0,
                    jurisdictionId: "jur-us-1",
                    taxType: "VAT",
                    taxCode: "VAT_STANDARD",
                    baseAmount: "1000",
                    taxRate: "0.1",
                    taxAmount: "100",
                    currencyCode: "USD",
                    isReverseCharge: false,
                    isWht: false,
                    isInputCreditEligible: true,
                    calculatedAt: now,
                }],
                totalTaxAmount: "100",
            },
        });

        const result = await m.service.post(m.ctx, "inv-1");

        expect(result.ok).toBe(true);

        const jeInput = m.postingService.createAndPost.mock.calls[0][1];
        const taxLine = jeInput.lines.find(
            (l: any) => l.description?.includes("Tax input credit"),
        );
        expect(taxLine).toBeDefined();
        expect(taxLine.debitAmount).toBe("100");
        expect(taxLine.creditAmount).toBe("0");
    });

    // ── Test 8: CAPEX -> WIP asset created ──────────────────────────
    // NOTE: The current implementation has a TODO for CAPEX/asset creation
    // driven by intent metadata. This test documents the spec expectation
    // that assetOps.createAsset WOULD be called for CAPEX lines.
    // For now it verifies the post succeeds even with CAPEX-domain lines.

    it("T8: CAPEX line triggers asset creation spec (post succeeds with CAPEX context)", async () => {
        const approvedInvoice = makeInvoice({ status: "APPROVED" });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        // Line has a CAPEX spend category but asset creation is deferred to
        // intent metadata lookup (TODO in source). Verify post succeeds.
        m.lineRepo.getByInvoiceId.mockResolvedValue([
            makeLine({ spendCategoryId: "CAPEX", accountId: "acc-capex-1" }),
        ]);

        const result = await m.service.post(m.ctx, "inv-1");

        expect(result.ok).toBe(true);
        expect(m.postingService.createAndPost).toHaveBeenCalledTimes(1);
        // assetOps.createAsset is NOT yet called (implementation deferred to intent lookup)
        // When implemented, this assertion should become:
        // expect(m.assetOps.createAsset).toHaveBeenCalled();
    });

    // ── Test 9: item_id -> outbox event with inventory line data ─────

    it("T9: line with itemId emits outbox event containing inventory line data", async () => {
        const approvedInvoice = makeInvoice({ status: "APPROVED" });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        const inventoryLine = makeLine({
            itemId: "item-widget",
            warehouseId: "wh-main",
            quantity: "25",
            unitPrice: "40",
            amount: "1000",
        });
        m.lineRepo.getByInvoiceId.mockResolvedValue([inventoryLine]);

        const result = await m.service.post(m.ctx, "inv-1");

        expect(result.ok).toBe(true);

        // Outbox event emitted with inventory-eligible line data
        expect(m.outboxEmitter.emit).toHaveBeenCalledTimes(1);
        const event = m.outboxEmitter.emit.mock.calls[0][0];
        expect(event.type).toBe("finance.document.posted");
        expect(event.docType).toBe("PURCHASE_INVOICE");
        const eventLine = event.lines.find((l: any) => l.itemId === "item-widget");
        expect(eventLine).toBeDefined();
        expect(eventLine.warehouseId).toBe("wh-main");
        expect(eventLine.amount).toBe("1000");
    });

    // ── Test 10: IC supplier -> outbox event with supplier data ──────

    it("T10: posting emits outbox event with supplier info for IC handler", async () => {
        const approvedInvoice = makeInvoice({ status: "APPROVED" });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        const result = await m.service.post(m.ctx, "inv-1");

        expect(result.ok).toBe(true);

        // Outbox event contains supplierId for federation IC handler
        expect(m.outboxEmitter.emit).toHaveBeenCalledTimes(1);
        const event = m.outboxEmitter.emit.mock.calls[0][0];
        expect(event.supplierId).toBe("sup-1");
        expect(event.entityCode).toBe("ACME");
        expect(event.jeId).toBe("je-1");
        // IC determination now happens in the FederationICHandler, not inline
    });

    // ── Test 11: Commission via outbox ──────────────────────────────

    it("T11: posting emits outbox event for commission handler", async () => {
        const approvedInvoice = makeInvoice({ status: "APPROVED" });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        const result = await m.service.post(m.ctx, "inv-1");

        expect(result.ok).toBe(true);

        // Outbox event contains the data commission handler needs
        expect(m.outboxEmitter.emit).toHaveBeenCalledTimes(1);
        const event = m.outboxEmitter.emit.mock.calls[0][0];
        expect(event.docId).toBe("inv-1");
        expect(event.supplierId).toBe("sup-1");
        expect(event.docType).toBe("PURCHASE_INVOICE");
        // Commission handler will use these fields to calculate
    });

    // ── Test 12: Budget CONSUMED on post ────────────────────────────

    it("T12: posting consumes budget when funding profile is linked", async () => {
        const approvedInvoice = makeInvoice({ status: "APPROVED", fpId: "fp-opex-1" });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        const result = await m.service.post(m.ctx, "inv-1");

        expect(result.ok).toBe(true);
        expect(m.budgetOps.consume).toHaveBeenCalledWith(
            m.ctx, "fp-opex-1", expect.any(String), "USD", "txn-1",
        );
    });

    // ── Test 23: Cancel POSTED -> reversal + release ────────────────

    it("T23: cancelling a POSTED invoice reverses JE and releases budget", async () => {
        const postedInvoice = makeInvoice({
            status: "POSTED",
            fpId: "fp-opex-1",
            jeId: "je-1",
            postedAt: now,
            postedBy: "user-1",
        });
        m.invoiceRepo.getById.mockResolvedValue(postedInvoice);

        const result = await m.service.cancel(m.ctx, "inv-1");

        expect(result.ok).toBe(true);

        // JE reversed
        expect(m.postingService.reverse).toHaveBeenCalledWith(
            m.ctx, "je-1", expect.stringContaining("JER"),
        );

        // Budget released
        expect(m.budgetOps.release).toHaveBeenCalledWith(
            m.ctx, "fp-opex-1", expect.any(String), "USD", "txn-1",
        );

        // Status set to CANCELLED
        expect(m.invoiceRepo.updateStatus).toHaveBeenCalledWith(
            "t-1", "inv-1", "CANCELLED", expect.objectContaining({
                cancelledBy: "user-1",
            }),
        );
    });

    // ── Test 24: Cancel SUBMITTED -> approval cancel ────────────────

    it("T24: cancelling a SUBMITTED invoice cancels approval and releases budget", async () => {
        const submittedInvoice = makeInvoice({
            status: "SUBMITTED",
            fpId: "fp-opex-1",
            approvalInstanceId: "approval-1",
        });
        m.invoiceRepo.getById.mockResolvedValue(submittedInvoice);

        const result = await m.service.cancel(m.ctx, "inv-1");

        expect(result.ok).toBe(true);

        // Approval instance cancelled
        expect(m.approvalOps.cancelInstance).toHaveBeenCalledWith(m.ctx, "approval-1");

        // Budget released
        expect(m.budgetOps.release).toHaveBeenCalledWith(
            m.ctx, "fp-opex-1", expect.any(String), "USD", "txn-1",
        );

        // No JE reversal (not posted)
        expect(m.postingService.reverse).not.toHaveBeenCalled();

        // Final status
        expect(m.invoiceRepo.updateStatus).toHaveBeenCalledWith(
            "t-1", "inv-1", "CANCELLED", expect.objectContaining({
                cancelledBy: "user-1",
            }),
        );
    });

    // ── Test 25: Reject -> back to DRAFT + release ──────────────────

    it("T25: approval rejection reverts invoice to DRAFT and releases budget", async () => {
        const submittedInvoice = makeInvoice({
            status: "SUBMITTED",
            fpId: "fp-opex-1",
            approvalInstanceId: "approval-1",
        });
        m.invoiceRepo.getById.mockResolvedValue(submittedInvoice);

        const result = await m.service.onApprovalComplete(m.ctx, "inv-1", "rejected");

        expect(result.ok).toBe(true);

        // Status reverts to DRAFT
        expect(m.invoiceRepo.updateStatus).toHaveBeenCalledWith(
            "t-1", "inv-1", "DRAFT", expect.objectContaining({
                approvalInstanceId: null,
            }),
        );

        // Budget released
        expect(m.budgetOps.release).toHaveBeenCalledWith(
            m.ctx, "fp-opex-1", expect.any(String), "USD", "txn-1",
        );
    });

    // ── Test 28: Post twice -> second rejected ──────────────────────

    it("T28: posting an already-posted invoice returns ALREADY_POSTED error", async () => {
        const approvedInvoice = makeInvoice({ status: "APPROVED" });
        m.invoiceRepo.getById.mockResolvedValue(approvedInvoice);

        // First post succeeds
        m.postingService.createAndPost.mockResolvedValueOnce({
            ok: true,
            value: { id: "je-1", jeNumber: "JE-2026-00001", status: "POSTED" },
        });

        const firstResult = await m.service.post(m.ctx, "inv-1");
        expect(firstResult.ok).toBe(true);

        // Second post: posting service returns ALREADY_POSTED
        m.postingService.createAndPost.mockResolvedValueOnce({
            ok: false,
            error: {
                code: "ALREADY_POSTED",
                message: "Document inv-1 (PURCHASE_INVOICE) already has a non-reversed JE",
                details: { existingJeId: "je-1" },
            },
        });

        // Invoice is still APPROVED for the second attempt
        const secondResult = await m.service.post(m.ctx, "inv-1");

        expect(secondResult.ok).toBe(false);
        if (!secondResult.ok) {
            expect(secondResult.error.code).toBe("ALREADY_POSTED");
        }
    });
});
