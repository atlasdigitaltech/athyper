// products/neon/apps/web/app/api/platform/helpers.ts
//
// Shared helpers for platform-control API endpoints.
// Validates that the current session is a platform admin session
// and checks platform role permissions.

import { getSessionId } from "@neon/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function getRedisClient() {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({ url });
    client.on("error", () => {});
    if (!client.isOpen) await client.connect();
    return client;
}

export interface PlatformAuthResult {
    ok: true;
    sid: string;
    userId: string;
    displayName: string;
    platformRoles: string[];
    selectedTenantId: string | null;
    accessToken: string;
    realmKey: string;
}

interface PlatformAuthError {
    ok: false;
    response: NextResponse;
}

/**
 * Permission matrix for platform roles.
 * Matches the config schema defaults — kept here as a runtime constant
 * so BFF routes can check permissions without loading RuntimeConfig.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
    PRODUCT_ADMIN: ["tenant:list", "tenant:switch", "tenant:manage", "platform:configure"],
    TENANT_MANAGER: ["tenant:list", "tenant:switch", "tenant:manage"],
    SUPPORT_ADMIN: ["tenant:list", "tenant:switch"],
    READ_ONLY_SUPPORT: ["tenant:list"],
};

/**
 * Validates that the current request has a platform admin session.
 * Returns the platform auth context or an error response.
 */
export async function requirePlatformSession(): Promise<PlatformAuthResult | PlatformAuthError> {
    const sid = await getSessionId();
    if (!sid) {
        return {
            ok: false,
            response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
        };
    }

    // Platform sessions are stored under neon_realm=platform cookie
    const cookieStore = await cookies();
    const realmCookie = cookieStore.get("neon_realm")?.value;
    if (realmCookie !== "platform") {
        return {
            ok: false,
            response: NextResponse.json({ error: "FORBIDDEN", message: "Not a platform admin session" }, { status: 403 }),
        };
    }

    const redis = await getRedisClient();
    try {
        const raw = await redis.get(`sess:platform:${sid}`);
        if (!raw) {
            return {
                ok: false,
                response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
            };
        }

        const session = JSON.parse(raw);
        if (!session.isPlatformAdmin) {
            return {
                ok: false,
                response: NextResponse.json({ error: "FORBIDDEN", message: "Not a platform admin session" }, { status: 403 }),
            };
        }

        return {
            ok: true,
            sid,
            userId: session.userId,
            displayName: session.displayName ?? session.username ?? "",
            platformRoles: session.platformRoles ?? [],
            selectedTenantId: session.selectedTenantId ?? null,
            accessToken: session.accessToken,
            realmKey: session.realmKey,
        };
    } finally {
        await redis.quit();
    }
}

/**
 * Check if the platform auth context has a specific permission.
 */
export function hasPlatformPermission(
    platformRoles: string[],
    permission: string,
): boolean {
    return platformRoles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission) ?? false);
}
