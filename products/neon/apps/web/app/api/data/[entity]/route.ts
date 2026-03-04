/**
 * GET  /api/data/:entity       — List entity records (paginated)
 * POST /api/data/:entity       — Create a new entity record
 *
 * Queries the real database via meta.entity table resolution.
 * Falls back to mock data when DATABASE_URL is not set.
 *
 * GET includes server-side FK resolution: refs cache in response envelope
 * with configurable caps and timeout budget.
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import { NextResponse } from "next/server";

import type { RefsCache, ResolvedRef } from "@/lib/entity-projection";
import type { CacheMetrics } from "@/lib/redis-cache";
import type { NextRequest } from "next/server";

import { getEntityDataParams } from "@/config/entity-data-params";
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
import { resolveEntityMeta, resolveEntityMetaByTable } from "@/lib/entity-meta";
import { resolveFieldsWithFKs } from "@/lib/entity-meta-fields";
import { FK_RESOLUTION_LIMITS } from "@/lib/entity-projection";
import {
  parseFilters,
  buildFilterClauses,
  buildSearchClause,
  buildSortClause,
  hashQueryParams,
  hashFilterParams,
} from "@/lib/entity-query-builder";
import { ENTITY_DATA_REGISTRY } from "@/lib/mock-data/entities";
import {
  getEntityGeneration,
  invalidateEntityQueryCache,
} from "@/lib/query-cache-invalidation";
import {
  createCacheMetrics,
  getNamespaceVersion,
  queryResultKey,
  refKey,
  cacheGet,
  cacheSet,
  cacheMGet,
  cacheMSet,
  REDIS_TTL,
} from "@/lib/redis-cache";

// ============================================================================
// GET — List Records
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  const db = getDb();

  // ── Fallback to mock data ──
  if (!db) {
    const entityData = ENTITY_DATA_REGISTRY[entity];
    return NextResponse.json({
      data: entityData?.list ?? [],
      total: entityData?.list.length ?? 0,
    });
  }

  // ── Real DB query ──
  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const t0 = performance.now();
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;

    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const meta = await resolveEntityMeta(db, entity, tenantUuid);
    if (!meta) {
      return errorResponse("NOT_FOUND", `Entity not found: ${entity}`, 404);
    }

    // Parse query params
    const edp = getEntityDataParams();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      edp.pagination.maxPageSize,
      Math.max(
        1,
        parseInt(
          url.searchParams.get("pageSize") ??
            String(edp.pagination.defaultPageSize),
          10,
        ),
      ),
    );
    const offset = (page - 1) * pageSize;

    // Server-side search / filter / sort params
    const searchQuery = url.searchParams.get("search") ?? "";
    const filtersRaw = url.searchParams.get("filters") ?? "";
    const sortColumn = url.searchParams.get("sort") ?? "";
    const sortDir =
      (url.searchParams.get("dir") ?? "desc").toLowerCase() === "asc"
        ? ("asc" as const)
        : ("desc" as const);
    // Visible columns — used to limit FK resolution to only visible FK columns
    const visibleColumns =
      url.searchParams.get("columns")?.split(",").filter(Boolean) ?? null;

    const fullTableName = `${meta.tableSchema}.${meta.tableName}`;
    const hasTenantId = await tableHasColumn(
      db,
      meta.tableSchema,
      meta.tableName,
      "tenant_id",
    );
    const hasSoftDelete = await tableHasColumn(
      db,
      meta.tableSchema,
      meta.tableName,
      "deleted_at",
    );
    const tenantFilter = hasTenantId
      ? sql`tenant_id = ${tenantUuid}`
      : sql`1=1`;
    const softDeleteClause = hasSoftDelete
      ? sql`AND deleted_at IS NULL`
      : sql``;

    const metrics = createCacheMetrics();

    // ── Resolve field metadata (needed for clause building + FK resolution) ──
    const fields = await resolveFieldsWithFKs(
      db,
      meta.entityName,
      tenantUuid,
      meta.tableSchema,
      meta.tableName,
      metrics,
    );

    // ── Build server-side WHERE + ORDER BY clauses ──
    const parsedFilters = parseFilters(filtersRaw);
    const filterClauses = buildFilterClauses(parsedFilters, fields);
    const searchClause = buildSearchClause(searchQuery, fields);
    const sortClause = buildSortClause(sortColumn, sortDir, fields);

    const extraClauses = [...filterClauses];
    if (searchClause) extraClauses.push(searchClause);
    const extraWhere =
      extraClauses.length > 0
        ? sql`AND ${sql.join(extraClauses, sql` AND `)}`
        : sql``;

    const hasServerFilters = extraClauses.length > 0;
    const hasServerSort =
      !!sortColumn && fields.some((f) => f.columnName === sortColumn);

    // ── Entity-aware cache TTL ──
    const cacheCategory =
      (meta.featureFlags as any)?.cacheCategory ?? "transactional";
    const categoryTtl =
      (edp.queryCache.categoryTtls as Record<string, number>)[cacheCategory] ??
      edp.queryCache.ttlSeconds;
    const softTtlMs = categoryTtl * 1000 * edp.queryCache.swrRatio;

    // ── Redis query result cache ──
    const tCache0 = performance.now();
    const ns = await getNamespaceVersion().catch(() => 0);
    const gen = await getEntityGeneration(tenantUuid, entity);
    const qHash = hashQueryParams({
      search: searchQuery,
      filters: filtersRaw,
      sort: sortColumn,
      dir: sortDir,
      page,
      pageSize,
    });
    const fHash = hashFilterParams({
      search: searchQuery,
      filters: filtersRaw,
    });
    const qrKey = queryResultKey(ns, tenantUuid, entity, gen, qHash);

    if (edp.queryCache.enabled) {
      try {
        const cached = await cacheGet<{
          data: Record<string, unknown>[];
          total: number;
          refsPartial?: boolean;
          _cachedAt?: number;
        }>(qrKey);
        if (cached) {
          const tCacheHit = (performance.now() - tCache0).toFixed(1);
          const tTotal = (performance.now() - t0).toFixed(1);
          const cachedTotal = cached.total;
          const cachedTotalPages = Math.max(
            1,
            Math.ceil(cachedTotal / pageSize),
          );

          // SWR: if past soft TTL, serve stale then trigger background recompute
          const age = cached._cachedAt ? Date.now() - cached._cachedAt : 0;
          const isStale = age > softTtlMs;

          const response = successResponse(
            {
              data: cached.data,
              meta: {
                page,
                pageSize,
                total: cachedTotal,
                totalPages: cachedTotalPages,
                hasNext: page < cachedTotalPages,
                hasPrev: page > 1,
                serverFiltered: hasServerFilters,
                serverSorted: hasServerSort,
                ...(cached.refsPartial ? { refsPartial: true } : {}),
              },
            },
            200,
            {
              "Server-Timing": `cache;dur=${tCacheHit};desc="${isStale ? "stale" : "hit"}", total;dur=${tTotal}`,
            },
          );

          if (isStale) {
            // Fire-and-forget background recompute — refreshes cache for next request
            void recomputeAndCache(
              db,
              sql,
              fullTableName,
              tenantFilter,
              softDeleteClause,
              extraWhere,
              sortClause,
              pageSize,
              offset,
              entity,
              meta.entityName,
              tenantUuid,
              meta.tableSchema,
              meta.tableName,
              qrKey,
              categoryTtl,
              metrics,
              hasServerFilters,
              visibleColumns,
            ).catch((err) => console.warn("[SWR recompute] error:", err));
          }

          return response;
        }
      } catch {
        metrics.redis_errors++;
      }
    }
    const tCacheDur = (performance.now() - tCache0).toFixed(1);

    // ── Count (with filters) ──
    const tSql0 = performance.now();
    const countResult = await sql`
            SELECT COUNT(*) as count
            FROM ${sql.table(fullTableName)}
            WHERE ${tenantFilter}
              ${softDeleteClause}
              ${extraWhere}
        `.execute(db);
    const total = Number((countResult.rows[0] as any)?.count ?? 0);

    // Diagnostic: log when 0 records found to help debugging
    if (total === 0 && hasTenantId && !hasServerFilters) {
      const allCountResult = await sql`
                SELECT COUNT(*) as count FROM ${sql.table(fullTableName)}
            `.execute(db);
      const allTotal = Number((allCountResult.rows[0] as any)?.count ?? 0);
      console.warn(
        `[GET /api/data/${entity}] 0 records for tenant ${tenantUuid} in ${fullTableName}. ` +
          `Table has ${allTotal} total rows (all tenants). ` +
          `Entity resolved: ${meta.entityName} → ${fullTableName}`,
      );
    }

    // ── Fetch paginated records (with filters + sort) ──
    const dataResult = await sql`
            SELECT *
            FROM ${sql.table(fullTableName)}
            WHERE ${tenantFilter}
              ${softDeleteClause}
              ${extraWhere}
            ORDER BY ${sortClause}
            LIMIT ${pageSize}
            OFFSET ${offset}
        `.execute(db);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const tSqlDur = (performance.now() - tSql0).toFixed(1);

    // ── Server-side FK resolution (opt-out with ?resolveRefs=false) ──
    const tFk0 = performance.now();
    const resolveRefs = url.searchParams.get("resolveRefs") !== "false";
    let refs: RefsCache | undefined;
    let refsPartial = false;

    if (resolveRefs && dataResult.rows.length > 0) {
      const fkResult = await resolveRefsForRows(
        db,
        meta.entityName,
        tenantUuid,
        meta.tableSchema,
        meta.tableName,
        dataResult.rows as Record<string, unknown>[],
        metrics,
        visibleColumns,
      );
      refs = fkResult.refs;
      refsPartial = fkResult.partial;

      // Row decoration: inject _ref_<column> for convenience (collision-safe)
      if (refs && Object.keys(refs).length > 0) {
        decorateRowsWithRefs(
          dataResult.rows as Record<string, unknown>[],
          refs,
          fkResult.columnToTable,
        );
      }
    }

    const tFkDur = (performance.now() - tFk0).toFixed(1);

    // ── Cache fully-decorated result (fire-and-forget) ──
    if (edp.queryCache.enabled) {
      const payload = {
        data: dataResult.rows,
        total,
        _cachedAt: Date.now(),
        ...(refsPartial ? { refsPartial: true } : {}),
      };
      void cacheSet(qrKey, payload, categoryTtl).catch(() => {});
    }

    const tTotal = (performance.now() - t0).toFixed(1);
    return successResponse(
      {
        data: dataResult.rows,
        meta: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
          serverFiltered: hasServerFilters,
          serverSorted: hasServerSort,
          ...(refsPartial ? { refsPartial: true } : {}),
        },
        ...(refs && Object.keys(refs).length > 0 ? { refs } : {}),
      },
      200,
      {
        "Server-Timing": `cache;dur=${tCacheDur};desc="miss", sql;dur=${tSqlDur};desc="COUNT+SELECT", fk;dur=${tFkDur};desc="FK resolution", total;dur=${tTotal}`,
      },
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[GET /api/data/${entity}] Error:`, errMsg, error);
    // Fall back to mock data when DB/auth path fails
    const entityData = ENTITY_DATA_REGISTRY[entity];
    if (entityData) {
      return NextResponse.json({
        data: entityData.list,
        total: entityData.list.length,
      });
    }
    // Return empty result set with _debug so the page renders gracefully
    // but the developer can inspect the error in Network tab
    return NextResponse.json({
      data: [],
      total: 0,
      _debug:
        process.env.ENVIRONMENT === "local" ? { error: errMsg } : undefined,
    });
  } finally {
    await redis?.quit();
  }
}

// ============================================================================
// POST — Create Record
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
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
    const meta = await resolveEntityMeta(db, entity, tenantUuid);
    if (!meta) {
      return errorResponse("NOT_FOUND", `Entity not found: ${entity}`, 404);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const fullTableName = `${meta.tableSchema}.${meta.tableName}`;
    const hasTenantId = await tableHasColumn(
      db,
      meta.tableSchema,
      meta.tableName,
      "tenant_id",
    );

    // Build record with system fields
    const id = crypto.randomUUID();
    const now = new Date();
    const record: Record<string, unknown> = {
      id,
      ...body,
      version: 1,
      created_at: now,
      updated_at: now,
      created_by: context.userId,
      updated_by: context.userId,
    };
    if (hasTenantId) {
      record.tenant_id = tenantUuid;
    }

    // Remove client-supplied metadata fields
    delete record._version;

    const columns = Object.keys(record);
    const values = Object.values(record);

    const result = await sql`
            INSERT INTO ${sql.table(fullTableName)}
            (${sql.join(columns.map((c) => sql.ref(c)))})
            VALUES (${sql.join(values.map((v) => sql.val(v)))})
            RETURNING *
        `.execute(db);

    // Invalidate query result cache for this entity
    await invalidateEntityQueryCache(tenantUuid, entity);

    return successResponse(result.rows[0], 201);
  } catch (error) {
    console.error(`[POST /api/data/${entity}] Error:`, error);
    return errorResponse("INTERNAL_ERROR", "Failed to create record");
  } finally {
    await redis?.quit();
  }
}

// ============================================================================
// Server-Side FK Resolution
// ============================================================================

interface FkResolutionResult {
  refs: RefsCache;
  partial: boolean;
  /** Maps columnName → "schema.table" for row decoration */
  columnToTable: Map<string, string>;
}

/**
 * Resolves FK references for paginated rows.
 *
 * FK detection priority:
 *   1. lookupConfig (explicit) — authoritative
 *   2. DB constraints (fallback) — only for columns without lookupConfig
 *
 * Caps: 200/column, 600/request, 250ms timeout
 */
async function resolveRefsForRows(
  db: any,
  entityName: string,
  tenantId: string,
  tableSchema: string,
  tableName: string,
  rows: Record<string, unknown>[],
  metrics: CacheMetrics,
  visibleColumns: string[] | null,
): Promise<FkResolutionResult> {
  const startTime = Date.now();
  const refs: RefsCache = {};
  let partial = false;
  const columnToTable = new Map<string, string>();

  // Per-request allowlist cache — avoids repeated DB calls for the same target entity
  const allowCache = new Map<string, boolean>();
  async function shouldCacheLabels(
    schema: string,
    table: string,
  ): Promise<boolean> {
    const key = `${schema}.${table}`;
    if (allowCache.has(key)) return allowCache.get(key)!;
    const targetMeta = await resolveEntityMetaByTable(
      db,
      schema,
      table,
      tenantId,
    );
    const allowed =
      (targetMeta?.featureFlags as any)?.ui?.cacheRefLabels === true;
    allowCache.set(key, allowed);
    return allowed;
  }

  try {
    // Get field metadata with FK enrichment
    const fields = await resolveFieldsWithFKs(
      db,
      entityName,
      tenantId,
      tableSchema,
      tableName,
      metrics,
    );

    // Collect FK columns and their target tables
    // When visibleColumns is provided, only resolve FKs for visible columns
    const visibleSet = visibleColumns ? new Set(visibleColumns) : null;
    const fkColumns: Array<{
      column: string;
      refSchema: string;
      refTable: string;
    }> = [];
    for (const field of fields) {
      const lc = field.lookupConfig as {
        refSchema?: string;
        refTable?: string;
      } | null;
      if (!lc?.refSchema || !lc?.refTable) continue;
      // Skip FK columns that aren't in the visible set
      if (visibleSet && !visibleSet.has(field.columnName)) continue;
      fkColumns.push({
        column: field.columnName,
        refSchema: lc.refSchema,
        refTable: lc.refTable,
      });
    }

    if (fkColumns.length === 0) {
      return { refs, partial: false, columnToTable };
    }

    // Collect unique UUIDs per FK column
    let totalIds = 0;
    const columnUuids = new Map<
      string,
      { ids: Set<string>; refSchema: string; refTable: string }
    >();

    for (const fk of fkColumns) {
      const ids = new Set<string>();
      for (const row of rows) {
        const val = row[fk.column];
        if (val && typeof val === "string") {
          ids.add(val);
        }
      }

      if (ids.size === 0) continue;

      // Per-column cap
      if (ids.size > FK_RESOLUTION_LIMITS.perColumnCap) {
        partial = true;
        continue;
      }

      // Per-request cap
      if (totalIds + ids.size > FK_RESOLUTION_LIMITS.perRequestCap) {
        partial = true;
        continue;
      }

      totalIds += ids.size;
      columnUuids.set(fk.column, {
        ids,
        refSchema: fk.refSchema,
        refTable: fk.refTable,
      });
      columnToTable.set(fk.column, `${fk.refSchema}.${fk.refTable}`);
    }

    // Group by target table to batch queries
    const tableGroups = new Map<
      string,
      { schema: string; table: string; ids: Set<string> }
    >();
    for (const [, info] of columnUuids) {
      const key = `${info.refSchema}.${info.refTable}`;
      const existing = tableGroups.get(key);
      if (existing) {
        for (const id of info.ids) existing.ids.add(id);
      } else {
        tableGroups.set(key, {
          schema: info.refSchema,
          table: info.refTable,
          ids: new Set(info.ids),
        });
      }
    }

    // Get namespace version once for this request
    let ns = 0;
    try {
      ns = await getNamespaceVersion();
    } catch {
      metrics.redis_errors++;
    }

    // Resolve each target table
    for (const [tableKey, group] of tableGroups) {
      // Timeout check
      if (Date.now() - startTime > FK_RESOLUTION_LIMITS.timeoutMs) {
        partial = true;
        break;
      }

      const policy = await resolveDisplayPolicy(
        db,
        group.schema,
        group.table,
        undefined,
        metrics,
      );
      const idsArray = [...group.ids];
      const pk = policy.primaryKey;

      // Skip tables with composite PKs — single-column FK can't address them
      if (policy.isCompositePk) {
        const map: Record<string, ResolvedRef> = {};
        for (const id of idsArray) {
          map[id] = { id, label: id };
        }
        refs[tableKey] = map;
        continue;
      }

      if (policy.resolvedColumns.length === 0) {
        // No display columns — use raw value as label
        const map: Record<string, ResolvedRef> = {};
        for (const id of idsArray) {
          map[id] = { id, label: id };
        }
        refs[tableKey] = map;
        continue;
      }

      // ── FK label Redis cache (only for allowlisted master data entities) ──
      const cacheLabels = await shouldCacheLabels(group.schema, group.table);
      let cachedLabels = new Map<string, ResolvedRef>();
      let uncachedIds = idsArray;

      if (cacheLabels) {
        try {
          const redisKeys = idsArray.map((id) =>
            refKey(ns, tenantId, group.schema, group.table, id),
          );
          cachedLabels = await cacheMGet<ResolvedRef>(redisKeys);

          // Separate hits from misses
          const hitIds = new Set<string>();
          for (const [rKey, resolved] of cachedLabels) {
            hitIds.add(resolved.id);
          }
          uncachedIds = idsArray.filter((id) => !hitIds.has(id));

          if (!metrics.ref) metrics.ref = { hits: 0, misses: 0 };
          metrics.ref.hits += hitIds.size;
          metrics.ref.misses += uncachedIds.length;
        } catch {
          metrics.redis_errors++;
          uncachedIds = idsArray;
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
          group.schema,
          group.table,
          "tenant_id",
        );
        const selectCols = [...new Set([pk, ...policy.resolvedColumns])];
        const selectExpr = sql.join(selectCols.map((c: string) => sql.ref(c)));
        const tenantClause = hasTenant
          ? sql`AND tenant_id = ${tenantId}`
          : sql``;
        // Use text[] cast for non-UUID PKs (e.g. text code columns)
        const isUuidPk = pk === "id";
        const castSuffix = isUuidPk ? sql`::uuid[]` : sql`::text[]`;

        const result = await sql<Record<string, unknown>>`
                    SELECT ${selectExpr}
                    FROM ${sql.table(`${group.schema}.${group.table}`)}
                    WHERE ${sql.ref(pk)} = ANY(${uncachedIds}${castSuffix})
                      ${tenantClause}
                `.execute(db);

        // Build labels and collect entries for Redis write-back
        const writeBackEntries: Array<{
          key: string;
          value: unknown;
          ttl: number;
        }> = [];
        for (const row of result.rows) {
          const id = String(row[pk]);
          const label = buildDisplayLabel(policy, row);
          const resolved: ResolvedRef = { id, label: label || id };
          map[id] = resolved;

          if (cacheLabels) {
            writeBackEntries.push({
              key: refKey(ns, tenantId, group.schema, group.table, id),
              value: resolved,
              ttl: REDIS_TTL.refLabel,
            });
          }
        }

        // Batch write resolved labels to Redis (fire-and-forget)
        if (writeBackEntries.length > 0) {
          void cacheMSet(writeBackEntries).catch(() => {
            metrics.redis_errors++;
          });
        }
      }

      refs[tableKey] = map;
    }

    // Observability
    const durationMs = Date.now() - startTime;
    console.info(
      JSON.stringify({
        event: "fk_resolve",
        entity: entityName,
        ids_total: totalIds,
        queries_total: tableGroups.size,
        duration_ms: durationMs,
        capped: partial,
        refs_partial: partial,
        cache: {
          dp: metrics.dp,
          fields: metrics.fields,
          fkmap: metrics.fkmap,
          cols: metrics.cols,
          ref: metrics.ref,
          redis_errors: metrics.redis_errors,
          payload_bytes: metrics.payload_bytes,
        },
      }),
    );
  } catch (err) {
    // Best-effort: return whatever refs we have
    console.warn(
      `[resolveRefsForRows] Error during FK resolution for ${entityName}:`,
      err,
    );
    partial = true;
  }

  return { refs, partial, columnToTable };
}

/**
 * SWR background recompute: re-executes the query and updates Redis cache.
 * Called fire-and-forget when a cache hit is stale (past soft TTL).
 */
async function recomputeAndCache(
  db: any,
  sqlTag: typeof sql,
  fullTableName: string,
  tenantFilter: ReturnType<typeof sql>,
  softDeleteClause: ReturnType<typeof sql>,
  extraWhere: ReturnType<typeof sql>,
  sortClause: ReturnType<typeof sql>,
  pageSize: number,
  offset: number,
  entity: string,
  entityName: string,
  tenantUuid: string,
  tableSchema: string,
  tableName: string,
  qrKey: string,
  ttlSeconds: number,
  metrics: CacheMetrics,
  hasServerFilters: boolean,
  visibleColumns: string[] | null,
): Promise<void> {
  const countResult = await sqlTag`
        SELECT COUNT(*) as count
        FROM ${sqlTag.table(fullTableName)}
        WHERE ${tenantFilter} ${softDeleteClause} ${extraWhere}
    `.execute(db);
  const total = Number((countResult.rows[0] as any)?.count ?? 0);

  const dataResult = await sqlTag`
        SELECT *
        FROM ${sqlTag.table(fullTableName)}
        WHERE ${tenantFilter} ${softDeleteClause} ${extraWhere}
        ORDER BY ${sortClause}
        LIMIT ${pageSize} OFFSET ${offset}
    `.execute(db);

  // FK resolution
  let refsPartial = false;
  if (dataResult.rows.length > 0) {
    const fkResult = await resolveRefsForRows(
      db,
      entityName,
      tenantUuid,
      tableSchema,
      tableName,
      dataResult.rows as Record<string, unknown>[],
      metrics,
      visibleColumns,
    );
    refsPartial = fkResult.partial;
    if (fkResult.refs && Object.keys(fkResult.refs).length > 0) {
      decorateRowsWithRefs(
        dataResult.rows as Record<string, unknown>[],
        fkResult.refs,
        fkResult.columnToTable,
      );
    }
  }

  const payload = {
    data: dataResult.rows,
    total,
    _cachedAt: Date.now(),
    ...(refsPartial ? { refsPartial: true } : {}),
  };
  await cacheSet(qrKey, payload, ttlSeconds);
}

/**
 * Inject _ref_<column> into each row from the refs cache.
 * Collision-safe: only inject if the key doesn't already exist in the row.
 */
function decorateRowsWithRefs(
  rows: Record<string, unknown>[],
  refs: RefsCache,
  columnToTable: Map<string, string>,
): void {
  for (const row of rows) {
    for (const [column, tableKey] of columnToTable) {
      const refKey = `_ref_${column}`;
      // Collision protection: never overwrite existing columns
      if (refKey in row) continue;

      const val = row[column];
      if (!val || typeof val !== "string") continue;

      const tableRefs = refs[tableKey];
      if (!tableRefs) continue;

      const resolved = tableRefs[val];
      if (resolved) {
        row[refKey] = resolved.label;
      }
    }
  }
}
