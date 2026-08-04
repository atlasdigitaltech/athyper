import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

for (const path of ["server/.env", "../.env", ".env"]) {
  if (!process.env.DATABASE_URL) {
    loadEnv({ path: resolve(process.cwd(), path), quiet: true });
  }
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const expectedColumns = [
  "id", "tenant_id", "code", "name", "description", "domain", "subtype",
  "parent_id", "path", "depth", "visibility", "sort_order", "metadata",
  "status", "is_active", "status_changed_at", "status_changed_by", "created_at",
  "created_by", "updated_at", "updated_by",
];

const client = new Client({ connectionString });
let checks = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

async function main(): Promise<void> {
  const root = existsSync(resolve(process.cwd(), "server/db"))
    ? process.cwd()
    : resolve(process.cwd(), "../..");
  const neonTables = await readFile(
    resolve(root, "server/db/ddl/planes/neon/master/03_tables.sql"),
    "utf8",
  );
  const meshManifest = await readFile(
    resolve(root, "server/db/ddl/planes/mesh/_manifest.txt"),
    "utf8",
  );
  const athyperManifest = await readFile(
    resolve(root, "server/db/ddl/planes/athyper/_manifest.txt"),
    "utf8",
  );
  const meshPrisma = await readFile(
    resolve(root, "server/packages/adapters/db/src/prisma/schema.mesh.prisma"),
    "utf8",
  );
  assert(
    neonTables.includes("CREATE TABLE master.business_intent"),
    "Neon master desired state owns business_intent",
  );
  assert(
    !meshManifest.includes("intent/")
    && !athyperManifest.includes("intent/"),
    "Athyper and Mesh manifests contain no intent layer",
  );
  assert(
    !meshPrisma.includes("model business_intent"),
    "Mesh Prisma contains no business_intent model",
  );

  await client.connect();
  try {
    const relations = await client.query<{
      schema_name: string;
      rls: boolean;
      force_rls: boolean;
    }>(`
      select n.nspname schema_name,
             c.relrowsecurity rls,
             c.relforcerowsecurity force_rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p')
         and c.relname = 'business_intent'
    `);
    assert(
      relations.rows.length === 1
      && relations.rows[0]?.schema_name === "master",
      "only Neon master owns the live business_intent relation",
    );
    const intentSchema = await client.query<{ absent: boolean }>(
      "select to_regnamespace('intent') is null absent",
    );
    assert(
      intentSchema.rows[0]?.absent,
      "temporary intent schema has been removed",
    );
    assert(
      relations.rows[0]?.rls && relations.rows[0]?.force_rls,
      "Neon tenant RLS is enabled and forced",
    );

    const columns = await client.query<{ column_name: string }>(`
      select column_name
        from information_schema.columns
       where table_schema = 'master'
         and table_name = 'business_intent'
       order by ordinal_position
    `);
    assert(
      JSON.stringify(columns.rows.map((row) => row.column_name))
        === JSON.stringify(expectedColumns),
      "live table retains the canonical Neon master fields",
    );

    const constraints = await client.query<{ conname: string }>(`
      select con.conname
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'master'
         and c.relname = 'business_intent'
    `);
    const constraintNames = new Set(constraints.rows.map((row) => row.conname));
    for (const name of [
      "bi_pkey", "bi_code_uq", "bi_tenant_id_uq", "bi_parent_fk",
      "bi_tenant_fk", "bi_domain_chk", "bi_visibility_chk",
    ]) {
      assert(constraintNames.has(name), `constraint ${name} exists`);
    }

    const triggers = await client.query<{ tgname: string }>(`
      select t.tgname
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'master'
         and c.relname = 'business_intent'
         and not t.tgisinternal
    `);
    const triggerNames = new Set(triggers.rows.map((row) => row.tgname));
    for (const name of [
      "trg_bi_parent_guard", "trg_bi_status_changed", "trg_bi_updated_at",
    ]) {
      assert(triggerNames.has(name), `trigger ${name} exists`);
    }

    const policies = await client.query<{ policyname: string }>(`
      select policyname
        from pg_policies
       where schemaname = 'master'
         and tablename = 'business_intent'
    `);
    const policyNames = new Set(policies.rows.map((row) => row.policyname));
    for (const name of ["tenant_access", "seed_write", "admin_access"]) {
      assert(policyNames.has(name), `policy ${name} exists`);
    }

    const staleFunctions = await client.query<{ stale_count: string }>(`
      select count(*)::text stale_count
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('control', 'master', 'intent')
         and p.prosrc like '%intent.business_intent%'
    `);
    assert(
      staleFunctions.rows[0]?.stale_count === "0",
      "stored functions contain no stale intent-schema reference",
    );

    const externalReferences = await client.query<{ reference_count: string }>(`
      select count(*)::text reference_count
        from pg_constraint con
       where con.contype = 'f'
         and con.confrelid = 'master.business_intent'::regclass
    `);
    assert(
      Number(externalReferences.rows[0]?.reference_count ?? 0) >= 6,
      "Neon accounting and policy foreign keys target master.business_intent",
    );

    const metadata = await client.query<{
      correct_count: string;
      stale_count: string;
    }>(`
      select
        count(*) filter (
          where table_schema = 'master' and table_name = 'business_intent'
        )::text correct_count,
        count(*) filter (
          where table_schema = 'intent' and table_name = 'business_intent'
        )::text stale_count
      from control.entity
    `);
    assert(
      Number(metadata.rows[0]?.correct_count ?? 0) > 0
      && metadata.rows[0]?.stale_count === "0",
      "entity metadata routes business_intent to master",
    );

    const tenants = await client.query<{ id: string }>(
      "select id::text from master.tenant order by id limit 1",
    );
    assert(tenants.rows.length === 1, "a Neon tenant is available for hierarchy verification");

    await client.query("BEGIN");
    try {
      const tenantId = tenants.rows[0]!.id;
      const parentId = randomUUID();
      const actorId = randomUUID();
      await client.query(`
        insert into master.business_intent
          (id, tenant_id, code, name, domain, created_by)
        values ($1, $2, $3, 'Verifier parent', 'OPEX', $4)
      `, [parentId, tenantId, `VERIFY-${parentId.slice(0, 8)}`, actorId]);

      await client.query("SAVEPOINT invalid_hierarchy");
      let rejected = false;
      try {
        await client.query(`
          insert into master.business_intent
            (tenant_id, code, name, domain, parent_id, created_by)
          values ($1, $2, 'Verifier child', 'CAPEX', $3, $4)
        `, [
          tenantId,
          `VERIFY-${randomUUID().slice(0, 8)}`,
          parentId,
          actorId,
        ]);
      } catch {
        rejected = true;
        await client.query("ROLLBACK TO SAVEPOINT invalid_hierarchy");
      }
      assert(rejected, "invalid Neon intent hierarchy is rejected");
    } finally {
      await client.query("ROLLBACK");
    }

    console.log(`Business-intent ownership verification passed (${checks} checks).`);
  } finally {
    await client.end();
  }
}

await main();
