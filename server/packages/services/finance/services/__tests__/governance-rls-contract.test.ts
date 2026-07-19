import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const governanceRls = [
  readFileSync(new URL("../../../../../db/ddl/governance/08_rls.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../../../../../db/ddl/governance/08z_legal_hold_rls.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../../../../../db/ddl/master/08_rls.sql", import.meta.url), "utf8"),
].join("\n");

const governanceTables = [
  "book_period_status",
  "comment_moderation",
  "cycle_carryforward_rule",
  "cycle_certification",
  "cycle_cross_dependency",
  "cycle_deviation",
  "cycle_phase",
  "cycle_run",
  "cycle_task",
  "cycle_task_category",
  "cycle_task_dependency",
  "cycle_task_template",
  "cycle_type",
  "legal_hold",
  "legal_hold_manifest",
  "report_pack",
] as const;

describe("governance tenant-isolation DDL contract", () => {
  for (const table of governanceTables) {
    it(`enables and forces RLS on governance.${table}`, () => {
      expect(governanceRls).toContain(`ALTER TABLE governance.${table} ENABLE ROW LEVEL SECURITY`);
      expect(governanceRls).toMatch(
        new RegExp(`ALTER TABLE governance\\.${table} FORCE\\s+ROW LEVEL SECURITY`),
      );
    });
  }

  it("uses tenant-scoped read and write predicates for new governance evidence tables", () => {
    for (const table of ["report_pack", "legal_hold_manifest"]) {
      const start = governanceRls.indexOf(`ALTER TABLE governance.${table} ENABLE ROW LEVEL SECURITY`);
      expect(start).toBeGreaterThanOrEqual(0);
      const section = governanceRls.slice(start, start + 4_500);
      expect(section).toContain("tenant_id = shared.current_tenant_id_soft()");
      expect(section).toContain("tenant_id = shared.current_tenant_id()");
    }
  });
});
