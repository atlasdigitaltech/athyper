import { sql, type Kysely, type RawBuilder, type Transaction } from "kysely";
import type { TenantMfaTrustPolicy } from "@athyper/platform-iam-auth-common";

type AnyDb = Record<string, any>;

export type PlaneKey = "neon" | "mesh" | "admin";
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
  /** Tenant IdP policy resolved from the authenticated KC broker alias. */
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
  username?: string;
  workbenches: string[];
  /** Keycloak broker alias from a validated identity-provider claim. */
  providerAlias?: string;
}

export interface PlaneContextResolver {
  resolve(query: PlaneContextQuery): Promise<PlaneContextResponse>;
}

const VALID_WORKBENCHES = new Set(["user", "partner", "admin"]);
const SYSTEM_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000000";

async function asSystemPrincipal<T>(
  db: Kysely<AnyDb>,
  fn: (trx: Transaction<AnyDb>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.current_principal_id', ${SYSTEM_PRINCIPAL_ID}, true)`.execute(trx);
    return fn(trx);
  });
}

export function createPlaneContextResolver(
  db: Kysely<AnyDb>,
  meshDb?: Kysely<AnyDb>,
): PlaneContextResolver {
  async function resolve(query: PlaneContextQuery): Promise<PlaneContextResponse> {
    // Skip master.* reconciliation for mesh; principals live only in mesh.*
    if (query.planeKey !== "mesh") {
      await reconcileIdentityBindingSubject(db, query);
    }

    const organizations =
      query.planeKey === "mesh"
        ? await resolveMeshNetworkAccounts(meshDb ?? db, query)
        : query.planeKey === "admin"
          ? await resolveTenantAdminContexts(db, query)
          : await resolveTenantLegalEntityContexts(db, query);

    // A missing or unrecognized provider alias deliberately leaves the policy
    // unset. The BFF treats that as `never` for federated evidence, so a
    // forged/ambiguous alias cannot make external MFA trusted.
    await applyTenantMfaTrustPolicy(db, organizations, query);

    return {
      organizations,
      contextCount: Object.keys(organizations).length,
      source: "db",
    };
  }

  return { resolve };
}

async function applyTenantMfaTrustPolicy(
  db: Kysely<AnyDb>,
  organizations: Record<string, OrgMembership>,
  query: PlaneContextQuery,
): Promise<void> {
  const providerAlias = query.providerAlias?.trim();
  if (!providerAlias || Object.keys(organizations).length === 0) return;

  try {
    const tenantIds = [...new Set(Object.values(organizations).map((org) => org.tenantId).filter(Boolean))];
    if (tenantIds.length === 0) return;
    const result = await sql<{ tenant_id: string; mfa_trust_policy: TenantMfaTrustPolicy }>`
      SELECT tenant_id::text AS tenant_id, mfa_trust_policy
      FROM master.tenant_identity_provider
      WHERE keycloak_alias = ${providerAlias}
        AND realm_key = ${query.realmKey}
        AND enabled = true
        AND ${query.planeKey} = ANY(allowed_planes)
        AND tenant_id IN (${sql.join(tenantIds.map((tenantId) => sql`${tenantId}::uuid`), sql`, `)})
    `.execute(db);
    const policyByTenant = new Map(result.rows.map((row) => [row.tenant_id, row.mfa_trust_policy]));
    for (const organization of Object.values(organizations)) {
      const policy = organization.tenantId ? policyByTenant.get(organization.tenantId) : undefined;
      if (policy) organization.mfaTrustPolicy = policy;
    }
  } catch {
    // Registry rollout and legacy installations may not have the table yet.
    // Keep the policy absent; callers fail closed for federated assurance.
  }
}

function normalizeWorkbenches(input: readonly string[], fallback: WorkbenchKey): WorkbenchKey[] {
  const roles = validWorkbenches(input);
  return roles.length > 0 ? [...new Set(roles)] : [fallback];
}

function validWorkbenches(input: readonly string[]): WorkbenchKey[] {
  return input.filter((role): role is WorkbenchKey => VALID_WORKBENCHES.has(role));
}

function meshWorkbenchesForNetworkRole(networkRole: string | null | undefined, requested: readonly string[]): WorkbenchKey[] {
  const normalized = networkRole?.trim().toLowerCase();
  const derived: WorkbenchKey[] =
    normalized === "buyer"
      ? ["user"]
      : normalized === "both"
        ? ["user", "partner"]
        : normalized === "platform"
          ? ["admin"]
          : ["partner"];
  const allowed = [...new Set(validWorkbenches(requested))];
  if (allowed.length === 0) return derived;
  return derived.filter((role) => allowed.includes(role));
}

function addOrg(
  organizations: Record<string, OrgMembership>,
  input: { alias: string; id: string; name: string; roles: WorkbenchKey[] } & Partial<OrgMembership>,
): void {
  const existing = organizations[input.alias];
  if (!existing) {
    organizations[input.alias] = {
      id: input.id,
      name: input.name,
      alias: input.alias,
      roles: [...new Set(input.roles)],
      ...orgMetadata(input),
    };
    return;
  }
  existing.roles = [...new Set([...existing.roles, ...input.roles])];
  Object.assign(existing, orgMetadata(input));
}

function orgMetadata(input: Partial<OrgMembership>): Partial<OrgMembership> {
  return {
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.tenantCode ? { tenantCode: input.tenantCode } : {}),
    ...(input.tenantName ? { tenantName: input.tenantName } : {}),
    ...(input.contextType ? { contextType: input.contextType } : {}),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.organizationCode ? { organizationCode: input.organizationCode } : {}),
    ...(input.organizationName ? { organizationName: input.organizationName } : {}),
    ...(input.legalEntityId ? { legalEntityId: input.legalEntityId } : {}),
    ...(input.legalEntityCode ? { legalEntityCode: input.legalEntityCode } : {}),
    ...(input.legalEntityName ? { legalEntityName: input.legalEntityName } : {}),
    ...(input.workContextDomain ? { workContextDomain: input.workContextDomain } : {}),
    ...(input.scopeVersion !== undefined ? { scopeVersion: input.scopeVersion } : {}),
    ...(input.authEpoch !== undefined ? { authEpoch: input.authEpoch } : {}),
    ...(input.mfaTrustPolicy ? { mfaTrustPolicy: input.mfaTrustPolicy } : {}),
  };
}

function identityBindingPredicate(query: PlaneContextQuery): RawBuilder<unknown> {
  const username = normalizeIdentityUsername(query.username);
  if (!username) {
    return sql`pib.subject_id = ${query.sub}`;
  }
  return sql`
    (
      pib.subject_id = ${query.sub}
      OR lower(COALESCE(
        NULLIF(pib.username, ''),
        NULLIF(pib.idp_snapshot #>> '{preferred_username}', ''),
        NULLIF(pib.provider_attributes #>> '{preferred_username}', ''),
        NULLIF(pib.metadata #>> '{preferred_username}', ''),
        NULLIF(pib.idp_snapshot #>> '{username}', ''),
        NULLIF(pib.provider_attributes #>> '{username}', ''),
        NULLIF(pib.metadata #>> '{username}', '')
      )) = ${username}
    )
  `;
}

function normalizeIdentityUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || /\s/.test(normalized) || normalized.length > 320) return null;
  return normalized;
}

async function reconcileIdentityBindingSubject(
  db: Kysely<AnyDb>,
  query: PlaneContextQuery,
): Promise<void> {
  const username = normalizeIdentityUsername(query.username);
  if (!username || !query.sub) return;

  try {
    await asSystemPrincipal(db, async (trx) => {
      await sql`
        UPDATE master.principal_identity_binding AS pib
        SET
          subject_id  = ${query.sub},
          username    = COALESCE(NULLIF(pib.username, ''), ${username}),
          sync_status = 'synced',
          synced_at   = now(),
          updated_at  = now(),
          updated_by  = ${SYSTEM_PRINCIPAL_ID}::uuid
        FROM master.principal p
        JOIN master.tenant t
          ON t.id = p.tenant_id
        WHERE p.tenant_id = pib.tenant_id
          AND p.id = pib.principal_id
          AND pib.provider_code = 'keycloak'
          AND pib.realm_key = ${query.realmKey}
          AND pib.idp_enabled = true
          AND pib.sync_status <> 'disabled'
          AND pib.subject_id <> ${query.sub}
          AND t.status = 'active'
          AND p.is_active = true
          AND p.is_locked = false
          AND lower(COALESCE(
            NULLIF(pib.username, ''),
            NULLIF(pib.idp_snapshot #>> '{preferred_username}', ''),
            NULLIF(pib.provider_attributes #>> '{preferred_username}', ''),
            NULLIF(pib.metadata #>> '{preferred_username}', ''),
            NULLIF(pib.idp_snapshot #>> '{username}', ''),
            NULLIF(pib.provider_attributes #>> '{username}', ''),
            NULLIF(pib.metadata #>> '{username}', '')
          )) = ${username}
          AND NOT EXISTS (
            SELECT 1
            FROM master.principal_identity_binding existing
            WHERE existing.realm_key = pib.realm_key
              AND existing.provider_code = pib.provider_code
              AND existing.subject_id = ${query.sub}
          )
      `.execute(trx);
    });
  } catch (err) {
    // Stale duplicate bindings should not block login; resolution still matches by username.
    if (isIdentityBindingUniqueViolation(err)) return;
    throw err;
  }
}

function isIdentityBindingUniqueViolation(err: unknown): boolean {
  const fields = err as { code?: unknown; constraint?: unknown };
  return (
    fields?.code === "23505" &&
    fields?.constraint === "pib_subject_realm_provider_uq"
  );
}

async function resolveTenantLegalEntityContexts(
  db: Kysely<AnyDb>,
  query: PlaneContextQuery,
): Promise<Record<string, OrgMembership>> {
  const workbenches = normalizeWorkbenches(query.workbenches, "user");
  const rows = await sql<{
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    company_code_id: string;
    company_code: string;
    company_name: string;
    legal_entity_id: string | null;
    legal_entity_code: string | null;
    legal_entity_name: string | null;
    persona_code: string;
  }>`
    WITH principal_bindings AS (
      SELECT
        t.id                         AS tenant_id,
        t.code                       AS tenant_code,
        COALESCE(t.display_name, t.name) AS tenant_name,
        p.id                         AS principal_id
      FROM master.principal_identity_binding pib
      JOIN master.principal p
        ON  p.tenant_id = pib.tenant_id
        AND p.id        = pib.principal_id
      JOIN master.tenant t
        ON t.id = pib.tenant_id
      WHERE pib.provider_code = 'keycloak'
        AND ${identityBindingPredicate(query)}
        AND pib.realm_key     = ${query.realmKey}
        AND pib.idp_enabled   = true
        AND pib.sync_status  <> 'disabled'
        AND t.status          = 'active'
        AND p.is_active       = true
        AND p.is_locked       = false
    ),
    principal_roles AS (
      SELECT
        pb.tenant_id,
        pb.tenant_code,
        pb.tenant_name,
        pb.principal_id,
        gr.id                    AS auth_group_role_id,
        gr.assignment_scope_type,
        gr.assignment_scope_ref_id,
        gr.include_descendants,
        r.persona_id,
        r.module_id
      FROM principal_bindings pb
      JOIN master.auth_group_member gm
        ON  gm.tenant_id    = pb.tenant_id
        AND gm.principal_id = pb.principal_id
      JOIN master.auth_group_role gr
        ON  gr.tenant_id = gm.tenant_id
        AND gr.group_id  = gm.group_id
        AND gr.is_active = true
        AND (gr.expires_at IS NULL OR gr.expires_at > now())
      JOIN shared.role r ON r.id = gr.role_id
    ),
    role_cc_map AS (
      SELECT pr.tenant_id, pr.tenant_code, pr.tenant_name, pr.auth_group_role_id, cc.id AS company_code_id
      FROM principal_roles pr
      CROSS JOIN master.company_code cc
      WHERE pr.assignment_scope_type = 'tenant'
        AND cc.tenant_id = pr.tenant_id
        AND cc.is_active = true

      UNION

      SELECT pr.tenant_id, pr.tenant_code, pr.tenant_name, pr.auth_group_role_id, pr.assignment_scope_ref_id AS company_code_id
      FROM principal_roles pr
      WHERE pr.assignment_scope_type = 'company_code'

      UNION

      SELECT pr.tenant_id, pr.tenant_code, pr.tenant_name, pr.auth_group_role_id, sub.company_code_id
      FROM principal_roles pr
      CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(pr.tenant_id, pr.assignment_scope_ref_id) sub
      WHERE pr.assignment_scope_type = 'legal_entity'
        AND pr.include_descendants = true

      UNION

      SELECT pr.tenant_id, pr.tenant_code, pr.tenant_name, pr.auth_group_role_id, cc.id AS company_code_id
      FROM principal_roles pr
      JOIN master.company_code cc
        ON  cc.legal_entity_id = pr.assignment_scope_ref_id
        AND cc.tenant_id       = pr.tenant_id
        AND cc.is_active       = true
      WHERE pr.assignment_scope_type = 'legal_entity'
        AND pr.include_descendants = false
    )
    SELECT
      rcm.tenant_id::text AS tenant_id,
      rcm.tenant_code,
      rcm.tenant_name,
      cc.id             AS company_code_id,
      cc.code           AS company_code,
      cc.name           AS company_name,
      cc.legal_entity_id::text AS legal_entity_id,
      le.code           AS legal_entity_code,
      COALESCE(le.display_name, le.name) AS legal_entity_name,
      p.code            AS persona_code
    FROM role_cc_map rcm
    JOIN master.company_code cc
      ON  cc.id = rcm.company_code_id
      AND cc.is_active = true
    LEFT JOIN master.legal_entity le
      ON  le.tenant_id = cc.tenant_id
      AND le.id = cc.legal_entity_id
      AND le.is_active = true
    JOIN principal_roles pr
      ON  pr.auth_group_role_id = rcm.auth_group_role_id
    JOIN shared.persona p
      ON p.id = pr.persona_id
    GROUP BY rcm.tenant_id, rcm.tenant_code, rcm.tenant_name, cc.id, cc.code, cc.name,
      cc.legal_entity_id, le.code, le.display_name, le.name, p.code
    ORDER BY rcm.tenant_code, cc.code, p.code
  `.execute(db);

  const organizations: Record<string, OrgMembership> = {};
  for (const row of rows.rows) {
    const legalEntityCode = row.legal_entity_code ?? row.company_code;
    const entityAlias = legalEntityCode.toLowerCase();
    addOrg(organizations, {
      alias: `${row.tenant_code}--${entityAlias}`,
      id: row.legal_entity_id ?? row.company_code_id,
      name: row.legal_entity_name ?? row.company_name,
      roles: workbenches,
      tenantId: row.tenant_id,
      tenantCode: row.tenant_code,
      tenantName: row.tenant_name,
      contextType: "legal_entity",
      organizationId: row.legal_entity_id ?? row.company_code_id,
      organizationCode: legalEntityCode,
      organizationName: row.legal_entity_name ?? row.company_name,
      legalEntityId: row.legal_entity_id ?? undefined,
      legalEntityCode: row.legal_entity_code ?? undefined,
      legalEntityName: row.legal_entity_name ?? undefined,
    });
  }

  // Operating Organizations are independent work contexts. They are
  // discovered from active RBAC assignments and are never expanded into a
  // long-lived Company Code list in the session.
  const operatingRows = await sql<{
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    operating_organization_id: string;
    domain: "procurement" | "sales";
    code: string;
    name: string;
    scope_version: number;
  }>`
    SELECT DISTINCT
      t.id::text AS tenant_id,
      t.code AS tenant_code,
      COALESCE(t.display_name, t.name) AS tenant_name,
      oo.id::text AS operating_organization_id,
      oo.domain,
      oo.code,
      oo.name,
      oo.scope_version
    FROM master.principal_identity_binding pib
    JOIN master.principal p
      ON p.id = pib.principal_id
     AND p.tenant_id = pib.tenant_id
    JOIN master.tenant t
      ON t.id = p.tenant_id
     AND t.status = 'active'
    JOIN master.auth_group_member gm
      ON gm.tenant_id = p.tenant_id
     AND gm.principal_id = p.id
    JOIN master.auth_group_role gr
      ON gr.tenant_id = gm.tenant_id
     AND gr.group_id = gm.group_id
     AND gr.assignment_scope_type = 'operating_organization'
     AND gr.is_active = true
     AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN master.operating_organization oo
      ON oo.tenant_id = gr.tenant_id
     AND oo.id = gr.assignment_scope_ref_id
     AND oo.status = 'active'
    WHERE pib.provider_code = 'keycloak'
      AND ${identityBindingPredicate(query)}
      AND pib.realm_key = ${query.realmKey}
      AND pib.idp_enabled = true
      AND pib.sync_status <> 'disabled'
      AND p.is_active = true
      AND p.is_locked = false
  `.execute(db);

  for (const row of operatingRows.rows) {
    const alias = `${row.tenant_code}--oo--${row.domain}--${row.code.toLowerCase()}`;
    addOrg(organizations, {
      alias,
      id: row.operating_organization_id,
      name: row.name,
      roles: workbenches,
      tenantId: row.tenant_id,
      tenantCode: row.tenant_code,
      tenantName: row.tenant_name,
      contextType: "operating_organization",
      organizationId: row.operating_organization_id,
      organizationCode: row.code,
      organizationName: row.name,
      workContextDomain: row.domain,
      scopeVersion: Number(row.scope_version),
    });
  }
  const epochRow = await sql<{ auth_epoch: number }>`
    SELECT p.auth_epoch
    FROM master.principal_identity_binding pib
    JOIN master.principal p ON p.id = pib.principal_id AND p.tenant_id = pib.tenant_id
    WHERE pib.provider_code = 'keycloak'
      AND ${identityBindingPredicate(query)}
      AND pib.realm_key = ${query.realmKey}
      AND pib.idp_enabled = true
      AND pib.sync_status <> 'disabled'
      AND p.is_active = true
      AND p.is_locked = false
    ORDER BY p.auth_epoch DESC
    LIMIT 1
  `.execute(db);
  const authEpoch = epochRow.rows[0]?.auth_epoch;
  if (authEpoch !== undefined) {
    for (const organization of Object.values(organizations)) organization.authEpoch = Number(authEpoch);
  }
  return organizations;
}

function meshContextPredicate(query: PlaneContextQuery): RawBuilder<unknown> {
  const username = normalizeIdentityUsername(query.username);
  if (!username) {
    return sql`pib.subject_id = ${query.sub}`;
  }
  return sql`
    (
      pib.subject_id = ${query.sub}
      OR lower(COALESCE(
        NULLIF(pib.username, ''),
        NULLIF(pib.idp_snapshot #>> '{preferred_username}', ''),
        NULLIF(pib.metadata #>> '{preferred_username}', ''),
        NULLIF(pib.idp_snapshot #>> '{username}', ''),
        NULLIF(pib.metadata #>> '{username}', '')
      )) = ${username}
    )
  `;
}

async function resolveMeshNetworkAccounts(
  effectiveDb: Kysely<AnyDb>,
  query: PlaneContextQuery,
): Promise<Record<string, OrgMembership>> {
  const hasRequiredTables = await Promise.all([
    meshTableExists(effectiveDb, "principal"),
    meshTableExists(effectiveDb, "principal_identity_binding"),
    meshTableExists(effectiveDb, "account_grant"),
    meshTableExists(effectiveDb, "network_account"),
  ]);
  if (hasRequiredTables.some((exists) => !exists)) return {};

  const rows = await sql<{
    account_id: string;
    account_code: string;
    display_name: string;
    network_role: string | null;
    participant_type: string;
    role_code: string;
  }>`
    SELECT
      na.id::text AS account_id,
      na.account_code,
      na.display_name,
      na.network_role,
      na.participant_type,
      CASE MIN(CASE ag.role_code
        WHEN 'account_owner' THEN 1
        WHEN 'account_admin' THEN 2
        WHEN 'account_user'  THEN 3
        ELSE 4 END)
        WHEN 1 THEN 'account_owner'
        WHEN 2 THEN 'account_admin'
        ELSE 'account_user' END AS role_code
    FROM mesh.principal p
    JOIN mesh.principal_identity_binding pib
      ON pib.principal_id = p.id
    JOIN mesh.account_grant ag
      ON ag.principal_id = p.id
      AND ag.status = 'active'
    JOIN mesh.network_account na
      ON na.id = ag.account_id
      AND na.status = 'active'
    WHERE ${meshContextPredicate(query)}
      AND p.status = 'active'
      AND pib.provider_code = 'keycloak'
      AND pib.realm_key = ${query.realmKey}
      AND pib.sync_status <> 'disabled'
    GROUP BY na.id, na.account_code, na.display_name, na.network_role, na.participant_type
    ORDER BY na.display_name
    LIMIT 20
  `.execute(effectiveDb);

  const organizations: Record<string, OrgMembership> = {};
  for (const row of rows.rows) {
    const workbenches = meshWorkbenchesForNetworkRole(row.network_role, query.workbenches);
    if (workbenches.length === 0) continue;
    const bnaCode = row.account_code as string;
    const bnaLower = bnaCode.toLowerCase();
    addOrg(organizations, {
      alias: `${bnaLower}--${bnaLower}`,
      id: row.account_id,
      name: row.display_name as string,
      roles: workbenches,
      tenantId: row.account_id,
      tenantCode: bnaCode,
      contextType: "network_account",
      organizationId: row.account_id,
      organizationCode: bnaCode,
      organizationName: row.display_name as string,
    });
  }
  return organizations;
}

async function meshTableExists(db: Kysely<AnyDb>, tableName: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'mesh'
        AND table_name = ${tableName}
    ) AS exists
  `.execute(db);
  return Boolean(result.rows[0]?.exists);
}

async function resolveTenantAdminContexts(
  db: Kysely<AnyDb>,
  query: PlaneContextQuery,
): Promise<Record<string, OrgMembership>> {
  const rows = await sql<{
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    grant_id: string;
    persona_key: "owner" | "admin";
  }>`
    SELECT
      t.id::text                     AS tenant_id,
      t.code                         AS tenant_code,
      COALESCE(t.display_name, t.name) AS tenant_name,
      tag.id                         AS grant_id,
      tag.persona_key
    FROM master.principal_identity_binding pib
    JOIN master.principal p
      ON  p.tenant_id = pib.tenant_id
      AND p.id        = pib.principal_id
    JOIN master.tenant_admin_grant tag
      ON  tag.tenant_id    = p.tenant_id
      AND tag.principal_id = p.id
      AND tag.is_active    = true
      AND (tag.effective_until IS NULL OR tag.effective_until > now())
    JOIN master.tenant t
      ON t.id = tag.tenant_id
    WHERE pib.provider_code = 'keycloak'
      AND ${identityBindingPredicate(query)}
      AND pib.realm_key     = ${query.realmKey}
      AND pib.idp_enabled   = true
      AND pib.sync_status  <> 'disabled'
      AND t.status          = 'active'
      AND p.is_active       = true
      AND p.is_locked       = false
    ORDER BY t.code, tag.persona_key
  `.execute(db);

  const organizations: Record<string, OrgMembership> = {};
  for (const row of rows.rows) {
    addOrg(organizations, {
      alias: `${row.tenant_code}--admin`,
      id: row.grant_id,
      name: row.tenant_name,
      roles: ["admin"],
      tenantId: row.tenant_id,
      tenantCode: row.tenant_code,
      tenantName: row.tenant_name,
      contextType: "tenant_admin",
      organizationId: row.tenant_id,
      organizationCode: row.tenant_code,
      organizationName: row.tenant_name,
    });
  }
  return organizations;
}
