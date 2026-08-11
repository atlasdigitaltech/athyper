import { describe, expect, it, vi } from "vitest";
import { FinanceContractError, type BookPeriodRecord, type BookPeriodRepository, type FinanceCommand, type FinanceFoundationReader, type FinancePermissionChecker, type RoundingPolicyReader } from "@athyper/server-contract-finance";
import { BookPeriodService } from "./book-period-service.js";
import { canonicalFinanceHash, assertFinanceDecimal, verifyFinanceCommand } from "./canonical.js";
import { InMemoryFinanceCommandRepository } from "./in-memory-command-repository.js";
import { FinancePostingGuard } from "./posting-guard.js";
import { roundFinanceDecimal, RoundingResolver } from "./rounding-resolver.js";

const actor = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" as const, correlationId: "correlation-1" };
const coordinates = { companyCodeId: "company-1", ledgerBookId: "book-1", fiscalPeriodId: "period-1", currencyCode: "USD" };

describe("finance canonical commands", () => {
  it("hashes object keys deterministically and rejects non-canonical decimals", () => {
    expect(canonicalFinanceHash({ amount: "10.25", dimensions: { b: 2, a: 1 } })).toBe(canonicalFinanceHash({ dimensions: { a: 1, b: 2 }, amount: "10.25" }));
    expect(() => assertFinanceDecimal("01.20")).toThrow(FinanceContractError);
    expect(() => assertFinanceDecimal("100000000000000.0000")).toThrow(FinanceContractError);
    expect(() => assertFinanceDecimal("1.00000")).toThrow(FinanceContractError);
    expect(assertFinanceDecimal("-10.250")).toBe("-10.250");
  });

  it("keeps the business fingerprint stable across transport retries", () => {
    const original=makeCommand("command-1","key-1",{amount:"10.00"});
    expect(()=>verifyFinanceCommand(original)).not.toThrow();
    expect(()=>verifyFinanceCommand({...original,commandId:"command-2",actor:{...actor,correlationId:"correlation-2"}})).not.toThrow();
    expect(()=>verifyFinanceCommand({...original,payload:{amount:"11.00"}})).toThrow(FinanceContractError);
  });

  it("replays identical commands and conflicts on same-key different input", async () => {
    const repository = new InMemoryFinanceCommandRepository<object>();
    const command = makeCommand("command-1", "key-1", { amount: "10.00" });
    const apply = vi.fn(async () => ({ resourceId: "posting-1", version: 1, output: { amount: "10.00" } }));
    await expect(repository.execute(command, {}, apply)).resolves.toMatchObject({ kind: "applied", resourceId: "posting-1" });
    await expect(repository.execute({ ...command, commandId: "command-2" }, {}, apply)).resolves.toMatchObject({ kind: "replayed", commandId: "command-1" });
    const changed = makeCommand("command-3", "key-1", { amount: "11.00" });
    await expect(repository.execute(changed, {}, apply)).resolves.toEqual({ kind: "idempotency_conflict", commandId: "command-3", existingCommandId: "command-1" });
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe("rounding resolution", () => {
  it("uses sparse-match precedence and returns immutable rule evidence", async () => {
    const reader: RoundingPolicyReader = {
      async listCandidates() { return [candidate({}, "global"), candidate({ currencyCode: "USD" }, "currency"), candidate({ companyCodeId: "company-1", currencyCode: "USD", slot: "LINE_TAX" }, "exact")]; },
      async getCurrencyDefaults() { return { currencyCode: "USD", minorUnits: 2, revision: "currency-r1" }; },
    };
    const resolved = await new RoundingResolver(reader).resolve({ tenantId: "tenant-1", companyCodeId: "company-1", currencyCode: "USD", slot: "LINE_TAX" });
    expect(resolved).toMatchObject({ source: "rule", ruleCode: "exact", specificity: 7, precisionDigits: 2, roundingIncrement: "0.05" });
    expect(resolved.evidenceHash).toHaveLength(64);
    expect(roundFinanceDecimal("1.225", resolved)).toBe("1.25");
  });

  it("supports half-even, toward-zero and away-from-zero without binary floats", () => {
    const base = { source: "rule" as const, method: "ROUND_HALF_EVEN" as const, precisionDigits: 2, roundingIncrement: "0.01", specificity: 0, revision: "r1", evidenceHash: "hash" };
    expect(roundFinanceDecimal("1.225", base)).toBe("1.22");
    expect(roundFinanceDecimal("1.235", base)).toBe("1.24");
    expect(roundFinanceDecimal("-1.239", { ...base, method: "ROUND_DOWN" })).toBe("-1.23");
    expect(roundFinanceDecimal("-1.231", { ...base, method: "ROUND_UP" })).toBe("-1.24");
  });
});

describe("book period and posting guard", () => {
  it("permits forward transitions, requires explicit reopen, and never reopens hard close", async () => {
    let current = period("soft_close", 3);
    const repository: BookPeriodRepository = { async get() { return current; }, async transition(command) { current = { ...current, status: command.targetStatus, version: current.version + 1 }; return current; } };
    const service = new BookPeriodService({repository,permissions:allowAll,transactions:{run:async(_actor,work)=>work({})},audit:{record:async()=>undefined},outbox:{append:async()=>undefined}});
    await expect(service.transition({ actor, coordinates: { ...coordinates, companyCodeId: "other-company" }, targetStatus: "open", expectedVersion: 3, authorizeReopen: true, reopenReason: "Wrong scope", reopenApprovalEvidence: { approvalId: "approval-0" } })).rejects.toMatchObject({ code: "FINANCE_INVALID_COMMAND" });
    await expect(service.transition({ actor, coordinates, targetStatus: "open", expectedVersion: 3 })).rejects.toMatchObject({ code: "FINANCE_INVALID_COMMAND" });
    await expect(service.transition({ actor, coordinates, targetStatus: "open", expectedVersion: 3, authorizeReopen: true, reopenReason: "Approved correction", reopenApprovalEvidence: { approvalId: "approval-1" } })).resolves.toMatchObject({ status: "open", version: 4 });
    current = period("hard_close", 5);
    await expect(service.transition({ actor, coordinates, targetStatus: "open", expectedVersion: 5, authorizeReopen: true })).rejects.toMatchObject({ code: "FINANCE_INVALID_COMMAND" });
  });

  it.each(["future", "soft_close", "hard_close"] as const)("rejects %s periods before source or rounding work", async status => {
    const source = vi.fn();
    const foundation: FinanceFoundationReader = {
      async getLedgerBook() { return { id: "book-1", companyCodeId: "company-1", baseCurrencyCode: "USD", active: true, assignmentRevision: "a1" }; },
      async getBookPeriod() { return period(status, 2); },
      async getCurrency() { return { currencyCode: "USD", active: true, minorUnits: 2, revision: "usd-r1" }; },
      getSourceDocument: source,
    };
    const rounding = { resolve: vi.fn() } as unknown as RoundingResolver;
    const guard = new FinancePostingGuard(foundation, allowAll, rounding);
    await expect(guard.admit({ actor, permissionCode: "finance.ledger.post", coordinates, roundingSlot: "LINE_NET", source: { sourceType: "invoice", sourceId: "invoice-1", version: 1, hash: "a".repeat(64) } })).rejects.toMatchObject({ code: "FINANCE_PERIOD_CLOSED" });
    expect(source).not.toHaveBeenCalled();
    expect(rounding.resolve).not.toHaveBeenCalled();
  });
});

const allowAll: FinancePermissionChecker = { async isAllowed() { return true; } };
function period(status: BookPeriodRecord["status"], version: number): BookPeriodRecord { return { tenantId: "tenant-1", id: "gate-1", ...coordinates, status, version }; }
function candidate(scope: Partial<{ companyCodeId: string; currencyCode: string; slot: "LINE_TAX" }>, code: string) { return { contextId: `context-${code}`, ruleId: `rule-${code}`, ruleCode: code, method: "ROUND_HALF_UP" as const, precisionDigits: 2, roundingIncrement: "0.05", revision: `${code}-r1`, ...scope }; }
function makeCommand(commandId: string, idempotencyKey: string, payload: Readonly<Record<string, unknown>>): FinanceCommand { const commandCode = "finance.test"; return { commandId, commandCode, idempotencyKey, actor, payload, requestFingerprint: canonicalFinanceHash({ commandCode, tenantId: actor.tenantId, principalId: actor.principalId, payload }) }; }
