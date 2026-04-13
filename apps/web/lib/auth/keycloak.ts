import "server-only";
import { createHash, randomBytes } from "node:crypto";

// ── PKCE ──────────────────────────────────────────────────────────────────────

export interface PkceChallenge {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

/** Generate a PKCE S256 challenge + random state token. */
export function generatePkceChallenge(): PkceChallenge {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { codeVerifier, codeChallenge, state };
}

// ── Authorization URL ─────────────────────────────────────────────────────────

export function buildAuthorizationUrl(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  prompt?: string;
  idpHint?: string;
}): string {
  const url = new URL(
    `${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/auth`,
  );
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("response_type", "code");
  // Include `organization` scope so KC includes the org claim in the token
  url.searchParams.set("scope", "openid profile email organization");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", opts.state);
  if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
  if (opts.idpHint) url.searchParams.set("kc_idp_hint", opts.idpHint);
  return url.toString();
}

// ── JWT decode (no verify) ────────────────────────────────────────────────────

/**
 * Decode JWT payload without signature verification.
 * Safe to use in the BFF because the token was received directly
 * from Keycloak's token endpoint over HTTPS — already trustworthy.
 * The runtime API does full jose verification at the resource server boundary.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) throw new Error("Invalid JWT format");
  return JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in?: number;
  scope?: string;
  session_state?: string;
}

export async function exchangeCodeForTokens(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const endpoint = `${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    code: opts.code,
    code_verifier: opts.codeVerifier,
    redirect_uri: opts.redirectUri,
  });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function refreshTokens(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const endpoint = `${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: opts.clientId,
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

// ── Logout ────────────────────────────────────────────────────────────────────

/** Backchannel logout: revoke the refresh token at Keycloak. Best-effort. */
export async function revokeToken(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  token: string;
  tokenTypeHint?: string;
}): Promise<void> {
  const endpoint = `${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/revoke`;
  const body = new URLSearchParams({
    client_id: opts.clientId,
    token: opts.token,
    ...(opts.tokenTypeHint ? { token_type_hint: opts.tokenTypeHint } : {}),
  });
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Best-effort — Keycloak may be temporarily unavailable
  }
}

/** Build the front-channel logout URL (browser must navigate to this).
 *
 * KC 18+ requires EITHER id_token_hint OR client_id to be present when
 * post_logout_redirect_uri is supplied; without one the redirect is silently
 * ignored and KC falls back to its own confirmation page.
 * We always include client_id so the logout works even when the id_token has
 * already been cleared from the session.
 */
export function buildFrontChannelLogoutUrl(opts: {
  baseUrl: string;
  realm: string;
  clientId: string;
  idToken?: string;
  postLogoutRedirectUri?: string;
}): string {
  const url = new URL(
    `${opts.baseUrl}/realms/${opts.realm}/protocol/openid-connect/logout`,
  );
  url.searchParams.set("client_id", opts.clientId);
  if (opts.idToken) url.searchParams.set("id_token_hint", opts.idToken);
  if (opts.postLogoutRedirectUri)
    url.searchParams.set("post_logout_redirect_uri", opts.postLogoutRedirectUri);
  return url.toString();
}
