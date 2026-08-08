import { sql } from "kysely";
import type { TenantMfaTrustPolicy } from "@athyper/platform-iam-auth-common";

import type { AdmittedIdentity } from "../identity/identity-admission.repository.js";
import { createIdentityAdmissionCutoverRepository } from "../identity/identity-admission-cutover.js";
import { SqlIdentityShadowSink } from "../identity/sql-identity-shadow-sink.js";
import {
  type PlaneDatabaseRegistry,
  type RuntimeDatabase,
  type RuntimePlaneKey,
} from "../runtime/plane-database-registry.js";
import { PlaneIdentityProvisioningRepository } from "../jit/identity-provisioning.repository.js";
import {
  projectionAllowsExactScope,
  SqlOrganizationProjectionRepository,
  type ActiveOrganizationProjection,
  type OrganizationProjectionRepository,
} from "../organization-projection/organization-projection.repository.js";

export type PlaneKey = RuntimePlaneKey;
export type WorkbenchKey = "user" | "partner" | "admin";

export interface OrgMembership {
  id: string;
  name: string;
  alias: string;
  roles: WorkbenchKey[];
  tenantId?: string;
  tenantCode?: string;
  tenantName?: string;
  contextType?: string;
  organizationId?: string;
  organizationCode?: string;
  organizationName?: string;
  legalEntityId?: string;
  legalEntityCode?: string;
  legalEntityName?: string;
  workContextDomain?: "procurement" | "sales";
  scopeVersion?: number;
  authEpoch?: number;
  mfaTrustPolicy?: TenantMfaTrustPolicy;
}

export interface PlaneContextResponse {
  organizations: Record<string, OrgMembership>;
  contextCount: number;
  source: "db";
}

export interface PlaneContextQuery {
  planeKey: PlaneKey;
  realmKey: string;
  sub: string;
  /** KC external organization IDs from the token's organization claim (P0-G: keys, not aliases). */
  externalOrganizationIds: string[];
  workbenches: string[];
  username?: string;
  displayName?: string;
  email?: string;
  issuer?: string;
  audience?: string;
  allowJit?: boolean;
}

export interface PlaneContextResolver {
  resolve(query: PlaneContextQuery): Promise<PlaneContextResponse>;
}

const VALID_WORKBENCHES = new Set(["user", "partner", "admin"]);

export function createPlaneContextResolver(
  databases: PlaneDatabaseRegistry,
  projectionRepository: OrganizationProjectionRepository =
    new SqlOrganizationProjectionRepository(databases),
): PlaneContextResolver {
  const provisioning = new PlaneIdentityProvisioningRepository(databases);
  const identities = createIdentityAdmissionCutoverRepository(databases, {
    workflow: "login",
    sink: new SqlIdentityShadowSink(databases),
  });
  return {
    async resolve(query) {
      const db = databases.forPlane(query.planeKey).db;

      // P2-A: Resolve KC external org IDs → tenant UUIDs via projection lookup
      const projections = await projectionRepository.resolveActive({
        planeKey: query.planeKey,
        realmKey: query.realmKey,
        externalOrganizationIds: query.externalOrganizationIds,
      });
      let tenantIds = projections.map((projection) => projection.tenantId);

      // P2-B: Admin-plane staff users have no KC org memberships; fall back to
      // a cross-tenant staff-grant lookup so they can still authenticate.
      if (tenantIds.length === 0 && query.planeKey === "admin") {
        const staffTenantId = await resolveStaffTenantId(db, query.realmKey, query.sub);
        if (staffTenantId) tenantIds = [staffTenantId];
      }

      if (query.allowJit && query.username && query.displayName) {
        await Promise.all(tenantIds.map((tenantId) => provisioning.provision(query.planeKey, {
          sub: query.sub,
          username: query.username!,
          display_name: query.displayName!,
          ...(query.email ? { email: query.email } : {}),
          tenant_id: tenantId,
          realm_key: query.realmKey,
          ...(query.issuer ? { issuer: query.issuer } : {}),
          ...(query.audience ? { audience: query.audience } : {}),
        })));
      }
      const admissions = await identities.resolveCandidates({
        planeKey: query.planeKey,
        tenantIds,
        providerCode: "keycloak",
        realmKey: query.realmKey,
        subjectId: query.sub,
      });
      const organizations = query.planeKey === "mesh"
        ? await resolveMeshContexts(databases, admissions, projections, query.workbenches)
        : resolveTenantContexts(admissions, projections, query.planeKey, query.workbenches);
      return {
        organizations,
        contextCount: Object.keys(organizations).length,
        source: "db",
      };
    },
  };
}

function resolveTenantContexts(
  admissions: readonly AdmittedIdentity[],
  projections: readonly ActiveOrganizationProjection[],
  planeKey: PlaneKey,
  requestedWorkbenches: readonly string[],
): Record<string, OrgMembership> {
  const roles = planeKey === "admin"
    ? (["admin"] as WorkbenchKey[])
    : normalizeWorkbenches(requestedWorkbenches, "user");
  return Object.fromEntries(admissions.flatMap((admission) => {
    const matches = projections.filter((projection) =>
      projection.tenantId === admission.tenantId
    );
    if (matches.length === 0 && planeKey === "admin") {
      return [[admission.tenantId, {
        id: admission.membershipId,
        alias: admission.tenantId,
        name: admission.tenantName,
        roles,
        tenantId: admission.tenantId,
        tenantCode: admission.tenantCode,
        tenantName: admission.tenantName,
        contextType: "tenant_admin",
        organizationId: admission.tenantId,
        organizationCode: admission.tenantCode,
        organizationName: admission.tenantName,
        authEpoch: admission.authEpoch,
      } satisfies OrgMembership] as const];
    }
    return matches.map((projection) => {
      const alias = projection.organizationAlias ?? projection.externalOrganizationId;
      return [projection.externalOrganizationId, {
        id: projection.projectionId,
        alias,
        name: projection.organizationName,
        roles,
        tenantId: admission.tenantId,
        tenantCode: admission.tenantCode,
        tenantName: admission.tenantName,
        contextType: planeKey === "admin" ? "tenant_admin" : "tenant",
        organizationId: projection.externalOrganizationId,
        organizationCode: alias,
        organizationName: projection.organizationName,
        scopeVersion: projection.sourceVersion,
        authEpoch: admission.authEpoch,
      } satisfies OrgMembership] as const;
    });
  }));
}

async function resolveMeshContexts(
  databases: PlaneDatabaseRegistry,
  admissions: readonly AdmittedIdentity[],
  projections: readonly ActiveOrganizationProjection[],
  requestedWorkbenches: readonly string[],
): Promise<Record<string, OrgMembership>> {
  const db = databases.forPlane("mesh").db;
  const contexts = await Promise.all(admissions.map(async (admission) =>
    db.transaction().execute(async (trx) => {
      await sql`
        SELECT
          set_config('app.database_plane', 'mesh', true),
          set_config('app.current_tenant_id', ${admission.tenantId}, true),
          set_config('app.current_principal_id', ${admission.principalId}, true)
      `.execute(trx);
      const rows = await sql<{
        scope_target_id: string;
        account_id: string;
        account_code: string;
        display_name: string;
        network_role: string;
      }>`
        SELECT DISTINCT
          scope.id::text AS scope_target_id,
          account.id::text AS account_id,
          account.account_code,
          account.display_name,
          account.network_role::text
        FROM authz.group_member AS member
        JOIN authz.group_role AS group_role
          ON group_role.tenant_id = member.tenant_id
         AND group_role.group_id = member.group_id
         AND group_role.status = 'active'
         AND group_role.effective_from <= statement_timestamp()
         AND (group_role.effective_until IS NULL OR group_role.effective_until > statement_timestamp())
        JOIN authz.scope_target AS scope
          ON scope.tenant_id = group_role.tenant_id
         AND scope.id = group_role.scope_target_id
         AND scope.scope_kind = 'network_account'
         AND scope.status = 'active'
        JOIN mesh.network_account AS account
          ON account.tenant_id = scope.tenant_id
         AND account.id = scope.target_id
         AND account.status = 'active'
        WHERE member.tenant_id = ${admission.tenantId}::uuid
          AND member.principal_id = ${admission.principalId}::uuid
          AND member.status = 'active'
          AND member.effective_from <= statement_timestamp()
          AND (member.effective_until IS NULL OR member.effective_until > statement_timestamp())
        ORDER BY account.display_name, account.account_code
        LIMIT 100
      `.execute(trx);
      const tenantProjections = projections.filter((projection) =>
        projection.tenantId === admission.tenantId
      );
      return rows.rows.flatMap((row): Array<[string, OrgMembership]> =>
        tenantProjections
          .filter((projection) => projectionAllowsExactScope(
            projection,
            row.scope_target_id,
            row.network_role.toLowerCase(),
          ))
          .map((projection) => {
        const alias = `${projection.externalOrganizationId}:${row.account_id}`;
        return [alias, {
          id: projection.projectionId,
          alias,
          name: row.display_name,
          roles: meshWorkbenches(row.network_role, requestedWorkbenches),
          tenantId: admission.tenantId,
          tenantCode: admission.tenantCode,
          tenantName: admission.tenantName,
          contextType: "network_account",
          organizationId: row.account_id,
          organizationCode: row.account_code,
          organizationName: row.display_name,
          scopeVersion: projection.sourceVersion,
          authEpoch: admission.authEpoch,
        }];
          }),
      );
    }),
  ));
  return Object.fromEntries(contexts.flat().filter(([, membership]) => membership.roles.length > 0));
}

function normalizeWorkbenches(
  input: readonly string[],
  fallback: WorkbenchKey,
): WorkbenchKey[] {
  const valid = input.filter((value): value is WorkbenchKey => VALID_WORKBENCHES.has(value));
  return valid.length > 0 ? [...new Set(valid)] : [fallback];
}

function meshWorkbenches(
  networkRole: string,
  requested: readonly string[],
): WorkbenchKey[] {
  const derived: WorkbenchKey[] = networkRole.toLowerCase() === "buyer"
    ? ["user"]
    : networkRole.toLowerCase() === "both"
      ? ["user", "partner"]
      : networkRole.toLowerCase() === "platform"
        ? ["admin"]
        : ["partner"];
  const allowed = normalizeWorkbenches(requested, derived[0]!);
  return derived.filter((role) => allowed.includes(role));
}

// ── P2-A: KC external org ID → tenant UUID via authz.application_projection ──

// ── P2-B: Staff cross-tenant lookup (admin plane, no KC org memberships) ─────

async function resolveStaffTenantId(
  db: RuntimeDatabase,
  realmKey: string,
  sub: string,
): Promise<string | null> {
  const rows = await sql<{ tenant_id: string }>`
    SELECT pib.tenant_id::text
    FROM master.principal_identity_binding pib
    JOIN authz.plane_membership pm
      ON pm.tenant_id = pib.tenant_id
     AND pm.principal_id = pib.principal_id
     AND pm.membership_kind = 'staff'
     AND pm.status = 'active'
     AND pm.effective_from <= statement_timestamp()
     AND (pm.effective_until IS NULL OR pm.effective_until > statement_timestamp())
    WHERE pib.provider_code = 'keycloak'
      AND pib.realm_key = lower(btrim(${realmKey}))
      AND pib.subject_id = btrim(${sub})
      AND pib.status = 'active'
    LIMIT 1
  `.execute(db);
  return rows.rows[0]?.tenant_id ?? null;
}
