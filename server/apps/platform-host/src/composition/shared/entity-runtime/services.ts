import type { Transaction } from "kysely";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeResolver } from "@athyper/server-contract-records";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import {
  createParentCollectionScopeResolver,
  createRecordBookmarkService,
  createRecordHistoryHook,
  createRecordMutationService,
  createRecordSnapshotService,
  createTransactionalRecordActionService,
  KyselyRecordSnapshotRepository,
  type RecordHistoryAdapter,
  type TransactionalRecordActionHandler,
} from "@athyper/server-service-records";
import { createEntityReadRuntime } from "./read-runtime.js";
import { createEntityActivityProvider } from "./activity-provider.js";
import {
  createActivityRecordingResolver,
  type ActivityAdapterRegistration,
} from "./activity-recording.js";
import type { createPublishedParentAdmission } from "./published-parent-admission.js";
import type { createPublishedRecordHeader } from "./published-record-header.js";

type RecordTransaction = Transaction<Record<string, never>>;
type MutationOptions = Parameters<
  typeof createRecordMutationService<RecordTransaction>
>[0];

export interface EntityServiceOptions {
  /** Installed, transaction-bound evidence only; absence must fail closed for
   * version-1.1 reads. Read evidence is not a mutation authorization port. */
  readonly liveReadEvidence?: Parameters<
    typeof createEntityReadRuntime<RecordTransaction>
  >[0]["liveReadEvidence"];
  readonly common: Omit<
    MutationOptions,
    "history" | "aggregateExecutor" | "mutationPolicies" | "collectionScopes"
  >;
  readonly listMetadata: MetadataReader;
  readonly admitDescriptor: Parameters<
    typeof createEntityActivityProvider
  >[0]["admitDescriptor"];
  readonly reader: PinnedCompiledEntityReader;
  readonly fallbackCollectionScopes?: RecordCollectionScopeResolver;
  readonly presentation?: Parameters<
    typeof createEntityReadRuntime<RecordTransaction>
  >[1];
  readonly bookmarkCache?: Parameters<
    typeof createRecordBookmarkService
  >[0]["cache"];
  readonly activityRegistrations: ReadonlyMap<
    string,
    ActivityAdapterRegistration
  >;
  readonly historyAdapters: ReadonlyMap<string, RecordHistoryAdapter>;
  readonly activityDomainHandlers: ReadonlyMap<
    string,
    TransactionalRecordActionHandler<RecordTransaction>
  >;
  readonly mutationPolicies?: MutationOptions["mutationPolicies"];
  readonly snapshotsEnabled?: boolean;
}

/** Construct the same shared record services for reads, writes, and publication qualification.
 * Host/space overrides are explicit ports; this module owns no routes or adapters. */
export function createEntityServices(options: EntityServiceOptions) {
  const {
    common,
    listMetadata,
    reader,
    activityRegistrations,
    historyAdapters,
    activityDomainHandlers,
  } = options;
  const { metadata, authorizer, transactions } = common;
  const presentation = options.presentation ?? {};
  const collectionScopes = createParentCollectionScopeResolver({
    metadata: listMetadata,
    fallback: options.fallbackCollectionScopes,
    readParent: (input) => queries.get(input),
  });
  const listExecutionOptions = {
    ...common,
    ...(options.liveReadEvidence
      ? { liveReadEvidence: options.liveReadEvidence }
      : {}),
    metadata: listMetadata,
    ...(collectionScopes ? { collectionScopes } : {}),
  };
  const { listExecutor, queries, lists } = createEntityReadRuntime(
    listExecutionOptions,
    presentation,
  );
  const readPublishedParent: Parameters<
    typeof createPublishedParentAdmission
  >[0]["read"] = async (input, descriptor) => {
    const pinned = createEntityReadRuntime({
      ...listExecutionOptions,
      metadata: {
        async getEntityDescriptor(context, entityCode) {
          return context.tenantId === input.context.tenantId &&
            context.principalId === input.context.principalId &&
            context.planeKey === descriptor.planeKey &&
            entityCode === descriptor.entityCode
            ? descriptor
            : null;
        },
      },
    }).queries;
    const found = await pinned.list({
      context: input.context,
      entityCode: input.entityCode,
      recordIds: [input.recordId],
      fields: [descriptor.storage.idField],
      limit: 1,
      countMode: "none",
      hydrateReferences: false,
    });
    return (
      found.data.length === 1 &&
      String(found.data[0]?.[descriptor.storage.idField]) === input.recordId
    );
  };
  const readPublishedHeader: Parameters<
    typeof createPublishedRecordHeader
  >[0]["read"] = async (input, descriptor, fields) => {
    const pinned = createEntityReadRuntime({
      ...listExecutionOptions,
      metadata: {
        async getEntityDescriptor(context, entityCode) {
          return context.tenantId === input.context.tenantId &&
            context.principalId === input.context.principalId &&
            context.planeKey === descriptor.planeKey &&
            entityCode === descriptor.entityCode
            ? descriptor
            : null;
        },
      },
    }).queries;
    const found = await pinned.list({
      context: input.context,
      entityCode: descriptor.entityCode,
      recordIds: [input.recordId],
      fields: [...fields],
      limit: 1,
      countMode: "none",
      hydrateReferences: false,
    });
    return found.data.length === 1 ? found.data[0]! : null;
  };
  // Activity reads use the same pinned descriptor and authorized query path.
  const activityProvider = createEntityActivityProvider({
    admitDescriptor: options.admitDescriptor,
    collectionProviders: new Map(
      [...activityRegistrations].flatMap(([key, r]) =>
        r.collections ? [[key, r.collections] as const] : [],
      ),
    ),
    reader,
    authorizer,
    transactions,
    read: async (input, descriptor, fields, admission) =>
      readPublishedHeader(
        {
          context: input.context,
          recordId: input.recordId,
          release: admission.release,
          core: await reader.core(admission.release),
          fieldKeys: fields,
        },
        descriptor,
        fields,
      ),
  });
  const bookmarks = createRecordBookmarkService({
    transactions,
    listExecutor,
    ...(options.bookmarkCache ? { cache: options.bookmarkCache } : {}),
  });
  const resolveHistory = createActivityRecordingResolver(
    reader,
    historyAdapters,
  );
  const recordHistory = createRecordHistoryHook({
    resolve: resolveHistory,
    adapters: historyAdapters,
  });
  const activityDomainActions = createTransactionalRecordActionService({
    ...common,
    history: recordHistory,
    handlers: activityDomainHandlers,
  });
  const mutations = createRecordMutationService<RecordTransaction>({
    ...common,
    referenceChoices: lists.referenceChoices,
    collectionScopes,
    mutationPolicies: options.mutationPolicies,
    history: recordHistory,
    aggregateExecutor: {
      async execute(descriptor, command, tx) {
        const binding = await resolveHistory(command, descriptor);
        const executor = binding?.adapterKey
          ? activityRegistrations.get(binding.adapterKey)?.aggregateExecutor
          : undefined;
        if (!executor) throw Error("RECORD_AGGREGATE_ADAPTER_UNAVAILABLE");
        return executor.execute(descriptor, command, tx);
      },
    },
  });
  const snapshots = options.snapshotsEnabled
    ? createRecordSnapshotService({
        authorizer,
        metadata,
        queries,
        mutations,
        repository: new KyselyRecordSnapshotRepository(transactions),
      })
    : undefined;

  return {
    lists,
    queries,
    mutations,
    snapshots,
    bookmarks,
    collectionScopes,
    readPublishedParent,
    readPublishedHeader,
    activityProvider,
    recordHistory,
    activityDomainActions,
  };
}

export type EntityServices = ReturnType<typeof createEntityServices>;
