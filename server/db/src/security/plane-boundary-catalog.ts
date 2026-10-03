import type { DefinerContract } from "./security-definer-contract.js";
import { expectedDefinerOwner, trustedDefinerSchemas } from "./security-definer-contract.js";

export type CatalogQuery = <Row extends object>(statement: string) => Promise<Row[]>;
export interface DefinerRow {
  schema: string; identity: string; signature: string; owner: string;
  publicExecute: boolean; searchPath: string | null; rowSecurityOff: boolean;
}
export interface RoleRow {
  name: string; superuser: boolean; bypassRls: boolean; login: boolean;
  createDb: boolean; createRole: boolean; replication: boolean; inherit: boolean;
}
export interface MembershipRow { root: string; role: string; path: string[]; settable: boolean; inheritable: boolean; administrable?: boolean }
export interface TableRow {
  relation: string; partition: boolean; tenantColumns: string[]; rlsEnabled: boolean; rlsForced: boolean;
  policies: { name: string; command: string; roles: string[]; using: string | null; check: string | null }[];
  runtimeSelect: boolean; workerSelect: boolean; runtimeWrite: boolean; workerWrite: boolean;
}
export const boundaryCatalogQueries = {
  identity: "SELECT current_database() AS database, session_user AS login, current_user AS role, current_setting('server_version') AS version",
  functions: `SELECT n.nspname AS schema,
    n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS identity,
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature,
    r.rolname AS owner, EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS "publicExecute",
    (SELECT cfg FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%' LIMIT 1) AS "searchPath",
    'row_security=off' = ANY(COALESCE(p.proconfig,ARRAY[]::text[])) AS "rowSecurityOff"
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.prosecdef AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY n.nspname,p.proname,oidvectortypes(p.proargtypes)`,
  roles: `SELECT rolname AS name,rolsuper AS superuser,rolbypassrls AS "bypassRls",rolcanlogin AS login,
    rolcreatedb AS "createDb",rolcreaterole AS "createRole",rolreplication AS replication,rolinherit AS inherit FROM pg_roles ORDER BY rolname`,
  memberships: `WITH RECURSIVE reach AS (
    SELECT r.oid AS root,r.oid AS role,ARRAY[r.rolname::text] AS path,true AS settable,true AS inheritable,false AS administrable
    FROM pg_roles r WHERE r.rolname IN ('athyper_runtime','athyper_worker') OR r.rolname LIKE 'athyper_definer_%' OR r.rolname LIKE 'athyper_bypass_%'
      OR r.rolname IN ('athyper_projection_owner','athyper_publication_recovery_owner','athyper_identity_resolver_owner')
    UNION ALL
    SELECT reach.root,m.roleid,reach.path || parent.rolname::text,
      (reach.settable OR reach.administrable) AND m.set_option,
      (reach.inheritable OR reach.settable OR reach.administrable) AND m.inherit_option,
      (reach.settable OR reach.inheritable OR reach.administrable) AND m.admin_option
    FROM reach JOIN pg_auth_members m ON m.member=reach.role JOIN pg_roles parent ON parent.oid=m.roleid
    WHERE NOT parent.rolname::text = ANY(reach.path)
  ) SELECT root.rolname AS root,parent.rolname AS role,reach.path,reach.settable,reach.inheritable,reach.administrable
    FROM reach JOIN pg_roles root ON root.oid=reach.root JOIN pg_roles parent ON parent.oid=reach.role WHERE root.oid<>parent.oid
    ORDER BY root.rolname,array_length(reach.path,1),parent.rolname`,
  tables: `SELECT n.nspname||'.'||c.relname AS relation,c.relispartition AS partition,
    ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND NOT a.attisdropped AND a.attnum>0
      AND (a.attname='tenant_id' OR a.attname LIKE '%\\_tenant_id' ESCAPE '\\') ORDER BY a.attname) AS "tenantColumns",
    c.relrowsecurity AS "rlsEnabled",c.relforcerowsecurity AS "rlsForced",
    COALESCE((SELECT json_agg(json_build_object('name',p.polname,'command',p.polcmd,'roles',ARRAY(SELECT CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE (SELECT rolname::text FROM pg_roles WHERE oid=role_oid) END FROM unnest(p.polroles) role_oid),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::json) AS policies,
    CASE WHEN to_regrole('athyper_runtime') IS NULL THEN false ELSE has_any_column_privilege('athyper_runtime',c.oid,'SELECT') END AS "runtimeSelect",
    CASE WHEN to_regrole('athyper_worker') IS NULL THEN false ELSE has_any_column_privilege('athyper_worker',c.oid,'SELECT') END AS "workerSelect",
    CASE WHEN to_regrole('athyper_runtime') IS NULL THEN false ELSE has_table_privilege('athyper_runtime',c.oid,'INSERT,UPDATE,DELETE') OR has_any_column_privilege('athyper_runtime',c.oid,'INSERT,UPDATE') END AS "runtimeWrite",
    CASE WHEN to_regrole('athyper_worker') IS NULL THEN false ELSE has_table_privilege('athyper_worker',c.oid,'INSERT,UPDATE,DELETE') OR has_any_column_privilege('athyper_worker',c.oid,'INSERT,UPDATE') END AS "workerWrite"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p')
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY n.nspname,c.relname`,
  tableGrants: `SELECT r.rolname AS role,n.nspname||'.'||c.relname AS relation,acl.privilege_type AS privilege,acl.is_grantable AS grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles r ON r.oid=acl.grantee
    WHERE (r.rolname LIKE 'athyper_definer_%' OR r.rolname LIKE 'athyper_bypass_%' OR r.rolname='athyper_identity_resolver_owner') AND n.nspname NOT LIKE 'pg_%' ORDER BY r.rolname,n.nspname,c.relname,acl.privilege_type`,
  schemaCreate: `SELECT r.rolname AS role,n.nspname AS schema FROM pg_roles r CROSS JOIN pg_namespace n
    WHERE (r.rolname LIKE 'athyper_definer_%' OR r.rolname LIKE 'athyper_bypass_%' OR r.rolname='athyper_identity_resolver_owner') AND n.nspname NOT LIKE 'pg_%'
      AND n.nspname<>'information_schema' AND has_schema_privilege(r.oid,n.oid,'CREATE')`,
  relations: `SELECT n.nspname||'.'||c.relname AS relation FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'`,
  routineGrants: `SELECT r.rolname AS role,n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS identity,
    p.proowner=r.oid AS owned,acl.is_grantable AS grantable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl JOIN pg_roles r ON r.oid=acl.grantee
    WHERE (r.rolname LIKE 'athyper_definer_%' OR r.rolname LIKE 'athyper_bypass_%' OR r.rolname='athyper_identity_resolver_owner')
      AND acl.privilege_type='EXECUTE' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'`,
  routines: `SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS identity,r.rolname AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.prokind IN ('f','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'`,
};

export function definerCatalogErrors(functions: readonly DefinerRow[], roles: readonly RoleRow[], contract: DefinerContract, ddlOwner: string): string[] {
  const errors: string[] = [];
  if (!functions.length) errors.push("No application SECURITY DEFINER functions found");
  for (const fn of functions) {
    try {
      const owner = expectedDefinerOwner(contract, fn.schema, fn.identity, fn.rowSecurityOff, ddlOwner);
      if (fn.owner !== owner) errors.push(`${fn.identity}: owner=${fn.owner}; expected=${owner}`);
    } catch (error) { errors.push(String(error instanceof Error ? error.message : error)); }
    if (fn.publicExecute) errors.push(`${fn.identity}: PUBLIC has EXECUTE`);
    const path = fn.searchPath?.replace(/^search_path=/, "").split(",").map(value => value.trim().replace(/^"|"$/g, ""));
    if (!path || path[0] !== "pg_catalog" || path.at(-1) !== "pg_temp" ||
        new Set(path).size !== path.length || path.slice(1, -1).some(schema => !trustedDefinerSchemas(contract).includes(schema)))
      errors.push(`${fn.identity}: search_path requires pg_catalog first, trusted schemas, and pg_temp last`);
  }
  const required = new Map(contract.roles.map(role => [role.name, role.bypassRls]));
  for (const name of ["athyper_projection_owner", "athyper_publication_recovery_owner"]) {
    if (contract.exceptions.some(entry => entry.owner === name && functions.some(fn => fn.identity === entry.signature))) required.set(name, false);
  }
  for (const [name, bypass] of required) {
    const role = roles.find(role => role.name === name);
    if (!role || role.superuser || role.login || role.createDb || role.createRole || role.replication || role.bypassRls !== bypass)
      errors.push(`${name}: must be a non-login, non-administrative ${bypass ? "explicit BYPASSRLS" : "RLS-bound"} owner`);
  }
  return errors;
}

export function runtimeRoleErrors(roles: readonly RoleRow[], memberships: readonly MembershipRow[], protectedOwners: readonly string[]): string[] {
  const errors: string[] = [];
  const dangerous = new Set(["pg_execute_server_program", "pg_read_server_files", "pg_write_server_files", "pg_signal_backend", "pg_checkpoint"]);
  const protectedRoles = new Set([...protectedOwners, "athyper_projection_owner", "athyper_publication_recovery_owner"]);
  for (const name of ["athyper_runtime", "athyper_worker"]) {
    const role = roles.find(role => role.name === name);
    if (!role || !role.login || role.superuser || role.bypassRls || role.createDb || role.createRole || role.replication)
      errors.push(`${name}: must be a non-administrative NOSUPERUSER/NOBYPASSRLS login`);
    for (const membership of memberships.filter(row => row.root === name)) {
      const parent = roles.find(role => role.name === membership.role);
      if ((membership.settable || membership.inheritable || membership.administrable) && (protectedRoles.has(membership.role) || dangerous.has(membership.role) || parent?.superuser || parent?.bypassRls || parent?.createRole || parent?.createDb || parent?.replication))
        errors.push(`${name}: unsafe effective membership ${membership.path.join(" -> ")}`);
    }
  }
  for (const membership of memberships.filter(row => protectedRoles.has(row.root)))
    errors.push(`${membership.root}: owner must not have a role membership (${membership.path.join(" -> ")})`);
  return errors;
}

export function rlsCatalogErrors(tables: readonly TableRow[]): string[] {
  const errors: string[] = [];
  if (!tables.some(table => table.tenantColumns.length && !table.partition)) errors.push("No tenant-scoped table parents found");
  for (const table of tables) {
    if (!table.tenantColumns.length) continue;
    if (table.partition && !table.runtimeSelect && !table.workerSelect && !table.runtimeWrite && !table.workerWrite) continue;
    const directlyAccessible = table.runtimeSelect || table.workerSelect || table.runtimeWrite || table.workerWrite;
    // An inaccessible table with no policies is explicitly denied by PostgreSQL RLS.
    if (!table.rlsEnabled || !table.rlsForced || (!table.policies.length && directlyAccessible))
      errors.push(`${table.relation}: ${table.partition ? "directly accessible partition" : "tenant-scoped table"} requires ENABLE/FORCE RLS and policies`);
  }
  return errors;
}

export async function inspectPlaneBoundary(query: CatalogQuery, contract: DefinerContract, ddlOwner = "postgres") {
  const [identity] = await query<{ database: string; login: string; role: string; version: string }>(boundaryCatalogQueries.identity);
  const functions = await query<DefinerRow>(boundaryCatalogQueries.functions);
  const roles = await query<RoleRow>(boundaryCatalogQueries.roles);
  const memberships = await query<MembershipRow>(boundaryCatalogQueries.memberships);
  const tables = await query<TableRow>(boundaryCatalogQueries.tables);
  const grants = await query<{ role: string; relation: string; privilege: string; grantable: boolean }>(boundaryCatalogQueries.tableGrants);
  const schemaCreate = await query<{ role: string; schema: string }>(boundaryCatalogQueries.schemaCreate);
  const relations = new Set((await query<{relation:string}>(boundaryCatalogQueries.relations)).map(row => row.relation));
  const routineGrants = await query<{role:string;identity:string;owned:boolean;grantable:boolean}>(boundaryCatalogQueries.routineGrants);
  const routines = await query<{identity:string;owner:string}>(boundaryCatalogQueries.routines);
  const errors = [...definerCatalogErrors(functions, roles, contract, ddlOwner), ...runtimeRoleErrors(roles, memberships, contract.roles.map(role => role.name)), ...rlsCatalogErrors(tables)];
  for (const grant of grants) {
    const relation = contract.roles.find(role => role.name === grant.role)?.tables.find(table => table.relation === grant.relation);
    if (!relation?.privileges.includes(grant.privilege) || grant.grantable)
      errors.push(`${grant.role}: undeclared or grantable ${grant.privilege} on ${grant.relation}`);
  }
  for (const row of schemaCreate) errors.push(`${row.role}: unexpected CREATE on schema ${row.schema}`);
  for (const grant of routineGrants) {
    if (!grant.owned && (grant.grantable || !contract.roles.find(role => role.name === grant.role)?.functions.includes(grant.identity)))
      errors.push(`${grant.role}: undeclared or grantable EXECUTE on ${grant.identity}`);
  }
  for (const role of contract.roles) {
    for (const table of role.tables) {
      if (!relations.has(table.relation)) continue;
      for (const privilege of table.privileges)
        if (!grants.some(grant => grant.role===role.name && grant.relation===table.relation && grant.privilege===privilege))
          errors.push(`${role.name}: missing ${privilege} on ${table.relation}`);
    }
    for (const identity of role.functions) {
      const routine = routines.find(routine => routine.identity===identity);
      if (routine && routine.owner!==role.name && !routineGrants.some(grant => grant.role===role.name && grant.identity===identity))
        errors.push(`${role.name}: missing EXECUTE on ${identity}`);
    }
    for (const relation of role.tenantReadPolicies ?? []) {
      const table = tables.find(table => table.relation===relation);
      if (table && !table.policies.some(policy => policy.name===`${role.name}_tenant_read` && policy.command==='r' && policy.roles.length===1 && policy.roles[0]===role.name &&
          policy.using === '(tenant_id = shared.current_tenant_id_soft())' && policy.check===null))
        errors.push(`${role.name}: missing or weakened tenant-read policy on ${relation}`);
    }
    for (const [index,expected] of (role.policies ?? []).entries()) {
      const table = tables.find(table => table.relation===expected.relation);
      const command = {ALL:'*',SELECT:'r',INSERT:'a',UPDATE:'w',DELETE:'d'}[expected.command];
      if (table && !table.policies.some(policy => policy.name===`${role.name}_p_${index}` && policy.command===command && policy.roles.length===1 && policy.roles[0]===role.name &&
          policy.using===(expected.using ?? null) && policy.check===(expected.check ?? null)))
        errors.push(`${role.name}: missing or changed owner policy on ${expected.relation} (${expected.command})`);
    }
    for (const table of tables) {
      const expectedNames = new Set((role.policies ?? []).flatMap((policy,index) => policy.relation===table.relation ? [`${role.name}_p_${index}`] : []));
      if (role.tenantReadPolicies?.includes(table.relation)) expectedNames.add(`${role.name}_tenant_read`);
      for (const policy of table.policies.filter(policy => policy.roles.includes(role.name)))
        if (!expectedNames.has(policy.name)) errors.push(`${role.name}: undeclared owner policy ${policy.name} on ${table.relation}`);
    }
  }
  return {
    identity, catalogQualified: errors.length === 0, isolationQualified: false,
    qualificationLimit: "Catalog and role checks do not establish policy correctness, API ingress isolation, or complete cross-tenant runtime behavior.",
    counts: {
      definers: functions.length, explicitBypass: functions.filter(fn => fn.rowSecurityOff).length,
      elevatedDefiners: functions.filter(fn => roles.find(role => role.name === fn.owner)?.bypassRls || roles.find(role => role.name === fn.owner)?.superuser).length,
      rlsEnabled: tables.filter(table => table.rlsEnabled).length, rlsForced: tables.filter(table => table.rlsForced).length,
      tenantParents: tables.filter(table => table.tenantColumns.length && !table.partition).length,
      tenantPartitions: tables.filter(table => table.tenantColumns.length && table.partition).length,
    },
    errors, functions, tables, roles: roles.filter(role => role.name.startsWith("athyper") || role.name === ddlOwner), memberships,
  };
}
