import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPersistedEntityScopes, createPersistedParentScopeBinding } from "../persisted-scopes.js";
import { createEntityParentAdmission } from "../parent-admission.js";

// Opt-in, no external URL accepted: creates and removes only its own container.
// Fixture RLS is deliberate; this does not qualify production product policies.
describe.skipIf(process.env["ENTITY_SCOPE_POSTGRES_TEST"] !== "1")("persisted scope PostgreSQL boundary", () => {
  const name = `athyper-scope-test-${randomUUID()}`;
  const password = randomUUID();
  const tenant = "10000000-0000-0000-0000-000000000001";
  const otherTenant = "10000000-0000-0000-0000-000000000002";
  const actor = "20000000-0000-0000-0000-000000000001";
  const otherActor = "20000000-0000-0000-0000-000000000002";
  const record = "30000000-0000-0000-0000-000000000001";
  const owner = "40000000-0000-0000-0000-000000000001";
  let started = false;
  let admin: pg.Pool;
  let db: Kysely<Record<string, never>>;
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
  beforeAll(async () => {
    docker("run", "--detach", "--rm", "--name", name, "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw", "--env", `POSTGRES_PASSWORD=${password}`,
      "--env", "POSTGRES_DB=scope_test", "athyper/postgres:16.15-hardened");
    started = true;
    const port = Number(docker("port", name, "5432/tcp").split(":").at(-1));
    admin = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password, database: "scope_test", connectionTimeoutMillis: 500 });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await admin.query("SELECT 1"); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!ready) throw Error("Disposable PostgreSQL did not become ready");
    await admin.query(`CREATE ROLE scope_reader LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
      CREATE SCHEMA scope_fixture;
      CREATE TABLE scope_fixture.record (tenant_id uuid NOT NULL, id uuid NOT NULL, owner_org_id uuid NOT NULL, reader_id uuid NOT NULL);
      ALTER TABLE scope_fixture.record ENABLE ROW LEVEL SECURITY;
      ALTER TABLE scope_fixture.record FORCE ROW LEVEL SECURITY;
      CREATE POLICY actor_tenant ON scope_fixture.record TO scope_reader USING (
        tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid AND
        reader_id = nullif(current_setting('app.current_principal_id', true), '')::uuid);
      GRANT USAGE ON SCHEMA scope_fixture TO scope_reader;
      GRANT SELECT, INSERT ON scope_fixture.record TO scope_reader;`);
    await admin.query("INSERT INTO scope_fixture.record VALUES ($1,$2,$3,$4),($5,$2,$3,$4)", [tenant, record, owner, actor, otherTenant]);
    db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({
      host: "127.0.0.1", port, user: "scope_reader", password, database: "scope_test", max: 1,
    }) }) });
  }, 30_000);
  afterAll(async () => {
    try { await db?.destroy(); await admin?.end(); }
    finally { if (started) docker("stop", "--time", "1", name); }
  }, 30_000);
  const input = () => ({ context: { tenantId: tenant, principalId: actor, planeKey: "neon" } as VerifiedRequestContext,
    entityCode: "scope_record", resolver: "organization.record.v1", target: "existing", operationKey: "read",
    phase: "execute", recordId: record, coordinates: { operatingOrganizationId: "forged-owner" } } as const);
  const options = () => ({ database: db, planeKey: "neon" as const, entityCode: "scope_record",
    storage: { schema: "scope_fixture", table: "record", tenantColumn: "tenant_id", idColumn: "id",
      coordinates: { operatingOrganizationId: "owner_org_id" } }, validate: async () => true });

  it("uses a non-bypass role, enforces RLS even without tenant predicates, and stamps actor locally", async () => {
    const adapter = createPersistedEntityScopes({ ...options(), validate: async (_, coordinates, tx) => {
      const role = await sql<{ rolsuper: boolean; rolbypassrls: boolean }>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`.execute(tx);
      expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
      const rows = await sql<{ tenant_id: string }>`SELECT tenant_id FROM scope_fixture.record`.execute(tx);
      expect(rows.rows).toEqual([{ tenant_id: tenant }]);
      const settings = await sql<{ actor: string; isolation: string; readonly: string }>`SELECT current_setting('app.current_principal_id') AS actor, current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS readonly`.execute(tx);
      expect(settings.rows[0]).toEqual({ actor, isolation: "repeatable read", readonly: "on" });
      return coordinates.operatingOrganizationId === owner;
    } });
    expect(await adapter.resolve(input())).toEqual({ state: "resolved", coordinates: { operatingOrganizationId: owner } });
    expect((await sql`SELECT * FROM scope_fixture.record`.execute(db)).rows).toEqual([]);
  });
  it("denies another actor, missing rows, mismatched planes and missing catalog approval", async () => {
    const adapter = createPersistedEntityScopes(options());
    expect(await adapter.resolve({ ...input(), context: { ...input().context, principalId: otherActor } })).toEqual({ state: "invalid" });
    expect(await adapter.resolve({ ...input(), recordId: randomUUID() })).toEqual({ state: "invalid" });
    expect(await adapter.resolve({ ...input(), context: { ...input().context, planeKey: "mesh" } })).toEqual({ state: "invalid" });
    expect(await createPersistedEntityScopes({ ...options(), validate: async () => false }).resolve(input())).toEqual({ state: "invalid" });
    expect(await adapter.preflight(input())).toBe("workflow_blocked");
  });
  it("does not resolve a record that exists only in another tenant", async () => {
    const id = randomUUID();
    await admin.query("INSERT INTO scope_fixture.record VALUES ($1,$2,$3,$4)", [otherTenant, id, owner, actor]);
    expect(await createPersistedEntityScopes(options()).resolve({ ...input(), recordId: id })).toEqual({ state: "invalid" });
  });
  it("denies ambiguous persisted rows rather than choosing an owner", async () => {
    const id = randomUUID();
    await admin.query("INSERT INTO scope_fixture.record VALUES ($1,$2,$3,$4),($1,$2,$5,$4)", [tenant, id, owner, actor, randomUUID()]);
    expect(await createPersistedEntityScopes(options()).resolve({ ...input(), recordId: id })).toEqual({ state: "invalid" });
  });
  it("keeps ownership and catalog reads on one snapshot under concurrent writes", async () => {
    const id = randomUUID();
    await admin.query("INSERT INTO scope_fixture.record VALUES ($1,$2,$3,$4)", [tenant, id, owner, actor]);
    const changedOwner = randomUUID();
    const adapter = createPersistedEntityScopes({ ...options(), validate: async (_, coordinates, tx) => {
      await admin.query("UPDATE scope_fixture.record SET owner_org_id=$1 WHERE id=$2", [changedOwner, id]);
      const rows = await sql<{ owner_org_id: string }>`SELECT owner_org_id FROM scope_fixture.record WHERE id=${id}::uuid`.execute(tx);
      expect(rows.rows[0]?.owner_org_id).toBe(coordinates.operatingOrganizationId);
      return true;
    } });
    expect(await adapter.resolve({ ...input(), recordId: id })).toEqual({ state: "resolved", coordinates: { operatingOrganizationId: owner } });
    expect(await createPersistedEntityScopes(options()).resolve({ ...input(), recordId: id })).toEqual({ state: "resolved", coordinates: { operatingOrganizationId: changedOwner } });
  });
  it("rejects writes in validation and clears transaction identity after rollback", async () => {
    const adapter = createPersistedEntityScopes({ ...options(), validate: async (_, __, tx) => {
      await sql`INSERT INTO scope_fixture.record VALUES (${tenant}::uuid, ${randomUUID()}::uuid, ${owner}::uuid, ${actor}::uuid)`.execute(tx);
      return true;
    } });
    await expect(adapter.resolve(input())).rejects.toMatchObject({ code: "25006" });
    const settings = await sql<{ tenant: string | null; actor: string | null }>`SELECT nullif(current_setting('app.current_tenant_id', true),'') AS tenant, nullif(current_setting('app.current_principal_id', true),'') AS actor`.execute(db);
    expect(settings.rows[0]).toEqual({ tenant: null, actor: null });
    expect((await createPersistedEntityScopes(options()).resolve(input())).state).toBe("resolved");
  });
  it("propagates database errors without returning authorized scope", async () => {
    const adapter = createPersistedEntityScopes(options());
    await expect(adapter.resolve({ ...input(), recordId: "not-a-uuid" })).rejects.toMatchObject({ code: "22P02" });
    await expect(admin.query("INSERT INTO scope_fixture.record VALUES ($1,$2,NULL,$3)", [tenant, randomUUID(), actor])).rejects.toMatchObject({ code: "23502" });
  });
  it("admits only readable parents with persisted ownership", async () => {
    const binding = createPersistedParentScopeBinding(options(), "organization.record.v1");
    const parentInput = { context: input().context, entityCode: "scope_record", recordId: record } as Parameters<typeof binding.resolve>[0];
    expect(await createEntityParentAdmission({ bindings: [binding], read: async () => true })(parentInput))
      .toEqual({ scopeResources: [{ operatingOrganizationId: owner }] });
    expect(await createEntityParentAdmission({ bindings: [binding], read: async () => false })(parentInput)).toBe(false);
    expect(await createEntityParentAdmission({ bindings: [binding], read: async () => true })({ ...parentInput, recordId: randomUUID() })).toBe(false);
    expect(await createEntityParentAdmission({ bindings: [], read: async () => true })(parentInput)).toBe(false);
  });
});
