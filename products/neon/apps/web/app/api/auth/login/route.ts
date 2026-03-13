import { AuthAuditEvent, emitBffAudit } from "@neon/auth/audit";
import {
  buildAuthorizationUrl,
  generatePkceChallenge,
} from "@neon/auth/keycloak";
import { NextResponse } from "next/server";

import { getSessionRedis } from "@/lib/auth/session-redis";

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
  const workbench = url.searchParams.get("workbench") ?? null;
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
    redis = await getSessionRedis();
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

  await redis.set(
      `pkce_state:${state}`,
      JSON.stringify({
        codeVerifier,
        // workbench is null for tenant-flow logins; resolution happens post-callback
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
      workbench: workbench ?? "none",
      meta: { returnUrl },
    });

  const authUrl = buildAuthorizationUrl({
    baseUrl,
    realm,
    clientId,
    redirectUri,
    codeChallenge,
    state,
    prompt: "login", // Force Keycloak to show login form (prevents SSO session reuse after logout)
  });

  // Pass theme_preset to KC via kc_locale so FTL templates can apply the user's palette.
  // KC stores kc_locale in the auth session and exposes it as `locale` across all flow steps.
  const cookieStr = req.headers.get("cookie") ?? "";
  const rawTheme = cookieStr.split("; ").find((c) => c.startsWith("theme_preset="))?.split("=")[1];
  const themePreset = rawTheme ? decodeURIComponent(rawTheme) : undefined;
  const finalUrl = new URL(authUrl);
  if (themePreset) finalUrl.searchParams.set("kc_locale", themePreset);

  return NextResponse.redirect(finalUrl.toString());
}
