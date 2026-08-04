import { createHash } from "node:crypto";

export type Wave9Plane = "neon" | "mesh";

interface EvidenceReceipt {
  passed: boolean;
  evidenceSha256: string;
  repositoryRevision: string;
}

export interface Wave9CertificationManifest {
  contractVersion: "wave9.certification-manifest.v1";
  certificationId: string;
  repositoryRevision: string;
  wave8CertificationSha256: string;
  wave8RehearsalId: string;
  rollbackRetention: {
    completed: boolean;
    endedAt: string;
    approvalTicket: string;
    owner: string;
  };
  approval: {
    status: "approved";
    changeTicket: string;
    changeOwner: string;
    securityApprover: string;
    databaseOwner: string;
    approvedAt: string;
  };
}

export interface Wave9CertificationEvidence {
  contractVersion: "wave9.certification-evidence.v1";
  certificationId: string;
  repositoryRevision: string;
  wave8: EvidenceReceipt & {
    rehearsalId: string;
    certificationSha256: string;
    certified: boolean;
  };
  repository: EvidenceReceipt & {
    applicationReaderWriterFindings: number;
    personaFindings: number;
    neonMeshAuthorityFindings: number;
    generatedClientLegacySymbols: number;
    contextualAliasFindings: number;
    legacyBuildDefinitionFindings: number;
  };
  deployedPlanes: Array<EvidenceReceipt & {
    plane: Wave9Plane;
    databaseIdentity: string;
    liveDatabaseDependencies: number;
    applicationReaderWriters: number;
    legacyObjectsRemaining: number;
    meshAuthorityObjectsInNeon: number;
    contextualAliases: number;
    generatedClientLegacySymbols: number;
    rollbackLegacyDependencies: number;
    tombstoneReceiptRecorded: boolean;
    tombstoneReceiptSha256: string;
  }>;
  removalStages: Array<EvidenceReceipt & {
    stage: number;
    completed: boolean;
    owner: string;
    approvalTicket: string;
  }>;
  cleanBuilds: Array<EvidenceReceipt & {
    plane: Wave9Plane;
    buildId: string;
    fromEmptyDatabase: boolean;
    disposableDatabaseMarker: boolean;
    tombstoneMigrationExecuted: boolean;
    provisionPassed: boolean;
    resetPassed: boolean;
    legacyObjectsCreated: number;
    legacyObjectsRemaining: number;
    unexpectedUnvalidatedConstraints: number;
    schemaSha256: string;
    seedOwnedSha256: string;
  }>;
  rollback: EvidenceReceipt & {
    exercised: boolean;
    dependsOnLegacyObject: boolean;
    recoveryMinutes: number;
    maximumRecoveryMinutes: number;
  };
}

export interface Wave9Certification {
  passed: boolean;
  blockers: readonly string[];
  certificationSha256: string;
}

export function evaluateWave9Certification(
  manifest: Wave9CertificationManifest,
  evidence: Wave9CertificationEvidence,
  now = new Date(),
): Wave9Certification {
  const blockers: string[] = [];

  validateManifest(manifest, now, blockers);
  if (
    evidence.contractVersion !== "wave9.certification-evidence.v1"
    || evidence.certificationId !== manifest.certificationId
    || evidence.repositoryRevision !== manifest.repositoryRevision
  ) blockers.push("evidence_boundary_mismatch");

  const receipts = collectReceipts(evidence);
  if (receipts.some((receipt) =>
    !receipt.passed
    || receipt.repositoryRevision !== manifest.repositoryRevision
    || !isSha256(receipt.evidenceSha256)
  )) blockers.push("invalid_or_failed_evidence_receipt");

  if (
    !evidence.wave8.certified
    || evidence.wave8.rehearsalId !== manifest.wave8RehearsalId
    || evidence.wave8.certificationSha256 !== manifest.wave8CertificationSha256
  ) blockers.push("wave8_certification_missing_or_mismatched");

  const repositoryCounts = [
    evidence.repository.applicationReaderWriterFindings,
    evidence.repository.personaFindings,
    evidence.repository.neonMeshAuthorityFindings,
    evidence.repository.generatedClientLegacySymbols,
    evidence.repository.contextualAliasFindings,
    evidence.repository.legacyBuildDefinitionFindings,
  ];
  if (repositoryCounts.some((count) => count !== 0)) {
    blockers.push("repository_contraction_incomplete");
  }

  for (const plane of ["neon", "mesh"] as const) {
    const deployed = evidence.deployedPlanes.filter((item) => item.plane === plane);
    if (
      deployed.length !== 1
      || !deployed[0]?.databaseIdentity.trim()
      || deployed[0].liveDatabaseDependencies !== 0
      || deployed[0].applicationReaderWriters !== 0
      || deployed[0].legacyObjectsRemaining !== 0
      || deployed[0].contextualAliases !== 0
      || deployed[0].generatedClientLegacySymbols !== 0
      || deployed[0].rollbackLegacyDependencies !== 0
      || !deployed[0].tombstoneReceiptRecorded
      || !isSha256(deployed[0].tombstoneReceiptSha256)
    ) blockers.push(`deployed_plane_not_contracted:${plane}`);
    if (plane === "neon" && deployed[0]?.meshAuthorityObjectsInNeon !== 0) {
      blockers.push("mesh_authority_remains_in_neon");
    }

    const builds = evidence.cleanBuilds.filter((item) => item.plane === plane);
    if (
      builds.length !== 2
      || builds.some((item) =>
        !item.fromEmptyDatabase
        || !item.disposableDatabaseMarker
        || item.tombstoneMigrationExecuted
        || !item.provisionPassed
        || !item.resetPassed
        || item.legacyObjectsCreated !== 0
        || item.legacyObjectsRemaining !== 0
        || item.unexpectedUnvalidatedConstraints !== 0
        || !isSha256(item.schemaSha256)
        || !isSha256(item.seedOwnedSha256)
      )
      || new Set(builds.map((item) =>
        `${item.schemaSha256}:${item.seedOwnedSha256}`
      )).size !== 1
    ) blockers.push(`clean_baseline_not_certified:${plane}`);
  }

  const stages = [...evidence.removalStages].sort((a, b) => a.stage - b.stage);
  if (
    stages.length !== 10
    || stages.some((item, index) =>
      item.stage !== index + 1
      || !item.completed
      || !item.owner.trim()
      || !item.approvalTicket.trim()
    )
  ) blockers.push("ordered_removal_evidence_incomplete");

  if (
    !evidence.rollback.exercised
    || evidence.rollback.dependsOnLegacyObject
    || evidence.rollback.recoveryMinutes > evidence.rollback.maximumRecoveryMinutes
  ) blockers.push("canonical_rollback_not_certified");

  const uniqueBlockers = [...new Set(blockers)].sort();
  return Object.freeze({
    passed: uniqueBlockers.length === 0,
    blockers: Object.freeze(uniqueBlockers),
    certificationSha256: sha256(stableJson({ manifest, evidence })),
  });
}

function validateManifest(
  manifest: Wave9CertificationManifest,
  now: Date,
  blockers: string[],
): void {
  const retentionEnd = Date.parse(manifest.rollbackRetention.endedAt);
  if (
    manifest.contractVersion !== "wave9.certification-manifest.v1"
    || !manifest.certificationId.trim()
    || !manifest.repositoryRevision.trim()
    || !isSha256(manifest.wave8CertificationSha256)
    || !manifest.wave8RehearsalId.trim()
  ) blockers.push("invalid_certification_manifest");
  if (
    !manifest.rollbackRetention.completed
    || !Number.isFinite(retentionEnd)
    || retentionEnd > now.getTime()
    || !manifest.rollbackRetention.approvalTicket.trim()
    || !manifest.rollbackRetention.owner.trim()
  ) blockers.push("rollback_retention_not_complete");
  if (
    manifest.approval?.status !== "approved"
    || !manifest.approval.changeTicket.trim()
    || !manifest.approval.changeOwner.trim()
    || !manifest.approval.securityApprover.trim()
    || !manifest.approval.databaseOwner.trim()
    || !Number.isFinite(Date.parse(manifest.approval.approvedAt))
  ) blockers.push("contraction_approval_incomplete");
}

function collectReceipts(
  evidence: Wave9CertificationEvidence,
): EvidenceReceipt[] {
  return [
    evidence.wave8,
    evidence.repository,
    ...evidence.deployedPlanes,
    ...evidence.removalStages,
    ...evidence.cleanBuilds,
    evidence.rollback,
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
