// products/neon/auth/server/types.ts
//
// Session type definitions for the BFF auth layer.
//
// Two-tier architecture:
//   - Session (public): safe to send to the browser via SSR bootstrap or /api/auth/session
//   - ServerSession (private): stored in Redis, contains tokens — NEVER sent to browser
//
// The browser only holds the opaque `neon_sid` cookie. All tokens, binding
// hashes, and security metadata live server-side in Redis.

/** Workbench determines post-login routing and UI capabilities. */
export type WorkbenchType = "admin" | "user" | "partner" | "analytics";

/**
 * Public session data — safe to send to the browser.
 *
 * This is the shape returned by GET /api/auth/session and used by
 * the SSR bootstrap (session-bootstrap.ts → layout.tsx).
 *
 * Security invariant: NO tokens, binding hashes, or CSRF tokens.
 * The csrfToken is handled separately via the __csrf cookie.
 */
export interface Session {
    /** Keycloak `sub` claim — the user's unique identifier across the realm. */
    userId: string;
    /** Keycloak `preferred_username` claim. */
    username: string;
    /** Keycloak `name` claim (first + last). */
    displayName?: string;
    /** Which workbench the user logged into (determines UI layout). */
    workbench: WorkbenchType;
    /** Keycloak realm roles (e.g., ["admin", "user"]). */
    roles: string[];
    /** Derived persona (e.g., "tenant_admin", "requester") — drives policy evaluation. */
    persona?: string;
    /** Epoch seconds when the access token expires. Used by useSessionRefresh to schedule refresh. */
    accessExpiresAt?: number;
    /** Whether MFA verification is required before granting access. */
    mfaRequired?: boolean;
    /** Whether MFA has been verified for this session. */
    mfaVerified?: boolean;
    /** Epoch seconds when MFA was last verified. */
    mfaVerifiedAt?: number;
    /** Whether this is a platform-control realm admin session. */
    isPlatformAdmin?: boolean;
    /** Platform-level roles (e.g., ["PRODUCT_ADMIN"]). Only set for platform admin sessions. */
    platformRoles?: string[];
    /** Currently selected tenant ID for platform admin tenant switching. null = no tenant selected yet. */
    selectedTenantId?: string | null;
}

/**
 * Server-side session stored in Redis — NEVER sent to browser.
 *
 * Redis key: `sess:{tenantId}:{sid}` (TTL 28800s / 8 hours)
 * Secondary index: `user_sessions:{tenantId}:{userId}` (SET of sids)
 *
 * Contains ALL tokens (access, refresh, id) and security metadata.
 * The browser only holds the opaque session ID via the `neon_sid` cookie.
 */
export interface ServerSession extends Session {
    /** Client roles from Keycloak resource_access (wb:* and module:*:* roles). */
    clientRoles: string[];
    /** Group membership paths from Keycloak groups claim. */
    groups: string[];
    /** Keycloak access token — sent as Bearer token to runtime API. */
    accessToken: string;
    /** Keycloak refresh token — rotated on each refresh (one-time-use). */
    refreshToken?: string;
    /** Epoch seconds when the refresh token expires. */
    refreshExpiresAt?: number;
    /** Keycloak ID token — needed for front-channel logout (id_token_hint). */
    idToken?: string;
    /** Keycloak realm key (e.g., "neon-dev"). Used for multi-realm routing. */
    realmKey: string;
    /** Tenant ID for session isolation. Cross-tenant access = destroy + audit. */
    tenantId: string;
    /** Principal ID for policy evaluation (usually same as userId). */
    principalId?: string;
    /** SHA-256(client IP at login). Part of soft session binding. */
    ipHash: string;
    /** SHA-256(User-Agent at login). Part of soft session binding. */
    uaHash: string;
    /** CSRF token for double-submit pattern. Matches __csrf cookie. */
    csrfToken: string;
    /** Epoch seconds when the session was created (login callback). */
    createdAt: number;
    /** Epoch seconds of last user activity. Updated by POST /api/auth/touch. */
    lastSeenAt: number;
}
