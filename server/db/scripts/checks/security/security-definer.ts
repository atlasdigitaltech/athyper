#!/usr/bin/env tsx
/** Audits current SECURITY DEFINER ownership and hardening contracts. */
import postgres from "postgres";

const databaseUrl = process.env["ATHYPER_PLATFORM_DATABASE_ADMIN_URL"] ?? process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("ERROR: ATHYPER_PLATFORM_DATABASE_ADMIN_URL or DATABASE_URL is required");
  process.exit(1);
}
const deploymentOwner = process.env["SECDEF_EXPECTED_OWNER"]?.trim() || "postgres";
const projectionOwner = process.env["SECDEF_PROJECTION_OWNER"]?.trim() || "athyper_projection_owner";
const bypassOwner = process.env["SECDEF_BYPASS_OWNER"]?.trim() || "postgres";
for (const value of [deploymentOwner, projectionOwner, bypassOwner]) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`invalid role name ${JSON.stringify(value)}`);
}
const projectionFunctions = new Set([
  "authz.fn_stage_application_projection", "authz.fn_activate_application_projection",
  "authz.fn_stage_entity_operation_projection", "authz.fn_activate_entity_operation_projection",
  "authz.fn_retire_entity_operation_projection", "authz.fn_restore_entity_operation_projection",
]);
interface FunctionRow { qualified_name: string; signature: string; owner: string; public_has_exec: boolean; has_search_path: boolean; bypass_boundary: boolean }

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  const rows = await sql<FunctionRow[]>`
    SELECT n.nspname || '.' || p.proname AS qualified_name,
           n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature,
           owner.rolname AS owner, has_function_privilege(0, p.oid, 'EXECUTE') AS public_has_exec,
           EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%') AS has_search_path,
           'row_security=off' = ANY(COALESCE(p.proconfig, ARRAY[]::text[])) AS bypass_boundary
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles owner ON owner.oid = p.proowner
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_%'
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  `;
  if (rows.length === 0) throw new Error("no application SECURITY DEFINER functions found");
  let failures = 0;
  for (const row of rows) {
    const expectedOwner = row.bypass_boundary ? bypassOwner : projectionFunctions.has(row.qualified_name) ? projectionOwner : deploymentOwner;
    const issues: string[] = [];
    if (row.owner !== expectedOwner) issues.push(`owner=${row.owner}, expected=${expectedOwner}`);
    if (row.public_has_exec) issues.push("PUBLIC has EXECUTE");
    if (!row.has_search_path) issues.push("search_path is not explicit");
    if (issues.length > 0) { failures++; console.error(`FAIL ${row.signature}: ${issues.join('; ')}`); }
  }
  const [projectionRole] = await sql<{ superuser: boolean; bypass_rls: boolean; can_login: boolean }[]>`
    SELECT rolsuper AS superuser, rolbypassrls AS bypass_rls, rolcanlogin AS can_login FROM pg_roles WHERE rolname = ${projectionOwner}
  `;
  if (!projectionRole || projectionRole.superuser || projectionRole.bypass_rls || projectionRole.can_login) {
    failures++; console.error(`FAIL ${projectionOwner}: must exist as NOLOGIN/NOSUPERUSER/NOBYPASSRLS`);
  }
  const [bypassRole] = await sql<{ superuser: boolean; bypass_rls: boolean }[]>`
    SELECT rolsuper AS superuser, rolbypassrls AS bypass_rls FROM pg_roles WHERE rolname = ${bypassOwner}
  `;
  if (!bypassRole || (!bypassRole.superuser && !bypassRole.bypass_rls)) {
    failures++; console.error(`FAIL ${bypassOwner}: row_security=off boundary owner must bypass RLS`);
  }
  console.log(`SECURITY DEFINER catalog: ${rows.length} functions; ${failures} failures`);
  if (failures > 0) throw new Error("SECURITY DEFINER hardening drift detected");
  console.log("PASS: owner split, PUBLIC revoke, explicit search_path, and projection role constraints hold");
} finally {
  await sql.end();
}
