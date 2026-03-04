// framework/runtime/src/services/platform/foundation/security/env-profiles.ts
//
// Per-environment auth security profiles.
// Provides safe defaults for local, staging, and production.

export interface AuthEnvironmentProfile {
    /** Access token TTL in seconds. */
    accessTokenTTL: number;
    /** Server-side session TTL in seconds. */
    sessionTTL: number;
    /** Set Secure flag on cookies. */
    cookieSecure: boolean;
    /** Cookie domain. */
    cookieDomain: string;
    /** Validate JWT issuer matches config strictly. */
    strictIssuerCheck: boolean;
    /** Allow Keycloak Direct Grant (password) flow. */
    allowPasswordGrant: boolean;
    /** Require HTTPS for all auth endpoints. */
    requireHttps: boolean;
    /** PKCE state TTL in seconds (for auth code flow). */
    pkceStateTTL: number;
    /** Idle timeout before session expiry warning (seconds). */
    idleWarningBeforeExpiry: number;
}

const LOCAL_PROFILE: AuthEnvironmentProfile = {
    accessTokenTTL: 300,           // 5 min
    sessionTTL: 3600,              // 1 hour
    cookieSecure: false,
    cookieDomain: "localhost",
    strictIssuerCheck: false,
    allowPasswordGrant: true,      // dev convenience
    requireHttps: false,
    pkceStateTTL: 300,             // 5 min
    idleWarningBeforeExpiry: 120,  // 2 min warning
};

const STAGING_PROFILE: AuthEnvironmentProfile = {
    accessTokenTTL: 600,           // 10 min
    sessionTTL: 7200,              // 2 hours
    cookieSecure: true,
    cookieDomain: ".staging.athyper.com",
    strictIssuerCheck: true,
    allowPasswordGrant: false,
    requireHttps: true,
    pkceStateTTL: 300,
    idleWarningBeforeExpiry: 180,  // 3 min warning
};

const PRODUCTION_PROFILE: AuthEnvironmentProfile = {
    accessTokenTTL: 900,           // 15 min
    sessionTTL: 28800,             // 8 hours
    cookieSecure: true,
    cookieDomain: ".athyper.com",
    strictIssuerCheck: true,
    allowPasswordGrant: false,
    requireHttps: true,
    pkceStateTTL: 300,
    idleWarningBeforeExpiry: 180,  // 3 min warning
};

const PROFILES: Record<string, AuthEnvironmentProfile> = {
    local: LOCAL_PROFILE,
    staging: STAGING_PROFILE,
    production: PRODUCTION_PROFILE,
};

/**
 * Returns the auth security profile for the given environment.
 * Falls back to production (most secure) for unknown environments.
 */
export function getAuthEnvironmentProfile(env: "local" | "staging" | "production" | string): AuthEnvironmentProfile {
    return PROFILES[env] ?? PRODUCTION_PROFILE;
}
