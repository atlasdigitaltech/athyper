import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type DatabaseConnection, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import { createKyselySavedViewRepository, type SavedView } from "./index.js";

function fixture(rows: Record<string, unknown>[]) {
  class Driver extends DummyDriver {
    override async acquireConnection(): Promise<DatabaseConnection> {
      return { executeQuery: async <R>() => ({ rows: rows as R[] }), streamQuery: async function* <R>() { yield { rows: rows as R[] }; } };
    }
  }
  const db = new Kysely<Record<string, never>>({ dialect: {
    createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(),
    createIntrospector: db => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler(),
  } });
  const repo = createKyselySavedViewRepository({ run: async (_plane, _actor, work) => work(db as unknown as Transaction<Record<string, never>>) });
  return { db, repo };
}
const scope = { planeKey: "neon" as const, tenantId: "tenant", principalId: "creator" };
const view: SavedView = { id: "view", tenantId: scope.tenantId, ownerPrincipalId: scope.principalId, createdBy: scope.principalId, scope: "personal", surfaceCode: "entity_list", entityCode: "supplier", code: "all", name: "All", state: {}, metadata: {}, status: "active", version: 1 };

describe("saved-view persistence results", () => {
  it("returns PostgreSQL's version on creation", async () => {
    const { db, repo } = fixture([{ version: "54321" }]);
    try { expect(await repo.create("neon", view)).toEqual({ ...view, version: 54321 }); }
    finally { await db.destroy(); }
  });
  it("returns the persisted version and metadata on cloning", async () => {
    const { db, repo } = fixture([{ version: "54322" }]);
    try { expect(await repo.clone!(scope, view, view)).toEqual({ ...view, version: 54322, metadata: { cloned: true } }); }
    finally { await db.destroy(); }
  });
  it("retains the creator of ownerless shared rows for authorization", async () => {
    const { db, repo } = fixture([{ id: view.id, tenant_id: scope.tenantId, owner_principal_id: null, created_by: "creator", scope: "shared", surface_code: view.surfaceCode, entity_code: view.entityCode, code: view.code, name: view.name, state_json: {}, metadata: {}, status: "active", version: "54321" }]);
    try {
      expect(await repo.get({ ...scope, id: view.id })).toMatchObject({ scope: "shared", createdBy: "creator", version: 54321 });
      expect((await repo.list(scope))[0]).toMatchObject({ createdBy: "creator" });
    } finally { await db.destroy(); }
  });
});
