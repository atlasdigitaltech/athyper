import "server-only";
import { cookies } from "next/headers";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { resolveSessionNamespace } from "@/lib/server/session-namespace";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { refreshTokens } from "@/lib/auth/keycloak";
import { sessKey } from "@/lib/auth/redis-keys";
import type { V4Session, OrgMembership } from "@/lib/auth/types";
export { parseOrgAlias } from "@/lib/auth/parse-org-alias";

// Seconds before expiry at which the server proactively refreshes the token.
// Wider than the client-side timer (90 s) to catch tabs that were backgrounded
// or closed before the timer fired.
const SERVER_REFRESH_BUFFER_SEC = 120;

/**
 * Read the full V4Session from Redis for use in Server Components.
 * Returns null if the session cookie is absent, the Redis key has expired,
 * or the access token is expired and cannot be silently refreshed.
 *
 * When the access token is within SERVER_REFRESH_BUFFER_SEC of expiry, a
 * server-side silent refresh is attempted inline:
 *   - Success → Redis updated in-place (same SID), fresh session returned.
 *   - KC hard failure → Redis key deleted, null returned → layout redirects to /login.
 *   - Transient KC failure → stale session returned so the client-side timer
 *     can retry without logging the user out.
 *
 * Note: server-side refresh updates the token payload in Redis without rotating
 * the session ID, because Next.js Server Components cannot write response cookies.
 * Full SID rotation still happens on every client-triggered POST /api/auth/refresh.
 */
export async function getServerSession(): Promise<V4Session | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get("neon_sid")?.value;
  if (!sid) return null;

  const ns = await resolveSessionNamespace();

  try {
    const redis = await getSessionRedis();
    const raw = await redis.get(sessKey(ns, sid));
    if (!raw) return null;

    const session = JSON.parse(raw) as V4Session;
    const now = Math.floor(Date.now() / 1000);

    if (session.accessExpiresAt > now + SERVER_REFRESH_BUFFER_SEC) {
      return session;
    }

    // Refresh token missing — session cannot be renewed
    if (!session.refreshToken) {
      await redis.del(sessKey(ns, sid));
      return null;
    }

    // Refresh token itself is expired
    if (session.refreshExpiresAt && session.refreshExpiresAt < now) {
      await redis.del(sessKey(ns, sid));
      return null;
    }

    return silentRefreshSession(session, ns, sid, redis);
  } catch {
    return null;
  }
}

type RedisClient = Awaited<ReturnType<typeof getSessionRedis>>;

async function silentRefreshSession(
  session: V4Session,
  ns: string,
  sid: string,
  redis: RedisClient,
): Promise<V4Session | null> {
  const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";
  const { realm, clientId } = resolveRealmConfig(session.realmKey === "platform");

  try {
    const tokens = await refreshTokens({
      baseUrl,
      realm,
      clientId,
      refreshToken: session.refreshToken!,
    });

    const now = Math.floor(Date.now() / 1000);
    const updated: V4Session = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: now + (tokens.expires_in ?? 3600),
      refreshExpiresAt: tokens.refresh_expires_in
        ? now + tokens.refresh_expires_in
        : session.refreshExpiresAt,
      idToken: tokens.id_token ?? session.idToken,
      lastSeenAt: now,
    };

    // Preserve the original session's absolute TTL — resetting to 8 h on every
    // server-side refresh would allow indefinite extension.
    const remainingTtl = await redis.ttl(sessKey(ns, sid));
    const sessionTtl = remainingTtl > 0 ? remainingTtl : 28800;

    await redis.set(sessKey(ns, sid), JSON.stringify(updated), { EX: sessionTtl });
    return updated;
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : "unknown";
    const isHardFailure =
      reason.includes("invalid_grant") ||
      reason.includes("Session not active") ||
      reason.includes("Token not found") ||
      reason.includes("client not found");

    if (isHardFailure) {
      // KC explicitly rejected the session — force re-login
      await redis.del(sessKey(ns, sid)).catch(() => {});
      return null;
    }

    // Transient KC failure (network, 5xx) — preserve the session so the user
    // is not unnecessarily logged out. The client-side refresh timer will retry.
    return session;
  }
}

/**
 * Serializable shape of the session passed from Server Component → Client Component.
 * Contains only the fields the shell needs; no tokens, no hashes.
 */
export interface ShellSessionProps {
  userId: string;
  displayName: string;
  email?: string;
  organizations: Record<string, OrgMembership>;
  activeOrg: string | null;
  activeWorkbench: string | null;
  /**
   * Unix timestamp (seconds) when the KC access token expires.
   * Forwarded to SessionProvider so it can schedule a proactive
   * POST /api/auth/refresh before the token expires.
   */
  accessExpiresAt: number;
}

/** Extract the shell-safe props from a full V4Session. */
export function toShellSessionProps(session: V4Session): ShellSessionProps {
  return {
    userId: session.userId,
    displayName: session.displayName,
    email: session.email,
    organizations: session.organizations,
    activeOrg: session.activeOrg,
    activeWorkbench: session.activeWorkbench,
    accessExpiresAt: session.accessExpiresAt,
  };
}
