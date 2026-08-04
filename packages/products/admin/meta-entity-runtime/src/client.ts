import {
  EMPTY_META_ENTITY_STUDIO_SNAPSHOT,
  type MetaEntityActivityItem,
  type MetaEntityCheckpointCommand,
  type MetaEntityCheckpointResult,
  type MetaEntityContractTestResult,
  type MetaEntityContractTestRun,
  type MetaEntityCapabilities,
  type MetaEntityChangeSetSummary,
  type MetaEntityClassProfile,
  type MetaEntityCreateChangeSetCommand,
  type MetaEntityCreateCommand,
  type MetaEntityModuleCoordinate,
  type MetaEntityNumberingPreviewCommand,
  type MetaEntityNumberingTestArtifact,
  type MetaEntityPhase2Graph,
  type MetaEntityPolicyDefinitionRef,
  type MetaEntityRuntimeProfileDraft,
  type MetaEntityPublishCommand,
  type MetaEntityReleaseResult,
  type MetaEntityReleaseSummary,
  type MetaEntitySaveResult,
  type MetaEntityStudioSnapshot,
  type MetaEntitySummary,
  type MetaEntityValidationResult,
  type MetaEntityWorkflowCommand,
} from "@athyper/meta-entity-authoring-contracts";

export interface MetaEntityFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface MetaEntityFetchInit {
  method?: "GET" | "POST" | "PUT";
  headers?: Readonly<Record<string, string>>;
  body?: string;
  signal?: AbortSignal;
}

export type MetaEntityFetch = (
  input: string,
  init?: MetaEntityFetchInit,
) => Promise<MetaEntityFetchResponse>;

export class MetaEntityApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "MetaEntityApiError";
  }
}

export interface LoadMetaEntityStudioOptions {
  entityId?: string | null;
  changeSetId?: string | null;
  signal?: AbortSignal;
}

export interface MetaEntityAuthoringClient {
  getCapabilities(signal?: AbortSignal): Promise<MetaEntityCapabilities>;
  listModuleCoordinates(signal?: AbortSignal): Promise<readonly MetaEntityModuleCoordinate[]>;
  listClassProfiles(signal?: AbortSignal): Promise<readonly MetaEntityClassProfile[]>;
  listPolicyDefinitions(signal?: AbortSignal): Promise<readonly MetaEntityPolicyDefinitionRef[]>;
  listEntities(signal?: AbortSignal): Promise<readonly MetaEntitySummary[]>;
  createEntity(command: MetaEntityCreateCommand): Promise<MetaEntitySummary>;
  listChangeSets(entityId: string, signal?: AbortSignal): Promise<readonly MetaEntityChangeSetSummary[]>;
  createChangeSet(entityId: string, command: Omit<MetaEntityCreateChangeSetCommand, "entityId">): Promise<MetaEntityChangeSetSummary>;
  getGraph(changeSetId: string, signal?: AbortSignal): Promise<MetaEntityPhase2Graph>;
  saveGraph(changeSetId: string, expectedLockVersion: number, graph: MetaEntityPhase2Graph): Promise<MetaEntitySaveResult>;
  validate(changeSetId: string): Promise<MetaEntityValidationResult>;
  runContractTests(changeSetId: string, expectedLockVersion: number): Promise<MetaEntityContractTestRun>;
  listContractTestRuns(changeSetId: string, signal?: AbortSignal): Promise<readonly MetaEntityContractTestRun[]>;
  listContractTestResults(testRunId: string, signal?: AbortSignal): Promise<readonly MetaEntityContractTestResult[]>;
  previewNumbering(changeSetId: string, command: Omit<MetaEntityNumberingPreviewCommand, "changeSetId">): Promise<MetaEntityNumberingTestArtifact>;
  listNumberingTestArtifacts(changeSetId: string, signal?: AbortSignal): Promise<readonly MetaEntityNumberingTestArtifact[]>;
  checkpoint(changeSetId: string, command: Omit<MetaEntityCheckpointCommand, "changeSetId">): Promise<MetaEntityCheckpointResult>;
  listRevisions(changeSetId: string, signal?: AbortSignal): Promise<readonly MetaEntityCheckpointResult[]>;
  diffRevisions(leftRevisionId: string, rightRevisionId: string): Promise<readonly string[]>;
  transition(
    changeSetId: string,
    action: "submit" | "return-to-draft" | "approve" | "reject" | "abandon",
    command: Omit<MetaEntityWorkflowCommand, "changeSetId">,
  ): Promise<MetaEntityChangeSetSummary>;
  publish(
    changeSetId: string,
    action: "publish" | "rollback" | "retire",
    command: Omit<MetaEntityPublishCommand, "changeSetId" | "releaseKind">,
  ): Promise<MetaEntityReleaseResult>;
  listReleases(entityId: string, signal?: AbortSignal): Promise<readonly MetaEntityReleaseSummary[]>;
  listActivity(entityId: string, signal?: AbortSignal): Promise<readonly MetaEntityActivityItem[]>;
  loadStudio(options?: LoadMetaEntityStudioOptions): Promise<MetaEntityStudioSnapshot>;
}

interface ApiFailure {
  error?: string;
  message?: string;
  detail?: unknown;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function preferredEntity(entities: readonly MetaEntitySummary[], requested?: string | null): MetaEntitySummary | null {
  return entities.find((entity) => entity.id === requested)
    ?? entities.find((entity) => entity.entityCode === "business_partner")
    ?? entities[0]
    ?? null;
}

const changeSetPriority: Readonly<Record<MetaEntityChangeSetSummary["status"], number>> = {
  draft: 0,
  rejected: 1,
  in_review: 2,
  approved: 3,
  published: 4,
  abandoned: 5,
};

export function selectPreferredChangeSet(
  changeSets: readonly MetaEntityChangeSetSummary[],
  requested?: string | null,
): MetaEntityChangeSetSummary | null {
  const exact = changeSets.find((changeSet) => changeSet.id === requested);
  if (exact) return exact;
  return [...changeSets].sort((left, right) =>
    changeSetPriority[left.status] - changeSetPriority[right.status]
    || right.lockVersion - left.lockVersion,
  )[0] ?? null;
}

export function isEditableChangeSet(changeSet: MetaEntityChangeSetSummary | null): boolean {
  return changeSet?.status === "draft" || changeSet?.status === "rejected";
}

export function copyClassProfileDefaults(
  runtimeProfile: MetaEntityRuntimeProfileDraft,
  classProfile: MetaEntityClassProfile,
): MetaEntityRuntimeProfileDraft {
  return {
    ...runtimeProfile,
    backingKind: classProfile.defaultBackingKind,
    apiExposure: classProfile.defaultApiExposure,
    readMode: classProfile.defaultReadMode,
    writeMode: classProfile.defaultWriteMode,
    concurrencyMode: classProfile.defaultConcurrencyMode,
    readHandlerKey: classProfile.defaultReadMode === "facade" ? runtimeProfile.readHandlerKey : null,
    writeHandlerKey: classProfile.defaultWriteMode === "facade" ? runtimeProfile.writeHandlerKey : null,
    recordVersionFieldKey: classProfile.defaultConcurrencyMode === "optimistic"
      ? runtimeProfile.recordVersionFieldKey
      : null,
  };
}

export function createMetaEntityAuthoringClient(
  fetcher: MetaEntityFetch,
  basePath = "/api/relay/meta-entity",
): MetaEntityAuthoringClient {
  async function request<T>(path: string, init?: MetaEntityFetchInit): Promise<T> {
    const response = await fetcher(`${basePath}${path}`, {
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
    });
    const body = await response.json().catch(() => null) as ApiFailure | T | null;
    if (!response.ok) {
      const failure = body as ApiFailure | null;
      throw new MetaEntityApiError(
        response.status,
        failure?.error ?? "META_ENTITY_REQUEST_FAILED",
        failure?.message ?? `Meta Entity request failed with status ${response.status}.`,
        failure?.detail,
      );
    }
    return body as T;
  }

  const client: MetaEntityAuthoringClient = {
    getCapabilities: (signal) => request("/capabilities", { signal }),
    listModuleCoordinates: (signal) => request("/module-coordinates", { signal }),
    listClassProfiles: (signal) => request("/class-profiles", { signal }),
    listPolicyDefinitions: (signal) => request("/policy-definitions", { signal }),
    listEntities: (signal) => request("/entities", { signal }),
    createEntity: (command) => request("/entities", { method: "POST", body: JSON.stringify(command) }),
    listChangeSets: (entityId, signal) => request(`/entities/${encodeSegment(entityId)}/change-sets`, { signal }),
    createChangeSet: (entityId, command) => request(`/entities/${encodeSegment(entityId)}/change-sets`, {
      method: "POST", body: JSON.stringify(command),
    }),
    getGraph: (changeSetId, signal) => request(`/change-sets/${encodeSegment(changeSetId)}/graph`, { signal }),
    saveGraph: (changeSetId, expectedLockVersion, graph) => request(
      `/change-sets/${encodeSegment(changeSetId)}/graph`,
      {
        method: "PUT",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedLockVersion,
          graph,
        }),
      },
    ),
    validate: (changeSetId) => request(`/change-sets/${encodeSegment(changeSetId)}/validate`, { method: "POST" }),
    runContractTests: (changeSetId, expectedLockVersion) => request(`/change-sets/${encodeSegment(changeSetId)}/test-runs`, {
      method: "POST", body: JSON.stringify({ expectedLockVersion }),
    }),
    listContractTestRuns: (changeSetId, signal) => request(`/change-sets/${encodeSegment(changeSetId)}/test-runs`, { signal }),
    listContractTestResults: (testRunId, signal) => request(`/test-runs/${encodeSegment(testRunId)}/results`, { signal }),
    previewNumbering: (changeSetId, command) => request(`/change-sets/${encodeSegment(changeSetId)}/numbering-previews`, {
      method: "POST", body: JSON.stringify(command),
    }),
    listNumberingTestArtifacts: (changeSetId, signal) => request(`/change-sets/${encodeSegment(changeSetId)}/numbering-previews`, { signal }),
    checkpoint: (changeSetId, command) => request(`/change-sets/${encodeSegment(changeSetId)}/checkpoints`, {
      method: "POST", body: JSON.stringify(command),
    }),
    listRevisions: (changeSetId, signal) => request(`/change-sets/${encodeSegment(changeSetId)}/revisions`, { signal }),
    diffRevisions: async (leftRevisionId, rightRevisionId) => {
      const result = await request<{ changedPaths: readonly string[] }>(
        `/revisions/${encodeSegment(leftRevisionId)}/diff/${encodeSegment(rightRevisionId)}`,
      );
      return result.changedPaths;
    },
    transition: (changeSetId, action, command) => request(
      `/change-sets/${encodeSegment(changeSetId)}/${action}`,
      { method: "POST", body: JSON.stringify(command) },
    ),
    publish: (changeSetId, action, command) => request(
      `/change-sets/${encodeSegment(changeSetId)}/${action}`,
      { method: "POST", body: JSON.stringify(command) },
    ),
    listReleases: (entityId, signal) => request(`/entities/${encodeSegment(entityId)}/releases`, { signal }),
    listActivity: (entityId, signal) => request(`/entities/${encodeSegment(entityId)}/activity`, { signal }),
    async loadStudio(options = {}) {
      const [capabilities, classProfiles, moduleCoordinates, policyDefinitions, entities] = await Promise.all([
        client.getCapabilities(options.signal),
        client.listClassProfiles(options.signal),
        client.listModuleCoordinates(options.signal),
        client.listPolicyDefinitions(options.signal),
        client.listEntities(options.signal),
      ]);
      const entity = preferredEntity(entities, options.entityId);
      if (!entity) return { ...EMPTY_META_ENTITY_STUDIO_SNAPSHOT, capabilities, classProfiles, moduleCoordinates, policyDefinitions, entities };
      const [changeSets, releases, activity] = await Promise.all([
        client.listChangeSets(entity.id, options.signal),
        client.listReleases(entity.id, options.signal),
        client.listActivity(entity.id, options.signal),
      ]);
      const activeChangeSet = selectPreferredChangeSet(changeSets, options.changeSetId);
      const [graph, revisions, testRuns, numberingTestArtifacts] = activeChangeSet ? await Promise.all([
        client.getGraph(activeChangeSet.id, options.signal),
        client.listRevisions(activeChangeSet.id, options.signal),
        client.listContractTestRuns(activeChangeSet.id, options.signal),
        client.listNumberingTestArtifacts(activeChangeSet.id, options.signal),
      ]) : [null, [], [], []] as const;
      const activeTestRunResults = testRuns[0]
        ? await client.listContractTestResults(testRuns[0].id, options.signal)
        : [];
      return {
        capabilities,
        classProfiles,
        moduleCoordinates,
        policyDefinitions,
        entities,
        changeSets,
        activeEntityId: entity.id,
        activeChangeSet,
        runtimeProfile: graph?.runtimeProfile ?? null,
        fields: graph?.fields ?? [],
        keys: graph?.keys ?? [],
        searchProfiles: graph?.searchProfiles ?? [],
        relations: graph?.relations ?? [],
        surfaces: graph?.surfaces ?? [],
        operations: graph?.operations ?? [],
        surfaceOperations: graph?.surfaceOperations ?? [],
        operationRules: graph?.operationRules ?? [],
        flows: graph?.flows ?? [],
        policyBindings: graph?.policyBindings ?? [],
        fieldPolicyBindings: graph?.fieldPolicyBindings ?? [],
        testCases: graph?.testCases ?? [],
        lifecycleBindings: graph?.lifecycleBindings ?? [],
        lifecycleOperationBindings: graph?.lifecycleOperationBindings ?? [],
        numberingBindings: graph?.numberingBindings ?? [],
        testRuns,
        activeTestRunResults,
        numberingTestArtifacts,
        diagnostics: [],
        revisions,
        releases,
        activity,
      };
    },
  };
  return client;
}

export function graphFromStudioSnapshot(snapshot: MetaEntityStudioSnapshot): MetaEntityPhase2Graph | null {
  if (!snapshot.runtimeProfile) return null;
  return {
    runtimeProfile: snapshot.runtimeProfile,
    fields: snapshot.fields,
    keys: snapshot.keys,
    searchProfiles: snapshot.searchProfiles,
    relations: snapshot.relations,
    surfaces: snapshot.surfaces,
    operations: snapshot.operations,
    surfaceOperations: snapshot.surfaceOperations,
    operationRules: snapshot.operationRules,
    flows: snapshot.flows,
    policyBindings: snapshot.policyBindings,
    fieldPolicyBindings: snapshot.fieldPolicyBindings,
    testCases: snapshot.testCases,
    lifecycleBindings: snapshot.lifecycleBindings,
    lifecycleOperationBindings: snapshot.lifecycleOperationBindings,
    numberingBindings: snapshot.numberingBindings,
  };
}
