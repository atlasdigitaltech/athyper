import "server-only";

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import { getSessionRedis } from "@/lib/auth/session-redis";

/**
 * GET /api/auth/mfa/status
 *
 * Returns the current MFA status for the authenticated user.
 * Proxies to the runtime MFA service for enrollment state,
 * and includes session-level MFA verification state.
 */
export async function GET() {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
  const runtimeApiUrl =
    process.env.RUNTIME_API_URL ?? "https://api.athyper.local";
  const redis = await getSessionRedis();

  try {
    const raw = await redis.get(`sess:${tenantId}:${sid}`);
    if (!raw) {
      return NextResponse.json({ error: "Session not found" }, { status: 401 });
    }

    const session = JSON.parse(raw);

    // Proxy to runtime MFA status endpoint
    let mfaStatus: Record<string, unknown> = {};
    try {
      const res = await fetch(`${runtimeApiUrl}/api/iam/mfa/status`, {
        headers: {
          "X-Tenant-Id": tenantId,
          "X-Principal-Id": session.userId,
          Authorization: `Bearer ${session.accessToken}`,
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: Record<string, unknown> };
        mfaStatus = data.data ?? {};
      }
    } catch {
      // Runtime unreachable — return session-only state
    }

    return NextResponse.json({
      success: true,
      data: {
        ...mfaStatus,
        sessionMfaRequired: session.mfaRequired ?? false,
        sessionMfaVerified: session.mfaVerified ?? false,
        sessionMfaVerifiedAt: session.mfaVerifiedAt,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
