import { expect, it } from "vitest";
import {
  PostgresQueryCompiler,
  type Kysely,
  type RootOperationNode,
} from "kysely";
import { parseEntityRegistration } from "../entity-registration.js";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";
const registration = {
  schemaVersion: 1 as const,
  moduleCode: "fnd",
  entityClass: "configuration" as const,
  ownershipModel: "overlay" as const,
};
const input = {
  tenantId: "44444444-4444-4444-8444-444444444444",
  entityId: "11111111-1111-4111-8111-111111111111",
  entityCode: "business_partner",
  branchCode: "reset",
  title: "Reset draft",
  actorId: "22222222-2222-4222-8222-222222222222",
  registration,
};
function setup(
  options: { module?: boolean; identity?: boolean; draftFails?: boolean } = {},
) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  let committed = false,
    rolledBack = false;
  const executor = {
    transformQuery: (q: RootOperationNode) => q,
    compileQuery: (q: RootOperationNode) =>
      new PostgresQueryCompiler().compileQuery(q),
    async executeQuery(q: { sql: string; parameters: readonly unknown[] }) {
      queries.push(q);
      if (q.sql.includes("INSERT INTO metadata.entity_change_set")) {
        if (options.draftFails) throw Error("draft failure");
        return {
          rows: [
            {
              id: "draft-id",
              tenant_id: input.tenantId,
              entity_id: input.entityId,
              entity_code: input.entityCode,
              branch_code: input.branchCode,
              status: "draft",
              lock_version: 0,
              created_by: input.actorId,
            },
          ],
        };
      }
      if (q.sql.includes("INSERT INTO metadata.entity("))
        return {
          rows: options.module === false ? [] : [{ id: input.entityId }],
        };
      if (q.sql.includes("SELECT id FROM metadata.entity"))
        return {
          rows: options.identity === false ? [] : [{ id: input.entityId }],
        };
      return { rows: [] };
    },
  };
  const tx = { getExecutor: () => executor };
  const db = {
    getExecutor: () => {
      throw Error("Query escaped transaction");
    },
    transaction: () => ({
      execute: async (work: (tx: unknown) => Promise<unknown>) => {
        try {
          const result = await work(tx);
          committed = true;
          return result;
        } catch (e) {
          rolledBack = true;
          throw e;
        }
      },
    }),
  } as unknown as Kysely<Record<string, never>>;
  return {
    repo: new KyselyMetaEntityAuthoringRepository(db),
    queries,
    state: () => ({ committed, rolledBack }),
  };
}
it("requires the exact versioned tenant registration shape", () => {
  expect(parseEntityRegistration(registration)).toEqual(registration);
  expect(parseEntityRegistration(undefined)).toBeUndefined();
  for (const bad of [
    null,
    { ...registration, schemaVersion: 2 },
    { ...registration, ownershipModel: "system" },
    { ...registration, ownershipModel: "package" },
    { ...registration, status: "active" },
    { ...registration, moduleCode: "META" },
    { ...registration, entityClass: { toString: () => "business" } },
  ])
    expect(() => parseEntityRegistration(bad)).toThrow();
});
it("creates only a draft identity and draft change set in the same transaction", async () => {
  const s = setup();
  expect((await s.repo.createDraft(input)).status).toBe("draft");
  expect(s.state()).toEqual({ committed: true, rolledBack: false });
  const all = s.queries.map((q) => q.sql).join("\n");
  expect(all).toContain("'draft'");
  expect(all).toContain("m.status='active'");
  expect(all).not.toMatch(
    /authz\.|publication\.|ON CONFLICT|UPDATE metadata.entity/,
  );
});
it("rolls back an identity when draft creation fails and rejects missing active modules", async () => {
  for (const options of [{ draftFails: true }, { module: false }]) {
    const s = setup(options);
    await expect(s.repo.createDraft(input)).rejects.toThrow();
    expect(s.state()).toEqual({ committed: false, rolledBack: true });
  }
});
it("does not silently register absent existing entities or accept tenantless registration", async () => {
  const s = setup({ identity: false });
  const { registration: _, ...existing } = input;
  await expect(s.repo.createDraft(existing)).rejects.toMatchObject({
    code: "ENTITY_IDENTITY_UNAVAILABLE",
  });
  expect(s.queries.some((q) => q.sql.includes("INSERT INTO"))).toBe(false);
  await expect(
    setup().repo.createDraft({ ...input, tenantId: null }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
