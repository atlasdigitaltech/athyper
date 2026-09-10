import {expect, it, vi} from "vitest";
import {createBusinessPartnerRevealRuntimeRegistrations} from "../business-partner-reveal-runtime.js";
function fixture() {
  const bank = vi.fn(async () => "bank-result"), tax = vi.fn(async () => "tax-result"), check = vi.fn(async () => "allowed" as const);
  const resolve = vi.fn(async () => ({state: "resolved" as const, coordinates: {}}));
  const entries = createBusinessPartnerRevealRuntimeRegistrations({revealBankAccount: bank, revealTaxRegistration: tax, preflightReveal: check} as never, {resolve, preflight: check});
  return {bank, tax, check, resolve, entries};
}
it("uses the actual reveal owners and rejects cross-kind and cross-plane commands", async () => {
  const f = fixture(), bank = f.entries[0]!, tax = f.entries[1]!;
  const command = {context: {planeKey: "neon"}, businessPartnerId: "bp", bankAccountLinkId: "child", purpose: "verification"};
  expect(await bank.handler.invoke(command)).toBe("bank-result");
  expect(f.bank).toHaveBeenCalledWith(command);
  expect(() => tax.handler.invoke(command)).toThrow("BP_REVEAL_RUNTIME_COORDINATE_MISMATCH");
  expect(() => bank.handler.invoke({...command, context: {planeKey: "mesh"}})).toThrow("BP_REVEAL_RUNTIME_COORDINATE_MISMATCH");
  expect(f.tax).not.toHaveBeenCalled();
});
it("delegates readiness without invoking reveal and pins stored ownership resolution", async () => {
  const f = fixture(), entry = f.entries[0]!;
  const input = {context: {planeKey: "neon"}, operationKey: "bank_reveal", recordId: "bp", phase: "execute"};
  expect(await entry.preflight!.check(input)).toBe("allowed");
  expect(f.check).toHaveBeenCalledWith(expect.objectContaining({businessPartnerId: "bp", kind: "bank"}));
  expect(f.bank).not.toHaveBeenCalled();
  await entry.resolver.resolve({...input, entityCode: "business_partner", resolver: "organization.record.v1", target: "proposed"});
  expect(f.resolve).toHaveBeenCalledWith(expect.objectContaining({resolver: "tenant.record.v1", target: "existing"}));
  expect(() => entry.preflight!.check({...input, operationKey: "tax_reveal"})).toThrow();
});
it("refuses to register a provider without a real preflight", () => {
  expect(() => createBusinessPartnerRevealRuntimeRegistrations({} as never, {} as never)).toThrow("BP_REVEAL_PREFLIGHT_UNAVAILABLE");
});
