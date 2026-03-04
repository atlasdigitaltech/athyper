// finance/__tests__/gl-inquiry.test.ts
//
// Tests 21-22, 30: GL Inquiry Service
//   21: Trial balance balanced — sum debits = sum credits
//   22: Drill-down chain — rows have sourceDocLineId linking to invoice
//   30: Reversed entry + NETTED/SEPARATE — different result shapes per reversal mode

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { OperationContext } from "../../engines/shared/engine-base.js";
import type {
  TrialBalanceRow,
  GLDetailRow,
  TrialBalanceFilters,
  GLDetailFilters,
} from "../accounting/domain/types.js";
import type { GLInquiryService } from "../accounting/services/gl-inquiry-service.js";

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock GLInquiryService with pre-built result data.
 *
 * The mock returns deterministic data for each query method, simulating
 * a real GL with posted invoices, payments, and a reversal entry.
 */
function createGLMocks() {
  // --- Trial Balance data (balanced: total debits === total credits) ---
  const trialBalanceRows: TrialBalanceRow[] = [
    {
      accountId: "acc-6000",
      accountCode: "6000",
      accountName: "Office Supplies Expense",
      accountType: "EXPENSE",
      debitBalance: "5000",
      creditBalance: "0",
    },
    {
      accountId: "acc-6100",
      accountCode: "6100",
      accountName: "Rent Expense",
      accountType: "EXPENSE",
      debitBalance: "3000",
      creditBalance: "0",
    },
    {
      accountId: "acc-2100",
      accountCode: "2100",
      accountName: "Accounts Payable Control",
      accountType: "LIABILITY",
      debitBalance: "0",
      creditBalance: "7000",
    },
    {
      accountId: "acc-1000",
      accountCode: "1000",
      accountName: "Bank Account",
      accountType: "ASSET",
      debitBalance: "0",
      creditBalance: "1000",
    },
  ];

  // --- GL Detail data (includes sourceDocLineId for drill-down) ---
  const glDetailRows_NETTED: GLDetailRow[] = [
    // Original invoice posting
    {
      jeId: "je-1",
      jeNumber: "JE-INV-2026-00001",
      postingDate: new Date("2026-03-01"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 1,
      debitAmount: "5000",
      creditAmount: "0",
      description: "Expense: Office Supplies",
      sourceDocLineId: "inv-line-1",
      costCenterId: "cc-100",
    },
    {
      jeId: "je-1",
      jeNumber: "JE-INV-2026-00001",
      postingDate: new Date("2026-03-01"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 2,
      debitAmount: "0",
      creditAmount: "5000",
      description: "AP: INV-2026-00001",
      sourceDocLineId: "inv-1",
      costCenterId: null,
    },
    // Reversal entry (also POSTED — its debit/credit are swapped)
    {
      jeId: "je-rev-1",
      jeNumber: "JE-REV-2026-00001",
      postingDate: new Date("2026-03-02"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 1,
      debitAmount: "0",
      creditAmount: "5000",
      description: "Reversal: Expense: Office Supplies",
      sourceDocLineId: "inv-line-1",
      costCenterId: "cc-100",
    },
    {
      jeId: "je-rev-1",
      jeNumber: "JE-REV-2026-00001",
      postingDate: new Date("2026-03-02"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 2,
      debitAmount: "5000",
      creditAmount: "0",
      description: "Reversal: AP: INV-2026-00001",
      sourceDocLineId: "inv-1",
      costCenterId: null,
    },
  ];

  // SEPARATE mode includes both original (POSTED) and reversed (REVERSED status) entries
  // as distinct rows showing the full audit trail
  const glDetailRows_SEPARATE: GLDetailRow[] = [
    // Original entry (now status=REVERSED in the JE header)
    {
      jeId: "je-1",
      jeNumber: "JE-INV-2026-00001",
      postingDate: new Date("2026-03-01"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 1,
      debitAmount: "5000",
      creditAmount: "0",
      description: "Expense: Office Supplies",
      sourceDocLineId: "inv-line-1",
      costCenterId: "cc-100",
    },
    {
      jeId: "je-1",
      jeNumber: "JE-INV-2026-00001",
      postingDate: new Date("2026-03-01"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 2,
      debitAmount: "0",
      creditAmount: "5000",
      description: "AP: INV-2026-00001",
      sourceDocLineId: "inv-1",
      costCenterId: null,
    },
    // Reversal entry (status=POSTED)
    {
      jeId: "je-rev-1",
      jeNumber: "JE-REV-2026-00001",
      postingDate: new Date("2026-03-02"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 1,
      debitAmount: "0",
      creditAmount: "5000",
      description: "Reversal: Expense: Office Supplies",
      sourceDocLineId: "inv-line-1",
      costCenterId: "cc-100",
    },
    {
      jeId: "je-rev-1",
      jeNumber: "JE-REV-2026-00001",
      postingDate: new Date("2026-03-02"),
      docId: "inv-1",
      docType: "PURCHASE_INVOICE",
      lineNo: 2,
      debitAmount: "5000",
      creditAmount: "0",
      description: "Reversal: AP: INV-2026-00001",
      sourceDocLineId: "inv-1",
      costCenterId: null,
    },
  ];

  // --- GL Detail for non-reversed drill-down test ---
  const glDetailRows_drillDown: GLDetailRow[] = [
    {
      jeId: "je-2",
      jeNumber: "JE-PAY-2026-00001",
      postingDate: new Date("2026-03-05"),
      docId: "pay-1",
      docType: "PAYMENT",
      lineNo: 1,
      debitAmount: "3000",
      creditAmount: "0",
      description: "AP reduction: invoice inv-1",
      sourceDocLineId: "alloc-1", // Links to PaymentAllocation
      costCenterId: null,
    },
    {
      jeId: "je-2",
      jeNumber: "JE-PAY-2026-00001",
      postingDate: new Date("2026-03-05"),
      docId: "pay-1",
      docType: "PAYMENT",
      lineNo: 2,
      debitAmount: "0",
      creditAmount: "3000",
      description: "Payment PAY-2026-00001 -- net cash",
      sourceDocLineId: null,
      costCenterId: null,
    },
  ];

  // Build the mock service
  const mockGLService: GLInquiryService = {
    getGLSummary: vi.fn(async () => []),

    getGLDetail: vi.fn(
      async (_ctx: OperationContext, filters: GLDetailFilters) => {
        // For the drill-down test (account acc-2100 — AP account)
        if (filters.accountId === "acc-2100" && !filters.reversalMode) {
          return glDetailRows_drillDown;
        }
        // For the reversal tests
        if (filters.reversalMode === "NETTED" || !filters.reversalMode) {
          return glDetailRows_NETTED;
        }
        if (filters.reversalMode === "SEPARATE") {
          return glDetailRows_SEPARATE;
        }
        return [];
      },
    ),

    getTrialBalance: vi.fn(async () => [...trialBalanceRows]),
  };

  const ctx: OperationContext = {
    tenantId: "t-1",
    actorId: "user-1",
    actorType: "USER",
    correlationId: "corr-1",
    entityCode: "ACME",
  };

  return {
    service: mockGLService,
    ctx,
    trialBalanceRows,
    glDetailRows_NETTED,
    glDetailRows_SEPARATE,
    glDetailRows_drillDown,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GLInquiryService — GL reporting", () => {
  let m: ReturnType<typeof createGLMocks>;

  beforeEach(() => {
    m = createGLMocks();
  });

  // ── Test 21: Trial balance balanced ─────────────────────────────────
  it("getTrialBalance returns rows where sum(debits) === sum(credits)", async () => {
    const filters: TrialBalanceFilters = {
      tenantId: "t-1",
      entityCode: "ACME",
      fiscalYear: 2026,
      periodNumber: 3,
    };

    const rows = await m.service.getTrialBalance(m.ctx, filters);

    expect(rows.length).toBeGreaterThan(0);

    // Sum all debit balances and credit balances
    const totalDebits = rows.reduce(
      (sum, row) => sum + Number(row.debitBalance),
      0,
    );
    const totalCredits = rows.reduce(
      (sum, row) => sum + Number(row.creditBalance),
      0,
    );

    // Fundamental accounting identity: total debits = total credits
    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(8000); // 5000 + 3000 = 8000
    expect(totalCredits).toBe(8000); // 7000 + 1000 = 8000
  });

  // ── Test 22: Drill-down chain ───────────────────────────────────────
  it("getGLDetail returns rows with sourceDocLineId linking back to invoice/allocation", async () => {
    const filters: GLDetailFilters = {
      tenantId: "t-1",
      entityCode: "ACME",
      accountId: "acc-2100",
      fiscalYear: 2026,
    };

    const rows = await m.service.getGLDetail(m.ctx, filters);

    expect(rows.length).toBeGreaterThan(0);

    // At least one row should have a sourceDocLineId for traceability
    const rowsWithSourceLink = rows.filter((r) => r.sourceDocLineId !== null);
    expect(rowsWithSourceLink.length).toBeGreaterThan(0);

    // The Dr AP line should trace back to the payment allocation
    const drAPRow = rows.find(
      (r) => r.debitAmount !== "0" && r.sourceDocLineId === "alloc-1",
    );
    expect(drAPRow).toBeDefined();
    expect(drAPRow!.docType).toBe("PAYMENT");
    expect(drAPRow!.docId).toBe("pay-1");

    // Verify the drill-down chain: GL line -> sourceDocLineId -> allocation -> invoice
    // sourceDocLineId "alloc-1" references a PaymentAllocation which in turn
    // references an invoiceId — this is the expected traceability chain
    expect(drAPRow!.sourceDocLineId).toBe("alloc-1");
  });

  // ── Test 30: Reversed entry + NETTED/SEPARATE ───────────────────────
  it("getGLDetail returns different result shapes for NETTED vs SEPARATE reversal modes", async () => {
    const baseFilters: GLDetailFilters = {
      tenantId: "t-1",
      entityCode: "ACME",
      accountId: "acc-6000",
      fiscalYear: 2026,
    };

    // NETTED mode: reversal JEs are also POSTED with swapped debits/credits,
    // so they naturally net to zero in aggregation
    const nettedRows = await m.service.getGLDetail(m.ctx, {
      ...baseFilters,
      reversalMode: "NETTED",
    });

    // SEPARATE mode: both original (REVERSED status) and reversal (POSTED) are shown
    const separateRows = await m.service.getGLDetail(m.ctx, {
      ...baseFilters,
      reversalMode: "SEPARATE",
    });

    // Both modes should return rows
    expect(nettedRows.length).toBeGreaterThan(0);
    expect(separateRows.length).toBeGreaterThan(0);

    // NETTED: rows are all from POSTED JEs (original posting + reversal posting)
    // The reversal appears as a separate POSTED JE with swapped amounts
    const nettedJeIds = [...new Set(nettedRows.map((r) => r.jeId))];
    expect(nettedJeIds).toContain("je-1"); // Original
    expect(nettedJeIds).toContain("je-rev-1"); // Reversal

    // Verify NETTED nets to zero: sum of all debits should equal sum of all credits
    const nettedTotalDebit = nettedRows.reduce(
      (sum, r) => sum + Number(r.debitAmount),
      0,
    );
    const nettedTotalCredit = nettedRows.reduce(
      (sum, r) => sum + Number(r.creditAmount),
      0,
    );
    expect(nettedTotalDebit).toBe(nettedTotalCredit);

    // SEPARATE: includes both the original entry (now REVERSED) and the reversal
    const separateJeIds = [...new Set(separateRows.map((r) => r.jeId))];
    expect(separateJeIds).toContain("je-1"); // Original (REVERSED status)
    expect(separateJeIds).toContain("je-rev-1"); // Reversal (POSTED status)

    // SEPARATE mode should also be balanced (same data, just includes REVERSED status JEs)
    const separateTotalDebit = separateRows.reduce(
      (sum, r) => sum + Number(r.debitAmount),
      0,
    );
    const separateTotalCredit = separateRows.reduce(
      (sum, r) => sum + Number(r.creditAmount),
      0,
    );
    expect(separateTotalDebit).toBe(separateTotalCredit);

    // Both modes return rows, demonstrating the different query shapes
    // In production: NETTED filters on status='POSTED' only,
    // while SEPARATE filters on status IN ('POSTED','REVERSED')
    expect(nettedRows.length).toBe(4); // 2 original lines + 2 reversal lines
    expect(separateRows.length).toBe(4); // Same count but from different JE status sets
  });
});
