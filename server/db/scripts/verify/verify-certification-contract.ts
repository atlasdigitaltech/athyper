import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

if (!process.env.DATABASE_URL) {
  loadEnv({ path: resolve(process.cwd(), "server/.env"), quiet: true });
}
if (!process.env.DATABASE_URL) {
  loadEnv({ path: resolve(process.cwd(), "../.env"), quiet: true });
}
if (!process.env.DATABASE_URL) {
  loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const expectedColumns = {
  certification_type: [
    "id", "tenant_id", "code", "name", "issuing_body", "category",
    "description", "is_custom", "metadata", "status", "is_active",
    "created_at", "created_by", "updated_at", "updated_by",
  ],
  certification: [
    "id", "tenant_id", "owner_type", "owner_id", "certification_type_id",
    "custom_name", "certificate_number", "certified_by", "certified_location",
    "additional_info", "document_attachment_id", "effective_from",
    "effective_until", "metadata", "status", "is_active", "status_changed_at",
    "status_changed_by", "created_at", "created_by", "updated_at", "updated_by",
    "company_code_id", "site_id",
  ],
} as const;

const client = new Client({ connectionString });
let checks = 0;

function pass(message: string): void {
  checks += 1;
  console.log(`PASS ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL ${message}`);
  pass(message);
}

async function main(): Promise<void> {
  const repoRoot = resolve(process.cwd(), process.cwd().endsWith("server\\db") ? "../.." : ".");
  const readRepo = (path: string) => readFile(resolve(repoRoot, path), "utf8");
  const [athyperManifest, neonManifest, meshManifest, canonicalPrisma, meshPrisma] =
    await Promise.all([
      readRepo("server/db/ddl/planes/athyper/_manifest.txt"),
      readRepo("server/db/ddl/planes/neon/_manifest.txt"),
      readRepo("server/db/ddl/planes/mesh/_manifest.txt"),
      readRepo("server/packages/adapters/db/src/prisma/schema.prisma"),
      readRepo("server/packages/adapters/db/src/prisma/schema.mesh.prisma"),
    ]);
  assert(!athyperManifest.includes("certification"), "Athyper manifest has no certification tables");
  assert(
    neonManifest.includes("planes/neon/master/03_certification_tables.sql"),
    "Neon manifest owns certification under master",
  );
  assert(
    meshManifest.includes("planes/mesh/mesh/03_certification_tables.sql"),
    "Mesh manifest owns certification under mesh",
  );
  assert(
    canonicalPrisma.includes('model certification {')
      && canonicalPrisma.includes('@@schema("master")'),
    "canonical Prisma routes certification to master",
  );
  assert(
    meshPrisma.includes('model certification {')
      && meshPrisma.includes('@@schema("mesh")'),
    "Mesh Prisma routes certification to mesh",
  );

  await client.connect();
  try {
    const relations = await client.query<{
      schema_name: string;
      table_name: string;
      rls: boolean;
      force_rls: boolean;
    }>(`
      select n.nspname schema_name, c.relname table_name,
             c.relrowsecurity rls, c.relforcerowsecurity force_rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p')
         and c.relname in ('certification', 'certification_type')
       order by 1, 2
    `);
    assert(
      relations.rows.length === 2
      && relations.rows.every((row) => row.schema_name === "master"),
      "only Neon master owns the two relations",
    );
    assert(
      relations.rows.every((row) => row.rls && row.force_rls),
      "RLS is enabled and forced on both relations",
    );

    for (const [table, expected] of Object.entries(expectedColumns)) {
      const columns = await client.query<{ column_name: string }>(`
        select column_name
          from information_schema.columns
         where table_schema = 'master' and table_name = $1
         order by ordinal_position
      `, [table]);
      assert(
        JSON.stringify(columns.rows.map((row) => row.column_name))
          === JSON.stringify(expected),
        `${table} has the canonical Neon contract`,
      );
    }

    const constraints = await client.query<{ conname: string }>(`
      select con.conname
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'master'
         and c.relname in ('certification', 'certification_type')
    `);
    const constraintNames = new Set(constraints.rows.map((row) => row.conname));
    for (const name of [
      "certification_pkey",
      "certification_tenant_id_uq",
      "certification_type_pkey",
      "certification_type_fk",
      "certification_type_xor_custom_chk",
      "certification_type_metadata_object_chk",
      "certification_metadata_object_chk",
      "certification_tenant_fk",
      "certification_company_code_fk",
      "certification_site_fk",
    ]) {
      assert(constraintNames.has(name), `constraint ${name} exists`);
    }

    const triggers = await client.query<{ tgname: string }>(`
      select t.tgname
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'master'
         and c.relname in ('certification', 'certification_type')
         and not t.tgisinternal
    `);
    const triggerNames = new Set(triggers.rows.map((row) => row.tgname));
    for (const name of [
      "certification_type_updated_at",
      "certification_updated_at",
      "certification_status_changed",
      "certification_validate_type_scope",
    ]) {
      assert(triggerNames.has(name), `trigger ${name} exists`);
    }

    const policies = await client.query<{ policyname: string }>(`
      select policyname
        from pg_policies
       where schemaname = 'master'
         and tablename in ('certification', 'certification_type')
    `);
    assert(policies.rows.length === 6, "six admin/tenant RLS policies exist");

    const entityRegistry = await client.query<{
      registry_present: boolean;
      correct_count: string;
      stale_count: string;
    }>(`
      select
        to_regclass('control.entity') is not null registry_present,
        case when to_regclass('control.entity') is null then '0' else (
          select count(*)::text from control.entity
           where table_schema = 'master' and table_name = 'certification'
        ) end correct_count,
        case when to_regclass('control.entity') is null then '0' else (
          select count(*)::text from control.entity
           where table_schema = 'certification' and table_name = 'certification'
        ) end stale_count
    `);
    const registry = entityRegistry.rows[0];
    assert(
      !registry?.registry_present
      || (registry.correct_count === "1" && registry.stale_count === "0"),
      "entity metadata points only to master certification",
    );

    const dedicatedSchema = await client.query<{ present: boolean }>(
      "select exists (select 1 from pg_namespace where nspname = 'certification') present",
    );
    assert(!dedicatedSchema.rows[0]?.present, "no separate certification schema exists");

    console.log(`Certification contract verification passed (${checks} checks).`);
  } finally {
    await client.end();
  }
}

await main();
