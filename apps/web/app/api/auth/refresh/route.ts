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
import {
  refreshLockKey,
  sessKey,
  sidRotationKey,
  userSessionsKey,
} from "@/lib/auth/redis-keys";
import { resolveSessionPolicy } from "@/lib/auth/session-policy-resolver";
import { randomUUID } from "node:crypto";
import type { V4Session } from "@/lib/auth/types";

type RedisClient = Awaited<ReturnType<typeof getSessionRedis>>;

async function readRotatedSession(
  redis: RedisClient,
  namespace: string,
  sid: string,
): Promise<{ sid: string; session: V4Session } | null> {
  const rotatedSid = await redis.get(sidRotationKey(namespace, sid)).catch(() => null);
  if (!rotatedSid) return null;

  const raw = await redis.get(sessKey(namespace, rotatedSid));
  if (!raw) return null;

  return { sid: rotatedSid, session: JSON.parse(raw) as V4Session };
}

async function destroySession(
  redis: RedisClient,
  namespace: string,
  sid: string,
  session?: V4Session,
): Promise<void> {
  await redis.del(sessKey(namespace, sid));
  if (session?.userId) {
    await redis.sRem(userSessionsKey(namespace, session.userId), sid).catch(() => {});
  }
}

async function respondWithRotatedSession(
  rotated: { sid: string; session: V4Session },
  env: string,
): Promise<NextResponse> {
  await setSessionCookie(rotated.sid, env);
  await setCsrfCookie(rotated.session.csrfToken, env);

  return NextResponse.json({
    ok: true,
    message: "Session already rotated",
    accessExpiresAt: rotated.session.accessExpiresAt,
    csrfToken: rotated.session.csrfToken,
  });
}

/**
 * POST /api/auth/refresh
 *
 * Proactively refreshes the access token before it expires and rotates the BFF
 * session ID. Keycloak refresh tokens are single-use, so this route serializes
 * concurrent refresh attempts with a short Redis lock and leaves a 30-second
 * pointer from the old SID to the new SID for in-flight requests.
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
  let lockAcquired = false;
  let sessionForCleanup: V4Session | undefined;

  try {
    const raw = await redis.get(sessKey(sessionNamespace, sid));
    if (!raw) {
      const rotated = await readRotatedSession(redis, sessionNamespace, sid);
      if (rotated) return respondWithRotatedSession(rotated, env);

      return NextResponse.json(
        { redirect: "/api/auth/login" },
        { status: 401 },
      );
    }

    const session = JSON.parse(raw) as V4Session;
    sessionForCleanup = session;
    const now = Math.floor(Date.now() / 1000);
    const policy = await resolveSessionPolicy(session);

    const lastSeenAt =
      typeof session.lastSeenAt === "number" ? session.lastSeenAt : 0;
    if (lastSeenAt > 0 && now - lastSeenAt >= policy.idleTimeoutSeconds) {
      await destroySession(redis, sessionNamespace, sid, session);
      return NextResponse.json(
        { redirect: "/api/auth/login", reason: "idle_expired" },
        { status: 401 },
      );
    }

    const remaining = (session.accessExpiresAt ?? 0) - now;
    if (remaining > policy.serverRefreshBufferSeconds) {
      return NextResponse.json({
        ok: true,
        message: "Token still valid",
        accessExpiresAt: session.accessExpiresAt,
      });
    }

    if (!session.refreshToken) {
      await destroySession(redis, sessionNamespace, sid, session);
      return NextResponse.json({ redirect: "/api/auth/login" }, { status: 401 });
    }

    if (session.refreshExpiresAt && session.refreshExpiresAt < now) {
      await destroySession(redis, sessionNamespace, sid, session);
      return NextResponse.json(
        { redirect: "/api/auth/login", reason: "refresh_expired" },
        { status: 401 },
      );
    }

    const acquired = await redis.set(lockKey, "1", {
      NX: true,
      EX: policy.refreshLockTtlSeconds,
    });
    lockAcquired = Boolean(acquired);

    if (!lockAcquired) {
      await new Promise<void>((resolve) => setTimeout(resolve, policy.refreshLockWaitMs));

      const rotated = await readRotatedSession(redis, sessionNamespace, sid);
      if (rotated) return respondWithRotatedSession(rotated, env);

      const latestRaw = await redis.get(sessKey(sessionNamespace, sid)).catch(() => null);
      const latest = latestRaw ? (JSON.parse(latestRaw) as V4Session) : session;
      return NextResponse.json({
        ok: true,
        message: "Refresh in progress",
        accessExpiresAt: latest.accessExpiresAt,
        csrfToken: latest.csrfToken,
      });
    }

    const tokens = await refreshTokens({
      baseUrl,
      realm,
      clientId,
      refreshToken: session.refreshToken,
    });

    const newSid = generateSid();
    const newCsrfToken = randomUUID();
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

    if (claims.organization) {
      const refreshedOrgs = normalizeOrganizationClaim(claims.organization);
      if (Object.keys(refreshedOrgs).length > 0) {
        for (const [alias, membership] of Object.entries(refreshedOrgs)) {
          if (!updatedSession.organizations[alias]) {
            updatedSession.organizations[alias] = membership;
          }
        }
        for (const alias of Object.keys(updatedSession.organizations)) {
          if (!refreshedOrgs[alias]) {
            delete updatedSession.organizations[alias];
          }
        }
      }
    }

    const remainingTtl = await redis.ttl(sessKey(sessionNamespace, sid));
    const sessionTtl = remainingTtl > 0 ? remainingTtl : policy.sessionTtlSeconds;

    await redis.set(
      sessKey(sessionNamespace, newSid),
      JSON.stringify(updatedSession),
      { EX: sessionTtl },
    );
    await redis.set(
      sidRotationKey(sessionNamespace, sid),
      newSid,
      { EX: policy.refreshRotationGraceSeconds },
    );
    await redis.del(sessKey(sessionNamespace, sid));

    if (session.userId) {
      const sessionIndexKey = userSessionsKey(sessionNamespace, session.userId);
      await redis.sRem(sessionIndexKey, sid);
      await redis.sAdd(sessionIndexKey, newSid);
      await redis.expire(sessionIndexKey, sessionTtl);
    }

    await setSessionCookie(newSid, env, sessionTtl);
    await setCsrfCookie(newCsrfToken, env, sessionTtl);

    return NextResponse.json({
      ok: true,
      accessExpiresAt: updatedSession.accessExpiresAt,
      csrfToken: newCsrfToken,
    });
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : "Refresh failed";
    const isHardFailure =
      reason.includes("invalid_grant") ||
      reason.includes("Session not active") ||
      reason.includes("Token not found") ||
      reason.includes("client not found");

    if (isHardFailure) {
      await destroySession(redis, sessionNamespace, sid, sessionForCleanup).catch(() => {});
      console.error("[auth/refresh] KC session invalidated; re-login required:", reason);
      return NextResponse.json({ redirect: "/api/auth/login", reason }, { status: 401 });
    }

    console.warn("[auth/refresh] Transient KC failure; session preserved, will retry:", reason);
    return NextResponse.json({ ok: false, retryAfter: 30, reason }, { status: 503 });
  } finally {
    if (lockAcquired) {
      await redis.del(lockKey).catch(() => {});
    }
  }
}
