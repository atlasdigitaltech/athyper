import { createHash, randomUUID } from "node:crypto";

import {
  AuthAuditEvent,
  emitBffAudit,
  hashSidForAudit,
} from "@neon/auth/audit";
import { decodeJwtPayload, refreshTokens } from "@neon/auth/keycloak";
import {
  getSessionId,
  setCsrfCookie,
  setSessionCookie,
} from "@neon/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function getRedisClient() {
  const { createClient } = await import("redis");
  const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
  const client = createClient({ url });
  if (!client.isOpen) await client.connect();
  return client;
}

/**
 * POST /api/auth/refresh (CSRF-protected via middleware)
 *
 * Proactively refreshes the access token before it expires.
 *
 * Called by the client-side useSessionRefresh hook, which schedules
 * this call at accessExpiresAt - 90s. Can also be triggered manually
 * from the admin debug console.
 *
 * Flow:
 *   1. Load Redis session by `neon_sid` cookie
 *   2. SECURITY: Check idle timeout — if idle_expired, destroy session and reject.
 *      This is a hard security control: even if the refresh token is still valid,
 *      we refuse to extend an idle session. A stolen sid cannot silently keep
 *      sessions alive by calling refresh.
 *   3. If access token still has > 120s remaining, return no-op (avoids unnecessary
 *      Keycloak calls when multiple tabs race to refresh)
 *   4. Call Keycloak grant_type=refresh_token to get new tokens
 *   5. Rotate session ID — generate new sid, new CSRF token, new Redis key.
 *      The old sid/key is deleted. This prevents session fixation after refresh.
 *   6. Update user_sessions index (old sid out, new sid in)
 *   7. Set new neon_sid + __csrf cookies with the rotated values
 *   8. Return { ok, accessExpiresAt, csrfToken } so the client can update
 *      its in-memory bootstrap and schedule the next refresh
 *
 * Failure handling:
 *   - If Keycloak rejects the refresh token (expired, revoked, rotated by
 *     another instance), the session is destroyed and the client receives
 *     { redirect: "/api/auth/login" } — triggering a full re-authentication.
 *
 * Audit:
 *   - auth.refresh_success — on successful token refresh
 *   - auth.refresh_failed — on Keycloak rejection or error
 *   - auth.refresh_idle_blocked — when idle timeout prevents refresh
 */
export async function POST() {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ redirect: "/api/auth/login" }, { status: 401 });
  }

  const baseUrl =
    process.env.KEYCLOAK_BASE_URL ?? "https://iam.mesh.athyper.local";
  const env = process.env.ENVIRONMENT ?? "local";

  // Determine session namespace from neon_realm cookie
  const cookieStore = await cookies();
  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");

  const redis = await getRedisClient();

  try {
    const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) {
      return NextResponse.json(
        { redirect: "/api/auth/login" },
        { status: 401 },
      );
    }

    const session = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);

    // Derive realm and clientId from the session's realmKey
    // Platform admin sessions use the platform-control realm; tenant sessions use the default realm
    const isPlatformSession = session.isPlatformAdmin === true;
    const realm = isPlatformSession
      ? (process.env.PLATFORM_KEYCLOAK_REALM ?? "platform-control")
      : (process.env.KEYCLOAK_REALM ?? "athyper");
    const clientId = isPlatformSession
      ? (process.env.PLATFORM_KEYCLOAK_CLIENT_ID ?? "athyper-admin")
      : (process.env.KEYCLOAK_CLIENT_ID ?? "neon-web");

    // ─── Idle timeout enforcement (hard security control) ───────
    // If the user has been inactive for >= IDLE_TIMEOUT_SEC, we refuse
    // to refresh even though the refresh token may be valid. This prevents
    // stolen session cookies from being used to silently extend sessions.
    const IDLE_TIMEOUT_SEC = 900;
    const lastSeenAt =
      typeof session.lastSeenAt === "number" ? session.lastSeenAt : 0;
    if (lastSeenAt > 0 && now - lastSeenAt >= IDLE_TIMEOUT_SEC) {
      // Destroy the session — it's idle-expired and unrecoverable
      await redis.del(`sess:${sessionNamespace}:${sid}`);

      // Audit — refresh blocked by idle timeout
      await emitBffAudit(redis, AuthAuditEvent.REFRESH_IDLE_BLOCKED, {
        tenantId: sessionNamespace,
        userId: session.userId,
        sidHash: hashSidForAudit(sid),
        realm,
        reason: "idle_expired",
        meta: { lastSeenAt, idleSeconds: now - lastSeenAt },
      });

      return NextResponse.json(
        { redirect: "/api/auth/login", reason: "idle_expired" },
        { status: 401 },
      );
    }

    // ─── Skip if token still has plenty of time ─────────────────
    // Prevents unnecessary Keycloak calls when multiple browser tabs
    // race to refresh, or when the client timer fires early.
    const remaining = (session.accessExpiresAt ?? 0) - now;
    if (remaining > 120) {
      return NextResponse.json({
        ok: true,
        message: "Token still valid",
        accessExpiresAt: session.accessExpiresAt,
      });
    }

    // ─── Check refresh token availability ───────────────────────
    if (!session.refreshToken) {
      // No refresh token — Keycloak client config may not issue them,
      // or this is a degraded session. Force re-authentication.
      await redis.del(`sess:${sessionNamespace}:${sid}`);
      return NextResponse.json(
        { redirect: "/api/auth/login" },
        { status: 401 },
      );
    }

    // ─── Call Keycloak token refresh ────────────────────────────
    const tokens = await refreshTokens({
      baseUrl,
      realm,
      clientId,
      refreshToken: session.refreshToken,
    });

    // ─── Rotate session ID ──────────────────────────────────────
    // Generate new sid + CSRF token. This prevents session fixation:
    // if the old sid was observed, it's now invalid.
    const newSid = createHash("sha256")
      .update(randomUUID() + Date.now().toString())
      .digest("hex");
    const newCsrfToken = randomUUID();

    // Decode refreshed claims (roles may have changed since last token)
    const claims = decodeJwtPayload(tokens.access_token);
    const roles: string[] = [];
    const realmAccess = claims.realm_access as { roles?: string[] } | undefined;
    if (Array.isArray(realmAccess?.roles)) {
      roles.push(
        ...realmAccess.roles.filter((r): r is string => typeof r === "string"),
      );
    }

    // Build updated session with new tokens, new sid, refreshed roles
    const updatedSession = {
      ...session,
      sid: newSid,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: now + tokens.expires_in,
      refreshExpiresAt: tokens.refresh_expires_in
        ? now + tokens.refresh_expires_in
        : session.refreshExpiresAt,
      idToken: tokens.id_token ?? session.idToken,
      roles,
      csrfToken: newCsrfToken,
      lastSeenAt: now,
    };

    // Write new session key, delete old (atomic rotation)
    await redis.set(
      `sess:${sessionNamespace}:${newSid}`,
      JSON.stringify(updatedSession),
      { EX: 28800 },
    );
    await redis.del(`sess:${sessionNamespace}:${sid}`);

    // Update user session index (swap old sid for new)
    if (session.userId) {
      await redis.sRem(
        `user_sessions:${sessionNamespace}:${session.userId}`,
        sid,
      );
      await redis.sAdd(
        `user_sessions:${sessionNamespace}:${session.userId}`,
        newSid,
      );
    }

    // Set rotated cookies
    await setSessionCookie(newSid, env);
    await setCsrfCookie(newCsrfToken, env);

    // Audit — refresh success
    await emitBffAudit(redis, AuthAuditEvent.REFRESH_SUCCESS, {
      tenantId: sessionNamespace,
      userId: session.userId,
      sidHash: hashSidForAudit(newSid),
      realm,
      meta: {
        previousSidHash: hashSidForAudit(sid),
        tokenExpiresIn: tokens.expires_in,
        rolesChanged: JSON.stringify(session.roles) !== JSON.stringify(roles),
      },
    });

    return NextResponse.json({
      ok: true,
      accessExpiresAt: updatedSession.accessExpiresAt,
      csrfToken: newCsrfToken,
    });
  } catch (e: unknown) {
    // Refresh failed — destroy session and force re-auth
    try {
      await redis.del(`sess:${sessionNamespace}:${sid}`);
    } catch {
      /* best effort */
    }

    const reason = e instanceof Error ? e.message : "Refresh failed";

    // Audit — refresh failed
    await emitBffAudit(redis, AuthAuditEvent.REFRESH_FAILED, {
      tenantId: sessionNamespace,
      sidHash: hashSidForAudit(sid),
      realm: "unknown",
      reason,
    });

    return NextResponse.json(
      { redirect: "/api/auth/login", reason },
      { status: 401 },
    );
  } finally {
    await redis.quit();
  }
}
