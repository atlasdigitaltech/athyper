import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { decodeJwtPayload, refreshTokens } from "@/lib/auth/keycloak";
import { normalizeOrganizationClaim } from "@/lib/auth/org-normalize";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { getSessionRedis } from "@/lib/auth/session-redis";
import {
  generateSid,
  getSessionId,
  setCsrfCookie,
  setSessionCookie,
} from "@/lib/auth/session";
import { refreshLockKey, sessKey, userSessionsKey } from "@/lib/auth/redis-keys";
import { randomUUID } from "node:crypto";
import type { V4Session } from "@/lib/auth/types";

/**
 * POST /api/auth/refresh
 *
 * Proactively refreshes the access token before it expires and rotates
 * the session ID to prevent session fixation.
 *
 * Note: /api/auth/* routes are in the middleware public-bypass list and
 * therefore bypass CSRF enforcement. This route relies on the httpOnly
 * neon_sid cookie (not readable by JS) as the sole auth check.
 *
 * Security controls:
 *   1. Idle timeout (15 min) — refuses to refresh an idle session even if the
 *      refresh token is still valid. A stolen sid cannot silently keep sessions
 *      alive by calling refresh.
 *   2. Early-exit if token still has >120s — prevents multiple tabs racing.
 *   3. Session ID rotation — new sid + new CSRF token on every successful refresh.
 *
 * Response (success): { ok: true, accessExpiresAt, csrfToken }
 * Response (requires re-auth): { redirect: "/api/auth/login", reason? }
 */
export async function POST() {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ redirect: "/api/auth/login" }, { status: 401 });
  }

  const baseUrl =
    process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
  const env = process.env.ENVIRONMENT ?? "local";

  const cookieStore = await cookies();
  const isPlatformSession = cookieStore.get("neon_realm")?.value === "platform";
  const { realm, clientId, sessionNamespace } = resolveRealmConfig(isPlatformSession);

  const redis = await getSessionRedis();
  const lockKey = refreshLockKey(sessionNamespace, sid);

  try {
    const raw = await redis.get(sessKey(sessionNamespace, sid));
    if (!raw) {
      return NextResponse.json(
        { redirect: "/api/auth/login" },
        { status: 401 },
      );
    }

    const session = JSON.parse(raw) as V4Session;
    const now = Math.floor(Date.now() / 1000);

    // ─── Idle timeout check ──────────────────────────────────────────────────
    const IDLE_TIMEOUT_SEC = 900; // 15 min
    const lastSeenAt =
      typeof session.lastSeenAt === "number" ? session.lastSeenAt : 0;
    if (lastSeenAt > 0 && now - lastSeenAt >= IDLE_TIMEOUT_SEC) {
      await redis.del(sessKey(sessionNamespace, sid));
      if (session.userId) {
        await redis.sRem(userSessionsKey(sessionNamespace, session.userId), sid);
      }
      return NextResponse.json(
        { redirect: "/api/auth/login", reason: "idle_expired" },
        { status: 401 },
      );
    }

    // ─── Skip if access token still has plenty of time ───────────────────────
    const remaining = (session.accessExpiresAt ?? 0) - now;
    if (remaining > 120) {
      return NextResponse.json({
        ok: true,
        message: "Token still valid",
        accessExpiresAt: session.accessExpiresAt,
      });
    }

    if (!session.refreshToken) {
      await redis.del(sessKey(sessionNamespace, sid));
      return NextResponse.json({ redirect: "/api/auth/login" }, { status: 401 });
    }

    // ─── Distributed lock — prevent concurrent refresh races ─────────────────
    // Multiple browser tabs can call /api/auth/refresh simultaneously when the
    // token is close to expiry. KC refresh tokens are single-use; the second
    // concurrent call would receive "Maximum allowed refresh token reuse exceeded."
    // Acquire a short-lived lock on this sid. The losing tab waits briefly and
    // returns 200 — the winning tab's Set-Cookie has already updated neon_sid in
    // the browser (shared across all tabs for the same origin), so the losing
    // tab's next real request will carry the new sid.
    const acquired = await redis.set(lockKey, "1", { NX: true, EX: 10 });
    if (!acquired) {
      await new Promise<void>((r) => setTimeout(r, 300));
      // Return the current (pre-rotation) accessExpiresAt so the losing tab
      // reschedules its timer. The new neon_sid cookie set by the winning tab
      // is already in the browser; when this timer fires (~30s later) the
      // remaining > 120 early-exit will return the correct new expiry.
      return NextResponse.json({ ok: true, message: "Refresh in progress", accessExpiresAt: session.accessExpiresAt });
    }

    // ─── Refresh tokens at Keycloak ──────────────────────────────────────────
    const tokens = await refreshTokens({
      baseUrl,
      realm,
      clientId,
      refreshToken: session.refreshToken,
    });

    // ─── Rotate session ID ───────────────────────────────────────────────────
    const newSid = generateSid();
    const newCsrfToken = randomUUID();

    // Re-decode claims — roles may have changed (e.g. org membership updated)
    const claims = decodeJwtPayload(tokens.access_token);

    const updatedSession: V4Session = {
      ...session,
      sid: newSid,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: now + (tokens.expires_in ?? 3600),
      refreshExpiresAt: tokens.refresh_expires_in
        ? now + tokens.refresh_expires_in
        : session.refreshExpiresAt,
      idToken: tokens.id_token ?? session.idToken,
      csrfToken: newCsrfToken,
      lastSeenAt: now,
    };

    // Re-normalize organizations from refreshed token if claim is present.
    // NOTE: This only re-reads the JWT organization claim — it does NOT re-run
    // the 3-pass KC admin API enrichment from the callback (workbenches, names).
    // Org claim changes (added/removed memberships) are picked up here;
    // workbench role changes require a full re-login to take effect.
    if (claims.organization) {
      const refreshedOrgs = normalizeOrganizationClaim(claims.organization);
      if (Object.keys(refreshedOrgs).length > 0) {
        // Preserve enriched roles/names from the existing session for orgs still present.
        // Only add/remove orgs; don't overwrite roles that came from the admin API.
        for (const [alias, membership] of Object.entries(refreshedOrgs)) {
          if (!updatedSession.organizations[alias]) {
            // New org — add with base data (no enriched roles yet)
            updatedSession.organizations[alias] = membership;
          }
        }
        // Remove orgs the user is no longer a member of
        for (const alias of Object.keys(updatedSession.organizations)) {
          if (!refreshedOrgs[alias]) {
            delete updatedSession.organizations[alias];
          }
        }
      }
    }

    // Preserve the remaining absolute TTL from the original session.
    // Resetting to 28800 on every refresh would allow indefinite session
    // extension — the 8h window must be anchored to the original login time.
    const remainingTtl = await redis.ttl(sessKey(sessionNamespace, sid));
    const sessionTtl = remainingTtl > 0 ? remainingTtl : 28800;

    // Write new key, delete old (atomic rotation)
    await redis.set(
      sessKey(sessionNamespace, newSid),
      JSON.stringify(updatedSession),
      { EX: sessionTtl },
    );
    await redis.del(sessKey(sessionNamespace, sid));

    // Update user session index
    if (session.userId) {
      await redis.sRem(userSessionsKey(sessionNamespace, session.userId), sid);
      await redis.sAdd(userSessionsKey(sessionNamespace, session.userId), newSid);
    }

    await setSessionCookie(newSid, env);
    await setCsrfCookie(newCsrfToken, env);

    await redis.del(lockKey).catch(() => { /* best effort */ });
    return NextResponse.json({
      ok: true,
      accessExpiresAt: updatedSession.accessExpiresAt,
      csrfToken: newCsrfToken,
    });
  } catch (e: unknown) {
    await redis.del(lockKey).catch(() => { /* best effort */ });
    const reason = e instanceof Error ? e.message : "Refresh failed";

    // Hard failure: Keycloak explicitly rejected this session.
    // Covers: invalid_grant (RT expired/revoked/reused), Session not active,
    // Token not found, user/client disabled.
    // ONLY in these cases do we destroy the Redis session and force re-login.
    const isHardFailure =
      reason.includes("invalid_grant") ||
      reason.includes("Session not active") ||
      reason.includes("Token not found") ||
      reason.includes("client not found");

    if (isHardFailure) {
      try { await redis.del(sessKey(sessionNamespace, sid)); } catch { /* best effort */ }
      console.error("[auth/refresh] KC session invalidated — re-login required:", reason);
      return NextResponse.json({ redirect: "/api/auth/login", reason }, { status: 401 });
    }

    // Transient failure: KC unavailable, network timeout, 5xx, DNS, etc.
    // Keep the Redis session alive so the user is not force-logged out.
    // Return a retryable 503 so the client reschedules the refresh timer.
    console.warn("[auth/refresh] Transient KC failure — session preserved, will retry:", reason);
    return NextResponse.json({ ok: false, retryAfter: 30, reason }, { status: 503 });
  }
}
