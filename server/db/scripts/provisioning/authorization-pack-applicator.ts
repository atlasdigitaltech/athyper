import type { QueryClient } from "../safe-provision.js";
import type { ProvisionPlane } from "../safe-provision.js";
import {
  deterministicUuid,
  legalEntityResources,
  networkAccountResources,
  planeAssignments,
  type AuthorityRole,
  type ProvisionInputs,
} from "./three-plane-model.js";

const SYSTEM_PRINCIPAL = "00000000-0000-0000-0000-000000000000";
const SOURCE_REF = "three-plane-demo:v1";

export interface PlaneApplicationResult {
  readonly plane: ProvisionPlane;
  readonly tenantCount: number;
  readonly principalCount: number;
  readonly membershipCount: number;
  readonly groupMemberCount: number;
  readonly groupRoleCount: number;
  readonly scopeCount: number;
}

export async function applyPlaneSeed(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
): Promise<PlaneApplicationResult> {
  const definition = inputs.manifest.planes[plane];
  await assertTarget(client, plane, definition.databaseName);
  await client.query(
    "SELECT set_config('app.database_plane', $1, true), set_config('app.current_principal_id', $2, true)",
    [plane, inputs.manifest.systemPrincipalId],
  );
  await applyTenants(client, inputs, plane);
  await applyPlaneResources(client, inputs, plane);
  const pack = inputs.authorizationPacks[plane];
  await applyEmbeddedPermissions(client, pack, plane);
  const tenantCodes = new Set(inputs.manifest.tenants.map((tenant) => tenant.code));
  const assignments = planeAssignments(pack, plane, tenantCodes);
  const roles = pack.authority.roles.filter((role) => role.plane === plane);
  const groups = pack.authority.groups.filter((group) => group.plane === plane);
  const rolesByExternalId = new Map(roles.map((role) => [role.id, role]));
  const groupsByCode = new Map(groups.map((group) => [group.code, group]));
  let principalCount = 0;
  let groupMemberCount = 0;
  let groupRoleCount = 0;

  for (const tenant of inputs.manifest.tenants) {
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenant.id]);
    const roleIds = new Map<string, string>();
    for (const role of roles) {
      roleIds.set(role.id, await applyRole(client, plane, tenant.id, role));
    }
    const groupIds = new Map<string, string>();
    for (const group of groups) {
      const groupId = deterministicUuid(plane, tenant.code, "group", group.code);
      await client.query(`
        INSERT INTO authz.principal_group (
          id, tenant_id, code, name, group_kind, source_type, source_ref,
          status, metadata, created_by
        ) VALUES ($1::uuid, $2::uuid, $3, $4, 'system', 'seed', $5, 'active', $6::jsonb, $7::uuid)
        ON CONFLICT (tenant_id, code) DO UPDATE SET
          name = EXCLUDED.name,
          status = 'active',
          metadata = EXCLUDED.metadata,
          updated_by = EXCLUDED.created_by
        WHERE (authz.principal_group.name, authz.principal_group.status, authz.principal_group.metadata)
          IS DISTINCT FROM (EXCLUDED.name, 'active'::authz.scope_status_d, EXCLUDED.metadata)
      `, [groupId, tenant.id, group.code, humanize(group.code), SOURCE_REF,
        JSON.stringify(seedMetadata(inputs, plane, { externalGroupId: group.id })), SYSTEM_PRINCIPAL]);
      const actual = await one<{ id: string }>(client,
        "SELECT id::text AS id FROM authz.principal_group WHERE tenant_id=$1::uuid AND code=$2",
        [tenant.id, group.code]);
      groupIds.set(group.code, actual.id);
    }

    for (const item of assignments.filter((item) => item.tenantCode === tenant.code)) {
      const principalId = await applyPrincipal(client, inputs, plane, tenant.id, item.subject);
      principalCount += 1;
      await applyMembership(client, inputs, plane, tenant.id, principalId);
      const group = groupsByCode.get(item.assignment.group.code);
      const groupId = groupIds.get(item.assignment.group.code);
      if (!group || !groupId) throw new Error(`undefined ${plane} group: ${item.assignment.group.code}`);
      await client.query(`
        INSERT INTO authz.group_member (
          id, tenant_id, group_id, principal_id, source_type, source_ref,
          status, metadata, created_by
        ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'seed',$5,'active',$6::jsonb,$7::uuid)
        ON CONFLICT (tenant_id, group_id, principal_id) WHERE status <> 'revoked'
        DO UPDATE SET status='active', metadata=EXCLUDED.metadata, effective_until=NULL,
          updated_by=EXCLUDED.created_by
      `, [deterministicUuid(plane, tenant.code, "group-member", group.code, item.subject.keycloakSubject),
        tenant.id, groupId, principalId, SOURCE_REF,
        JSON.stringify(seedMetadata(inputs, plane)), SYSTEM_PRINCIPAL]);
      groupMemberCount += 1;

      for (const scoped of item.assignment.scopedRoleAssignments) {
        const scope = await resolveScope(client, tenant.id, plane, scoped.scopeKind, scoped.scopeKey);
        for (const externalRoleId of group.roleIds) {
          const role = rolesByExternalId.get(externalRoleId);
          const roleId = roleIds.get(externalRoleId);
          if (!role || !roleId) throw new Error(`undefined ${plane} role: ${externalRoleId}`);
          await client.query(`
            INSERT INTO authz.group_role (
              id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,
              source_type,source_ref,status,metadata,created_by
            ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'exact','seed',$6,'active',$7::jsonb,$8::uuid)
            ON CONFLICT (tenant_id,group_id,role_id,scope_target_id) WHERE status <> 'revoked'
            DO UPDATE SET status='active',metadata=EXCLUDED.metadata,effective_until=NULL,
              updated_by=EXCLUDED.created_by
          `, [deterministicUuid(plane, tenant.code, "group-role", group.code, role.code, scoped.scopeKey),
            tenant.id, groupId, roleId, scope.id, SOURCE_REF,
            JSON.stringify(seedMetadata(inputs, plane)), SYSTEM_PRINCIPAL]);
          groupRoleCount += 1;
        }
      }
    }
  }

  const uniquePrincipals = new Set(assignments.map((item) => `${item.tenantCode}:${item.subject.keycloakSubject}`));
  const membershipCount = await assertContextRows(client, inputs, plane, uniquePrincipals.size);
  const scopeCount = Number((await one<{ count: string }>(client, `
    SELECT count(*)::text AS count FROM authz.scope_target
    WHERE tenant_id = ANY($1::uuid[]) AND status='active'
  `, [inputs.manifest.tenants.map((tenant) => tenant.id)])).count);
  return {
    plane,
    tenantCount: inputs.manifest.tenants.length,
    principalCount: uniquePrincipals.size,
    membershipCount,
    groupMemberCount,
    groupRoleCount,
    scopeCount,
  };
}

async function applyTenants(client: QueryClient, inputs: ProvisionInputs, plane: ProvisionPlane): Promise<void> {
  for (const tenant of inputs.manifest.tenants) {
    await client.query(`
      INSERT INTO master.tenant (
        id, code, name, display_name, realm_key, status, metadata, created_by
      ) VALUES ($1::uuid,$2,$3,$4,$5,'active',$6::jsonb,$7::uuid)
      ON CONFLICT (realm_key, code) DO UPDATE SET
        name=EXCLUDED.name, display_name=EXCLUDED.display_name, status='active',
        metadata=master.tenant.metadata || EXCLUDED.metadata, updated_by=EXCLUDED.created_by
      WHERE (master.tenant.name,master.tenant.display_name,master.tenant.status,master.tenant.metadata)
        IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.display_name,'active',master.tenant.metadata || EXCLUDED.metadata)
    `, [tenant.id, tenant.code, tenant.name, tenant.displayName, inputs.manifest.realmKey,
      JSON.stringify(seedMetadata(inputs, plane, {
        keycloak_organization_alias: tenant.keycloakOrganizationAlias,
      })), inputs.manifest.systemPrincipalId]);
    const actual = await one<{ id: string }>(client,
      "SELECT id::text AS id FROM master.tenant WHERE realm_key=$1 AND code=$2",
      [inputs.manifest.realmKey, tenant.code]);
    if (actual.id !== tenant.id) {
      throw new Error(`${plane}/${tenant.code} tenant UUID conflict: expected ${tenant.id}, found ${actual.id}`);
    }
    await client.query(`
      INSERT INTO authz.scope_target (
        id,tenant_id,scope_kind,scope_key,target_id,display_name,status,metadata,created_by
      ) VALUES ($1::uuid,$2::uuid,'tenant',$3,$2::uuid,$4,'active',$5::jsonb,$6::uuid)
      ON CONFLICT (tenant_id,scope_kind,scope_key) DO UPDATE SET
        display_name=EXCLUDED.display_name,status='active',metadata=EXCLUDED.metadata,
        updated_by=EXCLUDED.created_by
    `, [deterministicUuid(plane, tenant.code, "scope", "tenant"), tenant.id, tenant.code,
      tenant.displayName, JSON.stringify(seedMetadata(inputs, plane)), inputs.manifest.systemPrincipalId]);
  }
}

async function applyPlaneResources(client: QueryClient, inputs: ProvisionInputs, plane: ProvisionPlane): Promise<void> {
  if (plane === "neon") {
    for (const resource of legalEntityResources(inputs)) {
      const tenant = inputs.manifest.tenants.find((item) => item.code === resource.tenantCode)!;
      const resourceId = deterministicUuid(plane, tenant.code, "legal-entity", resource.scopeKey);
      await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenant.id]);
      await client.query(`
        INSERT INTO master.legal_entity (
          id,tenant_id,code,name,display_name,legal_name,entity_type,
          functional_currency,reporting_currency,metadata,status,created_by
        ) VALUES ($1::uuid,$2::uuid,$3,$4,$4,$4,'company','USD','USD',$5::jsonb,'active',$6::uuid)
        ON CONFLICT (tenant_id,code) DO UPDATE SET
          name=EXCLUDED.name,display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,
          metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
      `, [resourceId, tenant.id, resource.code, resource.name,
        JSON.stringify(seedMetadata(inputs, plane, { externalScopeKey: resource.scopeKey })), SYSTEM_PRINCIPAL]);
      const actual = await one<{ id: string }>(client,
        "SELECT id::text AS id FROM master.legal_entity WHERE tenant_id=$1::uuid AND code=$2",
        [tenant.id, resource.code]);
      await upsertChildScope(client, inputs, plane, tenant.id, "legal_entity", resource.scopeKey, actual.id, resource.name);
    }
  }
  if (plane === "mesh") {
    for (const resource of networkAccountResources(inputs)) {
      const tenant = inputs.manifest.tenants.find((item) => item.code === resource.tenantCode)!;
      const resourceId = deterministicUuid(plane, tenant.code, "network-account", resource.scopeKey);
      await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenant.id]);
      await client.query(`
        INSERT INTO mesh.network_account (
          id,tenant_id,account_code,display_name,legal_name,network_role,
          default_currency,capabilities,status,metadata,created_by
        ) VALUES ($1::uuid,$2::uuid,$3,$4,$4,$5,'USD','{}'::jsonb,'active',$6::jsonb,$7::uuid)
        ON CONFLICT (account_code) DO UPDATE SET
          display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,
          network_role=EXCLUDED.network_role,status='active',metadata=EXCLUDED.metadata,
          updated_by=EXCLUDED.created_by
        WHERE mesh.network_account.tenant_id=EXCLUDED.tenant_id
      `, [resourceId, tenant.id, resource.accountCode, resource.name, resource.networkRole,
        JSON.stringify(seedMetadata(inputs, plane, { externalScopeKey: resource.scopeKey })), SYSTEM_PRINCIPAL]);
      const actual = await one<{ id: string; tenantId: string }>(client,
        "SELECT id::text AS id,tenant_id::text AS \"tenantId\" FROM mesh.network_account WHERE account_code=$1",
        [resource.accountCode]);
      if (actual.tenantId !== tenant.id) throw new Error(`network account tenant conflict: ${resource.scopeKey}`);
      await upsertChildScope(client, inputs, plane, tenant.id, "network_account", resource.scopeKey, actual.id, resource.name);
    }
  }
}

async function upsertChildScope(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  tenantId: string,
  scopeKind: "legal_entity" | "network_account",
  scopeKey: string,
  targetId: string,
  name: string,
): Promise<void> {
  const root = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind='tenant'",
    [tenantId]);
  await client.query(`
    INSERT INTO authz.scope_target (
      id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,
      display_name,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7,'active',$8::jsonb,$9::uuid)
    ON CONFLICT (tenant_id,scope_kind,scope_key) DO UPDATE SET
      display_name=EXCLUDED.display_name,status='active',metadata=EXCLUDED.metadata,
      updated_by=EXCLUDED.created_by
  `, [deterministicUuid(plane, tenantId, "scope", scopeKind, scopeKey), tenantId,
    scopeKind, scopeKey, targetId, root.id, name,
    JSON.stringify(seedMetadata(inputs, plane)), SYSTEM_PRINCIPAL]);
}

async function applyEmbeddedPermissions(
  client: QueryClient,
  pack: ProvisionInputs["authorizationPacks"][ProvisionPlane],
  plane: ProvisionPlane,
): Promise<void> {
  const operations = pack.permissionCatalog.operations ?? [];
  if (operations.length === 0) return;
  const module = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM master.module WHERE code='fnd' AND status='active'",
    []);
  for (const operation of operations) {
    await client.query(`
      INSERT INTO authz.permission (
        id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,
        requires_sod,is_shareable,is_delegable,metadata,status,created_by
      ) VALUES ($1::uuid,$2,'entity_operation',$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,'draft',$10::uuid)
      ON CONFLICT (canonical_code) DO UPDATE SET
        risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,
        requires_sod=EXCLUDED.requires_sod,is_shareable=EXCLUDED.is_shareable,
        is_delegable=EXCLUDED.is_delegable,metadata=EXCLUDED.metadata,
        status='suspended',updated_by=EXCLUDED.created_by
    `, [operation.permissionId, operation.canonicalPermissionCode, module.id,
      operation.riskTier, operation.requiresMfa, operation.requiresSod,
      operation.shareable, operation.delegable,
      JSON.stringify({ _seed: { source: SOURCE_REF, plane, definitionSha256: operation.definitionSha256 } }),
      SYSTEM_PRINCIPAL]);
    const actual = await one<{ id: string }>(client,
      "SELECT id::text AS id FROM authz.permission WHERE canonical_code=$1",
      [operation.canonicalPermissionCode]);
    if (actual.id !== operation.permissionId) throw new Error(`permission identity conflict: ${operation.canonicalPermissionCode}`);
  }
  await client.query(`
    UPDATE authz.permission SET status='published',updated_by=$2::uuid
    WHERE id=ANY($1::uuid[]) AND status<>'published'
  `, [operations.map((operation) => operation.permissionId), SYSTEM_PRINCIPAL]);
}

async function applyRole(
  client: QueryClient,
  plane: ProvisionPlane,
  tenantId: string,
  role: AuthorityRole,
): Promise<string> {
  const roleId = deterministicUuid(plane, tenantId, "role", role.code);
  const permissionIds = await selectRolePermissions(client, plane, role);
  if (permissionIds.length === 0) throw new Error(`${plane}/${role.code} resolved zero DDL permissions`);
  await client.query(`
    INSERT INTO authz.role (
      id,tenant_id,code,name,role_kind,source_type,source_ref,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,$4,'system','seed',$5,'draft',$6::jsonb,$7::uuid)
    ON CONFLICT (tenant_id,code) DO UPDATE SET
      name=EXCLUDED.name,status='suspended',metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
  `, [roleId, tenantId, role.code, role.name, SOURCE_REF,
    JSON.stringify({ _seed: { source: SOURCE_REF, externalRoleId: role.id, sourceChecksum: role.checksum } }),
    SYSTEM_PRINCIPAL]);
  const actual = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.role WHERE tenant_id=$1::uuid AND code=$2",
    [tenantId, role.code]);
  for (const permissionId of permissionIds) {
    await client.query(`
      INSERT INTO authz.role_permission (id,tenant_id,role_id,permission_id,created_by)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)
      ON CONFLICT (tenant_id,role_id,permission_id) DO NOTHING
    `, [deterministicUuid(plane, tenantId, "role-permission", role.code, permissionId),
      tenantId, actual.id, permissionId, SYSTEM_PRINCIPAL]);
  }
  await client.query(
    "UPDATE authz.role SET status='active',updated_by=$2::uuid WHERE id=$1::uuid AND status<>'active'",
    [actual.id, SYSTEM_PRINCIPAL],
  );
  return actual.id;
}

async function selectRolePermissions(client: QueryClient, plane: ProvisionPlane, role: AuthorityRole): Promise<string[]> {
  if (plane === "mesh") {
    const result = await client.query<{ id: string }>(
      "SELECT id::text AS id FROM authz.permission WHERE id=ANY($1::uuid[]) AND status='published' ORDER BY id",
      [role.permissionIds],
    );
    if (result.rows.length !== role.permissionIds.length) {
      throw new Error(`${plane}/${role.code} references missing permission IDs`);
    }
    return result.rows.map((row) => row.id);
  }
  const result = await client.query<{ id: string; code: string; risk: string }>(`
    SELECT id::text AS id,canonical_code AS code,risk_tier::text AS risk
    FROM authz.permission WHERE status='published' ORDER BY canonical_code
  `);
  return result.rows.filter((permission) => ddlNativeRoleAllows(role.code, permission.code, permission.risk))
    .map((permission) => permission.id);
}

export function ddlNativeRoleAllows(roleCode: string, permissionCode: string, risk: string): boolean {
  const verb = permissionCode.split(".").at(-1) ?? "";
  const read = new Set(["read", "view", "list", "search", "get", "download"]);
  if (roleCode.endsWith(".owner") || roleCode.endsWith(".admin")) return true;
  if (roleCode.endsWith(".viewer")) return read.has(verb);
  if (roleCode.endsWith(".reporter")) return read.has(verb) || ["report", "export", "print"].includes(verb);
  if (roleCode.endsWith(".requester")) {
    return risk !== "critical" && (read.has(verb) || ["create", "update", "submit", "withdraw", "comment", "attach"].includes(verb));
  }
  if (roleCode.endsWith(".operator") || roleCode.endsWith(".agent")) return risk !== "critical";
  if (roleCode.endsWith(".manager")) return risk !== "critical" || verb === "approve";
  return false;
}

async function applyPrincipal(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  tenantId: string,
  subject: { keycloakSubject: string; username: string; principalId: string },
): Promise<string> {
  const desiredId = deterministicUuid(plane, tenantId, "principal", subject.keycloakSubject);
  await client.query(`
    INSERT INTO master.principal (
      id,tenant_id,code,name,principal_type,provisioning_source,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,$4,'user','sync','active',$5::jsonb,$6::uuid)
    ON CONFLICT (tenant_id,code) DO UPDATE SET
      name=EXCLUDED.name,status='active',metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
  `, [desiredId, tenantId, subject.username.toLowerCase(), humanize(subject.username),
    JSON.stringify(seedMetadata(inputs, plane, { externalPrincipalId: subject.principalId })), SYSTEM_PRINCIPAL]);
  const principal = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM master.principal WHERE tenant_id=$1::uuid AND code=$2",
    [tenantId, subject.username.toLowerCase()]);
  const bindingId = deterministicUuid(plane, tenantId, "identity-binding", subject.keycloakSubject);
  await client.query(`
    INSERT INTO master.principal_identity_binding (
      id,tenant_id,principal_id,provider_code,realm_key,subject_id,username,
      status,last_verified_at,synced_at,sync_status,provider_attributes,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3::uuid,'keycloak',$4,$5,$6,'active',now(),now(),'synced',$7::jsonb,$8::jsonb,$9::uuid)
    ON CONFLICT (tenant_id,provider_code,realm_key,subject_id) DO UPDATE SET
      username=EXCLUDED.username,status='active',last_verified_at=now(),synced_at=now(),
      sync_status='synced',provider_attributes=EXCLUDED.provider_attributes,
      metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
    WHERE master.principal_identity_binding.principal_id=EXCLUDED.principal_id
  `, [bindingId, tenantId, principal.id, inputs.manifest.realmKey, subject.keycloakSubject,
    subject.username, JSON.stringify({ source: "keycloak", managedBy: SOURCE_REF }),
    JSON.stringify(seedMetadata(inputs, plane)), SYSTEM_PRINCIPAL]);
  const binding = await one<{ principalId: string }>(client, `
    SELECT principal_id::text AS "principalId" FROM master.principal_identity_binding
    WHERE tenant_id=$1::uuid AND provider_code='keycloak' AND realm_key=$2 AND subject_id=$3
  `, [tenantId, inputs.manifest.realmKey, subject.keycloakSubject]);
  if (binding.principalId !== principal.id) throw new Error(`identity binding conflict: ${subject.keycloakSubject}`);
  return principal.id;
}

async function applyMembership(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  tenantId: string,
  principalId: string,
): Promise<void> {
  await client.query(`
    INSERT INTO authz.plane_membership (
      id,tenant_id,principal_id,membership_kind,source_type,source_ref,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3::uuid,'standard','seed',$4,'active',$5::jsonb,$6::uuid)
    ON CONFLICT (tenant_id,principal_id) WHERE status <> 'revoked'
    DO UPDATE SET status='active',effective_until=NULL,metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
  `, [deterministicUuid(plane, tenantId, "membership", principalId), tenantId, principalId,
    SOURCE_REF, JSON.stringify(seedMetadata(inputs, plane)), SYSTEM_PRINCIPAL]);
}

async function resolveScope(
  client: QueryClient,
  tenantId: string,
  plane: ProvisionPlane,
  packKind: string,
  scopeKey: string,
): Promise<{ id: string }> {
  const kind = packKind === "account" ? "network_account" : packKind;
  const scope = await one<{ id: string }>(client, `
    SELECT id::text AS id FROM authz.scope_target
    WHERE tenant_id=$1::uuid AND scope_kind=$2 AND scope_key=$3 AND status='active'
  `, [tenantId, kind, scopeKey]);
  if (!scope.id) throw new Error(`unresolved ${plane} scope: ${packKind}/${scopeKey}`);
  return scope;
}

async function assertContextRows(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  expected: number,
): Promise<number> {
  const result = await one<{ count: string }>(client, `
    SELECT count(*)::text AS count
    FROM master.principal_identity_binding binding
    JOIN master.principal principal
      ON principal.tenant_id=binding.tenant_id AND principal.id=binding.principal_id AND principal.status='active'
    JOIN master.tenant tenant ON tenant.id=principal.tenant_id AND tenant.status='active'
    JOIN authz.plane_membership membership
      ON membership.tenant_id=principal.tenant_id AND membership.principal_id=principal.id
     AND membership.status='active' AND membership.effective_from<=now()
     AND (membership.effective_until IS NULL OR membership.effective_until>now())
    WHERE binding.provider_code='keycloak' AND binding.realm_key=$1 AND binding.status='active'
      AND tenant.id=ANY($2::uuid[]) AND membership.source_ref=$3
  `, [inputs.manifest.realmKey, inputs.manifest.tenants.map((tenant) => tenant.id), SOURCE_REF]);
  const count = Number(result.count);
  if (count !== expected) throw new Error(`${plane} context assertion failed: expected ${expected}, found ${count}`);
  return count;
}

async function assertTarget(client: QueryClient, plane: ProvisionPlane, databaseName: string): Promise<void> {
  const actual = await one<{ database: string; plane: string }>(client, `
    SELECT current_database() AS database,current_setting('app.database_plane',true) AS plane
  `, []);
  if (actual.database !== databaseName || actual.plane !== plane) {
    throw new Error(`refusing ${plane} seed: expected ${databaseName}/${plane}, found ${actual.database}/${actual.plane}`);
  }
}

function seedMetadata(
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    ...extra,
    _seed: {
      source: SOURCE_REF,
      manifestVersion: inputs.manifest.manifestVersion,
      manifestSha256: inputs.manifestSha256,
      plane,
    },
  };
}

function humanize(value: string): string {
  return value.split(/[._-]/g).filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

async function one<Row extends object>(
  client: QueryClient,
  text: string,
  values: unknown[],
): Promise<Row> {
  const result = await client.query<Row>(text, values);
  if (result.rows.length !== 1) throw new Error(`expected one row, found ${result.rows.length}`);
  return result.rows[0]!;
}
