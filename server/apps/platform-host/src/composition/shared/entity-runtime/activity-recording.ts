import { assertCollectionProvider, type ActivityCollectionProviderRegistration } from "./activity-collections.js";
import { parseActivityBinding } from "@athyper/server-contract-publication";
import {
  readCompiledRuntimeContract,
  type PinnedCompiledEntityReader,
} from "@athyper/server-platform-metadata";
import {
  qualifyRecordHistoryDescriptor,
  type RecordHistoryBinding,
  type RecordHistoryAdapter,
  type IdempotentRecordCommand,
} from "@athyper/server-service-records";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";

/** Mutation and history must use exactly the same signed release and contract. */
export function createActivityRecordingResolver(
  reader: PinnedCompiledEntityReader,
  adapters?: ReadonlyMap<string, RecordHistoryAdapter>,
) {
  return async (
    command: IdempotentRecordCommand,
    descriptor: EntityRuntimeDescriptor,
  ): Promise<RecordHistoryBinding | undefined> => {
    // Legacy/injected descriptors cannot carry a signed activity release. Do
    // not probe the compiled-release store merely to discover that absence.
    if (!descriptor.compiledRelease) return;
    const release = await reader.resolve({
      tenantId: command.context.tenantId,
      principalId: command.context.principalId,
      planeKey: command.context.planeKey,
      entityCode: command.entityCode,
    });
    // Legacy descriptors have no published Activity. A missing published head is
    // an error for a compiled descriptor rather than an optional recording skip.
    if (!release) throw Error("RECORD_HISTORY_RELEASE_UNAVAILABLE");
    const core = await reader.core(release);
    const declaration = (
      core.content.capabilities as
        Record<string, { enabled?: boolean }> | undefined
    )?.activity;
    if (!declaration?.enabled) return;
    const operation = await reader.operation(release);
    const binding = parseActivityBinding(
      operation.content.activityBinding,
      descriptor.entityCode,
    );
    if (!binding.recording) return;
    const pinned = await readCompiledRuntimeContract(reader, release);
    if (
      pinned.releaseId !== descriptor.releaseId ||
      pinned.contractHash !== descriptor.contractHash ||
      pinned.compiledHash !== descriptor.compiledHash
    )
      throw Error("RECORD_HISTORY_RELEASE_CHANGED");
    const result = resolveRecordHistoryBinding(descriptor, binding);
    qualifyRecordHistoryDescriptor(
      descriptor,
      result,
      result.adapterKey ? adapters?.get(result.adapterKey) : undefined,
    );
    return result;
  };
}

/** Source-side ownership gate, followed by descriptor and database qualification.
 * No entity name is used to infer a writer. Domain/facade writers need a distinct provider. */
export async function qualifyActivityRecordingGraph(
  graph: import("@athyper/server-contract-meta-entity-authoring").MetaEntityGraph,
  adapters?: ReadonlyMap<string, ActivityAdapterRegistration>,
): Promise<void> {
  const { capabilityArtifactMembers } =
    await import("@athyper/server-contract-publication");
  const raw = capabilityArtifactMembers(
    graph.entity.entityCode,
    graph.capabilities ?? [],
  ).operationBindings.activityBinding;
  if (!raw) return;
  const b = parseActivityBinding(raw, graph.entity.entityCode);
  if (!b.recording) return;
  if (b.recording.adapterKey) {
    const registration = adapters?.get(b.recording.adapterKey);
    if (
      !registration ||
      registration.adapter.key !== b.recording.adapterKey ||
      (b.recording.operations.includes("aggregate") &&
        !registration.aggregateExecutor) ||
      (b.recording.operations.includes("domain") &&
        !registration.domainHandlers?.size)
    )
      throw Error("PUBLICATION_ACTIVITY_ADAPTER_UNAVAILABLE");
    if (
      graph.operations.some(
        (op) =>
          op.status !== "deprecated" &&
          op.handlerKey &&
          !registration.domainHandlers?.has(op.handlerKey),
      )
    )
      throw Error("PUBLICATION_ACTIVITY_DOMAIN_HANDLER_UNAVAILABLE");
    if (b.collections?.length) {
      assertCollectionProvider(registration.collections);
      if (b.snapshots.manualCapture && !registration.collections.captureConsistent) throw Error("PUBLICATION_ACTIVITY_CONSISTENT_CAPTURE_REQUIRED");
      if (b.collections.some(binding => !graph.surfaceSections?.some(section => section.sectionKey === binding.sectionKey))) throw Error("PUBLICATION_ACTIVITY_COLLECTION_SECTION_REQUIRED");
      if(b.snapshots.manualCapture && b.collections.some(item=>item.manualCapture?.consistency==="independent") && !registration.collections.captureIndependent)throw Error("PUBLICATION_ACTIVITY_INDEPENDENT_CAPTURE_REQUIRED");
      await registration.collections.qualifyGraph(graph, b);
    }
    await registration.qualifyGraph(graph, b);
    return;
  }
  const profiles = graph.runtimeProfiles ?? [];
  const profile = profiles[0];
  if (
    profiles.length !== 1 ||
    !profile ||
    profile.writeMode !== "generic" ||
    profile.concurrencyMode !== "optimistic" ||
    !profile.tenantFieldKey ||
    !profile.recordVersionFieldKey ||
    profile.writeHandlerKey ||
    graph.relations?.some(
      (r) =>
        r.mutationMode &&
        r.mutationMode !== "none" &&
        r.mutationMode !== "read_only",
    )
  )
    throw Error("PUBLICATION_ACTIVITY_WRITE_OWNERSHIP_REQUIRED");
  const operations = graph.operations.filter(
    (op) => op.status !== "deprecated",
  );
  const transitions =
    graph.lifecycleOperationBindings?.filter(
      (t) => t.status !== "deprecated",
    ) ?? [];
  const allowed = new Set([
    "list",
    "read",
    ...b.recording.operations.flatMap((op) =>
      op === "patch" ? ["patch", "update"] : [op],
    ),
    ...transitions.map(
      (t) =>
        graph.operations.find((op) => op.id === t.entityOperationId)
          ?.operationKey,
    ),
  ]);
  if (operations.some((op) => !allowed.has(op.operationKey) || op.handlerKey))
    throw Error("PUBLICATION_ACTIVITY_DOMAIN_PROVIDER_REQUIRED");
  const owned = [
    operations.some((op) => op.operationKey === "create") && "create",
    operations.some((op) => ["patch", "update"].includes(op.operationKey)) &&
      "patch",
    transitions.length && "transition",
    operations.some((op) => op.operationKey === "delete") && "delete",
  ].filter(Boolean);
  if (
    owned.some((op) => !b.recording!.operations.includes(op as never)) ||
    b.recording.operations.some((op) => !owned.includes(op))
  )
    throw Error("PUBLICATION_ACTIVITY_WRITE_OWNERSHIP_REQUIRED");
  const fields =
    b.recording.projection === "stored_root"
      ? graph.fields
          .filter(
            (f) =>
              f.valueOrigin === "stored" &&
              f.fieldKey !== profile.recordVersionFieldKey,
          )
          .map((f) => f.fieldKey)
      : b.recording.fields!;
  if (
    fields.some(
      (key) =>
        !graph.fields.some(
          (f) =>
            f.fieldKey === key &&
            f.valueOrigin === "stored" &&
            f.storagePath &&
            /^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.storagePath),
        ),
    ) ||
    graph.fields.some(
      (f) =>
        f.writeMode &&
        f.writeMode !== "read_only" &&
        !fields.includes(f.fieldKey),
    )
  )
    throw Error("PUBLICATION_ACTIVITY_PROJECTION_REQUIRED");
  if (
    b.snapshots.automaticCapture === "milestone" &&
    b.snapshots.captureOperations.some(
      (key) =>
        !transitions.some((t) => key === `transition.${t.transitionCode}`),
    )
  )
    throw Error("PUBLICATION_ACTIVITY_MILESTONE_REQUIRED");
}

export function resolveRecordHistoryBinding(
  descriptor: EntityRuntimeDescriptor,
  binding: ReturnType<typeof parseActivityBinding>,
): RecordHistoryBinding {
  if (!binding.recording) throw Error("RECORD_HISTORY_BINDING_REQUIRED");
  const fields =
    binding.recording.projection === "stored_root"
      ? descriptor.fields
          .filter(
            (field) =>
              !field.computation &&
              (!field.valueOrigin || field.valueOrigin === "stored") &&
              field.storagePath !== descriptor.storage.versionField,
          )
          .map((field) => field.key)
      : binding.recording.fields!;
  return { ...binding.recording, ...binding.snapshots, fields, ...(binding.collections ? {collections:binding.collections.filter(item=>item.manualCapture?.consistency!=="independent")} : {}) };
}

/** Installed code, qualified alongside the signed metadata. A registration must
 * account for every root, collection and domain write in the graph. */
export interface ActivityAdapterRegistration {
  readonly collections?: ActivityCollectionProviderRegistration;
  readonly adapter: RecordHistoryAdapter;
  readonly qualifyGraph: (
    graph: import("@athyper/server-contract-meta-entity-authoring").MetaEntityGraph,
    binding: ReturnType<typeof parseActivityBinding>,
  ) => Promise<void>;
  readonly aggregateExecutor?: import("@athyper/server-contract-records").RecordAggregateExecutor<
    import("kysely").Transaction<Record<string, never>>
  >;
  readonly domainHandlers?: ReadonlyMap<
    string,
    import("@athyper/server-service-records").TransactionalRecordActionHandler<
      import("kysely").Transaction<Record<string, never>>
    >
  >;
}
