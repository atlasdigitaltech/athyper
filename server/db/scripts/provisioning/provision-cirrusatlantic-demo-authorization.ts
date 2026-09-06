#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { deterministicUuid } from "./three-plane-model.js";
import {
  CIRRUSATLANTIC_BANK_CHECKER,
  CIRRUSATLANTIC_CONTEXT_PERMISSION,
  CIRRUSATLANTIC_DEMO_AUTH_CONFIRMATION,
  CIRRUSATLANTIC_DEMO_PERSONAS,
  CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK,
  CIRRUSATLANTIC_OWNER_REVIEWER,
  CIRRUSATLANTIC_TENANT_CODE,
  CIRRUSATLANTIC_TENANT_ID,
  validateCirrusAtlanticDemoAuthorizationModel,
  type DemoPersona,
  type DemoScopeCoordinate,
} from "./cirrusatlantic-demo-authorization-model.js";

const SOURCE_REF = "local-demo:cirrusatlantic-authorization:v1";
const EXPECTED_DATABASE = "athyper_neon";

type QueryClient = Pick<Client, "query">;

export async function provisionCirrusAtlanticDemoAuthorization(options: {
  databaseUrl: string;
  confirm?: string;
  dryRun?: boolean;
}): Promise<unknown> {
  validateCirrusAtlanticDemoAuthorizationModel();
  assertLocalDatabaseUrl(options.databaseUrl);
  const plan = {
    plane: "neon",
    tenantId: CIRRUSATLANTIC_TENANT_ID,
    tenantCode: CIRRUSATLANTIC_TENANT_CODE,
    permission: CIRRUSATLANTIC_CONTEXT_PERMISSION,
    users: CIRRUSATLANTIC_DEMO_PERSONAS.map((persona) => ({ username: persona.username, scopes: persona.scopes })),
    memberCompaniesPropagation: false,
    mode: options.dryRun ? "plan" : "apply",
  } as const;
  if (options.dryRun) return plan;
  if (options.confirm !== CIRRUSATLANTIC_DEMO_AUTH_CONFIRMATION) {
    throw new Error(`apply requires --confirm=${CIRRUSATLANTIC_DEMO_AUTH_CONFIRMATION}`);
  }

  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [SOURCE_REF]);
    const actorId = await assertFoundation(client);
    await client.query(
      "SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
      [CIRRUSATLANTIC_TENANT_ID, actorId],
    );
    const permissionId = await requireCatalogPermission(client);
    const scopes = await requireAndCompleteScopes(client, actorId);
    for (const persona of CIRRUSATLANTIC_DEMO_PERSONAS) {
      const principalId = await requirePrincipal(client, persona);
      const roleId = await ensureRole(client, persona, permissionId, actorId);
      const groupId = await ensureGroup(client, persona, actorId);
      await ensureMembership(client, persona, principalId, groupId, actorId);
      for (const scope of persona.scopes) {
        const targetId = scopes.get(`${scope.kind}/${scope.key}`);
        if (!targetId) throw new Error(`unresolved scope target: ${scope.kind}/${scope.key}`);
        await ensureGroupRole(client, persona, groupId, roleId, targetId, scope, actorId);
      }
    }
    await ensureOwnerReviewer(client, scopes, actorId);
    await ensureOwnerBankChecker(client, scopes, actorId);
    await ensureNorthwindAccountLink(client, scopes, actorId);
    await verifyEffectiveGrants(client);
    await client.query("COMMIT");
    return { ...plan, mode: "applied", groups: 3, roles: 8, users: 3, effectiveScopeAssignments: 15 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function ensureNorthwindAccountLink(
  client: QueryClient,
  scopes: ReadonlyMap<string, string>,
  actorId: string,
): Promise<void> {
  const contract = CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK;
  const parentId = scopes.get("operating_organization/operating_organization:catl.operations");
  if (!parentId) throw new Error("CirrusAtlantic operating-organization scope is unresolved");
  const scopeId = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-scope", contract.scope.kind, contract.relationshipId);
  await client.query(`
    INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by)
    VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,'Northwind / CirrusAtlantic account link',$7::jsonb,'active',$8::uuid)
    ON CONFLICT(tenant_id,scope_kind,target_id) DO UPDATE SET
      scope_key=EXCLUDED.scope_key,parent_scope_target_id=EXCLUDED.parent_scope_target_id,
      display_name=EXCLUDED.display_name,metadata=authz.scope_target.metadata||EXCLUDED.metadata,
      status='active',updated_by=EXCLUDED.created_by
  `, [scopeId, CIRRUSATLANTIC_TENANT_ID, contract.scope.kind, contract.scope.key, contract.relationshipId, parentId, metadata(), actorId]);
  const actualScope = await requireScope(client, contract.scope.kind, contract.scope.key);
  for (const grant of [contract.requester, contract.reviewer]) {
    const persona = CIRRUSATLANTIC_DEMO_PERSONAS.find((item) => item.username === grant.username);
    if (!persona) throw new Error(`CirrusAtlantic account-link persona is missing: ${grant.username}`);
    const group = await one<{ id: string }>(client,
      "SELECT id::text AS id FROM authz.principal_group WHERE tenant_id=$1::uuid AND code=$2 AND status='active'",
      [CIRRUSATLANTIC_TENANT_ID, persona.groupCode]);
    const roleId = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role", grant.roleCode);
    await client.query(`
      INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
      VALUES($1::uuid,$2::uuid,$3,$4,'Relationship-scoped Northwind MESH account-link authority','system','seed',$5,$6::jsonb,'draft',$7::uuid)
      ON CONFLICT(tenant_id,code) DO NOTHING
    `, [roleId, CIRRUSATLANTIC_TENANT_ID, grant.roleCode, grant.roleName, SOURCE_REF, metadata(), actorId]);
    const permissions = await client.query<{ id: string; canonical_code: string }>(`
      SELECT id::text,canonical_code FROM authz.permission
      WHERE canonical_code=ANY($1::text[]) AND status='published'
    `, [grant.permissions]);
    if (permissions.rows.length !== grant.permissions.length) throw new Error(`${grant.roleCode} permission catalog is incomplete`);
    await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status='active'", [CIRRUSATLANTIC_TENANT_ID, roleId, actorId]);
    for (const permission of permissions.rows) await client.query(`
      INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)
      ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING
    `, [deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role-permission", grant.roleCode, permission.canonical_code), CIRRUSATLANTIC_TENANT_ID, roleId, permission.id, actorId]);
    await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [CIRRUSATLANTIC_TENANT_ID, roleId, actorId]);
    await ensureGroupRole(client, { ...persona, roleCode: grant.roleCode, roleName: grant.roleName }, group.id, roleId, actualScope, contract.scope, actorId);
  }
  const projection = contract.projectionReader;
  const owner = CIRRUSATLANTIC_DEMO_PERSONAS.find((item) => item.username === projection.username);
  const tenantScope = scopes.get(`tenant/${CIRRUSATLANTIC_TENANT_CODE}`);
  if (!owner || !tenantScope) throw new Error("CirrusAtlantic projection-reader scope is unresolved");
  const ownerGroup = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.principal_group WHERE tenant_id=$1::uuid AND code=$2 AND status='active'",
    [CIRRUSATLANTIC_TENANT_ID, owner.groupCode]);
  const projectionRoleId = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role", projection.roleCode);
  const projectionPermission = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.permission WHERE canonical_code=$1 AND status='published'",
    [projection.permissions[0]]);
  await client.query(`
    INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
    VALUES($1::uuid,$2::uuid,$3,$4,'Read-only access to received Business Partner profile evidence','system','seed',$5,$6::jsonb,'draft',$7::uuid)
    ON CONFLICT(tenant_id,code) DO NOTHING
  `, [projectionRoleId, CIRRUSATLANTIC_TENANT_ID, projection.roleCode, projection.roleName, SOURCE_REF, metadata(), actorId]);
  await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status='active'", [CIRRUSATLANTIC_TENANT_ID, projectionRoleId, actorId]);
  await client.query(`
    INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)
    ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING
  `, [deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role-permission", projection.roleCode, projection.permissions[0]), CIRRUSATLANTIC_TENANT_ID, projectionRoleId, projectionPermission.id, actorId]);
  await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [CIRRUSATLANTIC_TENANT_ID, projectionRoleId, actorId]);
  await ensureGroupRole(client, { ...owner, roleCode: projection.roleCode, roleName: projection.roleName }, ownerGroup.id, projectionRoleId, tenantScope,
    { kind: "tenant", key: CIRRUSATLANTIC_TENANT_CODE, propagation: "exact" }, actorId);
}

async function ensureOwnerReviewer(
  client: QueryClient,
  scopes: ReadonlyMap<string, string>,
  actorId: string,
): Promise<void> {
  const reviewer = CIRRUSATLANTIC_OWNER_REVIEWER;
  const owner = CIRRUSATLANTIC_DEMO_PERSONAS.find((item) => item.username === reviewer.username);
  if (!owner) throw new Error("CirrusAtlantic owner persona is missing");
  const group = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.principal_group WHERE tenant_id=$1::uuid AND code=$2 AND status='active'",
    [CIRRUSATLANTIC_TENANT_ID, owner.groupCode]);
  const roleId = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role", reviewer.roleCode);
  await client.query(`
    INSERT INTO authz.role (id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3,$4,'Independent Business Partner case review only','system','seed',$5,$6::jsonb,'draft',$7::uuid)
    ON CONFLICT (tenant_id,code) DO NOTHING
  `, [roleId, CIRRUSATLANTIC_TENANT_ID, reviewer.roleCode, reviewer.roleName, SOURCE_REF, metadata(), actorId]);
  const permissions = await client.query<{ id: string; canonical_code: string }>(`
    SELECT id::text,canonical_code FROM authz.permission
    WHERE canonical_code=ANY($1::text[]) AND status='published'
  `, [reviewer.permissions]);
  if (permissions.rows.length !== reviewer.permissions.length) throw new Error("CirrusAtlantic owner reviewer permission catalog is incomplete");
  await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status='active'", [CIRRUSATLANTIC_TENANT_ID, roleId, actorId]);
  for (const permission of permissions.rows) {
    await client.query(`
      INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)
      ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING
    `, [deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role-permission", reviewer.roleCode, permission.canonical_code), CIRRUSATLANTIC_TENANT_ID, roleId, permission.id, actorId]);
  }
  await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [CIRRUSATLANTIC_TENANT_ID, roleId, actorId]);
  const targetId = scopes.get(`${reviewer.scope.kind}/${reviewer.scope.key}`);
  if (!targetId) throw new Error("CirrusAtlantic reviewer scope is unresolved");
  await ensureGroupRole(
    client,
    { ...owner, roleCode: reviewer.roleCode, roleName: reviewer.roleName },
    group.id,
    roleId,
    targetId,
    reviewer.scope,
    actorId,
  );
}

async function ensureOwnerBankChecker(
  client: QueryClient,
  scopes: ReadonlyMap<string, string>,
  actorId: string,
): Promise<void> {
  const checker = CIRRUSATLANTIC_BANK_CHECKER;
  const owner = CIRRUSATLANTIC_DEMO_PERSONAS.find((item) => item.username === checker.username);
  if (!owner) throw new Error("CirrusAtlantic bank-checker persona is missing");
  const group = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.principal_group WHERE tenant_id=$1::uuid AND code=$2 AND status='active'",
    [CIRRUSATLANTIC_TENANT_ID, owner.groupCode]);
  const roleId = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role", checker.roleCode);
  await client.query(`
    INSERT INTO authz.role (id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3,$4,'Independent company-scoped beneficiary bank verification only','system','seed',$5,$6::jsonb,'draft',$7::uuid)
    ON CONFLICT (tenant_id,code) DO NOTHING
  `, [roleId, CIRRUSATLANTIC_TENANT_ID, checker.roleCode, checker.roleName, SOURCE_REF, metadata(), actorId]);
  const permissions = await client.query<{ id: string; canonical_code: string }>(`
    SELECT id::text,canonical_code FROM authz.permission
    WHERE canonical_code=ANY($1::text[]) AND status='published'
  `, [checker.permissions]);
  if (permissions.rows.length !== checker.permissions.length) throw new Error("CirrusAtlantic bank-checker permission catalog is incomplete");
  await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status='active'", [CIRRUSATLANTIC_TENANT_ID, roleId, actorId]);
  for (const permission of permissions.rows) {
    await client.query(`
      INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)
      ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING
    `, [deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role-permission", checker.roleCode, permission.canonical_code), CIRRUSATLANTIC_TENANT_ID, roleId, permission.id, actorId]);
  }
  await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [CIRRUSATLANTIC_TENANT_ID, roleId, actorId]);
  const targetId = scopes.get(`${checker.scope.kind}/${checker.scope.key}`);
  if (!targetId) throw new Error("CirrusAtlantic bank-checker scope is unresolved");
  await ensureGroupRole(client, { ...owner, roleCode: checker.roleCode, roleName: checker.roleName }, group.id, roleId, targetId, checker.scope, actorId);
}

function assertLocalDatabaseUrl(value: string): void {
  const url = new URL(value);
  const octets = url.hostname.split(".").map(Number);
  const privateNetwork = octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    (octets[0] === 10 || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) || (octets[0] === 192 && octets[1] === 168));
  if (!(['localhost', '127.0.0.1', '::1'].includes(url.hostname) || privateNetwork) || url.pathname !== `/${EXPECTED_DATABASE}`) {
    throw new Error(`CirrusAtlantic demo authorization may run only against local ${EXPECTED_DATABASE}`);
  }
}

async function assertFoundation(client: QueryClient): Promise<string> {
  const identity = await one<{ database: string; plane: string | null; tenantCount: string; actorId: string | null }>(client, `
    SELECT current_database() AS database,current_setting('app.database_plane',true) AS plane,
      (SELECT count(*)::text FROM master.tenant WHERE id=$1::uuid AND code=$2 AND status='active') AS "tenantCount",
      (SELECT id::text FROM master.principal WHERE tenant_id=$1::uuid AND code='seed.three-plane-provisioner' AND status='active') AS "actorId"
  `, [CIRRUSATLANTIC_TENANT_ID, CIRRUSATLANTIC_TENANT_CODE]);
  if (identity.database !== EXPECTED_DATABASE || identity.plane !== "neon" || identity.tenantCount !== "1" || !identity.actorId) {
    throw new Error("CirrusAtlantic demo authorization database/plane/tenant fingerprint mismatch");
  }
  const resources = await one<{ legalEntities: string; companies: string; organizations: string; assignments: string }>(client, `
    SELECT
      (SELECT count(*)::text FROM master.legal_entity WHERE tenant_id=$1::uuid AND code='catl' AND status='active') AS "legalEntities",
      (SELECT count(*)::text FROM master.company_code WHERE tenant_id=$1::uuid AND code='catl' AND status='active') AS companies,
      (SELECT count(*)::text FROM master.operating_organization WHERE tenant_id=$1::uuid AND code='catl.operations' AND status='active') AS organizations,
      (SELECT count(*)::text FROM master.operating_organization_company_assignment assignment
        JOIN master.company_code company ON company.tenant_id=assignment.tenant_id AND company.id=assignment.company_code_id AND company.code='catl'
        JOIN master.operating_organization organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.operating_organization_id AND organization.code='catl.operations'
        WHERE assignment.tenant_id=$1::uuid AND assignment.status='active' AND assignment.effective_from<=CURRENT_DATE
          AND (assignment.effective_until IS NULL OR assignment.effective_until>CURRENT_DATE)) AS assignments
  `, [CIRRUSATLANTIC_TENANT_ID]);
  if (Object.values(resources).some((count) => count !== "1")) throw new Error("CirrusAtlantic master-data fingerprint mismatch");
  return identity.actorId;
}

async function requireCatalogPermission(client: QueryClient): Promise<string> {
  const result = await one<{ id: string; compatibilityCount: string }>(client, `
    SELECT permission.id::text AS id,
      (SELECT count(*)::text FROM authz.permission_scope_kind scope
        WHERE scope.permission_id=permission.id AND scope.status='active'
          AND (scope.scope_kind,scope.propagation_mode) IN (
            ('tenant','exact'),('legal_entity','exact'),('company_code','exact'),('operating_organization','subtree')
          )) AS "compatibilityCount"
    FROM authz.permission permission
    WHERE permission.canonical_code=$1 AND permission.status='published'
  `, [CIRRUSATLANTIC_CONTEXT_PERMISSION]);
  if (result.compatibilityCount !== "4") throw new Error("Neon context catalog permission compatibility is incomplete; reapply the Neon authorization pack");
  return result.id;
}

async function requireAndCompleteScopes(client: QueryClient, actorId: string): Promise<Map<string, string>> {
  const tenant = await requireScope(client, "tenant", CIRRUSATLANTIC_TENANT_CODE);
  const legal = await requireScope(client, "legal_entity", "legal_entity:catl");
  const organization = await requireScope(client, "operating_organization", "operating_organization:catl.operations");
  const company = await one<{ id: string; name: string }>(client,
    "SELECT id::text AS id,name FROM master.company_code WHERE tenant_id=$1::uuid AND code='catl' AND status='active'",
    [CIRRUSATLANTIC_TENANT_ID]);
  const companyScopeId = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "scope", "company_code", "catl");
  await client.query(`
    INSERT INTO authz.scope_target (
      id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by
    ) VALUES ($1::uuid,$2::uuid,'company_code','company_code:catl',$3::uuid,$4::uuid,$5,$6::jsonb,'active',$7::uuid)
    ON CONFLICT (tenant_id,scope_kind,target_id) DO UPDATE SET
      display_name=EXCLUDED.display_name,metadata=authz.scope_target.metadata||EXCLUDED.metadata,updated_by=EXCLUDED.created_by
    WHERE authz.scope_target.scope_key=EXCLUDED.scope_key
  `, [companyScopeId, CIRRUSATLANTIC_TENANT_ID, company.id, legal, company.name, metadata(), actorId]);
  const actualCompanyScope = await requireScope(client, "company_code", "company_code:catl");
  return new Map([
    [`tenant/${CIRRUSATLANTIC_TENANT_CODE}`, tenant],
    ["legal_entity/legal_entity:catl", legal],
    ["company_code/company_code:catl", actualCompanyScope],
    ["operating_organization/operating_organization:catl.operations", organization],
  ]);
}

async function requirePrincipal(client: QueryClient, persona: DemoPersona): Promise<string> {
  const row = await one<{ principalId: string; username: string }>(client, `
    SELECT binding.principal_id::text AS "principalId",binding.username
    FROM master.principal_identity_binding binding
    JOIN master.principal principal ON principal.tenant_id=binding.tenant_id AND principal.id=binding.principal_id AND principal.status='active'
    JOIN authz.plane_membership membership ON membership.tenant_id=principal.tenant_id AND membership.principal_id=principal.id
      AND membership.status='active' AND membership.effective_from<=clock_timestamp()
      AND (membership.effective_until IS NULL OR membership.effective_until>clock_timestamp())
    WHERE binding.tenant_id=$1::uuid AND binding.provider_code='keycloak' AND binding.username=$2 AND binding.status='active'
  `, [CIRRUSATLANTIC_TENANT_ID, persona.username]);
  if (row.username !== persona.username) throw new Error(`identity binding mismatch for ${persona.username}`);
  return row.principalId;
}

async function ensureRole(client: QueryClient, persona: DemoPersona, permissionId: string, actorId: string): Promise<string> {
  const id = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role", persona.roleCode);
  await client.query(`
    INSERT INTO authz.role (id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3,$4,'Local demo context visibility only; grants no transaction authority','system','seed',$5,$6::jsonb,'draft',$7::uuid)
    ON CONFLICT (tenant_id,code) DO NOTHING
  `, [id, CIRRUSATLANTIC_TENANT_ID, persona.roleCode, persona.roleName, SOURCE_REF, metadata(), actorId]);
  const role = await one<{ id: string; sourceRef: string; status: string }>(client,
    "SELECT id::text AS id,source_ref AS \"sourceRef\",status FROM authz.role WHERE tenant_id=$1::uuid AND code=$2",
    [CIRRUSATLANTIC_TENANT_ID, persona.roleCode]);
  if (role.id !== id || role.sourceRef !== SOURCE_REF) throw new Error(`conflicting role: ${persona.roleCode}`);
  if (role.status === "active") await client.query("UPDATE authz.role SET status='suspended',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid", [CIRRUSATLANTIC_TENANT_ID, id, actorId]);
  await client.query(`
    INSERT INTO authz.role_permission (id,tenant_id,role_id,permission_id,created_by)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)
    ON CONFLICT (tenant_id,role_id,permission_id) DO NOTHING
  `, [deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-role-permission", persona.roleCode, CIRRUSATLANTIC_CONTEXT_PERMISSION), CIRRUSATLANTIC_TENANT_ID, id, permissionId, actorId]);
  await client.query("UPDATE authz.role SET status='active',updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid AND status<>'active'", [CIRRUSATLANTIC_TENANT_ID, id, actorId]);
  return id;
}

async function ensureGroup(client: QueryClient, persona: DemoPersona, actorId: string): Promise<string> {
  const id = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-group", persona.groupCode);
  await client.query(`
    INSERT INTO authz.principal_group (id,tenant_id,code,name,description,group_kind,source_type,source_ref,metadata,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3,$4,'Opt-in local demo authorization group','system','seed',$5,$6::jsonb,'active',$7::uuid)
    ON CONFLICT (tenant_id,code) DO NOTHING
  `, [id, CIRRUSATLANTIC_TENANT_ID, persona.groupCode, persona.groupName, SOURCE_REF, metadata(), actorId]);
  const group = await one<{ id: string; sourceRef: string }>(client,
    "SELECT id::text AS id,source_ref AS \"sourceRef\" FROM authz.principal_group WHERE tenant_id=$1::uuid AND code=$2",
    [CIRRUSATLANTIC_TENANT_ID, persona.groupCode]);
  if (group.id !== id || group.sourceRef !== SOURCE_REF) throw new Error(`conflicting group: ${persona.groupCode}`);
  return id;
}

async function ensureMembership(client: QueryClient, persona: DemoPersona, principalId: string, groupId: string, actorId: string): Promise<void> {
  const id = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-member", persona.username);
  await client.query(`
    INSERT INTO authz.group_member (id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'seed',$5,$6::jsonb,'active',$7::uuid)
    ON CONFLICT (id) DO UPDATE SET status='active',effective_until=NULL,metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
    WHERE authz.group_member.tenant_id=EXCLUDED.tenant_id AND authz.group_member.group_id=EXCLUDED.group_id
      AND authz.group_member.principal_id=EXCLUDED.principal_id AND authz.group_member.source_ref=EXCLUDED.source_ref
  `, [id, CIRRUSATLANTIC_TENANT_ID, groupId, principalId, SOURCE_REF, metadata(), actorId]);
}

async function ensureGroupRole(client: QueryClient, persona: DemoPersona, groupId: string, roleId: string, scopeTargetId: string, scope: DemoScopeCoordinate, actorId: string): Promise<void> {
  const id = deterministicUuid("neon", CIRRUSATLANTIC_TENANT_ID, "local-demo-group-role", persona.roleCode, scope.kind, scope.key);
  await client.query(`
    INSERT INTO authz.group_role (id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'seed',$7,$8::jsonb,'active',$9::uuid)
    ON CONFLICT (id) DO UPDATE SET status='active',effective_until=NULL,metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
    WHERE authz.group_role.tenant_id=EXCLUDED.tenant_id AND authz.group_role.group_id=EXCLUDED.group_id
      AND authz.group_role.role_id=EXCLUDED.role_id AND authz.group_role.scope_target_id=EXCLUDED.scope_target_id
      AND authz.group_role.propagation_mode=EXCLUDED.propagation_mode AND authz.group_role.source_ref=EXCLUDED.source_ref
  `, [id, CIRRUSATLANTIC_TENANT_ID, groupId, roleId, scopeTargetId, scope.propagation, SOURCE_REF, metadata(), actorId]);
}

async function verifyEffectiveGrants(client: QueryClient): Promise<void> {
  for (const persona of CIRRUSATLANTIC_DEMO_PERSONAS) {
    const row = await one<{ count: string }>(client, `
      SELECT count(DISTINCT target.scope_kind)::text AS count
      FROM authz.group_member member
      JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id
      JOIN authz.group_role assignment ON assignment.tenant_id=member.tenant_id AND assignment.group_id=member.group_id
      JOIN authz.role_permission role_permission ON role_permission.tenant_id=assignment.tenant_id AND role_permission.role_id=assignment.role_id
      JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.canonical_code=$3
      JOIN authz.scope_target target ON target.tenant_id=assignment.tenant_id AND target.id=assignment.scope_target_id
      WHERE member.tenant_id=$1::uuid AND principal.code=$2 AND member.status='active' AND assignment.status='active'
        AND target.scope_kind IN ('legal_entity','company_code','operating_organization')
    `, [CIRRUSATLANTIC_TENANT_ID, persona.username, CIRRUSATLANTIC_CONTEXT_PERMISSION]);
    if (row.count !== "3") throw new Error(`effective scope verification failed for ${persona.username}`);
  }
  const reviewer = await one<{ count: string }>(client, `
    SELECT count(DISTINCT permission.canonical_code)::text AS count
    FROM authz.group_member member
    JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id
    JOIN authz.group_role assignment ON assignment.tenant_id=member.tenant_id AND assignment.group_id=member.group_id
    JOIN authz.role role ON role.tenant_id=assignment.tenant_id AND role.id=assignment.role_id
    JOIN authz.role_permission role_permission ON role_permission.tenant_id=role.tenant_id AND role_permission.role_id=role.id
    JOIN authz.permission permission ON permission.id=role_permission.permission_id
    JOIN authz.scope_target target ON target.tenant_id=assignment.tenant_id AND target.id=assignment.scope_target_id
    WHERE member.tenant_id=$1::uuid AND principal.code=$2 AND member.status='active' AND assignment.status='active'
      AND role.status='active' AND role.code=$3 AND permission.status='published'
      AND permission.canonical_code=ANY($4::text[])
      AND target.scope_kind=$5 AND target.scope_key=$6 AND assignment.propagation_mode=$7
  `, [
    CIRRUSATLANTIC_TENANT_ID,
    CIRRUSATLANTIC_OWNER_REVIEWER.username,
    CIRRUSATLANTIC_OWNER_REVIEWER.roleCode,
    CIRRUSATLANTIC_OWNER_REVIEWER.permissions,
    CIRRUSATLANTIC_OWNER_REVIEWER.scope.kind,
    CIRRUSATLANTIC_OWNER_REVIEWER.scope.key,
    CIRRUSATLANTIC_OWNER_REVIEWER.scope.propagation,
  ]);
  if (reviewer.count !== String(CIRRUSATLANTIC_OWNER_REVIEWER.permissions.length)) {
    throw new Error("effective reviewer scope verification failed for catl.owner");
  }
  const checker = CIRRUSATLANTIC_BANK_CHECKER;
  const bankChecker = await one<{ count: string }>(client, `
    SELECT count(DISTINCT permission.canonical_code)::text AS count
    FROM authz.group_member member
    JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id
    JOIN authz.group_role assignment ON assignment.tenant_id=member.tenant_id AND assignment.group_id=member.group_id
    JOIN authz.role role ON role.tenant_id=assignment.tenant_id AND role.id=assignment.role_id
    JOIN authz.role_permission role_permission ON role_permission.tenant_id=role.tenant_id AND role_permission.role_id=role.id
    JOIN authz.permission permission ON permission.id=role_permission.permission_id
    JOIN authz.scope_target target ON target.tenant_id=assignment.tenant_id AND target.id=assignment.scope_target_id
    WHERE member.tenant_id=$1::uuid AND principal.code=$2 AND member.status='active' AND assignment.status='active'
      AND role.status='active' AND role.code=$3 AND permission.status='published'
      AND permission.canonical_code=ANY($4::text[])
      AND target.scope_kind=$5 AND target.scope_key=$6 AND assignment.propagation_mode=$7
  `, [CIRRUSATLANTIC_TENANT_ID, checker.username, checker.roleCode, checker.permissions,
    checker.scope.kind, checker.scope.key, checker.scope.propagation]);
  if (bankChecker.count !== String(checker.permissions.length)) {
    throw new Error("effective bank-checker scope verification failed for catl.owner");
  }
  for (const grant of [CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.requester, CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.reviewer]) {
    const effective = await one<{ count: string }>(client, `
      SELECT count(DISTINCT permission.canonical_code)::text AS count
      FROM authz.group_member member
      JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id
      JOIN authz.group_role assignment ON assignment.tenant_id=member.tenant_id AND assignment.group_id=member.group_id
      JOIN authz.role role ON role.tenant_id=assignment.tenant_id AND role.id=assignment.role_id
      JOIN authz.role_permission role_permission ON role_permission.tenant_id=role.tenant_id AND role_permission.role_id=role.id
      JOIN authz.permission permission ON permission.id=role_permission.permission_id
      JOIN authz.scope_target target ON target.tenant_id=assignment.tenant_id AND target.id=assignment.scope_target_id
      WHERE member.tenant_id=$1::uuid AND principal.code=$2 AND member.status='active' AND assignment.status='active'
        AND role.status='active' AND role.code=$3 AND permission.status='published'
        AND permission.canonical_code=ANY($4::text[])
        AND target.scope_kind='network_relationship' AND target.target_id=$5::uuid
        AND assignment.propagation_mode='exact'
    `, [CIRRUSATLANTIC_TENANT_ID, grant.username, grant.roleCode, grant.permissions, CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.relationshipId]);
    if (effective.count !== String(grant.permissions.length)) throw new Error(`effective account-link scope verification failed for ${grant.username}`);
  }
  const projection = CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.projectionReader;
  const projectionRead = await one<{ count: string }>(client, `
    SELECT count(*)::text AS count
    FROM authz.group_member member
    JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id
    JOIN authz.group_role assignment ON assignment.tenant_id=member.tenant_id AND assignment.group_id=member.group_id
    JOIN authz.role role ON role.tenant_id=assignment.tenant_id AND role.id=assignment.role_id
    JOIN authz.role_permission role_permission ON role_permission.tenant_id=role.tenant_id AND role_permission.role_id=role.id
    JOIN authz.permission permission ON permission.id=role_permission.permission_id
    JOIN authz.scope_target target ON target.tenant_id=assignment.tenant_id AND target.id=assignment.scope_target_id
    WHERE member.tenant_id=$1::uuid AND principal.code=$2 AND member.status='active' AND assignment.status='active'
      AND role.status='active' AND role.code=$3 AND permission.status='published' AND permission.canonical_code=$4
      AND target.scope_kind='tenant' AND target.target_id=$1::uuid AND assignment.propagation_mode='exact'
  `, [CIRRUSATLANTIC_TENANT_ID, projection.username, projection.roleCode, projection.permissions[0]]);
  if (projectionRead.count !== "1") throw new Error("effective profile-projection read verification failed for catl.owner");
}

async function requireScope(client: QueryClient, kind: DemoScopeCoordinate["kind"], key: string): Promise<string> {
  return (await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind=$2 AND scope_key=$3 AND status='active'",
    [CIRRUSATLANTIC_TENANT_ID, kind, key])).id;
}

function metadata(): string {
  return JSON.stringify({ managedBy: SOURCE_REF, environment: "disposable_local", memberCompaniesPropagation: false });
}

async function one<T extends object>(client: QueryClient, text: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(text, values);
  if (result.rows.length !== 1) throw new Error(`expected exactly one row, received ${result.rows.length}`);
  return result.rows[0]!;
}

function option(args: readonly string[], name: string): string | undefined {
  const equals = args.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function databaseUrl(args: readonly string[]): string {
  const value = option(args, "--database-url") ?? process.env.ATHYPER_NEON_DATABASE_ADMIN_URL ?? process.env.DATABASE_ADMIN_URL;
  if (!value?.trim()) throw new Error("set ATHYPER_NEON_DATABASE_ADMIN_URL or DATABASE_ADMIN_URL, or pass --database-url");
  return value.trim();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const result = await provisionCirrusAtlanticDemoAuthorization({
    databaseUrl: databaseUrl(args),
    confirm: option(args, "--confirm"),
    dryRun: args.includes("--plan") || args.includes("--dry-run"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
