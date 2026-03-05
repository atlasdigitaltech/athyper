/**
 * GET /api/ref/:entity?q=&limit=&cursor=&filter=
 *
 * Standardized typeahead search for reference fields.
 * Returns matching records from the target entity with display labels.
 *
 * Query params:
 *   q       — search string (applied to searchFields from referenceConfig, or heuristic)
 *   limit   — max results (default 20, capped at 50)
 *   cursor  — offset for pagination (default 0)
 *   filter  — optional base filter JSON (merged with referenceConfig.filter)
 *   sort    — optional sort column (default from referenceConfig.defaultSort or first display column)
 *   mode    — search mode override: "contains" | "startsWith" | "fts" (default from config or "contains")
 *
 * Returns: { data: [{ id, label, ...searchFields }], meta: { total, hasMore } }
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import type { NextRequest } from "next/server";

import {
    getApiContext,
    resolveTenantUuid,
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from "@/lib/api-context";
import { getDb, tableHasColumn } from "@/lib/db";
import { resolveEntityMeta } from "@/lib/entity-meta";
import { resolveDisplayPolicy, buildDisplayLabel } from "@/lib/entity-display-policy";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Columns commonly used for search when no searchFields configured
const HEURISTIC_SEARCH_COLUMNS = ["code", "name", "title", "label", "display_name", "description"];

// ============================================================================
// GET — Typeahead Search
// ============================================================================

export async function GET(
    req: NextRequest,
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

        // ── Parse query params ──
        const url = new URL(req.url);
        const q = url.searchParams.get("q")?.trim() ?? "";
        const limit = Math.min(
            Math.max(1, parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT),
            MAX_LIMIT,
        );
        const cursor = Math.max(0, parseInt(url.searchParams.get("cursor") ?? "", 10) || 0);
        const searchMode = (url.searchParams.get("mode") ?? "contains") as "contains" | "startsWith" | "fts";
        const sortParam = url.searchParams.get("sort");

        // ── Resolve display policy ──
        const policy = await resolveDisplayPolicy(db, tableSchema, tableName, meta.featureFlags);

        // ── Determine search columns ──
        // Introspect available columns for search
        const colResult = await sql<{ column_name: string; data_type: string }>`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = ${tableSchema}
              AND table_name = ${tableName}
        `.execute(db);

        const availableCols = new Map(colResult.rows.map((r) => [r.column_name, r.data_type]));
        const textTypes = new Set(["text", "character varying", "varchar", "char", "character", "bpchar", "uuid"]);

        // Use display policy columns + heuristic as search columns
        const searchCols = [
            ...policy.resolvedColumns,
            ...HEURISTIC_SEARCH_COLUMNS,
        ].filter((c) => {
            const dt = availableCols.get(c);
            return dt && textTypes.has(dt);
        });
        // Deduplicate
        const uniqueSearchCols = [...new Set(searchCols)];

        // ── Build SELECT columns ──
        const selectCols = [...new Set([policy.primaryKey, ...policy.resolvedColumns])];
        const selectExpr = sql.join(selectCols.map((c) => sql.ref(c)));

        // ── Tenant clause ──
        const hasTenant = await tableHasColumn(db, tableSchema, tableName, "tenant_id");
        const tenantClause = hasTenant ? sql`AND tenant_id = ${tenantUuid}` : sql``;

        // ── Soft-delete clause ──
        const hasSoftDelete = await tableHasColumn(db, tableSchema, tableName, "deleted_at");
        const softDeleteClause = hasSoftDelete ? sql`AND deleted_at IS NULL` : sql``;

        // ── Search clause ──
        let searchClause = sql``;
        if (q && uniqueSearchCols.length > 0) {
            if (searchMode === "startsWith") {
                const pattern = `${q}%`;
                const conditions = uniqueSearchCols.map(
                    (c) => sql`${sql.ref(c)}::text ILIKE ${pattern}`,
                );
                searchClause = sql`AND (${sql.join(conditions, sql` OR `)})`;
            } else if (searchMode === "fts") {
                // Full-text search on a tsvector (best effort — falls back to contains if no tsvector)
                const hasTsv = availableCols.has("search_vector");
                if (hasTsv) {
                    searchClause = sql`AND search_vector @@ plainto_tsquery('english', ${q})`;
                } else {
                    const pattern = `%${q}%`;
                    const conditions = uniqueSearchCols.map(
                        (c) => sql`${sql.ref(c)}::text ILIKE ${pattern}`,
                    );
                    searchClause = sql`AND (${sql.join(conditions, sql` OR `)})`;
                }
            } else {
                // Default: contains
                const pattern = `%${q}%`;
                const conditions = uniqueSearchCols.map(
                    (c) => sql`${sql.ref(c)}::text ILIKE ${pattern}`,
                );
                searchClause = sql`AND (${sql.join(conditions, sql` OR `)})`;
            }
        }

        // ── Sort clause ──
        const sortCol = sortParam && availableCols.has(sortParam) ? sortParam : policy.resolvedColumns[0] ?? policy.primaryKey;
        const orderExpr = sql`ORDER BY ${sql.ref(sortCol)} ASC NULLS LAST`;

        // ── Count query ──
        const countResult = await sql<{ count: string }>`
            SELECT COUNT(*) AS count
            FROM ${sql.table(fullTable)}
            WHERE true
              ${tenantClause}
              ${softDeleteClause}
              ${searchClause}
        `.execute(db);
        const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

        // ── Data query ──
        const rows = await sql<Record<string, unknown>>`
            SELECT ${selectExpr}
            FROM ${sql.table(fullTable)}
            WHERE true
              ${tenantClause}
              ${softDeleteClause}
              ${searchClause}
            ${orderExpr}
            LIMIT ${limit}
            OFFSET ${cursor}
        `.execute(db);

        // ── Build response ──
        const data = rows.rows.map((row) => ({
            id: String(row[policy.primaryKey]),
            label: buildDisplayLabel(policy, row) || String(row[policy.primaryKey]),
            // Include raw columns for client-side needs
            ...Object.fromEntries(
                policy.resolvedColumns
                    .filter((c) => c !== policy.primaryKey)
                    .map((c) => [c, row[c]]),
            ),
        }));

        return successResponse({
            data,
            meta: {
                total,
                hasMore: cursor + limit < total,
                cursor: cursor + limit,
            },
        });
    } catch (error) {
        console.error("[GET /api/ref/entity] Error:", error);
        return errorResponse("INTERNAL_ERROR", "Failed to search references");
    } finally {
        await redis?.quit();
    }
}
