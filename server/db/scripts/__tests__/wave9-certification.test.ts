import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateWave9Certification,
  type Wave9CertificationEvidence,
  type Wave9CertificationManifest,
} from "../contraction/wave9-certification.js";

const HASH = "a".repeat(64);
const REVISION = "revision-9";

const manifest: Wave9CertificationManifest = {
  contractVersion: "wave9.certification-manifest.v1",
  certificationId: "wave9-c1",
  repositoryRevision: REVISION,
  wave8CertificationSha256: HASH,
  wave8RehearsalId: "wave8-r1",
  rollbackRetention: {
    completed: true,
    endedAt: "2026-01-01T00:00:00.000Z",
    approvalTicket: "CHG-RETENTION",
    owner: "operations",
  },
  approval: {
    status: "approved",
    changeTicket: "CHG-WAVE9",
    changeOwner: "platform",
    securityApprover: "security",
    databaseOwner: "database",
    approvedAt: "2026-01-02T00:00:00.000Z",
  },
};

function receipt() {
  return {
    passed: true,
    evidenceSha256: HASH,
    repositoryRevision: REVISION,
  };
}

function evidence(): Wave9CertificationEvidence {
  return {
    contractVersion: "wave9.certification-evidence.v1",
    certificationId: "wave9-c1",
    repositoryRevision: REVISION,
    wave8: {
      ...receipt(),
      rehearsalId: "wave8-r1",
      certificationSha256: HASH,
      certified: true,
    },
    repository: {
      ...receipt(),
      applicationReaderWriterFindings: 0,
      personaFindings: 0,
      neonMeshAuthorityFindings: 0,
      generatedClientLegacySymbols: 0,
      contextualAliasFindings: 0,
      legacyBuildDefinitionFindings: 0,
    },
    deployedPlanes: (["neon", "mesh"] as const).map((plane) => ({
      ...receipt(),
      plane,
      databaseIdentity: `${plane}-target`,
      liveDatabaseDependencies: 0,
      applicationReaderWriters: 0,
      legacyObjectsRemaining: 0,
      meshAuthorityObjectsInNeon: 0,
      contextualAliases: 0,
      generatedClientLegacySymbols: 0,
      rollbackLegacyDependencies: 0,
      tombstoneReceiptRecorded: true,
      tombstoneReceiptSha256: HASH,
    })),
    removalStages: Array.from({ length: 10 }, (_, index) => ({
      ...receipt(),
      stage: index + 1,
      completed: true,
      owner: `owner-${index + 1}`,
      approvalTicket: `CHG-${index + 1}`,
    })),
    cleanBuilds: (["neon", "mesh"] as const).flatMap((plane) =>
      ["a", "b"].map((suffix) => ({
        ...receipt(),
        plane,
        buildId: `${plane}-${suffix}`,
        fromEmptyDatabase: true,
        disposableDatabaseMarker: true,
        tombstoneMigrationExecuted: false,
        provisionPassed: true,
        resetPassed: true,
        legacyObjectsCreated: 0,
        legacyObjectsRemaining: 0,
        unexpectedUnvalidatedConstraints: 0,
        schemaSha256: plane === "neon" ? HASH : "b".repeat(64),
        seedOwnedSha256: plane === "neon" ? "c".repeat(64) : "d".repeat(64),
      }))
    ),
    rollback: {
      ...receipt(),
      exercised: true,
      dependsOnLegacyObject: false,
      recoveryMinutes: 5,
      maximumRecoveryMinutes: 15,
    },
  };
}

describe("Wave 9 certification", () => {
  it("passes complete contraction and two deterministic clean builds", () => {
    const result = evaluateWave9Certification(
      manifest,
      evidence(),
      new Date("2026-02-01T00:00:00.000Z"),
    );
    assert.equal(result.passed, true);
    assert.deepEqual(result.blockers, []);
    assert.match(result.certificationSha256, /^[0-9a-f]{64}$/);
  });

  it("fails when any final baseline recreates a legacy object", () => {
    const input = evidence();
    input.cleanBuilds[0]!.legacyObjectsCreated = 1;
    const result = evaluateWave9Certification(
      manifest,
      input,
      new Date("2026-02-01T00:00:00.000Z"),
    );
    assert.equal(result.passed, false);
    assert(result.blockers.includes("clean_baseline_not_certified:neon"));
  });

  it("fails closed on Persona, Mesh-in-Neon, aliases, and legacy rollback", () => {
    const input = evidence();
    input.repository.personaFindings = 1;
    input.repository.contextualAliasFindings = 1;
    input.deployedPlanes[0]!.meshAuthorityObjectsInNeon = 1;
    input.rollback.dependsOnLegacyObject = true;
    const result = evaluateWave9Certification(
      manifest,
      input,
      new Date("2026-02-01T00:00:00.000Z"),
    );
    assert.equal(result.passed, false);
    assert(result.blockers.includes("repository_contraction_incomplete"));
    assert(result.blockers.includes("mesh_authority_remains_in_neon"));
    assert(result.blockers.includes("canonical_rollback_not_certified"));
  });
});
