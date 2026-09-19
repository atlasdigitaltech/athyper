import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BankValidationInput, BankValidationRule } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { describe, expect, it, vi } from "vitest";
import { createBankValidationService, verifyBankRules } from "./bank-validation.js";

const bankRule: BankValidationRule = { id: "bank-1", version: 1, code: "DE.SEPA", countryCode: "DE", currencyCode: "EUR", railCode: "sepa", priority: 10, accountRequired: true, bankRequired: false, bicAllowed: true, bicRequired: false, branchRequired: false, accountPattern: "^DE[0-9]{20}$", checksumValidated: true, fixtures: [], status: "active" };
const bankInput: BankValidationInput = { countryCode: "DE", currencyCode: "EUR", railCode: "sepa", accountIdentifier: "DE89370400440532013000" };
const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "studio" } as VerifiedRequestContext;
function fixture(authorizer: Authorizer = { authorize: async () => ({ allowed: true }) }) {
  const repository = { listApplicable: vi.fn(async () => [bankRule]), list: vi.fn(async () => [bankRule]), get: vi.fn(), publish: vi.fn(async (rule: BankValidationRule) => rule) };
  return { repository, service: createBankValidationService({ authorizer, repositories: createExactPlaneRepositoryProvider({ studio: repository }) }) };
}

describe("bank-validation verification", () => {
  it("queries only normalized applicability coordinates, never the complete catalog", async () => {
    const {service, repository} = fixture();
    await expect(service.verify(context, {...bankInput, countryCode: "de", currencyCode: "eur"})).resolves.toMatchObject({valid:true});
    expect(repository.listApplicable).toHaveBeenCalledExactlyOnceWith({countryCode:"DE",currencyCode:"EUR",railCode:"sepa"});
    expect(repository.list).not.toHaveBeenCalled();
  });
  it("propagates unsupported candidate failures without catalog fallback", async () => {
    const {service, repository} = fixture();
    const error = Object.assign(new Error("unsupported"), {statusCode:503});
    repository.listApplicable.mockRejectedValueOnce(error);
    await expect(service.verify(context,bankInput)).rejects.toBe(error);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it.each(["123456789", "GB82WEST12345698765432", "DE00370400440532013000"])("does not bypass checksum validation for %s without an account pattern", accountIdentifier => {
    expect(verifyBankRules([{ ...bankRule, accountPattern: undefined }], { ...bankInput, accountIdentifier })).toMatchObject({ valid: false, issues: ["CHECKSUM_INVALID"] });
  });
  it("rejects an overlength account even when its MOD-97 check passes", () => {
    const bban = "1".repeat(31);
    const digits = String(98n - BigInt(`${bban}131400`) % 97n).padStart(2, "0");
    expect(verifyBankRules([{ ...bankRule, accountPattern: undefined }], { ...bankInput, accountIdentifier: `DE${digits}${bban}` })).toMatchObject({ valid: false, issues: ["CHECKSUM_INVALID"] });
  });
  it("normalizes presentation spaces and case before account pattern and checksum checks", () => {
    expect(verifyBankRules([bankRule], { ...bankInput, countryCode: "de", currencyCode: "eur", accountIdentifier: " de89 3704 0044 0532 0130 00 " })).toMatchObject({ valid: true });
  });
  it("preserves local account case and internal formatting", () => {
    expect(verifyBankRules([{ ...bankRule, checksumValidated: false, accountPattern: "^local Case$" }], { ...bankInput, accountIdentifier: "local Case" })).toMatchObject({ valid: true });
  });
  it.each(["BAD", "DEUT12FF", "DEUT DE FF", "DEUTDEFFXXXX", "DEUTDE!F"])("rejects malformed BIC %s", bic => {
    expect(verifyBankRules([bankRule], { ...bankInput, bic })).toMatchObject({ valid: false, issues: ["BIC_INVALID"] });
  });
  it.each(["DEUTDEFF", "DEUTDEFF500", " deutdeff ", "A1BCDE12"])("accepts structurally valid BIC %s", bic => {
    expect(verifyBankRules([bankRule], { ...bankInput, bic })).toMatchObject({ valid: true });
  });
  it("reports required fields and prohibited BIC independently", () => {
    expect(verifyBankRules([{ ...bankRule, bankRequired: true, branchRequired: true, bicAllowed: false }], { ...bankInput, accountIdentifier: " ", bic: "DEUTDEFF" })).toMatchObject({ valid: false, issues: ["ACCOUNT_REQUIRED", "BANK_REQUIRED", "BRANCH_REQUIRED", "BIC_NOT_ALLOWED"] });
    expect(verifyBankRules([{ ...bankRule, bicRequired: true }], { ...bankInput, bic: " " })).toMatchObject({ valid: false, issues: ["BIC_REQUIRED"] });
  });
  it("allows omitted optional details and evaluates supplied bank and branch patterns", () => {
    const rule = { ...bankRule, bankPattern: "^[0-9]{4}$", branchPattern: "^[0-9]{3}$" };
    expect(verifyBankRules([rule], bankInput).valid).toBe(true);
    expect(verifyBankRules([rule], { ...bankInput, bankIdentifier: "abc", branchCode: "xx" })).toMatchObject({ valid: false, issues: ["BANK_INVALID", "BRANCH_INVALID"] });
  });
  it("selects priority before currency specificity and uses code to break ties", () => {
    const generic = { ...bankRule, id: "generic", currencyCode: undefined };
    const specific = { ...bankRule, id: "specific" };
    expect(verifyBankRules([generic, specific], bankInput).ruleId).toBe("specific");
    expect(verifyBankRules([{ ...generic, priority: 11 }, specific], bankInput).ruleId).toBe("generic");
    expect(verifyBankRules([{ ...specific, id: "z", code: "ZZ" }, { ...specific, id: "a", code: "AA" }], bankInput).ruleId).toBe("a");
  });
  it("ignores inactive and inapplicable rules", () => {
    expect(verifyBankRules([{ ...bankRule, status: "draft" }, { ...bankRule, status: "retired" }, { ...bankRule, currencyCode: "USD" }, { ...bankRule, railCode: "swift" }, { ...bankRule, countryCode: "GB" }], bankInput)).toEqual({ valid: false, issues: ["BANK_RULE_NOT_FOUND"] });
  });
  it.each([{ countryCode: "" }, { countryCode: 42 }, { currencyCode: "" }, { railCode: " " }, { accountIdentifier: null }, { bic: 42 }, { bankIdentifier: "a".repeat(257) }, { extra: "ignored?" }])("rejects malformed service input %j", fields => {
    expect(() => verifyBankRules([bankRule], { ...bankInput, ...fields } as BankValidationInput)).toThrowError(expect.objectContaining({ statusCode: 400, code: "CONTROL_ADMIN_BANK_INPUT_INVALID" }));
  });
});

describe("bank-validation publication and access", () => {
  it.each([{ countryCode: "de" }, { currencyCode: "" }, { railCode: " " }, { code: " " }, { id: " " }, { version: 0 }, { priority: -1 }, { priority: 0.5 }, { priority: Number.NaN }, { priority: 32768 }, { accountRequired: "yes" }, { bicAllowed: false, bicRequired: true }, { accountPattern: "[" }, { bankPattern: "[" }, { branchPattern: "[" }, { fixtures: null }, { fixtures: [{ input: bankInput }] }])("rejects malformed rule %j without publishing", async fields => {
    const { service, repository } = fixture();
    await expect(service.publish(context, { ...bankRule, ...fields } as BankValidationRule)).rejects.toMatchObject({ statusCode: 400, code: "CONTROL_ADMIN_BANK_RULE_INVALID" });
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it.each([{ countryCode: "GB" }, { currencyCode: "USD" }, { railCode: "swift" }])("rejects unrelated negative fixtures %j", async fields => {
    const { service, repository } = fixture();
    await expect(service.publish(context, { ...bankRule, fixtures: [{ input: { ...bankInput, ...fields }, valid: false }] })).rejects.toMatchObject({ code: "CONTROL_ADMIN_BANK_RULE_INVALID" });
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it("rejects wrong expectations and publishes fixtures that exercise the rule", async () => {
    const { service, repository } = fixture();
    await expect(service.publish(context, { ...bankRule, fixtures: [{ input: bankInput, valid: false }] })).rejects.toMatchObject({ statusCode: 400 });
    const rule = { ...bankRule, fixtures: [{ input: bankInput, valid: true }, { input: { ...bankInput, accountIdentifier: "DE00370400440532013000" }, valid: false }] };
    await expect(service.publish(context, rule)).resolves.toEqual(rule);
    expect(repository.publish).toHaveBeenCalledExactlyOnceWith(rule, context.principalId, context.tenantId);
  });
  it.each(["neon", "mesh"] as const)("blocks publication from %s before accessing repositories", async planeKey => {
    const { service, repository } = fixture();
    await expect(service.publish({ ...context, planeKey }, bankRule)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it("checks dedicated permissions before reading or publishing", async () => {
    const authorize = vi.fn<Authorizer["authorize"]>(async () => ({ allowed: false, reason: "denied" }));
    const { service, repository } = fixture({ authorize });
    await expect(service.list(context)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.verify(context, bankInput)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.publish(context, bankRule)).rejects.toMatchObject({ statusCode: 403 });
    expect(authorize.mock.calls).toHaveLength(3);
    expect(authorize).toHaveBeenNthCalledWith(1, { context, permissionCode: "control.catalog.read" });
    expect(authorize).toHaveBeenNthCalledWith(2, { context, permissionCode: "control.catalog.read" });
    expect(authorize).toHaveBeenNthCalledWith(3, { context, permissionCode: "control.catalog.publish" });
    expect(repository.listApplicable).not.toHaveBeenCalled(); expect(repository.list).not.toHaveBeenCalled(); expect(repository.publish).not.toHaveBeenCalled();
  });
  it("reads only the exact plane and does not fall back", async () => {
    const { service, repository } = fixture();
    await expect(service.list(context)).resolves.toEqual([bankRule]);
    await expect(service.verify({ ...context, planeKey: "neon" }, bankInput)).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.list).toHaveBeenCalledOnce();
  });
});

it('bounds catastrophic regex backtracking in configured bank patterns',()=>{
 expect(()=>verifyBankRules([{...bankRule,checksumValidated:false,accountPattern:'^(a+)+$'}],{...bankInput,accountIdentifier:'a'.repeat(200)+'!'})).toThrowError(expect.objectContaining({statusCode:503,code:'CONTROL_ADMIN_BANK_PATTERN_UNAVAILABLE'}));
});
