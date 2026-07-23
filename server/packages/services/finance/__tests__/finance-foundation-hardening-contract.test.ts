import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const invalidationDdl = readFileSync(
  new URL("../../../../db/ddl/governance/09_finance_setup_certification_invalidation.sql", import.meta.url),
  "utf8",
);

describe("finance foundation certification invalidation", () => {
  it("supersedes only current posting-readiness evidence", () => {
    expect(invalidationDdl).toContain("cert.status IN ('CERTIFIED', 'ATTESTED')");
    expect(invalidationDdl).toContain("type.type_code = 'FIN_SETUP_READINESS'");
    expect(invalidationDdl).toContain("cert.cert_code = 'FINANCE_POSTING_READY'");
  });

  it.each([
    "master.company_code", "master.legal_entity", "master.chart_of_account", "master.gl_account",
    "master.company_code_chart_assignment", "master.company_code_gl_account", "master.ledger_book",
    "master.company_code_book_assignment", "control.fiscal_calendar_config",
    "control.fiscal_calendar_period_rule", "control.company_fiscal_calendar_assignment",
    "master.fiscal_period", "governance.book_period_status",
  ])("covers material mutations to %s", (table) => {
    expect(invalidationDdl).toMatch(new RegExp(`ON\\s+${table.replace(".", "\\.")}`));
  });
});
