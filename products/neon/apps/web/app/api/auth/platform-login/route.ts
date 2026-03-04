import { AuthAuditEvent, emitBffAudit } from "@neon/auth/audit";
import { buildAuthorizationUrl, generatePkceChallenge } from "@neon/auth/keycloak";
import { NextResponse } from "next/server";

async function getRedisClient() {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({ url });
    client.on("error", () => {});
    if (!client.isOpen) await client.connect();
    return client;
}

/**
 * GET /api/auth/platform-login
 *
 * Dedicated login route for the platform-control Keycloak realm.
 * Always uses PLATFORM_KEYCLOAK_REALM / PLATFORM_KEYCLOAK_CLIENT_ID env vars.
 *
 * This avoids relying on a ?realm= query parameter which can be stripped
 * by middleware, browser caching, or Next.js internal routing.
 */
export async function GET(req: Request) {
    if (process.env.PLATFORM_CONTROL_ENABLED !== "true") {
        return NextResponse.json(
            { error: "PLATFORM_CONTROL_DISABLED", message: "Platform control is not enabled." },
            { status: 403 },
        );
    }

    const url = new URL(req.url);
    const workbench = url.searchParams.get("workbench") ?? "admin";
    const returnUrl = url.searchParams.get("returnUrl") ?? "/platform";

    const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "http://keycloak.local";
    const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
    const redirectUri = `${publicBaseUrl}/api/auth/callback`;
    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";

    const realm = process.env.PLATFORM_KEYCLOAK_REALM ?? "platform-control";
    const clientId = process.env.PLATFORM_KEYCLOAK_CLIENT_ID ?? "athyper-admin";

    const { codeVerifier, codeChallenge, state } = generatePkceChallenge();

    let redis;
    try {
        redis = await getRedisClient();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
            { error: "REDIS_UNAVAILABLE", message: `Redis unavailable: ${msg}` },
            { status: 503 },
        );
    }

    try {
        await redis.set(
            `pkce_state:${state}`,
            JSON.stringify({ codeVerifier, workbench, returnUrl, isPlatformLogin: true, realm }),
            { EX: 300 },
        );

        await emitBffAudit(redis, AuthAuditEvent.LOGIN_INITIATED, {
            tenantId,
            ip: req.headers.get("x-forwarded-for") ?? "unknown",
            userAgent: req.headers.get("user-agent") ?? "unknown",
            realm,
            workbench,
            meta: { returnUrl },
        });
    } finally {
        await redis.quit();
    }

    const authUrl = buildAuthorizationUrl({
        baseUrl,
        realm,
        clientId,
        redirectUri,
        codeChallenge,
        state,
        prompt: "login",
    });

    return NextResponse.redirect(authUrl);
}
