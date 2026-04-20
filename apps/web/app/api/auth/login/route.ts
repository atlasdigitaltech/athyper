import { NextResponse } from "next/server";

import {
  buildAuthorizationUrl,
  generatePkceChallenge,
} from "@/lib/auth/keycloak";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { sanitizeReturnUrl } from "@/lib/auth/validate-return-url";
import { pkceStateKey } from "@/lib/auth/redis-keys";
import { resolvePublicBaseUrl } from "@/lib/auth/resolve-public-base-url";

/**
 * GET /api/auth/login?returnUrl=/some/path&filter=user&provider=github
 *
 * Initiates the PKCE Authorization Code flow by redirecting the browser
 * to the Keycloak authorization endpoint.
 *
 * v4 changes vs F1:
 *   - `workbench` param removed — org/workbench selection happens post-login
 *     at /auth/select using the KC organization claim.
 *   - `filter` param added — "user" | "partner", forwarded to /auth/select
 *     so only the relevant workbench tiles are shown after login.
 *   - `kc_idp_hint` still supported via `provider` param for social login.
 *   - `realm=platform` still supported for platform-control realm login.
 *
 * Flow:
 *   1. Generate PKCE challenge (codeVerifier + SHA-256 codeChallenge)
 *   2. Generate random state (CSRF for the auth flow itself)
 *   3. Store { codeVerifier, returnUrl, filter, realm, provider } in Redis with 1800s TTL
 *   4. Redirect browser to Keycloak with prompt=login (force re-auth)
 *
 * Query parameters:
 *   returnUrl  — URL to redirect to after /auth/select (default "/")
 *   filter     — "user" | "partner" — workbench filter passed through to /auth/select
 *   realm      — "platform" to use the platform-control realm
 *   provider   — IdP alias for kc_idp_hint (e.g. "github")
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnUrl = sanitizeReturnUrl(url.searchParams.get("returnUrl"), "/");
  const realmParam = url.searchParams.get("realm");
  const provider = url.searchParams.get("provider") ?? null;

  const rawFilter = url.searchParams.get("filter");
  const filter: "user" | "partner" | null =
    rawFilter === "user" || rawFilter === "partner" ? rawFilter : null;

  const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
  const publicBaseUrl = resolvePublicBaseUrl(req);
  const redirectUri = `${publicBaseUrl}/api/auth/callback`;

  const isPlatformLogin =
    realmParam === "platform" &&
    process.env.PLATFORM_CONTROL_ENABLED === "true";

  const { realm, clientId } = resolveRealmConfig(isPlatformLogin);

  const { codeVerifier, codeChallenge, state } = generatePkceChallenge();

  let redis;
  try {
    redis = await getSessionRedis();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/login] Redis connection failed:", msg);
    return NextResponse.json(
      {
        error: "REDIS_UNAVAILABLE",
        message: `Cannot connect to Redis. Ensure Redis is running and REDIS_URL is set. (${msg})`,
      },
      { status: 503 },
    );
  }

  await redis.set(
    pkceStateKey(state),
    JSON.stringify({ codeVerifier, returnUrl, filter, isPlatformLogin, realm, provider, redirectUri }),
    { EX: 1800 }, // 30 min — accommodates email-based flows (magic link, password reset)
  );

  const authUrl = buildAuthorizationUrl({
    baseUrl,
    realm,
    clientId,
    redirectUri,
    codeChallenge,
    state,
    prompt: "login", // Force Keycloak login form even if SSO session exists
    idpHint: provider ?? undefined,
  });

  // Pass the user's colour theme to Keycloak via kc_locale so the neon FTL
  // templates can apply the correct palette across all auth flow steps.
  const cookieStr = req.headers.get("cookie") ?? "";
  const rawTheme = cookieStr
    .split("; ")
    .find((c) => c.startsWith("theme_preset="))
    ?.split("=")[1];
  const themePreset = rawTheme ? decodeURIComponent(rawTheme) : undefined;
  const finalUrl = new URL(authUrl);
  if (themePreset) finalUrl.searchParams.set("kc_locale", themePreset);

  return NextResponse.redirect(finalUrl.toString());
}
