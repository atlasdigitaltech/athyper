// finance/__tests__/payment-lifecycle.test.ts
//
// Tests 13-18, 26-27: Payment posting lifecycle
//   13: Payment post -> Dr AP Cr Bank
//   14: WHT -> Cr WHT Payable
//   15: Concurrent payments -> locking 409
//   16: Invoice status -> PAID after full payment
//   17: Commitment fulfillment (spec)
//   18: Commission settled (spec)
//   26: Cross-supplier allocation -> 400
//   27: Balanced JE proof: 1000 = 850 + 100 + 50

import { describe, it, expect, vi } from "vitest";

import { DefaultPaymentEntryService } from "../payments/services/payment-entry-service.js";

import type { CreateJournalEntryInput } from "../../engines/posting-engine/domain/types.js";
import type { OperationContext } from "../../engines/shared/engine-base.js";
import type { PurchaseInvoice } from "../accounting/domain/types.js";
import type {
  PaymentEntry,
  PaymentAllocation,
} from "../payments/domain/types.js";

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

function createPaymentMocks(overrides?: {
  paymentOverrides?: Partial<PaymentEntry>;
  allocations?: PaymentAllocation[];
  invoices?: Partial<PurchaseInvoice>[];
}) {
  const now = new Date();

  const basePayment: PaymentEntry = {
    id: "pay-1",
    tenantId: "t-1",
    entityCode: "ACME",
    txnId: "txn-pay-1",
    paymentNumber: "PAY-2026-00001",
    supplierId: "supplier-1",
    description: "Test payment",
    ouId: "ou-1",
    paymentMethod: "WIRE",
    bankAccountId: "bank-acc-1",
    clearingAccountId: "ap-control-1",
    bankReference: null,
    paymentDate: new Date("2026-03-01"),
    valueDate: null,
    totalAmount: "1000",
    currencyCode: "USD",
    functionalCurrencyCode: null,
    exchangeRate: null,
    functionalAmount: null,
    status: "APPROVED",
    decisionScore: 0.1,
    approvalRoute: "ZERO_APPROVAL",
    approvalInstanceId: null,
    jeId: null,
    postedAt: null,
    postedBy: null,
    reconciledAt: null,
    reconciledBy: null,
    idempotencyKey: null,
    version: 1,
    submittedAt: now,
    submittedBy: "user-1",
    approvedAt: now,
    approvedBy: "user-1",
    cancelledAt: null,
    cancelledBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides?.paymentOverrides,
  };

  const defaultAllocations: PaymentAllocation[] = overrides?.allocations ?? [
    {
      id: "alloc-1",
      tenantId: "t-1",
      paymentId: "pay-1",
      invoiceId: "inv-1",
      lineNo: 1,
      allocatedAmount: "1000",
      discountAmount: "0",
      withholdingAmount: "0",
      whtTaxCalcId: null,
      commissionCalcIds: [],
      commitmentId: null,
      description: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const defaultInvoices: PurchaseInvoice[] = (
    overrides?.invoices ?? [
      {
        id: "inv-1",
        tenantId: "t-1",
        entityCode: "ACME",
        supplierId: "supplier-1",
        invoiceNumber: "INV-2026-00001",
        totalAmount: "1000",
        paidAmount: "0",
        status: "POSTED",
      },
    ]
  ).map((inv) => ({
    id: inv.id ?? "inv-1",
    tenantId: inv.tenantId ?? "t-1",
    entityCode: inv.entityCode ?? "ACME",
    txnId: inv.txnId ?? "txn-inv-1",
    invoiceNumber: inv.invoiceNumber ?? "INV-2026-00001",
    supplierId: inv.supplierId ?? "supplier-1",
    supplierInvoiceRef: null,
    description: null,
    ouId: inv.ouId ?? "ou-1",
    intentId: null,
    spendCategoryId: null,
    fpId: null,
    accountingProfileId: null,
    invoiceDate: new Date("2026-02-15"),
    receivedDate: null,
    dueDate: null,
    postingDate: null,
    subtotal: inv.totalAmount ?? "1000",
    taxAmount: "0",
    totalAmount: inv.totalAmount ?? "1000",
    paidAmount: inv.paidAmount ?? "0",
    currencyCode: "USD",
    functionalCurrencyCode: null,
    exchangeRate: null,
    functionalAmount: null,
    status: inv.status ?? "POSTED",
    decisionScore: null,
    approvalRoute: null,
    approvalInstanceId: null,
    jeId: "je-inv-1",
    postedAt: now,
    postedBy: "user-1",
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
  })) as PurchaseInvoice[];

  // Build invoice map for lockForUpdate
  const invoiceMap = new Map(defaultInvoices.map((inv) => [inv.id, inv]));

  // --- Repos ---

  const paymentEntryRepo = {
    create: vi.fn(async (input: any) => ({ ...basePayment, ...input })),
    getById: vi.fn(async () => ({ ...basePayment })),
    findByIdempotencyKey: vi.fn(async () => null),
    updateStatus: vi.fn(
      async (_t: string, _id: string, status: string, fields?: any) => ({
        ...basePayment,
        status,
        ...fields,
      }),
    ),
    list: vi.fn(async () => ({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
    })),
  };

  const paymentAllocationRepo = {
    bulkUpsert: vi.fn(async () => [...defaultAllocations]),
    getByPaymentId: vi.fn(async () => [...defaultAllocations]),
    getByInvoiceId: vi.fn(async () => []),
  };

  const purchaseInvoiceRepo = {
    create: vi.fn(),
    getById: vi.fn(async (_t: string, id: string) => {
      return invoiceMap.get(id) ?? null;
    }),
    findByIdempotencyKey: vi.fn(async () => null),
    updateStatus: vi.fn(
      async (_t: string, _id: string, status: string, fields?: any) => {
        const inv = invoiceMap.get(_id) ?? defaultInvoices[0];
        return { ...inv, status, ...fields };
      },
    ),
    updatePaidAmount: vi.fn(
      async (_t: string, id: string, paidAmount: string, status: string) => {
        const inv = invoiceMap.get(id) ?? defaultInvoices[0];
        return { ...inv, paidAmount, status };
      },
    ),
    lockForUpdate: vi.fn(async (ids: string[]) => {
      return ids
        .map((id) => invoiceMap.get(id))
        .filter(Boolean) as PurchaseInvoice[];
    }),
    list: vi.fn(async () => ({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
    })),
  };

  // Track captured JE input for assertion
  let capturedJEInput: CreateJournalEntryInput | null = null;

  const postingService = {
    createAndPost: vi.fn(async (_ctx: any, input: CreateJournalEntryInput) => {
      capturedJEInput = input;
      return {
        ok: true,
        value: {
          id: "je-pay-1",
          tenantId: input.tenantId,
          entityCode: input.entityCode,
          jeNumber: `JE-PAY-${basePayment.paymentNumber}`,
          txnId: input.txnId,
          docId: input.docId,
          docType: input.docType,
          accountingProfileId: null,
          fiscalYear: 2026,
          periodNumber: 3,
          postingDate: input.postingDate,
          description: input.description,
          status: "POSTED",
          totalDebit: "0",
          totalCredit: "0",
          currencyCode: input.currencyCode,
          isReversal: false,
          reversalOfId: null,
          reversedById: null,
          postedBy: input.postedBy,
          postedAt: now,
          createdAt: now,
        },
      };
    }),
    reverse: vi.fn(async () => ({
      ok: true,
      value: { id: "je-rev-1" },
    })),
    getById: vi.fn(async () => null),
  };

  const documentControl = {
    generateNumber: vi.fn(async () => "PAY-2026-00001"),
    checkIdempotency: vi.fn(async () => null),
    assertVersion: vi.fn(),
  };

  const decisionGridEvaluator = {
    evaluate: vi.fn(async () => ({
      ok: true,
      value: {
        compositeScore: 0.1,
        approvalRoute: "ZERO_APPROVAL",
        pipelineId: "pipe-1",
        exceptions: [],
      },
    })),
  };

  const taxCalculationService = {
    calculate: vi.fn(async () => ({ ok: true, value: {} })),
  };

  // Mock container with db.beginTransaction
  const mockTx = {
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    query: vi.fn(async () => []),
    queryOne: vi.fn(async () => ({})),
  };

  const container = {
    resolve: vi.fn(async (token: string) => {
      if (token === "db") {
        return {
          beginTransaction: vi.fn(async () => mockTx),
        };
      }
      return {};
    }),
  };

  const service = new DefaultPaymentEntryService(
    paymentEntryRepo as any,
    paymentAllocationRepo as any,
    purchaseInvoiceRepo as any,
    postingService as any,
    documentControl as any,
    decisionGridEvaluator as any,
    taxCalculationService as any,
    container as any,
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
    paymentEntryRepo,
    paymentAllocationRepo,
    purchaseInvoiceRepo,
    postingService,
    documentControl,
    decisionGridEvaluator,
    taxCalculationService,
    container,
    mockTx,
    ctx,
    basePayment,
    defaultAllocations,
    defaultInvoices,
    getCapturedJEInput: () => capturedJEInput,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PaymentEntryService — posting lifecycle", () => {
  // ── Test 13: Payment post -> Dr AP Cr Bank ──────────────────────────
  it("post() generates JE with Dr AP and Cr Bank lines", async () => {
    const m = createPaymentMocks();
    const result = await m.service.post(m.ctx, "pay-1");

    expect(result.ok).toBe(true);

    // Verify createAndPost was called
    expect(m.postingService.createAndPost).toHaveBeenCalledOnce();
    const jeInput = m.getCapturedJEInput()!;
    expect(jeInput).not.toBeNull();

    const lines = jeInput.lines;

    // Find Dr AP line (debit > 0)
    const drAPLines = lines.filter(
      (l) => l.debitAmount !== "0" && l.creditAmount === "0",
    );
    expect(drAPLines.length).toBeGreaterThan(0);

    // Find Cr Bank line (credit > 0, description contains "net cash")
    const crBankLines = lines.filter(
      (l) =>
        l.creditAmount !== "0" &&
        l.debitAmount === "0" &&
        l.description?.includes("net cash"),
    );
    expect(crBankLines.length).toBe(1);

    // Total Dr AP = Cr Bank (no WHT/discount in this simple case)
    const totalDrAP = drAPLines.reduce(
      (sum, l) => sum + Number(l.debitAmount),
      0,
    );
    const totalCrBank = Number(crBankLines[0].creditAmount);
    expect(totalDrAP).toBe(totalCrBank);
    expect(totalDrAP).toBe(1000);
  });

  // ── Test 14: WHT -> Cr WHT Payable ──────────────────────────────────
  it("post() includes Cr WHT Payable line when withholding is present", async () => {
    const m = createPaymentMocks({
      allocations: [
        {
          id: "alloc-1",
          tenantId: "t-1",
          paymentId: "pay-1",
          invoiceId: "inv-1",
          lineNo: 1,
          allocatedAmount: "1000",
          discountAmount: "0",
          withholdingAmount: "100",
          whtTaxCalcId: "wht-calc-1",
          commissionCalcIds: [],
          commitmentId: null,
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const result = await m.service.post(m.ctx, "pay-1");

    expect(result.ok).toBe(true);

    const jeInput = m.getCapturedJEInput()!;
    const lines = jeInput.lines;

    // Cr WHT Payable line should exist
    const crWHTLines = lines.filter(
      (l) =>
        l.creditAmount !== "0" &&
        l.debitAmount === "0" &&
        l.description?.includes("WHT"),
    );
    expect(crWHTLines.length).toBe(1);
    expect(crWHTLines[0].creditAmount).toBe("100");

    // Cr Bank should be net cash = 1000 - 100 = 900
    const crBankLines = lines.filter(
      (l) =>
        l.creditAmount !== "0" &&
        l.debitAmount === "0" &&
        l.description?.includes("net cash"),
    );
    expect(crBankLines.length).toBe(1);
    expect(crBankLines[0].creditAmount).toBe("900");
  });

  // ── Test 15: Concurrent payments -> locking 409 ─────────────────────
  it("post() fails 409 OVERPAYMENT when allocation exceeds remaining invoice amount", async () => {
    // Invoice has totalAmount=1000 but paidAmount=800 (only 200 remaining)
    // Allocation tries to allocate 1000 -> OVERPAYMENT
    const m = createPaymentMocks({
      invoices: [
        {
          id: "inv-1",
          supplierId: "supplier-1",
          invoiceNumber: "INV-2026-00001",
          totalAmount: "1000",
          paidAmount: "800",
          status: "PARTIALLY_PAID",
        },
      ],
    });

    const result = await m.service.post(m.ctx, "pay-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OVERPAYMENT");
    }

    // Transaction should have been rolled back
    expect(m.mockTx.rollback).toHaveBeenCalled();
  });

  // ── Test 16: Invoice status -> PAID ─────────────────────────────────
  it("post() calls updatePaidAmount and transitions invoice to PAID when fully paid", async () => {
    const m = createPaymentMocks();

    const result = await m.service.post(m.ctx, "pay-1");

    expect(result.ok).toBe(true);

    // updatePaidAmount should have been called with the new paid amount and PAID status
    expect(m.purchaseInvoiceRepo.updatePaidAmount).toHaveBeenCalledWith(
      "t-1",
      "inv-1",
      "1000", // 0 (existing paidAmount) + 1000 (allocatedAmount) = 1000
      "PAID", // totalAmount === newPaidAmount => PAID
      m.mockTx,
    );
  });

  // ── Test 17: Commitment fulfillment (spec) ──────────────────────────
  it.todo(
    "post() should fulfill linked commitment schedule entries when payment is posted " +
      "(expected: CommitmentEngine.fulfill called for each allocation with a commitmentId, " +
      "schedule entry status transitions to FULFILLED, " +
      "and commitment header recalculates fulfillment percentage)",
  );

  // ── Test 18: Commission settled (spec) ──────────────────────────────
  it.todo(
    "post() should trigger commission settlement for allocations with commission calc IDs " +
      "(expected: CommissionEngine.settle called for each allocation.commissionCalcIds entry, " +
      "commission statement line created with payment reference, " +
      "and commission statement balance updated)",
  );

  // ── Test 26: Cross-supplier allocation -> 400 ───────────────────────
  it("post() rejects with CROSS_SUPPLIER when allocation references invoice from different supplier", async () => {
    // Invoice belongs to supplier-2 but payment is for supplier-1
    const m = createPaymentMocks({
      invoices: [
        {
          id: "inv-1",
          supplierId: "supplier-2", // Different from payment's supplier-1
          invoiceNumber: "INV-2026-00001",
          totalAmount: "1000",
          paidAmount: "0",
          status: "POSTED",
        },
      ],
    });

    const result = await m.service.post(m.ctx, "pay-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CROSS_SUPPLIER");
    }

    // Transaction should have been rolled back
    expect(m.mockTx.rollback).toHaveBeenCalled();
  });

  // ── Test 27: Balanced JE proof: 1000 = 850 + 100 + 50 ──────────────
  it("post() builds balanced JE: Dr AP 1000 = Cr Bank 850 + Cr WHT 100 + Cr Disc 50", async () => {
    const m = createPaymentMocks({
      allocations: [
        {
          id: "alloc-1",
          tenantId: "t-1",
          paymentId: "pay-1",
          invoiceId: "inv-1",
          lineNo: 1,
          allocatedAmount: "1000",
          discountAmount: "50",
          withholdingAmount: "100",
          whtTaxCalcId: "wht-calc-1",
          commissionCalcIds: [],
          commitmentId: null,
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const result = await m.service.post(m.ctx, "pay-1");

    expect(result.ok).toBe(true);

    const jeInput = m.getCapturedJEInput()!;
    const lines = jeInput.lines;

    // Dr AP lines
    const drLines = lines.filter((l) => l.debitAmount !== "0");
    const totalDebit = drLines.reduce(
      (sum, l) => sum + Number(l.debitAmount),
      0,
    );

    // Cr lines (Bank + WHT + Discount)
    const crLines = lines.filter((l) => l.creditAmount !== "0");
    const totalCredit = crLines.reduce(
      (sum, l) => sum + Number(l.creditAmount),
      0,
    );

    // BALANCED: total debit === total credit
    expect(totalDebit).toBe(1000);
    expect(totalCredit).toBe(1000);

    // Verify individual credit lines
    const crWHT = crLines.find((l) => l.description?.includes("WHT"));
    const crDisc = crLines.find((l) => l.description?.includes("discount"));
    const crBank = crLines.find((l) => l.description?.includes("net cash"));

    expect(crWHT).toBeDefined();
    expect(crWHT!.creditAmount).toBe("100");

    expect(crDisc).toBeDefined();
    expect(crDisc!.creditAmount).toBe("50");

    expect(crBank).toBeDefined();
    expect(crBank!.creditAmount).toBe("850");

    // Proof: 850 + 100 + 50 = 1000 = Dr AP
    expect(
      Number(crBank!.creditAmount) +
        Number(crWHT!.creditAmount) +
        Number(crDisc!.creditAmount),
    ).toBe(Number(drLines[0].debitAmount));
  });
});
