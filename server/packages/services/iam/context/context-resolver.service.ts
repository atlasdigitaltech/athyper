import { sql } from "kysely";
import type { TenantMfaTrustPolicy } from "@athyper/auth-common";

import {
  SqlIdentityAdmissionRepository,
  type AdmittedIdentity,
} from "../identity/identity-admission.repository.js";
import {
  type PlaneDatabaseRegistry,
  type RuntimePlaneKey,
} from "../runtime/plane-database-registry.js";
import { jitProvisionPrincipal } from "../jit/jit.service.js";

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
  /** Keycloak Organization aliases. In the v2 contract each alias is tenant UUID. */
  tenantIds: string[];
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
): PlaneContextResolver {
  const identities = new SqlIdentityAdmissionRepository(databases);
  return {
    async resolve(query) {
      if (query.allowJit && query.username && query.displayName) {
        const db = databases.forPlane(query.planeKey).db;
        await Promise.all(query.tenantIds.map((tenantId) => jitProvisionPrincipal(db, {
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
        tenantIds: query.tenantIds,
        providerCode: "keycloak",
        realmKey: query.realmKey,
        subjectId: query.sub,
      });
      const organizations = query.planeKey === "mesh"
        ? await resolveMeshContexts(databases, admissions, query.workbenches)
        : resolveTenantContexts(admissions, query.planeKey, query.workbenches);
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
  planeKey: PlaneKey,
  requestedWorkbenches: readonly string[],
): Record<string, OrgMembership> {
  const roles = planeKey === "admin"
    ? (["admin"] as WorkbenchKey[])
    : normalizeWorkbenches(requestedWorkbenches, "user");
  return Object.fromEntries(admissions.map((admission) => {
    // The alias deliberately remains the Keycloak Organization alias. The
    // tenant code is presentation metadata and is never an identity coordinate.
    const alias = admission.tenantId;
    return [alias, {
      id: admission.membershipId,
      alias,
      name: admission.tenantName,
      roles,
      tenantId: admission.tenantId,
      tenantCode: admission.tenantCode,
      tenantName: admission.tenantName,
      contextType: planeKey === "admin" ? "tenant_admin" : "tenant",
      organizationId: admission.tenantId,
      organizationCode: admission.tenantCode,
      organizationName: admission.tenantName,
      authEpoch: admission.authEpoch,
    } satisfies OrgMembership];
  }));
}

async function resolveMeshContexts(
  databases: PlaneDatabaseRegistry,
  admissions: readonly AdmittedIdentity[],
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
      return rows.rows.map((row): [string, OrgMembership] => {
        const alias = `${admission.tenantId}:${row.account_id}`;
        return [alias, {
          id: row.scope_target_id,
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
          authEpoch: admission.authEpoch,
        }];
      });
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
