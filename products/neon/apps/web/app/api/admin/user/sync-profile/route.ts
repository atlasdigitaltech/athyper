import { AuthAuditEvent, emitBffAudit, hashSidForAudit } from "@neon/auth/audit";
import { fetchUserinfo } from "@neon/auth/keycloak";
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
 * POST /api/admin/user/sync-profile
 *
 * Re-fetches identity from Keycloak userinfo endpoint and patches the
 * Redis session with updated fields. Does NOT rotate sid/csrf.
 */
export async function POST() {
    const sid = await getSessionId();
    if (!sid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
    const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "http://keycloak.local";
    const realm = process.env.KEYCLOAK_REALM ?? "neon-dev";
    const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "neon-web";

    const redis = await getRedisClient();

    try {
        const raw = await redis.get(`sess:${tenantId}:${sid}`);
        if (!raw) {
            return NextResponse.json({ error: "Session not found" }, { status: 401 });
        }

        const session = JSON.parse(raw);

        if (!session.accessToken) {
            return NextResponse.json({ error: "No access token in session" }, { status: 400 });
        }

        // Fetch canonical identity from Keycloak
        const userinfo = await fetchUserinfo({ baseUrl, realm, accessToken: session.accessToken });

        // Extract fields
        const newDisplayName = (userinfo.name as string) ?? session.displayName;
        const newEmail = (userinfo.email as string) ?? session.email;
        const newUsername = (userinfo.preferred_username as string) ?? session.username;

        const realmAccess = userinfo.realm_access as { roles?: string[] } | undefined;
        const newRoles = Array.isArray(realmAccess?.roles) ? realmAccess.roles : session.roles;

        const resourceAccess = userinfo.resource_access as Record<string, { roles?: string[] }> | undefined;
        const newClientRoles = Array.isArray(resourceAccess?.[clientId]?.roles)
            ? resourceAccess[clientId].roles
            : session.clientRoles;

        const newGroups = Array.isArray(userinfo.groups) ? userinfo.groups as string[] : session.groups;

        // Determine which fields changed
        const fieldsUpdated: string[] = [];
        if (newDisplayName !== session.displayName) fieldsUpdated.push("displayName");
        if (newEmail !== session.email) fieldsUpdated.push("email");
        if (newUsername !== session.username) fieldsUpdated.push("username");
        if (JSON.stringify(newRoles) !== JSON.stringify(session.roles)) fieldsUpdated.push("roles");
        if (JSON.stringify(newClientRoles) !== JSON.stringify(session.clientRoles)) fieldsUpdated.push("clientRoles");
        if (JSON.stringify(newGroups) !== JSON.stringify(session.groups)) fieldsUpdated.push("groups");

        // Derive persona from roles
        const newPersona = newRoles.includes("tenant_admin") ? "tenant_admin" : "requester";
        if (newPersona !== session.persona) fieldsUpdated.push("persona");

        // Patch session
        const patchedSession = {
            ...session,
            displayName: newDisplayName,
            email: newEmail,
            username: newUsername,
            roles: newRoles,
            clientRoles: newClientRoles,
            groups: newGroups,
            persona: newPersona,
        };

        await redis.set(`sess:${tenantId}:${sid}`, JSON.stringify(patchedSession), { EX: 28800 });

        await emitBffAudit(redis, AuthAuditEvent.DIAG_PROFILE_SYNC, {
            tenantId,
            userId: session.userId,
            sidHash: hashSidForAudit(sid),
            meta: { fieldsUpdated },
        });

        return NextResponse.json({
            ok: true,
            fieldsUpdated,
            profile: {
                displayName: newDisplayName,
                email: newEmail,
                username: newUsername,
                roles: newRoles,
                persona: newPersona,
            },
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Profile sync failed", message: String(err) },
            { status: 500 },
        );
    } finally {
        await redis.quit();
    }
}
