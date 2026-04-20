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
  clearSessionCookie,
  getSessionId,
} from "@/lib/auth/session";
import { sessKey, userSessionsKey } from "@/lib/auth/redis-keys";
import { resolvePublicBaseUrl } from "@/lib/auth/resolve-public-base-url";
import type { V4Session } from "@/lib/auth/types";

/**
 * POST /api/auth/logout
 *
 * Multi-layer logout:
 *   Layer 1 — Keycloak backchannel: Revoke the refresh token (best-effort,
 *             isolated — failure does NOT prevent Redis/cookie cleanup).
 *   Layer 2 — Redis: Delete session key + remove from user_sessions index.
 *   Layer 3 — Browser: Clear neon_sid + __csrf cookies.
 *   Layer 4 — Front-channel: Return KC logout URL for the browser to navigate.
 *             This ends the KC SSO session (shared across all apps in the realm).
 *
 * Response: { ok: true, logoutUrl: "https://iam.../logout?..." }
 * The client MUST navigate to logoutUrl to complete SSO logout.
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
    // Best-effort Redis cleanup — cookies are always cleared regardless.
    try {
      const redis = await getSessionRedis();
      const raw = await redis.get(sessKey(sessionNamespace, sid));
      if (raw) {
        const session = JSON.parse(raw) as V4Session;
        idToken = session.idToken;

        // Layer 1: Revoke refresh token at Keycloak (best-effort, isolated).
        // Failure here must NOT prevent Redis cleanup — a failed revocation
        // still means the browser session is invalidated via cookie clearing.
        if (session.refreshToken) {
          try {
            await revokeToken({
              baseUrl,
              realm,
              clientId,
              token: session.refreshToken,
              tokenTypeHint: "refresh_token",
            });
          } catch {
            // KC unavailable — proceed with Redis + cookie cleanup regardless.
          }
        }

        // Layer 2a: Remove from user session index
        if (session.userId) {
          await redis.sRem(
            userSessionsKey(sessionNamespace, session.userId),
            sid,
          );
        }
      }

      // Layer 2b: Destroy session key (runs even if raw was null)
      await redis.del(sessKey(sessionNamespace, sid));
    } catch {
      // Redis unavailable — proceed with cookie clearing and KC front-channel
      // logout. The Redis entry will expire on its own TTL.
    }
  }

  // Layer 3: Clear browser cookies
  await clearSessionCookie();
  await clearCsrfCookie();

  // Layer 4: Build front-channel logout URL
  const logoutUrl = buildFrontChannelLogoutUrl({
    baseUrl,
    realm,
    clientId,
    idToken,
    postLogoutRedirectUri: `${publicBaseUrl}/login`,
  });

  const res = NextResponse.json({ ok: true, logoutUrl });

  if (isPlatformSession) {
    res.cookies.delete("neon_realm");
  }

  return res;
}
