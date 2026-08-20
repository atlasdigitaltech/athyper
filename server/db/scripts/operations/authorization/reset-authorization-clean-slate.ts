#!/usr/bin/env tsx

import pg from "pg";

import { applyAuthorizationSeedPack } from "../../apply-authorization-seed-pack.js";
import {
  assertDestructiveResetAllowed,
  resolveDestructiveResetCliApproval,
  type ProvisionPlane,
} from "../../safe-provision.js";

const args = process.argv.slice(2);
const plane = option("--plane") as ProvisionPlane | undefined;
if (!plane || !["studio", "neon", "mesh"].includes(plane)) {
  throw new Error("--plane=studio|neon|mesh is required");
}
if (!args.includes("--reset")) throw new Error("clean-slate reset requires --reset");

const variables: Record<ProvisionPlane, string[]> = {
  studio: ["ATHYPER_PLATFORM_DATABASE_ADMIN_URL"],
  neon: ["ATHYPER_NEON_DATABASE_ADMIN_URL", "DATABASE_ADMIN_URL"],
  mesh: ["ATHYPER_MESH_DATABASE_ADMIN_URL", "MESH_DATABASE_ADMIN_URL"],
};
const explicitUrl = option("--database-url");
const databaseUrl = explicitUrl ?? variables[plane]
  .map((name) => process.env[name]?.trim())
  .find((value): value is string => Boolean(value));
if (!databaseUrl) throw new Error(`${variables[plane].join(" or ")} (or --database-url) is required`);

const approval = resolveDestructiveResetCliApproval(
  args,
  plane,
  process.env.ATHYPER_DISPOSABLE_ENVIRONMENT_MARKER,
);
const client = new pg.Client({
  connectionString: databaseUrl,
  application_name: `authorization-clean-slate-reset-${plane}`,
});

await client.connect();
let removed: Record<string, number> = {};
let invalidatedPrincipalCount = 0;
let invalidatedTenantCount = 0;
try {
  await client.query("BEGIN");
  await assertDestructiveResetAllowed(client, approval);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`athyper:authorization:clean-slate-reset:${plane}`]);
  await client.query("SELECT set_config('app.database_plane',$1,true)", [plane]);
  const before = await client.query<{ relation: string; count: string }>(`
    SELECT relation, count FROM (
      SELECT 'permission' relation,count(*)::text count FROM authz.permission UNION ALL
      SELECT 'permission_scope_kind',count(*)::text FROM authz.permission_scope_kind UNION ALL
      SELECT 'role',count(*)::text FROM authz.role UNION ALL
      SELECT 'role_permission',count(*)::text FROM authz.role_permission UNION ALL
      SELECT 'principal_group',count(*)::text FROM authz.principal_group UNION ALL
      SELECT 'group_member',count(*)::text FROM authz.group_member UNION ALL
      SELECT 'group_role',count(*)::text FROM authz.group_role UNION ALL
      SELECT 'deny_rule',count(*)::text FROM authz.deny_rule UNION ALL
      SELECT 'delegation',count(*)::text FROM authz.delegation UNION ALL
      SELECT 'delegation_grant',count(*)::text FROM authz.delegation_grant UNION ALL
      SELECT 'override',count(*)::text FROM authz.override UNION ALL
      SELECT 'record_acl',count(*)::text FROM authz.record_acl UNION ALL
      SELECT 'entity_operation_binding',count(*)::text FROM authz.entity_operation_binding UNION ALL
      SELECT 'entity_operation_scope_binding',count(*)::text FROM authz.entity_operation_scope_binding
    ) counts ORDER BY relation
  `);
  removed = Object.fromEntries(before.rows.map((row) => [row.relation, Number(row.count)]));
  await client.query(`
    TRUNCATE TABLE
      authz.entity_operation_scope_binding,
      authz.entity_operation_binding,
      authz.record_acl,
      authz.override,
      authz.delegation_grant,
      authz.delegation,
      authz.deny_rule,
      authz.group_role,
      authz.group_member,
      authz.principal_group,
      authz.role_permission,
      authz.role,
      authz.permission_scope_kind,
      authz.permission
  `);
  const principalInvalidation = await client.query(`
    UPDATE master.principal
       SET auth_epoch = auth_epoch + 1,
           updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  `);
  invalidatedPrincipalCount = principalInvalidation.rowCount ?? 0;
  const tenantInvalidation = await client.query<{ tenant_id: string }>(`
    SELECT tenant.id::text AS tenant_id
      FROM master.tenant AS tenant
      CROSS JOIN LATERAL event.fn_authorization_bump_epoch('plane', tenant.id, $1) AS epoch
     ORDER BY tenant.id
  `, [plane]);
  invalidatedTenantCount = tenantInvalidation.rowCount ?? 0;
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

const applied = await applyAuthorizationSeedPack({ plane, databaseUrl });
const verification = new pg.Client({ connectionString: databaseUrl, application_name: `authorization-clean-slate-verify-${plane}` });
await verification.connect();
try {
  const result = await verification.query<{
    permissions: string;
    roles: string;
    role_permissions: string;
    groups: string;
    non_quarantine_groups: string;
    group_roles: string;
    runtime_authority: string;
    operation_bindings: string;
  }>(`SELECT
    (SELECT count(*) FROM authz.permission WHERE status='published')::text permissions,
    (SELECT count(*) FROM authz.role)::text roles,
    (SELECT count(*) FROM authz.role_permission)::text role_permissions,
    (SELECT count(*) FROM authz.principal_group)::text groups,
    (SELECT count(*) FROM authz.principal_group WHERE code<>$1)::text non_quarantine_groups,
    (SELECT count(*) FROM authz.group_role)::text group_roles,
    ((SELECT count(*) FROM authz.deny_rule)+(SELECT count(*) FROM authz.delegation)
      +(SELECT count(*) FROM authz.override)+(SELECT count(*) FROM authz.record_acl))::text runtime_authority,
    (SELECT count(*) FROM authz.entity_operation_binding)::text operation_bindings`,
    [`${plane}.access.quarantine`]);
  const row = result.rows[0]!;
  if (Number(row.roles) !== 0 || Number(row.role_permissions) !== 0 || Number(row.group_roles) !== 0
      || Number(row.runtime_authority) !== 0 || Number(row.operation_bindings) !== 0
      || Number(row.non_quarantine_groups) !== 0) {
    throw new Error(`${plane} clean-slate postcondition failed`);
  }
  process.stdout.write(`${JSON.stringify({
    contractVersion: "athyper.authorization.clean-slate-reset-receipt.v1",
    plane,
    database: approval.expectedDatabase,
    removed,
    invalidatedPrincipalCount,
    invalidatedTenantCount,
    externalSessionRevocationRequired: true,
    applied,
    postcondition: row,
  }, null, 2)}\n`);
} finally {
  await verification.end();
}

function option(name: string): string | undefined {
  return args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1).trim();
}
