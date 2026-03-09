// lib/governance/types.ts
//
// Typed DTOs matching the governance admin API responses.

// ============================================================================
// Retention & Tiering
// ============================================================================

export interface RetentionPolicyDTO {
  policyId: string;
  retentionDays: number;
  actionOnExpiry: string;
  complianceFramework: string | null;
  legalHold: boolean;
  resolvedScope: string;
  priority: number;
}

export interface RetentionCandidateDTO {
  policyId: string;
  scope: string;
  retentionDays: number;
  priority: number;
  isActive: boolean;
  isWinner: boolean;
}

export interface TieringPolicyDTO {
  policyId: string;
  hotMonths: number;
  warmMonths: number;
  warmStrategy: string;
  coldStrategy: string;
  priority: number;
  legalHold: boolean;
}

export interface RetentionConstraintDTO {
  retentionDays: number | null;
  warmMonthsDays: number | null;
  isConsistent: boolean;
  warning: string | null;
}

// ============================================================================
// Legal Holds
// ============================================================================

export interface LegalHoldDTO {
  id: string;
  holdReference: string;
  holdSource: string;
  reason: string;
  scopeType: string;
  targetSchema: string | null;
  targetTable: string | null;
  entityId: string | null;
  issuedBy: string;
  issuedAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  complianceFramework: string | null;
  heldManifestCount: number;
  isActive: boolean;
}

export interface ActiveHoldDTO {
  holdId: string;
  reference: string;
  source: string;
  reason: string;
  scopeType: string;
  issuedBy: string;
  issuedAt: string;
}

// ============================================================================
// Archive & Purge
// ============================================================================

export interface ArchiveManifestDTO {
  id: string;
  partitionName: string;
  partitionMonth: string;
  partitionDomain: string | null;
  archiveFormat: string;
  storageUri: string;
  sha256: string;
  rowCount: number;
  sizeBytes: number | null;
  lifecycle: "ARCHIVED" | "VERIFIED" | "DETACHED" | "RESTORED";
  archivedAt: string;
  archivedBy: string;
  verifiedAt: string | null;
  detachedAt: string | null;
  restoredAt: string | null;
  tierAtArchive: string;
  isHeld: boolean;
}

export interface PurgeCertificateDTO {
  id: string;
  partitionName: string;
  partitionMonth: string;
  sha256: string;
  rowCount: number;
  purgeReason: string;
  complianceFramework: string | null;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string;
  approvedAt: string;
  purgedBy: string;
  purgedAt: string;
  purgeMethod: string;
  deletionVerified: boolean;
}

export interface RestoreRequestDTO {
  id: string;
  manifestId: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

// ============================================================================
// Quotas
// ============================================================================

export interface QuotaDTO {
  id: string;
  quotaKey: string;
  quotaName: string;
  category: string;
  limitValue: number;
  limitUnit: string;
  warningPct: number;
  enforcement: string;
  overageAction: string;
  currentValue: number;
  utilizationPct: number;
  status: "OK" | "WARNING" | "EXCEEDED";
  version: number;
  isActive: boolean;
}

// ============================================================================
// Privacy / PII
// ============================================================================

export interface PiiFieldDTO {
  entityName: string;
  tableSchema: string;
  tableName: string;
  fieldPath: string;
  piiClassification: string;
  maskStrategy: string | null;
  lawfulBasis: string | null;
  consentRequired: boolean;
  retentionOverrideDays: number | null;
  anonymizationStrategy: string | null;
  crossBorderRestricted: boolean;
  dataSubjectType: string | null;
  isActive: boolean;
}

export interface PiiSummaryDTO {
  totalPiiFields: number;
  byClassification: Record<string, number>;
  byEntity: Record<string, number>;
  consentRequiredCount: number;
  crossBorderRestrictedCount: number;
}

// ============================================================================
// Explain
// ============================================================================

export interface RetentionExplainDTO {
  type: "retention";
  resolvedPolicy: RetentionPolicyDTO | null;
  candidatePolicies: RetentionCandidateDTO[];
  activeHolds: ActiveHoldDTO[];
  explanation: string;
}

export interface TieringExplainDTO {
  type: "tiering";
  resolvedPolicy: TieringPolicyDTO | null;
  retentionConstraint: RetentionConstraintDTO;
  explanation: string;
}
