import { NextResponse } from "next/server";

import { getSessionRedis } from "@/lib/auth/session-redis";
import {
  clearCsrfCookie,
  clearMfaPendingCookie,
  clearSessionCookie,
  getSessionId,
} from "@/lib/auth/session";
import {
  sessKey,
  userSessionsKey,
} from "@/lib/auth/redis-keys";
import { resolveSessionPolicy } from "@/lib/auth/session-policy-resolver";
import { resolveSessionNamespace } from "@/lib/server/session-namespace";
import type { V4Session } from "@/lib/auth/types";

/**
 * POST /api/auth/touch
 *
 * Updates lastSeenAt for the current session. Called by the client-side
 * activity heartbeat in SessionProvider to prevent false idle-timeout
 * expiry while the user is actively using the application.
 *
 * No body required — auth is via the httpOnly neon_sid cookie.
 * Returns 200 { ok: true } silently; errors are non-fatal for the caller.
 */
export async function POST(req: Request) {
  const sid = await getSessionId();
  if (!sid) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const sessionNamespace = await resolveSessionNamespace();
    const redis = await getSessionRedis();
    const raw = await redis.get(sessKey(sessionNamespace, sid));
    if (!raw) return NextResponse.json({ ok: false }, { status: 401 });

    const session = JSON.parse(raw) as V4Session;
    const now = Math.floor(Date.now() / 1000);
    const policy = await resolveSessionPolicy(session);
    const lastSeenAt =
      typeof session.lastSeenAt === "number" ? session.lastSeenAt : 0;
    const idleAgeSeconds = lastSeenAt > 0 ? now - lastSeenAt : 0;
    const heartbeatLagSeconds = Math.max(
      0,
      Math.ceil(policy.heartbeatIntervalMs / 1000),
    );
    const isContinueRequest = req.headers.get("x-session-continue") === "1";
    // The browser may have real activity that Redis has not seen yet because
    // normal activity touches are throttled. Allow the explicit continue action
    // to recover only inside that heartbeat-lag window.
    const withinContinueGrace =
      isContinueRequest &&
      idleAgeSeconds <= policy.idleTimeoutSeconds + heartbeatLagSeconds;

    if (
      lastSeenAt > 0 &&
      idleAgeSeconds >= policy.idleTimeoutSeconds &&
      !withinContinueGrace
    ) {
      await redis.del(sessKey(sessionNamespace, sid));
      if (session.userId) {
        await redis.sRem(userSessionsKey(sessionNamespace, session.userId), sid).catch(() => {});
      }
      await clearSessionCookie();
      await clearCsrfCookie();
      await clearMfaPendingCookie();
      const res = NextResponse.json(
        { ok: false, reason: "idle_expired" },
        { status: 401 },
      );
      res.cookies.delete("neon_sid");
      res.cookies.delete("__csrf");
      res.cookies.delete("neon_mfa_pending");
      return res;
    }

    const ttl = await redis.ttl(sessKey(sessionNamespace, sid));
    const updated: V4Session = {
      ...session,
      lastSeenAt: now,
    };

    await redis.set(
      sessKey(sessionNamespace, sid),
      JSON.stringify(updated),
      { EX: ttl > 0 ? ttl : policy.sessionTtlSeconds },
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
