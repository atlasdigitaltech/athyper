import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import { buildNativeSuccessorGraph } from "./native-successor-graph.js";
import { resolveNativeSuccessorSource } from "./native-successor-source.js";
import { nativeOperationToStorage } from "./native-operation-storage.js";
import { sha256 } from "./deterministic.js";
function fixture() {
  const f = nativeReleaseFixture(),
    prior = randomUUID(),
    entity = f.graph.authoringSource.entityId,
    actor = randomUUID();
  function rebase(v: unknown): void {
    if (Array.isArray(v)) v.forEach(rebase);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if ((k === "changeSetId" || k.endsWith("ChangeSetId")) && x === entity)
          Reflect.set(v, k, prior);
        else rebase(x);
      }
  }
  rebase(f.graph);
  const source = {
    ...f.graph,
    fieldIdentities: f.c.core.identities.map((i) => ({
      ...i,
      identityStatus: "reserved" as const,
      introducedChangeSetId: prior,
      createdBy: actor,
      createdAt: "2026-10-09T00:00:00.000Z",
      firstReleaseId: null,
      retiredAt: null,
      retiredBy: null,
      retirementReleaseId: null,
      replacementIdentityId: null,
    })),
  };
  const baseReleaseId = randomUUID(),
    changeSetId = randomUUID();
  const successor = buildNativeSuccessorGraph({
    source,
    sourceHash: sha256(source),
    sourceReleaseId: baseReleaseId,
    sourceRevision: 4,
    changeSetId,
    authorId: actor,
    maximumMembers: 10000,
  });
  const row = {
    source_change_set_id: prior,
    source_revision: 4,
    graph: source,
    graph_hash: sha256(source),
    operation_rows: source.operations.map((o) => ({
      ...nativeOperationToStorage(o),
      requires_mfa: f.controls.find((c) => c.operationKey === o.operationKey)!
        .requiresMfa,
    })),
    identity_rows: source.fieldIdentities.map((i) => ({
      id: i.id,
      entity_id: entity,
      tenant_id: null,
      identity_status: i.identityStatus,
      native_available: true,
    })),
  };
  const query = vi.fn(async (_sql: string, _values: unknown[]) => ({
    rows: [row],
    rowCount: 1,
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  const tx = db as Transaction<Record<string, never>>,
    input = {
      entityId: entity,
      changeSetId,
      actorId: actor,
      tenantId: null,
      proposalHash: sha256(successor.graph),
      idempotencyKey: "successor-source-test",
    };
  return {
    f,
    row,
    input,
    tx,
    query,
    graph: successor.graph,
    run: () =>
      resolveNativeSuccessorSource(
        tx,
        input,
        baseReleaseId,
        successor.graph,
        4194304,
      ),
  };
}
it("preserves exact stored controls and returns release-bound identity correspondence", async () => {
  const f = fixture(),
    r = await f.run();
  const plan = await r.operations.prepare(
    f.tx,
    f.input,
    f.graph.operations,
    [],
  );
  expect(plan.insert.map((i) => i.values.requires_mfa)).toEqual(
    f.f.controls.map((c) => c.requiresMfa),
  );
  expect(plan.update).toEqual([]);
  expect(r.identitySources).toHaveLength(3);
  expect(f.query.mock.calls[0]![0]).toContain("read_native_successor_source");
  await expect(
    r.operations.prepare(
      f.tx,
      { ...f.input, changeSetId: randomUUID() },
      f.graph.operations,
      [],
    ),
  ).rejects.toThrow();
});
it.each(["hash", "control", "new-operation", "unavailable-identity"])(
  "rejects unavailable or changed predecessor evidence: %s",
  async (kind) => {
    const f = fixture();
    if (kind === "hash") f.row.graph_hash = "0".repeat(64);
    if (kind === "control")
      Reflect.set(f.row.operation_rows[0]!, "requires_mfa", null);
    if (kind === "new-operation") {
      Reflect.set(f.graph.operations[0]!, "operationKey", "other");
      f.input.proposalHash = sha256(f.graph);
    }
    if (kind === "unavailable-identity")
      f.row.identity_rows[0]!.native_available = false;
    await expect(f.run()).rejects.toThrow();
  },
);
it("rejects changed operation metadata and request-supplied protected values", async () => {
  for (const property of ["handlerKey", "requiresMfa"]) {
    const f = fixture();
    Reflect.set(
      f.graph.operations[0]!,
      property,
      property === "requiresMfa" ? false : "unapproved",
    );
    f.input.proposalHash = sha256(f.graph);
    await expect(f.run()).rejects.toThrow();
  }
});
