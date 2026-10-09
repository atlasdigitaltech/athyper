import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import {
  establishNativeBootstrapIdentities,
  plannedNativeBootstrapIdentities,
  persistFreshNativeBootstrapIdentities,
  resolveNativeBootstrapIdentities,
} from "./native-bootstrap-identities.js";
import { sha256 } from "./deterministic.js";
function fixture() {
  const f = nativeReleaseFixture();
  const source = "00000000-0000-4000-8000-000000000999";
  const sources = f.graph.fields.map((field) => ({
    identityId: field.fieldIdentityId,
    targetFieldId: field.id,
    sourceChangeSetId: source,
    sourceFieldId: "00000000-0000-4000-8000-" + field.id.slice(-12),
    sourceRevision: 4,
    sourceHash: "b".repeat(64),
  }));
  const installed = f.c.core.identities.map((i) => ({
    id: i.id,
    entity_id: i.entityId,
    tenant_id: i.tenantId,
    field_key: i.fieldKey,
    parent_identity_id: i.parentIdentityId,
    identity_status: "reserved",
    introduced_change_set_id: source,
  }));
  const query = vi.fn(async (text: string, values: unknown[]) => ({
    rows: text.includes("SELECT id,entity_id")
      ? installed
      : text.includes("SELECT id,field_key")
        ? installed.filter((i) => i.id === values[0])
        : [],
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
  const input = {
    entityId: f.graph.authoringSource.entityId,
    changeSetId: f.graph.ownedLabels!.changeSetId,
    tenantId: null,
    actorId: "00000000-0000-4000-8000-000000000099",
    idempotencyKey: "bootstrap-identity-proof",
    proposalHash: sha256(f.graph),
  };
  return {
    f,
    sources,
    installed,
    query,
    input,
    resolve: () =>
      resolveNativeBootstrapIdentities(
        db as Transaction<Record<string, never>>,
        input,
        f.graph,
      ),
    run: (s = sources) =>
      establishNativeBootstrapIdentities(
        db as Transaction<Record<string, never>>,
        input,
        f.graph,
        f.c.core,
        s,
      ),
  };
}
it("adopts exact installed identities through the private command without updating reservations", async () => {
  const f = fixture();
  await f.run();
  const writes = f.query.mock.calls.filter(([text]) =>
    text.includes("adopt_native_identity"),
  );
  expect(writes).toHaveLength(3);
  expect(writes[0]![1]).toEqual([
    f.input.changeSetId,
    f.sources[0]!.identityId,
    f.sources[0]!.targetFieldId,
    f.sources[0]!.sourceChangeSetId,
    f.sources[0]!.sourceFieldId,
    4,
    "b".repeat(64),
    f.input.proposalHash,
  ]);
  expect(
    f.query.mock.calls.some(([text]) => /UPDATE|INSERT|DELETE/.test(text)),
  ).toBe(false);
});
it("accepts installed active or same-draft reservations without adopting", async () => {
  const f = fixture();
  f.installed.forEach((i, n) => {
    if (n === 0) i.identity_status = "active";
    else i.introduced_change_set_id = f.input.changeSetId;
  });
  await f.run([]);
  expect(
    f.query.mock.calls.filter(([text]) =>
      text.includes("adopt_native_identity"),
    ),
  ).toHaveLength(0);
});
it("blocks missing, retired, wrong-key and wrong-parent identities", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => f.installed.splice(0, 1),
    (f: ReturnType<typeof fixture>) =>
      (f.installed[0]!.identity_status = "retired"),
    (f: ReturnType<typeof fixture>) => (f.installed[0]!.field_key = "other"),
    (f: ReturnType<typeof fixture>) =>
      (f.installed[0]!.parent_identity_id = f.input.entityId),
  ]) {
    const f = fixture();
    change(f);
    await expect(f.run()).rejects.toMatchObject({
      code: "NATIVE_IDENTITY_INSTALLED_SOURCE_REQUIRED",
    });
  }
});
it("rejects missing, duplicate, foreign target and stale-introduction plans", async () => {
  const f = fixture();
  await expect(f.run([])).rejects.toMatchObject({
    code: "NATIVE_IDENTITY_ADOPTION_REQUIRED",
  });
  await expect(f.run([...f.sources, f.sources[0]!])).rejects.toMatchObject({
    code: "NATIVE_IDENTITY_ADOPTION_INVALID",
  });
  for (const key of ["targetFieldId", "sourceChangeSetId"] as const) {
    const f = fixture();
    f.sources[0]![key] = f.input.actorId;
    await expect(f.run()).rejects.toMatchObject({
      code: "NATIVE_IDENTITY_ADOPTION_REQUIRED",
    });
  }
});
it("propagates database source proof failure; does not claim installation", async () => {
  const f = fixture();
  f.query.mockImplementation(async (text, values) => {
    if (text.includes("adopt_native_identity"))
      throw Error("IDENTITY_ADOPTION_SNAPSHOT_INVALID");
    return { rows: f.installed.filter((i) => i.id === values[0]), rowCount: 1 };
  });
  await expect(f.run()).rejects.toThrow("IDENTITY_ADOPTION_SNAPSHOT_INVALID");
});

it("resolves compiler identities from installed rows and exact creation scope", async () => {
  const f = fixture();
  expect(await f.resolve()).toEqual(f.f.c.core.identities);
  const [query, values] = f.query.mock.calls[0]!;
  expect(query).toContain("entity_command_private.admitted_creation");
  expect(values).toContain(f.input.actorId);
  expect(values).toContain(f.input.entityId);
  expect(values).toContain(f.input.changeSetId);
});
it("rejects missing, duplicate, foreign and retired installed compiler bindings", async () => {
  for (const corrupt of [
    (f: ReturnType<typeof fixture>) => f.installed.pop(),
    (f: ReturnType<typeof fixture>) => (f.installed[0] = f.installed[1]!),
    (f: ReturnType<typeof fixture>) =>
      (f.installed[0]!.entity_id = f.input.actorId),
    (f: ReturnType<typeof fixture>) =>
      (f.installed[0]!.identity_status = "retired"),
  ]) {
    const f = fixture();
    corrupt(f);
    await expect(f.resolve()).rejects.toMatchObject({
      code: "NATIVE_IDENTITY_BINDING_UNAVAILABLE",
    });
  }
});
it("rejects changed proposal before reading installed identities", async () => {
  const f = fixture();
  f.input.proposalHash = "f".repeat(64);
  await expect(f.resolve()).rejects.toMatchObject({
    code: "NATIVE_IDENTITY_BINDING_UNAVAILABLE",
  });
  expect(f.query).not.toHaveBeenCalled();
});

function freshFixture() {
  const f = fixture();
  const identities = f.f.c.core.identities.map((i) => ({
    ...i,
    identityStatus: "reserved" as const,
    introducedChangeSetId: f.input.changeSetId,
    createdBy: f.input.actorId,
    createdAt: "2026-10-09T00:00:00.000Z",
    firstReleaseId: null,
    retiredAt: null,
    retiredBy: null,
    retirementReleaseId: null,
    replacementIdentityId: null,
  }));
  const graph = { ...f.f.graph, fieldIdentities: identities };
  const input = { ...f.input, proposalHash: sha256(graph) };
  return { ...f, graph, input, identities };
}
it("derives fresh bindings only from a complete attributed proposal", () => {
  const f = freshFixture();
  expect(plannedNativeBootstrapIdentities(f.input, f.graph)).toEqual(
    f.f.c.core.identities,
  );
  for (const corrupt of [
    () => {
      f.identities[0]!.createdBy = f.input.entityId;
    },
    () => {
      f.identities[0]!.introducedChangeSetId = f.input.entityId;
    },
    () => {
      f.identities.pop();
    },
  ]) {
    corrupt();
    f.input.proposalHash = sha256(f.graph);
    expect(() => plannedNativeBootstrapIdentities(f.input, f.graph)).toThrow();
  }
});
it("rejects fresh identity cycles and foreign parents", () => {
  for (const parent of ["foreign", "self", "cycle"]) {
    const f = freshFixture();
    f.identities[0]!.parentIdentityId =
      parent === "foreign"
        ? f.input.actorId
        : parent === "self"
          ? f.identities[0]!.id
          : f.identities[1]!.id;
    if (parent === "cycle")
      f.identities[1]!.parentIdentityId = f.identities[0]!.id;
    f.input.proposalHash = sha256(f.graph);
    expect(() => plannedNativeBootstrapIdentities(f.input, f.graph)).toThrow();
  }
});
it("persists parents before children under exact creation admission without upsert", async () => {
  const f = freshFixture();
  f.identities[0]!.parentIdentityId = f.identities[1]!.id;
  f.input.proposalHash = sha256(f.graph);
  f.query.mockImplementation(async () => ({
    rows: [{ id: "inserted" }] as never,
    rowCount: 1,
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query: f.query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  await persistFreshNativeBootstrapIdentities(
    db as Transaction<Record<string, never>>,
    f.input,
    f.graph,
    plannedNativeBootstrapIdentities(f.input, f.graph),
  );
  expect(f.query.mock.calls[0]![1][0]).toBe(f.identities[1]!.id);
  expect(f.query.mock.calls).toHaveLength(3);
  for (const [text, values] of f.query.mock.calls) {
    expect(text).toContain("admitted_creation");
    expect(text).toContain("app.current_principal_id");
    expect(text).not.toContain("ON CONFLICT");
    expect(values).toContain(f.input.actorId);
  }
  f.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
  await expect(
    persistFreshNativeBootstrapIdentities(
      db as Transaction<Record<string, never>>,
      f.input,
      f.graph,
      plannedNativeBootstrapIdentities(f.input, f.graph),
    ),
  ).rejects.toMatchObject({ code: "NATIVE_FRESH_IDENTITY_ADMISSION_REQUIRED" });
});

it("routes release-bound reserved identities through native inheritance without legacy adoption", async () => {
  const f = fixture();
  const release = "00000000-0000-4000-8000-000000000888";
  const sources = f.sources.map((s) => ({ ...s, sourceReleaseId: release }));
  await f.run(sources);
  const writes = f.query.mock.calls.filter(([text]) =>
    text.includes("inherit_native_identity"),
  );
  expect(writes).toHaveLength(3);
  expect(writes[0]![1]).toContain(release);
  expect(
    f.query.mock.calls.some(([text]) => text.includes("adopt_native_identity")),
  ).toBe(false);
  await expect(
    f.run(sources.map((s) => ({ ...s, sourceReleaseId: "invalid" }))),
  ).rejects.toThrow();
});
