import "server-only";

// products/neon/auth/server/keycloak.ts
//
// Keycloak OIDC integration — pure functions for the PKCE Authorization Code flow.
//
// This module replaces the old Direct Grant (password) flow with PKCE.
// No passwords are ever handled by our app; all credential verification
// happens at Keycloak's login form.
//
// PKCE (Proof Key for Code Exchange) flow summary:
//   1. Client generates a random codeVerifier + SHA-256(codeVerifier) = codeChallenge
//   2. Browser redirected to Keycloak with codeChallenge (login/route.ts)
//   3. Keycloak authenticates user and redirects back with authorization code
//   4. Server exchanges code + codeVerifier for tokens (callback/route.ts)
//   5. Keycloak verifies SHA-256(codeVerifier) === codeChallenge → issues tokens
//
// This prevents authorization code interception attacks because the attacker
// doesn't have the codeVerifier (stored server-side in Redis, never in browser).
//
// All functions use Keycloak's standard OIDC endpoints:
//   - /realms/{realm}/protocol/openid-connect/auth    (authorization)
//   - /realms/{realm}/protocol/openid-connect/token   (token exchange + refresh)
//   - /realms/{realm}/protocol/openid-connect/logout   (backchannel + front-channel)
//
// Callers:
//   - login/route.ts → generatePkceChallenge(), buildAuthorizationUrl()
//   - callback/route.ts → exchangeCodeForTokens(), decodeJwtPayload()
//   - refresh/route.ts → refreshTokens()
//   - logout/route.ts → keycloakLogout(), buildFrontChannelLogoutUrl()

import { createHash, randomBytes } from "node:crypto";

// ─── PKCE Utilities ──────────────────────────────────────────────

/**
 * Generate PKCE challenge parameters for the Authorization Code flow.
 *
 * - codeVerifier: 32 random bytes, base64url-encoded (stored in Redis, never in browser)
 * - codeChallenge: SHA-256(codeVerifier), base64url-encoded (sent to Keycloak)
 * - state: 16 random bytes, hex-encoded (CSRF protection for the auth redirect)
 */
export function generatePkceChallenge(): {
    codeVerifier: string;
    codeChallenge: string;
    state: string;
} {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const state = randomBytes(16).toString("hex");
    return { codeVerifier, codeChallenge, state };
}

// ─── Authorization URL Builder ───────────────────────────────────

export interface BuildAuthUrlParams {
    baseUrl: string;
    realm: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    scope?: string;
    /** OIDC prompt parameter: "login" forces re-authentication even if SSO session exists */
    prompt?: "none" | "login" | "consent" | "select_account";
}

/**
 * Build the Keycloak authorization endpoint URL for PKCE flow.
 */
export function buildAuthorizationUrl(params: BuildAuthUrlParams): string {
    const { baseUrl, realm, clientId, redirectUri, codeChallenge, state, scope, prompt } = params;
    const authUrl = new URL(`${baseUrl}/realms/${realm}/protocol/openid-connect/auth`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", scope ?? "openid profile email");
    if (prompt) authUrl.searchParams.set("prompt", prompt);
    return authUrl.toString();
}

// ─── Token Exchange ──────────────────────────────────────────────

export interface KeycloakTokenResponse {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
    refresh_expires_in?: number;
    token_type: string;
    scope: string;
    session_state?: string;
}

export interface ExchangeCodeParams {
    baseUrl: string;
    realm: string;
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
}

/**
 * Exchange an authorization code for tokens at Keycloak's token endpoint.
 *
 * Called from callback/route.ts after the user successfully authenticates
 * at Keycloak and is redirected back with an authorization code.
 *
 * The codeVerifier proves we initiated the flow (PKCE binding).
 * Keycloak computes SHA-256(codeVerifier) and compares it to the
 * codeChallenge sent during authorization — if they match, tokens are issued.
 *
 * Throws on failure (HTTP non-200 from Keycloak).
 */
export async function exchangeCodeForTokens(params: ExchangeCodeParams): Promise<KeycloakTokenResponse> {
    const { baseUrl, realm, clientId, code, codeVerifier, redirectUri } = params;
    const tokenUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
    });

    const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Keycloak token exchange failed (${res.status}): ${text}`);
    }

    return (await res.json()) as KeycloakTokenResponse;
}

// ─── Token Refresh ───────────────────────────────────────────────

export interface RefreshTokensParams {
    baseUrl: string;
    realm: string;
    clientId: string;
    refreshToken: string;
}

/**
 * Refresh tokens using the current refresh token.
 *
 * Keycloak rotates the refresh token on each use (one-time-use policy).
 * The caller MUST store the new refresh_token from the response and
 * discard the old one. Using a stale refresh token will fail and may
 * revoke the entire session (depending on Keycloak realm settings).
 *
 * Called from refresh/route.ts on the proactive refresh schedule
 * (90 seconds before access token expiry).
 *
 * Throws on failure — the caller should destroy the session and
 * redirect to login when this happens.
 */
export async function refreshTokens(params: RefreshTokensParams): Promise<KeycloakTokenResponse> {
    const { baseUrl, realm, clientId, refreshToken } = params;
    const tokenUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
    });

    const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Keycloak token refresh failed (${res.status}): ${text}`);
    }

    return (await res.json()) as KeycloakTokenResponse;
}

// ─── Keycloak Logout ─────────────────────────────────────────────

export interface LogoutParams {
    baseUrl: string;
    realm: string;
    clientId: string;
    idToken?: string;
    refreshToken?: string;
}

/**
 * Server-side backchannel logout — revokes tokens at Keycloak's logout endpoint.
 *
 * This revokes the refresh token so it can't be used even if leaked.
 * However, it does NOT end the Keycloak SSO session (browser cookie).
 * For that, the browser must visit the front-channel logout URL
 * (see buildFrontChannelLogoutUrl below).
 *
 * This is best-effort — Keycloak may be unreachable, but we still
 * destroy the local Redis session regardless. Errors are silently caught.
 */
export async function keycloakLogout(params: LogoutParams): Promise<void> {
    const { baseUrl, realm, clientId, idToken, refreshToken } = params;
    const logoutUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/logout`;

    const body = new URLSearchParams({ client_id: clientId });
    if (idToken) body.set("id_token_hint", idToken);
    if (refreshToken) body.set("refresh_token", refreshToken);

    try {
        await fetch(logoutUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
    } catch {
        // Keycloak logout is best-effort
    }
}

/**
 * Build Keycloak front-channel logout URL (RP-Initiated Logout / OIDC spec).
 *
 * The browser must navigate to this URL to end the Keycloak SSO session.
 * Without this, the user's Keycloak SSO cookie remains valid and clicking
 * "Login" again would silently re-authenticate without showing the login form
 * (unless prompt=login is used, which we do as defense-in-depth).
 *
 * After visiting this URL, Keycloak redirects to postLogoutRedirectUri
 * (typically /login) to complete the logout flow.
 */
export function buildFrontChannelLogoutUrl(params: {
    baseUrl: string;
    realm: string;
    idToken?: string;
    postLogoutRedirectUri?: string;
}): string {
    const { baseUrl, realm, idToken, postLogoutRedirectUri } = params;
    const logoutUrl = new URL(`${baseUrl}/realms/${realm}/protocol/openid-connect/logout`);
    if (idToken) logoutUrl.searchParams.set("id_token_hint", idToken);
    if (postLogoutRedirectUri) logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    return logoutUrl.toString();
}

// ─── JWT Decode (no verification) ────────────────────────────────
//
// Used in callback/route.ts to extract claims (sub, roles, email, name)
// from the access token AFTER it was received directly from Keycloak's
// token endpoint over HTTPS. Since the token came from a trusted source
// (not from a browser), signature verification is not needed here.
//
// Framework-level JWT verification (via jose JWKS) happens at the
// runtime API boundary (express.httpServer.ts), not in the BFF.

export function decodeJwtPayload(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT format");
    const payload = Buffer.from(parts[1]!, "base64url").toString("utf-8");
    return JSON.parse(payload);
}

// ─── Keycloak Userinfo ──────────────────────────────────────────
//
// Fetches the canonical identity from Keycloak's userinfo endpoint.
// Used by diagnostics actions (sync-profile, session/rebuild) to
// refresh session identity fields without a full re-login.

export async function fetchUserinfo(params: {
    baseUrl: string;
    realm: string;
    accessToken: string;
}): Promise<Record<string, unknown>> {
    const { baseUrl, realm, accessToken } = params;
    const url = `${baseUrl}/realms/${realm}/protocol/openid-connect/userinfo`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Keycloak userinfo failed (${res.status}): ${text}`);
    }
    return (await res.json()) as Record<string, unknown>;
}
