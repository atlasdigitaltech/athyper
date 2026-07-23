import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance Setup Stage B delivery contract",()=>{
 it("registers policy, trace, coverage and governed rate import endpoints",()=>{
  const route=read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
  expect(route).toContain("/finance/setup/company/:companyCode/fx/resolution-trace");
  expect(route).toContain("/finance/setup/company/:companyCode/fx/policies");
  expect(route).toContain("/finance/setup/tenant/:tenantCode/fx/rates/validate-import");
  expect(route).toContain("/finance/setup/tenant/:tenantCode/fx/rates/import");
  const service=read("server/packages/services/finance/services/finance-fx-policy.service.ts");
  expect(service).toContain("Highest context, scope specificity, priority and version");
  expect(service).toContain("Triangulation is disabled or no explicit pivot is configured");
  expect(service).toContain("postingRolesReady");
  const metadata=read("server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql");
  expect(metadata).toContain("WHEN f.name IN ('default_rate_type','revaluation_rate_type')");
  expect(metadata).toContain("WHEN f.name = 'missing_rate_behavior'");
  expect(metadata).toContain("WHEN f.name = 'credential_status'");
  expect(metadata).toContain('"deletion_mode":"prohibited","temporal_close_action":"end_date"');
  expect(metadata).not.toContain('"deletion_mode":"end_date"');
 });

 it("ships both the Company setup page and tenant Rate Workbench",()=>{
  const company=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CurrencyFxSetupView.tsx");
  const rates=read("packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateWorkbench.tsx");
  expect(company).toContain("Required-pair coverage");
  expect(company).toContain("Resolution trace");
  expect(rates).toContain("Post validated rates");
  expect(rates).toContain("Rate history");
 });
});
