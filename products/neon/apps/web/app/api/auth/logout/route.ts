import {
  AuthAuditEvent,
  emitBffAudit,
  hashSidForAudit,
} from "@neon/auth/audit";
import {
  buildFrontChannelLogoutUrl,
  keycloakLogout,
} from "@neon/auth/keycloak";
import {
  clearCsrfCookie,
  clearSessionCookie,
  getSessionId,
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
 * POST /api/auth/logout (CSRF-protected via middleware)
 *
 * Performs a complete multi-layer logout:
 *
 *   Layer 1 — Keycloak backchannel: Revokes the refresh token at Keycloak's
 *             token revocation endpoint. This prevents the token from being
 *             used even if leaked. Best-effort (Keycloak may be down).
 *
 *   Layer 2 — Redis session: Deletes the session key and removes the sid
 *             from the user_sessions index. Immediate effect.
 *
 *   Layer 3 — Browser cookies: Clears `neon_sid` and `__csrf` cookies.
 *
 *   Layer 4 — Front-channel: Returns a Keycloak front-channel logout URL.
 *             The client must navigate to this URL to end the Keycloak SSO
 *             session (shared across all apps in the realm). Without this,
 *             the user would be silently re-authenticated on next login
 *             (SSO cookie still valid).
 *
 * The response includes `{ ok: true, logoutUrl: "..." }`. The client should
 * navigate to `logoutUrl` to complete the SSO logout. Keycloak then redirects
 * back to the post-logout URI (typically `/login`).
 *
 * Audit: Emits `auth.logout` with userId, tenantId, and session hash.
 *
 * Callers:
 *   - useIdleTracker hook (auto-logout on idle timeout)
 *   - Admin console logout button
 *   - Any explicit logout action
 */
export async function POST() {
  const sid = await getSessionId();
  const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
  const baseUrl =
    process.env.KEYCLOAK_BASE_URL ?? "https://iam.mesh.athyper.local";
  const publicBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.PUBLIC_BASE_URL ??
    "http://localhost:3000";

  // Detect platform admin session via cookie
  const cookieStore = await cookies();
  const realmCookie = cookieStore.get("neon_realm")?.value;
  const isPlatformSession = realmCookie === "platform";
  const sessionNamespace = isPlatformSession ? "platform" : tenantId;

  // Use correct realm/clientId for Keycloak logout
  const realm = isPlatformSession
    ? (process.env.PLATFORM_KEYCLOAK_REALM ?? "platform-control")
    : (process.env.KEYCLOAK_REALM ?? "athyper");
  const clientId = isPlatformSession
    ? (process.env.PLATFORM_KEYCLOAK_CLIENT_ID ?? "athyper-admin")
    : (process.env.KEYCLOAK_CLIENT_ID ?? "neon-web");

  let idToken: string | undefined;
  let userId: string | undefined;

  if (sid) {
    const redis = await getRedisClient();
    try {
      const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
      if (raw) {
        const session = JSON.parse(raw);
        idToken = session.idToken;
        userId = session.userId;

        // Layer 1: Keycloak backchannel logout (revoke refresh token)
        await keycloakLogout({
          baseUrl,
          realm,
          clientId,
          idToken: session.idToken,
          refreshToken: session.refreshToken,
        });

        // Layer 2a: Remove from user session index
        if (session.userId) {
          await redis.sRem(
            `user_sessions:${sessionNamespace}:${session.userId}`,
            sid,
          );
        }
      }

      // Layer 2b: Destroy the session key
      await redis.del(`sess:${sessionNamespace}:${sid}`);

      // Audit — logout
      await emitBffAudit(redis, AuthAuditEvent.LOGOUT, {
        tenantId,
        userId,
        sidHash: hashSidForAudit(sid),
        realm,
        meta: { source: "explicit" },
      });
    } finally {
      await redis.quit();
    }
  }

  // Layer 3: Clear browser cookies
  await clearSessionCookie();
  await clearCsrfCookie();

  // Layer 4: Build front-channel logout URL for the browser to visit
  // This ends the Keycloak SSO session, preventing silent re-authentication.
  const logoutUrl = buildFrontChannelLogoutUrl({
    baseUrl,
    realm,
    idToken,
    postLogoutRedirectUri: `${publicBaseUrl}/login`,
  });

  const res = NextResponse.json({ ok: true, logoutUrl });

  // Clear the neon_realm cookie so subsequent logins use the correct namespace.
  // Without this, a platform admin logout followed by a tenant login would still
  // have neon_realm=platform, causing session namespace mismatch.
  if (isPlatformSession) {
    res.cookies.delete("neon_realm");
  }

  return res;
}
