// finance/__tests__/manual-je-lifecycle.test.ts
//
// Tests 19-20: Manual JE lifecycle
// Test 19: "33.3333" x 3 = "99.9999" balanced entry validates
// Test 20: HARD_CLOSE period rejection

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DefaultManualJEService } from "../accounting/services/manual-je-service.js";
import type { OperationContext } from "../../engines/shared/engine-base.js";
import type { JournalEntry, CreateJournalEntryInput, CreateJournalLineInput } from "../../engines/posting-engine/domain/types.js";

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

function createMJEMocks() {
    const mockJE: JournalEntry = {
        id: "je-1",
        tenantId: "t-1",
        entityCode: "ACME",
        docId: "doc-mje-1",
        docType: "MANUAL_JE",
        jeNumber: "MJE-2026-00001",
        postingDate: new Date("2026-03-01"),
        fiscalYear: 2026,
        periodNumber: 3,
        description: "Test manual JE",
        totalDebit: "99.9999",
        totalCredit: "99.9999",
        currencyCode: "USD",
        status: "CREATED",
        txnId: "txn-1",
        reversalOfJeId: null,
        reversedByJeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as JournalEntry;

    const mockLines = [
        {
            id: "jl-1", jeId: "je-1", lineNo: 1,
            accountId: "acc-1", costCenterId: null, profitCenterId: null,
            debitAmount: "33.3333", creditAmount: "0",
            currencyCode: "USD", description: "Debit 1",
            subledgerType: null, subledgerRefId: null,
            sourceDocLineId: null, tags: [],
        },
        {
            id: "jl-2", jeId: "je-1", lineNo: 2,
            accountId: "acc-2", costCenterId: null, profitCenterId: null,
            debitAmount: "33.3333", creditAmount: "0",
            currencyCode: "USD", description: "Debit 2",
            subledgerType: null, subledgerRefId: null,
            sourceDocLineId: null, tags: [],
        },
        {
            id: "jl-3", jeId: "je-1", lineNo: 3,
            accountId: "acc-3", costCenterId: null, profitCenterId: null,
            debitAmount: "33.3333", creditAmount: "0",
            currencyCode: "USD", description: "Debit 3",
            subledgerType: null, subledgerRefId: null,
            sourceDocLineId: null, tags: [],
        },
        {
            id: "jl-4", jeId: "je-1", lineNo: 4,
            accountId: "acc-4", costCenterId: null, profitCenterId: null,
            debitAmount: "0", creditAmount: "99.9999",
            currencyCode: "USD", description: "Credit total",
            subledgerType: null, subledgerRefId: null,
            sourceDocLineId: null, tags: [],
        },
    ];

    const jeRepo = {
        create: vi.fn(async (input: any) => ({ ...mockJE, ...input })),
        getById: vi.fn(async () => ({ ...mockJE })),
        getLinesByJeId: vi.fn(async () => [...mockLines]),
        updateStatus: vi.fn(async (_t: string, _id: string, status: string) => ({
            ...mockJE,
            status,
        })),
    };

    const periodRepo = {
        getForDate: vi.fn(async () => ({
            id: "period-3",
            tenantId: "t-1",
            entityCode: "ACME",
            fiscalYear: 2026,
            periodNumber: 3,
            startDate: new Date("2026-03-01"),
            endDate: new Date("2026-03-31"),
            status: "OPEN",
        })),
    };

    const glBalanceRepo = {
        incrementPeriodAmounts: vi.fn(async () => {}),
    };

    const coaRepo = {
        getById: vi.fn(async () => ({
            id: "acc-1",
            accountCode: "6000",
            accountName: "Test Account",
            isActive: true,
            isGroup: false,
            allowDirectPosting: true,
        })),
    };

    const postingService = {
        createAndPost: vi.fn(),
        getById: vi.fn(),
        reverse: vi.fn(),
    };

    const decisionGrid = {
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

    const documentControl = {
        generateNumber: vi.fn(async () => "MJE-2026-00001"),
        checkIdempotency: vi.fn(async () => null),
        assertVersion: vi.fn(),
    };

    const service = new DefaultManualJEService(
        jeRepo as any,
        periodRepo as any,
        glBalanceRepo as any,
        coaRepo as any,
        postingService as any,
        decisionGrid as any,
        documentControl as any,
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
        jeRepo,
        periodRepo,
        glBalanceRepo,
        coaRepo,
        postingService,
        decisionGrid,
        documentControl,
        ctx,
        mockJE,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ManualJEService — lifecycle", () => {
    let m: ReturnType<typeof createMJEMocks>;

    beforeEach(() => {
        m = createMJEMocks();
    });

    // Test 19: "33.3333" x 3 = "99.9999" balanced
    it("creates a balanced JE with high-precision fractional amounts", async () => {
        const input: CreateJournalEntryInput = {
            tenantId: "t-1",
            entityCode: "ACME",
            docId: "doc-mje-1",
            docType: "MANUAL_JE",
            postingDate: new Date("2026-03-01"),
            description: "Test fractional balance",
            currencyCode: "USD",
            lines: [
                { accountId: "acc-1", debitAmount: "33.3333", creditAmount: "0", currencyCode: "USD" },
                { accountId: "acc-2", debitAmount: "33.3333", creditAmount: "0", currencyCode: "USD" },
                { accountId: "acc-3", debitAmount: "33.3333", creditAmount: "0", currencyCode: "USD" },
                { accountId: "acc-4", debitAmount: "0", creditAmount: "99.9999", currencyCode: "USD" },
            ],
        };

        const result = await m.service.create(m.ctx, input);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.totalDebit).toBe("99.9999");
            expect(result.value.totalCredit).toBe("99.9999");
        }
    });

    // Test 20: HARD_CLOSE period rejected
    it("rejects posting when fiscal period is HARD_CLOSE", async () => {
        // Override period to be HARD_CLOSE
        m.periodRepo.getForDate.mockResolvedValueOnce({
            id: "period-3",
            tenantId: "t-1",
            entityCode: "ACME",
            fiscalYear: 2026,
            periodNumber: 3,
            startDate: new Date("2026-03-01"),
            endDate: new Date("2026-03-31"),
            status: "HARD_CLOSE",
        });

        const input: CreateJournalEntryInput = {
            tenantId: "t-1",
            entityCode: "ACME",
            docId: "doc-mje-2",
            docType: "MANUAL_JE",
            postingDate: new Date("2026-03-01"),
            description: "Test period close",
            currencyCode: "USD",
            lines: [
                { accountId: "acc-1", debitAmount: "100", creditAmount: "0", currencyCode: "USD" },
                { accountId: "acc-2", debitAmount: "0", creditAmount: "100", currencyCode: "USD" },
            ],
        };

        const result = await m.service.create(m.ctx, input);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("PERIOD_CLOSED");
        }
    });
});
