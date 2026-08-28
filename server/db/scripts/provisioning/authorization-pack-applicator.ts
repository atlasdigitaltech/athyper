import { createHash } from "node:crypto";

import type { QueryClient } from "../safe-provision.js";
import type { ProvisionPlane } from "../safe-provision.js";
import {
  databaseManagedScopeUuid,
  canonicalJson,
  deterministicUuid,
  legalEntityResources,
  networkAccountResources,
  planeAssignments,
  type ProvisionInputs,
} from "./three-plane-model.js";
import type { TenantAuthorityProjection } from "../seed/tenant-authority-projection.js";

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
  readonly applicationProjectionCount: number;
}

export interface PlaneCatalogApplicationResult {
  readonly plane: ProvisionPlane;
  readonly permissionCount: number;
  readonly scopeDeclarationCount: number;
}

/**
 * Publishes only the immutable permission catalog and its exact scope
 * compatibility declarations. This is the safe upgrade path for populated
 * planes: it deliberately does not reconcile tenants, identities, roles, or
 * assignments from the clean-slate demo pack.
 */
export async function applyPlaneCatalog(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
): Promise<PlaneCatalogApplicationResult> {
  const definition = inputs.manifest.planes[plane];
  await assertTarget(client, plane, definition.databaseName);
  await client.query(
    "SELECT set_config('app.database_plane', $1, true), set_config('app.current_tenant_id', '', true), set_config('app.current_principal_id', $2, true)",
    [plane, inputs.manifest.systemPrincipalId],
  );
  const pack = inputs.authorizationPacks[plane];
  await applyEmbeddedPermissions(client, pack, plane);
  await applyPermissionScopeCompatibility(client, plane, pack.permissionScopeCompatibility);
  return {
    plane,
    permissionCount: pack.permissionCatalog.operations?.length ?? 0,
    scopeDeclarationCount: pack.permissionScopeCompatibility.permissions.reduce(
      (count, permission) => count + permission.scopes.length,
      0,
    ),
  };
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
  const provisionActors = new Map<string, string>();
  for (const tenant of inputs.manifest.tenants) {
    provisionActors.set(tenant.id, await ensureProvisionActor(client, inputs, plane, tenant.id, tenant.code));
  }
  for (const tenant of inputs.manifest.tenants) {
    await applyTenantProfile(client, inputs, plane, tenant.id, tenant.code, provisionActors.get(tenant.id)!);
  }
  await applyPlaneResources(client, inputs, plane, provisionActors);
  const applicationProjectionCount = await applyTenantApplicationProjections(client, inputs, plane, provisionActors);
  const pack = inputs.authorizationPacks[plane];
  const projection = pack.tenantAuthorityProjection;
  await client.query(
    "SELECT set_config('app.current_tenant_id', '', true), set_config('app.current_principal_id', $1, true)",
    [inputs.manifest.systemPrincipalId],
  );
  await applyEmbeddedPermissions(client, pack, plane);
  await applyPermissionScopeCompatibility(client, plane, pack.permissionScopeCompatibility);
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
    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_principal_id', $2, true)",
      [tenant.id, provisionActors.get(tenant.id)],
    );
    const roleIds = new Map<string, string>();
    for (const role of roles) {
      const definition = projection.definitions.roles.find((row) =>
        row.tenantId === tenant.id && row.templateRoleId === role.id);
      if (!definition) throw new Error(`missing ${plane}/${tenant.code}/${role.code} role projection`);
      const grants = projection.definitions.rolePermissions.filter((row) => row.roleId === definition.id);
      roleIds.set(role.id, await applyRole(client, definition, grants));
    }
    const groupIds = new Map<string, string>();
    for (const group of groups) {
      const groupDefinition = projection.definitions.principalGroups.find((row) =>
        row.tenantId === tenant.id && row.templateGroupId === group.id);
      if (!groupDefinition) throw new Error(`missing ${plane}/${tenant.code}/${group.code} group projection`);
      const groupId = groupDefinition.id;
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
      `, [groupId, tenant.id, group.code, groupDefinition.name, SOURCE_REF,
        JSON.stringify(seedMetadata(inputs, plane, { externalGroupId: group.id })), SYSTEM_PRINCIPAL]);
      const actual = await one<{ id: string }>(client,
        "SELECT id::text AS id FROM authz.principal_group WHERE tenant_id=$1::uuid AND code=$2",
        [tenant.id, group.code]);
      if (actual.id !== groupDefinition.id) {
        throw new Error(`${plane}/${tenant.code}/${group.code} conflicts with compiled group ID ${groupDefinition.id}`);
      }
      groupIds.set(group.code, actual.id);
    }

    for (const item of assignments.filter((item) => item.tenantCode === tenant.code)) {
      const principalId = await applyPrincipal(client, inputs, plane, tenant.id, item.subject);
      principalCount += 1;
      const membership = projection.assignments.planeMemberships.find((row) =>
        row.tenantId === tenant.id && row.keycloakSubject === item.subject.keycloakSubject);
      if (!membership || membership.principalId !== principalId) {
        throw new Error(`missing or conflicting ${plane} plane_membership projection: ${item.subject.keycloakSubject}`);
      }
      await applyMembership(client, inputs, plane, membership);
      const group = groupsByCode.get(item.assignment.group.code);
      const groupId = groupIds.get(item.assignment.group.code);
      if (!group || !groupId) throw new Error(`undefined ${plane} group: ${item.assignment.group.code}`);
      const groupMember = projection.assignments.groupMembers.find((row) =>
        row.tenantId === tenant.id && row.groupId === groupId && row.keycloakSubject === item.subject.keycloakSubject);
      if (!groupMember || groupMember.principalId !== principalId) {
        throw new Error(`missing or conflicting ${plane} group_member projection: ${item.subject.keycloakSubject}`);
      }
      await client.query(`
        WITH updated AS (
          UPDATE authz.group_member SET status='active',metadata=$6::jsonb,
            effective_until=NULL,updated_by=$7::uuid
          WHERE tenant_id=$2::uuid AND group_id=$3::uuid AND principal_id=$4::uuid
            AND status<>'revoked'
            AND (status IS DISTINCT FROM 'active' OR metadata IS DISTINCT FROM $6::jsonb OR effective_until IS NOT NULL)
          RETURNING id
        )
        INSERT INTO authz.group_member (
          id, tenant_id, group_id, principal_id, source_type, source_ref,
          status, metadata, created_by
        )
        SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,'seed',$5,'active',$6::jsonb,$7::uuid
        WHERE NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=$2::uuid AND group_id=$3::uuid AND principal_id=$4::uuid AND status<>'revoked')
      `, [groupMember.id,
        tenant.id, groupId, principalId, SOURCE_REF,
        JSON.stringify(seedMetadata(inputs, plane)), SYSTEM_PRINCIPAL]);
      groupMemberCount += 1;

      for (const scoped of item.assignment.scopedRoleAssignments) {
        const scope = await resolveScope(client, tenant.id, plane, scoped.scopeKind, scoped.scopeKey);
        const scopeKind = scoped.scopeKind === "account" ? "network_account" : scoped.scopeKind;
        const scopeProjection = projection.assignments.scopeTargets.find((row) =>
          row.tenantId === tenant.id && row.scopeKind === scopeKind && row.scopeKey === scoped.scopeKey);
        if (!scopeProjection || scopeProjection.id !== scope.id) {
          throw new Error(
            `missing or conflicting ${plane} scope_target projection: ${scopeKind}/${scoped.scopeKey}`
            + ` (compiled=${scopeProjection?.id ?? "missing"}, resolved=${scope.id})`,
          );
        }
        for (const externalRoleId of group.roleIds) {
          const role = rolesByExternalId.get(externalRoleId);
          const roleId = roleIds.get(externalRoleId);
          if (!role || !roleId) throw new Error(`undefined ${plane} role: ${externalRoleId}`);
          const groupRole = projection.assignments.groupRoles.find((row) =>
            row.tenantId === tenant.id && row.groupId === groupId && row.roleId === roleId
              && row.scopeTargetId === scope.id);
          if (!groupRole) throw new Error(`missing ${plane} group_role projection: ${group.code}/${role.code}/${scoped.scopeKey}`);
          await client.query(`
            WITH updated AS (
              UPDATE authz.group_role SET status='active',metadata=$7::jsonb,
                effective_until=NULL,updated_by=$8::uuid
              WHERE tenant_id=$2::uuid AND group_id=$3::uuid AND role_id=$4::uuid
                AND scope_target_id=$5::uuid AND status<>'revoked'
                AND (status IS DISTINCT FROM 'active' OR metadata IS DISTINCT FROM $7::jsonb OR effective_until IS NOT NULL)
              RETURNING id
            )
            INSERT INTO authz.group_role (
              id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,
              source_type,source_ref,status,metadata,created_by
            )
            SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'exact','seed',$6,'active',$7::jsonb,$8::uuid
            WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=$2::uuid AND group_id=$3::uuid AND role_id=$4::uuid AND scope_target_id=$5::uuid AND status<>'revoked')
          `, [groupRole.id,
            tenant.id, groupId, roleId, scope.id, SOURCE_REF,
            JSON.stringify(seedMetadata(inputs, plane)), SYSTEM_PRINCIPAL]);
          groupRoleCount += 1;
        }
      }
    }
  }

  for (const tenant of inputs.manifest.tenants) {
    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_principal_id', $2, true)",
      [tenant.id, provisionActors.get(tenant.id)],
    );
    await reconcileSeedOwnedAuthority(
      client,
      tenant.id,
      projection,
      provisionActors.get(tenant.id)!,
    );
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
    applicationProjectionCount,
  };
}

async function applyTenantApplicationProjections(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  provisionActors: ReadonlyMap<string, string>,
): Promise<number> {
  const versionParts = inputs.manifest.manifestVersion.split(".").map(Number);
  if (versionParts.length !== 3 || versionParts.some((part) => !Number.isInteger(part) || part < 0 || part > 999)) {
    throw new Error(`invalid three-plane manifest version: ${inputs.manifest.manifestVersion}`);
  }
  const sourceVersion = versionParts[0]! * 1_000_000 + versionParts[1]! * 1_000 + versionParts[2]!;
  if (sourceVersion < 1) throw new Error("application projection source version must be positive");

  await client.query("SET LOCAL ROLE athyper_projection_applier");
  try {
    for (const tenant of inputs.manifest.tenants) {
      const actorId = provisionActors.get(tenant.id);
      if (!actorId) throw new Error(`missing ${plane}/${tenant.code} projection actor`);
      await client.query(
        "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
        [tenant.id, actorId],
      );
      // Projection row identities are immutable release instances. Keep the source
      // identities stable for reconciliation, but derive row IDs from the source
      // version so a newer manifest can stage before retiring the active release.
      const sourceProjectionId = deterministicUuid("trustiam", plane, tenant.code, "application-projection");
      const sourceProviderId = deterministicUuid("trustiam", plane, tenant.code, "keycloak-provider");
      const sourceScopeId = deterministicUuid("trustiam", plane, tenant.code, "tenant-scope-ceiling");
      const projectionId = deterministicUuid("trustiam", plane, tenant.code, "application-projection", String(sourceVersion));
      const providerId = deterministicUuid("trustiam", plane, tenant.code, "keycloak-provider", String(sourceVersion));
      const scopeId = deterministicUuid("trustiam", plane, tenant.code, "tenant-scope-ceiling", String(sourceVersion));
      const projectionBase = {
        id: projectionId,
        sourceProjectionId,
        sourceVersion,
        realmKey: inputs.manifest.realmKey,
        externalOrganizationId: tenant.keycloakOrganizationAlias,
        organizationAlias: tenant.keycloakOrganizationAlias,
        organizationName: tenant.displayName,
        metadata: {
          contractVersion: inputs.manifest.contractVersion,
          manifestVersion: inputs.manifest.manifestVersion,
          plane,
          grantsAuthority: false,
          source: "three-plane-tenant-admission-bootstrap",
        },
      };
      const providers = [{
        id: providerId,
        providerCode: "keycloak",
        protocol: "oidc",
        externalProviderId: inputs.manifest.realmKey,
        sourceProviderId,
        sourceVersion,
      }];
      const scopes = [{
        id: scopeId,
        scopeTargetId: deterministicUuid(plane, tenant.code, "scope", "tenant"),
        ceilingMode: "exact",
        sourceScopeId,
        sourceVersion,
      }];
      const sourceHash = createHash("sha256")
        .update(canonicalJson({ projection: projectionBase, providers, scopes }))
        .digest("hex");
      await client.query(
        "SELECT authz.fn_stage_application_projection($1::uuid,$2::jsonb,$3::jsonb,$4::jsonb,$5::uuid)",
        [tenant.id, JSON.stringify({ ...projectionBase, sourceHash }), JSON.stringify(providers), JSON.stringify(scopes), actorId],
      );
      await client.query(
        "SELECT authz.fn_activate_application_projection($1::uuid,$2::uuid,$3::bigint,$4,$5::uuid)",
        [tenant.id, projectionId, sourceVersion, sourceHash, actorId],
      );
    }
    await client.query("RESET ROLE");
  } catch (error) {
    // The caller owns the transaction and will roll it back. Issuing RESET ROLE
    // in an aborted transaction would hide the original PostgreSQL error.
    throw error;
  }
  return inputs.manifest.tenants.length;
}

async function reconcileSeedOwnedAuthority(
  client: QueryClient,
  tenantId: string,
  projection: TenantAuthorityProjection,
  actorId: string,
): Promise<void> {
  const memberships = projection.assignments.planeMemberships.filter((row) => row.tenantId === tenantId).map((row) => row.id);
  const groupMembers = projection.assignments.groupMembers.filter((row) => row.tenantId === tenantId).map((row) => row.id);
  const groupRoles = projection.assignments.groupRoles.filter((row) => row.tenantId === tenantId).map((row) => row.id);
  const groups = projection.definitions.principalGroups.filter((row) => row.tenantId === tenantId).map((row) => row.id);
  const roles = projection.definitions.roles.filter((row) => row.tenantId === tenantId).map((row) => row.id);
  await client.query(`
    UPDATE authz.group_role
    SET status='suspended',effective_until=COALESCE(effective_until,clock_timestamp()),updated_by=$4::uuid
    WHERE tenant_id=$1::uuid AND source_type='seed' AND source_ref=$2 AND status='active'
      AND NOT (id=ANY($3::uuid[]))
  `, [tenantId, SOURCE_REF, groupRoles, actorId]);
  await client.query(`
    UPDATE authz.group_member
    SET status='suspended',effective_until=COALESCE(effective_until,clock_timestamp()),updated_by=$4::uuid
    WHERE tenant_id=$1::uuid AND source_type='seed' AND source_ref=$2 AND status='active'
      AND NOT (id=ANY($3::uuid[]))
  `, [tenantId, SOURCE_REF, groupMembers, actorId]);
  await client.query(`
    UPDATE authz.plane_membership
    SET status='suspended',effective_until=COALESCE(effective_until,clock_timestamp()),updated_by=$4::uuid
    WHERE tenant_id=$1::uuid AND source_type='seed' AND source_ref=$2 AND status='active'
      AND NOT (id=ANY($3::uuid[]))
  `, [tenantId, SOURCE_REF, memberships, actorId]);
  await client.query(`
    UPDATE authz.principal_group
    SET status='suspended',updated_by=$4::uuid
    WHERE tenant_id=$1::uuid AND source_type='seed' AND source_ref=$2 AND status='active'
      AND NOT (id=ANY($3::uuid[]))
  `, [tenantId, SOURCE_REF, groups, actorId]);
  await client.query(`
    UPDATE authz.role
    SET status='suspended',updated_by=$4::uuid
    WHERE tenant_id=$1::uuid AND source_type='seed' AND source_ref=$2 AND status='active'
      AND NOT (id=ANY($3::uuid[]))
  `, [tenantId, SOURCE_REF, roles, actorId]);
}

async function ensureProvisionActor(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  tenantId: string,
  tenantCode: string,
): Promise<string> {
  const code = "seed.three-plane-provisioner";
  const existing = await client.query<{ id: string }>(
    "SELECT id::text AS id FROM master.principal WHERE tenant_id=$1::uuid AND code=$2",
    [tenantId, code],
  );
  const actorId = existing.rows[0]?.id ?? deterministicUuid(plane, tenantCode, "principal", code);
  await client.query(
    "SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_principal_id', $2, true)",
    [tenantId, actorId],
  );
  await client.query(`
    INSERT INTO master.principal (
      id,tenant_id,code,name,principal_type,provisioning_source,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,'Three-plane seed provisioner','service_account','internal','active',$4::jsonb,$1::uuid)
    ON CONFLICT (tenant_id,code) DO UPDATE SET
      name=EXCLUDED.name,status='active',metadata=EXCLUDED.metadata,updated_by=$1::uuid
    WHERE (master.principal.name,master.principal.status,master.principal.metadata)
      IS DISTINCT FROM (EXCLUDED.name,'active'::master.principal_status_d,EXCLUDED.metadata)
  `, [actorId, tenantId, code, JSON.stringify(seedMetadata(inputs, plane, { purpose: "audit_actor" }))]);
  return actorId;
}

async function applyTenants(client: QueryClient, inputs: ProvisionInputs, plane: ProvisionPlane): Promise<void> {
  for (const tenant of inputs.manifest.tenants) {
    const plan = await one<{ id: string }>(client,
      "SELECT id::text AS id FROM control.subscription_plan WHERE code=$1 AND status='active'",
      [tenant.subscriptionPlans[plane]]);
    await client.query(`
      INSERT INTO master.tenant (
        id, code, name, display_name, realm_key, subscription_plan_id, status, metadata, created_by
      ) VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid,'active',$7::jsonb,$8::uuid)
      ON CONFLICT (realm_key, code) DO UPDATE SET
        name=EXCLUDED.name, display_name=EXCLUDED.display_name, status='active',
        subscription_plan_id=EXCLUDED.subscription_plan_id,
        metadata=master.tenant.metadata || EXCLUDED.metadata, updated_by=EXCLUDED.created_by
      WHERE (master.tenant.name,master.tenant.display_name,master.tenant.subscription_plan_id,master.tenant.status,master.tenant.metadata)
        IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.display_name,EXCLUDED.subscription_plan_id,'active',master.tenant.metadata || EXCLUDED.metadata)
    `, [tenant.id, tenant.code, tenant.name, tenant.displayName, inputs.manifest.realmKey,
      plan.id,
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
      WHERE (authz.scope_target.display_name,authz.scope_target.status,authz.scope_target.metadata)
        IS DISTINCT FROM (EXCLUDED.display_name,'active'::authz.scope_status_d,EXCLUDED.metadata)
    `, [deterministicUuid(plane, tenant.code, "scope", "tenant"), tenant.id, tenant.code,
      tenant.displayName, JSON.stringify(seedMetadata(inputs, plane)), inputs.manifest.systemPrincipalId]);
  }
}

async function applyPlaneResources(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  provisionActors: ReadonlyMap<string, string>,
): Promise<void> {
  if (plane === "neon") {
    const resources = legalEntityResources(inputs);
    const legalEntityIds = new Map<string, string>();
    for (const resource of resources) {
      const tenant = inputs.manifest.tenants.find((item) => item.code === resource.tenantCode)!;
      const actorId = provisionActors.get(tenant.id)!;
      const resourceId = deterministicUuid(plane, tenant.code, "legal-entity", resource.scopeKey);
      const parentId = resource.parentScopeKey
        ? legalEntityIds.get(`${tenant.code}:${resource.parentScopeKey}`)
        : undefined;
      if (resource.parentScopeKey && !parentId) {
        throw new Error(`unresolved legal entity parent: ${tenant.code}/${resource.parentScopeKey}`);
      }
      await client.query(
        "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
        [tenant.id, actorId],
      );
      await client.query(`
        INSERT INTO master.legal_entity (
          id,tenant_id,code,name,display_name,legal_name,entity_type,
          parent_legal_entity_id,registration_country_code,functional_currency,
          reporting_currency,logo_asset_ref,metadata,status,created_by
        ) VALUES ($1::uuid,$2::uuid,$3,$4,$4,$5,'company',$11::uuid,$6,$7,$8,$9,$10::jsonb,'active',$12::uuid)
        ON CONFLICT (tenant_id,code) DO UPDATE SET
          name=EXCLUDED.name,display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,
          registration_country_code=EXCLUDED.registration_country_code,
          functional_currency=EXCLUDED.functional_currency,reporting_currency=EXCLUDED.reporting_currency,
          logo_asset_ref=COALESCE(EXCLUDED.logo_asset_ref,master.legal_entity.logo_asset_ref),
          metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
        WHERE (master.legal_entity.name,master.legal_entity.display_name,master.legal_entity.legal_name,
               master.legal_entity.registration_country_code,master.legal_entity.functional_currency,
               master.legal_entity.reporting_currency,master.legal_entity.logo_asset_ref,master.legal_entity.metadata,master.legal_entity.status)
          IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.display_name,EXCLUDED.legal_name,
               EXCLUDED.registration_country_code,EXCLUDED.functional_currency,
               EXCLUDED.reporting_currency,COALESCE(EXCLUDED.logo_asset_ref,master.legal_entity.logo_asset_ref),EXCLUDED.metadata,EXCLUDED.status)
      `, [resourceId, tenant.id, resource.code, resource.name, resource.legalName,
        resource.registrationCountryCode, resource.functionalCurrency, resource.reportingCurrency,
        resource.logoAssetRef ?? null,
        JSON.stringify(seedMetadata(inputs, plane, { externalScopeKey: resource.scopeKey })), parentId ?? null, actorId]);
      const actual = await one<{ id: string; parentId: string | null }>(client,
        `SELECT id::text AS id,parent_legal_entity_id::text AS "parentId"
         FROM master.legal_entity WHERE tenant_id=$1::uuid AND code=$2`,
        [tenant.id, resource.code]);
      if (actual.parentId !== (parentId ?? null)) {
        throw new Error(`legal entity hierarchy conflict: ${tenant.code}/${resource.scopeKey}`);
      }
      legalEntityIds.set(`${tenant.code}:${resource.scopeKey}`, actual.id);
      await upsertChildScope(client, inputs, plane, tenant.id, "legal_entity", resource.scopeKey, actual.id, resource.name, actorId);
    }
    for (const tenant of inputs.manifest.tenants) {
      await applyNeonScenarioFoundation(client, inputs, tenant.id, tenant.code, provisionActors.get(tenant.id)!);
    }
  }
  if (plane === "mesh") {
    for (const resource of networkAccountResources(inputs)) {
      const tenant = inputs.manifest.tenants.find((item) => item.code === resource.tenantCode)!;
      const actorId = provisionActors.get(tenant.id)!;
      const resourceId = deterministicUuid(plane, tenant.code, "network-account", resource.scopeKey);
      await client.query(
        "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
        [tenant.id, actorId],
      );
      await client.query(`
        INSERT INTO mesh.network_account (
          id,tenant_id,account_code,display_name,legal_name,network_role,
          default_currency,logo_asset_ref,capabilities,status,metadata,created_by
        ) VALUES ($1::uuid,$2::uuid,$3,$4,$4,$5,'USD',$6,'{}'::jsonb,'active',$7::jsonb,$8::uuid)
        ON CONFLICT (account_code) DO UPDATE SET
          display_name=EXCLUDED.display_name,legal_name=EXCLUDED.legal_name,
          network_role=EXCLUDED.network_role,
          logo_asset_ref=COALESCE(EXCLUDED.logo_asset_ref,mesh.network_account.logo_asset_ref),
          status='active',metadata=EXCLUDED.metadata,
          updated_by=EXCLUDED.created_by
        WHERE mesh.network_account.tenant_id=EXCLUDED.tenant_id
          AND (mesh.network_account.display_name,mesh.network_account.legal_name,
               mesh.network_account.network_role,mesh.network_account.logo_asset_ref,
               mesh.network_account.status,mesh.network_account.metadata)
            IS DISTINCT FROM (EXCLUDED.display_name,EXCLUDED.legal_name,
               EXCLUDED.network_role,COALESCE(EXCLUDED.logo_asset_ref,mesh.network_account.logo_asset_ref),
               EXCLUDED.status,EXCLUDED.metadata)
      `, [resourceId, tenant.id, resource.accountCode, resource.name, resource.networkRole,
        resource.logoAssetRef ?? null,
        JSON.stringify(seedMetadata(inputs, plane, { externalScopeKey: resource.scopeKey })), actorId]);
      const actual = await one<{ id: string; tenantId: string }>(client,
        "SELECT id::text AS id,tenant_id::text AS \"tenantId\" FROM mesh.network_account WHERE account_code=$1",
        [resource.accountCode]);
      if (actual.tenantId !== tenant.id) throw new Error(`network account tenant conflict: ${resource.scopeKey}`);
      await upsertChildScope(client, inputs, plane, tenant.id, "network_account", resource.scopeKey, actual.id, resource.name, actorId);
    }
  }
}

async function applyTenantProfile(
  client: QueryClient,
  inputs: ProvisionInputs,
  plane: ProvisionPlane,
  tenantId: string,
  tenantCode: string,
  actorId: string,
): Promise<void> {
  const pack = inputs.scenarioPacks[tenantCode];
  if (!pack) throw new Error(`missing tenant scenario pack: ${tenantCode}`);
  await client.query(
    "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
    [tenantId, actorId],
  );
  const profile = pack.tenantProfile;
  await client.query(`
    INSERT INTO master.tenant_profile (
      id,tenant_id,country_code,locale_code,timezone_code,language_code,
      date_format,number_format,week_start,weekend_days,logo_asset_ref,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::smallint[],$11,$12::jsonb,$13::uuid)
    ON CONFLICT (tenant_id) DO UPDATE SET
      country_code=EXCLUDED.country_code,locale_code=EXCLUDED.locale_code,
      timezone_code=EXCLUDED.timezone_code,language_code=EXCLUDED.language_code,
      date_format=EXCLUDED.date_format,number_format=EXCLUDED.number_format,
      week_start=EXCLUDED.week_start,weekend_days=EXCLUDED.weekend_days,
      logo_asset_ref=COALESCE(EXCLUDED.logo_asset_ref,master.tenant_profile.logo_asset_ref),
      metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
    WHERE (master.tenant_profile.country_code,master.tenant_profile.locale_code,
      master.tenant_profile.timezone_code,master.tenant_profile.language_code,
      master.tenant_profile.date_format,master.tenant_profile.number_format,
      master.tenant_profile.week_start,master.tenant_profile.weekend_days,
      master.tenant_profile.logo_asset_ref,master.tenant_profile.metadata) IS DISTINCT FROM
      (EXCLUDED.country_code,EXCLUDED.locale_code,EXCLUDED.timezone_code,
      EXCLUDED.language_code,EXCLUDED.date_format,EXCLUDED.number_format,
      EXCLUDED.week_start,EXCLUDED.weekend_days,
      COALESCE(EXCLUDED.logo_asset_ref,master.tenant_profile.logo_asset_ref),EXCLUDED.metadata)
  `, [deterministicUuid(plane, tenantCode, "tenant-profile"), tenantId,
    profile.countryCode, profile.localeCode, profile.timezoneCode, profile.languageCode,
    profile.dateFormat, profile.numberFormat, profile.weekStart, profile.weekendDays,
    profile.logoAssetRef ?? null,
    JSON.stringify(seedMetadata(inputs, plane, { complexity: pack.complexity })), actorId]);
}

async function applyNeonScenarioFoundation(
  client: QueryClient,
  inputs: ProvisionInputs,
  tenantId: string,
  tenantCode: string,
  actorId: string,
): Promise<void> {
  const pack = inputs.scenarioPacks[tenantCode];
  if (!pack) throw new Error(`missing Neon scenario pack: ${tenantCode}`);
  await client.query(
    "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
    [tenantId, actorId],
  );
  for (const company of pack.companyCodes) {
    const legalEntity = await one<{ id: string }>(client, `
      SELECT id::text AS id FROM master.legal_entity
      WHERE tenant_id=$1::uuid AND metadata->>'externalScopeKey'=$2
    `, [tenantId, company.legalEntityScopeKey]);
    await client.query(`
      INSERT INTO master.company_code (
        id,tenant_id,legal_entity_id,code,name,display_name,functional_currency,
        country_code,fiscal_year_start_month,timezone_code,locale_code,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$5,$6,$7,$8,$9,$10,$11::jsonb,'active',$12::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        legal_entity_id=EXCLUDED.legal_entity_id,name=EXCLUDED.name,display_name=EXCLUDED.display_name,
        functional_currency=EXCLUDED.functional_currency,country_code=EXCLUDED.country_code,
        fiscal_year_start_month=EXCLUDED.fiscal_year_start_month,timezone_code=EXCLUDED.timezone_code,
        locale_code=EXCLUDED.locale_code,metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
      WHERE (master.company_code.legal_entity_id,master.company_code.name,master.company_code.display_name,
        master.company_code.functional_currency,master.company_code.country_code,
        master.company_code.fiscal_year_start_month,master.company_code.timezone_code,
        master.company_code.locale_code,master.company_code.metadata,master.company_code.status)
        IS DISTINCT FROM (EXCLUDED.legal_entity_id,EXCLUDED.name,EXCLUDED.display_name,
        EXCLUDED.functional_currency,EXCLUDED.country_code,EXCLUDED.fiscal_year_start_month,
        EXCLUDED.timezone_code,EXCLUDED.locale_code,EXCLUDED.metadata,EXCLUDED.status)
    `, [deterministicUuid("neon", tenantCode, "company-code", company.code), tenantId,
      legalEntity.id, company.code, company.name, company.functionalCurrency, company.countryCode,
      company.fiscalYearStartMonth, company.timezoneCode, company.localeCode,
      JSON.stringify(seedMetadata(inputs, "neon", {
        legalEntityScopeKey: company.legalEntityScopeKey,
        companyPurpose: company.companyPurpose,
        readinessProfile: company.readinessProfile,
        ...(company.logoAssetRef ? { logoAssetRef: company.logoAssetRef } : {}),
      })), actorId]);
  }
  await applyCompanyReadinessBaselines(client, inputs, tenantId, tenantCode, pack, actorId);

  const operatingOrganizationIds = new Map<string, string>();
  for (const organization of pack.operatingOrganizations) {
    const organizationId = deterministicUuid("neon", tenantCode, "operating-organization", organization.code);
    const parentId = organization.parentCode
      ? operatingOrganizationIds.get(organization.parentCode)
      : undefined;
    if (organization.parentCode && !parentId) {
      throw new Error(`unresolved operating organization parent: ${tenantCode}/${organization.parentCode}`);
    }
    await client.query(`
      INSERT INTO master.operating_organization (
        id,tenant_id,code,name,display_name,domain,parent_operating_organization_id,
        metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3,$4,$4,$5,$8::uuid,$6::jsonb,'active',$7::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        name=EXCLUDED.name,display_name=EXCLUDED.display_name,domain=EXCLUDED.domain,
        metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
      WHERE (master.operating_organization.name,master.operating_organization.display_name,
        master.operating_organization.domain,master.operating_organization.metadata,
        master.operating_organization.status) IS DISTINCT FROM
        (EXCLUDED.name,EXCLUDED.display_name,EXCLUDED.domain,EXCLUDED.metadata,EXCLUDED.status)
    `, [organizationId,
      tenantId, organization.code, organization.name, organization.domain,
      JSON.stringify(seedMetadata(inputs, "neon")), actorId, parentId ?? null]);
    const actual = await one<{ id: string; parentId: string | null }>(client, `
      SELECT id::text AS id,parent_operating_organization_id::text AS "parentId"
      FROM master.operating_organization WHERE tenant_id=$1::uuid AND code=$2
    `, [tenantId, organization.code]);
    if (actual.parentId !== (parentId ?? null)) {
      throw new Error(`operating organization hierarchy conflict: ${tenantCode}/${organization.code}`);
    }
    operatingOrganizationIds.set(organization.code, actual.id);
  }
  for (const assignment of pack.operatingOrganizationCompanyAssignments) {
    const coordinate = await one<{ organizationId: string; companyId: string }>(client, `
      SELECT organization.id::text AS "organizationId",company.id::text AS "companyId"
      FROM master.operating_organization organization
      JOIN master.company_code company ON company.tenant_id=organization.tenant_id
      WHERE organization.tenant_id=$1::uuid AND organization.code=$2 AND company.code=$3
    `, [tenantId, assignment.organizationCode, assignment.companyCode]);
    await client.query(`
      INSERT INTO master.operating_organization_company_assignment (
        id,tenant_id,operating_organization_id,company_code_id,participation_role,
        effective_from,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,DATE '2025-01-01',$6::jsonb,'active',$7::uuid)
      ON CONFLICT (tenant_id,operating_organization_id,company_code_id,effective_from) DO UPDATE SET
        participation_role=EXCLUDED.participation_role,metadata=EXCLUDED.metadata,
        status='active',updated_by=EXCLUDED.created_by
      WHERE (master.operating_organization_company_assignment.participation_role,
        master.operating_organization_company_assignment.metadata,
        master.operating_organization_company_assignment.status) IS DISTINCT FROM
        (EXCLUDED.participation_role,EXCLUDED.metadata,EXCLUDED.status)
    `, [deterministicUuid("neon", tenantCode, "operating-organization-company",
      assignment.organizationCode, assignment.companyCode), tenantId, coordinate.organizationId,
      coordinate.companyId, assignment.participationRole,
      JSON.stringify(seedMetadata(inputs, "neon")), actorId]);
  }

  for (const type of pack.orgUnitTypes) {
    await client.query(`
      INSERT INTO control.org_unit_type (
        id,tenant_id,code,name,level_order,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,'active',$7::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        name=EXCLUDED.name,level_order=EXCLUDED.level_order,metadata=EXCLUDED.metadata,
        status='active',updated_by=EXCLUDED.created_by
      WHERE (control.org_unit_type.name,control.org_unit_type.level_order,
        control.org_unit_type.metadata,control.org_unit_type.status) IS DISTINCT FROM
        (EXCLUDED.name,EXCLUDED.level_order,EXCLUDED.metadata,EXCLUDED.status)
    `, [deterministicUuid("neon", tenantCode, "org-unit-type", type.code), tenantId,
      type.code, type.name, type.levelOrder, JSON.stringify(seedMetadata(inputs, "neon")), actorId]);
  }
  const orgUnitIds = new Map<string, string>();
  for (const unit of pack.orgUnits) {
    const type = await one<{ id: string }>(client,
      "SELECT id::text AS id FROM control.org_unit_type WHERE tenant_id=$1::uuid AND code=$2",
      [tenantId, unit.typeCode]);
    const unitId = deterministicUuid("neon", tenantCode, "org-unit", unit.code);
    const parentId = unit.parentCode ? orgUnitIds.get(unit.parentCode) : undefined;
    if (unit.parentCode && !parentId) {
      throw new Error(`unresolved organization unit parent: ${tenantCode}/${unit.parentCode}`);
    }
    await client.query(`
      INSERT INTO master.org_unit (
        id,tenant_id,org_unit_type_id,parent_org_unit_id,code,name,display_name,
        sort_order,metadata,status,created_by
      ) VALUES ($1::uuid,$2::uuid,$3::uuid,$9::uuid,$4,$5,$5,$6,$7::jsonb,'active',$8::uuid)
      ON CONFLICT (tenant_id,code) DO UPDATE SET
        org_unit_type_id=EXCLUDED.org_unit_type_id,name=EXCLUDED.name,display_name=EXCLUDED.display_name,
        sort_order=EXCLUDED.sort_order,metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
      WHERE (master.org_unit.org_unit_type_id,master.org_unit.name,master.org_unit.display_name,
        master.org_unit.sort_order,master.org_unit.metadata,master.org_unit.status) IS DISTINCT FROM
        (EXCLUDED.org_unit_type_id,EXCLUDED.name,EXCLUDED.display_name,
        EXCLUDED.sort_order,EXCLUDED.metadata,EXCLUDED.status)
    `, [unitId, tenantId,
      type.id, unit.code, unit.name, unit.sortOrder,
      JSON.stringify(seedMetadata(inputs, "neon")), actorId, parentId ?? null]);
    const actual = await one<{ id: string; parentId: string | null }>(client, `
      SELECT id::text AS id,parent_org_unit_id::text AS "parentId"
      FROM master.org_unit WHERE tenant_id=$1::uuid AND code=$2
    `, [tenantId, unit.code]);
    if (actual.parentId !== (parentId ?? null)) {
      throw new Error(`organization unit hierarchy conflict: ${tenantCode}/${unit.code}`);
    }
    orgUnitIds.set(unit.code, actual.id);
  }
}

async function applyCompanyReadinessBaselines(
  client: QueryClient,
  inputs: ProvisionInputs,
  tenantId: string,
  tenantCode: string,
  pack: ProvisionInputs["scenarioPacks"][string],
  actorId: string,
): Promise<void> {
  const chartId = deterministicUuid("neon", tenantCode, "finance-baseline", "chart");
  await client.query(`
    INSERT INTO master.chart_of_account(
      id,tenant_id,code,name,framework,account_range,metadata,status,created_by
    ) VALUES($1::uuid,$2::uuid,$3,$4,'DEMO','1000-9999',$5::jsonb,'active',$6::uuid)
    ON CONFLICT(tenant_id,code) DO UPDATE SET
      name=EXCLUDED.name,framework=EXCLUDED.framework,account_range=EXCLUDED.account_range,
      metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
  `, [chartId, tenantId, `${tenantCode}.coa`, `${tenantCode} Demo Chart of Accounts`,
    JSON.stringify(seedMetadata(inputs, "neon", { readinessProfile: "finance_baseline_v1" })), actorId]);

  for (const [companyIndex, company] of pack.companyCodes.entries()) {
    const companyId = (await one<{ id: string }>(client,
      "SELECT id::text AS id FROM master.company_code WHERE tenant_id=$1::uuid AND code=$2 AND status='active'",
      [tenantId, company.code])).id;
    const bookId = deterministicUuid("neon", tenantCode, "finance-baseline", "book", company.code);
    await client.query(`
      INSERT INTO master.ledger_book(
        id,tenant_id,code,name,category,reporting_standard,base_currency_code,is_primary,
        metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3,$4,'statutory','DEMO',$5,$6,$7::jsonb,'active',$8::uuid)
      ON CONFLICT(tenant_id,code) DO UPDATE SET
        name=EXCLUDED.name,base_currency_code=EXCLUDED.base_currency_code,is_primary=EXCLUDED.is_primary,
        metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
    `, [bookId, tenantId, `${company.code}.primary`, `${company.name} Primary Book`, company.functionalCurrency,
      companyIndex === 0, JSON.stringify(seedMetadata(inputs, "neon", { readinessProfile: company.readinessProfile })), actorId]);
    await client.query(`
      INSERT INTO master.company_code_chart_assignment(
        id,tenant_id,company_code_id,chart_of_account_id,assignment_type,is_primary,
        effective_from,metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'operating',true,DATE '2026-01-01',$5::jsonb,'active',$6::uuid)
      ON CONFLICT(tenant_id,company_code_id,chart_of_account_id,assignment_type) DO UPDATE SET
        is_primary=true,effective_from=EXCLUDED.effective_from,metadata=EXCLUDED.metadata,
        status='active',updated_by=EXCLUDED.created_by
    `, [deterministicUuid("neon", tenantCode, "finance-baseline", "chart-assignment", company.code),
      tenantId, companyId, chartId, JSON.stringify(seedMetadata(inputs, "neon")), actorId]);
    await client.query(`
      INSERT INTO master.company_code_book_assignment(
        id,tenant_id,company_code_id,book_id,effective_from,priority,metadata,status,created_by
      ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,DATE '2026-01-01',100,$5::jsonb,'active',$6::uuid)
      ON CONFLICT(tenant_id,company_code_id,book_id,effective_from) DO UPDATE SET
        priority=100,metadata=EXCLUDED.metadata,status='active',updated_by=EXCLUDED.created_by
    `, [deterministicUuid("neon", tenantCode, "finance-baseline", "book-assignment", company.code),
      tenantId, companyId, bookId, JSON.stringify(seedMetadata(inputs, "neon")), actorId]);

    for (let period = 1; period <= 12; period += 1) {
      const start = new Date(Date.UTC(2026, company.fiscalYearStartMonth - 1 + period - 1, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      const code = `FY2026-P${String(period).padStart(2, "0")}`;
      await client.query(`
        INSERT INTO master.fiscal_period(
          id,tenant_id,company_code_id,code,name,fiscal_year,period_number,period_type,
          start_date,end_date,opened_at,opened_by,sort_order,metadata,status,created_by
        ) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,2026,$6,'normal',$7::date,$8::date,
          TIMESTAMPTZ '2026-01-01T00:00:00Z',$9::uuid,$6,$10::jsonb,'open',$9::uuid)
        ON CONFLICT(tenant_id,company_code_id,code) DO UPDATE SET
          name=EXCLUDED.name,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,
          metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
      `, [deterministicUuid("neon", tenantCode, "finance-baseline", "period", company.code, code),
        tenantId, companyId, code, `${company.name} ${code}`, period, startDate, endDate, actorId,
        JSON.stringify(seedMetadata(inputs, "neon", { readinessProfile: company.readinessProfile }))]);
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
  actorId: string,
): Promise<void> {
  const root = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.scope_target WHERE tenant_id=$1::uuid AND scope_kind='tenant'",
    [tenantId]);
  const existing = await client.query<{ id: string }>(`
    SELECT id::text AS id FROM authz.scope_target
    WHERE tenant_id=$1::uuid AND scope_kind=$2 AND target_id=$3::uuid
  `, [tenantId, scopeKind, targetId]);
  if (existing.rows.length > 1) throw new Error(`duplicate ${plane} resource scope: ${scopeKind}/${targetId}`);
  if (existing.rows[0]) {
    await client.query(`
      UPDATE authz.scope_target
      SET display_name=$2,status='active',metadata=metadata || $3::jsonb,updated_by=$4::uuid
      WHERE id=$1::uuid
        AND (display_name IS DISTINCT FROM $2 OR status IS DISTINCT FROM 'active' OR metadata IS DISTINCT FROM metadata || $3::jsonb)
    `, [existing.rows[0].id, name,
      JSON.stringify(seedMetadata(inputs, plane, { externalScopeKey: scopeKey })), actorId]);
    return;
  }
  await client.query(`
    INSERT INTO authz.scope_target (
      id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,
      display_name,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7,'active',$8::jsonb,$9::uuid)
    ON CONFLICT (tenant_id,scope_kind,scope_key) DO UPDATE SET
      display_name=EXCLUDED.display_name,status='active',metadata=EXCLUDED.metadata,
      updated_by=EXCLUDED.created_by
    WHERE (authz.scope_target.display_name,authz.scope_target.status,authz.scope_target.metadata)
      IS DISTINCT FROM (EXCLUDED.display_name,'active'::authz.scope_status_d,EXCLUDED.metadata)
  `, [databaseManagedScopeUuid(tenantId, scopeKind, targetId), tenantId,
    scopeKind, scopeKey, targetId, root.id, name,
    JSON.stringify(seedMetadata(inputs, plane)), actorId]);
}

async function applyEmbeddedPermissions(
  client: QueryClient,
  pack: ProvisionInputs["authorizationPacks"][ProvisionPlane],
  plane: ProvisionPlane,
): Promise<void> {
  const operations = pack.permissionCatalog.operations ?? [];
  if (operations.length === 0) return;
  for (const operation of operations) {
    const module = await one<{ id: string }>(client,
      "SELECT id::text AS id FROM master.module WHERE code=$1 AND status='active'",
      [operation.moduleCode ?? "fnd"]);
    await client.query(`
      INSERT INTO authz.permission (
        id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,
        requires_sod,is_shareable,is_delegable,metadata,status,created_by
      ) VALUES ($1::uuid,$2,$3::authz.permission_kind_d,$4::uuid,$5,$6,$7,$8,$9,$10::jsonb,'published',$11::uuid)
      ON CONFLICT (canonical_code) DO UPDATE SET
        permission_kind=EXCLUDED.permission_kind,module_id=EXCLUDED.module_id,
        risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,
        requires_sod=EXCLUDED.requires_sod,is_shareable=EXCLUDED.is_shareable,
        is_delegable=EXCLUDED.is_delegable,metadata=EXCLUDED.metadata,
        status='published',updated_by=EXCLUDED.created_by
      WHERE (authz.permission.permission_kind,authz.permission.module_id,authz.permission.risk_tier,
             authz.permission.requires_mfa,authz.permission.requires_sod,authz.permission.is_shareable,
             authz.permission.is_delegable,authz.permission.metadata,authz.permission.status)
        IS DISTINCT FROM (EXCLUDED.permission_kind,EXCLUDED.module_id,EXCLUDED.risk_tier,
             EXCLUDED.requires_mfa,EXCLUDED.requires_sod,EXCLUDED.is_shareable,
             EXCLUDED.is_delegable,EXCLUDED.metadata,'published'::authz.catalog_status_d)
    `, [operation.permissionId, operation.canonicalPermissionCode, operation.permissionKind ?? "entity_operation", module.id,
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

async function applyPermissionScopeCompatibility(
  client: QueryClient,
  plane: ProvisionPlane,
  contract: ProvisionInputs["authorizationPacks"][ProvisionPlane]["permissionScopeCompatibility"],
): Promise<void> {
  if (contract.defaultScopeBehavior !== "deny_undeclared" || contract.permissions.length === 0) {
    throw new Error(`${plane} exact permission scope compatibility is missing`);
  }
  const declarations = contract.permissions.flatMap((permission) => permission.scopes.map((scope) => ({
    permission_code: permission.permissionCode,
    scope_kind: scope.kind,
    propagation_mode: scope.propagation,
  })));
  await client.query(`
    WITH declared AS (
      SELECT permission_code,scope_kind::authz.scope_kind_d,propagation_mode::authz.propagation_mode_d
      FROM jsonb_to_recordset($1::jsonb) AS row(permission_code text,scope_kind text,propagation_mode text)
    ), retired AS (
      UPDATE authz.permission_scope_kind compatibility
         SET status='suspended',updated_by=$2::uuid
        FROM authz.permission permission
       WHERE permission.id=compatibility.permission_id
         AND permission.metadata #>> '{_seed,source}'=$3
         AND compatibility.status='active'
         AND NOT EXISTS (
           SELECT 1 FROM declared
            WHERE declared.permission_code=permission.canonical_code
              AND declared.scope_kind=compatibility.scope_kind
              AND declared.propagation_mode=compatibility.propagation_mode
         )
      RETURNING compatibility.id
    )
    INSERT INTO authz.permission_scope_kind(
      permission_id,scope_kind,propagation_mode,status,created_by
    )
    SELECT permission.id,declared.scope_kind,declared.propagation_mode,
           'active',$2::uuid
    FROM declared JOIN authz.permission permission ON permission.canonical_code=declared.permission_code
    WHERE permission.status='published'
    ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE
      SET status='active',updated_by=EXCLUDED.created_by
      WHERE authz.permission_scope_kind.status<>'active'
  `, [JSON.stringify(declarations), SYSTEM_PRINCIPAL, SOURCE_REF]);
  const missing = await client.query<{ canonical_code: string }>(`
    SELECT permission.canonical_code
    FROM authz.permission permission
    WHERE permission.status='published'
      AND permission.metadata #>> '{_seed,source}'=$1
      AND NOT EXISTS (
        SELECT 1 FROM authz.permission_scope_kind compatibility
        WHERE compatibility.permission_id=permission.id AND compatibility.status='active'
      )
    ORDER BY permission.canonical_code
  `, [SOURCE_REF]);
  if (missing.rowCount) throw new Error(`${plane} published permissions lack exact scope declarations: ${missing.rows.map((row) => row.canonical_code).join(",")}`);
}

async function applyRole(
  client: QueryClient,
  role: TenantAuthorityProjection["definitions"]["roles"][number],
  grants: readonly TenantAuthorityProjection["definitions"]["rolePermissions"][number][],
): Promise<string> {
  if (grants.length === 0) throw new Error(`${role.code} has zero compiled permissions`);
  const resolved = await client.query<{ id: string; code: string }>(`
    SELECT permission.id::text AS id,permission.canonical_code AS code
    FROM authz.permission permission
    JOIN jsonb_to_recordset($1::jsonb) AS expected("permissionId" uuid,"permissionCode" text)
      ON expected."permissionId"=permission.id AND expected."permissionCode"=permission.canonical_code
    WHERE permission.status='published'
    ORDER BY permission.id
  `, [JSON.stringify(grants)]);
  if (resolved.rows.length !== grants.length) {
    const actual = new Set(resolved.rows.map((permission) => `${permission.id}:${permission.code}`));
    const missing = grants.filter((grant) => !actual.has(`${grant.permissionId}:${grant.permissionCode}`));
    throw new Error(`${role.code} has missing compiled permissions: ${missing.map((grant) => grant.permissionCode).join(",")}`);
  }
  const desiredMetadata = JSON.stringify({ _seed: { source: SOURCE_REF, externalRoleId: role.templateRoleId, sourceChecksum: role.sourceChecksum } });
  const desiredPermissionIds = [...new Set(grants.map((grant) => grant.permissionId))].sort();
  const current = await client.query<{ id: string; exact: boolean }>(`
    SELECT candidate.id::text AS id,
      candidate.name=$3 AND candidate.status='active' AND candidate.metadata=$4::jsonb
      AND (SELECT array_agg(permission_id::text ORDER BY permission_id::text) FROM authz.role_permission WHERE tenant_id=$1::uuid AND role_id=candidate.id)
          IS NOT DISTINCT FROM $5::text[] AS exact
    FROM authz.role candidate
    WHERE candidate.tenant_id=$1::uuid AND candidate.code=$2
  `, [role.tenantId, role.code, role.name, desiredMetadata, desiredPermissionIds]);
  if (current.rows[0]) {
    if (current.rows[0].id !== role.id) throw new Error(`${role.code} conflicts with compiled role ID ${role.id}`);
    if (current.rows[0].exact) return current.rows[0].id;
  }
  await client.query(`
    INSERT INTO authz.role (
      id,tenant_id,code,name,role_kind,source_type,source_ref,status,metadata,created_by
    ) VALUES ($1::uuid,$2::uuid,$3,$4,'system','seed',$5,'draft',$6::jsonb,$7::uuid)
    ON CONFLICT (tenant_id,code) DO UPDATE SET
      name=EXCLUDED.name,status='suspended',metadata=EXCLUDED.metadata,updated_by=EXCLUDED.created_by
  `, [role.id, role.tenantId, role.code, role.name, SOURCE_REF,
    desiredMetadata,
    SYSTEM_PRINCIPAL]);
  const actual = await one<{ id: string }>(client,
    "SELECT id::text AS id FROM authz.role WHERE tenant_id=$1::uuid AND code=$2",
    [role.tenantId, role.code]);
  if (actual.id !== role.id) throw new Error(`${role.code} conflicts with compiled role ID ${role.id}`);
  for (const grant of grants) {
    await client.query(`
      INSERT INTO authz.role_permission (id,tenant_id,role_id,permission_id,created_by)
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)
      ON CONFLICT (tenant_id,role_id,permission_id) DO NOTHING
    `, [grant.id, role.tenantId, actual.id, grant.permissionId, SYSTEM_PRINCIPAL]);
  }
  await client.query(`
    DELETE FROM authz.role_permission
    WHERE tenant_id=$1::uuid AND role_id=$2::uuid
      AND NOT (permission_id=ANY($3::uuid[]))
  `, [role.tenantId, actual.id, grants.map((grant) => grant.permissionId)]);
  await client.query(
    "UPDATE authz.role SET status='active',updated_by=$2::uuid WHERE id=$1::uuid AND status<>'active'",
    [actual.id, SYSTEM_PRINCIPAL],
  );
  return actual.id;
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
  membership: TenantAuthorityProjection["assignments"]["planeMemberships"][number],
): Promise<void> {
  await client.query(`
    WITH updated AS (
      UPDATE authz.plane_membership SET status='active',effective_until=NULL,
        effective_from=LEAST(effective_from, clock_timestamp()),
        metadata=$5::jsonb,updated_by=$6::uuid
      WHERE tenant_id=$2::uuid AND principal_id=$3::uuid AND status<>'revoked'
        AND (status IS DISTINCT FROM 'active' OR metadata IS DISTINCT FROM $5::jsonb OR effective_until IS NOT NULL)
      RETURNING id
    )
    INSERT INTO authz.plane_membership (
      id,tenant_id,principal_id,membership_kind,source_type,source_ref,status,
      effective_from,metadata,created_by
    )
    SELECT $1::uuid,$2::uuid,$3::uuid,'standard','seed',$4,'active',
      transaction_timestamp(),$5::jsonb,$6::uuid
    WHERE NOT EXISTS(SELECT 1 FROM authz.plane_membership WHERE tenant_id=$2::uuid AND principal_id=$3::uuid AND status<>'revoked')
  `, [membership.id, membership.tenantId, membership.principalId,
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
  const query = kind === "legal_entity" ? `
    SELECT scope.id::text AS id FROM authz.scope_target scope
    JOIN master.legal_entity resource ON resource.tenant_id=scope.tenant_id AND resource.id=scope.target_id
    WHERE scope.tenant_id=$1::uuid AND scope.scope_kind=$2 AND scope.status='active'
      AND (scope.scope_key=$3 OR resource.metadata->>'externalScopeKey'=$3)
  ` : kind === "network_account" ? `
    SELECT scope.id::text AS id FROM authz.scope_target scope
    JOIN mesh.network_account resource ON resource.tenant_id=scope.tenant_id AND resource.id=scope.target_id
    WHERE scope.tenant_id=$1::uuid AND scope.scope_kind=$2 AND scope.status='active'
      AND (scope.scope_key=$3 OR resource.metadata->>'externalScopeKey'=$3)
  ` : `
    SELECT id::text AS id FROM authz.scope_target
    WHERE tenant_id=$1::uuid AND scope_kind=$2 AND scope_key=$3 AND status='active'
  `;
  const result = await client.query<{ id: string }>(query, [tenantId, kind, scopeKey]);
  if (result.rows.length !== 1) throw new Error(`unresolved or ambiguous ${plane} scope: ${packKind}/${scopeKey}`);
  return result.rows[0]!;
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
