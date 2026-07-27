import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Finance Settings company directory UI contract", () => {
  const view = read(
    "packages/domain/finance/finance-workbench/src/views/company-hub/CompanyHubView.tsx",
  );
  const route = read(
    "apps/neon/app/(shell)/finance/setup/company/[companyCode]/page.tsx",
  );

  it("renders the company root with the scope-options-only directory", () => {
    expect(route).toContain("CompanyHubView");
    expect(view).toContain("CompanyFinanceSettingsDirectory");
    expect(view).toContain("financeSettingsDirectory");
    expect(view).toContain("useScopeOptions()");
    expect(view).not.toContain("useCompanyHub");
    expect(view).not.toContain("useFinanceSetupConflicts");
    expect(view).not.toContain("CertificationReadinessPanel");
    expect(view).not.toContain("PostabilityChip");
    expect(view).not.toContain("ReadinessJourney");
    expect(view).not.toContain("NeedsAttentionInbox");
  });

  it("provides context, search, company change, tenant links, and review navigation", () => {
    expect(view).toContain("company.legalEntityName");
    expect(view).toContain("Functional currency");
    expect(view).toContain('placeholder="Search settings"');
    expect(view).toContain(">Change company</Link>");
    expect(view).toContain(">Review configuration</Link>");
    expect(view).toContain('group.scope === "tenant"');
    expect(view).toContain("item.searchKeywords");
  });

  it("renders no completion or readiness copy in the directory", () => {
    const directoryStart = view.indexOf("export function CompanyFinanceSettingsDirectory");
    const directorySource = view.slice(directoryStart);
    expect(directorySource).not.toMatch(/>[^<{]*(?:completion|readiness|ready|attention|certification)[^<{]*</i);
  });
});
