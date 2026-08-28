import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BaseRecordCommand, RecordMutationResult } from "./mutation.js";
import type { RecordFilter } from "./query.js";

export interface BulkRecordItem { readonly recordId: string; readonly expectedVersion?: number; readonly input?: Readonly<Record<string, unknown>>; }
export interface BulkCommand { readonly context: VerifiedRequestContext; readonly batchId: string; readonly entityCode: string; readonly action: "patch" | "delete" | "registered_action"; readonly actionCode?: string; readonly items: readonly BulkRecordItem[]; readonly idempotencyKey: string; }
export interface BulkPreflightItem { readonly recordId: string; readonly eligible: boolean; readonly reasonCode?: string; }
export interface BulkPreflightResult { readonly batchId: string; readonly accepted: boolean; readonly governedJob: boolean; readonly items: readonly BulkPreflightItem[]; }
export interface BulkRecordResult { readonly recordId: string; readonly result: RecordMutationResult | { readonly kind: "ActionCompleted"; readonly output?: Readonly<Record<string, unknown>> }; }
export interface BulkExecutionResult { readonly batchId: string; readonly status: "completed" | "queued"; readonly jobId?: string; readonly items: readonly BulkRecordResult[]; }

export type ImportStageStatus = "uploading" | "staged" | "validated" | "previewed" | "commit_queued" | "running" | "committed" | "cancelled" | "failed";
export type RecordImportOperation = "create" | "update" | "upsert" | "delete" | "replace";
export type RecordImportConflictPolicy = "reject" | "skip";
export type RecordImportAtomicity = "all_or_nothing" | "valid_rows";
export interface RecordImportSession {
  readonly id: string;
  readonly tenantId: string;
  readonly entityCode: string;
  readonly operation: RecordImportOperation;
  /** Immutable plane-owned implementation selected when the upload begins. */
  readonly adapterKey: string;
  /** Prevents validation or execution against a different released contract. */
  readonly descriptorHash: string;
  readonly scopeCoordinate?: Readonly<Record<string, string>>;
  readonly conflictPolicy: RecordImportConflictPolicy;
  readonly atomicity: RecordImportAtomicity;
  readonly status: ImportStageStatus;
  readonly stagedRowCount: number;
  readonly validRowCount: number;
  readonly invalidRowCount: number;
  readonly checksum: string;
  readonly createdAt: string;
  readonly createdBy?: string;
  readonly nextChunkIndex?: number;
  readonly errorReportKey?: string;
  readonly cancelledAt?: string;
}
export interface ImportValidationRow { readonly rowNumber: number; readonly valid: boolean; readonly errors: readonly string[]; }
export interface ImportValidationSummary { readonly totalCount:number; readonly validCount:number; readonly invalidCount:number; readonly errorsByCode:Readonly<Record<string,number>>; readonly sample:readonly ImportValidationRow[]; readonly truncated:boolean; }
export interface RecordImportPreview { readonly sessionId: string; readonly rows: readonly ImportValidationRow[]; readonly validCount: number; readonly invalidCount: number; readonly summary?:ImportValidationSummary; }
export interface RecordTransferFilter { readonly filters?: readonly RecordFilter[]; }
export interface RecordTransferListItem {
  readonly id: string;
  readonly kind: "import" | "export";
  readonly entityCode: string;
  readonly operation?: RecordImportOperation;
  readonly status: string;
  readonly rowCount: number;
  readonly errorCount: number;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly downloadable: boolean;
}

export type SnapshotCaptureKind = "create" | "version" | "publish" | "release" | "submit" | "approval" | "commitment" | "fulfillment" | "financial_post" | "amendment" | "reversal" | "withdrawal" | "reconcile" | "migration" | "manual";
export type SnapshotRetentionClass = "permanent" | "legal" | "financial" | "operational" | "standard" | "temporary";
export interface RecordSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly entityCode?: string;
  readonly versionNumber: number;
  readonly payloadSchemaVersion: number;
  readonly entityContractHash: string;
  readonly sourceRecordVersion?: number;
  readonly captureEvent: string;
  readonly captureKind: SnapshotCaptureKind;
  readonly payloadHash: string;
  readonly previousSnapshotId?: string;
  readonly previousPayloadHash?: string;
  readonly chainSequence: number;
  readonly correlationId?: string;
  readonly auditEventId?: string;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly retentionClass: SnapshotRetentionClass;
  readonly payloadSizeBytes: number;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly captureSource: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface RecordSnapshotCaptureInput {
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly entityType: string;
  readonly entityId: string;
  readonly entityCode?: string;
  readonly entityContractHash: string;
  readonly sourceRecordVersion?: number;
  readonly captureEvent: string;
  readonly captureKind: SnapshotCaptureKind;
  readonly correlationId?: string;
  readonly auditEventId?: string;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly retentionClass: SnapshotRetentionClass;
  readonly captureSource: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface SnapshotCaptureReceipt { readonly kind: "created" | "replayed"; readonly snapshot: RecordSnapshot; }
export interface SnapshotReadScope { readonly tenantId: string; readonly principalId: string; readonly planeKey: "studio" | "neon" | "mesh"; }
export interface SnapshotComparison { readonly fromSnapshotId: string; readonly toSnapshotId: string; readonly changedFields: readonly { readonly field: string; readonly before: unknown; readonly after: unknown }[]; }

export interface RecordEditLock { readonly tenantId: string; readonly entityCode: string; readonly recordId: string; readonly ownerPrincipalId: string; readonly token: string; readonly fencingToken: number; readonly acquiredAt: string; readonly expiresAt: string; }
export type LockAcquisitionResult = { readonly kind: "acquired"; readonly lock: RecordEditLock } | { readonly kind: "held"; readonly lock: RecordEditLock };

export interface RegisteredActionCommand extends BaseRecordCommand { readonly recordId: string; readonly actionCode: string; readonly input?: Readonly<Record<string, unknown>>; }
export interface RegisteredActionResult { readonly actionCode: string; readonly recordId: string; readonly output?: Readonly<Record<string, unknown>>; }
