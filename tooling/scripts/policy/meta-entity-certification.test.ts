import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateMetaEntityCertification,
  validateCertificationDefinition,
  type MetaEntityCertificationDefinition,
  type MetaEntityCertificationSnapshot,
} from "./meta-entity-certification";

const definition = JSON.parse(
  readFileSync("governance/config/governance/meta-entity-certification.json", "utf8"),
) as MetaEntityCertificationDefinition;

test("definition has all final DoD criteria and an acyclic dependency graph", () => {
  assert.equal(definition.requiredCriteria.length, 13);
  assert.deepEqual(validateCertificationDefinition(definition), []);
});

test("Admin unlocks after schema/projector stability independently of Mesh", () => {
  const decision = evaluateMetaEntityCertification(definition, passingSnapshot({
    neon_mesh_production_e2e: "PENDING",
  }));
  assert.equal(decision.gates.schema_projector_stable, "READY");
  assert.equal(decision.gates.admin_controls, "READY");
  assert.equal(decision.gates.mesh_consumer, "BLOCKED");
  assert.equal(decision.decision, "NOT_CERTIFIED");
});

test("Mesh stays blocked until runtime authority is ready", () => {
  const decision = evaluateMetaEntityCertification(definition, passingSnapshot({
    published_descriptor_authority: "FAIL",
  }));
  assert.equal(decision.gates.runtime_authority, "BLOCKED");
  assert.equal(decision.gates.mesh_consumer, "BLOCKED");
});

test("all PASS criteria with evidence certify the release", () => {
  const decision = evaluateMetaEntityCertification(definition, passingSnapshot());
  assert.equal(decision.decision, "CERTIFIED");
  assert.equal(decision.gates.production_certification, "READY");
});

test("PASS cannot substitute unrelated evidence", () => {
  const snapshot = passingSnapshot();
  snapshot.criteria.rbac_review_rls = {
    status: "PASS",
    evidence: ["unrelated-report"],
  };
  const decision = evaluateMetaEntityCertification(definition, snapshot);
  assert.equal(decision.decision, "NOT_CERTIFIED");
  assert.match(
    decision.failures.join("\n"),
    /rbac_review_rls: missing required evidence contract-security/,
  );
});

function passingSnapshot(
  overrides: Partial<Record<string, "PASS" | "FAIL" | "PENDING">> = {},
): MetaEntityCertificationSnapshot {
  return {
    schemaVersion: 1,
    releaseId: "test-release",
    evaluatedAt: "2026-07-25T00:00:00.000Z",
    criteria: Object.fromEntries(definition.requiredCriteria.map((id) => [
      id,
      {
        status: overrides[id] ?? "PASS",
        evidence: definition.criteria.find((criterion) => criterion.id === id)?.evidence ?? [],
      },
    ])),
  };
}
