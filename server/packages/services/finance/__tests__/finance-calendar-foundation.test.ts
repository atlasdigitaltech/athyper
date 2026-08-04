import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Finance Settings Calendar foundation", () => {
  it("keeps definition and Company adoption as settings without an operational matrix", () => {
    const foundation = read("packages/domain/finance/finance-workbench/src/views/foundation/FoundationView.tsx");
    const designer = read("packages/domain/finance/finance-workbench/src/views/configure/FiscalCalendarDesigner.tsx");
    expect(foundation).toContain('import { FiscalCalendarDesigner }');
    expect(foundation).toContain("<FiscalCalendarDesigner companyCode=");
    expect(designer).toContain("Tenant Fiscal Calendar definition");
    expect(designer).toContain("Company assignment and period generation");
    expect(designer).not.toContain("Company and Book period matrix");
    expect(foundation).not.toContain("Foundation readiness:");
    expect(foundation).not.toContain("Completion checks");
  });

  it("retains Company-scoped generation APIs for commands and Review", () => {
    const routes = read("server/packages/services/finance/routes/finance-setup.route.ts");
    expect(routes).toContain("/finance/setup/configure/fiscal-calendar/period-matrix");
    expect(routes).toContain("/finance/setup/company/:companyCode/fiscal-calendar-assignments/:calendarId");
    expect(routes).toContain("/finance/setup/company/:companyCode/fiscal-periods/:fiscalYear/generate");
  });

  it("surfaces protected drift, missing Book gates, provenance, and generation evidence", () => {
    const service = read("server/packages/services/finance/services/fiscal-calendar.service.ts");
    for (const code of [
      "CALENDAR_ASSIGNMENT_OVERLAP",
      "CALENDAR_PROVENANCE_MISMATCH",
      "PERIOD_DEFINITION_DRIFT",
      "PERIOD_NOT_IN_CALENDAR",
      "NORMAL_PERIOD_OVERLAP",
      "BOOK_PERIOD_GATE_MISSING",
    ]) {
      expect(service).toContain(`\"${code}\"`);
    }
    expect(service).toContain("generationKey");
    expect(service).toContain("lastGeneratedAt");
    expect(service).toContain("FISCAL_PERIOD_GENERATION_CONFLICT");
  });

  it("uses the versioned assignment as the sole Calendar authority in Review", () => {
    const calendar = read("server/packages/services/finance/services/fiscal-calendar.service.ts");
    const foundation = read("server/packages/services/finance/services/finance-foundation.service.ts");
    expect(calendar).not.toContain("fiscal_year_start_month =");
    expect(calendar).not.toContain("fiscal_year_variant =");
    expect(calendar).toContain("invalidateFinanceSetupReadiness");
    expect(foundation).toContain("calendar_definition_valid");
    expect(foundation).toContain("calendar_definition");
    expect(foundation).toContain("ledger.book_period_status");
  });
});
