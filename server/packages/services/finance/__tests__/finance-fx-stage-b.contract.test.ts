import { existsSync,readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance Setup Stage B delivery contract",()=>{
 it("registers policy, trace, coverage and governed rate import endpoints",()=>{
  const route=read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
  expect(route).toContain("/finance/setup/company/:companyCode/fx/resolution-trace");
  expect(route).toContain("/finance/setup/company/:companyCode/fx/overrides");
  expect(route).toContain("/finance/setup/tenant/:tenantCode/fx/policies");
  expect(route).toContain("/finance/setup/tenant/:tenantCode/fx/rates/validate-import");
  expect(route).toContain("/finance/setup/tenant/:tenantCode/fx/rates/import");
  expect(route).toContain("/finance/setup/tenant/:tenantCode/fx/rates/:rateId/replace");
  const service=read("server/packages/services/finance/services/finance-fx-policy.service.ts");
  expect(service).toContain("Highest context, scope specificity, priority and version");
  expect(service).toContain("Triangulation is disabled or no explicit pivot is configured");
  expect(service).toContain("postingRolesReady");
  const metadata=read("server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql");
  expect(metadata).toContain("WHEN f.name IN ('default_rate_type','revaluation_rate_type')");
  expect(metadata).toContain("WHEN f.name = 'missing_rate_behavior'");
  expect(metadata).toContain("WHEN f.name = 'credential_status'");
  expect(metadata).toContain('"deletion_mode":"prohibited","temporal_close_action":"end_date"');
  expect(metadata).toContain('"replacement_command_required":true');
  expect(metadata).toContain("governed_fx_policy_command_required");
  expect(metadata).toContain("/app/fx_rate/{id}/replace");
  expect(metadata).not.toContain('"deletion_mode":"end_date"');
 });

 it("locks rate and policy correction to append-only lineage",()=>{
  const rateTable=read("server/db/ddl/planes/neon/master/03_tables.sql");
  const rateIndex=read("server/db/ddl/planes/neon/master/06_indexes.sql");
  const rateGuard=read("server/db/ddl/planes/neon/master/07_functions.sql");
  const policyGuard=read("server/db/ddl/planes/neon/control/07_functions.sql");
  const rateService=read("server/packages/services/finance/services/finance-fx-rate-import.service.ts");
  const policyService=read("server/packages/services/finance/services/finance-fx-policy.service.ts");
  const operations=read("server/db/seed/platform/003_control/044_control_entity_operation_contract.sql");

  expect(rateTable).toContain("version_no");
  expect(rateTable).toContain("supersedes_id");
  expect(rateIndex).toMatch(/effective_time,[\s\S]*source[\s\S]*WHERE is_active = true/);
  expect(rateGuard).toContain("FX rate values and lineage are immutable");
  expect(policyGuard).toContain("FX policy decisions and lineage are immutable");
  expect(rateService).toContain("versionNo=current?Number(current.version_no)+1:1");
  expect(rateService).toContain("supersedes_id");
  expect(policyService).toContain("versionNo=Number(current.version_no)+1");
  expect(policyService).not.toContain("UPDATE control.fx_policy SET ledger_book_id");
  expect(operations).not.toContain("('fx_rate','delete'");
  expect(operations).not.toContain("('fx_rate','bulk_update'");
 });

 it("ships the Company setup page and routes tenant rates through governed Entity maintenance",()=>{
  const company=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyCurrencyFxSettingsPage.tsx");
  const requirements=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxRateRequirements.tsx");
  const rateSettings=read("packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateSettingsSection.tsx");
  const tenant=read("packages/domain/finance/finance-workbench/src/views/currency-fx/TenantCurrencyFxSettingsPage.tsx");
  expect(company).toContain("CompanyFxPostingAccounts");
  expect(company).toContain("FxRateSettingsSection");
  expect(company).not.toContain("CompanyFxRateRequirements");
  expect(requirements).toContain("Add missing rate");
  expect(rateSettings).toContain("navigation.rateListHref");
  expect(existsSync(resolve(root,"packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateWorkbench.tsx"))).toBe(false);
  expect(tenant).toContain("FxRateSettingsSection");
  expect(tenant).not.toContain("<table");
 });
});
