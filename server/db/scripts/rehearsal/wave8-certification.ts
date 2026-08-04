import { createHash } from "node:crypto";

export type Wave8Plane = "neon" | "mesh";
export type Wave8SeedCapture =
  | "clean_build_a"
  | "clean_build_b"
  | "forced_reseed_a"
  | "forced_reseed_b"
  | "in_place_upgrade";

export interface Wave8RehearsalManifest {
  contractVersion: "wave8.rehearsal-manifest.v1";
  rehearsalId: string;
  environmentClass: "isolated_production_like";
  databaseStrategy: "fresh_target_connection_switch";
  repositoryRevision: string;
  sourceRelease: string;
  targetRelease: string;
  planes: Record<Wave8Plane, {
    sourceDatabase: string;
    targetDatabase: string;
    maximumLagTransactions: number;
    maximumRecoveryMinutes: number;
  }>;
  losslessPostWriteRollbackPromised: boolean;
  observation: {
    minimumDurationMinutes: number;
    startsAt: string;
    endsAt: string;
  };
  approval: {
    status: "approved";
    ticket: string;
    changeOwner: string;
    rollbackOwner: string;
    securityApprover: string;
    dataOwnerApprover: string;
    operationsApprover: string;
    approvedAt: string;
  };
}

interface Receipt {
  passed: boolean;
  evidenceSha256: string;
  rehearsalId: string;
  repositoryRevision: string;
}

export interface Wave8EvidenceBundle {
  contractVersion: "wave8.rehearsal-evidence.v1";
  rehearsalId: string;
  repositoryRevision: string;
  backupRestore: Array<Receipt & {
    component: "neon_database" | "mesh_database" | "keycloak";
    recoveryMinutes: number;
    restoredIdentityMatched: boolean;
  }>;
  replay: Array<Receipt & {
    plane: Wave8Plane;
    direction: "forward" | "reverse";
    completeTransactionsOnly: boolean;
    finalLagTransactions: number;
    duplicateTransactions: number;
    missingTransactions: number;
  }>;
  identity: Receipt & {
    fieldMismatchCount: number;
    duplicateSubjects: number;
    unmatchedEnabledSubjects: number;
    sourceIdentityCount: number;
    targetIdentityCount: number;
    sourceCanonicalSha256: string;
    targetCanonicalSha256: string;
  };
  seeds: Array<Receipt & {
    plane: Wave8Plane;
    captureKind: Wave8SeedCapture;
    seedLedgerSha256: string;
    seedOwnedSha256: string;
    identityCount: number;
    identityCanonicalSha256: string;
    nonSeedRowsChanged: number;
  }>;
  constraints: Array<Receipt & {
    plane: Wave8Plane;
    unexpectedUnvalidated: number;
    orphanRows: number;
  }>;
  acceptance: Array<Receipt & {
    domain: "authorization" | "business_data";
    owner: string;
    approvalTicket: string;
  }>;
  negativeTests: Receipt & {
    crossPlanePassed: boolean;
    leastPrivilegeRlsPassed: boolean;
    oppositeDatabaseUnavailablePassed: boolean;
    activeDispatcherLeases: number;
    duplicateExternalEffects: number;
    missingExternalEffects: number;
  };
  dataReconciliation: Receipt & {
    dispositionsMissing: number;
    tableMismatches: number;
    objectMismatches: number;
    eventWatermarkMismatches: number;
    pendingWorkMismatches: number;
  };
  cutover: Array<Receipt & {
    plane: Wave8Plane;
    freshTargetCertified: boolean;
    connectionSwitched: boolean;
    resolverState: string;
    writerAuthority: string;
    observationCompletedAt: string | null;
    legacySourceRestorable: boolean;
  }>;
}

export interface Wave8Certification {
  passed: boolean;
  blockers: readonly string[];
  certificationSha256: string;
}

export function evaluateWave8Certification(
  manifest: Wave8RehearsalManifest,
  evidence: Wave8EvidenceBundle,
): Wave8Certification {
  const blockers: string[] = [];
  validateManifest(manifest, blockers);
  if (
    evidence.contractVersion !== "wave8.rehearsal-evidence.v1"
    || evidence.rehearsalId !== manifest.rehearsalId
    || evidence.repositoryRevision !== manifest.repositoryRevision
  ) blockers.push("evidence_boundary_mismatch");

  const receipts = collectReceipts(evidence);
  if (receipts.some((receipt) =>
    receipt.rehearsalId !== manifest.rehearsalId
    || receipt.repositoryRevision !== manifest.repositoryRevision
    || !isSha256(receipt.evidenceSha256)
  )) blockers.push("invalid_or_cross_rehearsal_receipt");
  if (receipts.some((receipt) => !receipt.passed)) {
    blockers.push("failed_evidence_receipt");
  }

  for (const component of ["neon_database", "mesh_database", "keycloak"] as const) {
    const receipt = evidence.backupRestore.find((item) => item.component === component);
    if (!receipt?.passed || !receipt.restoredIdentityMatched) {
      blockers.push(`backup_restore_failed:${component}`);
    }
    if (component !== "keycloak") {
      const plane = component === "neon_database" ? "neon" : "mesh";
      if (
        receipt
        && receipt.recoveryMinutes > manifest.planes[plane].maximumRecoveryMinutes
      ) blockers.push(`rollback_rto_exceeded:${plane}`);
    }
  }
  for (const plane of ["neon", "mesh"] as const) {
    const forward = evidence.replay.find((item) =>
      item.plane === plane && item.direction === "forward"
    );
    if (!replayPassed(forward, manifest.planes[plane].maximumLagTransactions)) {
      blockers.push(`forward_replay_failed:${plane}`);
    }
    if (manifest.losslessPostWriteRollbackPromised) {
      const reverse = evidence.replay.find((item) =>
        item.plane === plane && item.direction === "reverse"
      );
      if (!replayPassed(reverse, 0)) blockers.push(`reverse_replay_failed:${plane}`);
    }
  }

  const identity = evidence.identity;
  if (
    identity.fieldMismatchCount !== 0
    || identity.duplicateSubjects !== 0
    || identity.unmatchedEnabledSubjects !== 0
    || identity.sourceIdentityCount !== identity.targetIdentityCount
    || identity.sourceCanonicalSha256 !== identity.targetCanonicalSha256
  ) blockers.push("identity_or_subject_set_mismatch");

  for (const plane of ["neon", "mesh"] as const) {
    const captures = evidence.seeds.filter((item) => item.plane === plane);
    const kinds = new Set(captures.map((item) => item.captureKind));
    if (kinds.size !== 5) blockers.push(`seed_capture_set_incomplete:${plane}`);
    const signatures = new Set(captures.map((item) => [
      item.seedLedgerSha256,
      item.seedOwnedSha256,
      item.identityCount,
      item.identityCanonicalSha256,
    ].join(":")));
    if (
      captures.length !== 5
      || signatures.size !== 1
      || captures.some((item) => item.nonSeedRowsChanged !== 0)
    ) blockers.push(`seed_equivalence_failed:${plane}`);

    const constraint = evidence.constraints.find((item) => item.plane === plane);
    if (
      !constraint?.passed
      || constraint.unexpectedUnvalidated !== 0
      || constraint.orphanRows !== 0
    ) blockers.push(`constraint_certification_failed:${plane}`);

    const cutover = evidence.cutover.find((item) => item.plane === plane);
    if (
      !cutover?.passed
      || !cutover.freshTargetCertified
      || !cutover.connectionSwitched
      || cutover.resolverState !== "observation_complete"
      || cutover.writerAuthority !== "target"
      || !cutover.observationCompletedAt
      || !cutover.legacySourceRestorable
    ) blockers.push(`stable_observation_incomplete:${plane}`);
  }

  for (const domain of ["authorization", "business_data"] as const) {
    const acceptance = evidence.acceptance.find((item) => item.domain === domain);
    if (
      !acceptance?.passed
      || !acceptance.owner.trim()
      || !acceptance.approvalTicket.trim()
    ) blockers.push(`owner_acceptance_missing:${domain}`);
  }
  if (
    !evidence.negativeTests.passed
    || !evidence.negativeTests.crossPlanePassed
    || !evidence.negativeTests.leastPrivilegeRlsPassed
    || !evidence.negativeTests.oppositeDatabaseUnavailablePassed
    || evidence.negativeTests.activeDispatcherLeases !== 1
    || evidence.negativeTests.duplicateExternalEffects !== 0
    || evidence.negativeTests.missingExternalEffects !== 0
  ) blockers.push("negative_boundary_or_dispatcher_test_failed");
  if (
    !evidence.dataReconciliation.passed
    || evidence.dataReconciliation.dispositionsMissing !== 0
    || evidence.dataReconciliation.tableMismatches !== 0
    || evidence.dataReconciliation.objectMismatches !== 0
    || evidence.dataReconciliation.eventWatermarkMismatches !== 0
    || evidence.dataReconciliation.pendingWorkMismatches !== 0
  ) blockers.push("data_reconciliation_failed");

  const start = Date.parse(manifest.observation.startsAt);
  const end = Date.parse(manifest.observation.endsAt);
  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || end - start < manifest.observation.minimumDurationMinutes * 60_000
    || Date.now() < end
  ) blockers.push("observation_window_incomplete");

  const uniqueBlockers = [...new Set(blockers)].sort();
  return Object.freeze({
    passed: uniqueBlockers.length === 0,
    blockers: Object.freeze(uniqueBlockers),
    certificationSha256: sha256(stableJson({ manifest, evidence })),
  });
}

function validateManifest(
  manifest: Wave8RehearsalManifest,
  blockers: string[],
): void {
  if (
    manifest.contractVersion !== "wave8.rehearsal-manifest.v1"
    || manifest.environmentClass !== "isolated_production_like"
    || manifest.databaseStrategy !== "fresh_target_connection_switch"
    || manifest.approval?.status !== "approved"
  ) blockers.push("manifest_not_approved_for_fresh_target_rehearsal");
  if (
    !manifest.rehearsalId?.trim()
    || !manifest.repositoryRevision?.trim()
    || !manifest.approval?.ticket?.trim()
    || !manifest.approval?.changeOwner?.trim()
    || !manifest.approval?.rollbackOwner?.trim()
    || !manifest.approval?.securityApprover?.trim()
    || !manifest.approval?.dataOwnerApprover?.trim()
    || !manifest.approval?.operationsApprover?.trim()
    || !Number.isFinite(Date.parse(manifest.approval?.approvedAt ?? ""))
  ) blockers.push("manifest_approval_incomplete");
  for (const plane of ["neon", "mesh"] as const) {
    const contract = manifest.planes?.[plane];
    if (
      !contract
      || !contract.sourceDatabase?.trim()
      || !contract.targetDatabase?.trim()
      || contract.sourceDatabase === contract.targetDatabase
      || !Number.isSafeInteger(contract.maximumLagTransactions)
      || contract.maximumLagTransactions < 0
      || !Number.isFinite(contract.maximumRecoveryMinutes)
      || contract.maximumRecoveryMinutes <= 0
    ) blockers.push(`invalid_plane_contract:${plane}`);
  }
}

function replayPassed(
  receipt: Wave8EvidenceBundle["replay"][number] | undefined,
  maximumLag: number,
): boolean {
  return Boolean(
    receipt?.passed
    && receipt.completeTransactionsOnly
    && receipt.finalLagTransactions <= maximumLag
    && receipt.duplicateTransactions === 0
    && receipt.missingTransactions === 0,
  );
}

function collectReceipts(evidence: Wave8EvidenceBundle): Receipt[] {
  return [
    ...evidence.backupRestore,
    ...evidence.replay,
    evidence.identity,
    ...evidence.seeds,
    ...evidence.constraints,
    ...evidence.acceptance,
    evidence.negativeTests,
    evidence.dataReconciliation,
    ...evidence.cutover,
  ];
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${
    Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")
  }}`;
}
