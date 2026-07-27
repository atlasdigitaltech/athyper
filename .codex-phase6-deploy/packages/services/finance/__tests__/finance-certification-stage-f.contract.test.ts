import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  summarizeCertificationDomains,
  type DomainReadiness,
  type FinanceCertificationDomain,
} from "../services/finance-certification-readiness.service.js";

const root = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const domain = (
  key: FinanceCertificationDomain,
  passed: number,
  total: number,
): DomainReadiness => ({
  domain: key,
  label: key,
  state: passed === total ? "ready" : passed === 0 ? "not_started" : "blocked",
  passed,
  total,
  blockerCount: total - passed,
  warningCount: 0,
  checks: [],
  primaryAction: { label: "open", href: "/" },
});

describe("Finance certification readiness", () => {
  it("summarizes all certification domains deterministically", () => {
    const result = summarizeCertificationDomains([
      domain("currency_fx", 3, 3),
      domain("tax", 2, 4),
      domain("payments_settlement", 5, 5),
      domain("banking_treasury", 1, 3),
    ]);
    expect(result).toEqual({
      passed: 11,
      total: 15,
      blockerCount: 4,
      warningCount: 0,
      readyForCertification: false,
    });
  });

  it("keeps rollout-aware posting gates in backend services and renders evidence in Review", () => {
    const route = read("server/packages/services/finance/routes/finance-setup.route.ts");
    const service = read("server/packages/services/finance/services/finance-certification-readiness.service.ts");
    const review = read("packages/domain/finance/finance-workbench/src/views/FinanceReadinessWorkbench.tsx");
    const defaults = read("server/db/seed/platform/003_control/110_finance_phase2_stage_f_rollout.sql");
    const invalidation = read("server/db/ddl/governance/09z_finance_phase2_domain_invalidation.sql");
    const gate = read("server/db/ddl/document/07z_finance_certification_rollout.sql");

    expect(route).toContain("/finance/setup/certification-readiness");
    for (const key of ["currency_fx", "tax", "payments_settlement", "banking_treasury"]) {
      expect(service).toContain(key);
    }
    expect(review).toContain("Certification");
    expect(review).toContain("posting gate");
    expect(review).toContain("useCompanyCertificationReadiness");
    expect(defaults).toContain("'observe'");
    expect(defaults).toContain("is_enabled=true");
    expect(invalidation).toContain("trg_fin_ready_fx_policy");
    expect(invalidation).toContain("trg_fin_ready_tax_group_version");
    expect(invalidation).toContain("trg_fin_ready_payment_policy");
    expect(invalidation).toContain("trg_fin_ready_house_bank");
    expect(gate).toContain("rollout_mode<>'enforce'");
    expect(gate).toContain("fourDomainReadiness");
  });
});
