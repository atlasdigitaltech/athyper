import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchScopeOptions,
} from "../../../../../packages/domain/finance/finance-workbench/src/hooks/useScopeOptions.js";
import {
  FINANCE_SETTINGS_DIRECTORY,
} from "../../../../../packages/domain/finance/finance-workbench/src/lib/finance-setup.workspace.js";
import {
  resolveAccessibleCompany,
  resolveCompanyEntryMode,
} from "../../../../../packages/domain/finance/finance-workbench/src/lib/company-selection.js";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const scopePayload = {
  tenantId: "tenant-1",
  tenantCode: "T1",
  tenantName: "Tenant One",
  activeLegalEntityId: "le-1",
  activeLegalEntityCode: "LE1",
  activeLegalEntityName: "Legal Entity One",
  defaultCompanyCode: "MY01",
  legalEntities: [{ id: "le-1", code: "LE1", name: "Legal Entity One" }],
  companies: [{
    id: "company-1",
    code: "MY01",
    name: "Malaysia Company",
    functionalCurrency: "MYR",
    legalEntityId: "le-1",
    legalEntityCode: "LE1",
    legalEntityName: "Legal Entity One",
    fiscalYearStartMonth: 1,
  }],
  featureFlags: { financeSettingsDirectory: true },
};

describe("Finance Settings Slice 7 testing and rollout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the enabled directory through scope-options without readiness network calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(scopePayload),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchScopeOptions();
    expect(result.featureFlags.financeSettingsDirectory).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/finance/master/scope-options");
    const requested = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requested.some((url) => /readiness|conflicts|certification|posting-preview/.test(url))).toBe(false);
  });

  it("keeps the directory source free of readiness hooks", () => {
    const view = read("packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx");
    const directoryStart = view.indexOf("export function CompanyFinanceSettingsDirectory");
    const directorySource = view.slice(directoryStart);
    for (const forbidden of [
      "useCompanyHub",
      "useFinanceSetupConflicts",
      "useCompanyCertificationReadiness",
      "useAccountPostability",
      "usePostingRoleCoverage",
    ]) {
      expect(directorySource).not.toContain(forbidden);
    }
    expect(directorySource).toContain("useScopeOptions");
  });

  it("renders all five settings categories with descriptions, permissions, and Open actions", () => {
    const company = FINANCE_SETTINGS_DIRECTORY.groups.find((group) => group.scope === "company");
    expect(company?.items.map((item) => item.label)).toEqual([
      "Foundation",
      "Currency & FX",
      "Tax",
      "Payments",
      "Banking",
    ]);
    for (const item of company?.items ?? []) {
      expect(item.description.trim().length).toBeGreaterThan(10);
      expect(item.requiredPermissions.length).toBeGreaterThan(0);
      expect(item.routeSegment).toBeTruthy();
    }
    const view = read("packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx");
    expect(view).toContain(">Open");
  });

  it("contains accessible landmarks, labels, names, and keyboard-native actions", () => {
    const view = read("packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx");
    expect(view).toContain("<main");
    expect(view).toContain("<section aria-labelledby=");
    expect(view).toContain('<span className="sr-only">Search Finance settings</span>');
    expect(view).toContain('type="search"');
    expect(view).toContain("<form");
    expect(view).toContain("<select");
    expect(view).toContain("<Link");
    expect(view).not.toContain('role="button"');
  });

  it("restricts company selection to the accessible scope list", () => {
    const companies = scopePayload.companies;
    expect(resolveAccessibleCompany(companies, "MY01")?.code).toBe("MY01");
    expect(resolveAccessibleCompany(companies, "FORBIDDEN")).toBeNull();
    expect(resolveCompanyEntryMode(companies, "MY01")).toEqual({
      kind: "redirect",
      companyCode: "MY01",
    });
  });

  it("gates advanced FX commands in the UI and server route", () => {
    const page = read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyCurrencyFxSettingsPage.tsx");
    const advanced = read("packages/domain/finance/finance-workbench/src/views/currency-fx/CompanyFxAdvancedAdministration.tsx");
    const route = read("server/packages/services/finance/routes/finance-fx-setup.route.ts");
    expect(page).toContain("data.permissions.advancedConfigure.allowed?<CompanyFxAdvancedAdministration");
    expect(advanced).toContain("if(!data.permissions.advancedConfigure.allowed)return null");
    expect(route).toContain("PERMISSIONS.advanced");
  });

  it("uses a data-neutral feature flag to switch only the company landing view", () => {
    const seed = read("server/db/seed/platform/003_control/112_finance_settings_directory_rollout.sql");
    const route = read("server/packages/services/finance/routes/finance.route.ts");
    const landing = read("packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx");
    const legacy = read("packages/domain/finance/finance-workbench/src/views/company-hub/LegacyCompanyHubView.tsx");

    expect(seed).toContain("'finance.settings_directory'");
    expect(seed).toContain('"rollback_requires_data_change":false');
    expect(seed).not.toMatch(/ON CONFLICT[\s\S]*is_enabled\s*=\s*EXCLUDED\.is_enabled/);
    expect(route).toContain('isEnabled("finance.settings_directory", tenantId)');
    expect(landing).toContain("financeSettingsDirectory === false");
    expect(landing).toContain("<LegacyCompanyHubView");
    expect(landing).toContain("<CompanyFinanceSettingsDirectory");
    expect(legacy).toContain("useCompanyHub");
    expect(legacy).toContain("useFinanceSetupConflicts");
  });

  it("keeps status language out of the enabled Settings directory", () => {
    const view = read("packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx");
    const directoryStart = view.indexOf("export function CompanyFinanceSettingsDirectory");
    const directorySource = view.slice(directoryStart);
    for (const phrase of [
      "Needs setup",
      "Operational attention",
      "Ready to post",
      "completion percentage",
      "certification badge",
    ]) {
      expect(directorySource).not.toContain(phrase);
    }
  });

  it("keeps Review opt-in and backend-driven", () => {
    const directory = read("packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx");
    const review = read("packages/domain/finance/finance-workbench/src/views/FinanceReadinessWorkbench.tsx");
    const gate = read("server/db/ddl/document/07z_finance_certification_rollout.sql");
    expect(directory).toContain(">Review configuration</Link>");
    expect(review).toContain("useCompanyHub");
    expect(review).toContain("useFinanceSetupConflicts");
    expect(review).toContain("finding.actionHref");
    expect(review).toContain('source: "posting"');
    expect(gate).toContain("fourDomainReadiness");
  });
});
