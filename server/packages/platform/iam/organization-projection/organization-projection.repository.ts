import { sql } from "kysely";

import type {
  PlaneDatabaseRegistry,
  RuntimePlaneKey,
} from "../runtime/plane-database-registry.js";

export type ProjectionCeilingMode = "exact" | "subtree" | "member_companies";

export interface OrganizationProjectionCeiling {
  readonly scopeTargetId: string;
  readonly ceilingMode: ProjectionCeilingMode;
  readonly networkRoleCeiling: "buyer" | "supplier" | "both" | null;
}

export interface ActiveOrganizationProjection {
  readonly projectionId: string;
  readonly tenantId: string;
  readonly realmKey: string;
  readonly externalOrganizationId: string;
  readonly organizationAlias: string | null;
  readonly organizationName: string;
  readonly sourceVersion: number;
  readonly sourceHash: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly ceilings: readonly OrganizationProjectionCeiling[];
}

export interface ResolveOrganizationProjectionsInput {
  readonly planeKey: RuntimePlaneKey;
  readonly realmKey: string;
  readonly externalOrganizationIds: readonly string[];
  readonly providerCode?: string;
}

export interface OrganizationProjectionRepository {
  resolveActive(
    input: ResolveOrganizationProjectionsInput,
  ): Promise<readonly ActiveOrganizationProjection[]>;
}

export interface ProjectionRow {
  projection_id: string;
  tenant_id: string;
  realm_key: string;
  external_organization_id: string;
  organization_alias: string | null;
  organization_name: string;
  source_version: string | number | bigint;
  source_hash: string;
  effective_from: Date | string;
  effective_until: Date | string | null;
  scope_ceilings: unknown;
}

const REALM_PATTERN = /^[a-z][a-z0-9_.-]{1,62}$/;
const PROVIDER_PATTERN = /^[a-z][a-z0-9_.-]{1,62}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SqlOrganizationProjectionRepository
  implements OrganizationProjectionRepository {
  constructor(private readonly databases: PlaneDatabaseRegistry) {}

  async resolveActive(
    input: ResolveOrganizationProjectionsInput,
  ): Promise<readonly ActiveOrganizationProjection[]> {
    const realmKey = input.realmKey.trim().toLowerCase();
    const providerCode = (input.providerCode ?? "keycloak").trim().toLowerCase();
    const externalOrganizationIds = [...new Set(
      input.externalOrganizationIds.map((value) => value.trim()).filter(Boolean),
    )].slice(0, 200);
    if (
      !REALM_PATTERN.test(realmKey)
      || !PROVIDER_PATTERN.test(providerCode)
      || externalOrganizationIds.length === 0
    ) {
      return [];
    }

    const db = this.databases.forPlane(input.planeKey).db;
    const ids = sql.join(externalOrganizationIds.map((id) => sql.val(id)));
    const result = await sql<ProjectionRow>`
      SELECT *
      FROM authz.fn_resolve_active_application_projections(
        ${realmKey},
        ARRAY[${ids}]::text[],
        ${providerCode}
      )
    `.execute(db);
    return normalizeProjectionRows(result.rows);
  }
}

export function normalizeProjectionRows(
  rows: readonly ProjectionRow[],
): readonly ActiveOrganizationProjection[] {
  const coordinates = new Set<string>();
  return rows.map((row) => {
    const coordinate = `${row.realm_key.trim().toLowerCase()}\u0000${row.external_organization_id}`;
    if (coordinates.has(coordinate)) {
      throw new Error("IAM_PROJECTION_AMBIGUOUS");
    }
    coordinates.add(coordinate);
    if (!UUID_PATTERN.test(row.projection_id) || !UUID_PATTERN.test(row.tenant_id)) {
      throw new Error("IAM_PROJECTION_INVALID");
    }
    const sourceVersion = Number(row.source_version);
    if (!Number.isSafeInteger(sourceVersion) || sourceVersion <= 0 || !/^[a-f0-9]{64}$/.test(row.source_hash)) {
      throw new Error("IAM_PROJECTION_INVALID");
    }
    const ceilings = normalizeCeilings(row.scope_ceilings);
    if (ceilings.length === 0) throw new Error("IAM_PROJECTION_SCOPE_MISSING");
    return Object.freeze({
      projectionId: row.projection_id,
      tenantId: row.tenant_id,
      realmKey: row.realm_key.trim().toLowerCase(),
      externalOrganizationId: row.external_organization_id,
      organizationAlias: row.organization_alias,
      organizationName: row.organization_name,
      sourceVersion,
      sourceHash: row.source_hash,
      effectiveFrom: iso(row.effective_from),
      effectiveUntil: row.effective_until === null ? null : iso(row.effective_until),
      ceilings,
    });
  });
}

function normalizeCeilings(value: unknown): readonly OrganizationProjectionCeiling[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("IAM_PROJECTION_SCOPE_INVALID");
    const row = entry as Record<string, unknown>;
    const scopeTargetId = typeof row.scope_target_id === "string" ? row.scope_target_id : "";
    const ceilingMode = row.ceiling_mode;
    const networkRoleCeiling = row.network_role_ceiling;
    if (
      !UUID_PATTERN.test(scopeTargetId)
      || (ceilingMode !== "exact" && ceilingMode !== "subtree" && ceilingMode !== "member_companies")
      || (networkRoleCeiling !== null
        && networkRoleCeiling !== "buyer"
        && networkRoleCeiling !== "supplier"
        && networkRoleCeiling !== "both")
    ) {
      throw new Error("IAM_PROJECTION_SCOPE_INVALID");
    }
    return Object.freeze({ scopeTargetId, ceilingMode, networkRoleCeiling });
  });
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function projectionAllowsExactScope(
  projection: ActiveOrganizationProjection,
  scopeTargetId: string,
  networkRole?: string,
): boolean {
  return projection.ceilings.some((ceiling) =>
    ceiling.ceilingMode === "exact"
    && ceiling.scopeTargetId === scopeTargetId
    && (!networkRole
      || ceiling.networkRoleCeiling === null
      || ceiling.networkRoleCeiling === "both"
      || ceiling.networkRoleCeiling === networkRole)
  );
}
