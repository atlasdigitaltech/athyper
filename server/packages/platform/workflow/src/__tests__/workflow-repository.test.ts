import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery, type DatabaseConnection } from "kysely";
import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createKyselyWorkflowRepository, type WorkflowTransaction } from "../kysely-workflow-repository.js";
import { decodeInboxCursor, encodeInboxCursor } from "../inbox-cursor.js";
import { createInMemoryWorkflowPersistence } from "../in-memory-workflow-repository.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const principal = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const context = { tenantId: tenant, principalId: principal, planeKey: "neon" } as VerifiedRequestContext;
function fixture(results: Record<string, unknown>[][]) {
  const queries: CompiledQuery[] = [];
  class Driver extends DummyDriver {
    override async acquireConnection(): Promise<DatabaseConnection> {
      return { executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); return { rows: (results.shift() ?? []) as R[] }; }, streamQuery: async function* <R>() { yield { rows: [] as R[] }; } };
    }
  }
  const db = new Kysely<Record<string, never>>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createIntrospector: db => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler() } });
  return { db, transaction: db as unknown as WorkflowTransaction, repository: createKyselyWorkflowRepository(), queries };
}
function row(createdAt = "2026-09-06T00:00:00.123456Z") {
  return { id, tenant_id: tenant, work_type_code: "approval", title: "Review", source_entity_code: "supplier", source_entity_id: id, assignee_principal_id: principal, available_at: new Date("2026-09-01T00:00:00Z"), priority: "normal", payload: {}, status: "open", row_version: "1", created_at: new Date(createdAt), cursor_created_at: createdAt, created_by: principal };
}
describe("workflow PostgreSQL query regressions", () => {
  it("preserves microseconds in cursors and uses identical eligibility for count and data", async () => {
    const f = fixture([[row(), { ...row(), id: tenant }], [{ count: "2" }]]);
    try {
      const result = await f.repository.listInbox({ context, limit: 1 }, f.transaction);
      expect(result.data).toHaveLength(1); expect(result.totalCount).toBe(2);
      expect(decodeInboxCursor(result.nextCursor!)).toEqual({ createdAt: "2026-09-06T00:00:00.123456Z", id });
      expect(f.queries[0]!.parameters.at(-1)).toBe(2);
      for (const query of f.queries) {
        expect(query.sql).toContain("membership.tenant_id = work_item.tenant_id");
        expect(query.sql).toContain("membership.left_at IS NULL");
        expect(query.sql).toContain("jsonb_typeof");
        expect(query.parameters).toContain(tenant); expect(query.parameters).toContain(principal);
      }
    } finally { await f.db.destroy(); }
  });
  it("retains cursor precision in the SQL boundary and omits the final cursor", async () => {
    const f = fixture([[row()], [{ count: "2" }]]);
    try {
      const result = await f.repository.listInbox({ context, limit: 1, cursor: encodeInboxCursor("2026-09-06T00:00:00.123457Z", id) }, f.transaction);
      expect(f.queries[0]!.parameters).toContain("2026-09-06T00:00:00.123457Z"); expect(result.nextCursor).toBeUndefined();
    } finally { await f.db.destroy(); }
  });
  it("rejects invalid cursor fields before issuing SQL", async () => {
    const f = fixture([]);
    try {
      for (const cursor of ["%%%", encodeInboxCursor("2026-02-30T00:00:00Z", id), encodeInboxCursor("bad", id), encodeInboxCursor("2026-09-06T00:00:00Z", "bad")]) {
        await expect(f.repository.listInbox({ context, cursor }, f.transaction)).rejects.toMatchObject({ code: "INVALID_CURSOR" });
      }
      expect(f.queries).toHaveLength(0);
    } finally { await f.db.destroy(); }
  });
  it("keeps tenant, version, claimant, availability and membership guards in the atomic update", async () => {
    const f = fixture([[]]);
    try {
      expect(await f.repository.action(tenant, id, principal, "complete", 7, {}, f.transaction)).toBeNull();
      const query = f.queries[0]!;
      expect(query.parameters).toContain(7); expect(query.parameters).toContain(tenant);
      expect(query.sql).toContain("claimant_principal_id IS NULL OR claimant_principal_id =");
      expect(query.sql).toContain("available_at <= clock_timestamp()");
      expect(query.sql).toContain("membership.tenant_id = work_item.tenant_id");
      expect(query.sql).toContain("status_changed_at = clock_timestamp()");
    } finally { await f.db.destroy(); }
  });
  it("tenant-scopes all context queries and normalizes UUID case for payload lookup", async () => {
    const f = fixture([[{ id, definition_code: "approval", definition_version: 3, compiled_artifact_hash: "hash" }], [], []]);
    try {
      expect(await f.repository.getRequestContext!(tenant, id.toUpperCase(), f.transaction)).toMatchObject({ activeRevision: { version: 3 }, items: [], stages: [] });
      for (const query of f.queries) expect(query.parameters).toContain(tenant);
      expect(f.queries[2]!.parameters).toContain(id);
    } finally { await f.db.destroy(); }
  });
});

describe("team assignment", () => {
  it("allows only current members of the assigned tenant and team to see and claim work", async () => {
    const other = "44444444-4444-4444-8444-444444444444";
    const persistence = createInMemoryWorkflowPersistence({ now: () => new Date("2026-09-06T00:00:00Z"), teamMembers: [
      { tenantId: tenant, teamId: id, principalId: principal, joinedAt: "2026-01-01T00:00:00Z" },
      { tenantId: tenant, teamId: id, principalId: other, joinedAt: "2026-01-01T00:00:00Z", leftAt: "2026-09-01T00:00:00Z" },
    ] });
    await persistence.transactions.run("neon", context, async transaction => {
      transaction.items.set(id, { id, tenantId: tenant, workTypeCode: "approval", title: "Review", sourceEntityCode: "supplier", sourceEntityId: id, assigneeTeamId: id, availableAt: "2026-01-01T00:00:00Z", priority: "normal", payload: {}, status: "open", rowVersion: 1, createdAt: "2026-01-01T00:00:00Z", createdBy: principal });
      expect(await persistence.repository.listInbox({ context }, transaction)).toMatchObject({ totalCount: 1 });
      expect(await persistence.repository.listInbox({ context: { ...context, principalId: other } }, transaction)).toMatchObject({ totalCount: 0 });
      expect(await persistence.repository.action(tenant, id, other, "claim", 1, {}, transaction)).toBeNull();
      expect(await persistence.repository.action(tenant, id, principal, "claim", 1, {}, transaction)).toMatchObject({ status: "claimed" });
    });
  });
});
