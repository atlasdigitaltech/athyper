import { AuthAuditEvent, emitBffAudit } from "@neon/auth/audit";
import {
  buildAuthorizationUrl,
  generatePkceChallenge,
} from "@neon/auth/keycloak";
import { NextResponse } from "next/server";

async function getRedisClient() {
  const { createClient } = await import("redis");
  const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
  const client = createClient({ url });
  // Suppress unhandled error events — errors are caught by callers via the connect() rejection
  client.on("error", () => {});
  if (!client.isOpen) await client.connect();
  return client;
}

/**
 * GET /api/auth/login?workbench=admin&returnUrl=/dashboard
 *
 * Initiates the PKCE Authorization Code flow by redirecting the browser
 * to the Keycloak authorization endpoint.
 *
 * This endpoint does NOT handle credentials — all authentication happens
 * at Keycloak. The browser is redirected there and Keycloak redirects back
 * to /api/auth/callback with an authorization code.
 *
 * Flow:
 *   1. Generate PKCE challenge (codeVerifier + codeChallenge using SHA-256)
 *   2. Generate random `state` parameter (CSRF protection for the auth flow)
 *   3. Store { codeVerifier, workbench, returnUrl } in Redis under
 *      `pkce_state:{state}` with 300s TTL (5 minutes to complete login)
 *   4. Redirect browser to Keycloak authorization URL with:
 *      - response_type=code (Authorization Code flow)
 *      - code_challenge + code_challenge_method=S256 (PKCE)
 *      - state (anti-CSRF)
 *      - prompt=login (force re-authentication, prevent SSO session reuse)
 *
 * Query parameters:
 *   - workbench: "admin" | "user" | "partner" (determines post-login routing)
 *   - returnUrl: URL to redirect to after successful login (default "/")
 *
 * Security notes:
 *   - prompt=login ensures Keycloak shows the login form even if the user
 *     has an active SSO session. This prevents confusion after logout
 *     (without it, clicking "Login" would silently re-authenticate).
 *   - PKCE state TTL is 300s — if the user takes longer than 5 minutes
 *     at the Keycloak login form, the callback will fail with "expired state".
 *   - The codeVerifier is stored in Redis, never sent to the browser.
 *     Only the codeChallenge (SHA-256 hash) goes to Keycloak.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const workbench = url.searchParams.get("workbench") ?? "user";
  const returnUrl = url.searchParams.get("returnUrl") ?? "/";
  const realmParam = url.searchParams.get("realm"); // "platform" for platform-control login

  const baseUrl =
    process.env.KEYCLOAK_BASE_URL ?? "https://iam.mesh.athyper.local";
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const redirectUri = `${publicBaseUrl}/api/auth/callback`;
  const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";

  // Platform-control realm login — uses separate Keycloak realm + client
  const isPlatformLogin =
    realmParam === "platform" &&
    process.env.PLATFORM_CONTROL_ENABLED === "true";

  const realm = isPlatformLogin
    ? (process.env.PLATFORM_KEYCLOAK_REALM ?? "platform-control")
    : (process.env.KEYCLOAK_REALM ?? "athyper");
  const clientId = isPlatformLogin
    ? (process.env.PLATFORM_KEYCLOAK_CLIENT_ID ?? "athyper-admin")
    : (process.env.KEYCLOAK_CLIENT_ID ?? "neon-web");

  const { codeVerifier, codeChallenge, state } = generatePkceChallenge();

  // Store PKCE state in Redis (short TTL — 5 min to complete login)
  let redis;
  try {
    redis = await getRedisClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/login] Redis connection failed:", msg);
    return NextResponse.json(
      {
        error: "REDIS_UNAVAILABLE",
        message: `Cannot connect to Redis. Ensure Redis is running and REDIS_URL is correct in .env.local. (${msg})`,
        hint: "Run: cp .env.example .env.local  (in products/neon/apps/web/)",
      },
      { status: 503 },
    );
  }

  try {
    await redis.set(
      `pkce_state:${state}`,
      JSON.stringify({
        codeVerifier,
        workbench,
        returnUrl,
        isPlatformLogin,
        realm,
      }),
      { EX: 300 },
    );

    // Audit — login flow initiated
    await emitBffAudit(redis, AuthAuditEvent.LOGIN_INITIATED, {
      tenantId,
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
      userAgent: req.headers.get("user-agent") ?? "unknown",
      realm,
      workbench,
      meta: { returnUrl },
    });
  } finally {
    await redis.quit();
  }

  const authUrl = buildAuthorizationUrl({
    baseUrl,
    realm,
    clientId,
    redirectUri,
    codeChallenge,
    state,
    prompt: "login", // Force Keycloak to show login form (prevents SSO session reuse after logout)
  });

  return NextResponse.redirect(authUrl);
}
