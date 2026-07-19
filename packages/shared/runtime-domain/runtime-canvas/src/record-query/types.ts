import type { QueryClient } from "@tanstack/react-query";
import type {
  EffectiveRecordWorkspaceManifest,
  RecordWorkspaceResourceKey,
} from "@athyper/runtime-contracts";
import type {
  RecordWorkspaceCollectionParams,
  RecordWorkspaceKeyInput,
} from "@athyper/api-contracts/query-keys";

export interface RecordWorkspaceAdapterRequest {
  manifest: EffectiveRecordWorkspaceManifest;
  entityCode: string;
  recordId: string;
  signal: AbortSignal;
}

export interface RecordWorkspaceCollectionRequest extends RecordWorkspaceAdapterRequest {
  params?: RecordWorkspaceCollectionParams;
}

export interface RecordWorkspaceSnapshotRequest extends RecordWorkspaceAdapterRequest {
  snapshotId: string;
}

export interface RecordWorkspaceSnapshotCompareRequest extends RecordWorkspaceAdapterRequest {
  leftSnapshotId: string;
  rightSnapshotId: string;
}

/**
 * Explicit transport selected from descriptor metadata. Collection adapters
 * must never infer a relation name from a UI key: doing so can issue requests
 * for relations the entity does not declare.
 */
export type RecordWorkspaceChildCollectionSource =
  | { kind: "relation"; relationCode: string }
  | { kind: "binding"; bindingCode: string }
  | { kind: "entity_filter"; entityCode: string; parentField: string }
  | { kind: "lines"; lineEntityCode?: string }
  | { kind: "distributions" };

export interface RecordWorkspaceChildCollectionRequest extends RecordWorkspaceCollectionRequest {
  collectionKey: string;
  source: RecordWorkspaceChildCollectionSource;
}

/**
 * Transport boundary for the workspace. The first implementation deliberately
 * mirrors today's individual endpoints; later phases may replace several
 * methods with one batched workspace endpoint without changing component hooks.
 */
export interface RecordWorkspaceQueryAdapters {
  recordCore: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  processState: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  approvals: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  lifecycleTimeline: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  snapshots: (request: RecordWorkspaceCollectionRequest) => Promise<unknown>;
  snapshotDetail: (request: RecordWorkspaceSnapshotRequest) => Promise<unknown>;
  snapshotCompare: (request: RecordWorkspaceSnapshotCompareRequest) => Promise<unknown>;
  snapshotRestore: (request: RecordWorkspaceSnapshotRequest) => Promise<unknown>;
  snapshotChildContracts: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  auditLog: (request: RecordWorkspaceCollectionRequest) => Promise<unknown>;
  childCollection: (request: RecordWorkspaceChildCollectionRequest) => Promise<unknown>;
  comments: (request: RecordWorkspaceCollectionRequest) => Promise<unknown>;
  commentSummary: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  attachments: (request: RecordWorkspaceCollectionRequest) => Promise<unknown>;
  attachmentWorkspace: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  attachmentFolders: (request: RecordWorkspaceAdapterRequest) => Promise<unknown>;
  activity: (request: RecordWorkspaceCollectionRequest) => Promise<unknown>;
}

export interface RecordWorkspaceInitialQueryData {
  recordCore?: unknown;
  processState?: unknown;
}

export interface RecordWorkspaceQueryContextValue {
  manifest: EffectiveRecordWorkspaceManifest;
  keyInput: RecordWorkspaceKeyInput;
  adapters: RecordWorkspaceQueryAdapters;
  initialData?: RecordWorkspaceInitialQueryData;
  /** The application-level QueryClient obtained from useQueryClient(). */
  queryClient: QueryClient;
  hasResource: (resource: RecordWorkspaceResourceKey) => boolean;
}

export interface RecordWorkspaceHookOptions {
  enabled?: boolean;
  staleTime?: number;
  /**
   * Resource-level retry policy. Collaboration resources default to no
   * automatic retry because a deterministic 5xx must not be multiplied into
   * gateway circuit-breaker failures; users can still retry explicitly.
   */
  retry?: boolean | number | ((failureCount: number, error: Error) => boolean);
}

export interface RecordWorkspaceCollectionHookOptions extends RecordWorkspaceHookOptions {
  params?: RecordWorkspaceCollectionParams;
  pagination?: {
    page: number;
    pageSize: number;
  };
}

export interface RecordWorkspaceChildCollectionHookOptions extends RecordWorkspaceCollectionHookOptions {
  source?: RecordWorkspaceChildCollectionSource;
  /** Effective surface that authorizes/owns this collection, when known. */
  surfaceKey?: string;
  /** Data already returned by an authoritative workspace bootstrap/coordinator. */
  initialData?: unknown;
}
