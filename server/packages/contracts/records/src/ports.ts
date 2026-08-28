import type {
  AggregateRecordCommand,
  CreateRecordCommand,
  DeleteRecordCommand,
  PatchRecordCommand,
  RecordMutationResult,
  TransitionRecordCommand,
} from "./mutation.js";
import type { GetRecordQuery, ListRecordsQuery, RecordDetailResult, RecordListResult } from "./query.js";
import type { BulkCommand, BulkExecutionResult, BulkPreflightResult, ImportValidationRow, LockAcquisitionResult, RecordEditLock, RecordImportOperation, RecordImportSession, RecordSnapshot, RecordSnapshotCaptureInput, RegisteredActionCommand, RegisteredActionResult, SnapshotCaptureKind, SnapshotCaptureReceipt, SnapshotComparison, SnapshotReadScope, SnapshotRetentionClass } from "./advanced.js";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export type RecordCollectionScopeConstraint = Readonly<{
  readonly kind: "neon.business_partner.operating_organization.v1";
  readonly operatingOrganizationId: string;
}> | Readonly<{
  readonly kind: "mesh.network_relationship.actor_account.v1";
  readonly networkAccountId: string;
}> | Readonly<{
  readonly kind: "studio.metadata_entity.catalog.v1";
  readonly tenantId: string;
}>;

export type RecordCollectionScopeResolution =
  | Readonly<{ readonly status: "context_required"; readonly labels: readonly { readonly key: string; readonly label: string; readonly value: string }[] }>
  | Readonly<{ readonly status: "forbidden"; readonly code: string; readonly message: string; readonly labels: readonly { readonly key: string; readonly label: string; readonly value: string }[] }>
  | Readonly<{
      readonly status: "ready";
      readonly authorizationResource: Readonly<Record<string, string>>;
      readonly constraints: readonly RecordCollectionScopeConstraint[];
      readonly labels: readonly { readonly key: string; readonly label: string; readonly value: string }[];
      /** Canonical server-resolved material included in descriptor and cursor authority hashes. */
      readonly fingerprintMaterial: Readonly<Record<string, string>>;
    }>;

export interface RecordCollectionScopeResolver {
  resolve(input: Readonly<{
    readonly context: VerifiedRequestContext;
    readonly descriptor: EntityRuntimeDescriptor;
    readonly operationCode: "read" | "import";
    readonly coordinate?: ListRecordsQuery["scopeCoordinate"];
  }>): Promise<RecordCollectionScopeResolution>;
}

export interface GovernedImportAdapter<Transaction = unknown> {
  readonly key: string;
  supports(descriptor: EntityRuntimeDescriptor): boolean;
  operations(descriptor: EntityRuntimeDescriptor): readonly RecordImportOperation[];
  validate(input: {
    readonly context: VerifiedRequestContext;
    readonly descriptor: EntityRuntimeDescriptor;
    readonly session: RecordImportSession;
    readonly scope: Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>;
    readonly row: Readonly<Record<string, unknown>>;
    readonly rowNumber: number;
  }): Promise<ImportValidationRow>;
  apply(input: {
    readonly context: VerifiedRequestContext;
    readonly descriptor: EntityRuntimeDescriptor;
    readonly session: RecordImportSession;
    readonly scope: Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>;
    readonly row: Readonly<Record<string, unknown>>;
    readonly rowNumber: number;
    readonly transaction: Transaction;
  }): Promise<{ readonly outcome: "created" | "updated" | "deleted" | "requested" | "drafted" | "skipped"; readonly recordId?: string }>;
}

export interface RecordMutationService {
  create(command: CreateRecordCommand): Promise<RecordMutationResult>;
  patch(command: PatchRecordCommand): Promise<RecordMutationResult>;
  delete(command: DeleteRecordCommand): Promise<RecordMutationResult>;
  transition(command: TransitionRecordCommand): Promise<RecordMutationResult>;
  mutateAggregate(command: AggregateRecordCommand): Promise<RecordMutationResult>;
}

export interface RecordQueryService {
  list(query: ListRecordsQuery): Promise<RecordListResult>;
  get(query: GetRecordQuery): Promise<RecordDetailResult>;
}

export interface RecordRepositoryListInput {
  readonly descriptor: EntityRuntimeDescriptor;
  readonly tenantId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly filters: ListRecordsQuery["filters"];
  readonly sort: ListRecordsQuery["sort"];
  readonly group?: string;
  readonly search?: string;
  readonly countMode: ListRecordsQuery["countMode"];
  readonly projection: readonly string[];
  /** Trusted identities used by server-side authorization revalidation. */
  readonly recordIds?: readonly string[];
  /** Binds opaque cursors to the authenticated principal and effective authorization generation. */
  readonly cursorScope: string;
  /** Trusted constraints emitted only by a registered server-side scope resolver. */
  readonly collectionScope: readonly RecordCollectionScopeConstraint[];
}

export interface RecordRepository<Transaction = unknown> {
  list(input: RecordRepositoryListInput, transaction?: Transaction): Promise<RecordListResult>;
  get(descriptor: EntityRuntimeDescriptor, tenantId: string, recordId: string, projection: readonly string[], transaction?: Transaction): Promise<Readonly<Record<string, unknown>> | null>;
  create(descriptor: EntityRuntimeDescriptor, tenantId: string, input: Readonly<Record<string, unknown>>, transaction: Transaction): Promise<Readonly<Record<string, unknown>>>;
  patch(descriptor: EntityRuntimeDescriptor, tenantId: string, recordId: string, input: Readonly<Record<string, unknown>>, expectedVersion: number | undefined, transaction: Transaction): Promise<{ readonly record: Readonly<Record<string, unknown>> | null; readonly versionConflict?: number }>;
  delete(descriptor: EntityRuntimeDescriptor, tenantId: string, recordId: string, expectedVersion: number | undefined, transaction: Transaction): Promise<{ readonly deleted: boolean; readonly versionConflict?: number }>;
}

export interface RecordLifecycleService {
  transition(command: TransitionRecordCommand): Promise<RecordMutationResult>;
}

export interface RecordAggregateExecutor<Transaction> {
  execute(descriptor: EntityRuntimeDescriptor, command: AggregateRecordCommand, transaction: Transaction): Promise<Readonly<Record<string, unknown>> | null>;
}

/** Selects the tenant-aware transaction boundary for the authenticated plane. */
export type RecordTransactionCoordinator<Transaction> = PlaneTransactionCoordinator<Transaction>;

export interface RecordBulkService { preflight(command: BulkCommand): Promise<BulkPreflightResult>; execute(command: BulkCommand): Promise<BulkExecutionResult>; }
export interface GovernedRecordJobDispatcher { enqueue(kind: "bulk" | "import" | "export", payload: Readonly<Record<string, unknown>>, options?: { readonly jobId: string }): Promise<string>; }
export interface RecordActionHandler { execute(command: RegisteredActionCommand): Promise<RegisteredActionResult>; }
export interface RecordActionService { execute(command: RegisteredActionCommand): Promise<RegisteredActionResult>; }
export interface RecordSnapshotRepository { capture(input: RecordSnapshotCaptureInput): Promise<SnapshotCaptureReceipt>; latest(scope: SnapshotReadScope, entityType: string, entityId: string): Promise<RecordSnapshot | null>; get(scope: SnapshotReadScope, snapshotId: string): Promise<RecordSnapshot | null>; }
export interface RecordSnapshotService {
  capture(context: VerifiedRequestContext, entityCode: string, recordId: string, options?: { readonly captureEvent?: string; readonly captureKind?: SnapshotCaptureKind; readonly auditEventId?: string; readonly validFrom?: string; readonly validUntil?: string; readonly retentionClass?: SnapshotRetentionClass; readonly captureSource?: string }): Promise<SnapshotCaptureReceipt>;
  query(context: VerifiedRequestContext, snapshotId: string): Promise<RecordSnapshot>;
  compare(context: VerifiedRequestContext, fromSnapshotId: string, toSnapshotId: string): Promise<SnapshotComparison>;
  restore(context: VerifiedRequestContext, snapshotId: string, expectedVersion: number, idempotencyKey: string): Promise<RecordMutationResult>;
}
export interface RecordLockRepository { acquire(input: { readonly tenantId: string; readonly entityCode: string; readonly recordId: string; readonly principalId: string; readonly ttlSeconds: number }): Promise<LockAcquisitionResult>; heartbeat(input: { readonly tenantId: string; readonly entityCode: string; readonly recordId: string; readonly principalId: string; readonly token: string; readonly fencingToken: number; readonly ttlSeconds: number }): Promise<RecordEditLock | null>; release(input: { readonly tenantId: string; readonly entityCode: string; readonly recordId: string; readonly principalId: string; readonly token: string; readonly fencingToken: number }): Promise<boolean>; }
export interface RecordLockService { acquire(context: VerifiedRequestContext, entityCode: string, recordId: string, ttlSeconds?: number): Promise<LockAcquisitionResult>; heartbeat(context: VerifiedRequestContext, entityCode: string, recordId: string, token: string, fencingToken: number, ttlSeconds?: number): Promise<RecordEditLock>; release(context: VerifiedRequestContext, entityCode: string, recordId: string, token: string, fencingToken: number): Promise<void>; }
