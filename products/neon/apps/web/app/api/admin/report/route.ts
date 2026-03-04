import { randomUUID } from "node:crypto";

import { AuthAuditEvent, emitBffAudit, hashSidForAudit } from "@neon/auth/audit";
import { decodeJwtPayload } from "@neon/auth/keycloak";
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
 * Recursively redact sensitive fields from a data object.
 */
function redact(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.map(redact);
    if (typeof data !== "object") return data;

    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const sensitiveKeys = new Set([
        "accessToken", "refreshToken", "idToken",
        "csrfToken", "codeVerifier", "password", "secret",
    ]);

    for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.has(key)) {
            result[key] = "[REDACTED]";
        } else if (key === "ipHash" || key === "uaHash") {
            result[key] = typeof value === "string" ? value.slice(0, 8) + "..." : "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
            result[key] = redact(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * GET /api/admin/report
 *
 * Generates a redacted diagnostic JSON report for download.
 * Tokens, CSRF values, and binding hashes are always masked.
 */
export async function GET() {
    const sid = await getSessionId();
    if (!sid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
    const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "http://keycloak.local";
    const realm = process.env.KEYCLOAK_REALM ?? "neon-dev";
    const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "neon-web";
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379/0";

    const redis = await getRedisClient();

    try {
        const raw = await redis.get(`sess:${tenantId}:${sid}`);
        if (!raw) {
            return NextResponse.json({ error: "Session not found" }, { status: 401 });
        }

        const session = JSON.parse(raw);
        const now = Math.floor(Date.now() / 1000);

        // Session state machine
        const IDLE_TIMEOUT_SEC = 900;
        const lastSeenAt = typeof session.lastSeenAt === "number" ? session.lastSeenAt : 0;
        const idleSeconds = lastSeenAt > 0 ? now - lastSeenAt : 0;
        const sessionState = idleSeconds >= IDLE_TIMEOUT_SEC
            ? "idle_expired"
            : idleSeconds >= IDLE_TIMEOUT_SEC - 180
                ? "idle_warning"
                : "active";

        const tokenRemaining = (session.accessExpiresAt ?? 0) - now;
        const tokenState = tokenRemaining <= 0 ? "expired" : tokenRemaining <= 120 ? "expiring" : "valid";

        const worstState = sessionState === "idle_expired" || tokenState === "expired"
            ? "reauth_required"
            : sessionState === "idle_warning" || tokenState === "expiring"
                ? "degraded"
                : "healthy";

        // JWT header (always safe to show)
        let jwtHeader: Record<string, unknown> = {};
        let jwtPayloadMeta: Record<string, unknown> = {};
        try {
            if (session.accessToken) {
                const parts = session.accessToken.split(".");
                jwtHeader = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
                const payload = decodeJwtPayload(session.accessToken);
                jwtPayloadMeta = {
                    iss: payload.iss,
                    sub: payload.sub,
                    aud: payload.aud,
                    iat: payload.iat,
                    exp: payload.exp,
                    scope: payload.scope,
                };
            }
        } catch { /* best effort */ }

        const report = {
            meta: {
                reportId: randomUUID(),
                generatedAt: new Date().toISOString(),
                generatedBy: session.userId,
                version: "1.0",
            },
            session: redact({
                userId: session.userId,
                username: session.username,
                displayName: session.displayName,
                email: session.email,
                workbench: session.workbench,
                persona: session.persona,
                tenantId: session.tenantId,
                realmKey: session.realmKey,
                roles: session.roles,
                clientRoles: session.clientRoles,
                groups: session.groups,
                scope: session.scope,
                tokenType: session.tokenType,
                sessionState,
                tokenState,
                verdict: worstState,
                tokenRemaining,
                idleSeconds,
                idleTimeoutSec: IDLE_TIMEOUT_SEC,
                issuedAt: session.createdAt ? new Date(session.createdAt * 1000).toISOString() : null,
                expiresAt: session.accessExpiresAt ? new Date(session.accessExpiresAt * 1000).toISOString() : null,
                lastSeenAt: lastSeenAt ? new Date(lastSeenAt * 1000).toISOString() : null,
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                idToken: session.idToken,
                csrfToken: session.csrfToken,
                ipHash: session.ipHash,
                uaHash: session.uaHash,
            }),
            keycloak: {
                baseUrl,
                realm,
                clientId,
                issuerUrl: `${baseUrl}/realms/${realm}`,
                tokenEndpoint: `${baseUrl}/realms/${realm}/protocol/openid-connect/token`,
                userinfoEndpoint: `${baseUrl}/realms/${realm}/protocol/openid-connect/userinfo`,
            },
            jwt: {
                header: jwtHeader,
                payloadMeta: jwtPayloadMeta,
                signaturePresent: session.accessToken ? session.accessToken.split(".").length === 3 : false,
            },
            infrastructure: {
                redis: {
                    status: "connected",
                    url: redisUrl.replace(/\/\/.*:.*@/, "//***:***@"),
                },
            },
            serverTime: new Date().toISOString(),
        };

        // Audit
        await emitBffAudit(redis, AuthAuditEvent.DIAG_REPORT_DOWNLOAD, {
            tenantId,
            userId: session.userId,
            sidHash: hashSidForAudit(sid),
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        return new NextResponse(JSON.stringify(report, null, 2), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="neon-diagnostics-${timestamp}.json"`,
            },
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Report generation failed", message: String(err) },
            { status: 500 },
        );
    } finally {
        await redis.quit();
    }
}
