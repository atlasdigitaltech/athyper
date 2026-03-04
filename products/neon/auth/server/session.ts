import "server-only";

// products/neon/auth/server/session.ts
//
// Cookie management for the BFF session layer.
//
// The browser holds exactly TWO cookies:
//
//   1. `neon_sid` (httpOnly, Secure in prod, SameSite=Lax)
//      - Opaque session ID (SHA-256 hash, not guessable)
//      - Maps to a Redis key: `sess:{tenantId}:{sid}`
//      - httpOnly prevents XSS from reading the session ID
//      - SameSite=Lax allows top-level navigations (Keycloak redirects) but
//        blocks cross-site POST requests
//
//   2. `__csrf` (NOT httpOnly, Secure in prod, SameSite=Strict)
//      - Random UUID v4
//      - NOT httpOnly by design — client JS reads it to send as x-csrf-token header
//      - SameSite=Strict prevents it from being sent on any cross-site request
//      - Validated by middleware.ts (double-submit cookie pattern)
//
// Cookie lifecycle:
//   - Set: callback/route.ts (after successful login)
//   - Rotated: refresh/route.ts (new sid + new csrf on token refresh)
//   - Cleared: logout/route.ts (explicit logout or idle timeout)
//
// maxAge: 28800 seconds (8 hours) — matches the Redis session TTL.
// If Redis expires the session before the cookie, the next request gets 401
// and the user is redirected to login.

import { cookies } from "next/headers";

const SID_COOKIE = "neon_sid";
const CSRF_COOKIE = "__csrf";

/**
 * Set the session ID cookie.
 *
 * httpOnly: true — prevents XSS from reading the session ID.
 * secure: true in production/staging — prevents transmission over HTTP.
 * sameSite: "lax" — allows Keycloak's authorization redirect (top-level GET)
 *   but blocks cross-site form submissions. "strict" would break the OAuth
 *   callback redirect because the cookie wouldn't be sent on Keycloak → our app.
 * maxAge: 28800 (8h) — absolute maximum; Redis TTL may expire sooner.
 */
export async function setSessionCookie(sid: string, env: string = "local"): Promise<void> {
    const isProduction = env === "production" || env === "staging";
    const cookieStore = await cookies();
    cookieStore.set(SID_COOKIE, sid, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 28800, // 8 hours (must match Redis EX in callback/route.ts)
    });
}

/**
 * Clear the session ID cookie. Called during logout.
 */
export async function clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(SID_COOKIE);
}

/**
 * Read the session ID from cookie. Returns null if not present.
 * Used by all BFF route handlers to identify the current session.
 */
export async function getSessionId(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(SID_COOKIE)?.value ?? null;
}

/**
 * Set the CSRF double-submit cookie.
 *
 * httpOnly: false — intentional. Client JS must read this value to
 *   send it as the x-csrf-token header on mutating requests.
 * sameSite: "strict" — stricter than the session cookie because the CSRF
 *   cookie is never needed during cross-site navigations (Keycloak redirects
 *   use GET which doesn't need CSRF, and the callback creates a new CSRF token).
 */
export async function setCsrfCookie(token: string, env: string = "local"): Promise<void> {
    const isProduction = env === "production" || env === "staging";
    const cookieStore = await cookies();
    cookieStore.set(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "strict",
        path: "/",
        maxAge: 28800, // 8 hours (matches session cookie lifetime)
    });
}

/**
 * Clear the CSRF cookie. Called during logout alongside clearSessionCookie.
 */
export async function clearCsrfCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(CSRF_COOKIE);
}

/**
 * Read the CSRF token from cookie.
 * Used by route handlers that need to validate or rotate the CSRF token.
 */
export async function getCsrfCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(CSRF_COOKIE)?.value ?? null;
}
