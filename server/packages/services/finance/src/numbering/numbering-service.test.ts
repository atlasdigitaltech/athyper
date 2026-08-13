import { describe, expect, it, vi } from "vitest";
import type { FinanceNumberAllocation, FinanceNumberingRepository } from "@athyper/server-contract-finance";
import { FinanceNumberingService } from "./numbering-service.js";

const actor = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" as const, correlationId: "request-1" };
const baseCommand = { actor, commandId: "command-1", idempotencyKey: "number-1", occurredAt:"2026-08-12T00:00:00.000Z", companyCodeId: "company-1", ledgerBookId: "book-1", fiscalPeriodId: "2026-08", documentId: "invoice-1", documentType: "tax_invoice", jurisdictionCode: "MY", transactionCurrencyCode: "MYR", baseCurrencyCode: "MYR" };
const policy = { id: "policy-1", revision: "r3", jurisdictionCode: "MY", documentType: "tax_invoice", mode: "fiscal_period" as const, prefix: "{jurisdiction}-{period}-", padding: 6, allowedPeriodStatuses: ["open"] as const };

describe("finance numbering", () => {
  it("pins jurisdiction policy, accounting period and FX provenance into allocation evidence", async () => {
    const allocate = vi.fn(async ({ command, policy: selected, scopeKey, formattedPrefix }: Parameters<FinanceNumberingRepository<object>["allocate"]>[0]) => ({ id: "allocation-1", tenantId: actor.tenantId, documentId: command.documentId, documentType: command.documentType, jurisdictionCode: command.jurisdictionCode, fiscalPeriodId: command.fiscalPeriodId, sequence: 7, formattedNumber: `${formattedPrefix}${String(7).padStart(selected.padding, "0")}`, policyId: selected.id, policyRevision: selected.revision, fxTrace: command.fxTrace, allocatedAt: "2026-08-12T00:00:00.000Z", scopeKey } as FinanceNumberAllocation));
    const service = createService({ allocate, allocations: [] });
    const fxTrace = { sourceCode: "BNM", sourceVersion: "daily-2026-08-11", rateId: "rate-1", rateVersion: 2, rateDate: "2026-08-11", fromCurrencyCode: "USD", toCurrencyCode: "MYR", rate: "4.4200" };
    const result = await service.allocate({ ...baseCommand, transactionCurrencyCode: "USD", fxTrace });
    expect(result).toMatchObject({ formattedNumber: "MY-2026-08-000007", policyRevision: "r3", fxTrace: { sourceVersion: "daily-2026-08-11", rateVersion: 2 } });
    expect(allocate.mock.calls[0]?.[0]).toMatchObject({ scopeKey: "tenant-1:company-1:policy-1:r3:2026-08", formattedPrefix: "MY-2026-08-" });
  });

  it("rejects closed periods and missing foreign-currency trace before allocation", async () => {
    const allocate = vi.fn();
    const closed = createService({ allocate, allocations: [], periodStatus: "hard_close" });
    await expect(closed.allocate(baseCommand)).rejects.toMatchObject({ code: "FINANCE_PERIOD_CLOSED" });
    expect(allocate).not.toHaveBeenCalled();
    const open = createService({ allocate, allocations: [] });
    await expect(open.allocate({ ...baseCommand, transactionCurrencyCode: "USD" })).rejects.toMatchObject({ code: "FINANCE_INVALID_COMMAND" });
    expect(allocate).not.toHaveBeenCalled();
  });

  it("reports missing, duplicate and explicitly voided sequences", async () => {
    const allocations = [allocation(1), allocation(2, { voidedAt: "2026-08-12T01:00:00.000Z", voidReason: "cancelled" }), allocation(4), allocation(4)];
    const report = await createService({ allocate: vi.fn(), allocations }).reconcile({ actor, policyId: "policy-1", policyRevision: "r3", fiscalPeriodId: "2026-08" });
    expect(report).toEqual({ policyId: "policy-1", policyRevision: "r3", fiscalPeriodId: "2026-08", firstSequence: 1, lastSequence: 4, allocationCount: 4, voidedSequences: [2], missingSequences: [3], duplicateSequences: [4], balanced: false });
  });

  it("scopes reconciliation to the requested policy revision", async () => {
    const listAllocations = vi.fn(async () => [] as readonly FinanceNumberAllocation[]);
    const service = new FinanceNumberingService<object>({
      policies: { async resolve() { return policy; } }, repository: { allocate: vi.fn(), listAllocations },
      foundation: { async getLedgerBook() { return undefined; }, async getCurrency() { return undefined; }, async getSourceDocument() { return undefined; }, async getBookPeriod() { return undefined; } },
      permissions: { async isAllowed() { return true; } }, transactions: { async run(_actor, work) { return work({}); } }, audit: { async record() { return undefined; } }, outbox: { async append() {} },
    });
    await service.reconcile({ actor, policyId: "policy-1", policyRevision: "3" });
    expect(listAllocations).toHaveBeenCalledWith({ tenantId: "tenant-1", policyId: "policy-1", policyRevision: "3" }, {});
  });
});

function createService(input: { allocate: FinanceNumberingRepository<object>["allocate"]; allocations: readonly FinanceNumberAllocation[]; periodStatus?: "open" | "hard_close" }) {
  return new FinanceNumberingService<object>({
    policies: { async resolve() { return policy; } },
    repository: { allocate: input.allocate, async listAllocations() { return input.allocations; } },
    foundation: { async getLedgerBook() { return undefined; }, async getCurrency() { return undefined; }, async getSourceDocument() { return undefined; }, async getBookPeriod() { return { tenantId: actor.tenantId, id: "period-gate-1", companyCodeId: "company-1", ledgerBookId: "book-1", fiscalPeriodId: "2026-08", currencyCode: "MYR", status: input.periodStatus ?? "open", version: 1 }; } },
    permissions: { async isAllowed() { return true; } }, transactions: { async run(_actor, work) { return work({}); } }, audit: { async record() { return undefined; } }, outbox: { async append() {} },
  });
}
function allocation(sequence: number, extra: Partial<FinanceNumberAllocation> = {}): FinanceNumberAllocation { return { id: `allocation-${sequence}-${Math.random()}`, tenantId: actor.tenantId, documentId: `document-${sequence}`, documentType: "tax_invoice", jurisdictionCode: "MY", fiscalPeriodId: "2026-08", sequence, formattedNumber: `MY-${sequence}`, policyId: "policy-1", policyRevision: "r3", allocatedAt: "2026-08-12T00:00:00.000Z", ...extra }; }
