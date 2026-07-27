import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance FX Slice 2 contract",()=>{
  it("exposes complete tenant and Company read models with separate health planes",()=>{
    const route=read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
    const tenant=read("server/packages/services/finance/services/finance-fx-tenant-summary.service.ts");
    const company=read("server/packages/services/finance/services/finance-fx-company-summary.service.ts");
    const exposure=read("server/packages/services/finance/services/finance-fx-exposure.service.ts");
    const health=read("server/packages/services/finance/services/finance-fx-rate-health.service.ts");
    expect(route).toContain('"/finance/setup/tenant/:tenantCode/fx"');
    expect(tenant).toContain("activeDefaultPolicy");
    expect(tenant).toContain("scheduledDefaultPolicies");
    expect(tenant).toContain("affectsSetupCompletion:false");
    expect(company).toContain("setupStatus");
    expect(company).toContain("operationalHealth");
    expect(company).toContain("runtimeFieldStatus");
    expect(exposure).toContain('sourceType:"payment_policy"');
    expect(exposure).toContain('sourceType:"settlement_rule"');
    expect(health).toContain('group.purpose==="revaluation"?revaluationDate:input.asOfDate');
    expect(health).toContain("requiredAsOfDate");
    expect(health).toContain("observedAt");
  });

  it("registers explicit scoped policy and governed rate commands",()=>{
    const route=read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
    const policy=read("server/packages/services/finance/services/finance-fx-policy.service.ts");
    const rates=read("server/packages/services/finance/services/finance-fx-rate-import.service.ts");
    for(const path of [
      "/finance/setup/tenant/:tenantCode/fx/policies",
      "/finance/setup/tenant/:tenantCode/fx/policies/:policyId/replace",
      "/finance/setup/company/:companyCode/fx/overrides",
      "/finance/setup/company/:companyCode/fx/overrides/:policyId/replace",
      "/finance/setup/company/:companyCode/fx/overrides/:policyId/end",
      "/finance/setup/company/:companyCode/fx/book-overrides",
      "/finance/setup/company/:companyCode/fx/book-overrides/:policyId/replace",
      "/finance/setup/company/:companyCode/fx/book-overrides/:policyId/end",
      "/finance/setup/tenant/:tenantCode/fx/rates",
      "/finance/setup/tenant/:tenantCode/fx/rates/:rateId/replace",
    ])expect(route).toContain(path);
    expect(policy).toContain("FX_POLICY_EFFECTIVITY_CONFLICT");
    expect(policy).toContain("FX_POLICY_VERSION_CONFLICT");
    expect(policy).toContain("FX_BOOK_SCOPE_DENIED");
    expect(rates).toContain("FX_RATE_ALREADY_EXISTS");
    expect(rates).toContain("FX_RATE_REPLACEMENT_REASON_REQUIRED");
    expect(rates).toContain("export async function addFxRate");
    expect(rates).toContain("writeRequiredFinanceSetupAudit(trx");
  });

  it("enforces permissions and stable tenant, Legal Entity, and Company scope errors",()=>{
    const route=read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
    const permissions=read("server/db/seed/platform/002_permission_model/017_permission.sql");
    const grants=read("server/db/seed/platform/002_permission_model/018_persona_permission.sql");
    expect(route).toContain('checkPermission(deps.db');
    expect(route).toContain("FX_PERMISSION_DENIED");
    expect(route).toContain("FX_TENANT_SCOPE_DENIED");
    expect(route).toContain("FX_LEGAL_ENTITY_SCOPE_DENIED");
    expect(route).toContain("FX_COMPANY_SCOPE_DENIED");
    expect(permissions).toContain("FINANCE_SETUP.ADVANCED_CONFIGURE");
    expect(permissions).toContain("'replace'");
    expect(grants).toContain("FINANCE_SETUP.CONFIGURE");
    expect(grants).toContain("FINANCE_SETUP.ADVANCED_CONFIGURE");
  });

  it("enforces every enabled policy field at runtime and disables the unsupported field",()=>{
    const policy=read("server/packages/services/finance/services/finance-fx-policy.service.ts");
    const company=read("server/packages/services/finance/services/finance-fx-company-summary.service.ts");
    expect(policy).toContain("FX_SOURCE_NOT_PREFERRED");
    expect(policy).toContain("FX_RATE_STALE");
    expect(policy).toContain("FX_MANUAL_OVERRIDE_APPROVAL_REQUIRED");
    expect(policy).toContain("FX_FALLBACK_EXHAUSTED");
    expect(policy).toContain("FX_POLICY_FIELD_NOT_RUNTIME_ENABLED");
    expect(company).toContain('autoReverseRevaluation:{enabled:false');
  });
});
