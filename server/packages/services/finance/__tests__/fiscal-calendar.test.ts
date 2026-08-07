import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildTemplateRules } from "../services/fiscal-calendar.service.js";

describe("fiscal calendar templates", () => {
  it("builds monthly opening, 12 normal periods, and semantic adjustment", () => {
    const rules = buildTemplateRules("monthly", 12);
    expect(rules).toHaveLength(14);
    expect(rules[0]).toMatchObject({ periodNumber: 0, periodType: "opening", anchor: "year_start" });
    expect(rules.filter((rule) => rule.periodType === "normal")).toHaveLength(12);
    expect(rules.at(-1)).toMatchObject({ periodNumber: 13, periodType: "adjustment", anchor: "year_end" });
  });

  it("builds a 4-4-5 year and marks only the final normal period for leap-week absorption", () => {
    const normal = buildTemplateRules("four_four_five", 12)
      .filter((rule) => rule.periodType === "normal");
    expect(normal.map((rule) => rule.durationValue)).toEqual([4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]);
    expect(normal.filter((rule) => rule.absorbsLeapWeek).map((rule) => rule.periodNumber)).toEqual([12]);
  });

  it("keeps period 13 normal in a thirteen-period calendar", () => {
    const rules = buildTemplateRules("thirteen_period", 13);
    expect(rules.find((rule) => rule.periodNumber === 13)).toMatchObject({
      periodType: "normal", durationUnit: "week", durationValue: 4,
    });
    expect(rules.find((rule) => rule.periodNumber === 14)?.periodType).toBe("adjustment");
  });
});

describe("fiscal calendar DDL contract", () => {
  const tableDdl = readFileSync(
    new URL("../../../../db/ddl/planes/neon/control/03_tables.sql", import.meta.url), "utf8",
  );
  const functionDdl = readFileSync(
    new URL("../../../../db/ddl/planes/neon/control/07_fiscal_calendar_functions.sql", import.meta.url), "utf8",
  );
  const periodDdl = readFileSync(
    new URL("../../../../db/ddl/planes/neon/master/03_tables.sql", import.meta.url), "utf8",
  );
  const rlsDdl = readFileSync(
    new URL("../../../../db/ddl/planes/neon/control/10_rls.sql", import.meta.url), "utf8",
  );

  it("separates reusable definitions, rules, and company assignments", () => {
    expect(tableDdl).toContain("control.fiscal_calendar_config");
    expect(tableDdl).toContain("control.fiscal_calendar_period_rule");
    expect(tableDdl).toContain("control.company_fiscal_calendar_assignment");
  });

  it("derives adjustment semantics from period_type and centralises posting-date resolution", () => {
    expect(periodDdl).toContain("GENERATED ALWAYS AS (period_type = 'adjustment')");
    expect(functionDdl).toContain("FUNCTION master.resolve_fiscal_period");
    expect(functionDdl).toContain("p_include_special OR period.period_type = 'normal'");
  });

  it("forces tenant RLS on all calendar control tables", () => {
    for (const table of [
      "fiscal_calendar_config", "fiscal_calendar_period_rule", "company_fiscal_calendar_assignment",
    ]) {
      expect(rlsDdl).toContain(`ALTER TABLE control.${table} ENABLE ROW LEVEL SECURITY`);
      expect(rlsDdl).toContain(`ALTER TABLE control.${table} FORCE ROW LEVEL SECURITY`);
      expect(rlsDdl).toContain(`tenant_id = shared.current_tenant_id()`);
    }
  });
});
