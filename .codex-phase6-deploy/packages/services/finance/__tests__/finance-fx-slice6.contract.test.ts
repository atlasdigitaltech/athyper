import { existsSync,readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance FX Slice 6 advanced administration contract",()=>{
  it("uses governed dialogs for Company and Book overrides without a Company+Book route",()=>{
    const dialog=read("packages/domain/finance/finance-workbench/src/views/currency-fx/FxPolicyOverrideDialog.tsx");
    const advanced=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxAdvancedAdministration.tsx");
    const hooks=read("packages/domain/finance/finance-workbench/src/hooks/useCurrencyFxSetup.ts");
    expect(dialog).toContain("<Dialog");
    expect(dialog).toContain('scope:"company"|"book"');
    expect(dialog).toContain("Return to tenant default");
    expect(dialog).toContain("Return to inherited settings");
    expect(advanced).toContain("Create book override");
    expect(hooks).toContain("/fx/book-overrides");
    expect(hooks).toContain("/fx/overrides");
    expect(existsSync(resolve(root,"apps/neon/app/(shell)/finance/setup/company/[companyCode]/book"))).toBe(false);
    expect(existsSync(resolve(root,"apps/neon/app/(shell)/finance/setup/company/[companyCode]/currency-fx/book"))).toBe(false);
  });

  it("retains replacements and return transitions in policy history with atomic audit",()=>{
    const service=read("server/packages/services/finance/services/finance-fx-policy.service.ts");
    const advanced=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxAdvancedAdministration.tsx");
    expect(service).toContain("versionNo=Number(current.version_no)+1");
    expect(service).toContain("supersedes_id");
    expect(service).toContain("finance_setup.fx_policy_ended");
    expect(service).toContain("writeRequiredFinanceSetupAudit(trx");
    expect(advanced).toContain('href="/app/fx_policy"');
    expect(advanced).toContain("/app/fx_policy/");
  });

  it("gates every Book and trace command in both the UI and server route",()=>{
    const page=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyCurrencyFxSettingsPage.tsx");
    const advanced=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxAdvancedAdministration.tsx");
    const route=read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
    const summary=read("server/packages/services/finance/services/finance-fx-company-summary.service.ts");
    expect(page).toContain("data.permissions.advancedConfigure.allowed?<CompanyFxAdvancedAdministration");
    expect(advanced).toContain("if(!data.permissions.advancedConfigure.allowed)return null");
    for(const path of [
      "/finance/setup/company/:companyCode/fx/resolution-trace",
      "/finance/setup/company/:companyCode/fx/book-overrides",
      "/finance/setup/company/:companyCode/fx/book-overrides/:policyId/replace",
      "/finance/setup/company/:companyCode/fx/book-overrides/:policyId/end",
    ]){
      const start=route.indexOf(path);
      expect(start).toBeGreaterThan(-1);
      expect(route.slice(start,start+180)).toContain("PERMISSIONS.advanced");
    }
    expect(summary).toContain("input.permissions.advancedConfigure.allowed?posting.books:[]");
    expect(summary).toContain("bookOverridesHidden:!input.permissions.advancedConfigure.allowed");
  });

  it("keeps resolution tracing available to Review while Settings stays configuration-only",()=>{
    const advanced=read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxAdvancedAdministration.tsx");
    const hooks=read("packages/domain/finance/finance-workbench/src/hooks/useCurrencyFxSetup.ts");
    const metadata=read("server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql");
    const collectionApi=read("apps/neon/app/api/runtime/v1/entities/[entity]/route.ts");
    const recordApi=read("apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts");
    expect(advanced).not.toContain("Run resolution trace");
    expect(advanced).not.toContain("useFxResolutionTrace");
    expect(hooks).toContain("useFxResolutionTrace");
    expect(hooks).toContain("/fx/resolution-trace");
    expect(hooks).toContain('purpose?:"transaction"|"revaluation"');
    expect(metadata).toContain("generic_write");
    expect(metadata).toContain("allow_generic_create");
    expect(metadata).toContain("allow_generic_update");
    expect(metadata).toContain("allow_generic_delete");
    expect(metadata).toContain("entity_name = 'fx_policy'");
    expect(collectionApi).toContain("FX_POLICY_GOVERNED_COMMAND_REQUIRED");
    expect(recordApi).toContain("FX_POLICY_DELETE_NOT_SUPPORTED");
  });
});
