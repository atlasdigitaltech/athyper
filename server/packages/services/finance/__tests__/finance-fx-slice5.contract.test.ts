import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
import { deriveCompanyFxPageState } from "../services/finance-fx-company-summary.service.js";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance FX Slice 5 Company page contract",()=>{
  it("derives every setup state without consulting operational rate health",()=>{
    expect(deriveCompanyFxPageState({
      hasForeignCurrencyExposure:false,hasTenantDefault:false,hasEffectivePolicy:false,postingAccountsReady:false,
    })).toMatchObject({state:"no_exposure",complete:true,primaryAction:"none"});
    expect(deriveCompanyFxPageState({
      hasForeignCurrencyExposure:true,hasTenantDefault:false,hasEffectivePolicy:false,postingAccountsReady:false,
    })).toMatchObject({state:"tenant_missing",complete:false,primaryAction:"configure_tenant_defaults"});
    expect(deriveCompanyFxPageState({
      hasForeignCurrencyExposure:true,hasTenantDefault:true,hasEffectivePolicy:false,postingAccountsReady:false,
    })).toMatchObject({state:"effective_policy_missing",complete:false,primaryAction:"review_effective_policy"});
    expect(deriveCompanyFxPageState({
      hasForeignCurrencyExposure:true,hasTenantDefault:true,hasEffectivePolicy:true,postingAccountsReady:false,
    })).toMatchObject({state:"posting_accounts_missing",complete:false,primaryAction:"assign_posting_accounts"});
    expect(deriveCompanyFxPageState({
      hasForeignCurrencyExposure:true,hasTenantDefault:true,hasEffectivePolicy:true,postingAccountsReady:true,
    })).toMatchObject({state:"ready",complete:true,primaryAction:"none"});
  });

  it("uses neutral policy-source context and keeps account assignment inline",()=>{
    const page=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyCurrencyFxSettingsPage.tsx");
    const policy=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxPolicySummary.tsx");
    const dialog=read("packages/domain/finance/finance-workbench/src/views/currency-fx/FxPolicyOverrideDialog.tsx");
    const accounts=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxPostingAccounts.tsx");
    expect(page).not.toContain("CompanySetupStatusBanner");
    expect(page).not.toContain("CompanyFxExposureSummary");
    expect(page).toContain("CompanyFxPolicySummary");
    expect(page).toContain("FxRateSettingsSection");
    expect(page).toContain("CompanyFxPostingAccounts");
    expect(page.indexOf("CompanyFxPolicySummary data")).toBeLessThan(page.indexOf("FxRateSettingsSection navigation"));
    expect(page.indexOf("FxRateSettingsSection navigation")).toBeLessThan(page.lastIndexOf("CompanyFxPostingAccounts"));
    expect(page.lastIndexOf("CompanyFxPostingAccounts")).toBeLessThan(page.indexOf("CompanyFxAdvancedAdministration data"));
    expect(policy).toContain("Policy source");
    expect(policy).toContain("This company uses the");
    expect(policy).not.toContain("<Badge");
    expect(policy).toContain("Create Company override");
    expect(dialog).toContain("Return to tenant default");
    expect(accounts).toContain("FX gain account");
    expect(accounts).toContain("FX loss account");
    expect(accounts).toContain("Save account assignments");
    expect(accounts).not.toContain("<Badge");
  });

  it("moves operational rate requirements out of Settings while retaining governed Add Rate prefill",()=>{
    const page=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyCurrencyFxSettingsPage.tsx");
    const requirements=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxRateRequirements.tsx");
    const entityNew=read("apps/neon/app/(shell)/app/[entity]/new/page.tsx");
    expect(page).not.toContain("CompanyFxRateRequirements");
    expect(page).not.toContain("operationalHealth");
    expect(page).not.toContain("rateRequirements");
    expect(requirements).toContain("never changes Company setup completion");
    expect(requirements).toContain("Add missing rate");
    for(const field of ["from_currency","to_currency","rate_type","effective_date"])
      expect(requirements).toContain(field);
    expect(requirements).toContain("/app/fx_rate/new?");
    expect(entityNew).toContain("buildInitialRecord(descriptor,resolvedSearchParams)");
  });

  it("uses existing governed posting-role commands and refreshes Company FX readiness",()=>{
    const accounts=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxPostingAccounts.tsx");
    const postingHooks=read("packages/domain/finance/finance-workbench/src/hooks/usePostingRoleCoverage.ts");
    const companySummary=read("server/packages/services/finance/services/finance-fx-company-summary.service.ts");
    expect(accounts).toContain("useSavePostingRoleAccountMap");
    expect(postingHooks).toContain('["finance", "setup", "fx", companyCode]');
    expect(companySummary).toContain('"fx_exposure"');
    expect(companySummary).toContain("postingAccountsReady");
    expect(companySummary).toContain("affectsSetupCompletion:false");
  });
});
