import { sql, type Transaction } from "kysely";

import {
  type PlaneDatabaseRegistry,
  type RuntimeDatabase,
  type RuntimePlaneKey,
} from "../runtime/plane-database-registry.js";

export interface IdentityCoordinate {
  readonly planeKey: RuntimePlaneKey;
  readonly tenantId: string;
  readonly providerCode: "keycloak";
  readonly realmKey: string;
  readonly subjectId: string;
}

export interface AdmittedIdentity {
  readonly planeKey: RuntimePlaneKey;
  readonly databasePlane: "athyper" | "neon" | "mesh";
  readonly tenantId: string;
  readonly tenantCode: string;
  readonly tenantName: string;
  readonly principalId: string;
  readonly identityBindingId: string;
  readonly principalType: string;
  readonly authEpoch: number;
  readonly membershipId: string;
  readonly membershipKind: string;
  readonly bindingStatus?: string;
  readonly bindingEffectiveFrom?: string | null;
  readonly bindingEffectiveUntil?: string | null;
  readonly membershipStatus?: string;
  readonly membershipEffectiveFrom?: string | null;
  readonly membershipEffectiveUntil?: string | null;
}

export interface IdentityAdmissionRepository {
  resolve(coordinate: IdentityCoordinate): Promise<AdmittedIdentity | null>;
  resolveCandidates(input: Omit<IdentityCoordinate, "tenantId"> & {
    readonly tenantIds: readonly string[];
  }): Promise<AdmittedIdentity[]>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SqlIdentityAdmissionRepository implements IdentityAdmissionRepository {
  constructor(private readonly databases: PlaneDatabaseRegistry) {}

  async resolve(coordinate: IdentityCoordinate): Promise<AdmittedIdentity | null> {
    if (!isUuid(coordinate.tenantId) || !coordinate.subjectId.trim() || !coordinate.realmKey.trim()) {
      return null;
    }
    const binding = this.databases.forPlane(coordinate.planeKey);
    return binding.db.transaction().execute(async (trx) => {
      await establishTenantContext(trx, coordinate.tenantId, binding.databasePlane);

      const resolved = await sql<{
        principal_id: string;
        principal_type: string;
        auth_epoch: number;
      }>`
        SELECT principal_id::text, principal_type::text, auth_epoch
        FROM master.fn_resolve_principal_identity(
          ${coordinate.tenantId}::uuid,
          ${coordinate.providerCode}::master.identity_provider_d,
          ${coordinate.realmKey},
          ${coordinate.subjectId}
        )
      `.execute(trx);
      const principal = resolved.rows[0];
      if (!principal) return null;

      await sql`
        SELECT set_config('app.current_principal_id', ${principal.principal_id}, true)
      `.execute(trx);

      const evidence = await sql<{
        tenant_code: string;
        tenant_name: string;
        identity_binding_id: string;
        membership_id: string;
        membership_kind: string;
        binding_status: string;
        membership_status: string;
        membership_effective_from: Date | string | null;
        membership_effective_until: Date | string | null;
      }>`
        SELECT
          tenant.code AS tenant_code,
          tenant.name AS tenant_name,
          identity_binding.id::text AS identity_binding_id,
          membership.id::text AS membership_id,
          membership.membership_kind::text AS membership_kind
          ,identity_binding.status::text AS binding_status
          ,membership.status::text AS membership_status
          ,membership.effective_from AS membership_effective_from
          ,membership.effective_until AS membership_effective_until
        FROM master.tenant AS tenant
        JOIN master.principal_identity_binding AS identity_binding
          ON identity_binding.tenant_id = tenant.id
         AND identity_binding.principal_id = ${principal.principal_id}::uuid
         AND identity_binding.provider_code = ${coordinate.providerCode}::master.identity_provider_d
         AND identity_binding.realm_key = lower(btrim(${coordinate.realmKey}))
         AND identity_binding.subject_id = btrim(${coordinate.subjectId})
         AND identity_binding.status = 'active'
        JOIN authz.plane_membership AS membership
          ON membership.tenant_id = tenant.id
         AND membership.principal_id = identity_binding.principal_id
         AND membership.status = 'active'
         AND membership.effective_from <= statement_timestamp()
         AND (membership.effective_until IS NULL OR membership.effective_until > statement_timestamp())
        WHERE tenant.id = ${coordinate.tenantId}::uuid
          AND tenant.status = 'active'
        ORDER BY membership.effective_from DESC, membership.id
        LIMIT 1
      `.execute(trx);
      const row = evidence.rows[0];
      if (!row) return null;

      return Object.freeze({
        planeKey: coordinate.planeKey,
        databasePlane: binding.databasePlane,
        tenantId: coordinate.tenantId,
        tenantCode: row.tenant_code,
        tenantName: row.tenant_name,
        principalId: principal.principal_id,
        identityBindingId: row.identity_binding_id,
        principalType: principal.principal_type,
        authEpoch: Number(principal.auth_epoch),
        membershipId: row.membership_id,
        membershipKind: row.membership_kind,
        bindingStatus: row.binding_status,
        bindingEffectiveFrom: null,
        bindingEffectiveUntil: null,
        membershipStatus: row.membership_status,
        membershipEffectiveFrom: isoOrNull(row.membership_effective_from),
        membershipEffectiveUntil: isoOrNull(row.membership_effective_until),
      });
    });
  }

  async resolveCandidates(
    input: Omit<IdentityCoordinate, "tenantId"> & { readonly tenantIds: readonly string[] },
  ): Promise<AdmittedIdentity[]> {
    const tenantIds = [...new Set(input.tenantIds.map((value) => value.trim().toLowerCase()))]
      .filter(isUuid)
      .slice(0, 100);
    const results = await Promise.all(tenantIds.map((tenantId) => this.resolve({ ...input, tenantId })));
    return results.filter((value): value is AdmittedIdentity => value !== null);
  }
}

async function establishTenantContext(
  trx: Transaction<Record<string, any>>,
  tenantId: string,
  databasePlane: "athyper" | "neon" | "mesh",
): Promise<void> {
  await sql`
    SELECT
      set_config('app.database_plane', ${databasePlane}, true),
      set_config('app.current_tenant_id', ${tenantId}, true)
  `.execute(trx as unknown as RuntimeDatabase);
}

export function tenantIdsFromOrganizationAliases(aliases: readonly string[]): string[] {
  return [...new Set(aliases.map((alias) => alias.trim().toLowerCase()).filter(isUuid))];
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isoOrNull(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
