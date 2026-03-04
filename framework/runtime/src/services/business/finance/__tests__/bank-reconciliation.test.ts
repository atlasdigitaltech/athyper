// bank-reconciliation.test.ts
//
// Tests for the bank reconciliation module:
//   - autoMatch 3-pass matching algorithm
//   - DefaultBankReconciliationService lifecycle methods

import { describe, it, expect, vi, beforeEach } from "vitest";

import { autoMatch } from "../banking/services/auto-matcher.js";
import type { PaymentMatchCandidate } from "../banking/services/auto-matcher.js";
import { DefaultBankReconciliationService } from "../banking/services/bank-reconciliation-service.js";
import type { PaymentQueryRepo } from "../banking/services/bank-reconciliation-service.js";
import type {
    BankStatement,
    BankStatementLine,
    ReconciliationSession,
    MatchStatus,
    LineDirection,
    StatementStatus,
    ReconciliationStatus,
} from "../banking/domain/types.js";
import type { BankStatementRepo, BankStatementLineRepo } from "../banking/persistence/bank-statement-repo.js";
import type { ReconciliationSessionRepo } from "../banking/persistence/reconciliation-repo.js";
import type { OperationContext } from "../../../engines/shared/engine-base.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-01T00:00:00Z");
const DAY_MS = 86_400_000;

function makeLine(overrides: Partial<BankStatementLine> = {}): BankStatementLine {
    return {
        id: "line-1",
        tenantId: "t1",
        statementId: "stmt-1",
        lineNo: 1,
        transactionDate: NOW,
        valueDate: null,
        amount: "1000.00",
        direction: "DEBIT" as LineDirection,
        reference: "PAY-001",
        description: "Supplier payment",
        counterparty: "ACME Corp",
        matchStatus: "UNMATCHED" as MatchStatus,
        matchConfidence: null,
        matchedPaymentId: null,
        matchedAt: null,
        matchedBy: null,
        bankReference: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function makeCandidate(overrides: Partial<PaymentMatchCandidate> = {}): PaymentMatchCandidate {
    return {
        id: "pay-1",
        paymentNumber: "PAY-001",
        totalAmount: "1000.00",
        paymentDate: NOW,
        reference: "PAY-001",
        supplierId: "sup-1",
        status: "POSTED",
        ...overrides,
    };
}

function makeStatement(overrides: Partial<BankStatement> = {}): BankStatement {
    return {
        id: "stmt-1",
        tenantId: "t1",
        entityCode: "ENT1",
        statementNumber: "BS-2026-001",
        bankAccountId: "ba-1",
        bankName: "Test Bank",
        statementDate: NOW,
        periodStart: new Date("2026-02-01T00:00:00Z"),
        periodEnd: new Date("2026-02-28T23:59:59Z"),
        openingBalance: "50000.00",
        closingBalance: "48000.00",
        currencyCode: "USD",
        source: "CSV",
        status: "IMPORTED" as StatementStatus,
        lineCount: 2,
        importedBy: "user-1",
        importedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function makeSession(overrides: Partial<ReconciliationSession> = {}): ReconciliationSession {
    return {
        id: "sess-1",
        tenantId: "t1",
        statementId: "stmt-1",
        status: "OPEN" as ReconciliationStatus,
        totalLines: 2,
        autoMatched: 0,
        manualMatched: 0,
        unmatched: 2,
        excluded: 0,
        discrepancy: "0",
        startedBy: "user-1",
        startedAt: NOW,
        completedBy: null,
        completedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function makeCtx(overrides: Partial<OperationContext> = {}): OperationContext {
    return {
        tenantId: "t1",
        actorId: "user-1",
        actorType: "USER",
        correlationId: "corr-1",
        entityCode: "ENT1",
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Mock factory for service tests
// ---------------------------------------------------------------------------

function createMocks() {
    const statementRepo: {
        [K in keyof BankStatementRepo]: ReturnType<typeof vi.fn>;
    } = {
        create: vi.fn(),
        getById: vi.fn(),
        updateStatus: vi.fn(),
        list: vi.fn(),
    };

    const lineRepo: {
        [K in keyof BankStatementLineRepo]: ReturnType<typeof vi.fn>;
    } = {
        getByStatementId: vi.fn(),
        getById: vi.fn(),
        updateMatch: vi.fn(),
        bulkCreate: vi.fn(),
        getUnmatched: vi.fn(),
    };

    const reconRepo: {
        [K in keyof ReconciliationSessionRepo]: ReturnType<typeof vi.fn>;
    } = {
        create: vi.fn(),
        getById: vi.fn(),
        getByStatementId: vi.fn(),
        updateCounts: vi.fn(),
        complete: vi.fn(),
        cancel: vi.fn(),
    };

    const paymentQueryRepo: {
        [K in keyof PaymentQueryRepo]: ReturnType<typeof vi.fn>;
    } = {
        getPostedPayments: vi.fn(),
        reconcilePayment: vi.fn(),
    };

    return { statementRepo, lineRepo, reconRepo, paymentQueryRepo };
}

// ═══════════════════════════════════════════════════════════════════════════
// autoMatch — 3-pass matching algorithm
// ═══════════════════════════════════════════════════════════════════════════

describe("autoMatch — 3-pass matching algorithm", () => {
    it("Pass 1: exact match — amount + reference + date within 3 days yields confidence 97", () => {
        const lines = [
            makeLine({
                id: "L1",
                amount: "2500.00",
                reference: "PAY-100",
                transactionDate: new Date(NOW.getTime() + 1 * DAY_MS), // 1 day later
            }),
        ];
        const candidates = [
            makeCandidate({
                id: "P1",
                totalAmount: "2500.00",
                reference: "PAY-100",
                paymentDate: NOW,
            }),
        ];

        const results = autoMatch(lines, candidates);

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
            lineId: "L1",
            paymentId: "P1",
            confidence: 97,
            matchType: "EXACT",
        });
    });

    it("Pass 2: fuzzy reference — amount match + Levenshtein <= 3 yields confidence 80-94", () => {
        // reference "PAY-101" vs candidate "PAY-104" => Levenshtein distance = 1
        const lines = [
            makeLine({
                id: "L2",
                amount: "750.00",
                reference: "PAY-101",
                transactionDate: NOW,
            }),
        ];
        const candidates = [
            makeCandidate({
                id: "P2",
                totalAmount: "750.00",
                reference: "PAY-104",
                paymentDate: new Date(NOW.getTime() + 10 * DAY_MS), // date does NOT matter for pass 2
            }),
        ];

        const results = autoMatch(lines, candidates);

        expect(results).toHaveLength(1);
        expect(results[0]!.matchType).toBe("FUZZY_REF");
        expect(results[0]!.confidence).toBeGreaterThanOrEqual(80);
        expect(results[0]!.confidence).toBeLessThanOrEqual(94);
        expect(results[0]!.lineId).toBe("L2");
        expect(results[0]!.paymentId).toBe("P2");
    });

    it("Pass 3: amount only — exact amount within 5 days yields confidence 60-79", () => {
        // No reference on the line, so passes 1 & 2 are skipped
        const lines = [
            makeLine({
                id: "L3",
                amount: "300.00",
                reference: null,
                transactionDate: new Date(NOW.getTime() + 2 * DAY_MS),
            }),
        ];
        const candidates = [
            makeCandidate({
                id: "P3",
                totalAmount: "300.00",
                reference: null,
                paymentDate: NOW,
            }),
        ];

        const results = autoMatch(lines, candidates);

        expect(results).toHaveLength(1);
        expect(results[0]!.matchType).toBe("AMOUNT_ONLY");
        expect(results[0]!.confidence).toBeGreaterThanOrEqual(60);
        expect(results[0]!.confidence).toBeLessThanOrEqual(79);
    });

    it("returns no match when amount differs", () => {
        const lines = [
            makeLine({
                id: "L4",
                amount: "500.00",
                reference: "PAY-200",
                transactionDate: NOW,
            }),
        ];
        const candidates = [
            makeCandidate({
                id: "P4",
                totalAmount: "500.01", // 1 cent off
                reference: "PAY-200",
                paymentDate: NOW,
            }),
        ];

        const results = autoMatch(lines, candidates);
        expect(results).toHaveLength(0);
    });

    it("each payment is matched at most once (no double-matching)", () => {
        // Two lines with same amount, only one candidate — first line wins
        const lines = [
            makeLine({
                id: "L5A",
                amount: "1200.00",
                reference: "INV-500",
                transactionDate: NOW,
            }),
            makeLine({
                id: "L5B",
                amount: "1200.00",
                reference: "INV-500",
                transactionDate: NOW,
            }),
        ];
        const candidates = [
            makeCandidate({
                id: "P5",
                totalAmount: "1200.00",
                reference: "INV-500",
                paymentDate: NOW,
            }),
        ];

        const results = autoMatch(lines, candidates);

        expect(results).toHaveLength(1);
        expect(results[0]!.paymentId).toBe("P5");
        expect(results[0]!.lineId).toBe("L5A");
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// BankReconciliationService — lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe("BankReconciliationService — lifecycle", () => {
    let mocks: ReturnType<typeof createMocks>;
    let service: DefaultBankReconciliationService;
    let ctx: OperationContext;

    beforeEach(() => {
        mocks = createMocks();
        service = new DefaultBankReconciliationService(
            mocks.statementRepo as unknown as BankStatementRepo,
            mocks.lineRepo as unknown as BankStatementLineRepo,
            mocks.reconRepo as unknown as ReconciliationSessionRepo,
            mocks.paymentQueryRepo as unknown as PaymentQueryRepo,
        );
        ctx = makeCtx();
    });

    // -- Test 6 --
    it("importStatement creates statement + lines", async () => {
        const statement = makeStatement();
        mocks.statementRepo.create.mockResolvedValue(statement);
        mocks.lineRepo.bulkCreate.mockResolvedValue([]);

        const result = await service.importStatement(ctx, {
            tenantId: "t1",
            entityCode: "ENT1",
            statementNumber: "BS-2026-001",
            bankAccountId: "ba-1",
            statementDate: NOW,
            periodStart: new Date("2026-02-01T00:00:00Z"),
            periodEnd: new Date("2026-02-28T23:59:59Z"),
            openingBalance: "50000.00",
            closingBalance: "48000.00",
            currencyCode: "USD",
            lines: [
                {
                    transactionDate: NOW,
                    amount: "1000.00",
                    direction: "DEBIT",
                    reference: "PAY-001",
                },
                {
                    transactionDate: NOW,
                    amount: "500.00",
                    direction: "DEBIT",
                    reference: "PAY-002",
                },
            ],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.id).toBe("stmt-1");
        }
        expect(mocks.statementRepo.create).toHaveBeenCalledOnce();
        expect(mocks.lineRepo.bulkCreate).toHaveBeenCalledOnce();
        // Verify lineNo is generated sequentially
        const bulkCallArgs = mocks.lineRepo.bulkCreate.mock.calls[0];
        expect(bulkCallArgs[2][0].lineNo).toBe(1);
        expect(bulkCallArgs[2][1].lineNo).toBe(2);
    });

    // -- Test 7 --
    it("startReconciliation creates session and marks statement IN_PROGRESS", async () => {
        const statement = makeStatement();
        const session = makeSession();
        const lines = [makeLine(), makeLine({ id: "line-2", lineNo: 2 })];

        mocks.statementRepo.getById.mockResolvedValue(statement);
        mocks.reconRepo.getByStatementId.mockResolvedValue(null);
        mocks.lineRepo.getByStatementId.mockResolvedValue(lines);
        mocks.reconRepo.create.mockResolvedValue(session);
        mocks.statementRepo.updateStatus.mockResolvedValue(
            makeStatement({ status: "IN_PROGRESS" }),
        );

        const result = await service.startReconciliation(ctx, "stmt-1");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.id).toBe("sess-1");
            expect(result.value.status).toBe("OPEN");
        }
        expect(mocks.reconRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: "t1",
                statementId: "stmt-1",
                totalLines: 2,
                startedBy: "user-1",
            }),
        );
        expect(mocks.statementRepo.updateStatus).toHaveBeenCalledWith("t1", "stmt-1", "IN_PROGRESS");
    });

    // -- Test 8 --
    it("startReconciliation returns existing OPEN session (idempotent)", async () => {
        const statement = makeStatement({ status: "IN_PROGRESS" });
        const existingSession = makeSession();

        mocks.statementRepo.getById.mockResolvedValue(statement);
        mocks.reconRepo.getByStatementId.mockResolvedValue(existingSession);

        const result = await service.startReconciliation(ctx, "stmt-1");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.id).toBe("sess-1");
        }
        // Should NOT have created a new session
        expect(mocks.reconRepo.create).not.toHaveBeenCalled();
    });

    // -- Test 9 --
    it("runAutoMatch dispatches to autoMatch and applies high-confidence matches", async () => {
        const session = makeSession();
        const statement = makeStatement();

        const unmatchedLines = [
            makeLine({ id: "L-A", amount: "2000.00", reference: "REF-X", transactionDate: NOW }),
        ];
        const candidates = [
            makeCandidate({ id: "P-A", totalAmount: "2000.00", reference: "REF-X", paymentDate: NOW }),
        ];

        mocks.reconRepo.getById.mockResolvedValue(session);
        mocks.statementRepo.getById.mockResolvedValue(statement);
        mocks.lineRepo.getUnmatched.mockResolvedValue(unmatchedLines);
        mocks.paymentQueryRepo.getPostedPayments.mockResolvedValue(candidates);
        mocks.lineRepo.updateMatch.mockResolvedValue(
            makeLine({ id: "L-A", matchStatus: "AUTO_MATCHED", matchConfidence: 97, matchedPaymentId: "P-A" }),
        );
        // refreshSessionCounts will call getByStatementId + updateCounts
        mocks.lineRepo.getByStatementId.mockResolvedValue([
            makeLine({ id: "L-A", matchStatus: "AUTO_MATCHED", matchConfidence: 97, matchedPaymentId: "P-A" }),
        ]);
        mocks.reconRepo.updateCounts.mockResolvedValue(session);

        const result = await service.runAutoMatch(ctx, "sess-1");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toHaveLength(1);
            expect(result.value[0]!.confidence).toBe(97);
            expect(result.value[0]!.matchType).toBe("EXACT");
        }

        // High-confidence (97 >= 90) should have been applied
        expect(mocks.lineRepo.updateMatch).toHaveBeenCalledWith("t1", "L-A", expect.objectContaining({
            matchStatus: "AUTO_MATCHED",
            matchConfidence: 97,
            matchedPaymentId: "P-A",
            matchedBy: "user-1",
        }));
    });

    // -- Test 10 --
    it("manualMatch updates line match status to MANUAL_MATCHED", async () => {
        const unmatchedLine = makeLine({ id: "L-M", matchStatus: "UNMATCHED" });
        const matchedLine = makeLine({
            id: "L-M",
            matchStatus: "MANUAL_MATCHED",
            matchConfidence: 100,
            matchedPaymentId: "pay-manual",
            matchedBy: "user-1",
        });

        mocks.lineRepo.getById.mockResolvedValue(unmatchedLine);
        mocks.lineRepo.updateMatch.mockResolvedValue(matchedLine);
        // For refreshSessionCounts
        mocks.reconRepo.getByStatementId.mockResolvedValue(makeSession());
        mocks.statementRepo.getById.mockResolvedValue(makeStatement());
        mocks.lineRepo.getByStatementId.mockResolvedValue([matchedLine]);
        mocks.reconRepo.updateCounts.mockResolvedValue(makeSession());

        const result = await service.manualMatch(ctx, "L-M", "pay-manual");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.matchStatus).toBe("MANUAL_MATCHED");
            expect(result.value.matchConfidence).toBe(100);
            expect(result.value.matchedPaymentId).toBe("pay-manual");
        }
        expect(mocks.lineRepo.updateMatch).toHaveBeenCalledWith("t1", "L-M", expect.objectContaining({
            matchStatus: "MANUAL_MATCHED",
            matchConfidence: 100,
            matchedPaymentId: "pay-manual",
            matchedBy: "user-1",
        }));
    });

    // -- Test 11 --
    it("unmatch reverts line to UNMATCHED", async () => {
        const matchedLine = makeLine({
            id: "L-U",
            matchStatus: "AUTO_MATCHED",
            matchConfidence: 97,
            matchedPaymentId: "pay-X",
        });
        const unmatchedLine = makeLine({ id: "L-U", matchStatus: "UNMATCHED", matchConfidence: null, matchedPaymentId: null });

        mocks.lineRepo.getById.mockResolvedValue(matchedLine);
        mocks.lineRepo.updateMatch.mockResolvedValue(unmatchedLine);
        // For refreshSessionCounts
        mocks.reconRepo.getByStatementId.mockResolvedValue(makeSession());
        mocks.statementRepo.getById.mockResolvedValue(makeStatement());
        mocks.lineRepo.getByStatementId.mockResolvedValue([unmatchedLine]);
        mocks.reconRepo.updateCounts.mockResolvedValue(makeSession());

        const result = await service.unmatch(ctx, "L-U");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.matchStatus).toBe("UNMATCHED");
            expect(result.value.matchedPaymentId).toBeNull();
        }
        expect(mocks.lineRepo.updateMatch).toHaveBeenCalledWith("t1", "L-U", expect.objectContaining({
            matchStatus: "UNMATCHED",
        }));
    });

    // -- Test 12 --
    it("unmatch rejects CONFIRMED lines", async () => {
        const confirmedLine = makeLine({
            id: "L-C",
            matchStatus: "CONFIRMED",
            matchConfidence: 100,
            matchedPaymentId: "pay-C",
        });

        mocks.lineRepo.getById.mockResolvedValue(confirmedLine);

        const result = await service.unmatch(ctx, "L-C");

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("CONFIRMED");
        }
        expect(mocks.lineRepo.updateMatch).not.toHaveBeenCalled();
    });

    // -- Test 13 --
    it("completeReconciliation calls reconcilePayment for each matched line", async () => {
        const session = makeSession();
        const matchedLines = [
            makeLine({
                id: "L-R1",
                matchStatus: "AUTO_MATCHED",
                matchConfidence: 97,
                matchedPaymentId: "pay-R1",
            }),
            makeLine({
                id: "L-R2",
                matchStatus: "MANUAL_MATCHED",
                matchConfidence: 100,
                matchedPaymentId: "pay-R2",
            }),
            makeLine({
                id: "L-R3",
                matchStatus: "UNMATCHED",
                matchedPaymentId: null,
            }),
        ];

        const completedSession = makeSession({ status: "COMPLETED", completedBy: "user-1", completedAt: NOW });

        mocks.reconRepo.getById.mockResolvedValue(session);
        mocks.lineRepo.getByStatementId.mockResolvedValue(matchedLines);
        mocks.paymentQueryRepo.reconcilePayment.mockResolvedValue(undefined);
        mocks.lineRepo.updateMatch.mockImplementation(async (_t: string, _id: string, updates: Record<string, unknown>) => {
            return makeLine({ matchStatus: updates.matchStatus as MatchStatus });
        });
        mocks.reconRepo.complete.mockResolvedValue(completedSession);
        mocks.statementRepo.updateStatus.mockResolvedValue(
            makeStatement({ status: "COMPLETED" }),
        );

        const result = await service.completeReconciliation(ctx, "sess-1");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.status).toBe("COMPLETED");
        }

        // reconcilePayment called for the 2 matched lines, not the unmatched one
        expect(mocks.paymentQueryRepo.reconcilePayment).toHaveBeenCalledTimes(2);
        expect(mocks.paymentQueryRepo.reconcilePayment).toHaveBeenCalledWith("t1", "pay-R1");
        expect(mocks.paymentQueryRepo.reconcilePayment).toHaveBeenCalledWith("t1", "pay-R2");

        // Each matched line should be CONFIRMED
        expect(mocks.lineRepo.updateMatch).toHaveBeenCalledWith("t1", "L-R1", expect.objectContaining({
            matchStatus: "CONFIRMED",
        }));
        expect(mocks.lineRepo.updateMatch).toHaveBeenCalledWith("t1", "L-R2", expect.objectContaining({
            matchStatus: "CONFIRMED",
        }));

        // Session completed and statement marked COMPLETED
        expect(mocks.reconRepo.complete).toHaveBeenCalledWith("t1", "sess-1", "user-1");
        expect(mocks.statementRepo.updateStatus).toHaveBeenCalledWith("t1", "stmt-1", "COMPLETED");
    });
});
