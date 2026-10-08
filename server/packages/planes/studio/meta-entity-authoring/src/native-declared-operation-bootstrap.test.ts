import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import {
  createDeclaredOperationBootstrap,
  type DeclaredOperationInitialization,
} from "./native-declared-operation-bootstrap.js";
import { sha256 } from "./deterministic.js";
function setup() {
  const graph = nativeReleaseFixture().graph;
  const input = {
    entityId: graph.authoringSource.entityId,
    changeSetId: graph.ownedLabels!.changeSetId,
    tenantId: null,
    actorId: "00000000-0000-4000-8000-000000000099",
  };
  const declaration: DeclaredOperationInitialization = {
    schema: "entity.local-operation-initialization/1",
    targets: [
      {
        entityId: input.entityId,
        changeSetId: input.changeSetId,
        operations: graph.operations.map((o) => ({
          id: o.id,
          operationKey: o.operationKey,
          operationHash: sha256(o),
          requiresMfa: false,
        })),
      },
    ],
  };
  const query = vi.fn(async () => ({ rows: [{ id: input.changeSetId }] }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const tx = db as Transaction<Record<string, never>>;
  Object.defineProperty(tx, "isTransaction", { value: true });
  const options = {
    profile: "owner-approved-local-native" as const,
    approvedDeclarationHash: sha256(declaration),
    declaration,
  };
  return { graph, input, declaration, query, tx, options };
}
it("prepares only the exact declared false values without old source readers or updates", async () => {
  const f = setup();
  const plan = await createDeclaredOperationBootstrap(f.options).prepare(
    f.tx,
    f.input,
    f.graph.operations,
    [],
  );
  expect(plan.insert).toHaveLength(f.graph.operations.length);
  expect(plan.insert.every((r) => r.values.requires_mfa === false)).toBe(true);
  expect(plan.update).toEqual([]);
  expect(plan.remove).toEqual([]);
  const calls = JSON.stringify(f.query.mock.calls);
  expect(calls).toContain("admitted_creation");
  expect(calls).toContain("FOR UPDATE");
  expect(calls).not.toContain("read_operation_bootstrap_source");
});
it("rejects changed member semantics even with the same operation key", async () => {
  const f = setup();
  await expect(
    createDeclaredOperationBootstrap(f.options).prepare(
      f.tx,
      f.input,
      f.graph.operations.map((o) => ({ ...o, handlerKey: "changed" })),
      [],
    ),
  ).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it("does not treat a missing or true value as an approved false default", () => {
  const f = setup();
  for (const value of [true, undefined]) {
    const declaration = structuredClone(f.declaration) as any;
    declaration.targets[0].operations[0].requiresMfa = value;
    expect(() =>
      createDeclaredOperationBootstrap({
        ...f.options,
        declaration,
        approvedDeclarationHash: sha256(declaration),
      }),
    ).toThrow();
  }
});
it("rejects wrong hash, duplicate targets, unapproved profile and extra declaration fields", () => {
  const f = setup();
  expect(() =>
    createDeclaredOperationBootstrap({
      ...f.options,
      approvedDeclarationHash: "a".repeat(64),
    }),
  ).toThrow();
  expect(() =>
    createDeclaredOperationBootstrap({ ...f.options, profile: "qa" as never }),
  ).toThrow();
  const declaration = {
    ...f.declaration,
    targets: [...f.declaration.targets, ...f.declaration.targets],
  };
  expect(() =>
    createDeclaredOperationBootstrap({
      ...f.options,
      declaration,
      approvedDeclarationHash: sha256(declaration),
    }),
  ).toThrow();
  const extra = { ...f.declaration, authority: true };
  expect(() =>
    createDeclaredOperationBootstrap({
      ...f.options,
      declaration: extra,
      approvedDeclarationHash: sha256(extra),
    }),
  ).toThrow();
});
it("rejects absent database admission, other targets, tenant scope and populated targets", async () => {
  const f = setup();
  const policy = createDeclaredOperationBootstrap(f.options);
  for (const input of [
    { ...f.input, tenantId: f.input.entityId },
    { ...f.input, changeSetId: f.input.actorId },
  ])
    await expect(
      policy.prepare(f.tx, input, f.graph.operations, []),
    ).rejects.toThrow();
  await expect(
    policy.prepare(f.tx, f.input, f.graph.operations, [
      { id: f.graph.operations[0]!.id },
    ]),
  ).rejects.toThrow();
  f.query.mockResolvedValue({ rows: [] });
  await expect(
    policy.prepare(f.tx, f.input, f.graph.operations, []),
  ).rejects.toThrow();
});
it("captures the approved declaration rather than following later caller mutation", async () => {
  const f = setup();
  const policy = createDeclaredOperationBootstrap(f.options);
  (f.declaration.targets[0]!.operations[0] as any).requiresMfa = true;
  const plan = await policy.prepare(f.tx, f.input, f.graph.operations, []);
  expect(plan.insert.every((r) => r.values.requires_mfa === false)).toBe(true);
});
