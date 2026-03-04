// finance/__tests__/handler-contracts.test.ts
//
// Tests 31-32: HTTP handler contract tests
//   31: POST lines when status != DRAFT -> 400 with INVALID_STATUS
//   32: Payment post cross-supplier -> 400, overpay -> 409

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SetInvoiceLinesHandler } from "../accounting/api/handlers.js";
import { PostPaymentHandler } from "../payments/api/handlers.js";

// ---------------------------------------------------------------------------
// Mock helpers — Express req/res/ctx
// ---------------------------------------------------------------------------

function createMockReq(params = {}, body = {}, query = {}): any {
    return { params, body, query };
}

function createMockRes(): any {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
}

function createMockCtx(overrides = {}): any {
    return {
        tenant: { tenantId: "t-1", orgKey: "ACME" },
        auth: { userId: "user-1" },
        request: { requestId: "req-1" },
        container: { resolve: vi.fn() },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Test 31: SetInvoiceLinesHandler — POST lines when status != DRAFT -> 400
// ---------------------------------------------------------------------------

describe("SetInvoiceLinesHandler — contract", () => {
    it("returns 400 INVALID_STATUS when invoice is not in DRAFT status", async () => {
        // Mock PurchaseInvoiceService.setLines to return fail("INVALID_STATUS", ...)
        const mockInvoiceService = {
            setLines: vi.fn(async () => ({
                ok: false,
                error: {
                    code: "INVALID_STATUS",
                    message: "Cannot modify lines in POSTED status",
                },
            })),
        };

        const ctx = createMockCtx({
            container: {
                resolve: vi.fn(async (token: string) => {
                    if (token === "fin.accounting.purchaseInvoiceService") {
                        return mockInvoiceService;
                    }
                    return {};
                }),
            },
        });

        const req = createMockReq(
            { id: "inv-1" },
            {
                lines: [
                    {
                        description: "Test line",
                        quantity: "1",
                        unitPrice: "100",
                        amount: "100",
                    },
                ],
            },
            { entityCode: "ACME" },
        );
        const res = createMockRes();

        const handler = new SetInvoiceLinesHandler();
        await handler.handle(req, res, ctx);

        // Should return 400 (mapErrorStatus maps INVALID_STATUS -> 400)
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: "INVALID_STATUS",
                    message: "Cannot modify lines in POSTED status",
                }),
            }),
        );

        // Verify the service was called with the correct arguments
        expect(mockInvoiceService.setLines).toHaveBeenCalledOnce();
        const callArgs = mockInvoiceService.setLines.mock.calls[0];
        // First arg: OperationContext
        expect(callArgs[0].tenantId).toBe("t-1");
        // Second arg: invoiceId
        expect(callArgs[1]).toBe("inv-1");
        // Third arg: lines array
        expect(callArgs[2]).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Test 32: PostPaymentHandler — cross-supplier -> 400, overpay -> 409
// ---------------------------------------------------------------------------

describe("PostPaymentHandler — contract", () => {
    it("returns 400 with CROSS_SUPPLIER error code when payment references cross-supplier invoice", async () => {
        const mockPaymentService = {
            post: vi.fn(async () => ({
                ok: false,
                error: {
                    code: "CROSS_SUPPLIER",
                    message: "Invoice INV-2026-00001 belongs to supplier supplier-2, but payment is for supplier supplier-1",
                    details: { invoiceId: "inv-1", invoiceSupplierId: "supplier-2" },
                },
            })),
        };

        const ctx = createMockCtx({
            container: {
                resolve: vi.fn(async (token: string) => {
                    if (token === "fin.payments.paymentEntryService") {
                        return mockPaymentService;
                    }
                    return {};
                }),
            },
        });

        const req = createMockReq(
            { id: "pay-1" },
            {},
            { entityCode: "ACME" },
        );
        const res = createMockRes();

        const handler = new PostPaymentHandler();
        await handler.handle(req, res, ctx);

        // CROSS_SUPPLIER maps to 400 in the payment handler's mapErrorStatus
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: "CROSS_SUPPLIER",
                }),
            }),
        );
    });

    it("returns 409 with OVERPAYMENT error code when allocation exceeds remaining invoice amount", async () => {
        const mockPaymentService = {
            post: vi.fn(async () => ({
                ok: false,
                error: {
                    code: "OVERPAYMENT",
                    message: "Overpayment on invoice INV-2026-00001: allocated 1000 but only 200 remaining",
                    details: { statusCode: 409 },
                },
            })),
        };

        const ctx = createMockCtx({
            container: {
                resolve: vi.fn(async (token: string) => {
                    if (token === "fin.payments.paymentEntryService") {
                        return mockPaymentService;
                    }
                    return {};
                }),
            },
        });

        const req = createMockReq(
            { id: "pay-1" },
            {},
            { entityCode: "ACME" },
        );
        const res = createMockRes();

        const handler = new PostPaymentHandler();
        await handler.handle(req, res, ctx);

        // OVERPAYMENT maps to 409 in the payment handler's mapErrorStatus
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({
                    code: "OVERPAYMENT",
                }),
            }),
        );
    });
});
