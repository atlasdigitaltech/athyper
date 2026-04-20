import { NextResponse } from "next/server";

import { getSessionRedis } from "@/lib/auth/session-redis";
import {
  clearCsrfCookie,
  clearSessionCookie,
  getSessionId,
  hashValue,
} from "@/lib/auth/session";
import { sessKey, userSessionsKey } from "@/lib/auth/redis-keys";
import { resolveSessionNamespace } from "@/lib/server/session-namespace";
import type { PublicSession, V4Session } from "@/lib/auth/types";

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function getRedis() {
  try {
    return await getSessionRedis();
  } catch {
    return null;
  }
}

/**
 * Returns true if both IP and UA hashes differ from the stored session values.
 * Single drift (proxy change, mobile roam) is allowed; both changing together
 * is treated as a stolen cookie.
 */
function isBindingMismatch(session: V4Session, req: Request): boolean {
  const currentIp = hashValue(req.headers.get("x-forwarded-for") ?? "unknown");
  const currentUa = hashValue(req.headers.get("user-agent") ?? "unknown");
  return (
    !!session.ipHash && session.ipHash !== currentIp &&
    !!session.uaHash && session.uaHash !== currentUa
  );
}

/**
 * GET /api/auth/session
 *
 * Returns public session fields only — no tokens, no internal hashes.
 * Used by the frontend to check auth status and render the entity selector.
 *
 * v4 response includes `organizations` (alias-keyed) + `activeOrg` / `activeWorkbench`
 * instead of the F1 `persona` / `workbench` fields.
 *
 * Security: Soft IP/UA binding — if BOTH IP hash and UA hash differ from login
 * values, the session is destroyed (possible cookie theft).
 *
 * Response (authenticated):
 *   { authenticated: true, userId, username, displayName, organizations,
 *     activeOrg, activeWorkbench, accessExpiresAt, mfaRequired, mfaVerified }
 *
 * Response (unauthenticated):
 *   { authenticated: false, reason? }
 */
export async function GET(req: Request) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const redis = await getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: "SESSION_STORE_UNAVAILABLE", message: "Session store is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const sessionNamespace = await resolveSessionNamespace();
  const raw = await redis.get(sessKey(sessionNamespace, sid));

  if (!raw) {
    await clearSessionCookie();
    await clearCsrfCookie();
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = JSON.parse(raw) as V4Session;

  // ─── Soft IP/UA binding check ────────────────────────────────────────────
  if (isBindingMismatch(session, req)) {
    await clearSessionCookie();
    await clearCsrfCookie();
    await redis.del(sessKey(sessionNamespace, sid));
    console.warn("[auth/session] Session binding mismatch — destroyed:", {
      userId: session.userId,
      sidPrefix: sid.slice(0, 8),
    });
    return NextResponse.json(
      { authenticated: false, reason: "session_binding_mismatch" },
      { status: 401 },
    );
  }

  const body: PublicSession = {
    authenticated: true,
    userId: session.userId,
    username: session.username,
    displayName: session.displayName,
    email: session.email,
    organizations: session.organizations ?? {},
    activeOrg: session.activeOrg ?? null,
    activeWorkbench: session.activeWorkbench ?? null,
    accessExpiresAt: session.accessExpiresAt,
    mfaRequired: session.mfaRequired ?? false,
    mfaVerified: session.mfaVerified ?? false,
  };

  return NextResponse.json(body);
}

/**
 * PATCH /api/auth/session — update active org + workbench context
 *
 * Called by /auth/select after the user picks an entity and workbench.
 * Validates that the requested org/role exists in the session organizations.
 *
 * Body: { org: "athyper--ATHQ", workbench: "user" }
 * Response: { ok: true }
 */
export async function PATCH(req: Request) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const sessionNamespace = await resolveSessionNamespace();

  const redis = await getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: "SESSION_STORE_UNAVAILABLE", message: "Session store is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const raw = await redis.get(sessKey(sessionNamespace, sid));
  if (!raw) {
    return NextResponse.json({ error: "Session not found" }, { status: 401 });
  }

  const session = JSON.parse(raw) as V4Session;

  // IP/UA binding check — same protection as GET
  if (isBindingMismatch(session, req)) {
    await clearSessionCookie();
    await clearCsrfCookie();
    await redis.del(sessKey(sessionNamespace, sid));
    return NextResponse.json(
      { error: "session_binding_mismatch" },
      { status: 401 },
    );
  }

  const body = (await req.json()) as { org?: string; workbench?: string };
  const { org, workbench } = body;

  if (!org || !workbench) {
    return NextResponse.json(
      { error: "Missing org or workbench" },
      { status: 400 },
    );
  }

  // Validate org exists in session
  const orgEntry = session.organizations[org];
  if (!orgEntry) {
    return NextResponse.json(
      { error: "Org not in session" },
      { status: 403 },
    );
  }

  // Validate workbench is a role in that org
  if (!orgEntry.roles.includes(workbench)) {
    return NextResponse.json(
      { error: "Workbench not allowed for org" },
      { status: 403 },
    );
  }

  const updated: V4Session = {
    ...session,
    activeOrg: org,
    activeWorkbench: workbench,
    lastSeenAt: Math.floor(Date.now() / 1000),
  };

  // Preserve remaining TTL
  const ttl = await redis.ttl(sessKey(sessionNamespace, sid));
  await redis.set(
    sessKey(sessionNamespace, sid),
    JSON.stringify(updated),
    { EX: ttl > 0 ? ttl : 28800 },
  );

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/auth/session — destroy session without Keycloak logout
 *
 * Useful for account switching without ending the Keycloak SSO session.
 * Use POST /api/auth/logout for full logout.
 */
export async function DELETE(req: Request) {
  const sid = await getSessionId();
  if (sid) {
    try {
      const ns = await resolveSessionNamespace();
      const redis = await getSessionRedis();
      const raw = await redis.get(sessKey(ns, sid));
      if (raw) {
        const session = JSON.parse(raw) as V4Session;

        // IP/UA binding check — prevent stolen cookies from clearing other sessions
        if (isBindingMismatch(session, req)) {
          await clearSessionCookie();
          await clearCsrfCookie();
          await redis.del(sessKey(ns, sid));
          return NextResponse.json({ ok: true });
        }

        if (session.userId) {
          await redis.sRem(userSessionsKey(ns, session.userId), sid);
        }
      }
      await redis.del(sessKey(ns, sid));
    } catch {
      // Redis unavailable — cookies are still cleared below so the browser
      // session is invalidated. The Redis entry will expire on its own TTL.
    }
  }

  await clearSessionCookie();
  await clearCsrfCookie();
  return NextResponse.json({ ok: true });
}
