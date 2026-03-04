import "server-only";

import { AuthAuditEvent, emitBffAudit, hashSidForAudit } from "@neon/auth/audit";
import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

async function getRedisClient() {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({ url });
    if (!client.isOpen) await client.connect();
    return client;
}

/**
 * POST /api/auth/mfa/verify (CSRF-protected via middleware)
 *
 * Verifies a TOTP code (or backup code) for MFA challenge.
 * On success: updates session mfaVerified=true, clears neon_mfa_pending cookie.
 * On failure: returns remaining attempts or lockout info.
 *
 * Request body: { code: string, isBackupCode?: boolean, rememberDevice?: boolean }
 */
export async function POST(req: NextRequest) {
    const sid = await getSessionId();
    if (!sid) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
    const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
    const env = process.env.ENVIRONMENT ?? "local";
    const redis = await getRedisClient();

    try {
        const raw = await redis.get(`sess:${tenantId}:${sid}`);
        if (!raw) {
            return NextResponse.json({ error: "Session not found" }, { status: 401 });
        }

        const session = JSON.parse(raw);
        const body = (await req.json()) as { code?: string; isBackupCode?: boolean; rememberDevice?: boolean };

        if (!body.code) {
            return NextResponse.json({ error: "Code is required" }, { status: 400 });
        }

        // Proxy verification to the runtime MFA service
        const verifyRes = await fetch(`${runtimeApiUrl}/api/iam/mfa/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Tenant-Id": tenantId,
                "X-Principal-Id": session.userId,
                "Authorization": `Bearer ${session.accessToken}`,
            },
            body: JSON.stringify({
                code: body.code,
                isBackupCode: body.isBackupCode ?? false,
                rememberDevice: body.rememberDevice ?? false,
                sessionId: sid,
                ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
                userAgent: req.headers.get("user-agent") ?? "unknown",
            }),
            signal: AbortSignal.timeout(10_000),
        });

        const result = (await verifyRes.json()) as {
            data?: { success?: boolean; reason?: string; remainingAttempts?: number; lockedUntil?: string; trustToken?: string };
        };

        if (!verifyRes.ok || !result.data?.success) {
            // Audit — MFA verification failed
            await emitBffAudit(redis, AuthAuditEvent.MFA_VERIFY_FAILED, {
                tenantId,
                userId: session.userId,
                sidHash: hashSidForAudit(sid),
                reason: result.data?.reason ?? "verification_failed",
                meta: {
                    remainingAttempts: result.data?.remainingAttempts,
                    isBackupCode: body.isBackupCode,
                },
            });

            return NextResponse.json({
                success: false,
                reason: result.data?.reason ?? "Invalid code",
                remainingAttempts: result.data?.remainingAttempts,
                lockedUntil: result.data?.lockedUntil,
            }, { status: 403 });
        }

        // MFA verified — update session
        const now = Math.floor(Date.now() / 1000);
        session.mfaVerified = true;
        session.mfaVerifiedAt = now;
        session.mfaRequired = false;
        await redis.set(`sess:${tenantId}:${sid}`, JSON.stringify(session), { KEEPTTL: true });

        // Audit — MFA verification success
        await emitBffAudit(redis, AuthAuditEvent.MFA_VERIFY_SUCCESS, {
            tenantId,
            userId: session.userId,
            sidHash: hashSidForAudit(sid),
            meta: {
                isBackupCode: body.isBackupCode,
                rememberDevice: body.rememberDevice,
            },
        });

        // Clear the MFA pending cookie and return success
        const response = NextResponse.json({
            success: true,
            trustToken: result.data.trustToken,
        });

        response.cookies.set("neon_mfa_pending", "", {
            httpOnly: true,
            secure: env !== "local",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });

        return response;
    } catch (error) {
        return NextResponse.json(
            { error: "MFA verification failed", message: String(error) },
            { status: 500 },
        );
    } finally {
        await redis.quit();
    }
}
