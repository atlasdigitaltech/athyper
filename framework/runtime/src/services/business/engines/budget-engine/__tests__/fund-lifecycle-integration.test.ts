// budget-engine/__tests__/fund-lifecycle-integration.test.ts
//
// Integration tests for the Fund Lifecycle Service.
// Validates RESERVE → COMMIT → CONSUME → RELEASE lifecycle
// and breach detection.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DefaultFundLifecycleService } from "../services/fund-lifecycle-service.js";
import type { FundingProfile } from "../domain/types.js";
import type { OperationContext } from "../../shared/engine-base.js";

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

function createMocks() {
    const baseFP: FundingProfile = {
        id: "fp-1",
        tenantId: "t-1",
        entityCode: "ACME",
        code: "FP-2026-OPEX",
        name: "OPEX Budget 2026",
        description: null,
        level: 3,
        parentId: null,
        ouId: "ou-1",
        intentId: null,
        totalLimit: "50000",
        currencyCode: "USD",
        reservedAmount: "0",
        committedAmount: "0",
        consumedAmount: "0",
        releasedAmount: "0",
        healthStatus: "GREEN",
        utilizationPct: "0",
        trend: "STABLE",
        predictedExhaustionDate: null,
        lastReforecastAt: null,
        fiscalYear: 2026,
        isMultiYear: false,
        carryForwardRule: "NONE",
        carryForwardCap: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    let currentFP = { ...baseFP };

    const fpRepo = {
        getById: vi.fn(async () => ({ ...currentFP })),
        lockForUpdate: vi.fn(async () => ({ ...currentFP })),
        getAncestors: vi.fn(async () => []),
        updateState: vi.fn(async (_tenantId: string, _fpId: string, state: any) => {
            currentFP = { ...currentFP, ...state };
        }),
    };

    const txnRepo = {
        existsByIdempotencyKey: vi.fn(async () => false),
        create: vi.fn(async (input: any) => ({
            id: "txn-" + Math.random().toString(36).slice(2, 8),
            ...input,
        })),
    };

    const service = new DefaultFundLifecycleService(fpRepo as any, txnRepo as any);

    const ctx: OperationContext = {
        tenantId: "t-1",
        actorId: "user-1",
        actorType: "USER",
        correlationId: "corr-1",
        entityCode: "ACME",
    };

    return {
        service,
        fpRepo,
        txnRepo,
        ctx,
        baseFP,
        /** Mutate currentFP for test setup */
        setFPState: (partial: Partial<FundingProfile>) => {
            currentFP = { ...currentFP, ...partial };
        },
        getCurrentFP: () => ({ ...currentFP }),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FundLifecycleService — integration", () => {
    let m: ReturnType<typeof createMocks>;

    beforeEach(() => {
        m = createMocks();
    });

    // Test 1: RESERVE → funds locked
    it("RESERVE locks funds and health stays GREEN", async () => {
        const result = await m.service.reserve(m.ctx, {
            fpId: "fp-1",
            txnId: "txn-res-1",
            action: "RESERVE",
            amount: "10000",
            currencyCode: "USD",
            performedBy: "user-1",
        });

        expect(result.ok).toBe(true);
        expect(m.fpRepo.updateState).toHaveBeenCalledWith(
            "t-1",
            "fp-1",
            expect.objectContaining({ reservedAmount: "10000" }),
        );

        const updatedState = m.fpRepo.updateState.mock.calls[0]![2];
        expect(updatedState.healthStatus).toBe("GREEN");
    });

    // Test 2: COMMIT → reservation confirmed
    it("COMMIT moves from reserved to committed", async () => {
        m.setFPState({
            reservedAmount: "10000",
        });

        const result = await m.service.commit(m.ctx, {
            fpId: "fp-1",
            txnId: "txn-com-1",
            action: "COMMIT",
            amount: "10000",
            currencyCode: "USD",
            performedBy: "user-1",
        });

        expect(result.ok).toBe(true);
        const state = m.fpRepo.updateState.mock.calls[0]![2];
        expect(state.reservedAmount).toBe("0");
        expect(state.committedAmount).toBe("10000");
    });

    // Test 3: CONSUME → budget spent
    it("CONSUME moves from committed to consumed", async () => {
        m.setFPState({
            committedAmount: "10000",
        });

        const result = await m.service.consume(m.ctx, {
            fpId: "fp-1",
            txnId: "txn-con-1",
            action: "CONSUME",
            amount: "10000",
            currencyCode: "USD",
            performedBy: "user-1",
        });

        expect(result.ok).toBe(true);
        const state = m.fpRepo.updateState.mock.calls[0]![2];
        expect(state.committedAmount).toBe("0");
        expect(state.consumedAmount).toBe("10000");
    });

    // Test 4: RELEASE → funds returned
    it("RELEASE increases released amount", async () => {
        m.setFPState({
            reservedAmount: "10000",
        });

        const result = await m.service.release(m.ctx, {
            fpId: "fp-1",
            txnId: "txn-rel-1",
            action: "RELEASE",
            amount: "10000",
            currencyCode: "USD",
            performedBy: "user-1",
        });

        expect(result.ok).toBe(true);
        const state = m.fpRepo.updateState.mock.calls[0]![2];
        expect(state.releasedAmount).toBe("10000");
    });

    // Test 5: Over-budget → rejection
    it("rejects action when it would breach the funding limit", async () => {
        m.setFPState({
            consumedAmount: "45000",
            reservedAmount: "5000",
        });

        const result = await m.service.reserve(m.ctx, {
            fpId: "fp-1",
            txnId: "txn-over-1",
            action: "RESERVE",
            amount: "1000",
            currencyCode: "USD",
            performedBy: "user-1",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("FP_BREACH");
        }
    });

    // Test 6: Partial RELEASE
    it("partial RELEASE returns portion and recalculates health", async () => {
        m.setFPState({
            consumedAmount: "10000",
        });

        const result = await m.service.release(m.ctx, {
            fpId: "fp-1",
            txnId: "txn-prel-1",
            action: "RELEASE",
            amount: "3000",
            currencyCode: "USD",
            performedBy: "user-1",
        });

        expect(result.ok).toBe(true);
        const state = m.fpRepo.updateState.mock.calls[0]![2];
        expect(state.releasedAmount).toBe("3000");
        // Health should be recalculated — consumed=10k, released=3k, net=7k/50k = 14% → GREEN
        expect(state.healthStatus).toBe("GREEN");
    });
});
