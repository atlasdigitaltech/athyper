import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("finance Stage 7 UI contracts", () => {
  it("keeps simple masters in Entity App and aggregate configuration in workbenches", () => {
    const hub = read("packages/domain/finance/finance-workbench/src/views/FinanceWorkbenchHub.tsx");
    const aggregate = read("packages/domain/finance/finance-workbench/src/views/configure/FinanceAggregateEditor.tsx");
    expect(hub).toContain('/app/${entity}');
    expect(hub).toContain("/workbench/finance/dimension-policies");
    expect(hub).toContain("/workbench/finance/tax-configuration");
    expect(hub).toContain("/workbench/finance/payment-interfaces");
    expect(aggregate).toContain("dimension_policy_allowed_value");
    expect(aggregate).toContain("tax_group_component");
    expect(aggregate).toContain("payment_method_interface_binding");
  });

  it("has explicit routes for every governed finance workbench", () => {
    for (const route of [
      "opening-balances", "readiness", "monthly-close", "annual-close",
      "posting-role-coverage", "cross-book",
    ]) {
      expect(existsSync(resolve(root, `apps/neon/app/(shell)/workbench/finance/${route}/page.tsx`))).toBe(true);
    }
  });

  it("binds Stage 7 Entity operations to v2 versions and protects provider secrets", () => {
    const seed = read("server/db/seed/platform/003_control/105_finance_stage7_ui_contract.sql");
    expect(seed).toContain("entity_version_id");
    expect(seed).toContain("ev.status = 'EFFECTIVE'");
    expect(seed).toContain("encrypted_provider_credentials_required");
    expect(seed).toContain("ef.name = 'config'");
  });
});
