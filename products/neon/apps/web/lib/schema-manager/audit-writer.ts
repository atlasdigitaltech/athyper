import "server-only";

import { createClient } from "redis";

import type { MeshAuditEventType, MeshAuditRecord } from "./audit";

// ─── Redis Client ─────────────────────────────────────────────

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedis() {
    if (redisClient && redisClient.isOpen) return redisClient;
    const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
    redisClient = createClient({ url });
    redisClient.on("error", () => { /* swallow — audit is best-effort */ });
    await redisClient.connect();
    return redisClient;
}

// ─── Audit Cap ────────────────────────────────────────────────

const MAX_AUDIT_ENTRIES = 10_000;

// ─── Writer ───────────────────────────────────────────────────

/**
 * Write a mesh audit record to Redis.
 *
 * Storage strategy:
 *   - Key: `audit:mesh:{tenantId}` (Redis LIST, capped via LTRIM)
 *   - Records are JSON-serialized and LPUSH'd for FIFO drain
 *
 * This is best-effort — audit failures must never break admin flows.
 * If Redis is unavailable the record is silently dropped.
 */
async function writeMeshAudit(record: MeshAuditRecord): Promise<void> {
    try {
        const redis = await getRedis();
        const key = `audit:mesh:${record.tenantId}`;
        await redis.lPush(key, JSON.stringify(record));
        await redis.lTrim(key, 0, MAX_AUDIT_ENTRIES - 1);
    } catch {
        // Best-effort — never let audit failures break admin flows
    }
}

/**
 * Convenience: build and write an audit record in one call.
 */
export async function emitMeshAudit(
    event: MeshAuditEventType,
    details: Omit<MeshAuditRecord, "ts" | "event">,
): Promise<void> {
    await writeMeshAudit({
        ts: new Date().toISOString(),
        event,
        ...details,
    });
}

/**
 * Read mesh audit entries for a given tenant and optional entity filter.
 * Returns most recent entries first.
 */
export async function readMeshAudit(
    tenantId: string,
    options?: { entityName?: string; limit?: number; offset?: number },
): Promise<MeshAuditRecord[]> {
    try {
        const redis = await getRedis();
        const key = `audit:mesh:${tenantId}`;
        const limit = options?.limit ?? 50;
        const offset = options?.offset ?? 0;

        // Read a larger window to account for filtering
        const fetchCount = options?.entityName ? limit * 4 : limit;
        const raw = await redis.lRange(key, offset, offset + fetchCount - 1);

        let records = raw.map((r) => JSON.parse(r) as MeshAuditRecord);

        if (options?.entityName) {
            records = records.filter((r) => r.entityName === options.entityName);
        }

        return records.slice(0, limit);
    } catch {
        return [];
    }
}
