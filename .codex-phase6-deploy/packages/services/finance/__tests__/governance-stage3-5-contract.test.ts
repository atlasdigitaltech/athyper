import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("finance governance Stage 3-5 contracts", () => {
  it("publishes the canonical opening-balance cycle without staging tables", () => {
    const seed = read("server/db/seed/blueprints/modules/governance/010_finance_close_governance_templates.sql");
    expect(seed).toContain("OPENING_BALANCE_MIGRATION");
    expect(seed).toContain("document.import_request");
    expect(seed).not.toContain("document.opening_balance_batch");
    expect(seed).not.toContain("document.opening_balance_line");
  });

  it("keeps production posting enforcement release gated and tenant aware", () => {
    const functions = read("server/db/ddl/document/05_functions.sql")+read("server/db/ddl/document/07z_finance_certification_rollout.sql");
    const flags = read("server/db/seed/platform/003_control/054_control_feature_flag_contract.sql");
    expect(functions).toContain("trg_je_finance_readiness_gate_fn");
    expect(functions).toContain("FINANCE_POSTING_READY");
    expect(functions).toContain("tenant_overrides");
    expect(functions).toContain("WITH latest_run AS");
    expect(functions).toContain("cert.status = 'ATTESTED'");
    expect(functions).toContain("task.is_mandatory AND task.status <> 'COMPLETED'");
    expect(flags).toContain("finance.posting_readiness_gate");
    expect(flags).toMatch(/finance\.posting_readiness_gate[\s\S]*?false/);
    expect(functions).toContain("resolve_finance_posting_rollout_mode");
  });

  it("wires executable system checks and evidence-bearing workbench routes", () => {
    const route = read("server/packages/services/finance/routes/period-close.route.ts");
    const seed = read("server/db/seed/blueprints/modules/governance/010_finance_close_governance_templates.sql");
    const service = read("server/packages/services/finance/services/finance-governance.service.ts");
    expect(route).toContain("evaluateFinanceGovernanceTask");
    expect(route).toContain("SYSTEM_TASK_REQUIRES_EVALUATION");
    expect(route).toContain("TASK_DEPENDENCY_BLOCKED");
    expect(route).toContain("/period-command");
    expect(route).toContain("/certifications");
    expect(route).toContain("PERIOD_REOPEN_REASON_REQUIRED");
    expect(route).toContain("INVALID_PERIOD_TRANSITION");

    const systemHandlers = [...seed.matchAll(/'SYSTEM','([^']+)'/g)].map((match) => match[1]!);
    expect(systemHandlers.length).toBeGreaterThan(0);
    for (const handler of new Set(systemHandlers)) expect(service).toContain(`\"${handler}\"`);
  });
});
