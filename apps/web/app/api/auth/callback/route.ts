import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  decodeJwtPayload,
  exchangeCodeForTokens,
} from "@/lib/auth/keycloak";
import { normalizeOrganizationClaim } from "@/lib/auth/org-normalize";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, generateSid, hashValue } from "@/lib/auth/session";
import { SESSION_TTL_SECONDS, pkceStateKey, sessKey, userSessionsKey } from "@/lib/auth/redis-keys";
import { MFA_PENDING_TTL_SECONDS } from "@/lib/auth/session-policy";
import { resolvePublicBaseUrl } from "@/lib/auth/resolve-public-base-url";
import type { V4Session } from "@/lib/auth/types";

// ─── KC org enrichment (id + name only — workbenches come from JWT roles) ────
// Workbench shell access is determined by WB_* client roles in resource_access,
// not by org attributes. This admin-API call only enriches id and display name.
const KC_ADMIN_TIMEOUT_MS = 5_000;

type RedisClient = Awaited<ReturnType<typeof getSessionRedis>>;

async function addUserSessionIndex(
  redis: RedisClient,
  indexKey: string,
  sid: string,
  ttlSeconds: number,
): Promise<void> {
  await redis.sAdd(indexKey, sid);
  await redis.expire(indexKey, ttlSeconds);
}

function setAuthCookies(
  response: NextResponse,
  sid: string,
  csrfToken: string,
  env: string,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: env !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KC_ADMIN_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// Realm-scoped cache key prevents cross-realm token collisions in multi-realm setups.
async function getKcAdminToken(baseUrl: string, realm: string): Promise<string | null> {
  const cacheKey = `kc_admin_token:${realm}`;
  const redis = await getSessionRedis();
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through */ }

  const adminUser = process.env.KEYCLOAK_ADMIN_USERNAME;
  const adminPass = process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!adminUser || !adminPass) {
    // Fail loudly in non-local environments — missing credentials should never
    // be silently swallowed in staging/prod as it could mask a misconfiguration.
    if ((process.env.ENVIRONMENT ?? "local") !== "local") {
      console.error("[auth/callback] KEYCLOAK_ADMIN_USERNAME and KEYCLOAK_ADMIN_PASSWORD must be set in non-local environments");
    }
    return null;
  }
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
    try { await redis.set(cacheKey, d.access_token, { EX: ttl }); } catch { /* non-fatal */ }
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
    if (orgs.length === 200) {
      console.warn("[auth/callback] KC org list may be truncated at max=200 — implement pagination if realm exceeds 200 orgs", { realm });
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Fetch org aliases the user belongs to via KC admin API.
 * Used when KC omits the `organization` JWT claim (e.g. user in 10+ orgs —
 * KC 26.5.1 stops including the claim beyond the default page size).
 *
 * KC 26.6.x bug: GET /organizations?member={userId} silently ignores the
 * member filter and returns ALL realm orgs. Guard: if returned count ≥
 * totalOrgCount the filter didn't work — return [] so the caller falls back
 * to an empty set rather than flooding the session with every realm org.
 * The totalOrgCount is passed in from the already-fetched orgMap to avoid
 * an extra round-trip.
 */
async function fetchUserOrgAliases(
  userId: string,
  realm: string,
  baseUrl: string,
  adminToken: string,
  totalOrgCount: number,
): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/admin/realms/${realm}/organizations?member=${encodeURIComponent(userId)}&first=0&max=200`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    if (!res.ok) return [];
    const orgs = await res.json() as Array<{ alias?: string }>;
    const aliases = orgs.flatMap((o) => (o.alias ? [o.alias] : []));
    // KC 26.6.x: if every realm org was returned, the member filter is broken.
    if (totalOrgCount > 0 && aliases.length >= totalOrgCount) {
      console.warn("[auth/callback] KC ?member= filter returned all realm orgs — filter broken, skipping fallback", { userId, returned: aliases.length, total: totalOrgCount });
      return [];
    }
    return aliases;
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

/**
 * Fallback: infer workbenches from the KC `groups` JWT claim when WB_* client
 * roles are absent. This handles KC 26.6.x import regressions where
 * group→client-role mappings aren't resolved during realm import, but the
 * group membership itself IS present in the token (oidc-group-membership-mapper
 * on neon-web writes it directly, independent of role resolution).
 */
function extractWorkbenchesFromGroups(groups: unknown): string[] {
  if (!Array.isArray(groups)) return [];
  const result: string[] = [];
  for (const g of groups) {
    if (typeof g !== "string") continue;
    const name = g.startsWith("/") ? g.slice(1) : g;
    if (name === "grp:workbench:user") result.push("user");
    else if (name === "grp:workbench:partner") result.push("partner");
    else if (name === "grp:workbench:admin") result.push("admin");
  }
  return result;
}

/**
 * Validates that a returnUrl is a safe same-origin relative path.
 * Rejects absolute URLs (open-redirect risk) and empty/root values.
 */
function isSafeReturnUrl(url: string | null | undefined): url is string {
  if (!url || url === "/") return false;
  try {
    // URL constructor with a sentinel base: if the hostname changes, it's absolute.
    const parsed = new URL(url, "https://sentinel.invalid");
    return parsed.hostname === "sentinel.invalid";
  } catch {
    return false;
  }
}

/**
 * Check that ACCESS role is present — gate per IAM §6 step 3.
 * Falls back to groups claim: any workbench group (grp:workbench:*) implicitly
 * grants access, mirroring the KC group→client-role definition.
 */
function hasAccessRole(resourceAccess: unknown, groups?: unknown): boolean {
  if (resourceAccess && typeof resourceAccess === "object") {
    const neonWeb = (resourceAccess as Record<string, unknown>)["neon-web"];
    if (neonWeb && typeof neonWeb === "object") {
      const roles = (neonWeb as Record<string, unknown>).roles;
      if (Array.isArray(roles) && roles.includes("ACCESS")) return true;
    }
  }
  // Fallback: membership in any workbench group implies ACCESS (KC 26.6.x import regression).
  if (Array.isArray(groups)) {
    return groups.some((g) => {
      if (typeof g !== "string") return false;
      const name = g.startsWith("/") ? g.slice(1) : g;
      return name.startsWith("grp:workbench:");
    });
  }
  return false;
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
 *   3b. ACCESS gate — reject users without the ACCESS client role
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

  const publicBaseUrl = resolvePublicBaseUrl(req);

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
    const stateRaw = await redis.get(pkceStateKey(state));

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
      filter: "user" | "partner" | null;
      isPlatformLogin: boolean;
      realm: string;
      provider: string | null;
      redirectUri?: string;
    };
    await redis.del(pkceStateKey(state)); // One-time use — delete immediately to prevent replay

    const { codeVerifier, returnUrl, filter } = pkceState;
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

    // ─── Step 3b: ACCESS gate ────────────────────────────────────────────────
    // Every user MUST have the ACCESS client role (IAM §6 step 3).
    // groups claim is passed as fallback for KC 26.6.x import regression.
    if (!hasAccessRole(claims.resource_access, claims.groups)) {
      console.warn("[auth/callback] ACCESS role missing for user:", sub);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent("NO_PLATFORM_ACCESS")}`, publicBaseUrl),
      );
    }

    // ─── Workbench roles from JWT ────────────────────────────────────────────
    // WB_USER / WB_PARTNER / WB_ADMIN are KC group-granted client roles on neon-web.
    // They are global (same for all orgs the user belongs to). No per-org workbench
    // attribute is used — allowed_workbenches was removed from KC orgs (IAM §5.1).
    // Falls back to the `groups` claim when WB_* roles are absent (KC 26.6.x import
    // regression: group→client-role resolution can silently fail post-import).
    const kcWorkbenchesFromRoles = extractWorkbenchRolesFromClaims(claims.resource_access);
    const kcWorkbenches = kcWorkbenchesFromRoles.length > 0
      ? kcWorkbenchesFromRoles
      : extractWorkbenchesFromGroups(claims.groups);
    if (kcWorkbenchesFromRoles.length === 0 && kcWorkbenches.length > 0) {
      console.warn("[auth/callback] WB_* roles absent — using groups fallback", { userId: sub, workbenches: kcWorkbenches });
    }

    // Normalize KC organization claim (UUID-keyed → alias-keyed)
    const organizations = normalizeOrganizationClaim(claims.organization);

    // Enrich org memberships: fill id/name from admin API; assign WB_* roles uniformly.
    try {
      const adminToken = await getKcAdminToken(baseUrl, realm);
      if (adminToken) {
        // Fetch all org details once — used for both the member-filter guard and id/name fill.
        const orgMap = await fetchAllOrgDetails(realm, baseUrl, adminToken);

        // Pass 0: org claim absent (>10 orgs or KC cache miss) — look up via admin API.
        // totalOrgCount guards against KC 26.6.x ?member= filter returning all realm orgs.
        if (Object.keys(organizations).length === 0) {
          const aliases = await fetchUserOrgAliases(sub, realm, baseUrl, adminToken, orgMap.size);
          for (const alias of aliases) {
            organizations[alias] = { id: "", name: alias, alias, roles: [] };
          }
        }

        // Pass 1: fill id + name for entries that only have an alias (no id yet).
        for (const membership of Object.values(organizations)) {
          if (membership.id) continue;
          const details = orgMap.get(membership.alias);
          if (!details) continue;
          membership.id = details.id;
          if (membership.name === membership.alias) membership.name = details.name;
        }
      }
    } catch (enrichErr) {
      console.warn("[auth/callback] Org enrichment failed:", enrichErr instanceof Error ? enrichErr.message : String(enrichErr), { userId: sub, realm });
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

    // ─── Step 5b: Check app-level MFA ────────────────────────────────────────
    // Backend requires X-Org (tenantCode--entityCode) and X-Realm.
    let requiresMfaChallenge = false;
    const firstOrgAlias = Object.keys(organizations)[0] ?? null;
    if (firstOrgAlias) {
      try {
        const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
        const mfaRes = await fetchWithTimeout(`${runtimeApiUrl}/api/iam/mfa`, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "X-Org": firstOrgAlias,
            "X-Realm": realm,
          },
        });
        if (mfaRes.ok) {
          const mfaData = await mfaRes.json() as { methods?: Array<{ is_enabled: boolean; is_verified: boolean }> };
          requiresMfaChallenge = mfaData.methods?.some((m) => m.is_enabled && m.is_verified) ?? false;
        }
        console.log("[auth/callback] MFA check:", { status: mfaRes.status, xOrg: firstOrgAlias, requiresMfaChallenge });
      } catch (e) {
        console.warn("[auth/callback] MFA check failed — backend unreachable, skipping MFA gate", e);
      }
    }

    // ─── Step 5c: Trusted device bypass ──────────────────────────────────────
    // If the browser presents a valid td_token cookie, skip MFA challenge.
    if (requiresMfaChallenge && firstOrgAlias) {
      try {
        const { cookies: nextCookies } = await import("next/headers");
        const cookieStore = await nextCookies();
        const rawToken = cookieStore.get("td_token")?.value;
        if (rawToken) {
          const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
          const tdRes = await fetchWithTimeout(
            `${runtimeApiUrl}/api/iam/trusted-devices/verify`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokens.access_token}`,
                "X-Org": firstOrgAlias,
                "X-Realm": realm,
              },
              body: JSON.stringify({ token: rawToken }),
            },
          );
          if (tdRes.ok) {
            requiresMfaChallenge = false;
            session.mfaVerified = true;
            console.log("[auth/callback] Trusted device bypass — MFA skipped");
          }
        }
      } catch {
        // Fail safe: if verify fails, still require MFA
      }
    }

    if (requiresMfaChallenge) {
      session.mfaRequired = true;
    }

    await redis.set(
      sessKey(sessionNamespace, sid),
      JSON.stringify(session),
      { EX: SESSION_TTL_SECONDS },
    );

    // ─── Step 6: User session index ─────────────────────────────────────────
    const sessionIndexKey = userSessionsKey(sessionNamespace, sub);
    await addUserSessionIndex(redis, sessionIndexKey, sid, SESSION_TTL_SECONDS);

    console.log("[auth/callback] Session created:", { sub, username: preferredUsername, realm, requiresMfaChallenge });

    // ─── Step 8: Redirect ────────────────────────────────────────────────────
    // Auth cookies are set directly on the redirect response so the browser
    // receives them on the same hop that leaves /api/auth/callback.
    if (isPlatformLogin) {
      const target = new URL("/platform", publicBaseUrl);
      const response = NextResponse.redirect(target);
      setAuthCookies(response, sid, csrfToken, env);
      response.cookies.set("neon_realm", "platform", {
        httpOnly: true, secure: env !== "local", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS,
      });
      return response;
    }

    // Build the post-auth destination (entity/workbench selector)
    const selectUrl = new URL("/auth/select", publicBaseUrl);
    if (isSafeReturnUrl(returnUrl)) selectUrl.searchParams.set("returnUrl", returnUrl);
    if (filter) selectUrl.searchParams.set("filter", filter);

    // If MFA is required, go to challenge page first — passing selectUrl as returnUrl.
    // Do NOT rely on middleware to intercept /auth/select: that path is in the
    // public-routes exemption so the MFA gate never runs for it.
    if (requiresMfaChallenge) {
      const challengeUrl = new URL("/mfa/challenge", publicBaseUrl);
      challengeUrl.searchParams.set("returnUrl", selectUrl.pathname + selectUrl.search);

      const mfaResponse = NextResponse.redirect(challengeUrl);
      setAuthCookies(mfaResponse, sid, csrfToken, env);
      mfaResponse.cookies.delete("neon_realm");
      mfaResponse.cookies.set("neon_mfa_pending", "1", {
        httpOnly: false,
        secure: env !== "local",
        sameSite: "lax",
        path: "/",
        maxAge: MFA_PENDING_TTL_SECONDS,
      });
      return mfaResponse;
    }

    const response = NextResponse.redirect(selectUrl);
    setAuthCookies(response, sid, csrfToken, env);
    response.cookies.delete("neon_realm");
    return response;
  } catch (e: unknown) {
    console.error("[auth/callback] Error:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(
      new URL("/login?error=AUTH_CALLBACK_ERROR", publicBaseUrl),
    );
  }
}
