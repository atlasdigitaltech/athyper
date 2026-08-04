import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const checks: Array<{ name: string; ok: boolean }> = [];

async function contains(path: string, value: string): Promise<boolean> {
  return (await readFile(resolve(repoRoot, path), "utf8")).includes(value);
}

async function noSpecializedReference(path: string): Promise<boolean> {
  const source = await readFile(resolve(repoRoot, path), "utf8");
  return !/atlas_byok_audit|atlas_support_session_audit/.test(source);
}

for (const path of [
  "server/db/ddl/common/ai/03_tables.sql",
  "server/db/ddl/common/ai/05_constraints.sql",
  "server/db/ddl/common/ai/06_indexes.sql",
  "server/db/ddl/common/ai/10_rls.sql",
  "server/db/ddl/common/ai/11_grants.sql",
  "server/db/ddl/planes/athyper/ai/03_tables.sql",
  "server/db/ddl/planes/athyper/ai/05_constraints.sql",
  "server/db/ddl/planes/athyper/ai/06_indexes.sql",
  "server/db/ddl/planes/athyper/ai/11_grants.sql",
  "server/packages/adapters/db/src/prisma/schema.prisma",
  "server/packages/adapters/db/src/prisma/schema.mesh.prisma",
  "server/packages/adapters/db/src/generated/kysely/types.ts",
  "server/packages/adapters/db/src/generated/kysely-mesh/types.ts",
]) {
  checks.push({
    name: `${path} has no specialized audit relation`,
    ok: await noSpecializedReference(path),
  });
}

for (const path of [
  "server/packages/services/ai/byok/sql-tenant-byok-audit.sink.ts",
  "server/packages/services/ai/byok/tenant-provider-credential-rotation.service.ts",
  "server/packages/services/iam/support/sql-atlas-support-session.repository.ts",
]) {
  checks.push({
    name: `${path} writes canonical audit`,
    ok: await contains(path, "audit.audit_log")
      && await noSpecializedReference(path),
  });
}

for (const plane of ["athyper", "neon", "mesh"]) {
  checks.push({
    name: `${plane} installs the common audit contract`,
    ok: await contains(
      `server/db/ddl/planes/${plane}/_manifest.txt`,
      "common/audit/03_tables.sql",
    ),
  });
}

loadEnv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");
const client = new Client({ connectionString });
await client.connect();
try {
  const live = await client.query<{
    canonical: boolean;
    byok_removed: boolean;
    support_removed: boolean;
    immutable_trigger: boolean;
    support_policy: boolean;
  }>(`
    select
      to_regclass('audit.audit_log') is not null canonical,
      to_regclass('ai.atlas_byok_audit') is null
        and to_regclass('log.atlas_byok_audit') is null byok_removed,
      to_regclass('ai.atlas_support_session_audit') is null
        and to_regclass('master.atlas_support_session_audit') is null support_removed,
      exists (
        select 1
          from pg_trigger
         where tgrelid = 'audit.audit_log'::regclass
           and tgname = 'trg_audit_log_immutable'
           and not tgisinternal
      ) immutable_trigger,
      not exists (select 1 where to_regclass('ai.atlas_support_session') is not null)
      or exists (
        select 1
          from pg_policy
         where polrelid = 'audit.audit_log'::regclass
           and polname = 'atlas_support_origin_audit'
      ) support_policy
  `);
  const row = live.rows[0];
  checks.push(
    { name: "live canonical audit table exists", ok: row?.canonical === true },
    { name: "live BYOK audit table is removed", ok: row?.byok_removed === true },
    { name: "live support audit table is removed", ok: row?.support_removed === true },
    { name: "live canonical audit is immutable", ok: row?.immutable_trigger === true },
    { name: "live support insert policy is installed", ok: row?.support_policy === true },
  );
} finally {
  await client.end();
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}
if (failed.length) {
  throw new Error(`${failed.length} Atlas audit consolidation check(s) failed.`);
}
console.log(`Atlas audit consolidation verified (${checks.length} checks).`);
