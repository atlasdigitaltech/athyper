import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import type { NativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  layoutFixture,
  layoutFixtureContext,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
const mock = vi.hoisted(() => ({
  execute: vi.fn(),
  load: vi.fn(),
  prepare: vi.fn(),
  write: vi.fn(),
}));
vi.mock("kysely", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    execute: () => mock.execute(strings.join("?"), values),
  }),
}));
vi.mock("./normalized-core-layout-storage.js", () => ({
  loadNormalizedCoreLayout: mock.load,
  prepareNormalizedCoreLayoutSave: mock.prepare,
}));
vi.mock("./scoped-graph-writer.js", () => ({
  writeReconciliationPlans: mock.write,
}));
import {
  saveNativeCoreLayoutCommands,
  type NativeAuthoringPolicy,
} from "./native-core-layout-persistence.js";
import { sha256 } from "./deterministic.js";
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
const input = () => ({
  changeSetId: coreFixtureId(100),
  entityId: coreFixtureId(100),
  tenantId: null,
  actorId: coreFixtureId(101),
  batch: {
    contract: "entity.authoring-native-core-layout-commands/1",
    expectedRevision: 4,
    idempotencyKey: "native-persistence-test-0001",
    commands: [
      {
        kind: "updateMember",
        memberKind: "field",
        id: coreFixtureId(2),
        set: { description: "Updated" },
        clear: [],
      },
    ],
  },
});
const state = () => ({
  core: layoutFixtureContext().core,
  layout: layoutFixture(),
});
let current = state(),
  root: Record<string, unknown>,
  receipt: Record<string, unknown> | undefined;
let snapshots: Map<
  number,
  { graph: NativeMetaEntityGraph; graph_hash: string }
>;
let installed: boolean;
const graph = (): NativeMetaEntityGraph =>
  ({
    contractSchema: "athyper.meta-entity-contract/2.4",
    fields: current.core.field,
    runtimeProfiles: current.core.runtime,
    surfaces: current.core.surface,
    surfaceSections: current.layout.section,
    surfaceFieldBindings: current.layout.binding,
    authoringSource: {
      entityId: input().entityId,
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "b".repeat(64),
    },
    // Remaining branches are opaque to this isolated save-protocol test, not a full graph fixture.
  }) as NativeMetaEntityGraph;
const policy = (): NativeAuthoringPolicy => ({
  commands: {
    maxBatchBytes: 100_000,
    maxCommands: 30,
    maxMembers: 100,
    authoringSchemaHash: "b".repeat(64),
  },
  admit: vi.fn(async () => {}),
  resolveContext: vi.fn(async () => layoutFixtureContext()),
  resolveInitializer: vi.fn(async () => () => ({})),
});
beforeEach(() => {
  vi.clearAllMocks();
  current = state();
  receipt = undefined;
  snapshots = new Map();
  installed = true;
  root = {
    native_core_layout_version: 1,
    authoring_schema_hash: "b".repeat(64),
    source_kind: "product",
    reference_contract_version: 1,
    default_locale: "en",
    lock_version: 4,
    status: "draft",
  };
  mock.load.mockImplementation(async () => structuredClone(current));
  mock.prepare.mockImplementation(async (_tx, _coordinate, next) => [
    {
      table: "entity_field",
      insert: [],
      remove: [],
      update: [{ id: coreFixtureId(2), values: { description: "Updated" } }],
      next,
    },
  ]);
  mock.write.mockImplementation(async (_tx, plans) => {
    current = { core: plans[0].next.core, layout: plans[0].next.layout };
  });
  mock.execute.mockImplementation(async (text: string, values: unknown[]) => {
    if (text.includes("to_jsonb(cs)")) return { rows: [{ source: root }] };
    if (text.includes("to_regprocedure"))
      return { rows: [{ available: installed }] };
    if (text.includes("SELECT metadata.fn_assert_native_authoring_contract"))
      return { rows: [] };
    if (text.includes("SELECT request_hash"))
      return { rows: receipt ? [receipt] : [] };
    if (text.includes("fn_advance_entity_change_set")) {
      root.lock_version = 5;
      return { rows: [{ revision: "5" }] };
    }
    if (text.includes("INSERT INTO snapshot")) {
      const revision = Number(values[1]);
      if (!snapshots.has(revision))
        snapshots.set(revision, {
          graph: JSON.parse(String(values[3])),
          graph_hash: String(values[4]),
        });
      return { rows: [] };
    }
    if (text.includes("SELECT graph,graph_hash"))
      return {
        rows: snapshots.has(Number(values[1]))
          ? [snapshots.get(Number(values[1]))]
          : [],
      };
    if (
      text.includes("INSERT INTO metadata.entity_authoring_command_receipt")
    ) {
      receipt = {
        actor_id: values[2],
        request_hash: values[4],
        revision: values[6],
        changed: values[7],
        identities: JSON.parse(String(values[8])),
      };
      return { rows: [] };
    }
    throw new Error(`Unexpected protocol SQL: ${text}`);
  });
});
describe("native save protocol (mocked SQL; not database qualification)", () => {
  it("captures previous and saved complete callback graphs, then replays without another revision", async () => {
    const p = policy();
    const snapshot = vi.fn(async () => graph());
    const result = await saveNativeCoreLayoutCommands(tx, input(), p, snapshot);
    expect(result).toMatchObject({ revision: 5, changed: true });
    expect(
      snapshots.get(4)!.graph.fields.find((f) => f.id === coreFixtureId(2))!
        .description,
    ).not.toBe("Updated");
    expect(
      snapshots.get(5)!.graph.fields.find((f) => f.id === coreFixtureId(2))!
        .description,
    ).toBe("Updated");
    expect(sha256(snapshots.get(5)!.graph)).toBe(snapshots.get(5)!.graph_hash);
    root.status = "published";
    expect(
      await saveNativeCoreLayoutCommands(tx, input(), p, snapshot),
    ).toEqual(result);
    expect(p.admit).toHaveBeenCalledTimes(2);
    expect(mock.write).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });
  it("rejects stale, mismatched source and missing schema evidence before writes", async () => {
    for (const [change, code] of [
      [{ lock_version: 8 }, "AUTHORING_REVISION_CONFLICT"],
      [
        { authoring_schema_hash: "c".repeat(64) },
        "NATIVE_AUTHORING_SOURCE_NOT_INITIALIZED",
      ],
      [
        { source_kind: "tenant_entity" },
        "NATIVE_AUTHORING_SOURCE_KIND_UNSUPPORTED",
      ],
      [
        { reference_contract_version: null },
        "NATIVE_AUTHORING_DEPENDENCIES_NOT_CONVERTED",
      ],
    ] as const) {
      const saved = { ...root };
      Object.assign(root, change);
      await expect(
        saveNativeCoreLayoutCommands(tx, input(), policy(), async () =>
          graph(),
        ),
      ).rejects.toMatchObject({ code });
      root = saved;
    }
    installed = false;
    await expect(
      saveNativeCoreLayoutCommands(tx, input(), policy(), async () => graph()),
    ).rejects.toMatchObject({ code: "ENTITY_NATIVE_SCHEMA_CUTOVER_REQUIRED" });
    expect(mock.write).not.toHaveBeenCalled();
    expect(snapshots.size).toBe(0);
  });
  it("rechecks authority on replay and rejects reused identities with different payloads", async () => {
    const p = policy();
    await saveNativeCoreLayoutCommands(tx, input(), p, async () => graph());
    vi.mocked(p.admit).mockRejectedValueOnce(new Error("revoked"));
    await expect(
      saveNativeCoreLayoutCommands(tx, input(), p, async () => graph()),
    ).rejects.toThrow("revoked");
    const changed = input();
    changed.batch.commands[0]!.set.description = "different";
    await expect(
      saveNativeCoreLayoutCommands(tx, changed, p, async () => graph()),
    ).rejects.toMatchObject({ code: "AUTHORING_IDEMPOTENCY_CONFLICT" });
    expect(mock.write).toHaveBeenCalledTimes(1);
  });
  it("does not ask for a new initializer while preserving existing members", async () => {
    const p = policy();
    vi.mocked(p.resolveInitializer).mockRejectedValue(
      new Error("unapproved initializer"),
    );
    await saveNativeCoreLayoutCommands(tx, input(), p, async () => graph());
    expect(p.resolveInitializer).not.toHaveBeenCalled();
  });
  it("rejects a mismatched independently resolved entity context before planning", async () => {
    const p = policy();
    vi.mocked(p.resolveContext).mockResolvedValue({
      ...layoutFixtureContext(),
      coreContext: {
        ...layoutFixtureContext().coreContext,
        entityId: coreFixtureId(999),
      },
    });
    await expect(
      saveNativeCoreLayoutCommands(tx, input(), p, async () => graph()),
    ).rejects.toMatchObject({ code: "NORMALIZED_SAVE_CONTEXT_MISMATCH" });
    expect(mock.prepare).not.toHaveBeenCalled();
    expect(mock.write).not.toHaveBeenCalled();
  });
  it("records a no-op receipt without advancing or snapshotting", async () => {
    mock.prepare.mockResolvedValue([
      { table: "entity_field", insert: [], update: [], remove: [] },
    ]);
    const result = await saveNativeCoreLayoutCommands(
      tx,
      input(),
      policy(),
      async () => graph(),
    );
    expect(result).toMatchObject({ revision: 4, changed: false });
    expect(root.lock_version).toBe(4);
    expect(mock.write).not.toHaveBeenCalled();
    expect(snapshots.size).toBe(0);
  });
  it("rejects immutable history collisions before member writes", async () => {
    const old = graph();
    snapshots.set(4, { graph: old, graph_hash: "c".repeat(64) });
    await expect(
      saveNativeCoreLayoutCommands(tx, input(), policy(), async () => graph()),
    ).rejects.toMatchObject({ code: "AUTHORING_REVISION_CONFLICT" });
    expect(mock.write).not.toHaveBeenCalled();
    expect(receipt).toBeUndefined();
  });
  it("does not issue a success receipt when the scoped writer fails", async () => {
    mock.write.mockRejectedValueOnce(new Error("writer failure"));
    await expect(
      saveNativeCoreLayoutCommands(tx, input(), policy(), async () => graph()),
    ).rejects.toThrow("writer failure");
    expect(receipt).toBeUndefined(); // Repository savepoint is responsible for SQL rollback, not this mock.
  });
});
