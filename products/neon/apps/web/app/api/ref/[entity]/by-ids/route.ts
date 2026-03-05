/**
 * POST /api/ref/:entity/by-ids
 *
 * Hydrate selected reference IDs to display labels.
 * Used by reference picker components to show human-readable labels
 * for already-selected values (e.g., after page reload, chip rendering).
 *
 * Body: { ids: ["uuid1", "uuid2", ...] }
 * Returns: { data: { "uuid1": { id, label }, "uuid2": { id, label }, ... } }
 *
 * Limits: max 200 IDs per request.
 * Supports L2 Redis caching for allowlisted master data entities.
 */

export const runtime = "nodejs";

import { sql } from "kysely";

import type { ResolvedRef } from "@/lib/entity-projection";
import type { CacheMetrics } from "@/lib/redis-cache";

import {
    getApiContext,
    resolveTenantUuid,
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from "@/lib/api-context";
import { getDb, tableHasColumn } from "@/lib/db";
import { resolveEntityMeta, resolveEntityMetaByTable } from "@/lib/entity-meta";
import { resolveDisplayPolicy, buildDisplayLabel } from "@/lib/entity-display-policy";
import {
    createCacheMetrics,
    getNamespaceVersion,
    refKey,
    cacheMGet,
    cacheMSet,
    REDIS_TTL,
} from "@/lib/redis-cache";

// ============================================================================
// Constants
// ============================================================================

const MAX_IDS = 200;

// ============================================================================
// POST — Hydrate by IDs
// ============================================================================

export async function POST(
    req: Request,
    { params }: { params: Promise<{ entity: string }> },
) {
    const { entity } = await params;
    const db = getDb();
    if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

    let redis: { quit: () => Promise<void> } | null = null;
    try {
        const apiCtx = await getApiContext();
        redis = apiCtx.redis;
        const { context } = apiCtx;
        if (!context) return unauthorizedResponse();

        const tenantUuid = await resolveTenantUuid(db, context.tenantId);

        // ── Resolve entity metadata ──
        const meta = await resolveEntityMeta(db, entity, tenantUuid);
        if (!meta) return errorResponse("NOT_FOUND", `Entity "${entity}" not found`, 404);

        const { tableSchema, tableName } = meta;
        const fullTable = `${tableSchema}.${tableName}`;

        // ── Parse body ──
        const body = (await req.json()) as { ids?: string[] };
        if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
            return errorResponse("INVALID_BODY", "Expected { ids: [\"uuid1\", \"uuid2\", ...] }", 400);
        }

        const ids = body.ids.slice(0, MAX_IDS);
        const metrics = createCacheMetrics();

        // ── Resolve display policy ──
        const policy = await resolveDisplayPolicy(db, tableSchema, tableName, meta.featureFlags, metrics);

        // ── Check label caching eligibility ──
        const cacheLabels = (meta.featureFlags as any)?.ui?.cacheRefLabels === true;

        let ns = 0;
        try { ns = await getNamespaceVersion(); } catch { metrics.redis_errors++; }

        // ── Try Redis cache first ──
        let cachedLabels = new Map<string, ResolvedRef>();
        let uncachedIds = ids;

        if (cacheLabels) {
            try {
                const redisKeys = ids.map((id) => refKey(ns, tenantUuid, tableSchema, tableName, id));
                cachedLabels = await cacheMGet<ResolvedRef>(redisKeys);

                const hitIds = new Set<string>();
                for (const [, resolved] of cachedLabels) {
                    hitIds.add(resolved.id);
                }
                uncachedIds = ids.filter((id) => !hitIds.has(id));

                if (!metrics.ref) metrics.ref = { hits: 0, misses: 0 };
                metrics.ref.hits += hitIds.size;
                metrics.ref.misses += uncachedIds.length;
            } catch {
                metrics.redis_errors++;
                uncachedIds = ids;
            }
        }

        // ── Build result from cache ──
        const result: Record<string, ResolvedRef> = {};
        for (const [, resolved] of cachedLabels) {
            result[resolved.id] = resolved;
        }

        // ── Query DB for uncached IDs ──
        if (uncachedIds.length > 0) {
            if (policy.resolvedColumns.length === 0) {
                // No display columns — use PK as label
                for (const id of uncachedIds) {
                    result[id] = { id, label: id };
                }
            } else {
                const hasTenant = await tableHasColumn(db, tableSchema, tableName, "tenant_id");
                const tenantClause = hasTenant ? sql`AND tenant_id = ${tenantUuid}` : sql``;

                const selectCols = [...new Set([policy.primaryKey, ...policy.resolvedColumns])];
                const selectExpr = sql.join(selectCols.map((c) => sql.ref(c)));

                const rows = await sql<Record<string, unknown>>`
                    SELECT ${selectExpr}
                    FROM ${sql.table(fullTable)}
                    WHERE ${sql.ref(policy.primaryKey)} = ANY(${uncachedIds}::uuid[])
                      ${tenantClause}
                `.execute(db);

                const writeBackEntries: Array<{ key: string; value: unknown; ttl: number }> = [];

                for (const row of rows.rows) {
                    const id = String(row[policy.primaryKey]);
                    const label = buildDisplayLabel(policy, row) || id;
                    const resolved: ResolvedRef = { id, label };
                    result[id] = resolved;

                    if (cacheLabels) {
                        writeBackEntries.push({
                            key: refKey(ns, tenantUuid, tableSchema, tableName, id),
                            value: resolved,
                            ttl: REDIS_TTL.refLabel,
                        });
                    }
                }

                // Write back to Redis (fire-and-forget)
                if (writeBackEntries.length > 0) {
                    void cacheMSet(writeBackEntries).catch(() => { metrics.redis_errors++; });
                }
            }
        }

        // ── Observability ──
        console.info(JSON.stringify({
            event: "ref_hydrate",
            route: `ref/${entity}/by-ids`,
            ids_requested: ids.length,
            ids_resolved: Object.keys(result).length,
            cache: {
                ref: metrics.ref,
                redis_errors: metrics.redis_errors,
            },
        }));

        return successResponse(result);
    } catch (error) {
        console.error("[POST /api/ref/entity/by-ids] Error:", error);
        return errorResponse("INTERNAL_ERROR", "Failed to hydrate references");
    } finally {
        await redis?.quit();
    }
}
