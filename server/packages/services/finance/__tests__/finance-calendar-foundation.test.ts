import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expectedLegacyFiscalVariant } from "../services/fiscal-calendar.service.js";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Finance Setup Calendar foundation", () => {
  it("derives compatibility variants from the assigned versioned Calendar", () => {
    expect(expectedLegacyFiscalVariant("monthly", 1)).toBe("calendar");
    expect(expectedLegacyFiscalVariant("monthly", 4)).toBe("custom");
    expect(expectedLegacyFiscalVariant("four_four_five", 2)).toBe("fy_445");
    expect(expectedLegacyFiscalVariant("four_five_four", 2)).toBe("fy_454");
    expect(expectedLegacyFiscalVariant("five_four_four", 2)).toBe("fy_544");
    expect(expectedLegacyFiscalVariant("thirteen_period", 1)).toBe("custom");
  });

  it("rehomes the designer and visually separates definition from Company adoption", () => {
    const foundation = read("packages/domain/finance/finance-workbench/src/views/foundation/FoundationView.tsx");
    const designer = read("packages/domain/finance/finance-workbench/src/views/configure/FiscalCalendarDesigner.tsx");
    expect(foundation).toContain('activeDomain === "calendar" ? <FiscalCalendarDesigner');
    expect(designer).toContain("Step 1 · Tenant Fiscal Calendar definition");
    expect(designer).toContain("Step 2 · Company assignment and generated posting gates");
    expect(designer).toContain("Company and Book period matrix");
  });

  it("exposes a Company-scoped matrix and generation commands", () => {
    const routes = read("server/packages/services/finance/routes/finance-setup.route.ts");
    expect(routes).toContain('/finance/setup/configure/fiscal-calendar/period-matrix');
    expect(routes).toContain('/finance/setup/company/:companyCode/fiscal-calendar-assignments/:calendarId');
    expect(routes).toContain('/finance/setup/company/:companyCode/fiscal-periods/:fiscalYear/generate');
  });

  it("surfaces protected drift, missing Book gates, provenance, and generation evidence", () => {
    const service = read("server/packages/services/finance/services/fiscal-calendar.service.ts");
    for (const code of ["CALENDAR_ASSIGNMENT_OVERLAP", "CALENDAR_PROVENANCE_MISMATCH", "PERIOD_DEFINITION_DRIFT", "PERIOD_NOT_IN_CALENDAR", "NORMAL_PERIOD_OVERLAP", "BOOK_PERIOD_GATE_MISSING"]) {
      expect(service).toContain(`\"${code}\"`);
    }
    expect(service).toContain("generationKey");
    expect(service).toContain("lastGeneratedAt");
    expect(service).toContain("FISCAL_PERIOD_GENERATION_CONFLICT");
  });

  it("keeps compatibility fields synchronized and readiness-sensitive", () => {
    const calendar = read("server/packages/services/finance/services/fiscal-calendar.service.ts");
    const foundation = read("server/packages/services/finance/services/finance-foundation.service.ts");
    expect(calendar).toContain("fiscal_year_start_month =");
    expect(calendar).toContain("fiscal_year_variant =");
    expect(calendar).toContain("invalidateFinanceSetupReadiness");
    expect(foundation).toContain("legacy_calendar_consistent");
    expect(foundation).toContain("legacy_calendar_consistency");
  });
});
