import { NextResponse } from "next/server";

import { getSessionRedis } from "@/lib/auth/session-redis";
import { getSessionId } from "@/lib/auth/session";
import { sessKey } from "@/lib/auth/redis-keys";
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
export async function POST() {
  const sid = await getSessionId();
  if (!sid) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const sessionNamespace = await resolveSessionNamespace();
    const redis = await getSessionRedis();
    const raw = await redis.get(sessKey(sessionNamespace, sid));
    if (!raw) return NextResponse.json({ ok: false }, { status: 401 });

    const session = JSON.parse(raw) as V4Session;
    const ttl = await redis.ttl(sessKey(sessionNamespace, sid));
    const updated: V4Session = {
      ...session,
      lastSeenAt: Math.floor(Date.now() / 1000),
    };

    await redis.set(
      sessKey(sessionNamespace, sid),
      JSON.stringify(updated),
      { EX: ttl > 0 ? ttl : 28800 },
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
