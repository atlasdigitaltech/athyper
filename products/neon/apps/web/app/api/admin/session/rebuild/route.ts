import { createHash, randomUUID } from "node:crypto";

import { AuthAuditEvent, emitBffAudit, hashSidForAudit } from "@neon/auth/audit";
import { decodeJwtPayload, fetchUserinfo, refreshTokens } from "@neon/auth/keycloak";
import { getSessionId, setCsrfCookie, setSessionCookie } from "@neon/auth/session";
import { NextResponse } from "next/server";


async function getRedisClient() {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({ url });
    if (!client.isOpen) await client.connect();
    return client;
}

/**
 * POST /api/admin/session/rebuild
 *
 * Destroys current Redis session and recreates it from Keycloak.
 * The user stays logged in — no redirect to login page.
 *
 * Flow:
 *   1. Refresh tokens (get fresh access + refresh)
 *   2. Fetch userinfo for canonical identity
 *   3. Generate new sid + CSRF token
 *   4. Build fresh session object
 *   5. Write to Redis, delete old, update index
 *   6. Set new cookies
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

        const oldSession = JSON.parse(raw);

        if (!oldSession.refreshToken) {
            return NextResponse.json(
                { error: "No refresh token — cannot rebuild session" },
                { status: 400 },
            );
        }

        // Step 1: Refresh tokens
        const tokens = await refreshTokens({
            baseUrl,
            realm,
            clientId,
            refreshToken: oldSession.refreshToken,
        });

        // Step 2: Fetch userinfo with fresh access token
        const userinfo = await fetchUserinfo({
            baseUrl,
            realm,
            accessToken: tokens.access_token,
        });

        // Step 3: Generate new sid + CSRF
        const now = Math.floor(Date.now() / 1000);
        const newSid = createHash("sha256").update(randomUUID() + Date.now().toString()).digest("hex");
        const newCsrfToken = randomUUID();

        // Extract claims from fresh access token
        const claims = decodeJwtPayload(tokens.access_token);
        const realmAccess = claims.realm_access as { roles?: string[] } | undefined;
        const roles = Array.isArray(realmAccess?.roles)
            ? realmAccess.roles.filter((r): r is string => typeof r === "string")
            : [];

        const resourceAccess = claims.resource_access as Record<string, { roles?: string[] }> | undefined;
        const clientRoles = Array.isArray(resourceAccess?.[clientId]?.roles)
            ? resourceAccess[clientId].roles.filter((r): r is string => typeof r === "string")
            : [];

        const groups = Array.isArray(userinfo.groups) ? userinfo.groups as string[] : [];
        const persona = roles.includes("tenant_admin") ? "tenant_admin" : "requester";

        // Step 4: Build fresh session
        const newSession = {
            version: 1,
            sid: newSid,
            tenantId: oldSession.tenantId ?? tenantId,
            userId: (userinfo.sub as string) ?? oldSession.userId,
            username: (userinfo.preferred_username as string) ?? oldSession.username,
            displayName: (userinfo.name as string) ?? oldSession.displayName,
            email: (userinfo.email as string) ?? oldSession.email,
            principalId: oldSession.principalId,
            realmKey: oldSession.realmKey ?? realm,
            workbench: oldSession.workbench ?? "user",
            roles,
            clientRoles,
            groups,
            persona,
            scope: (claims.scope as string) ?? oldSession.scope,
            tokenType: "Bearer",
            keycloakSessionId: (claims.sid as string) ?? oldSession.keycloakSessionId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? oldSession.refreshToken,
            idToken: tokens.id_token ?? oldSession.idToken,
            accessExpiresAt: now + tokens.expires_in,
            refreshExpiresAt: tokens.refresh_expires_in ? now + tokens.refresh_expires_in : oldSession.refreshExpiresAt,
            createdAt: oldSession.createdAt, // Preserve original session creation time
            lastSeenAt: now,
            ipHash: oldSession.ipHash,
            uaHash: oldSession.uaHash,
            csrfToken: newCsrfToken,
        };

        // Step 5: Write new session, delete old
        await redis.set(`sess:${tenantId}:${newSid}`, JSON.stringify(newSession), { EX: 28800 });
        await redis.del(`sess:${tenantId}:${sid}`);

        // Update user sessions index
        if (newSession.userId) {
            await redis.sRem(`user_sessions:${tenantId}:${newSession.userId}`, sid);
            await redis.sAdd(`user_sessions:${tenantId}:${newSession.userId}`, newSid);
        }

        // Step 6: Set new cookies
        await setSessionCookie(newSid, env);
        await setCsrfCookie(newCsrfToken, env);

        // Audit
        await emitBffAudit(redis, AuthAuditEvent.DIAG_SESSION_REBUILD, {
            tenantId,
            userId: newSession.userId,
            sidHash: hashSidForAudit(newSid),
            meta: {
                previousSidHash: hashSidForAudit(sid),
                tokenExpiresIn: tokens.expires_in,
            },
        });

        return NextResponse.json({
            ok: true,
            csrfToken: newCsrfToken,
            accessExpiresAt: newSession.accessExpiresAt,
            message: "Session rebuilt from Keycloak",
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Session rebuild failed", message: String(err) },
            { status: 500 },
        );
    } finally {
        await redis.quit();
    }
}
