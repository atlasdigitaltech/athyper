import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import { nativeOperationToStorage } from "./native-operation-storage.js";
import { sha256 } from "./deterministic.js";
import {
  applyNativeBootstrap,
  type NativeBootstrapPolicy,
} from "./native-bootstrap-application.js";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

// Transaction protocol fixture. Real compiler/projection, simulated SQL transport;
// this is not PostgreSQL RLS, deployed authoring or live-read qualification.
function fixture() {
  const f = nativeReleaseFixture(),
    graph = f.graph;
  const input = {
    entityId: graph.authoringSource.entityId,
    changeSetId: graph.ownedLabels!.changeSetId,
    tenantId: null,
    actorId: "00000000-0000-4000-8000-000000000099",
    idempotencyKey: "native-bootstrap-test-001",
    proposalHash: sha256(graph),
  };
  let root = false,
    revision = 0;
  let receipt: Record<string, unknown> | null = null;
  const histories = new Map<number, { graph: unknown; graph_hash: string }>();
  const writes: string[] = [];
  let checkpoint:
    | {
        root: boolean;
        revision: number;
        receipt: Record<string, unknown> | null;
        histories: typeof histories;
        writes: string[];
      }
    | undefined;
  const query = vi.fn(async (text: string, values: unknown[]) => {
    text = text.trim();
    if (text.startsWith("SAVEPOINT"))
      checkpoint = {
        root,
        revision,
        receipt: structuredClone(receipt),
        histories: structuredClone(histories),
        writes: [...writes],
      };
    if (text.startsWith("ROLLBACK TO") && checkpoint) {
      root = checkpoint.root;
      revision = checkpoint.revision;
      receipt = checkpoint.receipt;
      histories.clear();
      for (const [k, v] of checkpoint.histories) histories.set(k, v);
      writes.splice(0, writes.length, ...checkpoint.writes);
    }
    if (
      text.includes(
        "SELECT id,field_key,parent_identity_id,identity_status,introduced_change_set_id",
      )
    )
      return {
        rows: f.c.core.identities
          .filter((i) => i.id === values[0])
          .map((i) => ({
            id: i.id,
            field_key: i.fieldKey,
            parent_identity_id: i.parentIdentityId,
            identity_status: "reserved",
            introduced_change_set_id: input.changeSetId,
          })),
      };
    if (text.startsWith("SELECT request_hash"))
      return { rows: receipt ? [receipt] : [] };
    if (text.startsWith("SELECT graph,graph_hash"))
      return { rows: histories.has(1) ? [histories.get(1)] : [] };
    if (text.startsWith("SELECT id FROM metadata.entity_change_set"))
      return { rows: root ? [{ id: input.changeSetId }] : [] };
    if (text.startsWith("INSERT INTO metadata.entity_change_set")) root = true;
    if (text.startsWith("INSERT INTO snapshot.entity_draft_save")) {
      histories.set(Number(values[1]), {
        graph: JSON.parse(String(values[3])),
        graph_hash: String(values[4]),
      });
    }
    if (text.includes("fn_advance_entity_change_set")) {
      revision++;
      return { rows: [{ revision: String(revision) }] };
    }
    if (text.startsWith("UPDATE metadata.entity_change_set"))
      return { rows: [{ id: input.changeSetId }] };
    if (text.includes("to_regprocedure"))
      return { rows: [{ available: true }] };
    if (text.startsWith("SELECT lock_version,authoring_schema_hash"))
      return {
        rows: [
          {
            lock_version: String(revision),
            authoring_schema_hash: graph.authoringSource.authoringSchemaHash,
            native_core_layout_version: 2,
          },
        ],
      };
    if (text.startsWith("SELECT to_jsonb(t)"))
      return {
        rows: f.controls.map(({ requiresMfa, ...o }) => ({
          value: { ...nativeOperationToStorage(o), requires_mfa: requiresMfa },
        })),
      };
    if (
      text.startsWith('insert into "metadata"') ||
      text.startsWith('INSERT INTO "metadata"')
    )
      writes.push(text);
    if (
      text.startsWith("INSERT INTO metadata.entity_authoring_command_receipt")
    )
      receipt = {
        actor_id: input.actorId,
        request_hash: values[3],
        revision: "1",
        identities: JSON.parse(String(values[4])),
      };
    return { rows: [] };
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  const tx = db as Transaction<Record<string, never>>;
  const policy: NativeBootstrapPolicy = {
    maximumBytes: 1000000,
    host: {
      commands: {
        authoringSchemaHash: graph.authoringSource.authoringSchemaHash,
        maxMembers: 1000,
        maxCommands: 100,
        maxBatchBytes: 1000000,
      },
      snapshotVersions: [2],
      admit: vi.fn(async () => {}),
      resolveContext: vi.fn(),
      resolveInitializer: vi.fn(),
    },
    qualify: vi.fn(async () => {}),
    prepare: vi.fn<NativeBootstrapPolicy["prepare"]>(async () => ({
      graph,
      title: "Synthetic",
      branchCode: "bootstrap",
      baseReleaseId: null,
      operations: {
        prepare: async () => ({
          table: "entity_operation",
          insert: f.controls.map(({ requiresMfa, ...operation }) => ({
            id: operation.id,
            values: {
              ...nativeOperationToStorage(operation),
              requires_mfa: requiresMfa,
            },
          })),
          update: [],
          remove: [],
        }),
      },
      compiler: { ...f.c, graphHash: sha256(graph) },
      reader: {
        registration: {
          entityCode: graph.entity.entityCode,
          plane: "studio",
          storage: {
            schema: "shared",
            object: "synthetic_reference",
            idField: "id",
          },
          columns: ["id", "code", "name"],
        },
        storagePlane: "studio",
        permissions: [],
      },
    })),
    audit: vi.fn(async () => {}),
  };
  const readers = {
    empty: vi.fn(
      async () =>
        ({
          contractSchema: "athyper.meta-entity-contract/2.3",
          entity: graph.entity,
          fields: [],
          operations: [],
          runtimeProfiles: [],
          surfaces: [],
          surfaceSections: [],
          surfaceFieldBindings: [],
        }) as MetaEntityGraph,
    ),
    native: vi.fn(async () => structuredClone(graph)),
  };
  const run = () => applyNativeBootstrap(tx, input, policy, readers);
  return {
    input,
    graph,
    policy,
    readers,
    tx,
    query,
    histories,
    writes,
    run,
    root: () => root,
  };
}
it("creates immutable empty/saved history and compiles exact native readback; replay reauthorizes without writes", async () => {
  const f = fixture();
  const result = await f.run();
  expect(result).toMatchObject({
    revision: 1,
    replay: false,
    graphHash: f.input.proposalHash,
  });
  expect([...f.histories.keys()]).toEqual([0, 1]);
  expect(f.writes.length).toBeGreaterThan(0);
  const writes = f.writes.length;
  expect(await f.run()).toEqual({ ...result, replay: true });
  expect(f.writes).toHaveLength(writes);
  expect(f.policy.qualify).toHaveBeenCalledTimes(2);
  expect(f.policy.prepare).toHaveBeenCalledTimes(1);
});
it("rejects changed proposal and corrupted replay history", async () => {
  const f = fixture();
  f.input.proposalHash = "0".repeat(64);
  await expect(f.run()).rejects.toMatchObject({
    code: "NATIVE_BOOTSTRAP_PROPOSAL_MISMATCH",
  });
  expect(f.root()).toBe(false);
  const replay = fixture();
  await replay.run();
  replay.histories.get(1)!.graph_hash = "0".repeat(64);
  await expect(replay.run()).rejects.toMatchObject({
    code: "NATIVE_BOOTSTRAP_REPLAY_HISTORY_INVALID",
  });
});
it("repository rolls back the new root and all writes when readback fails, even if its caller catches", async () => {
  const f = fixture();
  const repository = new KyselyMetaEntityAuthoringRepository(
    f.tx,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    f.policy,
  );

  const proto = KyselyMetaEntityAuthoringRepository.prototype as unknown as {
    loadGraphParts: typeof f.readers.empty;
    nativeSnapshot: typeof f.readers.native;
  };
  const empty = vi
    .spyOn(proto, "loadGraphParts")
    .mockImplementation(f.readers.empty);
  const native = vi
    .spyOn(proto, "nativeSnapshot")
    .mockImplementation(async () => {
      throw Error("READBACK_FAILED");
    });
  try {
    await expect(repository.executeNativeBootstrap(f.input)).rejects.toThrow(
      "READBACK_FAILED",
    );
    expect(f.root()).toBe(false);
    expect(f.histories.size).toBe(0);
    expect(f.writes).toHaveLength(0);
    expect(f.policy.audit).not.toHaveBeenCalled();
  } finally {
    empty.mockRestore();
    native.mockRestore();
  }
});
it("rejects uninstalled bootstrap host before touching the database", async () => {
  const f = fixture();
  await expect(
    new KyselyMetaEntityAuthoringRepository(f.tx).executeNativeBootstrap(
      f.input,
    ),
  ).rejects.toMatchObject({ code: "NATIVE_BOOTSTRAP_HOST_NOT_CONFIGURED" });
  expect(f.query).not.toHaveBeenCalled();
});
it("rejects revoked admission before root creation or replay lookup", async () => {
  const f = fixture();
  vi.mocked(f.policy.host.admit).mockRejectedValue(Error("REVOKED"));
  await expect(f.run()).rejects.toThrow("REVOKED");
  expect(f.query).not.toHaveBeenCalled();
});
it("rejects changed command identity on replay instead of returning another proposal's success", async () => {
  const f = fixture();
  await f.run();
  f.input.proposalHash = "a".repeat(64);
  await expect(f.run()).rejects.toMatchObject({
    code: "AUTHORING_IDEMPOTENCY_CONFLICT",
  });
});
it.each(["audit", "reader"])(
  "rolls back complete graph/history if %s qualification fails",
  async (stage) => {
    const f = fixture();
    if (stage === "audit")
      vi.mocked(f.policy.audit).mockRejectedValue(Error("AUDIT_FAILED"));
    else {
      const prepare = f.policy.prepare;
      f.policy.prepare = async (...args) => {
        const p = await prepare(...args);
        p.reader.registration = {
          ...p.reader.registration,
          storage: { ...p.reader.registration.storage, idField: "other" },
        };
        return p;
      };
    }
    const repository = new KyselyMetaEntityAuthoringRepository(
      f.tx,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      f.policy,
    );
    const proto = KyselyMetaEntityAuthoringRepository.prototype as unknown as {
      loadGraphParts: typeof f.readers.empty;
      nativeSnapshot: typeof f.readers.native;
    };
    const empty = vi
      .spyOn(proto, "loadGraphParts")
      .mockImplementation(f.readers.empty);
    const native = vi
      .spyOn(proto, "nativeSnapshot")
      .mockImplementation(f.readers.native);
    try {
      await expect(
        repository.executeNativeBootstrap(f.input),
      ).rejects.toThrow();
      expect(f.root()).toBe(false);
      expect(f.histories.size).toBe(0);
      expect(f.writes).toHaveLength(0);
    } finally {
      empty.mockRestore();
      native.mockRestore();
    }
  },
);
