import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  decodeJwtPayload,
  exchangeCodeForTokens,
} from "@/lib/auth/keycloak";
import { normalizeOrganizationClaim } from "@/lib/auth/org-normalize";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { generateSid, hashValue, setCsrfCookie, setSessionCookie } from "@/lib/auth/session";
import type { V4Session } from "@/lib/auth/types";

// ─── KC org enrichment (id + name only — workbenches come from JWT roles) ────
// Workbench shell access is determined by WB_* client roles in resource_access,
// not by org attributes. This admin-API call only enriches id and display name.
const KC_ADMIN_TOKEN_KEY = "kc_admin_token";
const KC_ADMIN_TIMEOUT_MS = 5_000;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KC_ADMIN_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function getKcAdminToken(baseUrl: string): Promise<string | null> {
  const redis = await getSessionRedis();
  try {
    const cached = await redis.get(KC_ADMIN_TOKEN_KEY);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through */ }

  const adminUser = process.env.KEYCLOAK_ADMIN_USERNAME ?? "athyperadmin";
  const adminPass = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "athyperadmin";
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "admin-cli",
          grant_type: "password",
          username: adminUser,
          password: adminPass,
        }),
      },
    );
    if (!res.ok) return null;
    const d = await res.json() as { access_token?: string; expires_in?: number };
    if (!d.access_token) return null;
    const ttl = Math.max((d.expires_in ?? 60) - 10, 5);
    try { await redis.set(KC_ADMIN_TOKEN_KEY, d.access_token, { EX: ttl }); } catch { /* non-fatal */ }
    return d.access_token;
  } catch {
    return null;
  }
}

/** Fetch all KC orgs and return alias → {id, name} map (no workbenches). */
async function fetchAllOrgDetails(
  realm: string,
  baseUrl: string,
  adminToken: string,
): Promise<Map<string, { id: string; name: string }>> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/admin/realms/${realm}/organizations?first=0&max=200`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    if (!res.ok) return new Map();
    const orgs = await res.json() as Array<{ id: string; name?: string; alias?: string }>;
    const map = new Map<string, { id: string; name: string }>();
    for (const o of orgs) {
      if (!o.alias) continue;
      map.set(o.alias, { id: o.id, name: o.name ?? o.alias });
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Fetch all org aliases the user belongs to via KC admin API.
 * Used when KC omits the `organization` JWT claim (e.g. user in 10+ orgs —
 * KC 26.5.1 stops including the claim beyond the default page size).
 * Endpoint: GET /organizations?member={userId}&first=0&max=200
 */
async function fetchUserOrgAliases(
  userId: string,
  realm: string,
  baseUrl: string,
  adminToken: string,
): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/admin/realms/${realm}/organizations?member=${encodeURIComponent(userId)}&first=0&max=200`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    if (!res.ok) return [];
    const orgs = await res.json() as Array<{ alias?: string }>;
    return orgs.flatMap((o) => (o.alias ? [o.alias] : []));
  } catch {
    return [];
  }
}

/** Extract WB_* client roles from resource_access → simple workbench keys. */
function extractWorkbenchRolesFromClaims(resourceAccess: unknown): string[] {
  if (!resourceAccess || typeof resourceAccess !== "object") return [];
  const neonWeb = (resourceAccess as Record<string, unknown>)["neon-web"];
  if (!neonWeb || typeof neonWeb !== "object") return [];
  const roles = (neonWeb as Record<string, unknown>).roles;
  if (!Array.isArray(roles)) return [];
  const workbenches: string[] = [];
  for (const r of roles) {
    if (r === "WB_USER") workbenches.push("user");
    else if (r === "WB_PARTNER") workbenches.push("partner");
    else if (r === "WB_ADMIN") workbenches.push("admin");
  }
  return workbenches;
}

/** Check that ACCESS role is present — gate per IAM §6 step 3. */
function hasAccessRole(resourceAccess: unknown): boolean {
  if (!resourceAccess || typeof resourceAccess !== "object") return false;
  const neonWeb = (resourceAccess as Record<string, unknown>)["neon-web"];
  if (!neonWeb || typeof neonWeb !== "object") return false;
  const roles = (neonWeb as Record<string, unknown>).roles;
  return Array.isArray(roles) && roles.includes("ACCESS");
}

/**
 * GET /api/auth/callback?code=...&state=...
 *
 * Handles the OAuth2 Authorization Code + PKCE callback from Keycloak.
 *
 * v4 changes vs F1:
 *   - No neon:PERSONA:* / WORKBENCH:* client role extraction
 *   - KC organization claim normalized: UUID-keyed → alias-keyed
 *   - Session stores `organizations` map instead of persona/clientRoles
 *   - Redirects to /auth/select (not /auth/resolving)
 *   - Redis namespace = realmKey (not tenantId) — multi-tenant sessions live
 *     in one realm namespace
 *
 * Flow:
 *   1. Validate PKCE state (one-time, prevents CSRF replay)
 *   2. Exchange code + codeVerifier for tokens
 *   3. Decode JWT claims; normalize organization claim
 *   4. Compute IP/UA hashes for soft session binding
 *   5. Create Redis session (8 h TTL)
 *   6. Add sid to user_sessions index
 *   7. Set neon_sid (httpOnly) + __csrf (JS-readable) cookies
 *   8. Redirect to /auth/select
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Derive the public base URL from request headers — the same logic as login/route.ts.
  // Keycloak redirects the browser back here, so the Host header reflects the origin
  // the user actually used (neon.athyper.local, localhost:3000, etc.).
  // PUBLIC_BASE_URL overrides this for containerised deployments.
  const publicBaseUrl = (() => {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const host = req.headers.get("host") ?? url.host;
    return `${proto}://${host}`;
  })();

  if (error) {
    const desc =
      url.searchParams.get("error_description") ?? "Authentication failed";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(desc)}`, publicBaseUrl),
    );
  }

  if (!code || !state) {
    return new NextResponse("Missing code or state parameter", { status: 400 });
  }

  const baseUrl =
    process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
  const env = process.env.ENVIRONMENT ?? "local";

  const clientIp = req.headers.get("x-forwarded-for") ?? "unknown";
  const clientUa = req.headers.get("user-agent") ?? "unknown";

  const redis = await getSessionRedis();

  try {
    // ─── Step 1: Validate PKCE state ────────────────────────────────────────
    const stateKey = `pkce_state:${state}`;
    const stateRaw = await redis.get(stateKey);

    if (!stateRaw) {
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent("Login session expired. Please sign in again.")}`,
          publicBaseUrl,
        ),
      );
    }

    const pkceState = JSON.parse(stateRaw) as {
      codeVerifier: string;
      returnUrl: string;
      isPlatformLogin: boolean;
      realm: string;
      provider: string | null;
      redirectUri?: string;
    };
    await redis.del(stateKey); // One-time use — delete immediately to prevent replay

    const { codeVerifier, returnUrl } = pkceState;
    const isPlatformLogin = pkceState.isPlatformLogin === true;
    const pkceProvider = typeof pkceState.provider === "string" ? pkceState.provider : null;

    const { realm, clientId, sessionNamespace } = resolveRealmConfig(isPlatformLogin);

    // ─── Step 2: Exchange code for tokens ───────────────────────────────────
    // redirectUri must exactly match what was sent in the authorization request.
    // We stored it in PKCE state during /api/auth/login; fall back to publicBaseUrl
    // for sessions initiated before this change was deployed.
    const redirectUri =
      pkceState.redirectUri ?? `${publicBaseUrl}/api/auth/callback`;

    const tokens = await exchangeCodeForTokens({
      baseUrl,
      realm,
      clientId,
      code,
      codeVerifier,
      redirectUri,
    });

    // ─── Step 3: Decode JWT claims ───────────────────────────────────────────
    // No verification needed — token came from Keycloak token endpoint over HTTPS.
    const claims = decodeJwtPayload(tokens.access_token);
    const sub = typeof claims.sub === "string" ? claims.sub : "unknown";
    const preferredUsername =
      typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : sub;
    const email = typeof claims.email === "string" ? claims.email : undefined;
    const displayName =
      typeof claims.name === "string" ? claims.name : preferredUsername;

    // ─── Step 3: ACCESS gate ────────────────────────────────────────────────
    // Every user MUST have the ACCESS client role (IAM §6 step 3).
    if (!hasAccessRole(claims.resource_access)) {
      console.warn("[auth/callback] ACCESS role missing for user:", sub);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent("NO_PLATFORM_ACCESS")}`, publicBaseUrl),
      );
    }

    // ─── Workbench roles from JWT ────────────────────────────────────────────
    // WB_USER / WB_PARTNER / WB_ADMIN are KC group-granted client roles on neon-web.
    // They are global (same for all orgs the user belongs to). No per-org workbench
    // attribute is used — allowed_workbenches was removed from KC orgs (IAM §5.1).
    const kcWorkbenches = extractWorkbenchRolesFromClaims(claims.resource_access);

    // Normalize KC organization claim (UUID-keyed → alias-keyed)
    const organizations = normalizeOrganizationClaim(claims.organization);

    // Enrich org memberships: fill id/name from admin API; assign WB_* roles uniformly.
    try {
      const adminToken = await getKcAdminToken(baseUrl);
      if (adminToken) {
        // Pass 0: org claim absent (>10 orgs) — look up memberships via admin API
        if (Object.keys(organizations).length === 0) {
          const aliases = await fetchUserOrgAliases(sub, realm, baseUrl, adminToken);
          for (const alias of aliases) {
            organizations[alias] = { id: "", name: alias, alias, roles: [] };
          }
        }

        // Pass 1: fill id + name (no workbench enrichment — comes from JWT roles)
        const needsDetail = Object.values(organizations).filter((m) => !m.id);
        if (needsDetail.length > 0) {
          const orgMap = await fetchAllOrgDetails(realm, baseUrl, adminToken);
          for (const membership of needsDetail) {
            const details = orgMap.get(membership.alias);
            if (!details) continue;
            if (!membership.id) membership.id = details.id;
            if (membership.name === membership.alias) membership.name = details.name;
          }
        }
      }
    } catch (enrichErr) {
      console.warn("[auth/callback] Org enrichment failed:", enrichErr);
    }

    // Assign WB_* roles uniformly to all org memberships (IAM §5.2 — roles are global).
    for (const membership of Object.values(organizations)) {
      membership.roles = kcWorkbenches;
    }

    // Provider tenant override: e.g. GITHUB_TENANT_ID=demo_in maps all GitHub
    // logins to the demo_in tenant regardless of KC org claim content.
    if (pkceProvider) {
      const overrideKey = `${pkceProvider.toUpperCase()}_TENANT_ID`;
      const tenantOverride = process.env[overrideKey];
      if (tenantOverride && Object.keys(organizations).length === 0) {
        // Social login with no org claim — inject a minimal org entry so the
        // user can reach the entity selector. Alias is all-lowercase (IAM §5.1).
        const syntheticAlias = `${tenantOverride}--${tenantOverride.toLowerCase()}`;
        organizations[syntheticAlias] = {
          id: "",
          name: tenantOverride,
          alias: syntheticAlias,
          roles: kcWorkbenches,
        };
      }
    }

    // ─── Step 4: Session binding hashes ─────────────────────────────────────
    const ipHash = hashValue(clientIp);
    const uaHash = hashValue(clientUa);
    const csrfToken = randomUUID();
    const sid = generateSid();
    const now = Math.floor(Date.now() / 1000);

    // ─── Step 5: Build and store Redis session ───────────────────────────────
    const session: V4Session = {
      version: 2,
      sid,
      realmKey: realm,
      userId: sub,
      username: preferredUsername,
      displayName,
      email,
      organizations,
      activeOrg: null,      // Set by /auth/select
      activeWorkbench: null,
      scope: tokens.scope ?? "openid profile email organization",
      tokenType: tokens.token_type ?? "Bearer",
      keycloakSessionId: tokens.session_state,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessExpiresAt: now + tokens.expires_in,
      refreshExpiresAt: tokens.refresh_expires_in
        ? now + tokens.refresh_expires_in
        : undefined,
      idToken: tokens.id_token,
      ipHash,
      uaHash,
      csrfToken,
      createdAt: now,
      lastSeenAt: now,
      mfaRequired: false,
      mfaVerified: false,
    };

    await redis.set(
      `sess:${sessionNamespace}:${sid}`,
      JSON.stringify(session),
      { EX: 28800 }, // 8 h absolute TTL
    );

    // ─── Step 6: User session index (enables mass revocation) ───────────────
    await redis.sAdd(`user_sessions:${sessionNamespace}:${sub}`, sid);

    // ─── Step 7: Set cookies ─────────────────────────────────────────────────
    await setSessionCookie(sid, env);
    await setCsrfCookie(csrfToken, env);

    // Log for debugging tenant/org resolution issues
    console.log("[auth/callback] Session created:", {
      sub,
      username: preferredUsername,
      realm,
      orgCount: Object.keys(organizations).length,
      orgAliases: Object.keys(organizations),
      provider: pkceProvider,
    });

    // ─── Step 8: Redirect ────────────────────────────────────────────────────
    if (isPlatformLogin) {
      const target = new URL("/platform", publicBaseUrl);
      const response = NextResponse.redirect(target);
      response.cookies.set("neon_realm", "platform", {
        httpOnly: true,
        secure: env !== "local",
        sameSite: "lax",
        path: "/",
        maxAge: 28800,
      });
      return response;
    }

    // Tenant login → entity/workbench selector
    const selectUrl = new URL("/auth/select", publicBaseUrl);
    if (returnUrl && returnUrl !== "/") {
      selectUrl.searchParams.set("returnUrl", returnUrl);
    }
    const response = NextResponse.redirect(selectUrl);
    response.cookies.delete("neon_realm"); // clear any stale platform cookie
    return response;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Callback error";
    console.error("[auth/callback] Error:", message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, publicBaseUrl),
    );
  }
}
