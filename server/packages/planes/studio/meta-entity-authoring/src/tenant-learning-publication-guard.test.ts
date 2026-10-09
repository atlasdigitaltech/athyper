import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";

it("does not publish a tenant product draft through the legacy full-entity release path", async () => {
  const query = vi.fn(async (statement: string) => {
    if (statement.includes("current_setting"))
      return { rows: [{ hash: null }] };
    if (statement.includes("SELECT tenant_id FROM metadata.entity_change_set"))
      return { rows: [{ tenant_id: "tenant" }] };
    if (statement.includes("SELECT * FROM metadata.entity_change_set"))
      return { rows: [{ tenant_id: "tenant", entity_id: "product" }] };
    if (statement.includes("AS shared_product"))
      return { rows: [{ shared_product: true }] };
    if (["begin", "rollback"].includes(statement)) return { rows: [] };
    throw Error("Unexpected release operation");
  });
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  try {
    const repository = new KyselyMetaEntityAuthoringRepository(database);
    await expect(
      repository.createRelease({
        changeSetId: "draft",
        expectedRevision: 1,
        actorId: "publisher",
        artifact: {} as never,
        targetPlanes: ["neon"],
        releaseKind: "publish",
      }),
    ).rejects.toMatchObject({
      code: "LEARNING_EXTENSION_PUBLICATION_UNAVAILABLE",
    });
    expect(
      query.mock.calls.some(([statement]) =>
        statement.includes("INSERT INTO metadata.entity_release"),
      ),
    ).toBe(false);
  } finally {
    await database.destroy();
  }
});
