import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateWave8Certification,
  type Wave8EvidenceBundle,
  type Wave8RehearsalManifest,
} from "../rehearsal/certification.js";

const hash = "a".repeat(64);
const receipt = {
  passed: true,
  evidenceSha256: hash,
  rehearsalId: "wave8-r1",
  repositoryRevision: "revision-1",
};

function manifest(
  overrides: Partial<Wave8RehearsalManifest> = {},
): Wave8RehearsalManifest {
  return {
    contractVersion: "wave8.rehearsal-manifest.v1",
    rehearsalId: "wave8-r1",
    environmentClass: "isolated_production_like",
    databaseStrategy: "fresh_target_connection_switch",
    repositoryRevision: "revision-1",
    sourceRelease: "source-1",
    targetRelease: "target-1",
    planes: {
      neon: {
        sourceDatabase: "neon_source",
        targetDatabase: "neon_target",
        maximumLagTransactions: 0,
        maximumRecoveryMinutes: 30,
      },
      mesh: {
        sourceDatabase: "mesh_source",
        targetDatabase: "mesh_target",
        maximumLagTransactions: 0,
        maximumRecoveryMinutes: 30,
      },
    },
    losslessPostWriteRollbackPromised: false,
    observation: {
      minimumDurationMinutes: 60,
      startsAt: "2026-07-27T00:00:00.000Z",
      endsAt: "2026-07-27T01:00:00.000Z",
    },
    approval: {
      status: "approved",
      ticket: "CHG-8",
      changeOwner: "change",
      rollbackOwner: "rollback",
      securityApprover: "security",
      dataOwnerApprover: "data",
      operationsApprover: "operations",
      approvedAt: "2026-07-26T00:00:00.000Z",
    },
    ...overrides,
  };
}

function evidence(): Wave8EvidenceBundle {
  const seeds = (["neon", "mesh"] as const).flatMap((plane) =>
    ([
      "clean_build_a",
      "clean_build_b",
      "forced_reseed_a",
      "forced_reseed_b",
      "in_place_upgrade",
    ] as const).map((captureKind) => ({
      ...receipt,
      plane,
      captureKind,
      seedLedgerSha256: hash,
      seedOwnedSha256: hash,
      identityCount: 10,
      identityCanonicalSha256: hash,
      nonSeedRowsChanged: 0,
    }))
  );
  return {
    contractVersion: "wave8.rehearsal-evidence.v1",
    rehearsalId: receipt.rehearsalId,
    repositoryRevision: receipt.repositoryRevision,
    backupRestore: [
      {
        ...receipt,
        component: "neon_database",
        recoveryMinutes: 10,
        restoredIdentityMatched: true,
      },
      {
        ...receipt,
        component: "mesh_database",
        recoveryMinutes: 10,
        restoredIdentityMatched: true,
      },
      {
        ...receipt,
        component: "keycloak",
        recoveryMinutes: 10,
        restoredIdentityMatched: true,
      },
    ],
    replay: (["neon", "mesh"] as const).map((plane) => ({
      ...receipt,
      plane,
      direction: "forward" as const,
      completeTransactionsOnly: true,
      finalLagTransactions: 0,
      duplicateTransactions: 0,
      missingTransactions: 0,
    })),
    identity: {
      ...receipt,
      fieldMismatchCount: 0,
      duplicateSubjects: 0,
      unmatchedEnabledSubjects: 0,
      sourceIdentityCount: 10,
      targetIdentityCount: 10,
      sourceCanonicalSha256: hash,
      targetCanonicalSha256: hash,
    },
    seeds,
    constraints: (["neon", "mesh"] as const).map((plane) => ({
      ...receipt,
      plane,
      unexpectedUnvalidated: 0,
      orphanRows: 0,
    })),
    acceptance: (["authorization", "business_data"] as const).map((domain) => ({
      ...receipt,
      domain,
      owner: `${domain}-owner`,
      approvalTicket: "ACCEPT-8",
    })),
    negativeTests: {
      ...receipt,
      crossPlanePassed: true,
      leastPrivilegeRlsPassed: true,
      oppositeDatabaseUnavailablePassed: true,
      activeDispatcherLeases: 1,
      duplicateExternalEffects: 0,
      missingExternalEffects: 0,
    },
    dataReconciliation: {
      ...receipt,
      dispositionsMissing: 0,
      tableMismatches: 0,
      objectMismatches: 0,
      eventWatermarkMismatches: 0,
      pendingWorkMismatches: 0,
    },
    cutover: (["neon", "mesh"] as const).map((plane) => ({
      ...receipt,
      plane,
      freshTargetCertified: true,
      connectionSwitched: true,
      resolverState: "observation_complete",
      writerAuthority: "target",
      observationCompletedAt: "2026-07-27T01:00:00.000Z",
      legacySourceRestorable: true,
    })),
  };
}

describe("Wave 8 certification", () => {
  it("passes only a complete fresh-target rehearsal evidence set", () => {
    const result = evaluateWave8Certification(manifest(), evidence());
    assert.equal(result.passed, true);
    assert.deepEqual(result.blockers, []);
    assert.match(result.certificationSha256, /^[0-9a-f]{64}$/);
  });

  it("requires reverse replay for a lossless post-write rollback promise", () => {
    const result = evaluateWave8Certification(
      manifest({ losslessPostWriteRollbackPromised: true }),
      evidence(),
    );
    assert.equal(result.passed, false);
    assert.deepEqual(result.blockers, [
      "reverse_replay_failed:mesh",
      "reverse_replay_failed:neon",
    ]);
  });

  it("blocks identity, seed, constraint, dispatcher, data, RTO, and observation defects", () => {
    const proof = evidence();
    proof.identity.fieldMismatchCount = 1;
    proof.seeds[0]!.seedOwnedSha256 = "b".repeat(64);
    proof.constraints[0]!.unexpectedUnvalidated = 1;
    proof.negativeTests.activeDispatcherLeases = 2;
    proof.dataReconciliation.objectMismatches = 1;
    proof.backupRestore[0]!.recoveryMinutes = 31;
    proof.cutover[1]!.observationCompletedAt = null;
    const result = evaluateWave8Certification(manifest(), proof);
    assert.equal(result.passed, false);
    for (const blocker of [
      "identity_or_subject_set_mismatch",
      "seed_equivalence_failed:neon",
      "constraint_certification_failed:neon",
      "negative_boundary_or_dispatcher_test_failed",
      "data_reconciliation_failed",
      "rollback_rto_exceeded:neon",
      "stable_observation_incomplete:mesh",
    ]) assert.ok(result.blockers.includes(blocker), blocker);
  });
});
