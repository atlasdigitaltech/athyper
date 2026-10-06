import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import {
  nativeAiMembers,
  emptyReferenceMembers,
  type ExpandedNativeMetaEntityGraph,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  layoutFixtureContext,
  layoutFixture,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
const mock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("kysely", () => {
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      execute: () => mock.execute(strings.join("?"), values),
    }),
    { table: (name: string) => name },
  );
  return { sql };
});
import {
  loadNativeSupplementalMembers,
  validateNativeSupplementalReferences,
} from "./native-supplemental-storage.js";
vi.mock("./normalized-core-layout-storage.js", () => ({
  loadNormalizedCoreLayout: vi.fn(async () => ({
    core: layoutFixtureContext().core,
    layout: layoutFixture(),
  })),
}));
vi.mock("./normalized-reference-storage.js", async () => {
  const { emptyReferenceMembers } =
    await import("@athyper/server-contract-meta-entity-authoring");
  return {
    loadReferenceMembers: vi.fn(async () => emptyReferenceMembers()),
    loadFieldIdentities: vi.fn(
      async () => layoutFixtureContext().coreContext.identities,
    ),
    saveReferenceCommands: vi.fn(),
  };
});
vi.mock("./normalized-label-storage.js", () => ({
  loadNormalizedLabels: vi.fn(async () => ({
    entityId: c.entityId,
    changeSetId: c.changeSetId,
    tenantId: null,
    labels: [{ id: coreFixtureId(32) }],
    translations: [],
  })),
  saveLabelCommands: vi.fn(),
}));
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { sha256, validateGraph } from "./deterministic.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
import { nativeOperationToStorage } from "./native-operation-storage.js";
const c = {
  changeSetId: coreFixtureId(100),
  entityId: coreFixtureId(100),
  tenantId: null,
};
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
function operation(): NativeOperationRow {
  return {
    id: coreFixtureId(400),
    operationKey: "read",
    operationKind: "read",
    description: null,
    labelId: coreFixtureId(32),
    auditEventCode: "test.read",
    executionMode: "synchronous",
    idempotencyMode: "none",
    inputSurfaceId: null,
    resultSurfaceId: null,
    authorizationTarget: "existing",
    authorizationEffect: "read",
    requiresParentRead: false,
    requiresPreflight: false,
    replacementOperationId: null,
    handlerKey: "registered.read",
    handlerVersion: 1,
    preflightKey: null,
    preflightVersion: null,
    extensionFieldMode: "none",
    exportFormats: null,
    exportMaxRecords: null,
  };
}
let tables: Record<string, Record<string, unknown>[]>;
beforeEach(() => {
  tables = Object.fromEntries(
    Object.values(nativeAiMembers).map((d) => ["metadata." + d.table, []]),
  );
  tables["metadata.entity_operation"] = [
    {
      ...nativeOperationToStorage(operation()),
      requires_mfa: false,
      created_by: coreFixtureId(10),
    },
  ];
  tables["metadata.entity_ai_profile"] = [
    {
      id: coreFixtureId(500),
      enabled: true,
      description: null,
      aliases: [],
      context_kinds: ["record"],
      search_profile_id: null,
      vocabulary_locale: null,
    },
  ];
  tables["metadata.entity_ai_field"] = [
    {
      id: coreFixtureId(501),
      ai_profile_id: coreFixtureId(500),
      entity_field_id: coreFixtureId(2),
      position: 1,
    },
  ];
  mock.execute
    .mockReset()
    .mockImplementation(async (_text: string, values: unknown[]) => ({
      rows: tables[String(values[0])]!.map((value) => ({ value })),
    }));
});
it("reads every operation/AI branch through exact scoped SQL and retains typed NULL values", async () => {
  const members = await loadNativeSupplementalMembers(tx, c, 100);
  expect(members.operations).toEqual([operation()]);
  expect(members.ai.field[0]).toEqual({
    id: coreFixtureId(501),
    aiProfileId: coreFixtureId(500),
    entityFieldId: coreFixtureId(2),
    position: 1,
  });
  expect(members.ai.profile[0]!.description).toBeNull();
  expect(mock.execute).toHaveBeenCalledTimes(6);
  for (const [text, values] of mock.execute.mock.calls) {
    expect(text).toContain("entity_id=");
    expect(text).toContain("tenant_id IS NOT DISTINCT FROM");
    expect(values.slice(1)).toEqual([c.changeSetId, c.entityId, null, 101]);
  }
  expect(members.operations[0]).not.toHaveProperty("requiresMfa");
});
it("does not treat missing tables, missing typed columns or invalid AI provenance as empty branches", async () => {
  mock.execute.mockRejectedValueOnce(new Error("table unavailable"));
  await expect(loadNativeSupplementalMembers(tx, c, 100)).rejects.toThrow(
    "table unavailable",
  );
  delete tables["metadata.entity_operation"]![0]!.label_id;
  await expect(loadNativeSupplementalMembers(tx, c, 100)).rejects.toThrow();
});
it("requires a transaction and bounds each branch and the combined member inventory", async () => {
  await expect(
    loadNativeSupplementalMembers(
      { isTransaction: false } as unknown as typeof tx,
      c,
      100,
    ),
  ).rejects.toThrow("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  await expect(loadNativeSupplementalMembers(tx, c, 2)).rejects.toThrow(
    "NATIVE_SNAPSHOT_LIMIT",
  );
  await expect(loadNativeSupplementalMembers(tx, c, NaN)).rejects.toThrow(
    "NATIVE_SNAPSHOT_LIMIT",
  );
});
it("validates normalized references and semantic shape on current and historical snapshots", async () => {
  const members = await loadNativeSupplementalMembers(tx, c, 100);
  const context = layoutFixtureContext();
  const graph = {
    ...members,
    contractSchema: "athyper.meta-entity-contract/2.5",
    fields: context.core.field,
    runtimeProfiles: context.core.runtime,
    surfaces: context.core.surface,
    surfaceSections: layoutFixture().section,
    surfaceFieldBindings: layoutFixture().binding,
    ownedLabels: { labels: [{ id: coreFixtureId(32) }] },
    operations: members.operations,
  } as unknown as ExpandedNativeMetaEntityGraph;
  expect(() => validateNativeSupplementalReferences(graph, 100)).not.toThrow();
  const membersWithEnrollment = emptyReferenceMembers();
  (
    membersWithEnrollment.members as { operationField: unknown }
  ).operationField = [
    {
      id: coreFixtureId(700),
      entityOperationId: operation().id,
      entityFieldId: coreFixtureId(2),
      position: 1,
      operationChangeSetId: c.changeSetId,
    },
  ];
  const enrolled = {
    ...graph,
    ownedLabels: { ...graph.ownedLabels!, changeSetId: c.changeSetId },
    referenceMembers: membersWithEnrollment,
  };
  expect(() =>
    validateNativeSupplementalReferences(enrolled, 100),
  ).not.toThrow();
  const changedEnrollment = structuredClone(enrolled);
  (
    changedEnrollment.referenceMembers.members.operationField[0] as {
      operationChangeSetId: string;
    }
  ).operationChangeSetId = coreFixtureId(999);
  expect(() =>
    validateNativeSupplementalReferences(changedEnrollment, 100),
  ).toThrow("NATIVE_SNAPSHOT_REFERENCE_INVALID");
  const foreign = {
    ...graph,
    operations: graph.operations.map((o) => ({
      ...o,
      labelId: coreFixtureId(999),
    })),
  };
  expect(() => validateNativeSupplementalReferences(foreign, 100)).toThrow(
    "NATIVE_SNAPSHOT_REFERENCE_INVALID",
  );
  expect(() =>
    validateNativeSupplementalReferences({ ...graph, fields: [] }, 100),
  ).toThrow("NATIVE_SNAPSHOT_REFERENCE_INVALID");
  expect(() =>
    validateNativeSupplementalReferences(
      {
        ...graph,
        operationScopeBindings: [
          {
            id: coreFixtureId(900),
            entityOperationId: coreFixtureId(999),
            bindingKey: "foreign",
            targetPlane: "studio",
            decisionMode: "collection",
            scopeKind: "tenant",
            coordinateSource: "tenant_context",
          },
        ],
      },
      100,
    ),
  ).toThrow("NATIVE_SNAPSHOT_REFERENCE_INVALID");
  expect(() =>
    validateNativeSupplementalReferences(
      {
        ...graph,
        ai: {
          ...graph.ai,
          field: graph.ai.field.map((f) => ({ ...f, position: 2 })),
        },
      },
      100,
    ),
  ).toThrow("NATIVE_AI_SEMANTICS_INVALID");
  expect(() =>
    validateNativeSupplementalReferences(
      { ...graph, operations: [graph.operations[0]!, graph.operations[0]!] },
      100,
    ),
  ).toThrow("NATIVE_SNAPSHOT_OPERATION_INVENTORY_INVALID");
});

function repositoryFixture() {
  const root = {
    native_core_layout_version: 2,
    authoring_schema_hash: "b".repeat(64),
    source_kind: "product",
    reference_contract_version: 1,
    default_locale: "en",
    status: "draft",
    lock_version: 4,
  };
  const projection = mock.execute.getMockImplementation()!;
  let guard = true;
  let saved: ExpandedNativeMetaEntityGraph | null = null;
  mock.execute.mockImplementation(async (text: string, values: unknown[]) => {
    if (text.includes("to_jsonb(cs) AS source"))
      return { rows: [{ source: root }] };
    if (text.includes("e.entity_code,e.entity_class"))
      return {
        rows: [
          {
            entity_code: "synthetic_reference",
            entity_class: "master",
            ownership_model: "system",
            label_root: root,
          },
        ],
      };
    if (text.includes("to_regprocedure"))
      return { rows: [{ available: guard }] };
    if (text.includes("SELECT metadata.fn_assert_native_authoring_snapshot"))
      return { rows: [] };
    if (text.includes("SELECT graph,graph_hash"))
      return {
        rows: saved ? [{ graph: saved, graph_hash: sha256(saved) }] : [],
      };
    if (tables[String(values[0])]) return projection(text, values);
    return { rows: [] };
  });
  const policy: NativeAuthoringPolicy = {
    commands: {
      maxBatchBytes: 10000,
      maxCommands: 10,
      maxMembers: 100,
      authoringSchemaHash: "b".repeat(64),
    },
    snapshotVersions: [2],
    admit: vi.fn(async () => {}),
    resolveContext: vi.fn(async () => layoutFixtureContext()),
    resolveInitializer: vi.fn(async () => () => ({})),
  };
  const repository = new KyselyMetaEntityAuthoringRepository(
    tx,
    undefined,
    undefined,
    undefined,
    policy,
  );
  return {
    repository,
    policy,
    disableGuard: () => {
      guard = false;
    },
    save: (g: ExpandedNativeMetaEntityGraph) => {
      saved = g;
    },
  };
}
it("loads expanded snapshots through the existing repository and validates the exact historical version", async () => {
  const f = repositoryFixture();
  const input = { ...c, actorId: coreFixtureId(102) };
  const graph = await f.repository.loadNativeGraph(input);
  expect(graph.contractSchema).toBe("athyper.meta-entity-contract/2.5");
  if (graph.contractSchema !== "athyper.meta-entity-contract/2.5")
    throw Error("unexpected snapshot");
  expect(graph.operations).toEqual([operation()]);
  expect(graph.ai.field).toHaveLength(1);
  f.save(graph);
  expect(
    await f.repository.readNativeDraftSave({ ...input, revision: 4 }),
  ).toEqual(graph);
  expect(f.policy.admit).toHaveBeenNthCalledWith(
    1,
    tx,
    { ...input, batch: null },
    "read",
  );
  expect(f.policy.admit).toHaveBeenNthCalledWith(
    2,
    tx,
    { ...input, revision: 4, batch: null },
    "history",
  );
  expect(
    validateGraph(
      graph as unknown as import("@athyper/server-contract-meta-entity-authoring").MetaEntityGraph,
    ).issues[0]!.code,
  ).toBe("NATIVE_GRAPH_RELEASE_COMPILATION_NOT_QUALIFIED");
  f.save({
    ...graph,
    ai: {
      ...graph.ai,
      field: graph.ai.field.map((r) => ({
        ...r,
        entityFieldId: coreFixtureId(9999),
      })),
    },
  });
  await expect(
    f.repository.readNativeDraftSave({ ...input, revision: 4 }),
  ).rejects.toThrow("NATIVE_SNAPSHOT_REFERENCE_INVALID");
});
it("an expanded snapshot cannot use the old guard or an unadmitted host version", async () => {
  const f = repositoryFixture();
  f.disableGuard();
  await expect(
    f.repository.loadNativeGraph({ ...c, actorId: coreFixtureId(102) }),
  ).rejects.toMatchObject({ code: "ENTITY_NATIVE_SNAPSHOT_CUTOVER_REQUIRED" });
  const old = new KyselyMetaEntityAuthoringRepository(
    tx,
    undefined,
    undefined,
    undefined,
    { ...f.policy, snapshotVersions: [1] },
  );
  await expect(
    old.loadNativeGraph({ ...c, actorId: coreFixtureId(102) }),
  ).rejects.toMatchObject({ code: "NATIVE_AUTHORING_SOURCE_NOT_INITIALIZED" });
});

it("selects bigint export limits as text before JSON decoding", async () => {
  const op = {
    ...operation(),
    operationKind: "export" as const,
    exportFormats: ["csv"],
    exportMaxRecords: "9223372036854775807",
  };
  tables["metadata.entity_operation"] = [{ ...nativeOperationToStorage(op) }];
  expect(
    (await loadNativeSupplementalMembers(tx, c, 100)).operations[0]!
      .exportMaxRecords,
  ).toBe("9223372036854775807");
  expect(mock.execute.mock.calls[0]![0]).toContain("export_max_records::text");
});
