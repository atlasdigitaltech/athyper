import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../../..");

describe("Meta Entity Contract M7 rollout wiring", () => {
  it("defines all eight required CI jobs", () => {
    const workflow = source(".github/workflows/meta-entity-contract.yml");
    for (const job of [
      "contract-static", "contract-postgres", "contract-upgrade", "contract-security",
      "contract-artifact", "contract-drift", "contract-e2e", "contract-performance",
    ]) {
      expect(workflow).toContain(`  ${job}:`);
    }
  });

  it("provides a unified drift, exposure and security audit view", () => {
    const ddl = source("server/db/ddl/control/07zz_meta_entity_contract_m7_audit.sql");
    expect(ddl).toContain("control.v_meta_entity_contract_audit");
    expect(ddl).toContain("published_version_id");
    expect(ddl).toContain("current_draft_version_id");
    expect(ddl).toContain("relational_drift");
    expect(ddl).toContain("hash_or_readiness_drift");
    expect(ddl).toContain("plane_eligibility");
    expect(ddl).toContain("security_posture_drift");
    expect(ddl).toContain("remediation_guidance");
  });

  it("exports legacy graphs while quarantining ambiguity and excluding counters", () => {
    const report = source("server/db/scripts/reports/report-meta-entity-contract-migration.ts");
    expect(report).toContain("QUARANTINED");
    expect(report).toContain("numbering_configurations");
    expect(report).toContain("lifecycle_masks");
    expect(report).toContain("action_rules");
    expect(report).toContain("flow_sections");
    expect(report).toContain("flow_fields");
    expect(report).toContain("Runtime numbering counters are counted only");
    expect(report).not.toContain("counter.last_value");
    expect(report).toContain("Multiple relational numbering configurations require explicit ordered hydration.");
  });

  it("implements automatic stops and incident-safe rollback", () => {
    const gate = source("scripts/policy/meta-entity-rollout-gate.ts");
    for (const code of [
      "CROSS_TENANT_ACCESS", "PARTIAL_PUBLICATION", "HASH_MISMATCH",
      "DESCRIPTOR_DRIFT", "CACHE_INVALIDATION_FAILURE",
      "ROUTE_ERROR_REGRESSION", "SLO_REGRESSION",
    ]) {
      expect(gate).toContain(code);
    }
    expect(gate).toContain("releaseWindowsStable >= 2");
    expect(gate).toContain("repointPreviousImmutableVersion: true");
    expect(gate).toContain("preserveFailedArtifactAndAudit: true");
    expect(gate).toContain("reverseAdditiveDdl: false");
  });
});

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}
