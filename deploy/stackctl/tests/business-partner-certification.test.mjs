import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { verifyBusinessPartnerCertification } from "../src/business-partner-certification.mjs";
import { defaultRepoRoot, readYaml } from "../src/io.mjs";

const contract = readYaml(join(defaultRepoRoot, "deploy/releases/business-partner-p9.yaml"));
const recordedAt = "2026-08-29T12:00:00.000Z";
const artifact = { id: "retained-report", uri: "evidence://p9/report", sha256: "a".repeat(64) };

function qualificationFixture() {
  const root = mkdtempSync(join(tmpdir(), "athyper-bp-p9-"));
  for (const gate of contract.spec.gates) {
    const path = join(root, gate.evidence);
    mkdirSync(dirname(path), { recursive: true });
    const document = {
      apiVersion: "athyper.io/v1alpha1",
      kind: "BusinessPartnerReleaseGateEvidence",
      metadata: { id: `p9-${gate.id}` },
      spec: {
        gate: gate.id,
        status: "passed",
        environment: gate.environment,
        sourceRevision: contract.spec.sourceRevision,
        images: contract.spec.images,
        recordedAt,
        checks: Object.fromEntries(gate.requiredChecks.map((check) => [check, true])),
        artifacts: [artifact],
      },
    };
    if (gate.id === "operations") {
      document.spec.measurements = {
        requestFailureRate: 0.005,
        requestP95Milliseconds: 900,
        outboxLagSeconds: 20,
        quarantineCount: 0,
        iamDrift: 0,
        meshDrift: 0,
        readinessFailures: 0,
      };
      document.spec.canary = { cohortPercent: 1, observationMinutes: 60 };
      document.spec.rollback = {
        priorSourceRevision: "b".repeat(40),
        retainedImageSetSha256: "c".repeat(64),
        restoredImageSetSha256: "c".repeat(64),
      };
    }
    if (gate.id === "ownership") {
      document.spec.approvals = contract.spec.requiredOwners.map((role, index) => ({
        role,
        name: `Owner Person ${index + 1}`,
        decision: "approved",
        recordedAt,
        reference: `REL-P9-${index + 1}`,
      }));
    }
    writeFileSync(path, `${JSON.stringify(document)}\n`, { mode: 0o600 });
  }
  return root;
}

test("P9 certification is fail-closed when evidence is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "athyper-bp-p9-empty-"));
  const report = verifyBusinessPartnerCertification(defaultRepoRoot, { qualificationRoot: root });
  assert.equal(report.status, "blocked");
  assert.equal(report.gates.filter(({ status }) => status === "blocked").length, 7);
});

test("P9 certification accepts exact immutable evidence and named approvals", () => {
  const report = verifyBusinessPartnerCertification(defaultRepoRoot, { qualificationRoot: qualificationFixture() });
  assert.equal(report.status, "certified", report.blockers.join("\n"));
  assert.equal(report.gates.length, 7);
});

test("P9 certification rejects threshold, rollback, and owner drift", () => {
  const root = qualificationFixture();
  const operationsPath = join(root, "production/business-partner/operations.json");
  const operations = JSON.parse(readFileSync(operationsPath, "utf8"));
  operations.spec.measurements.outboxLagSeconds = 61;
  operations.spec.rollback.restoredImageSetSha256 = "d".repeat(64);
  writeFileSync(operationsPath, `${JSON.stringify(operations)}\n`, { mode: 0o600 });
  const ownershipPath = join(root, "production/business-partner/ownership.json");
  const ownership = JSON.parse(readFileSync(ownershipPath, "utf8"));
  ownership.spec.approvals[1].name = ownership.spec.approvals[0].name;
  writeFileSync(ownershipPath, `${JSON.stringify(ownership)}\n`, { mode: 0o600 });
  const report = verifyBusinessPartnerCertification(defaultRepoRoot, { qualificationRoot: root });
  assert.equal(report.status, "blocked");
  assert.match(report.blockers.join("\n"), /outboxLagSeconds/u);
  assert.match(report.blockers.join("\n"), /exact retained image-set/u);
  assert.match(report.blockers.join("\n"), /distinct person/u);
});
