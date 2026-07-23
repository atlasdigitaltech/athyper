import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
import { rankPaymentInterfaceCandidates,type RoutingContext } from "../services/finance-payments-setup.service.js";

const root=resolve(import.meta.dirname,"../../../../..");const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
const context:RoutingContext={paymentMethodId:"method",direction:"OUTBOUND",companyCodeId:"company",currencyCode:"USD",asOfDate:"2026-07-20"};
describe("Finance Setup Phase 2 Stage D payments contract",()=>{
 it("seeds settlement rules with tenant-scoped, assigned ledger-book codes",()=>{
  const seed=read("server/db/seed/blueprints/modules/ap_non_po/080_payment_settlement_rules.sql");
  expect(seed).toContain("current_setting('app.seed_tenant_id', true)");
  expect(seed).toContain("book.category = 'statutory'");
  expect(seed).toContain("settlement_book.code AS book_code");
  expect(seed).not.toContain("'outbound', 'STAT'");
 });
 it("ranks interface routes by specificity before priority",()=>{
  const result=rankPaymentInterfaceCandidates([
   {bindingId:"tenant",direction:"OUTBOUND",priority:100,companyCodeId:null,currencyCode:null},
   {bindingId:"company",direction:"OUTBOUND",priority:1,companyCodeId:"company",currencyCode:null},
  ],context);
  expect(result.found).toBe(true);expect(result.winner?.bindingId).toBe("company");
 });
 it("reports equal-rank matches as ambiguity",()=>{
  const result=rankPaymentInterfaceCandidates([
   {bindingId:"a",direction:"OUTBOUND",priority:5,companyCodeId:"company",currencyCode:"USD"},
   {bindingId:"b",direction:"OUTBOUND",priority:5,companyCodeId:"company",currencyCode:"USD"},
  ],context);
  expect(result.ambiguous).toBe(true);expect(result.winner).toBeNull();
 });
 it("ships aggregate, matrix, routing, settlement and readiness interfaces",()=>{
  const service=read("server/packages/services/finance/services/finance-payments-setup.service.ts"),route=read("server/packages/services/finance/routes/finance-payments-setup.route.ts"),guards=read("server/db/ddl/control/05_functions_finance_payments_settlement.sql"),term=read("packages/domain/finance/finance-workbench/src/views/payments/PaymentTermWorkbench.tsx"),company=read("packages/domain/finance/finance-workbench/src/views/payments/CompanyPaymentsSetupView.tsx");
  expect(service).toContain("HOUSE_BANK_INELIGIBLE");expect(service).toContain("POSTING_ROLE_COVERAGE_INCOMPLETE");
  expect(route).toContain("/payments/interface-trace");expect(route).toContain("/payments/settlement-rules");
  expect(guards).toContain("guard_payment_interface_binding_conflict");expect(guards).toContain("guard_payment_settlement_book");
  expect(term).toContain("Ordered payment clauses");expect(term).toContain("Early-payment discount tiers");
  expect(company).toContain("Company Payment Policy Matrix");expect(company).toContain("Settlement Accounting editor");expect(company).toContain("Posting Role Coverage");
 });
});
