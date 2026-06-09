import { createHash } from "node:crypto";
import { sql, type Kysely, type RawBuilder } from "kysely";

type AnyDb = Record<string, any>;

export type PlaneKey = "neon" | "mesh" | "admin";

export interface DiscoveryQuery {
  planeKey: PlaneKey;
  identifier?: string;
  email?: string;
}

export interface DiscoveryCandidate {
  id: string;
  planeKey: PlaneKey;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  workspaceId: string;
  workspaceCode: string;
  workspaceName: string;
  workspaceType: string;
  workspaceSubtitle: string;
  realmKey: string;
  providerHint: string | null;
  authMethodLabel: string;
  hostname: string | null;
  deliveryEmail: string | null;
  networkAccountId?: string | null;
  networkAccountCode?: string | null;
  networkAccountName?: string | null;
  networkAccountRole?: string | null;
  networkRelationshipType?: string | null;
}

export interface DiscoveryResponse {
  candidates: DiscoveryCandidate[];
  policy: DiscoveryPolicy;
}

export interface TenantDiscoveryService {
  discover(query: DiscoveryQuery): Promise<DiscoveryResponse>;
}

export type DiscoveryStage1VerificationMode = "required" | "disabled";

export interface DiscoveryPolicy {
  stage1VerificationMode: DiscoveryStage1VerificationMode;
  tokenTtlSeconds: number;
  resendCooldownSeconds: number;
  verifiedTrustTtlDays: number;
}

const DEFAULT_AUTH_LABEL: Record<PlaneKey, string> = {
  neon: "Organization sign-in",
  mesh: "Partner sign-in",
  admin: "Admin sign-in",
};

const ORGANIZATION_SUBTITLE: Record<PlaneKey, string> = {
  neon: "Neon organization",
  mesh: "Mesh organization",
  admin: "Admin organization",
};
const NATIVE_IAM_REALM_KEY = "athyper";

const GLOBAL_STAGE1_MODE_PARAM = "auth.discovery.stage1_verification_mode";
const TOKEN_TTL_PARAM = "auth.discovery.token_ttl_seconds";
const RESEND_COOLDOWN_PARAM = "auth.discovery.resend_cooldown_seconds";
const VERIFIED_TRUST_TTL_PARAM = "auth.discovery.verified_trust_ttl_days";

export function createTenantDiscoveryService(db: Kysely<AnyDb>, meshDb?: Kysely<AnyDb>): TenantDiscoveryService {
  async function discover(query: DiscoveryQuery): Promise<DiscoveryResponse> {
    const identifier = normalizeDiscoveryIdentifier(query.identifier ?? query.email);
    if (!identifier) return { candidates: [], policy: defaultDiscoveryPolicy(query.planeKey) };

    const [rows, policy] = await Promise.all([
      resolveCandidates(db, query.planeKey, identifier, meshDb),
      resolveDiscoveryPolicy(db, query.planeKey).catch(() => defaultDiscoveryPolicy(query.planeKey)),
    ]);
    const candidates = rows.map((row) => {
      const realmKey = row.identity_realm_key || NATIVE_IAM_REALM_KEY;
      return {
        id: stableCandidateId(query.planeKey, row.tenant_id, row.workspace_id, realmKey, row.provider_hint),
        planeKey: query.planeKey,
        tenantId: row.tenant_id,
        tenantCode: row.tenant_code,
        tenantName: row.tenant_name,
        workspaceId: row.workspace_id,
        workspaceCode: row.workspace_code,
        workspaceName: row.workspace_name,
        workspaceType: row.workspace_type,
        workspaceSubtitle: row.workspace_subtitle,
        realmKey,
        providerHint: row.provider_hint,
        authMethodLabel: row.auth_method_label || DEFAULT_AUTH_LABEL[query.planeKey],
        hostname: row.hostname,
        deliveryEmail: row.delivery_email,
        networkAccountId: row.network_account_id,
        networkAccountCode: row.network_account_code,
        networkAccountName: row.network_account_name,
        networkAccountRole: row.network_account_role,
        networkRelationshipType: row.network_relationship_type,
      };
    });
    const deduped = new Map<string, DiscoveryCandidate>();
    for (const candidate of candidates) {
      if (!deduped.has(candidate.id)) deduped.set(candidate.id, candidate);
    }
    return { candidates: [...deduped.values()].slice(0, 10), policy };
  }

  return { discover };
}

async function resolveDiscoveryPolicy(db: Kysely<AnyDb>, planeKey: PlaneKey): Promise<DiscoveryPolicy> {
  const planeStage1ModeParam = `auth.discovery.${planeKey}.stage1_verification_mode`;
  const result = await sql<{ code: string; value: unknown }>`
    SELECT
      code,
      COALESCE(product_value, default_value) AS value
    FROM control.parameter_definition
    WHERE status = 'active'
      AND is_enabled = true
      AND code IN (
        ${GLOBAL_STAGE1_MODE_PARAM},
        ${planeStage1ModeParam},
        ${TOKEN_TTL_PARAM},
        ${RESEND_COOLDOWN_PARAM},
        ${VERIFIED_TRUST_TTL_PARAM}
      )
  `.execute(db);

  const values = new Map(result.rows.map((row) => [row.code, normalizeJsonValue(row.value)]));
  const defaults = defaultDiscoveryPolicy(planeKey);
  return {
    stage1VerificationMode: normalizeStage1Mode(
      values.get(planeStage1ModeParam) ?? values.get(GLOBAL_STAGE1_MODE_PARAM),
      defaults.stage1VerificationMode,
    ),
    tokenTtlSeconds: normalizeInteger(values.get(TOKEN_TTL_PARAM), defaults.tokenTtlSeconds, 60, 3600),
    resendCooldownSeconds: normalizeInteger(
      values.get(RESEND_COOLDOWN_PARAM),
      defaults.resendCooldownSeconds,
      0,
      300,
    ),
    verifiedTrustTtlDays: normalizeInteger(values.get(VERIFIED_TRUST_TTL_PARAM), defaults.verifiedTrustTtlDays, 0, 90),
  };
}

function defaultDiscoveryPolicy(planeKey: PlaneKey): DiscoveryPolicy {
  return {
    stage1VerificationMode: normalizeStage1Mode(
      process.env[`AUTH_DISCOVERY_STAGE1_VERIFICATION_MODE_${planeKey.toUpperCase()}`]
        ?? process.env.AUTH_DISCOVERY_STAGE1_VERIFICATION_MODE,
      "required",
    ),
    tokenTtlSeconds: normalizeInteger(process.env.AUTH_DISCOVERY_TOKEN_TTL_SECONDS, 900, 60, 3600),
    resendCooldownSeconds: normalizeInteger(
      process.env.AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS
        ?? process.env.NEXT_PUBLIC_AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS,
      30,
      0,
      300,
    ),
    verifiedTrustTtlDays: normalizeInteger(process.env.AUTH_DISCOVERY_VERIFIED_TRUST_TTL_DAYS, 30, 0, 90),
  };
}

function normalizeStage1Mode(value: unknown, fallback: DiscoveryStage1VerificationMode): DiscoveryStage1VerificationMode {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["disabled", "optional", "off", "false", "none"].includes(normalized)) return "disabled";
  if (normalized === "required") return "required";
  return fallback;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stableCandidateId(
  planeKey: PlaneKey,
  tenantId: string,
  workspaceId: string,
  realmKey: string,
  providerHint: string | null,
): string {
  return createHash("sha256")
    .update(`${planeKey}:${tenantId}:${workspaceId}:${realmKey}:${providerHint ?? ""}`)
    .digest("base64url")
    .slice(0, 22);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

interface DiscoveryIdentifier {
  kind: "email" | "username";
  value: string;
  localPart?: string;
  domain?: string;
}

function normalizeDiscoveryIdentifier(value: unknown): DiscoveryIdentifier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || /\s/.test(normalized) || normalized.length > 320) return null;
  if (isValidEmail(normalized)) {
    const [localPart = "", domain = ""] = normalized.split("@");
    return { kind: "email", value: normalized, localPart, domain };
  }
  if (normalized.includes("@") || normalized.length > 128) return null;
  if (!/^[a-z0-9._-]+$/.test(normalized)) return null;
  return { kind: "username", value: normalized };
}

function identityPredicate(identifier: DiscoveryIdentifier): RawBuilder<unknown> {
  if (identifier.kind === "email") {
    const allowUsernameAlias = localUsernameAliasDomains().has(identifier.domain ?? "");
    return sql`
      (
        lower(NULLIF(p.login_email, '')) = ${identifier.value}
        OR lower(NULLIF(pib.idp_snapshot #>> '{email}', '')) = ${identifier.value}
        OR lower(NULLIF(pib.provider_attributes #>> '{email}', '')) = ${identifier.value}
        OR lower(NULLIF(pib.metadata #>> '{email}', '')) = ${identifier.value}
        OR (${allowUsernameAlias} AND lower(COALESCE(NULLIF(pib.username, ''), p.code)) = ${identifier.localPart ?? ""})
      )
    `;
  }

  return sql`
    (
      lower(p.code) = ${identifier.value}
      OR lower(NULLIF(pib.username, '')) = ${identifier.value}
      OR lower(NULLIF(pib.subject_id, '')) = ${identifier.value}
      OR lower(NULLIF(pib.idp_snapshot #>> '{preferred_username}', '')) = ${identifier.value}
      OR lower(NULLIF(pib.provider_attributes #>> '{preferred_username}', '')) = ${identifier.value}
      OR lower(NULLIF(pib.metadata #>> '{preferred_username}', '')) = ${identifier.value}
      OR lower(NULLIF(pib.idp_snapshot #>> '{username}', '')) = ${identifier.value}
      OR lower(NULLIF(pib.provider_attributes #>> '{username}', '')) = ${identifier.value}
      OR lower(NULLIF(pib.metadata #>> '{username}', '')) = ${identifier.value}
    )
  `;
}

function meshIdentityPredicate(identifier: DiscoveryIdentifier): RawBuilder<unknown> {
  if (identifier.kind === "email") {
    return sql`
      (
        lower(NULLIF(pib.idp_snapshot #>> '{email}', '')) = ${identifier.value}
        OR lower(NULLIF(pib.metadata #>> '{email}', '')) = ${identifier.value}
      )
    `;
  }
  return sql`
    (
      lower(p.principal_code) = ${identifier.value}
      OR lower(NULLIF(pib.username, '')) = ${identifier.value}
      OR lower(NULLIF(pib.subject_id, '')) = ${identifier.value}
      OR lower(NULLIF(pib.idp_snapshot #>> '{preferred_username}', '')) = ${identifier.value}
      OR lower(NULLIF(pib.metadata #>> '{preferred_username}', '')) = ${identifier.value}
    )
  `;
}

function localUsernameAliasDomains(): Set<string> {
  const configured = process.env.AUTH_DISCOVERY_USERNAME_EMAIL_DOMAINS;
  if (configured) {
    return new Set(
      configured
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return (process.env.ENVIRONMENT ?? "local") === "local" ? new Set(["athyper.demo"]) : new Set();
}

async function resolveCandidates(
  db: Kysely<AnyDb>,
  planeKey: PlaneKey,
  identifier: DiscoveryIdentifier,
  meshDb?: Kysely<AnyDb>,
): Promise<Array<{
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  workspace_id: string;
  workspace_code: string;
  workspace_name: string;
  workspace_type: string;
  workspace_subtitle: string;
  identity_realm_key: string;
  provider_hint: string | null;
  auth_method_label: string | null;
  hostname: string | null;
  delivery_email: string | null;
  network_account_id?: string | null;
  network_account_code?: string | null;
  network_account_name?: string | null;
  network_account_role?: string | null;
  network_relationship_type?: string | null;
}>> {
  if (planeKey === "mesh") return resolveMeshCandidates(meshDb ?? db, identifier);
  if (planeKey === "admin") return resolveAdminCandidates(db, identifier);
  return resolveNeonCandidates(db, identifier);
}

async function resolveNeonCandidates(
  db: Kysely<AnyDb>,
  identifier: DiscoveryIdentifier,
) {
  const result = await sql<{
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    workspace_id: string;
    workspace_code: string;
    workspace_name: string;
    workspace_type: string;
    workspace_subtitle: string;
    identity_realm_key: string;
    provider_hint: string | null;
    auth_method_label: string | null;
    hostname: string | null;
    delivery_email: string | null;
  }>`
    WITH principal_bindings AS (
      SELECT
        t.id                                             AS tenant_id,
        t.code                                           AS tenant_code,
        COALESCE(t.display_name, t.name)                 AS tenant_name,
        p.id                                             AS principal_id,
        p.login_email,
        pib.realm_key                                    AS identity_realm_key,
        pib.idp_snapshot,
        pib.provider_attributes,
        pib.metadata
      FROM master.principal p
      JOIN master.principal_identity_binding pib
        ON  pib.tenant_id = p.tenant_id
        AND pib.principal_id = p.id
      JOIN master.tenant t
        ON t.id = p.tenant_id
      WHERE ${identityPredicate(identifier)}
        AND p.is_active = true
        AND p.is_locked = false
        AND t.status = 'active'
        AND pib.provider_code = 'keycloak'
        AND pib.idp_enabled = true
        AND pib.sync_status <> 'disabled'
    ),
    principal_roles AS (
      SELECT
        pb.*,
        gr.id AS auth_group_role_id,
        gr.assignment_scope_type,
        gr.assignment_scope_ref_id,
        gr.include_descendants
      FROM principal_bindings pb
      JOIN master.auth_group_member gm
        ON  gm.tenant_id = pb.tenant_id
        AND gm.principal_id = pb.principal_id
      JOIN master.auth_group_role gr
        ON  gr.tenant_id = gm.tenant_id
        AND gr.group_id = gm.group_id
        AND gr.is_active = true
        AND (gr.expires_at IS NULL OR gr.expires_at > now())
      WHERE gr.assignment_scope_type IN ('tenant', 'company_code', 'legal_entity')
    ),
    role_cc_map AS (
      SELECT pr.*, cc.id AS company_code_id
      FROM principal_roles pr
      CROSS JOIN master.company_code cc
      WHERE pr.assignment_scope_type = 'tenant'
        AND cc.tenant_id = pr.tenant_id
        AND cc.is_active = true

      UNION

      SELECT pr.*, pr.assignment_scope_ref_id AS company_code_id
      FROM principal_roles pr
      WHERE pr.assignment_scope_type = 'company_code'

      UNION

      SELECT pr.*, sub.company_code_id
      FROM principal_roles pr
      CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(pr.tenant_id, pr.assignment_scope_ref_id) sub
      WHERE pr.assignment_scope_type = 'legal_entity'
        AND pr.include_descendants = true

      UNION

      SELECT pr.*, cc.id AS company_code_id
      FROM principal_roles pr
      JOIN master.company_code cc
        ON  cc.legal_entity_id = pr.assignment_scope_ref_id
        AND cc.tenant_id = pr.tenant_id
        AND cc.is_active = true
      WHERE pr.assignment_scope_type = 'legal_entity'
        AND pr.include_descendants = false
    )
    SELECT
      rcm.tenant_id::text                              AS tenant_id,
      rcm.tenant_code                                  AS tenant_code,
      rcm.tenant_name                                  AS tenant_name,
      COALESCE(le.id::text, cc.id::text)               AS workspace_id,
      COALESCE(le.code, cc.code)                       AS workspace_code,
      COALESCE(le.display_name, le.name, cc.name)      AS workspace_name,
      'organization'                                   AS workspace_type,
      ${ORGANIZATION_SUBTITLE.neon}                    AS workspace_subtitle,
      rcm.identity_realm_key                           AS identity_realm_key,
      NULLIF(rcm.metadata #>> '{auth,idpHint}', '')    AS provider_hint,
      NULLIF(rcm.metadata #>> '{auth,label}', '')      AS auth_method_label,
      NULLIF(rcm.metadata #>> '{auth,hostname}', '')   AS hostname,
      COALESCE(
        lower(NULLIF(rcm.login_email, '')),
        lower(NULLIF(rcm.idp_snapshot #>> '{email}', '')),
        lower(NULLIF(rcm.provider_attributes #>> '{email}', '')),
        lower(NULLIF(rcm.metadata #>> '{email}', ''))
      )                                                AS delivery_email
    FROM role_cc_map rcm
    JOIN master.company_code cc
      ON  cc.id = rcm.company_code_id
      AND cc.is_active = true
    LEFT JOIN master.legal_entity le
      ON  le.tenant_id = cc.tenant_id
      AND le.id = cc.legal_entity_id
      AND le.is_active = true
    GROUP BY
      rcm.tenant_id, rcm.tenant_code, rcm.tenant_name,
      le.id, le.code, le.display_name, le.name,
      cc.id, cc.code, cc.name,
      rcm.identity_realm_key,
      rcm.login_email, rcm.idp_snapshot, rcm.provider_attributes, rcm.metadata
    ORDER BY workspace_name, tenant_name, tenant_code
    LIMIT 50
  `.execute(db);

  return result.rows;
}

async function resolveMeshCandidates(
  db: Kysely<AnyDb>,
  identifier: DiscoveryIdentifier,
) {
  const hasRequiredTables = await Promise.all([
    meshTableExists(db, "principal"),
    meshTableExists(db, "principal_identity_binding"),
    meshTableExists(db, "account_grant"),
    meshTableExists(db, "network_account"),
  ]);
  if (hasRequiredTables.some((exists) => !exists)) return [];

  const hasNetworkRole = await meshColumnExists(db, "network_account", "network_role");
  if (hasNetworkRole) return resolveMeshCandidatesFromNetworkRole(db, identifier);
  return [];
}

async function resolveMeshCandidatesFromNetworkRole(
  db: Kysely<AnyDb>,
  identifier: DiscoveryIdentifier,
) {
  const result = await sql<MeshCandidateRow>`
    SELECT
      na.id::text                                    AS tenant_id,
      na.account_code                                AS tenant_code,
      na.display_name                                AS tenant_name,
      na.id::text                                    AS workspace_id,
      na.account_code                                AS workspace_code,
      na.display_name                                AS workspace_name,
      'network_account'                              AS workspace_type,
      ${ORGANIZATION_SUBTITLE.mesh}                  AS workspace_subtitle,
      pib.realm_key                                  AS identity_realm_key,
      NULLIF(pib.metadata #>> '{auth,idpHint}', '')  AS provider_hint,
      NULLIF(pib.metadata #>> '{auth,label}', '')    AS auth_method_label,
      NULLIF(pib.metadata #>> '{auth,hostname}', '') AS hostname,
      NULL::text                                     AS delivery_email,
      na.id::text                                    AS network_account_id,
      na.account_code                                AS network_account_code,
      na.display_name                                AS network_account_name,
      na.network_role                                AS network_account_role,
      na.network_role                                AS network_relationship_type
    FROM mesh.principal p
    JOIN mesh.principal_identity_binding pib
      ON  pib.principal_id = p.id
    JOIN mesh.account_grant ag
      ON  ag.principal_id = p.id
      AND ag.status = 'active'
    JOIN mesh.network_account na
      ON  na.id = ag.account_id
      AND na.status = 'active'
    WHERE ${meshIdentityPredicate(identifier)}
      AND p.status = 'active'
      AND pib.provider_code = 'keycloak'
      AND pib.realm_key = ${NATIVE_IAM_REALM_KEY}
      AND pib.sync_status = 'synced'
    GROUP BY
      na.id, na.account_code, na.display_name, na.network_role,
      pib.realm_key, pib.metadata
    ORDER BY na.display_name
    LIMIT 10
  `.execute(db);

  return result.rows;
}

type MeshCandidateRow = {
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    workspace_id: string;
    workspace_code: string;
    workspace_name: string;
    workspace_type: string;
    workspace_subtitle: string;
    identity_realm_key: string;
    provider_hint: string | null;
    auth_method_label: string | null;
    hostname: string | null;
    delivery_email: string | null;
    network_account_id: string | null;
    network_account_code: string | null;
    network_account_name: string | null;
    network_account_role: string | null;
    network_relationship_type: string | null;
};

async function meshTableExists(db: Kysely<AnyDb>, tableName: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT to_regclass(${'mesh.' + tableName}) IS NOT NULL AS exists
  `.execute(db);
  return result.rows[0]?.exists === true;
}

async function meshColumnExists(db: Kysely<AnyDb>, tableName: string, columnName: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'mesh'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `.execute(db);
  return result.rows[0]?.exists === true;
}

async function resolveAdminCandidates(
  db: Kysely<AnyDb>,
  identifier: DiscoveryIdentifier,
) {
  const result = await sql<{
    tenant_id: string;
    tenant_code: string;
    tenant_name: string;
    workspace_id: string;
    workspace_code: string;
    workspace_name: string;
    workspace_type: string;
    workspace_subtitle: string;
    identity_realm_key: string;
    provider_hint: string | null;
    auth_method_label: string | null;
    hostname: string | null;
    delivery_email: string | null;
  }>`
    SELECT DISTINCT
      t.id::text                                      AS tenant_id,
      t.code                                         AS tenant_code,
      COALESCE(t.display_name, t.name)               AS tenant_name,
      t.id::text                                     AS workspace_id,
      t.code                                         AS workspace_code,
      COALESCE(t.display_name, t.name)               AS workspace_name,
      'organization'                                 AS workspace_type,
      ${ORGANIZATION_SUBTITLE.admin}                 AS workspace_subtitle,
      pib.realm_key                                  AS identity_realm_key,
      NULLIF(pib.metadata #>> '{auth,idpHint}', '')  AS provider_hint,
      NULLIF(pib.metadata #>> '{auth,label}', '')    AS auth_method_label,
      NULLIF(pib.metadata #>> '{auth,hostname}', '') AS hostname,
      COALESCE(
        lower(NULLIF(p.login_email, '')),
        lower(NULLIF(pib.idp_snapshot #>> '{email}', '')),
        lower(NULLIF(pib.provider_attributes #>> '{email}', '')),
        lower(NULLIF(pib.metadata #>> '{email}', ''))
      )                                              AS delivery_email
    FROM master.principal p
    JOIN master.principal_identity_binding pib
      ON  pib.tenant_id = p.tenant_id
      AND pib.principal_id = p.id
    JOIN master.tenant t
      ON t.id = p.tenant_id
    WHERE ${identityPredicate(identifier)}
      AND p.is_active = true
      AND p.is_locked = false
      AND t.status = 'active'
      AND pib.provider_code = 'keycloak'
      AND pib.idp_enabled = true
      AND pib.sync_status <> 'disabled'
      AND EXISTS (
        SELECT 1
        FROM master.tenant_admin_grant tag
        WHERE tag.tenant_id = p.tenant_id
          AND tag.principal_id = p.id
          AND tag.is_active = true
          AND (tag.effective_until IS NULL OR tag.effective_until > now())
      )
    ORDER BY tenant_name, tenant_code
    LIMIT 50
  `.execute(db);

  return result.rows;
}
