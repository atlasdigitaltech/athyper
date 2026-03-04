// federation-engine/__tests__/ic-posting.test.ts
//
// Tests for ICPostingService — mirror JE creation for intercompany transactions.

import { describe, it, expect, vi, beforeEach } from "vitest";

import { DefaultICPostingService } from "../services/ic-posting-service.js";

import type { OperationContext } from "../../shared/engine-base.js";
import type {
  IntercompanyTransaction,
  LegalEntity,
  ICTxnStatus,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date("2026-03-03T00:00:00Z");

function makeICTxn(
  overrides: Partial<IntercompanyTransaction> = {},
): IntercompanyTransaction {
  return {
    id: "ic-1",
    tenantId: "t-1",
    sourceEntityCode: "ACME-US",
    destEntityCode: "ACME-UK",
    sourceDocId: "inv-1",
    destDocId: null,
    txnType: "PURCHASE",
    amount: "5000",
    currencyCode: "USD",
    transferPrice: null,
    armLengthPrice: null,
    sourceJeId: null,
    destJeId: null,
    nettingBatchId: null,
    status: "MIRRORED",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeEntity(overrides: Partial<LegalEntity> = {}): LegalEntity {
  return {
    id: "ent-1",
    tenantId: "t-1",
    code: "ACME-UK",
    name: "ACME UK Ltd",
    countryCode: "GB",
    functionalCurrency: "GBP",
    reportingCurrency: "GBP",
    entityType: "SUBSIDIARY",
    parentEntityId: null,
    consolidationMethod: "FULL",
    ownershipPct: "100",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Factory
// ---------------------------------------------------------------------------

function createMocks() {
  const icRepo = {
    getById: vi.fn(async () => makeICTxn()),
    updateStatus: vi.fn(
      async (_t: string, id: string, status: ICTxnStatus, updates?: any) => ({
        ...makeICTxn(),
        id,
        status,
        ...updates,
      }),
    ),
    create: vi.fn(),
    list: vi.fn(),
    getUnnetted: vi.fn(),
  };

  const entityRepo = {
    getByCode: vi.fn(async () => makeEntity()),
    getById: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    getChildren: vi.fn(),
    update: vi.fn(),
  };

  const postingService = {
    createAndPost: vi.fn(async () => ({
      ok: true,
      value: {
        id: "je-mirror-1",
        tenantId: "t-1",
        entityCode: "ACME-UK",
        jeNumber: "JE-IC-2026-00001",
        txnId: "ic-1",
        docId: "ic-1",
        docType: "INTERCOMPANY_MIRROR",
        fiscalYear: 2026,
        periodNumber: 3,
        postingDate: now,
        description: "IC Mirror: ACME-US → ACME-UK",
        totalDebit: "3950",
        totalCredit: "3950",
        currencyCode: "GBP",
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
    reverse: vi.fn(),
    getById: vi.fn(),
  };

  const documentControl = {
    generateNumber: vi.fn(
      async (_t: string, _e: string, prefix: string) => `${prefix}-2026-00001`,
    ),
    checkIdempotency: vi.fn(async () => null),
    assertVersion: vi.fn(),
  };

  const accountResolver = {
    getICReceivableAccountId: vi.fn(async () => "acc-ic-recv"),
    getICRevenueAccountId: vi.fn(async () => "acc-ic-rev"),
  };

  const fxRateProvider = {
    getRate: vi.fn(async () => "0.7900"),
  };

  const service = new DefaultICPostingService(
    icRepo as any,
    entityRepo as any,
    postingService as any,
    documentControl as any,
    accountResolver as any,
    fxRateProvider as any,
  );

  const ctx: OperationContext = {
    tenantId: "t-1",
    actorId: "user-1",
    actorType: "USER",
    correlationId: "corr-1",
    entityCode: "ACME-US",
  };

  return {
    service,
    icRepo,
    entityRepo,
    postingService,
    documentControl,
    accountResolver,
    fxRateProvider,
    ctx,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ICPostingService — mirror JE creation", () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
  });

  it("creates mirror JE with Dr IC Receivable and Cr IC Revenue", async () => {
    const result = await m.service.createMirrorJE(
      m.ctx,
      "ic-1",
      "je-source-1",
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.destJeId).toBe("je-mirror-1");
    expect(m.postingService.createAndPost).toHaveBeenCalledTimes(1);

    const jeInput = m.postingService.createAndPost.mock.calls[0][1];
    expect(jeInput.entityCode).toBe("ACME-UK");
    expect(jeInput.docType).toBe("INTERCOMPANY_MIRROR");
    expect(jeInput.txnId).toBe("ic-1");

    // Verify Dr/Cr structure
    const lines = jeInput.lines;
    expect(lines).toHaveLength(2);

    const drLine = lines.find((l: any) => l.debitAmount !== "0");
    expect(drLine).toBeDefined();
    expect(drLine.accountId).toBe("acc-ic-recv");
    expect(drLine.description).toContain("IC Receivable");

    const crLine = lines.find((l: any) => l.creditAmount !== "0");
    expect(crLine).toBeDefined();
    expect(crLine.accountId).toBe("acc-ic-rev");
    expect(crLine.description).toContain("IC Revenue");
  });

  it("translates amount via FX when currencies differ", async () => {
    // Dest entity has GBP functional currency, IC txn is in USD
    m.fxRateProvider.getRate.mockResolvedValue("0.7900");

    const result = await m.service.createMirrorJE(
      m.ctx,
      "ic-1",
      "je-source-1",
      now,
    );

    expect(result.ok).toBe(true);
    expect(m.fxRateProvider.getRate).toHaveBeenCalledWith("USD", "GBP", now);

    // Verify translated amount in JE lines
    const jeInput = m.postingService.createAndPost.mock.calls[0][1];
    const drLine = jeInput.lines.find((l: any) => l.debitAmount !== "0");
    // 5000 * 0.79 = 3950 (multiplyAmounts trims trailing zeros)
    expect(drLine.debitAmount).toBe("3950");
    expect(jeInput.currencyCode).toBe("GBP");
  });

  it("skips FX when source and dest currencies match", async () => {
    // Dest entity uses USD (same as IC txn)
    m.entityRepo.getByCode.mockResolvedValue(
      makeEntity({
        functionalCurrency: "USD",
      }),
    );

    const result = await m.service.createMirrorJE(
      m.ctx,
      "ic-1",
      "je-source-1",
      now,
    );

    expect(result.ok).toBe(true);
    expect(m.fxRateProvider.getRate).not.toHaveBeenCalled();

    // Amount used directly without translation
    const jeInput = m.postingService.createAndPost.mock.calls[0][1];
    const drLine = jeInput.lines.find((l: any) => l.debitAmount !== "0");
    expect(drLine.debitAmount).toBe("5000");
    expect(jeInput.currencyCode).toBe("USD");
  });

  it("marks IC transaction as POSTED with both JE IDs", async () => {
    const result = await m.service.createMirrorJE(
      m.ctx,
      "ic-1",
      "je-source-1",
      now,
    );

    expect(result.ok).toBe(true);
    expect(m.icRepo.updateStatus).toHaveBeenCalledWith(
      "t-1",
      "ic-1",
      "POSTED",
      { sourceJeId: "je-source-1", destJeId: "je-mirror-1" },
    );
  });

  it("fails if IC transaction not found", async () => {
    m.icRepo.getById.mockResolvedValue(null);

    const result = await m.service.createMirrorJE(
      m.ctx,
      "ic-999",
      "je-source-1",
      now,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("IC_TXN_NOT_FOUND");
    }
  });

  it("fails if IC transaction already has a mirror JE (ALREADY_MIRRORED)", async () => {
    m.icRepo.getById.mockResolvedValue(makeICTxn({ destJeId: "je-existing" }));

    const result = await m.service.createMirrorJE(
      m.ctx,
      "ic-1",
      "je-source-1",
      now,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ALREADY_MIRRORED");
    }
  });

  it("fails if FX rate not found for cross-currency IC transaction", async () => {
    m.fxRateProvider.getRate.mockResolvedValue(null);

    const result = await m.service.createMirrorJE(
      m.ctx,
      "ic-1",
      "je-source-1",
      now,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FX_RATE_NOT_FOUND");
    }
  });

  it("uses idempotency key to prevent duplicate mirror JE creation", async () => {
    await m.service.createMirrorJE(m.ctx, "ic-1", "je-source-1", now);

    const jeInput = m.postingService.createAndPost.mock.calls[0][1];
    expect(jeInput.idempotencyKey).toBe("ic-mirror:ic-1");
  });
});
