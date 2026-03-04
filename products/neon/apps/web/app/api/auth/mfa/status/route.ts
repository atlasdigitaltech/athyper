import "server-only";

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

async function getRedisClient() {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({ url });
    if (!client.isOpen) await client.connect();
    return client;
}

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
    const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
    const redis = await getRedisClient();

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
                    "Authorization": `Bearer ${session.accessToken}`,
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
    } finally {
        await redis.quit();
    }
}
