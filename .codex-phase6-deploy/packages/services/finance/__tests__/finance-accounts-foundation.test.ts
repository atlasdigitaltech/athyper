import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FinanceSetupConflictError,
  assertPrimaryOperatingInvariant,
  validateChartAssignmentType,
} from "../services/finance-setup-mutations.service.js";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Finance Setup Accounts foundation", () => {
  it("confirms Chart and GL Account canonical Entity metadata", () => {
    const entities = read("server/db/seed/platform/003_control/040_control_entity_contract.sql");
    const fields = read("server/db/seed/platform/003_control/044_control_entity_operation_contract.sql");
    const relations = read("server/db/seed/platform/003_control/043_control_entity_relation_contract.sql");

    expect(entities).toContain("'chart_of_account'");
    expect(entities).toContain("'gl_account'");
    for (const field of ["framework", "country_code", "account_range", "version", "is_locked"]) {
      expect(fields).toContain(`'${field}'`);
    }
    for (const field of ["chart_of_account_id", "parent_id", "account_class", "node_type", "normal_balance", "subledger_type", "currency_code"]) {
      expect(fields).toContain(`'${field}'`);
    }
    expect(relations).toContain("('chart_of_account', 'gl_accounts'");
    expect(relations).toContain("('gl_account', 'chart_of_account'");
    expect(fields).toContain("/app/chart_of_account/new");
    expect(fields).toContain("/app/gl_account/new");
  });

  it("accepts only the Phase 1 Chart assignment types", () => {
    for (const type of ["operating", "local", "group", "reporting"]) {
      expect(() => validateChartAssignmentType(type)).not.toThrow();
    }
    expect(() => validateChartAssignmentType("tax_only")).toThrow("Unsupported Chart assignment type");
  });

  it("prevents loss or duplication of the effective primary operating Chart", () => {
    expect(() => assertPrimaryOperatingInvariant({ active: 1, primary: 1 }, { active: 2, primary: 1 })).not.toThrow();
    expect(() => assertPrimaryOperatingInvariant({ active: 1, primary: 1 }, { active: 0, primary: 0 })).toThrow(FinanceSetupConflictError);
    expect(() => assertPrimaryOperatingInvariant({ active: 2, primary: 1 }, { active: 2, primary: 2 })).toThrow("Exactly one");
    expect(() => assertPrimaryOperatingInvariant({ active: 2, primary: 1 }, { active: 2, primary: 0 })).toThrow("Exactly one");
  });

  it("keeps account mutations Company-scoped and refreshes projection and readiness", () => {
    const routes = read("server/packages/services/finance/routes/finance-setup.route.ts");
    const mutations = read("server/packages/services/finance/services/finance-setup-mutations.service.ts");
    const configure = read("server/packages/services/finance/services/finance-configure.service.ts");

    expect(routes).toContain('/finance/setup/company/:companyCode/chart-assignments');
    expect(routes).toContain('/finance/setup/company/:companyCode/gl-controls/bulk');
    expect(routes).toContain('/finance/setup/company/:companyCode/gl-controls/:controlId');
    expect(mutations).toContain("master.fn_refresh_mv_cpa()");
    expect(mutations).toContain("UPDATE governance.cycle_certification cert");
    expect(mutations).toContain("cert.status IN ('CERTIFIED', 'ATTESTED')");
    expect(configure).toContain("FROM master.company_code cc");
    expect(configure).toContain("JOIN master.company_code_chart_assignment ccca");
  });
});
