import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";
it("rejects a moved published head under the repository lock before creating a release", async () => {
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("status='approved'")
      ? [{ id: "draft", tenant_id: "tenant", entity_id: "entity" }]
      : text.includes("validation_status='valid'")
        ? [{ id: "snapshot", contract_hash: "expected" }]
        : text.includes("SELECT id,release_no")
          ? [{ id: "human-release", release_no: 3 }]
          : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release: () => {} }),
        end: async () => {},
      } as never,
    }),
  });
  try {
    await expect(
      new KyselyMetaEntityAuthoringRepository(db).createRelease({
        changeSetId: "draft",
        expectedRevision: 1,
        actorId: "publisher",
        expectedSourceReleaseId: "older-release",
        artifact: { contractHash: "expected" } as never,
        targetPlanes: ["neon"],
        releaseKind: "publish",
      }),
    ).rejects.toThrow("DEV_PUBLICATION_SOURCE_CHANGED");
    const calls = query.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(
      calls.some((c) => c.includes("INSERT INTO metadata.entity_release")),
    ).toBe(false);
    expect(calls.at(-1)).toBe("rollback");
  } finally {
    await db.destroy();
  }
});
