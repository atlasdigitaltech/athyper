import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateTaxRounding } from "../services/finance-tax-setup.service.js";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Finance Setup Phase 2 Stage C tax contract", () => {
  it("versions Tax Groups and protects effective-date resolution", () => {
    const aggregate = read("server/db/ddl/planes/neon/control/03_tables.sql");
    const indexes = read("server/db/ddl/planes/neon/control/06_indexes.sql");
    const guards = read("server/db/ddl/planes/neon/control/07_functions.sql");
    const triggers = read("server/db/ddl/planes/neon/control/08_triggers.sql");
    const blueprint = read("server/db/seed/blueprints/universal/020_tax/323_tax_groups.sql");

    expect(aggregate).toContain("control.tax_group_version");
    expect(aggregate).toContain("tgv_active_overlap_excl");
    expect(aggregate).toContain("wtc_effective_overlap_excl");
    expect(guards).toContain("guard_tax_resolution_rule_ambiguity");
    expect(guards).toContain("guard_tax_group_version_activation");
    expect(triggers).toContain("trg_trr_ambiguity");
    expect(indexes).toContain("ux_tgc_active_version_rate");
    expect(blueprint).toContain("COALESCE(tax_group_version_id, '00000000-0000-0000-0000-000000000000'::uuid)");
    expect(blueprint).toContain(") WHERE status = 'active' DO NOTHING;");
  });

  it("uses explicit, deterministic tax rounding", () => {
    expect(calculateTaxRounding(2.5, "ROUND_HALF_EVEN", 0, null).amount).toBe(2);
    expect(calculateTaxRounding(3.5, "ROUND_HALF_EVEN", 0, null).amount).toBe(4);
    expect(calculateTaxRounding(2.5, "ROUND_HALF_UP", 0, null).amount).toBe(3);
    expect(calculateTaxRounding(1.03, "ROUND_HALF_UP", 2, 0.05).amount).toBeCloseTo(1.05);

    const runtime = read("server/packages/services/business/ap/purchase_invoice/tax-calculation.service.ts");
    expect(runtime).toContain("TAX_ROUNDING_UNRESOLVED");
    expect(runtime).toContain("is_compound");
  });

  it("ships governed registration, WHT, test and editor interfaces without readiness cards", () => {
    const registration = read("server/db/ddl/planes/neon/master/03_tables.sql");
    const route = read("server/packages/services/finance/routes/finance-tax-setup.route.ts");
    const company = read("packages/domain/finance/finance-workbench/src/views/tax/CompanyTaxProfileView.tsx");
    const workbench = read("packages/domain/finance/finance-workbench/src/views/tax/TaxConfigurationWorkbench.tsx");

    expect(registration).toContain("master.organization_tax_registration");
    expect(registration).toContain("otr_scope_overlap_excl");
    expect(route).toContain("/tax/simulate");
    expect(route).toContain("/tax/registrations");
    expect(route).toContain("/tax/wht-thresholds");
    expect(company).toContain("Test tax resolution");
    expect(company).toContain("Registrations");
    expect(company).toContain("Tax groups and rounding");
    expect(company).not.toContain("data.readiness");
    expect(company).not.toContain("Action required");
    expect(workbench).toContain("Ordered components");
    expect(workbench).toContain("Save &amp; activate");
  });
});
