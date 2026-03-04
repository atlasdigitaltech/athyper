import { createHash } from "node:crypto";

import {
  AuthAuditEvent,
  emitBffAudit,
  hashSidForAudit,
} from "@neon/auth/audit";
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

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * GET /api/auth/session
 *
 * Returns public session fields only — no tokens, no internal metadata.
 * Used by the frontend to check authentication status and display user info.
 *
 * Security: Enforces soft IP/UA binding.
 *   - If BOTH the client's IP hash and User-Agent hash differ from the values
 *     recorded at login, the session is considered stolen and is destroyed.
 *   - If only one changes, it's allowed (users switch networks/browsers often).
 *
 * This endpoint does NOT require CSRF protection because it's a GET (read-only).
 *
 * Response shape (authenticated):
 *   { authenticated: true, userId, username, displayName, workbench, roles, persona, accessExpiresAt }
 *
 * Response shape (unauthenticated):
 *   { authenticated: false, reason?: string }
 */
export async function GET(req: Request) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Platform admin sessions use "platform" namespace; tenant sessions use tenantId
  const cookieStore = await cookies();
  const realmCookie = cookieStore.get("neon_realm")?.value;
  const sessionNamespace =
    realmCookie === "platform"
      ? "platform"
      : (process.env.DEFAULT_TENANT_ID ?? "default");
  const redis = await getRedisClient();

  try {
    const raw = await redis.get(`sess:${sessionNamespace}:${sid}`);
    if (!raw) {
      // Session cookie exists but session is gone from Redis.
      // Clear the stale cookies to avoid repeated lookups.
      await clearSessionCookie();
      await clearCsrfCookie();
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const session = JSON.parse(raw);

    // ─── Soft IP/UA binding check ───────────────────────────────
    // This is "soft" because single-factor drift (only IP or only UA
    // changed) is allowed — users switch Wi-Fi networks, VPNs, or
    // update browsers frequently. But if BOTH change simultaneously,
    // it's a strong indicator of cookie theft (different device entirely).
    const currentIpHash = hashValue(
      req.headers.get("x-forwarded-for") ?? "unknown",
    );
    const currentUaHash = hashValue(req.headers.get("user-agent") ?? "unknown");

    if (session.ipHash && session.ipHash !== currentIpHash) {
      if (session.uaHash && session.uaHash !== currentUaHash) {
        // Both IP and UA differ — likely a different device entirely.
        // Destroy session, clear cookies, audit the anomaly.
        await clearSessionCookie();
        await clearCsrfCookie();
        await redis.del(`sess:${sessionNamespace}:${sid}`);

        // Audit — session binding mismatch
        await emitBffAudit(redis, AuthAuditEvent.SESSION_BINDING_MISMATCH, {
          tenantId: sessionNamespace,
          userId: session.userId,
          sidHash: hashSidForAudit(sid),
          reason: "ip_and_ua_changed",
          meta: {
            originalIpPrefix: session.ipHash?.slice(0, 8),
            currentIpPrefix: currentIpHash.slice(0, 8),
          },
        });

        return NextResponse.json(
          { authenticated: false, reason: "session_binding_mismatch" },
          { status: 401 },
        );
      }
    }

    // Return public session data only — never include tokens or hashes
    return NextResponse.json({
      authenticated: true,
      userId: session.userId,
      username: session.username,
      displayName: session.displayName,
      workbench: session.workbench,
      roles: session.roles ?? [],
      persona: session.persona,
      accessExpiresAt: session.accessExpiresAt,
      mfaRequired: session.mfaRequired ?? false,
      mfaVerified: session.mfaVerified ?? false,
      // Platform admin fields (absent for regular users)
      ...(session.isPlatformAdmin && {
        isPlatformAdmin: true,
        platformRoles: session.platformRoles ?? [],
        selectedTenantId: session.selectedTenantId ?? null,
      }),
    });
  } finally {
    await redis.quit();
  }
}

/**
 * DELETE /api/auth/session (CSRF-protected via middleware)
 *
 * Destroys the current session without calling Keycloak logout.
 * Use POST /api/auth/logout for full logout with Keycloak SSO termination.
 *
 * This is a simpler "disconnect" — useful for switching accounts or
 * clearing local state without affecting the Keycloak SSO session.
 */
export async function DELETE() {
  const sid = await getSessionId();
  if (sid) {
    const cookieStore = await cookies();
    const realmCookie = cookieStore.get("neon_realm")?.value;
    const ns =
      realmCookie === "platform"
        ? "platform"
        : (process.env.DEFAULT_TENANT_ID ?? "default");
    const redis = await getRedisClient();
    try {
      // Audit — session destroyed (before deleting, so we can read userId)
      const raw = await redis.get(`sess:${ns}:${sid}`);
      if (raw) {
        const session = JSON.parse(raw);
        await emitBffAudit(redis, AuthAuditEvent.SESSION_DESTROYED, {
          tenantId: ns,
          userId: session.userId,
          sidHash: hashSidForAudit(sid),
          meta: { source: "delete_endpoint" },
        });

        // Clean up user session index
        if (session.userId) {
          await redis.sRem(`user_sessions:${ns}:${session.userId}`, sid);
        }
      }

      await redis.del(`sess:${ns}:${sid}`);
    } finally {
      await redis.quit();
    }
  }

  await clearSessionCookie();
  await clearCsrfCookie();
  return NextResponse.json({ ok: true });
}
