import { existsSync,readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance FX Slice 3 tenant page contract",()=>{
  it("renders policy settings, rate maintenance, and policy history without a status banner",()=>{
    const page=read("packages/domain/finance/finance-workbench/src/views/currency-fx/TenantCurrencyFxSettingsPage.tsx");
    expect(page).toContain("TenantFxPolicyEditor");
    expect(page).toContain("FxRateSettingsSection");
    expect(page).toContain("Policy history");
    expect(page).not.toContain("SetupStatusBanner");
    expect(page).not.toContain("setupStatus");
    expect(page).not.toContain("TenantFxSummaryPanels");
    expect(page).not.toContain("setup remains incomplete");
  });

  it("creates or replaces tenant policies through explicit append-only commands",()=>{
    const hooks=read("packages/domain/finance/finance-workbench/src/hooks/useCurrencyFxSetup.ts");
    const editor=read("packages/domain/finance/finance-workbench/src/views/currency-fx/TenantFxPolicyEditor.tsx");
    expect(hooks).toContain("useSaveTenantFxPolicy");
    expect(hooks).toContain('`${base}/${encodeURIComponent(policyId)}/replace`');
    expect(editor).toContain("expectedVersionNo:sourcePolicy?.versionNo");
    expect(editor).toContain("Saving always creates an immutable successor version.");
  });

  it("delegates governed rate maintenance to the Entity App without rendering rate health",()=>{
    const rates=read("packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateSettingsSection.tsx");
    const page=read("packages/domain/finance/finance-workbench/src/views/currency-fx/TenantCurrencyFxSettingsPage.tsx");
    expect(rates).toContain("navigation.rateListHref");
    expect(rates).toContain("navigation.rateAddHref");
    expect(rates).toContain("navigation.rateImportHref");
    expect(rates).toContain("/app/fx_rate/export");
    expect(page).not.toContain("rateSummary");
    expect(page).not.toContain("companyUsage");
    expect(page).not.toContain("<table");
    expect(existsSync(resolve(root,"packages/domain/finance/finance-workbench/src/views/currency-fx/FxRateWorkbench.tsx"))).toBe(false);
  });

  it("shows basic controls and gates the advanced policy editor",()=>{
    const editor=read("packages/domain/finance/finance-workbench/src/views/currency-fx/TenantFxPolicyEditor.tsx");
    expect(editor).toContain("Transaction rate type");
    expect(editor).toContain("Month-end rate type");
    expect(editor).toContain("Preferred source");
    expect(editor).toContain("Advanced policy controls");
    expect(editor).toContain("Automatic revaluation reversal");
    expect(editor).toContain("Read only until the governed revaluation executor is registered.");
    expect(editor).toContain("summary.permissions.configure.allowed");
    expect(editor).toContain("validationMessage");
    expect(editor).toContain("savePolicy.error");
    expect(editor).toContain("Boolean(validationMessage)");
  });
});
