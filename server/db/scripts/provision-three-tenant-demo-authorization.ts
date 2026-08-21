#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { deterministicUuid, loadProvisionInputs, type ProvisionInputs } from "./provisioning/three-plane-model.js";
import type { ProvisionPlane } from "./safe-provision.js";

const CONFIRMATION = "LOCAL-THREE-TENANT-DEMO-AUTH";
const SOURCE_REF = "local-demo:three-tenant-authorization:v1";
const PERMISSIONS = {
  neon: "neon.context.catalog.read",
  mesh: "mesh.catalog.network_account.read",
  studio: "studio.platform.catalog.view",
} as const;
const PRIMARY_TENANT_ADMINS: Record<string, string> = {
  athyper: "athyper.admin",
  technostat: "tksa.admin",
  cirrusatlantic: "catl.admin",
};

type Scope = { kind: "tenant" | "legal_entity" | "company_code" | "operating_organization" | "network_account"; key: string; propagation: "exact" | "subtree" };
type Grant = { tenantCode: string; subjectId: string; username: string; scopes: Scope[] };
type QueryClient = Pick<Client, "query">;

export async function buildThreeTenantDemoAuthorization(providedInputs?: ProvisionInputs): Promise<Record<ProvisionPlane, Grant[]>> {
  const inputs = providedInputs ?? await loadProvisionInputs();
  const users = new Map(inputs.identitySource.users.map((user) => [user.id, user] as const));
  const grants: Record<ProvisionPlane, Map<string, Grant>> = { neon: new Map(), mesh: new Map(), studio: new Map() };
  const add = (plane: ProvisionPlane, tenantCode: string, subjectId: string, username: string, scope: Scope): void => {
    const coordinate = `${tenantCode}:${subjectId}`;
    const current = grants[plane].get(coordinate) ?? { tenantCode, subjectId, username, scopes: [] };
    if (!current.scopes.some((item) => item.kind === scope.kind && item.key === scope.key && item.propagation === scope.propagation)) current.scopes.push(scope);
    grants[plane].set(coordinate, current);
  };
  const scenarios = inputs.scenarioPacks;
  for (const organization of inputs.identitySource.organizations ?? []) {
    const tenantCode = organization.attributes?.tenant_code?.[0];
    const scenario = tenantCode ? scenarios[tenantCode] : undefined;
    const entity = scenario?.legalEntities.find((item) => item.scopeKey === organization.alias);
    if (!tenantCode || !scenario || !entity) continue;
    const companies = scenario.companyCodes.filter((item) => item.legalEntityScopeKey === entity.scopeKey);
    for (const member of organization.members ?? []) {
      const identity = users.get(member.id);
      if (identity?.realmRoles?.includes("NEON_USER")) {
        add("neon", tenantCode, member.id, member.username, { kind: "legal_entity", key: `legal_entity:${entity.code}`, propagation: "exact" });
        for (const company of companies) add("neon", tenantCode, member.id, member.username, { kind: "company_code", key: `company_code:${company.code}`, propagation: "exact" });
      }
      if (identity?.realmRoles?.includes("MESH_BUYER_USER")) {
        for (const key of organization.attributes?.buyer_account_code ?? []) add("mesh", tenantCode, member.id, member.username, { kind: "network_account", key: key.toLowerCase(), propagation: "exact" });
      }
      if (identity?.realmRoles?.includes("MESH_PARTNER_USER")) {
        for (const key of organization.attributes?.supplier_account_code ?? []) add("mesh", tenantCode, member.id, member.username, { kind: "network_account", key: key.toLowerCase(), propagation: "exact" });
      }
    }
  }
  for (const [tenantCode, scenario] of Object.entries(scenarios)) {
    const tenant = inputs.manifest.tenants.find((item) => item.code === tenantCode)!;
    const functionalUsers = inputs.identitySource.users.filter((user) => user.attributes?.tenant_code?.includes(tenantCode)
      && user.attributes?.identity_scope?.includes("operating_organization"));
    for (const identity of functionalUsers) {
      const domain = identity.attributes?.persona?.[0]?.replace(/^regional_/, "").replace(/^shared_/, "");
      const region = identity.username.split(".")[1];
      for (const organization of scenario.operatingOrganizations.filter((item) => item.domain === domain
        && (!item.regionCode || item.regionCode === region))) {
        add("neon", tenantCode, identity.id, identity.username, { kind: "operating_organization", key: `operating_organization:${organization.code}`, propagation: "subtree" });
        for (const edge of scenario.operatingOrganizationCompanyAssignments.filter((item) => item.organizationCode === organization.code)) {
          add("neon", tenantCode, identity.id, identity.username, { kind: "company_code", key: `company_code:${edge.companyCode}`, propagation: "exact" });
          const company = scenario.companyCodes.find((item) => item.code === edge.companyCode)!;
          const entity = scenario.legalEntities.find((item) => item.scopeKey === company.legalEntityScopeKey)!;
          add("neon", tenantCode, identity.id, identity.username, { kind: "legal_entity", key: `legal_entity:${entity.code}`, propagation: "exact" });
        }
      }
    }
    const adminName = PRIMARY_TENANT_ADMINS[tenantCode];
    const admin = inputs.identitySource.users.find((user) => user.username === adminName);
    if (!admin) throw new Error(`missing tenant admin ${tenantCode}/${adminName}`);
    add("neon", tenantCode, admin.id, admin.username, { kind: "tenant", key: tenantCode, propagation: "exact" });
    for (const organization of scenario.operatingOrganizations) add("neon", tenantCode, admin.id, admin.username, { kind: "operating_organization", key: `operating_organization:${organization.code}`, propagation: "subtree" });
    const studioAdmins = inputs.identitySource.studioTenantAdmins?.find((entry) => entry.tenantCode === tenantCode)?.usernames;
    if (!studioAdmins?.length) throw new Error(`missing explicit Studio tenant admins for ${tenantCode}`);
    for (const username of studioAdmins) {
      const studioAdmin = inputs.identitySource.users.find((user) => user.username === username);
      if (!studioAdmin) throw new Error(`missing Studio tenant admin ${tenantCode}/${username}`);
      if (!studioAdmin.realmRoles?.includes("STUDIO_USER") || !studioAdmin.clientRoles?.["studio-web"]?.includes("AUTHORIZED")) {
        throw new Error(`Studio tenant admin lacks Keycloak admission ${tenantCode}/${username}`);
      }
      add("studio", tenantCode, studioAdmin.id, studioAdmin.username, { kind: "tenant", key: tenantCode, propagation: "exact" });
    }
    if (tenant.keycloakOrganizationAlias !== tenant.id) throw new Error(`tenant identity mismatch: ${tenantCode}`);
  }
  return Object.fromEntries(Object.entries(grants).map(([plane, values]) => [plane,
    [...values.values()].filter((grant) => grant.scopes.length > 0).map((grant) => ({ ...grant, scopes: [...grant.scopes].sort(scopeOrder) })).sort((a, b) => `${a.tenantCode}:${a.username}`.localeCompare(`${b.tenantCode}:${b.username}`)),
  ])) as Record<ProvisionPlane, Grant[]>;
}

export async function provisionThreeTenantDemoAuthorization(options: {
  urls: Record<ProvisionPlane, string>;
  confirmation?: string;
  dryRun?: boolean;
}): Promise<unknown> {
  const inputs = await loadProvisionInputs();
  const model = await buildThreeTenantDemoAuthorization(inputs);
  if (options.dryRun) return Object.fromEntries(Object.entries(model).map(([plane, grants]) => [plane, { users: grants.length, scopes: grants.reduce((sum, grant) => sum + grant.scopes.length, 0) }]));
  if (options.confirmation !== CONFIRMATION) throw new Error(`apply requires --confirm=${CONFIRMATION}`);
  const results: Record<string, unknown> = {};
  for (const plane of ["neon", "mesh", "studio"] as const) results[plane] = await applyPlane(options.urls[plane], plane, inputs, model[plane]);
  return { mode: "applied", sourceRef: SOURCE_REF, memberCompaniesPropagation: false, planes: results };
}

async function applyPlane(urlValue: string, plane: ProvisionPlane, inputs: ProvisionInputs, grants: Grant[]): Promise<unknown> {
  const url = new URL(urlValue);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.pathname !== `/athyper_${plane}`) throw new Error(`${plane} demo authorization requires local athyper_${plane}`);
  const client = new Client({ connectionString: urlValue });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${SOURCE_REF}:${plane}`]);
    const permissionId = (await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.permission WHERE canonical_code=$1 AND status='published'", [PERMISSIONS[plane]])).id;
    for (const tenant of inputs.manifest.tenants) {
      const actorId = (await one<{ id: string }>(client, "SELECT id::text AS id FROM master.principal WHERE tenant_id=$1::uuid AND code='seed.three-plane-provisioner' AND status='active'", [tenant.id])).id;
      await client.query("SELECT set_config('app.database_plane',$1,true),set_config('app.current_tenant_id',$2,true),set_config('app.current_principal_id',$3,true)", [plane, tenant.id, actorId]);
      if (plane === "neon") await ensureNeonScopes(client, inputs, tenant.code, tenant.id, actorId);
      const roleId = await ensureRole(client, plane, tenant.id, permissionId, actorId);
      for (const grant of grants.filter((item) => item.tenantCode === tenant.code)) await ensureGrant(client, plane, tenant.id, roleId, actorId, grant);
    }
    await client.query("COMMIT");
    return { users: grants.length, scopeAssignments: grants.reduce((sum, grant) => sum + grant.scopes.length, 0) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

async function ensureNeonScopes(client: QueryClient, inputs: ProvisionInputs, tenantCode: string, tenantId: string, actorId: string): Promise<void> {
  const scenario = inputs.scenarioPacks[tenantCode]!;
  const tenantScope = (await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind='tenant' AND status='active'", [tenantId])).id;
  for (const company of scenario.companyCodes) {
    const target = await one<{ id: string; name: string }>(client, "SELECT id::text AS id,name FROM master.company_code WHERE tenant_id=$1::uuid AND code=$2 AND status='active'", [tenantId, company.code]);
    const entity = scenario.legalEntities.find((item) => item.scopeKey === company.legalEntityScopeKey)!;
    const parent = await one<{ id: string }>(client, "SELECT id::text AS id FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind='legal_entity' AND scope_key=$2 AND status='active'", [tenantId, `legal_entity:${entity.code}`]);
    await upsertScope(client, tenantId, "company_code", `company_code:${company.code}`, target.id, parent.id, target.name, actorId);
  }
  for (const organization of scenario.operatingOrganizations) {
    const target = await one<{ id: string; name: string }>(client, "SELECT id::text AS id,name FROM master.operating_organization WHERE tenant_id=$1::uuid AND code=$2 AND status='active'", [tenantId, organization.code]);
    await upsertScope(client, tenantId, "operating_organization", `operating_organization:${organization.code}`, target.id, tenantScope, target.name, actorId);
  }
}

async function upsertScope(client: QueryClient, tenantId: string, kind: Scope["kind"], key: string, targetId: string, parentId: string, name: string, actorId: string): Promise<void> {
  await client.query(`INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by)
    VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7,$8::jsonb,'active',$9::uuid)
    ON CONFLICT(tenant_id,scope_kind,target_id) DO UPDATE SET display_name=EXCLUDED.display_name,status='active',updated_by=EXCLUDED.created_by
    WHERE authz.scope_target.display_name IS DISTINCT FROM EXCLUDED.display_name OR authz.scope_target.status IS DISTINCT FROM 'active'`,
  [deterministicUuid("demo-auth", tenantId, kind, key), tenantId, kind, key, targetId, parentId, name, metadata(), actorId]);
}

async function ensureRole(client: QueryClient, plane: ProvisionPlane, tenantId: string, permissionId: string, actorId: string): Promise<string> {
  const code = `demo.${plane}.context-reader`;
  const id = deterministicUuid("demo-auth", plane, tenantId, "role", code);
  await client.query(`INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
    VALUES($1::uuid,$2::uuid,$3,$4,'Local demo scoped catalog visibility','system','seed',$5,$6::jsonb,'draft',$7::uuid) ON CONFLICT(tenant_id,code) DO NOTHING`,
  [id, tenantId, code, `Demo ${plane} context reader`, SOURCE_REF, metadata(), actorId]);
  const actual = await one<{ id: string; sourceRef: string; status: string }>(client, "SELECT id::text AS id,source_ref AS \"sourceRef\",status FROM authz.role WHERE tenant_id=$1::uuid AND code=$2", [tenantId, code]);
  if (actual.id !== id || actual.sourceRef !== SOURCE_REF) throw new Error(`conflicting demo role ${tenantId}/${code}`);
  if (actual.status === "active") await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid", [tenantId, id, actorId]);
  await client.query("INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING",
    [deterministicUuid("demo-auth", plane, tenantId, "role-permission", PERMISSIONS[plane]), tenantId, id, permissionId, actorId]);
  await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [tenantId, id, actorId]);
  return id;
}

async function ensureGrant(client: QueryClient, plane: ProvisionPlane, tenantId: string, roleId: string, actorId: string, grant: Grant): Promise<void> {
  const principal = await one<{ id: string }>(client, `SELECT binding.principal_id::text AS id FROM master.principal_identity_binding binding
    JOIN authz.plane_membership membership ON membership.tenant_id=binding.tenant_id AND membership.principal_id=binding.principal_id AND membership.status='active'
    WHERE binding.tenant_id=$1::uuid AND binding.provider_code='keycloak' AND binding.subject_id=$2 AND binding.status='active'`, [tenantId, grant.subjectId]);
  const groupCode = `demo.${plane}.${grant.username}`;
  const groupId = deterministicUuid("demo-auth", plane, tenantId, "group", grant.subjectId);
  await client.query(`INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by)
    VALUES($1::uuid,$2::uuid,$3,$4,'system','seed',$5,$6::jsonb,'active',$7::uuid) ON CONFLICT(tenant_id,code) DO NOTHING`,
  [groupId, tenantId, groupCode, `Demo ${grant.username}`, SOURCE_REF, metadata(), actorId]);
  await client.query(`INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'seed',$5,$6::jsonb,'active',$7::uuid)
    ON CONFLICT(id) DO UPDATE SET status='active',effective_until=NULL,updated_by=EXCLUDED.created_by`,
  [deterministicUuid("demo-auth", plane, tenantId, "member", grant.subjectId), tenantId, groupId, principal.id, SOURCE_REF, metadata(), actorId]);
  for (const scope of grant.scopes) {
    const targetResult = await client.query<{ id: string }>("SELECT id::text AS id FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind=$2 AND scope_key=$3 AND status='active'", [tenantId, scope.kind, scope.key]);
    const target = targetResult.rows[0];
    if (!target || targetResult.rows.length !== 1) throw new Error(`missing scope target ${plane}/${grant.tenantCode}/${grant.username}/${scope.kind}/${scope.key}`);
    await client.query(`INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'seed',$7,$8::jsonb,'active',$9::uuid)
      ON CONFLICT(id) DO UPDATE SET status='active',effective_until=NULL,updated_by=EXCLUDED.created_by`,
    [deterministicUuid("demo-auth", plane, tenantId, "grant", grant.subjectId, scope.kind, scope.key), tenantId, groupId, roleId, target.id, scope.propagation, SOURCE_REF, metadata(), actorId]);
  }
}

function metadata(): string { return JSON.stringify({ managedBy: SOURCE_REF, environment: "disposable_local", memberCompaniesPropagation: false }); }
function scopeOrder(a: Scope, b: Scope): number { return `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`); }
async function one<T extends object>(client: QueryClient, sql: string, values: unknown[] = []): Promise<T> { const result = await client.query<T>(sql, values); if (result.rows.length !== 1) throw new Error(`expected one row, received ${result.rows.length}`); return result.rows[0]!; }
function option(args: string[], name: string): string | undefined { const equal = args.find((item) => item.startsWith(`${name}=`)); if (equal) return equal.slice(name.length + 1); const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
function url(args: string[], plane: ProvisionPlane): string { const value = option(args, `--${plane}-database-url`) ?? process.env[`ATHYPER_${plane.toUpperCase()}_DATABASE_ADMIN_URL`]; if (!value) throw new Error(`set ATHYPER_${plane.toUpperCase()}_DATABASE_ADMIN_URL`); return value; }
async function main(): Promise<void> { const args = process.argv.slice(2); const result = await provisionThreeTenantDemoAuthorization({ urls: { neon: url(args, "neon"), mesh: url(args, "mesh"), studio: url(args, "studio") }, confirmation: option(args, "--confirm"), dryRun: args.includes("--plan") || args.includes("--dry-run") }); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
