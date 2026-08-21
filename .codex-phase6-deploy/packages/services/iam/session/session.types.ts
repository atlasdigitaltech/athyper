/**
 * IAM Session Types — v4.1
 *
 * Two endpoints share these types:
 *   GET /api/session/bootstrap          — all tenants + entities the user can access
 *   GET /api/session?tenant=X&entity=Y&workbench=Z — resolved runtime session
 *
 * JWT shapes handled (KC 26.5.1):
 *   organization:       ["athyper--ATHQ", "athyper--AMRE"]  ← alias string array
 *   resource_access:    { "neon-web": { roles: ["AUTHORIZED"] } }
 *
 * Session org alias format: "{tenant_code}--{legal_entity_code}".
 * KC org aliases remain opaque ORG-* values and are translated by the BFF or context resolver.
 */

// ─── Session endpoint types ───────────────────────────────────────────────────

export interface SessionQuery {
  /** KC JWT subject — matches principal_identity_binding.subject_id in the plane's DB */
  sub: string;
  /** Realm key derived from `iss` claim (last path segment). e.g. "athyper" or "mesh" */
  realmKey: string;
  /** Product plane requesting the runtime context. */
  planeKey: "neon" | "mesh" | "admin";
  /**
   * Neon/admin plane: master.tenant.code. e.g. "athyper"
   * Mesh plane: network provider code or "mesh" sentinel.
   */
  tenant: string;
  /**
   * Neon/admin plane: master.legal_entity.code. e.g. "LE-ATHQ"
   * Mesh plane: mesh.network_account.account_code (BNA code). e.g. "BNA-0000000001"
   */
  entity: string;
  /** "user" | "partner" | "admin" */
  workbench: string;
  /**
   * All KC org aliases the user belongs to, extracted from the JWT
   * `organization` claim. Membership gate: `${tenant}--${entity}` must be present.
   */
  orgAliases: string[];
  /**
   * Workbench roles derived from realm_access.roles and the active plane:
   *   NEON_USER         -> "user" on Neon
   *   MESH_BUYER_USER   -> "user" on Mesh
   *   MESH_PARTNER_USER -> "partner" on Mesh
   *   ADMIN_USER        -> "admin" on Admin
   */
  workbenches: string[];
  /**
   * UUID of a delegation_grant the user wants to activate for this session.
   * The delegate must be the current principal and the grant must be non-revoked
   * and non-expired. Permissions from the grant are merged (unioned) with the
   * principal's own persona permissions.
   */
  delegationId?: string;

  // ── JIT provisioning identity fields ──────────────────────────────────────
  // Forwarded from the verified JWT claims so the session service can
  // auto-provision a principal on first login when no principal_identity_binding
  // exists. JIT is only attempted when both `username` and `name` are present.
  /** KC `preferred_username` claim. Used as principal.code for JIT. */
  username?: string;
  /** KC `name` claim. Used as principal.name / profile.display_name for JIT. */
  name?: string;
  /** KC `email` claim. Optional; controls idp_email_verified in JIT binding. */
  email?: string;
}

export interface SessionEntityInfo {
  code: string;
  name: string;
  country: string;
}

/** Mesh-plane account identity included in the session response entity field. */
export interface MeshAccountInfo extends SessionEntityInfo {
  /** BNA code e.g. "BNA-0000000001" */
  code: string;
  /** mesh.network_account.display_name */
  name: string;
  /** mesh.network_account.account_grant role: account_owner | account_admin | account_user */
  role: string;
  /** mesh.network_account.participant_type */
  participantType: string | null;
  /** mesh.network_account.verification_status */
  verificationStatus: string;
  country: string;
}

export interface SessionModule {
  code: string;
  name: string;
  /** Default "user". "admin" for modules only accessible in admin workbench. */
  level: "user" | "admin";
}

export interface SessionScope {
  /** true when the principal has a tenant-wide role assignment (assignment_scope_type = 'tenant') */
  all: boolean;
  /** Explicit company_code codes when all=false. Empty when all=true. */
  company_codes: string[];
  /** Widest row-level visibility across all group roles: 'all' > 'team' > 'own' */
  visibility: "all" | "own" | "team";
}

export interface SessionPartner {
  type: "supplier" | "customer" | "logistics";
  linked_id: string;
  linked_code: string;
}

export interface DelegationAvailable {
  delegation_id: string;
  delegator_name: string;
  delegator_persona: string;
  permissions: string[];
  expires_at: string; // ISO 8601
  /** master.delegation_scope lookup code: company_code | module | task | entity | workflow */
  scope_type: string;
  /** Scope reference value, e.g. "ATHQ" for company_code, "ACC" for module. Null = tenant-wide. */
  scope_ref: string | null;
}

export interface ActiveDelegation {
  delegation_id: string;
  delegator_name: string;
  merged_permissions: string[];
}

export interface SessionResponse {
  persona: string;
  workbench: "user" | "partner" | "admin";
  entity: SessionEntityInfo;
  modules: SessionModule[];
  /** Platform-level workspace codes. First-pass: []. */
  platform: { code: string }[];
  /** All known permissions keyed by code. false = not granted by current persona. */
  permissions: Record<string, boolean>;
  scope: SessionScope;
  partner?: SessionPartner;
  delegations_available: DelegationAvailable[];
  active_delegation?: ActiveDelegation;
}

/** Query params accepted by GET /api/session */
export interface SessionRouteQuery {
  tenant?: string;
  entity?: string;
  workbench?: string;
  /** UUID of a delegation_grant to activate. Merges delegated permissions into session. */
  delegation?: string;
}

// ─── Internal cache format ────────────────────────────────────────────────────
// CachedSession is stored in Redis but NEVER returned to clients.
// auth_epoch and principal_id are internal-only fields used by the session
// service to detect stale cache entries after security-critical mutations.

/**
 * Internal Redis cache envelope wrapping SessionResponse.
 * The session service stores this format; the route handler extracts `.response`.
 *
 * auth_epoch: matches master.principal.auth_epoch at write time.
 *   On cache hit the service compares this with a short-lived Redis epoch mirror.
 *   A mismatch forces cache invalidation + re-resolution.
 *
 * principal_id: UUID needed for the DB auth_epoch lookup without an extra JOIN.
 */
export interface CachedSession {
  /** master.principal.auth_epoch at the time this session was cached. */
  auth_epoch: number;
  /** UUID of the resolved principal (master.principal.id). */
  principal_id: string;
  /** The public session response returned to clients. */
  response: SessionResponse;
}

// ─── Bootstrap endpoint types ─────────────────────────────────────────────────

export interface BootstrapPrincipal {
  id: string;
  name: string;
  email: string;
}

export interface BootstrapEntity {
  code: string;
  name: string;
  type: string;            // legal_entity.entity_type
  country: string;         // legal_entity.country_code
  legal_entity: string;    // legal_entity.code (for LE grouping in UI)
  workbenches: ("user" | "partner" | "admin")[];
  persona_summary: string; // resolved persona code for this entity
  module_count: number;
}

export interface BootstrapTenant {
  code: string;
  name: string;
  workbenches: ("user" | "partner" | "admin")[];
  entities: BootstrapEntity[];
}

export interface BootstrapResponse {
  principal: BootstrapPrincipal;
  tenants: BootstrapTenant[];
  delegation_count: number;
}

/** Input passed from bootstrap route handler to bootstrap service */
export interface BootstrapQuery {
  sub: string;
  realmKey: string;
  planeKey: "neon" | "mesh" | "admin";
  name: string;          // from JWT name / preferred_username
  email: string;         // from JWT email claim
  orgAliases: string[];  // ["athyper--le-athq", "pepsi--le-pepsi"]
  workbenches: string[]; // ["user", "partner"]
}
