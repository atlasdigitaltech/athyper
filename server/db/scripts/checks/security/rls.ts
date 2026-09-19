#!/usr/bin/env tsx
/** Catalog-level RLS verifier for the current three-plane schema.
 * Cross-tenant behavior is covered by three-plane-authorization-rls.ts.
 */
import postgres from "postgres";

const databaseUrl = process.env["ATHYPER_PLATFORM_DATABASE_ADMIN_URL"] ?? process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("ERROR: ATHYPER_PLATFORM_DATABASE_ADMIN_URL or DATABASE_URL is required");
  process.exit(1);
}
const appRole = process.env["RLS_APP_ROLE"]?.trim() || "athyperapp";
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(appRole)) throw new Error(`invalid RLS_APP_ROLE ${JSON.stringify(appRole)}`);

interface TableRow { table_name: string; rls_enabled: boolean; rls_forced: boolean; policy_count: number }
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  const [connection] = await sql<{ database_name: string; is_superuser: boolean; bypass_rls: boolean }[]>`
    SELECT current_database() AS database_name, r.rolsuper AS is_superuser, r.rolbypassrls AS bypass_rls
    FROM pg_roles r WHERE r.rolname = session_user
  `;
  const [role] = await sql<{ is_superuser: boolean; bypass_rls: boolean }[]>`
    SELECT rolsuper AS is_superuser, rolbypassrls AS bypass_rls FROM pg_roles WHERE rolname = ${appRole}
  `;
  if (!connection || (!connection.is_superuser && !connection.bypass_rls)) {
    throw new Error("catalog verification requires a superuser or BYPASSRLS administrative connection");
  }
  if (!role || role.is_superuser || role.bypass_rls) {
    throw new Error(`runtime role ${appRole} must exist with NOSUPERUSER and NOBYPASSRLS`);
  }
  const tables = await sql<TableRow[]>`
    SELECT format('%I.%I', n.nspname, c.relname) AS table_name,
           c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
           count(p.polname)::int AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_%'
    GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY n.nspname, c.relname
  `;
  if (tables.length === 0) throw new Error("no tenant-scoped tables found");
  const failures = tables.filter((row) => !row.rls_enabled || !row.rls_forced || row.policy_count === 0);
  console.log(`RLS catalog: ${connection.database_name} (${tables.length} tenant-scoped table parents)`);
  console.log(`Runtime role: ${appRole} NOSUPERUSER/NOBYPASSRLS`);
  for (const row of failures) console.error(`FAIL ${row.table_name}: enabled=${row.rls_enabled} forced=${row.rls_forced} policies=${row.policy_count}`);
  if (failures.length > 0) throw new Error(`${failures.length} tenant-scoped tables fail the RLS catalog contract`);
  console.log(`PASS: all ${tables.length} tenant-scoped table parents have ENABLE/FORCE RLS and policies`);
} finally {
  await sql.end();
}
