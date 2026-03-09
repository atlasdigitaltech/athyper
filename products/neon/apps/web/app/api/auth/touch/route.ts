import {
  AuthAuditEvent,
  emitBffAudit,
  hashSidForAudit,
} from "@neon/auth/audit";
import { getSessionId } from "@neon/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionRedis } from "@/lib/auth/session-redis";

/**
 * Idle timeout in seconds. Must match IDLE_TIMEOUT_SEC in:
 *   - refresh/route.ts (server-side enforcement)
 *   - debug/route.ts (state machine computation)
 *   - lib/session-bootstrap.ts (client-side bootstrap)
 *
 * When changing this value, update all four locations.
 */
const IDLE_TIMEOUT_SEC = 900;

/**
 * POST /api/auth/touch (CSRF-protected via middleware)
 *
 * Lightweight endpoint to update the session's `lastSeenAt` timestamp
 * for server-side idle timeout tracking.
 *
 * Called by the client-side useIdleTracker hook every 60 seconds while
 * the user is actively interacting with the page (mouse, keyboard, etc.).
 *
 * Server-side enforcement:
 *   If the session is already idle_expired (lastSeenAt + IDLE_TIMEOUT < now),
 *   the touch is rejected with 401. This prevents a stolen sid from calling
 *   touch in a loop to keep sessions alive indefinitely.
 *
 * This endpoint does NOT:
 *   - Extend the absolute session TTL (8h, set at Redis key level)
 *   - Modify tokens or CSRF values
 *   - Return any session data
 *
 * Callers:
 *   - useIdleTracker hook (every 60s when user is active)
 *   - "Stay signed in" button in the idle warning banner
 */
export async function POST() {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Determine session namespace from neon_realm cookie
  const cookieStore = await cookies();
  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");
  const redis = await getSessionRedis();

  try {
    const key = `sess:${sessionNamespace}:${sid}`;
    const raw = await redis.get(key);
    if (!raw) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const session = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);

    // Enforce idle timeout: if session has been idle beyond limit, reject.
    // This is a security control — not just a UX feature.
    const lastSeenAt =
      typeof session.lastSeenAt === "number" ? session.lastSeenAt : 0;
    if (lastSeenAt > 0 && now - lastSeenAt >= IDLE_TIMEOUT_SEC) {
      // Audit — touch rejected due to idle expiry
      await emitBffAudit(redis, AuthAuditEvent.IDLE_TOUCH_REJECTED, {
        tenantId: sessionNamespace,
        userId: session.userId,
        sidHash: hashSidForAudit(sid),
        reason: "idle_expired",
        meta: { lastSeenAt, idleSeconds: now - lastSeenAt },
      });

      return NextResponse.json(
        { ok: false, reason: "idle_expired" },
        { status: 401 },
      );
    }

    // Update lastSeenAt — this resets the idle timeout clock
    session.lastSeenAt = now;
    await redis.set(key, JSON.stringify(session), { EX: 28800 });

    return NextResponse.json({ ok: true });
  }
}
