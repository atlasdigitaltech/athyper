import { readFileSync } from "node:fs";
import { createR8ReviewDrafts } from "./prepare-business-partner-r8-qualification.mjs";
import {
  R8_GATES,
  R8_PARITY_CATEGORIES,
  R8_ACCESSIBILITY_CHECKS,
  R8_OWNERS,
  sha256,
} from "./business-partner-r8-evidence.mjs";
export const baseManifest = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../../governance/config/governance/business-partner-r8-qualification.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const id = (n) => `12000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function testArtifacts() {
  const drafts = createR8ReviewDrafts();
  for (const artifact of Object.values(drafts))
    Object.assign(artifact, {
      result: "passed",
      sourceRevision: "a".repeat(40),
      targetRef: "target:test-production",
      startedAt: "2026-09-05T00:00:00Z",
      completedAt: "2026-09-05T00:05:00Z",
    });
  drafts.target_evidence_lifecycle.evidence = {
    immutable: true,
    retainedUntil: "2027-01-01T00:00:00Z",
    locationRef: "evidence:test:r8",
    objectVersionRef: "object:test:1",
    retentionAttestationRef: "attestation:test:1",
    retentionMode: "COMPLIANCE",
    retentionVerified: true,
  };
  drafts.manual_accessibility.evidence = {
    standard: "WCAG 2.2 AA",
    zoomPercent: 200,
    viewports: ["1440x900", "412x915"],
    assistiveTechnologies: ["Test screen reader with browser"],
    reviewer: { name: "Test Reviewer", role: "accessibility_specialist" },
    reviewAttestationRef: "review:test:accessibility",
    checks: R8_ACCESSIBILITY_CHECKS.map((id) => ({
      id,
      result: "passed",
      evidenceRef: `review:test:${id}`,
    })),
  };
  const categories = R8_PARITY_CATEGORIES;
  drafts.clean_upgrade_parity.evidence = {
    driftCount: 0,
    cleanDatabaseRef: "database:test:clean",
    upgradeDatabaseRef: "database:test:upgrade",
    supportedUpgradeBaselineRef: "baseline:test:1",
    catalogReport: {
      schemaVersion: 1,
      environment: "production",
      sourceRevision: "a".repeat(40),
      targetRef: "target:test-production",
      databases: {
        clean: { system_identifier: "1", database_oid: "1" },
        upgrade: { system_identifier: "1", database_oid: "2" },
      },
      comparedObjectCounts: Object.fromEntries(
        categories.map((key) => [key, { clean: 10, upgrade: 10 }]),
      ),
      differences: Object.fromEntries(
        categories.map((key) => [
          key,
          { missingInUpgrade: [], extraInUpgrade: [], changed: [] },
        ]),
      ),
    },
  };
  const planes = ["studio", "neon", "mesh"];
  const before = Object.fromEntries(
    planes.map((plane, i) => [
      plane,
      {
        appliedReleaseId: id(i + 1),
        sourceReleaseId: id(10),
        sourceReleaseNo: 1,
        artifactHash: "b".repeat(64),
      },
    ]),
  );
  drafts.production_canary_rollback.evidence = {
    planes,
    exactPriorHeadsRestored: true,
    correlationIds: [id(31), id(32), id(33), id(34)],
    canaryReport: {
      schema: "athyper.publication-canary-evidence.v1",
      environment: "production",
      sourceRevision: "a".repeat(40),
      targetRef: "target:test-production",
      result: "passed",
      releaseId: id(20),
      publicationKey:
        "studio.business_partner.definition.business_partner.onboarding",
      before,
      afterPublish: Object.fromEntries(
        planes.map((plane, i) => [
          plane,
          {
            appliedReleaseId: id(i + 21),
            sourceReleaseId: id(20),
            sourceReleaseNo: 2,
            artifactHash: "c".repeat(64),
          },
        ]),
      ),
      afterRollback: structuredClone(before),
      publish: { correlationId: id(31) },
      rollbackJobs: Object.fromEntries(
        planes.map((plane, i) => [plane, { correlationId: id(i + 32) }]),
      ),
      deployments: planes.map((plane, i) => ({
        target_plane: plane,
        status: "activated",
        acknowledgement_id: id(i + 41),
        content_hash: "c".repeat(64),
      })),
    },
  };
  Object.assign(drafts.named_owner_certification, {
    startedAt: "2026-09-05T00:06:00Z",
    completedAt: "2026-09-05T00:10:00Z",
  });
  drafts.named_owner_certification.evidence = {
    reviewedReceipts: {},
    certifications: R8_OWNERS.map((role) => ({
      role,
      name: `Test ${role}`,
      signedAt: "2026-09-05T00:09:00Z",
      approvalRef: `approval:test:${role}`,
    })),
  };
  return drafts;
}
export function testQualification(change = () => {}) {
  const inputs = testArtifacts();
  change(inputs);
  const manifest = baseManifest(),
    receipts = {},
    artifacts = {},
    receiptBytes = {};
  manifest.productionQualified = true;
  manifest.productionQualification = "qualified";
  for (const gate of R8_GATES) {
    const artifact = inputs[gate];
    if (gate === "named_owner_certification")
      artifact.evidence.reviewedReceipts = Object.fromEntries(
        R8_GATES.slice(0, 4).map((id) => [
          id,
          sha256(receiptBytes[manifest.gates.find((g) => g.id === id).receipt]),
        ]),
      );
    const bytes = Buffer.from(JSON.stringify(artifact));
    const artifactPath = `${manifest.evidenceDirectory}/artifacts/${sha256(bytes)}.json`;
    const { schema, ...coordinates } = artifact;
    const receipt = {
      ...coordinates,
      schema: "athyper.business-partner-r8-evidence-receipt/1",
      sanitized: true,
      contentSha256: sha256(bytes),
      artifactPath,
    };
    const path = `${manifest.evidenceDirectory}/receipts/${gate}.json`;
    Object.assign(
      manifest.gates.find((item) => item.id === gate),
      { status: "passed", receipt: path },
    );
    receipts[path] = receipt;
    artifacts[artifactPath] = bytes;
    receiptBytes[path] = Buffer.from(JSON.stringify(receipt));
  }
  return {
    manifest,
    receipts,
    artifacts,
    receiptBytes,
    readReceipt: (path) => receipts[path],
    readArtifact: (path) => artifacts[path],
    readReceiptBytes: (path) => receiptBytes[path],
  };
}
