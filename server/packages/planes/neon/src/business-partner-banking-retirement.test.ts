import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createBusinessPartnerAccountBankLinkageService} from "./business-partner-account-bank-linkage.js";
describe("retired Neon banking commands",()=>{
 it("does not expose usage, verification or remittance application commands",()=>{
  const service=createBusinessPartnerAccountBankLinkageService({} as never);
  for(const name of ["configureUsageScope","configureCompanyUsage","startBankVerification","getBankVerification","decideBankVerification","applyBankVerification","decideProtectedBankRegistration","applyProtectedBankRegistration"])
    expect(service).not.toHaveProperty(name);
 });
 it("removes routes instead of leaving callable legacy handlers",()=>{
  const routes=readFileSync(new URL("./business-partner-account-bank-linkage-routes.ts",import.meta.url),"utf8");
  expect(routes).not.toMatch(/business-partner-bank-verifications|\/company-usage|\/usage-scope|bank\.register\.(decide|apply)/);
 });
 it("writes the shared-PK instrument before the bank and keeps provisional facts separate",()=>{
  const source=readFileSync(new URL("./business-partner-account-bank-linkage.ts",import.meta.url),"utf8");
  expect(source.indexOf("INSERT INTO master.payment_instrument(")).toBeLessThan(source.indexOf("INSERT INTO master.bank_account("));
  expect(source).toContain("INSERT INTO master.bank_provisional_reference");
  expect(source).not.toMatch(/master\.bank_account_(?:link|usage|company_usage)\b|document\.business_partner_bank_verification|pending_verification/);
 });
});
