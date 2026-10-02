import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createEntityReadinessInventory } from "./entity-readiness-inventory.js";
import { row, compiled } from "./entity-readiness-inventory.fixtures.js";

const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

// Reduced tables exercise the actual inventory query and canonical tenant RLS;
// this does not qualify publication DDL or a deployed target.
it("inventories only active heads, admits global legacy/compiled payloads, and fails closed for tenant-hidden data", async () => {
  const container = `athyper-readiness-inventory-${randomUUID()}`;
  let created = false;
  let admin: Kysely<Record<string, never>> | undefined;
  let runtime: Kysely<Record<string, never>> | undefined;
  try {
    docker(
      "run",
      "-d",
      "--name",
      container,
      "--label",
      "athyper.purpose=readiness-inventory-test",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "-p",
      "127.0.0.1::5432",
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:16.15-bookworm",
    );
    created = true;
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try {
        docker(
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
        );
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    if (!ready) throw Error("Disposable PostgreSQL did not become ready");
    const port = Number(
      docker("port", container, "5432/tcp").split(":").at(-1),
    );
    const connect = (user: string) =>
      new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({
          pool: new Pool({
            host: "127.0.0.1",
            port,
            user,
            database: "postgres",
            max: 1,
          }),
        }),
      });
    admin = connect("postgres");
    runtime = connect("athyperapp");
    await sql
      .raw(
        `
      CREATE ROLE athyperapp LOGIN;
      CREATE SCHEMA runtime_meta; CREATE SCHEMA shared;
      CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;
      CREATE TABLE runtime_meta.applied_release(id uuid PRIMARY KEY, source_release_id text, source_release_no int, manifest jsonb, status text);
      CREATE TABLE runtime_meta.release_activation_head(publication_key text PRIMARY KEY, applied_release_id uuid);
      CREATE TABLE runtime_meta.entity_contract(id uuid PRIMARY KEY, tenant_id uuid, entity_code text, release_id text, release_no int, entity_contract_hash text, status text);
      CREATE TABLE runtime_meta.entity_descriptor(id uuid PRIMARY KEY, tenant_id uuid, applied_release_id uuid, entity_contract_id uuid, descriptor_kind text, plane_code text, compiled_hash text, compiled_json jsonb, status text);
      CREATE TABLE runtime_meta.applied_release_payload(applied_release_id uuid, tenant_id uuid, artifact_kind text, payload_json jsonb);
      GRANT USAGE ON SCHEMA runtime_meta, shared TO athyperapp;
      GRANT SELECT ON ALL TABLES IN SCHEMA runtime_meta TO athyperapp;
    `,
      )
      .execute(admin);
    const policies = readFileSync(
      new URL(
        "../../../../db/ddl/common/runtime_meta/10_rls.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await sql
      .raw(
        policies.slice(
          policies.indexOf("ALTER TABLE runtime_meta.entity_contract ENABLE"),
          policies.indexOf(
            "DO $$ BEGIN",
            policies.indexOf("ALTER TABLE runtime_meta.entity_contract ENABLE"),
          ),
        ),
      )
      .execute(admin);
    const legacy = row(),
      modern = compiled();
    const legacyId = randomUUID(),
      modernId = randomUUID(),
      contractId = randomUUID();
    for (const [id, fixture] of [
      [legacyId, legacy],
      [modernId, modern],
    ] as const) {
      await sql`INSERT INTO runtime_meta.applied_release VALUES (${id}::uuid, ${fixture.source_release_id}, ${fixture.source_release_no}, ${JSON.stringify({ artifactKind: fixture.artifact_kind })}::jsonb, 'active')`.execute(
        admin,
      );
      await sql`INSERT INTO runtime_meta.release_activation_head VALUES (${id}, ${id}::uuid)`.execute(
        admin,
      );
    }
    const d = legacy.descriptor;
    await sql`INSERT INTO runtime_meta.entity_contract VALUES (${contractId}::uuid, NULL, ${d.entity_code}, ${d.release_id}, ${d.release_no}, ${d.entity_contract_hash}, 'published')`.execute(
      admin,
    );
    await sql`INSERT INTO runtime_meta.entity_descriptor VALUES (${randomUUID()}::uuid, NULL, ${legacyId}::uuid, ${contractId}::uuid, 'entity_runtime', ${d.plane_code}, ${d.compiled_hash}, ${JSON.stringify(d.compiled_json)}::jsonb, 'active')`.execute(
      admin,
    );
    await sql`INSERT INTO runtime_meta.applied_release_payload VALUES (${modernId}::uuid, NULL, 'compiled_entity_runtime', ${JSON.stringify(modern.payload)}::jsonb)`.execute(
      admin,
    );
    const inventory = createEntityReadinessInventory({ neon: runtime });
    expect((await inventory()).map((d) => d.entityCode).sort()).toEqual([
      "country",
      "qualification_company_invoice",
    ]);
    // Active releases without a head, and inactive releases with a stale head,
    // must not contribute missing or obsolete capabilities.
    for (const status of ["active", "staged", "retired", "rejected"]) {
      const id = randomUUID();
      await sql`INSERT INTO runtime_meta.applied_release VALUES (${id}::uuid, 'unserved', 99, '{"artifactKind":"entity_runtime"}'::jsonb, ${status})`.execute(
        admin,
      );
      if (status !== "active")
        await sql`INSERT INTO runtime_meta.release_activation_head VALUES (${id}, ${id}::uuid)`.execute(
          admin,
        );
    }
    expect(await inventory()).toHaveLength(2);
    for (const table of [
      "entity_descriptor",
      "entity_contract",
      "applied_release_payload",
    ]) {
      await sql`UPDATE ${sql.table(`runtime_meta.${table}`)} SET tenant_id=${randomUUID()}::uuid`.execute(
        admin,
      );
      await expect(inventory()).rejects.toThrow(
        table === "entity_contract"
          ? "Entity descriptor coordinate mismatch"
          : "ENTITY_READINESS_INVENTORY_INCOMPLETE",
      );
      await sql`UPDATE ${sql.table(`runtime_meta.${table}`)} SET tenant_id=NULL`.execute(
        admin,
      );
      expect(await inventory()).toHaveLength(2);
    }
    // Two tenants coexist with global rows. The runtime role must read each
    // applied scope, then leave its pooled connection without a tenant context.
    const tenant = randomUUID(),
      otherTenant = randomUUID();
    await sql`UPDATE runtime_meta.entity_contract SET tenant_id=${tenant}::uuid`.execute(
      admin,
    );
    await sql`UPDATE runtime_meta.entity_descriptor SET tenant_id=${tenant}::uuid`.execute(
      admin,
    );
    await sql`UPDATE runtime_meta.release_activation_head SET publication_key=${`metadata.entity.country.${tenant.replaceAll("-", "")}`} WHERE applied_release_id=${legacyId}::uuid`.execute(
      admin,
    );
    await sql`UPDATE runtime_meta.applied_release_payload SET tenant_id=${otherTenant}::uuid`.execute(
      admin,
    );
    await sql`UPDATE runtime_meta.release_activation_head SET publication_key=${`metadata.compiled_entity.qualification_company_invoice.tenant.${otherTenant}`} WHERE applied_release_id=${modernId}::uuid`.execute(
      admin,
    );
    expect(await inventory()).toHaveLength(2);
    expect(
      (
        await sql`SELECT nullif(current_setting('app.current_tenant_id',true),'') AS tenant`.execute(
          runtime,
        )
      ).rows,
    ).toEqual([{ tenant: null }]);
    // Global data is visible under tenant RLS but cannot substitute for a
    // missing tenant-specific publication.
    await sql`UPDATE runtime_meta.applied_release_payload SET tenant_id=NULL`.execute(
      admin,
    );
    await expect(inventory()).rejects.toThrow("INVENTORY_INCOMPLETE");
    await sql`UPDATE runtime_meta.applied_release_payload SET tenant_id=${otherTenant}::uuid`.execute(
      admin,
    );
    // The legacy collection publisher omitted manifest tenantId. Its canonical
    // key supplies scope, and the established non-Entity kind stays excluded.
    await sql`UPDATE runtime_meta.release_activation_head SET publication_key=${`metadata.collection.activity.inbox.${tenant.replaceAll("-", "")}`} WHERE applied_release_id=${legacyId}::uuid`.execute(
      admin,
    );
    await sql`UPDATE runtime_meta.entity_descriptor SET descriptor_kind='collection_configuration'`.execute(
      admin,
    );
    expect(await inventory()).toHaveLength(1);
    await sql`UPDATE runtime_meta.applied_release SET manifest=manifest || ${JSON.stringify({ tenantId: otherTenant })}::jsonb WHERE id=${legacyId}::uuid`.execute(
      admin,
    );
    await expect(inventory()).rejects.toThrow("SCOPE_INVALID");
  } finally {
    await runtime?.destroy();
    await admin?.destroy();
    if (created) docker("rm", "-f", container);
  }
}, 30_000);
