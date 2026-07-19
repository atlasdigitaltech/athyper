import "server-only";

import {
  QueryClient,
  dehydrate,
  type DehydratedState,
} from "@tanstack/react-query";
import type { V4Session } from "@athyper/auth-bff";
import { queryKeys, type RecordWorkspaceKeyInput } from "@athyper/api-contracts/query-keys";
import type { DocumentEditCoordinatorIdentity } from "@athyper/runtime-canvas";
import type {
  EffectiveRecordWorkspaceManifest,
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import type {
  RuntimeListState,
  RuntimeRecordRow,
} from "@athyper/runtime-shared/core";
import { getDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import {
  getMetaEntityRecordDetail,
  normalizeRouteRecordId,
  type MetaEntityRecordDetail,
} from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { resolveEffectiveRecordWorkspaceManifestFromLoaded } from "@/lib/server/record-workspace-manifest";
import type {
  RuntimeRecordDiagnosticCollector,
  RuntimeRecordDiagnosticOperation,
} from "@/lib/server/runtime-record-observability";
import { getNeonServerSession } from "@/lib/server/session";

export const RECORD_WORKSPACE_BOOTSTRAP_STALE_TIME_MS = 30_000;
export const RECORD_WORKSPACE_OPTIONAL_BUDGET_MS = 25;

export interface RecordWorkspaceOptionalData {
  editCoordinatorIdentity: DocumentEditCoordinatorIdentity;
}

export interface RecordWorkspaceOptionalFailure {
  key: keyof RecordWorkspaceOptionalData;
  message: string;
}

export interface RecordWorkspaceOptionalResult {
  ready: Partial<RecordWorkspaceOptionalData>;
  pending: Array<keyof RecordWorkspaceOptionalData>;
  failures: RecordWorkspaceOptionalFailure[];
}

export interface RecordWorkspaceBootstrap {
  entityCode: string;
  recordId: string;
  descriptor?: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  detailState: RuntimeListState;
  processState: ProcessRuntimeState | null;
  manifest?: EffectiveRecordWorkspaceManifest;
  dehydratedState: DehydratedState;
  optional: RecordWorkspaceOptionalResult;
}

interface RecordWorkspaceBootstrapDependencies {
  loadDescriptor: (
    entityCode: string,
    recordId: string,
  ) => Promise<MetaEntityRuntimeDescriptor | undefined>;
  loadRecord: (
    entityCode: string,
    recordId: string,
    descriptor?: MetaEntityRuntimeDescriptor,
    options?: {
      session?: V4Session;
      scopeStrategy?: "verified_upstream" | "bff_compatibility";
    },
  ) => Promise<MetaEntityRecordDetail>;
  loadProcessState: (
    entityCode: string,
    recordId: string,
    descriptor: MetaEntityRuntimeDescriptor | undefined,
    record: RuntimeRecordRow | undefined,
  ) => Promise<ProcessRuntimeState | null>;
  loadSession: () => Promise<V4Session | null>;
  loadEditCoordinatorIdentity: (
    record?: RuntimeRecordRow | null,
  ) => Promise<DocumentEditCoordinatorIdentity | undefined>;
}

export interface LoadRecordWorkspaceBootstrapOptions {
  diagnostics?: RuntimeRecordDiagnosticCollector;
  optionalBudgetMs?: number;
  /** Test seam; production callers use the server loaders above. */
  dependencies?: Partial<RecordWorkspaceBootstrapDependencies>;
}

const DEFAULT_DEPENDENCIES: RecordWorkspaceBootstrapDependencies = {
  loadDescriptor: getMetaEntityRuntimeDescriptor,
  loadRecord: getMetaEntityRecordDetail,
  loadProcessState: getMetaEntityProcessRuntimeState,
  loadSession: getNeonServerSession,
  loadEditCoordinatorIdentity: getDocumentEditCoordinatorIdentity,
};

/**
 * Builds the authoritative record workspace once per server request and
 * serializes its canonical query cache for browser hydration.
 */
export async function loadRecordWorkspaceBootstrap(
  routeEntity: string,
  routeRecordId: string,
  options: LoadRecordWorkspaceBootstrapOptions = {},
): Promise<RecordWorkspaceBootstrap> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
  const recordId = normalizeRouteRecordId(routeRecordId);
  const queryClient = createRecordWorkspaceServerQueryClient();
  const sessionPromise = measured(
    options.diagnostics,
    "session",
    dependencies.loadSession,
  );
  const descriptor = await measured(
    options.diagnostics,
    "descriptor",
    () => dependencies.loadDescriptor(routeEntity, recordId),
  );
  const session = await sessionPromise;
  const detail = await measured(
    options.diagnostics,
    "record_core",
    () => dependencies.loadRecord(routeEntity, recordId, descriptor, {
      ...(session ? { session } : {}),
      scopeStrategy: "verified_upstream",
    }),
  );
  const processState = await measured(
    options.diagnostics,
    "process_state",
    () => dependencies.loadProcessState(routeEntity, recordId, descriptor, detail.record),
  );

  const manifestStartedAt = performance.now();
  const manifest = descriptor && detail.record && session
    ? resolveEffectiveRecordWorkspaceManifestFromLoaded({
        descriptor,
        recordId,
        record: detail.record,
        processState,
        session,
      }).manifest
    : undefined;
  options.diagnostics?.record("manifest", performance.now() - manifestStartedAt);

  if (manifest && detail.record) {
    seedRecordWorkspaceBootstrapQueries({
      queryClient,
      manifest,
      record: detail.record,
      processState,
    });
  }

  const optional = descriptor?.renderer === "document" && detail.record
    ? await measured(
        options.diagnostics,
        "optional",
        () => settleRecordWorkspaceOptionalLoaders({
          ...(descriptor.editRuntime
            ? {
                editCoordinatorIdentity: () => measured(
                  options.diagnostics,
                  "edit_identity",
                  () => dependencies.loadEditCoordinatorIdentity(detail.record),
                ),
              }
            : {}),
        }, options.optionalBudgetMs ?? RECORD_WORKSPACE_OPTIONAL_BUDGET_MS),
      )
    : emptyOptionalResult();

  if (manifest) {
    seedReadyOptionalQueries(queryClient, manifest, optional.ready);
  }

  const hydrationStartedAt = performance.now();
  const dehydratedState = dehydrate(queryClient);
  options.diagnostics?.record("query_hydration", performance.now() - hydrationStartedAt);

  return {
    entityCode: descriptor?.entityCode ?? normalizeEntityCode(routeEntity),
    recordId,
    descriptor,
    record: detail.record,
    detailState: detail.state,
    processState,
    manifest,
    dehydratedState,
    optional,
  };
}

export function createRecordWorkspaceServerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: RECORD_WORKSPACE_BOOTSTRAP_STALE_TIME_MS,
        retry: false,
      },
    },
  });
}

export function seedRecordWorkspaceBootstrapQueries(input: {
  queryClient: QueryClient;
  manifest: EffectiveRecordWorkspaceManifest;
  record: RuntimeRecordRow;
  processState: ProcessRuntimeState | null;
}): RecordWorkspaceKeyInput {
  const keyInput = manifestKeyInput(input.manifest);
  input.queryClient.setQueryData(
    queryKeys.recordWorkspace.manifest(keyInput),
    input.manifest,
  );
  input.queryClient.setQueryData(
    queryKeys.recordWorkspace.recordCore(keyInput),
    { ok: true, record: input.record, processState: input.processState },
  );
  input.queryClient.setQueryData(
    queryKeys.recordWorkspace.processState(keyInput),
    { ok: true, processState: input.processState },
  );
  return keyInput;
}

export async function settleRecordWorkspaceOptionalLoaders(
  loaders: Partial<{
    [K in keyof RecordWorkspaceOptionalData]: () => Promise<RecordWorkspaceOptionalData[K] | undefined>;
  }>,
  budgetMs: number,
): Promise<RecordWorkspaceOptionalResult> {
  const entries = Object.entries(loaders) as Array<[
    keyof RecordWorkspaceOptionalData,
    () => Promise<RecordWorkspaceOptionalData[keyof RecordWorkspaceOptionalData] | undefined>,
  ]>;
  if (entries.length === 0) return emptyOptionalResult();

  const ready: Partial<RecordWorkspaceOptionalData> = {};
  const failures: RecordWorkspaceOptionalFailure[] = [];
  const pending = new Set(entries.map(([key]) => key));
  const tasks = entries.map(async ([key, loader]) => {
    try {
      const value = await loader();
      if (value !== undefined) {
        Object.assign(ready, { [key]: value });
      }
    } catch (error) {
      failures.push({
        key,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      pending.delete(key);
    }
  });

  if (budgetMs > 0) {
    await Promise.race([
      Promise.all(tasks),
      delay(budgetMs),
    ]);
  }

  return {
    ready: { ...ready },
    pending: [...pending],
    failures: [...failures],
  };
}

function seedReadyOptionalQueries(
  queryClient: QueryClient,
  manifest: EffectiveRecordWorkspaceManifest,
  ready: Partial<RecordWorkspaceOptionalData>,
): void {
  const keyInput = manifestKeyInput(manifest);
  for (const [key, value] of Object.entries(ready)) {
    queryClient.setQueryData(queryKeys.recordWorkspace.support(keyInput, key), value);
  }
}

function manifestKeyInput(manifest: EffectiveRecordWorkspaceManifest): RecordWorkspaceKeyInput {
  return {
    entityCode: manifest.entityCode,
    recordId: manifest.recordId,
    cacheScopeKey: manifest.cacheScope.key,
  };
}

function emptyOptionalResult(): RecordWorkspaceOptionalResult {
  return { ready: {}, pending: [], failures: [] };
}

function normalizeEntityCode(value: string): string {
  return value.trim().split(".").filter(Boolean).at(-1)?.replace(/-/g, "_") ?? "";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function measured<T>(
  diagnostics: RuntimeRecordDiagnosticCollector | undefined,
  operation: RuntimeRecordDiagnosticOperation,
  loader: () => Promise<T>,
): Promise<T> {
  return diagnostics ? diagnostics.measure(operation, loader) : loader();
}
