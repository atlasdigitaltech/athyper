/**
 * v4 Auth Session Types
 *
 * The v4 model uses KC Organizations (one per legal entity) with alias
 * format `{tenant_code}:{entity_code}`. The session stores all orgs the
 * user belongs to; the active org/workbench is set by /auth/select.
 */

export interface OrgMembership {
  /** KC organization UUID */
  id: string;
  /** Display name of the organization */
  name: string;
  /**
   * KC org alias: {tenant_code}--{entity_code} — e.g. "athyper--ATHQ"
   * Double-dash separator is KC-alias-safe (KC forbids colons in org aliases).
   */
  alias: string;
  /** Workbench roles granted in this org: "user" | "partner" | "admin" */
  roles: string[];
}

/** Full session stored in Redis (never sent to browser) */
export interface V4Session {
  version: 2;
  sid: string;
  /** Keycloak realm key — used as Redis namespace */
  realmKey: string;
  // ── Identity ──────────────────────────────────────────────
  userId: string;        // KC sub claim
  username: string;      // preferred_username
  displayName: string;
  email?: string;
  // ── Organizations (normalized from KC org claim) ───────────
  /** Keyed by alias, e.g. { "athyper--ATHQ": { ... } } */
  organizations: Record<string, OrgMembership>;
  // ── Working context — null until user selects at /auth/select
  activeOrg: string | null;
  activeWorkbench: string | null;
  // ── Tokens (server-side only) ──────────────────────────────
  scope: string;
  tokenType: string;
  keycloakSessionId?: string;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number;
  refreshExpiresAt?: number;
  idToken?: string;
  // ── Session binding (soft IP/UA) ───────────────────────────
  ipHash: string;
  uaHash: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  // ── MFA ────────────────────────────────────────────────────
  mfaRequired: boolean;
  mfaVerified: boolean;
  mfaVerifiedAt?: number;
}

/** Public session shape returned by GET /api/auth/session */
export interface PublicSession {
  authenticated: true;
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  organizations: Record<string, OrgMembership>;
  activeOrg: string | null;
  activeWorkbench: string | null;
  accessExpiresAt: number;
  mfaRequired: boolean;
  mfaVerified: boolean;
}
