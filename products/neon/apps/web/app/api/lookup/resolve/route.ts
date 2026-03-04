/**
 * POST /api/lookup/resolve
 *
 * Batch-resolves foreign key UUIDs to human-readable display labels.
 * Uses the display policy resolver for configurable label formatting.
 * L2 Redis cache for allowlisted master data entities (cacheRefLabels).
 *
 * Body: { refs: [{ schema: "fin", table: "operating_unit", ids: ["uuid1", "uuid2"] }] }
 * Returns: { data: { "fin.operating_unit": { "uuid1": { id: "uuid1", label: "LE-CA - Demo Canada Inc" }, ... } } }
 */

export const runtime = "nodejs";

import { sql } from "kysely";

import type { ResolvedRef } from "@/lib/entity-projection";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb, tableHasColumn } from "@/lib/db";
import {
  resolveDisplayPolicy,
  buildDisplayLabel,
} from "@/lib/entity-display-policy";
import { resolveEntityMetaByTable } from "@/lib/entity-meta";
import {
  createCacheMetrics,
  getNamespaceVersion,
  refKey,
  cacheMGet,
  cacheMSet,
  REDIS_TTL,
} from "@/lib/redis-cache";

interface RefGroup {
  schema: string;
  table: string;
  ids: string[];
}

export async function POST(req: Request) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;

    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const body = (await req.json()) as { refs?: RefGroup[] };

    if (!body.refs || !Array.isArray(body.refs)) {
      return errorResponse(
        "INVALID_BODY",
        "Expected { refs: [{ schema, table, ids }] }",
        400,
      );
    }

    const startTime = Date.now();
    let totalIds = 0;
    const metrics = createCacheMetrics();

    // Per-request allowlist cache
    const allowCache = new Map<string, boolean>();
    async function shouldCacheLabels(
      schema: string,
      table: string,
    ): Promise<boolean> {
      const key = `${schema}.${table}`;
      if (allowCache.has(key)) return allowCache.get(key)!;
      const targetMeta = await resolveEntityMetaByTable(
        db!,
        schema,
        table,
        tenantUuid,
      );
      const allowed =
        (targetMeta?.featureFlags as any)?.ui?.cacheRefLabels === true;
      allowCache.set(key, allowed);
      return allowed;
    }

    // Get namespace version once for this request
    let ns = 0;
    try {
      ns = await getNamespaceVersion();
    } catch {
      metrics.redis_errors++;
    }

    const results: Record<string, Record<string, ResolvedRef>> = {};

    for (const ref of body.refs) {
      if (
        !ref.schema ||
        !ref.table ||
        !Array.isArray(ref.ids) ||
        ref.ids.length === 0
      ) {
        continue;
      }

      // Cap batch size to prevent abuse
      const ids = ref.ids.slice(0, 100);
      totalIds += ids.length;
      const fullTable = `${ref.schema}.${ref.table}`;

      // Resolve display policy for this target table
      const policy = await resolveDisplayPolicy(
        db,
        ref.schema,
        ref.table,
        undefined,
        metrics,
      );

      if (policy.resolvedColumns.length === 0) {
        // No display columns found — use primary key as label
        const map: Record<string, ResolvedRef> = {};
        for (const id of ids) {
          map[id] = { id, label: id };
        }
        results[fullTable] = map;
        continue;
      }

      // ── FK label Redis cache (only for allowlisted master data entities) ──
      const cacheLabels = await shouldCacheLabels(ref.schema, ref.table);
      let cachedLabels = new Map<string, ResolvedRef>();
      let uncachedIds = ids;

      if (cacheLabels) {
        try {
          const redisKeys = ids.map((id) =>
            refKey(ns, tenantUuid, ref.schema, ref.table, id),
          );
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

      // Populate refs from cache hits
      const map: Record<string, ResolvedRef> = {};
      for (const [, resolved] of cachedLabels) {
        map[resolved.id] = resolved;
      }

      // Query DB only for uncached IDs
      if (uncachedIds.length > 0) {
        const hasTenant = await tableHasColumn(
          db,
          ref.schema,
          ref.table,
          "tenant_id",
        );
        const tenantClause = hasTenant
          ? sql`AND tenant_id = ${tenantUuid}`
          : sql``;

        const selectCols = [...new Set(["id", ...policy.resolvedColumns])];
        const selectExpr = sql.join(selectCols.map((c) => sql.ref(c)));

        const rows = await sql<Record<string, unknown>>`
                    SELECT ${selectExpr}
                    FROM ${sql.table(fullTable)}
                    WHERE id = ANY(${uncachedIds}::uuid[])
                      ${tenantClause}
                `.execute(db);

        const writeBackEntries: Array<{
          key: string;
          value: unknown;
          ttl: number;
        }> = [];
        for (const row of rows.rows) {
          const id = String(row.id);
          const label = buildDisplayLabel(policy, row);
          const resolved: ResolvedRef = { id, label: label || id };
          map[id] = resolved;

          if (cacheLabels) {
            writeBackEntries.push({
              key: refKey(ns, tenantUuid, ref.schema, ref.table, id),
              value: resolved,
              ttl: REDIS_TTL.refLabel,
            });
          }
        }

        if (writeBackEntries.length > 0) {
          void cacheMSet(writeBackEntries).catch(() => {
            metrics.redis_errors++;
          });
        }
      }

      results[fullTable] = map;
    }

    // Observability
    const durationMs = Date.now() - startTime;
    console.info(
      JSON.stringify({
        event: "fk_resolve",
        route: "lookup/resolve",
        ids_total: totalIds,
        queries_total: body.refs.length,
        duration_ms: durationMs,
        cache: {
          dp: metrics.dp,
          ref: metrics.ref,
          redis_errors: metrics.redis_errors,
        },
      }),
    );

    return successResponse(results);
  } catch (error) {
    console.error("[POST /api/lookup/resolve] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to resolve references");
  } finally {
    await redis?.quit();
  }
}
