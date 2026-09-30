import { afterEach, expect, it, vi } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPersistedEntityScopes } from "../persisted-scopes.js";

const databases: Kysely<Record<string, never>>[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.destroy())); });
function fixture(rows: Record<string, unknown>[] = [{ __record_id: "record", operatingOrganizationId: "stored-org" }]) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const db = new Kysely<Record<string, never>>({ dialect: {
    createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(),
    createIntrospector: db => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler(),
  }, plugins: [{ transformQuery: input => input.node, transformResult: async input => ({ ...input.result, rows }) }],
  log(event) { queries.push({ sql: event.query.sql, parameters: event.query.parameters }); } });
  databases.push(db);
  const validate = vi.fn(async () => true);
  const options = { database: db, planeKey: "neon" as const, entityCode: "reference_record",
    storage: { schema: "master", table: "reference_record", tenantColumn: "tenant_id", idColumn: "id",
      coordinates: { operatingOrganizationId: "owner_org_id" } }, validate };
  const input = { context: { tenantId: "tenant", principalId: "principal", planeKey: "neon" } as VerifiedRequestContext,
    entityCode: "reference_record", resolver: "organization.record.v1", target: "existing",
    operationKey: "read", phase: "execute", recordId: "record",
    coordinates: { operatingOrganizationId: "caller-org" } } as const;
  return { options, input, queries, validate, adapter: createPersistedEntityScopes(options) };
}
it("reads stored ownership, stamps identity and binds tenant/record parameters", async () => {
  const f = fixture();
  expect(await f.adapter.resolve(f.input)).toEqual({ state: "resolved", coordinates: { operatingOrganizationId: "stored-org" } });
  expect(f.queries[0]!.sql).toContain("REPEATABLE READ, READ ONLY");
  expect(f.queries.some(q => q.sql.includes("set_config") && q.parameters.includes("tenant") && q.parameters.includes("principal"))).toBe(true);
  const query = f.queries.find(q => q.sql.includes('FROM "master"."reference_record"'))!;
  expect(query.sql).toContain('"tenant_id"=');
  expect(query.parameters).toEqual(["tenant", "record"]);
  expect(f.validate.mock.calls).toHaveLength(1);
});
it.each([{ rows: [] }, { rows: [{ __record_id: "record" }] }, { rows: [{ __record_id: "a" }, { __record_id: "b" }] }])("rejects missing, ownerless or ambiguous records", async ({ rows }) => {
  const f = fixture(rows); expect(await f.adapter.resolve(f.input)).toEqual({ state: "invalid" });
});
it("requires owning-catalog validation and keeps absent preflight blocked", async () => {
  const f = fixture(); f.validate.mockResolvedValue(false);
  expect(await f.adapter.resolve(f.input)).toEqual({ state: "invalid" });
  expect(await f.adapter.preflight(f.input)).toBe("workflow_blocked");
});
it("rejects plane mismatch and invalid identifiers without querying", async () => {
  const f = fixture();
  expect(await f.adapter.resolve({ ...f.input, context: { ...f.input.context, planeKey: "mesh" } })).toEqual({ state: "invalid" });
  expect(f.queries).toHaveLength(0);
  expect(() => createPersistedEntityScopes({ ...f.options, storage: { ...f.options.storage, table: "record;select" } })).toThrow("ENTITY_SCOPE_STORAGE_BINDING_INVALID");
});
