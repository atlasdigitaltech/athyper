import type { AuditEvent, AuditRecordInput } from "./events.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AuditEventFilter, AuditEventPage, AuditExportManifest, AuditExportRequest, AuditHashAnchor, AuditIntegrityEvidence, LegalHold, PiiInventoryEntry, RetentionPolicy } from "./governance.js";

/** Capability-facing audit boundary. Callers never depend on Audit implementation details. */
export interface AuditRecorder<Transaction = unknown> {
  record(input: AuditRecordInput, transaction?: Transaction): Promise<AuditEvent>;
}

/** Persistence/transport boundary implemented and injected by the composition root. */
export interface AuditEventSink<Transaction = unknown> {
  append(event: AuditEvent, transaction?: Transaction): Promise<void>;
}

export interface AuditGovernanceStore {
  query(tenantId: string, filter: AuditEventFilter, limit: number, cursor?: string): Promise<AuditEventPage>;
  stream(tenantId: string, filter: AuditEventFilter, batchSize: number): AsyncIterable<readonly AuditEvent[]>;
  createExport(request: AuditExportRequest): Promise<void>;
  getExport(tenantId: string, exportRequestId: string): Promise<AuditExportRequest | null>;
  getExportById(exportRequestId: string): Promise<AuditExportRequest | null>;
  markExportRunning(exportRequestId: string): Promise<void>;
  completeExport(exportRequestId: string, manifest: AuditExportManifest): Promise<void>;
  failExport(exportRequestId: string, reasonCode: string): Promise<void>;
  getManifest(exportRequestId: string): Promise<AuditExportManifest | null>;
  appendIntegrityEvidence(evidence: AuditIntegrityEvidence): Promise<void>;
  findAnchor(tenantId: string, periodEnd: string): Promise<AuditHashAnchor | null>;
  appendAnchor(anchor: AuditHashAnchor): Promise<void>;
  createLegalHold(hold: LegalHold): Promise<void>;
  releaseLegalHold(tenantId: string, holdId: string, releasedAt: string): Promise<boolean>;
  hasActiveLegalHold(tenantId: string, filter: AuditEventFilter): Promise<boolean>;
  listRetentionPolicies(tenantId: string): Promise<readonly RetentionPolicy[]>;
  saveRetentionPolicy(tenantId: string, policy: RetentionPolicy): Promise<void>;
}

export interface AuditExportJobDispatcher { enqueue(exportRequestId: string): Promise<void>; }
export interface AuditArtifactWriter {
  begin(objectKey: string, contentType: string): Promise<void>;
  write(objectKey: string, sequence: number, bytes: Uint8Array): Promise<void>;
  complete(objectKey: string): Promise<void>;
  abort(objectKey: string): Promise<void>;
  createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}
export interface AuditFieldClassificationReader { listPiiFields(context: VerifiedRequestContext): Promise<readonly PiiInventoryEntry[]>; }
