import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildFrontChannelLogoutUrl,
  revokeToken,
} from "@/lib/auth/keycloak";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { getSessionRedis } from "@/lib/auth/session-redis";
import {
  clearCsrfCookie,
  clearMfaPendingCookie,
  clearSessionCookie,
  getSessionId,
} from "@/lib/auth/session";
import {
  SESSION_NAMESPACES,
  legacySidRotationKey,
  sessKey,
  sidRotationKey,
  userSessionsKey,
} from "@/lib/auth/redis-keys";
import { resolvePublicBaseUrl } from "@/lib/auth/resolve-public-base-url";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";
import type { V4Session } from "@/lib/auth/types";

type RedisClient = Awaited<ReturnType<typeof getSessionRedis>>;

const STEP_UP_ACTION_CLASSES = [
  "iam_admin",
  "tenant_settings",
  "delegation_accept",
  "payment_release",
  "security_change",
] as const;

async function readSessionFollowingRotation(
  redis: RedisClient,
  namespace: string,
  sid: string,
): Promise<{ sid: string; session: V4Session } | null> {
  const raw = await redis.get(sessKey(namespace, sid));
  if (raw) return { sid, session: JSON.parse(raw) as V4Session };

  const rotatedSid =
    (await redis.get(sidRotationKey(namespace, sid)).catch(() => null)) ??
    (await redis.get(legacySidRotationKey(namespace, sid)).catch(() => null));
  if (!rotatedSid) return null;

  const rotatedRaw = await redis.get(sessKey(namespace, rotatedSid));
  if (!rotatedRaw) return null;

  return { sid: rotatedSid, session: JSON.parse(rotatedRaw) as V4Session };
}

async function setMembers(redis: RedisClient, key: string): Promise<string[]> {
  if (typeof redis.sMembers === "function") {
    return Array.from(await redis.sMembers(key));
  }
  if (typeof redis.smembers === "function") {
    return Array.from(await redis.smembers(key));
  }
  return [];
}

async function scanKeys(redis: RedisClient, pattern: string): Promise<string[]> {
  const keys: string[] = [];

  if (typeof redis.scanIterator === "function") {
    for await (const keyOrKeys of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      if (Array.isArray(keyOrKeys)) {
        keys.push(...keyOrKeys);
      } else {
        keys.push(String(keyOrKeys));
      }
    }
    return keys;
  }

  if (typeof redis.scan !== "function") return keys;

  let cursor: string | number = "0";
  do {
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 }) as
      | [string | number, string[]]
      | { cursor: string | number; keys: string[] };
    if (Array.isArray(result)) {
      cursor = result[0];
      keys.push(...result[1]);
    } else {
      cursor = result.cursor;
      keys.push(...result.keys);
    }
  } while (String(cursor) !== "0");

  return keys;
}

async function deleteKeys(redis: RedisClient, keys: string[]): Promise<void> {
  const unique = [...new Set(keys)].filter(Boolean);
  if (unique.length > 0) {
    await redis.del(unique);
  }
}

async function signalRuntimeLogout(session: V4Session, req: Request): Promise<void> {
  const headers = buildRuntimeHeaders(session);
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;

  await fetch(`${RUNTIME_API_URL}/api/session`, {
    method: "DELETE",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}

async function invalidateRuntimeCaches(redis: RedisClient, sub: string): Promise<void> {
  const sessionSetKey = `principal_sessions:${sub}`;
  const bootstrapSetKey = `bootstrap_keys:${sub}`;

  const sessionKeys = await setMembers(redis, sessionSetKey);
  if (sessionKeys.length > 0) {
    await deleteKeys(redis, [...sessionKeys, sessionSetKey]);
  } else {
    await deleteKeys(redis, await scanKeys(redis, `session:${sub}:*`));
    await redis.del(sessionSetKey).catch(() => {});
  }

  const bootstrapKeys = await setMembers(redis, bootstrapSetKey);
  if (bootstrapKeys.length > 0) {
    await deleteKeys(redis, [...bootstrapKeys, bootstrapSetKey]);
  } else {
    await deleteKeys(redis, await scanKeys(redis, `bootstrap:${sub}:*`));
    await redis.del(bootstrapSetKey).catch(() => {});
  }

  const elevationKeys = await scanKeys(redis, `mfa_elevation:${sub}:*`);
  if (elevationKeys.length > 0) {
    await deleteKeys(redis, elevationKeys);
  } else {
    await deleteKeys(
      redis,
      STEP_UP_ACTION_CLASSES.map((actionClass) => `mfa_elevation:${sub}:${actionClass}`),
    );
  }
}

async function revokeRefreshTokenForNamespace(
  baseUrl: string,
  namespace: string,
  refreshToken?: string,
): Promise<void> {
  if (!refreshToken) return;

  const { realm, clientId } = resolveRealmConfig(namespace === "platform");
  await revokeToken({
    baseUrl,
    realm,
    clientId,
    token: refreshToken,
    tokenTypeHint: "refresh_token",
  });
}

async function destroyAllBffSessions(
  redis: RedisClient,
  baseUrl: string,
  userId: string,
  currentNamespace: string,
  currentSid: string | null,
): Promise<void> {
  const namespaces = [...new Set([...SESSION_NAMESPACES, currentNamespace])];

  for (const namespace of namespaces) {
    const indexKey = userSessionsKey(namespace, userId);
    const sids = new Set(await setMembers(redis, indexKey));
    if (currentSid && namespace === currentNamespace) sids.add(currentSid);

    for (const sid of sids) {
      const raw = await redis.get(sessKey(namespace, sid)).catch(() => null);
      if (raw) {
        const session = JSON.parse(raw) as V4Session;
        await revokeRefreshTokenForNamespace(baseUrl, namespace, session.refreshToken);
      }
      await redis.del(sessKey(namespace, sid)).catch(() => {});
      await redis.del(sidRotationKey(namespace, sid)).catch(() => {});
      await redis.del(legacySidRotationKey(namespace, sid)).catch(() => {});
    }

    await redis.del(indexKey).catch(() => {});
  }
}

/**
 * POST /api/auth/logout
 *
 * Full logout cleanup:
 *   1. Signal runtime DELETE /api/session, best effort.
 *   2. Delete runtime session/bootstrap/MFA elevation Redis caches by KC sub.
 *   3. Revoke every tracked BFF refresh token and delete every tracked BFF SID.
 *   4. Clear browser session, CSRF, MFA-pending, and realm cookies.
 *   5. Return the Keycloak front-channel logout URL for SSO termination.
 */
export async function POST(req: Request) {
  const sid = await getSessionId();
  const baseUrl =
    process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
  const publicBaseUrl = resolvePublicBaseUrl(req);

  const cookieStore = await cookies();
  const isPlatformSession = cookieStore.get("neon_realm")?.value === "platform";
  const { realm, clientId, sessionNamespace } = resolveRealmConfig(isPlatformSession);

  let idToken: string | undefined;

  if (sid) {
    try {
      const redis = await getSessionRedis();
      const current = await readSessionFollowingRotation(redis, sessionNamespace, sid);

      if (current) {
        idToken = current.session.idToken;
        await signalRuntimeLogout(current.session, req);
        await invalidateRuntimeCaches(redis, current.session.userId);
        await destroyAllBffSessions(
          redis,
          baseUrl,
          current.session.userId,
          sessionNamespace,
          current.sid,
        );
      } else {
        await redis.del(sessKey(sessionNamespace, sid)).catch(() => {});
        await redis.del(sidRotationKey(sessionNamespace, sid)).catch(() => {});
        await redis.del(legacySidRotationKey(sessionNamespace, sid)).catch(() => {});
      }
    } catch {
      // Continue to cookie clearing and Keycloak front-channel logout. Redis
      // entries have absolute TTLs and will age out if the cache is unavailable.
    }
  }

  await clearSessionCookie();
  await clearCsrfCookie();
  await clearMfaPendingCookie();

  const logoutUrl = buildFrontChannelLogoutUrl({
    baseUrl,
    realm,
    clientId,
    idToken,
    postLogoutRedirectUri: `${publicBaseUrl}/login`,
  });

  const res = NextResponse.json({ ok: true, logoutUrl });
  res.cookies.delete("neon_sid");
  res.cookies.delete("__csrf");
  res.cookies.delete("neon_mfa_pending");
  res.cookies.delete("neon_realm");

  return res;
}
