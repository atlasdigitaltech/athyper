import { AuthAuditEvent, emitBffAudit, hashSidForAudit } from "@neon/auth/audit";
import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

async function getRedisClient() {
    const { createClient } = await import("redis");
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    const client = createClient({ url });
    if (!client.isOpen) await client.connect();
    return client;
}

interface HealthCheck {
    status: "ok" | "degraded" | "down" | "not_configured";
    latencyMs?: number;
    error?: string;
    [key: string]: unknown;
}

/**
 * GET /api/admin/health
 *
 * Live infrastructure health checks: Redis, Keycloak, API Mesh.
 * Returns individual and overall status.
 */
export async function GET() {
    const sid = await getSessionId();
    if (!sid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
    const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "http://keycloak.local";
    const realm = process.env.KEYCLOAK_REALM ?? "neon-dev";
    const runtimeApiUrl = process.env.RUNTIME_API_URL;

    let redis;
    try {
        redis = await getRedisClient();
    } catch (err) {
        return NextResponse.json({
            overall: "down",
            checks: {
                redis: { status: "down" as const, error: String(err) },
                keycloak: { status: "not_configured" as const },
                apiMesh: { status: "not_configured" as const },
            },
            timestamp: new Date().toISOString(),
        });
    }

    try {
        const raw = await redis.get(`sess:${tenantId}:${sid}`);
        if (!raw) {
            return NextResponse.json({ error: "Session not found" }, { status: 401 });
        }

        const session = JSON.parse(raw);

        // Run all health checks in parallel
        const [redisResult, keycloakResult, apiMeshResult] = await Promise.allSettled([
            checkRedis(redis, tenantId, sid),
            checkKeycloak(baseUrl, realm),
            checkApiMesh(runtimeApiUrl),
        ]);

        const redisHealth = redisResult.status === "fulfilled"
            ? redisResult.value
            : { status: "down" as const, error: String((redisResult as PromiseRejectedResult).reason) };

        const keycloakHealth = keycloakResult.status === "fulfilled"
            ? keycloakResult.value
            : { status: "down" as const, error: String((keycloakResult as PromiseRejectedResult).reason) };

        const apiMeshHealth = apiMeshResult.status === "fulfilled"
            ? apiMeshResult.value
            : { status: "down" as const, error: String((apiMeshResult as PromiseRejectedResult).reason) };

        // Compute overall status
        const statuses = [redisHealth.status, keycloakHealth.status].filter(s => s !== "not_configured");
        let overall: "ok" | "degraded" | "down" = "ok";
        if (statuses.includes("down")) overall = "down";
        else if (statuses.includes("degraded")) overall = "degraded";

        // Audit
        await emitBffAudit(redis, AuthAuditEvent.DIAG_HEALTH_CHECK, {
            tenantId,
            userId: session.userId,
            sidHash: hashSidForAudit(sid),
            meta: { overall },
        });

        return NextResponse.json({
            overall,
            checks: {
                redis: redisHealth,
                keycloak: keycloakHealth,
                apiMesh: apiMeshHealth,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        return NextResponse.json(
            { error: "Health check failed", message: String(err) },
            { status: 500 },
        );
    } finally {
        await redis.quit();
    }
}

async function checkRedis(
    redis: Awaited<ReturnType<typeof getRedisClient>>,
    tenantId: string,
    sid: string,
): Promise<HealthCheck> {
    const start = performance.now();
    const pong = await redis.ping();
    const latencyMs = Math.round(performance.now() - start);

    if (pong !== "PONG") {
        return { status: "degraded", latencyMs, error: `Unexpected PING response: ${pong}` };
    }

    // Check session TTL
    const sessionTtl = await redis.ttl(`sess:${tenantId}:${sid}`);

    return {
        status: latencyMs > 100 ? "degraded" : "ok",
        latencyMs,
        sessionTtl,
    };
}

async function checkKeycloak(baseUrl: string, realm: string): Promise<HealthCheck> {
    const certsUrl = `${baseUrl}/realms/${realm}/protocol/openid-connect/certs`;
    const start = performance.now();

    try {
        const res = await fetch(certsUrl, {
            signal: AbortSignal.timeout(3000),
        });
        const latencyMs = Math.round(performance.now() - start);

        if (!res.ok) {
            return { status: "down", latencyMs, error: `JWKS endpoint returned ${res.status}` };
        }

        const data = (await res.json()) as { keys?: unknown[] };
        const keyCount = Array.isArray(data.keys) ? data.keys.length : 0;

        return {
            status: latencyMs > 2000 ? "degraded" : "ok",
            latencyMs,
            keyCount,
        };
    } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        return { status: "down", latencyMs, error: String(err) };
    }
}

async function checkApiMesh(runtimeApiUrl: string | undefined): Promise<HealthCheck> {
    if (!runtimeApiUrl) {
        return { status: "not_configured" };
    }

    const healthUrl = `${runtimeApiUrl}/health`;
    const start = performance.now();

    try {
        const res = await fetch(healthUrl, {
            signal: AbortSignal.timeout(3000),
        });
        const latencyMs = Math.round(performance.now() - start);

        return {
            status: res.ok ? "ok" : "degraded",
            latencyMs,
            httpStatus: res.status,
        };
    } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        return { status: "down", latencyMs, error: String(err) };
    }
}
