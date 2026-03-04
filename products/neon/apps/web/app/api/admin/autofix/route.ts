import { createHash, randomUUID } from "node:crypto";

import { AuthAuditEvent, emitBffAudit, hashSidForAudit } from "@neon/auth/audit";
import { decodeJwtPayload, fetchUserinfo, refreshTokens } from "@neon/auth/keycloak";
import { getSessionId, setCsrfCookie, setSessionCookie } from "@neon/auth/session";
import { NextResponse } from "next/server";

import { CACHE_PATTERNS, scanAndDelete } from "@/lib/diagnostics/cache-patterns";


async function getRedisClient() {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({ url });
    if (!client.isOpen) await client.connect();
    return client;
}

interface StepResult {
    ok: boolean;
    message: string;
    [key: string]: unknown;
}

/**
 * POST /api/admin/autofix
 *
 * One-click repair: runs multiple fixes together.
 *   1. Refresh token
 *   2. Clear app cache
 *   3. Clear RBAC cache
 *   4. Sync profile
 *
 * Each step is independently try/caught so partial success is possible.
 * Client should reload the page after this completes.
 */
export async function POST() {
    const sid = await getSessionId();
    if (!sid) {
        return NextResponse.json({ redirect: "/api/auth/login" }, { status: 401 });
    }

    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
    const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "http://keycloak.local";
    const realm = process.env.KEYCLOAK_REALM ?? "neon-dev";
    const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "neon-web";
    const env = process.env.ENVIRONMENT ?? "local";

    const redis = await getRedisClient();

    try {
        const raw = await redis.get(`sess:${tenantId}:${sid}`);
        if (!raw) {
            return NextResponse.json({ redirect: "/api/auth/login" }, { status: 401 });
        }

        let session = JSON.parse(raw);
        let currentSid = sid;
        let newCsrfToken: string | undefined;
        let newAccessExpiresAt: number | undefined;

        const steps: Record<string, StepResult> = {};

        // ─── Step 1: Refresh Token ──────────────────────────────────
        try {
            if (!session.refreshToken) {
                steps.refreshToken = { ok: false, message: "No refresh token available" };
            } else {
                const tokens = await refreshTokens({
                    baseUrl, realm, clientId,
                    refreshToken: session.refreshToken,
                });

                // Rotate sid
                const rotatedSid = createHash("sha256").update(randomUUID() + Date.now().toString()).digest("hex");
                newCsrfToken = randomUUID();
                const now = Math.floor(Date.now() / 1000);

                const claims = decodeJwtPayload(tokens.access_token);
                const realmAccess = claims.realm_access as { roles?: string[] } | undefined;
                const roles = Array.isArray(realmAccess?.roles)
                    ? realmAccess.roles.filter((r): r is string => typeof r === "string")
                    : session.roles;

                session = {
                    ...session,
                    sid: rotatedSid,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token ?? session.refreshToken,
                    accessExpiresAt: now + tokens.expires_in,
                    refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in : session.refreshExpiresAt,
                    idToken: tokens.id_token ?? session.idToken,
                    roles,
                    csrfToken: newCsrfToken,
                    lastSeenAt: now,
                };

                await redis.set(`sess:${tenantId}:${rotatedSid}`, JSON.stringify(session), { EX: 28800 });
                await redis.del(`sess:${tenantId}:${currentSid}`);

                if (session.userId) {
                    await redis.sRem(`user_sessions:${tenantId}:${session.userId}`, currentSid);
                    await redis.sAdd(`user_sessions:${tenantId}:${session.userId}`, rotatedSid);
                }

                await setSessionCookie(rotatedSid, env);
                await setCsrfCookie(newCsrfToken, env);

                currentSid = rotatedSid;
                newAccessExpiresAt = session.accessExpiresAt;
                steps.refreshToken = { ok: true, message: "Token refreshed and session rotated" };
            }
        } catch (err) {
            steps.refreshToken = { ok: false, message: String(err) };
        }

        // ─── Step 2: Clear App Cache ────────────────────────────────
        try {
            const keysDeleted = await scanAndDelete(redis, CACHE_PATTERNS.app);
            steps.clearAppCache = { ok: true, message: `Cleared ${keysDeleted} keys`, keysDeleted };
        } catch (err) {
            steps.clearAppCache = { ok: false, message: String(err) };
        }

        // ─── Step 3: Clear RBAC Cache ───────────────────────────────
        try {
            const keysDeleted = await scanAndDelete(redis, CACHE_PATTERNS.rbac);
            steps.clearRbacCache = { ok: true, message: `Cleared ${keysDeleted} keys`, keysDeleted };
        } catch (err) {
            steps.clearRbacCache = { ok: false, message: String(err) };
        }

        // ─── Step 4: Sync Profile ───────────────────────────────────
        try {
            if (!session.accessToken) {
                steps.syncProfile = { ok: false, message: "No access token available" };
            } else {
                const userinfo = await fetchUserinfo({ baseUrl, realm, accessToken: session.accessToken });

                const fieldsUpdated: string[] = [];
                const newDisplayName = (userinfo.name as string) ?? session.displayName;
                const newEmail = (userinfo.email as string) ?? session.email;

                if (newDisplayName !== session.displayName) fieldsUpdated.push("displayName");
                if (newEmail !== session.email) fieldsUpdated.push("email");

                session.displayName = newDisplayName;
                session.email = newEmail;

                await redis.set(`sess:${tenantId}:${currentSid}`, JSON.stringify(session), { EX: 28800 });
                steps.syncProfile = { ok: true, message: `Updated: ${fieldsUpdated.length > 0 ? fieldsUpdated.join(", ") : "no changes"}`, fieldsUpdated };
            }
        } catch (err) {
            steps.syncProfile = { ok: false, message: String(err) };
        }

        // Audit
        await emitBffAudit(redis, AuthAuditEvent.DIAG_AUTOFIX, {
            tenantId,
            userId: session.userId,
            sidHash: hashSidForAudit(currentSid),
            meta: { steps },
        });

        return NextResponse.json({
            ok: true,
            steps,
            csrfToken: newCsrfToken,
            accessExpiresAt: newAccessExpiresAt,
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Autofix failed", message: String(err) },
            { status: 500 },
        );
    } finally {
        await redis.quit();
    }
}
