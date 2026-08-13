import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AuditEvent } from "./events.js";

export interface AuditEventFilter {
  readonly occurredFrom: string;
  readonly occurredUntil: string;
  readonly eventCodes?: readonly string[];
  readonly outcomes?: readonly AuditEvent["outcome"][];
  readonly actorPrincipalIds?: readonly string[];
  readonly entityType?: string;
  readonly entityId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface AuditEventQuery {
  readonly context: VerifiedRequestContext;
  readonly filter: AuditEventFilter;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface AuditEventPage {
  readonly events: readonly AuditEvent[];
  readonly nextCursor?: string;
}

export type AuditExportFormat = "csv" | "json" | "ndjson";
export type AuditExportStatus = "queued" | "running" | "completed" | "failed" | "expired";

export interface AuditExportRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly actorPrincipalId: string;
  readonly exactFilter: AuditEventFilter;
  readonly format: AuditExportFormat;
  readonly status: AuditExportStatus;
  readonly requestedAt: string;
  readonly retentionUntil: string;
}

export interface AuditExportChunk {
  readonly sequence: number;
  readonly byteCount: number;
  readonly sha256: string;
}

export interface AuditExportManifest {
  readonly exportRequestId: string;
  readonly tenantId: string;
  readonly actorPrincipalId: string;
  readonly exactFilter: AuditEventFilter;
  readonly format: AuditExportFormat;
  readonly rowCount: number;
  readonly byteCount: number;
  readonly sha256: string;
  readonly chunks: readonly AuditExportChunk[];
  readonly objectKey: string;
  readonly createdAt: string;
  readonly retentionUntil: string;
}

export interface AuditIntegrityEvidence {
  readonly id: string;
  readonly tenantId: string;
  readonly checkedFrom: string;
  readonly checkedUntil: string;
  readonly eventCount: number;
  readonly valid: boolean;
  readonly verificationStatus?: "verified" | "partial" | "unsupported";
  readonly integrityIssues?: readonly string[];
  readonly calculatedHash: string;
  readonly anchorHash?: string;
  readonly createdAt: string;
  readonly actorPrincipalId: string;
}

export interface AuditHashAnchor {
  readonly tenantId: string;
  readonly periodEnd: string;
  readonly hash: string;
  readonly createdAt: string;
}

export interface LegalHold {
  readonly id: string;
  readonly tenantId: string;
  readonly matterCode: string;
  readonly filter: AuditEventFilter;
  readonly status: "active" | "released";
  readonly createdAt: string;
  readonly releasedAt?: string;
}

export interface PiiInventoryEntry {
  readonly entityCode: string;
  readonly fieldKey: string;
  readonly classification: "pii" | "sensitive_pii";
  readonly retentionPolicyCode?: string;
}

export interface RetentionPolicy {
  readonly code: string;
  readonly eventCodePattern: string;
  readonly retainDays: number;
  readonly status: "active" | "inactive";
}
