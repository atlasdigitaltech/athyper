import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "redis";

import { computeSessionState, IDLE_TIMEOUT_SEC } from "@/lib/session-verdict";

// ─── Feature flag: expose full token payloads in debug ──────────
// Default: false — only show safe metadata (issuer, azp, exp, sub)
// Set AUTH_DEBUG_EXPOSE_TOKENS=true in .env.local to see full JWTs
const EXPOSE_TOKENS = process.env.AUTH_DEBUG_EXPOSE_TOKENS === "true";

/** Decode a JWT payload without verification (debug only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/** Decode the JWT header. */
function decodeJwtHeader(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = Buffer.from(parts[0], "base64url").toString("utf-8");
    return JSON.parse(header);
  } catch {
    return null;
  }
}

/** PII claim keys — always scrubbed, even when EXPOSE_TOKENS=true. */
const PII_CLAIMS = new Set([
  "email", "email_verified",
  "name", "given_name", "family_name",
  "preferred_username",
  "phone_number", "phone_number_verified",
  "address",
  "birthdate",
  "picture",
  "locale",
  // Custom org / OU / group claims that may leak internal structure
  "org", "organization", "ou", "department", "company",
  "groups", "group_membership",
]);

/** Extract only safe metadata fields from a JWT payload (full redaction). */
function redactJwtPayload(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  return {
    iss: payload.iss,
    aud: payload.aud,
    azp: payload.azp,
    sub: payload.sub,
    typ: payload.typ,
    exp: payload.exp,
    iat: payload.iat,
    scope: payload.scope,
    sid: payload.sid,
  };
}

/** Scrub PII from a full JWT payload (used when EXPOSE_TOKENS=true). */
function scrubPii(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PII_CLAIMS.has(key)) {
      scrubbed[key] = "[redacted]";
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}


/**
 * Resolve tenant ID from request context.
 * Returns the resolved ID and the source it was derived from.
 * Future: add header / cookie / host / path resolution.
 */
type TenantSource = "header" | "cookie" | "host" | "path" | "env" | "default";
function resolveTenantId(req: Request): { tenantId: string; tenantSource: TenantSource } {
  // Priority 1: X-Tenant-ID header (API gateway / reverse proxy)
  const headerTenant = req.headers.get("x-tenant-id");
  if (headerTenant) return { tenantId: headerTenant, tenantSource: "header" };

  // Priority 2: Host-based (subdomain extraction, e.g., acme.athyper.local)
  const host = req.headers.get("host") ?? "";
  const subdomain = host.split(".")[0];
  if (subdomain && subdomain !== "neon" && subdomain !== "localhost" && subdomain !== "127") {
    // Only activate when multi-tenant routing is wired up
    // return { tenantId: subdomain, tenantSource: "host" };
  }

  // Priority 3: Environment variable
  if (process.env.DEFAULT_TENANT_ID) {
    return { tenantId: process.env.DEFAULT_TENANT_ID, tenantSource: "env" };
  }

  // Fallback
  return { tenantId: "default", tenantSource: "default" };
}

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const sid = cookieStore.get("neon_sid")?.value;
  if (!sid) {
    return NextResponse.json({ authenticated: false, reason: "no neon_sid cookie" }, { status: 401 });
  }

  const { tenantId, tenantSource } = resolveTenantId(req);
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379/0";

  let redis;
  try {
    redis = createClient({ url: redisUrl });
    if (!redis.isOpen) await redis.connect();

    const raw = await redis.get(`sess:${tenantId}:${sid}`);
    if (!raw) {
      return NextResponse.json(
        { authenticated: false, reason: "session not found in Redis", sid: sid.slice(0, 8) + "..." },
        { status: 401 },
      );
    }

    const session = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);

    // ─── Session state computation ──────────────────────────────
    const {
      sessionState,
      tokenState,
      tokenRemaining,
      idleRemaining,
      refreshValid,
      verdict,
    } = computeSessionState(session, now);

    // ─── API boundary guard ─────────────────────────────────────
    // The shell layout redirects expired sessions at the page level (Option C),
    // but the API must also enforce this independently (defense-in-depth).
    // A direct API call bypasses the layout entirely.
    if (verdict === "reauth_required") {
      return NextResponse.json(
        { error: "SESSION_EXPIRED", authenticated: false, verdict, sessionState, tokenState },
        { status: 401 },
      );
    }

    // ─── Decode JWTs ────────────────────────────────────────────
    const rawAccessPayload = session.accessToken ? decodeJwtPayload(session.accessToken) : null;
    const rawAccessHeader = session.accessToken ? decodeJwtHeader(session.accessToken) : null;
    const rawRefreshPayload = session.refreshToken ? decodeJwtPayload(session.refreshToken) : null;

    // ─── Apply redaction unless feature flag is on ──────────────
    // Full redaction: only safe metadata. PII scrub: full payload minus PII claims.
    const accessPayload = EXPOSE_TOKENS ? scrubPii(rawAccessPayload) : redactJwtPayload(rawAccessPayload);
    const accessHeader = rawAccessHeader; // header is always safe (alg, kid, typ)

    // Refresh token: NEVER expose full payload, only safe metadata
    const refreshMeta = rawRefreshPayload
      ? {
          type: rawRefreshPayload.typ ?? "Refresh",
          expiresAt: typeof rawRefreshPayload.exp === "number"
            ? new Date(rawRefreshPayload.exp * 1000).toISOString()
            : null,
          isExpired: typeof rawRefreshPayload.exp === "number" ? now > rawRefreshPayload.exp : null,
          remainingSeconds: typeof rawRefreshPayload.exp === "number"
            ? Math.max(0, (rawRefreshPayload.exp as number) - now)
            : null,
          issuer: rawRefreshPayload.iss,
          keycloakSid: rawRefreshPayload.sid,
        }
      : null;

    // ─── Keycloak configuration ─────────────────────────────────
    const keycloak = {
      baseUrl: process.env.KEYCLOAK_BASE_URL ?? "(not set)",
      realm: process.env.KEYCLOAK_REALM ?? "(not set)",
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? "(not set)",
      issuerUrl: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`,
      tokenEndpoint: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
      userinfoEndpoint: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
    };

    // ─── Session info (all derived from Redis, not JWT) ─────────
    const accessExpiresAt = typeof session.accessExpiresAt === "number" ? session.accessExpiresAt : null;
    const createdAt = typeof session.createdAt === "number" ? session.createdAt : null;
    const expiresIn = accessExpiresAt ? Math.max(0, accessExpiresAt - now) : null;

    const lastSeenAt = typeof session.lastSeenAt === "number" ? session.lastSeenAt : null;

    const sessionInfo = {
      userId: session.userId,
      username: session.username,
      displayName: session.displayName,
      email: session.email,
      workbench: session.workbench,
      roles: session.roles,
      persona: session.persona,
      realmKey: session.realmKey,
      tenantId: session.tenantId,
      scope: session.scope ?? null,
      tokenType: session.tokenType ?? null,
      sessionState,
      tokenState,
      verdict,
      refreshValid,
      keycloakSessionId: session.keycloakSessionId ?? null,
      issuedAt: createdAt ? new Date(createdAt * 1000).toISOString() : null,
      expiresAt: accessExpiresAt ? new Date(accessExpiresAt * 1000).toISOString() : null,
      expiresIn: expiresIn != null ? `${expiresIn}s` : null,
      // Dual countdowns
      tokenRemaining,
      idleRemaining,
      idleTimeoutSec: IDLE_TIMEOUT_SEC,
      isExpired: accessExpiresAt ? now > accessExpiresAt : null,
      lastSeenAt: lastSeenAt ? new Date(lastSeenAt * 1000).toISOString() : null,
      lastSeenAgo: lastSeenAt ? now - lastSeenAt : null,
      sessionSource: "redis",
    };

    // ─── Audience & scope policy ─────────────────────────────────
    const aud = rawAccessPayload?.aud ?? null;
    const azp = rawAccessPayload?.azp ?? null;

    // Required scopes per workbench — extend as API scopes are added in Keycloak
    const WORKBENCH_SCOPES: Record<string, string[]> = {
      admin:   ["openid", "profile", "email"],
      user:    ["openid", "profile", "email"],
      partner: ["openid", "profile", "email"],
    };
    const workbench = typeof session.workbench === "string" ? session.workbench : "user";
    const requiredScopes = WORKBENCH_SCOPES[workbench] ?? WORKBENCH_SCOPES.user;
    const grantedScopes = typeof session.scope === "string"
      ? session.scope.split(" ").filter(Boolean)
      : [];
    const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));

    const audiencePolicy = {
      aud,
      azp,
      enforcement: "azp + scope",
      note: typeof aud === "string" && aud === "account"
        ? "UI token (aud=account is Keycloak default). API boundary enforces azp + scope, not aud."
        : "Custom audience configured.",
      grantedScopes,
      requiredScopes,
      missingScopes,
      scopeCheck: missingScopes.length === 0 ? "pass" : "fail",
    };

    // ─── Tenant isolation check ─────────────────────────────────
    const sessionTenantId = session.tenantId ?? null;
    const tenantCheck = {
      requestTenantId: tenantId,
      sessionTenantId,
      tenantSource,
      validated: sessionTenantId === tenantId,
      note: sessionTenantId === tenantId
        ? "Tenant isolation enforced — session tenant matches request context."
        : "MISMATCH — cross-tenant anomaly detected. Session would be rejected in production.",
    };

    // ─── Refresh strategy status ─────────────────────────────────
    const REFRESH_THRESHOLD_SEC = 120;
    const lastRefreshAt = typeof session.lastRefreshAt === "number" ? session.lastRefreshAt : null;
    const refreshAttempts = typeof session.refreshAttempts === "number" ? session.refreshAttempts : 0;
    const refreshLocked = session.refreshLocked === true;

    // Idle-expired blocks refresh (security: stolen sid cannot keep session alive)
    const idleExpired = sessionState === "idle_expired";

    // refreshAllowed: all preconditions for refresh to be permitted
    //   refreshValid     = hasRefreshToken && !refreshExpired
    //   !refreshLocked   = not locked from too many failures
    //   !idleExpired     = user must have been active within idle timeout
    const refreshAllowed = refreshValid && !refreshLocked && !idleExpired;

    // shouldRefreshNow = allowed AND (token expired OR within threshold)
    const shouldRefreshNow =
      refreshAllowed &&
      tokenRemaining !== null &&
      tokenRemaining <= REFRESH_THRESHOLD_SEC;

    // Blocked reason (null when refresh is allowed)
    const refreshBlockedReason: string | null =
      sessionState === "revoked" ? "session_revoked"
        : idleExpired ? "idle_expired"
          : !refreshValid ? "refresh_token_invalid"
            : refreshLocked ? "too_many_failures"
              : null;

    // Derive contextual note
    let refreshNote: string;
    if (idleExpired) {
      refreshNote = "Idle timeout reached. Refresh blocked — reauthentication required even though refresh token may still be valid.";
    } else if (refreshLocked) {
      refreshNote = "Refresh locked — too many failures. Manual re-login required.";
    } else if (!refreshValid) {
      refreshNote = "Refresh token expired or missing — session cannot be recovered. Re-login required.";
    } else if (tokenRemaining !== null && tokenRemaining <= 0) {
      refreshNote = "Access token expired — proactive refresh should fire immediately.";
    } else if (shouldRefreshNow) {
      refreshNote = `Token expires in ${tokenRemaining}s — proactive refresh should fire.`;
    } else {
      refreshNote = "Normal — refresh scheduled before token expiry.";
    }

    // Refresh trigger: how refresh will fire
    //   auto       — proactive timer scheduled, not yet needed
    //   immediate  — shouldRefreshNow=YES, client must fire now
    //   blocked    — idle_expired or revoked (security hard stop)
    //   disabled   — locked or no valid refresh token
    const refreshTrigger: "auto" | "immediate" | "blocked" | "disabled" =
      idleExpired || sessionState === "revoked" ? "blocked"
        : !refreshValid ? "disabled"
          : refreshLocked ? "disabled"
            : shouldRefreshNow ? "immediate"
              : "auto";

    // Execution status: what's happening right now
    //   scheduled        — normal, timer will fire before token expiry
    //   awaiting_client  — shouldRefreshNow=YES, waiting for client to act
    //   blocked          — security policy prevents refresh (idle/revoked)
    //   locked           — refresh locked due to repeated failures
    //   unavailable      — no valid refresh token
    const refreshExecutionStatus: "scheduled" | "awaiting_client" | "blocked" | "locked" | "unavailable" =
      idleExpired || sessionState === "revoked" ? "blocked"
        : !refreshValid ? "unavailable"
          : refreshLocked ? "locked"
            : shouldRefreshNow ? "awaiting_client"
              : "scheduled";

    const refreshStrategy = {
      refreshTrigger,
      refreshExecutionStatus,
      refreshBlockedReason,
      refreshMode: "proactive" as const,
      refreshThresholdSec: REFRESH_THRESHOLD_SEC,
      shouldRefreshNow,
      lastRefreshAt: lastRefreshAt ? new Date(lastRefreshAt * 1000).toISOString() : null,
      refreshAttempts,
      refreshLocked,
      refreshValid,
      refreshTokenPresent: !!session.refreshToken,
      refreshTokenExpired: refreshMeta?.isExpired ?? null,
      refreshTokenRemaining: refreshMeta?.remainingSeconds ?? null,
      note: refreshNote,
    };

    // ─── JWKS status (best-effort from env + well-known) ──────
    const jwksUri = `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`;
    let jwksStatus: Record<string, unknown>;
    try {
      const jwksFetchStart = Date.now();
      const jwksRes = await fetch(jwksUri, { signal: AbortSignal.timeout(3000) });
      const jwksFetchMs = Date.now() - jwksFetchStart;
      if (jwksRes.ok) {
        const jwksData = (await jwksRes.json()) as { keys?: unknown[] };
        jwksStatus = {
          reachable: true,
          uri: jwksUri,
          keyCount: Array.isArray(jwksData.keys) ? jwksData.keys.length : 0,
          fetchLatencyMs: jwksFetchMs,
          lastError: null,
        };
      } else {
        jwksStatus = {
          reachable: false,
          uri: jwksUri,
          keyCount: 0,
          fetchLatencyMs: jwksFetchMs,
          lastError: `HTTP ${jwksRes.status} ${jwksRes.statusText}`,
        };
      }
    } catch (jwksErr) {
      jwksStatus = {
        reachable: false,
        uri: jwksUri,
        keyCount: 0,
        fetchLatencyMs: null,
        lastError: String(jwksErr),
      };
    }

    // ─── Redis connectivity info ────────────────────────────────
    const redisInfo = {
      status: "connected",
      url: redisUrl.replace(/\/\/.*:.*@/, "//***:***@"),
      sessionKey: `sess:${tenantId}:${sid.slice(0, 8)}...`,
    };

    return NextResponse.json({
      session: sessionInfo,
      keycloak,
      audiencePolicy,
      tenantCheck,
      jwt: {
        header: accessHeader,
        payload: accessPayload,
        signaturePresent: session.accessToken
          ? session.accessToken.split(".").length === 3
          : false,
        redacted: !EXPOSE_TOKENS,
      },
      refreshToken: refreshMeta,
      refreshStrategy,
      jwksStatus,
      redis: redisInfo,
      canRevealTokens: EXPOSE_TOKENS,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "debug route failed", message: String(err) },
      { status: 500 },
    );
  } finally {
    await redis?.quit();
  }
}
