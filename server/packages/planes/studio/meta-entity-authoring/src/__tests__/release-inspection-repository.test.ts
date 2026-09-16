import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";
import { sha256 } from "../deterministic.js";
function fixture(result: unknown[]) {
  const query = vi.fn(async () => ({ rows: result }));
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release: () => {} }),
        end: async () => {},
      } as never,
    }),
  });
  return {
    database,
    query,
    repository: new KyselyMetaEntityAuthoringRepository(database),
  };
}
it("loads the release's referenced immutable snapshot and binds tenant/id as SQL parameters", async () => {
  const graph = { entity: { entityCode: "business_partner" } },
    release = { id: "release", contractHash: sha256(graph) };
  const f = fixture([{ release, graph }]);
  try {
    expect(
      await f.repository.readInspectionRelease("tenant-a", "release"),
    ).toEqual({ release, graph });
    const [query, parameters] = f.query.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(query).toContain("snapshot.id=r.revision_id");
    expect(query).toContain("snapshot.tenant_id=r.tenant_id");
    expect(query).toContain("r.tenant_id=$1::uuid");
    expect(parameters).toEqual(["tenant-a", "release"]);
  } finally {
    await f.database.destroy();
  }
});
it("rejects a corrupted stored contract instead of presenting it as the selected release", async () => {
  const f = fixture([
    {
      release: { contractHash: "a".repeat(64) },
      graph: { entity: { entityCode: "business_partner" } },
    },
  ]);
  try {
    await expect(
      f.repository.readInspectionRelease("tenant", "release"),
    ).rejects.toThrow("does not match its contract hash");
  } finally {
    await f.database.destroy();
  }
});

it("accepts a verified PostgreSQL JSON hash for legacy SQL-authored releases", async () => {
  const graph = { entity: { entityCode: "business_partner" } };
  const release = { contractHash: sha256('{"entity": {"entityCode": "business_partner"}}') };
  expect(release.contractHash).not.toBe(sha256(graph));
  const f = fixture([{ release, graph, legacyHashMatches: true }]);
  try {
    expect(await f.repository.readInspectionRelease("tenant", "release"))
      .toEqual({ release, graph });
    const query = (f.query.mock.calls[0] as unknown as [string])[0];
    expect(query).toContain("snapshot.contract_hash=r.contract_hash");
    expect(query).toContain("sha256(convert_to(snapshot.contract_json::text,'UTF8'))");
  } finally {
    await f.database.destroy();
  }
});
it("rejects legacy content when its recomputed PostgreSQL hash differs", async () => {
  const f = fixture([{ release: { contractHash: "a".repeat(64) },
    graph: { entity: { entityCode: "business_partner" } }, legacyHashMatches: false }]);
  try {
    await expect(f.repository.readInspectionRelease("tenant", "release"))
      .rejects.toThrow("does not match its contract hash");
  } finally {
    await f.database.destroy();
  }
});
