/**
 * GET  /api/data/:entity/:id/children/:fieldName — List child rows for a collection field
 * POST /api/data/:entity/:id/children/:fieldName — Batch save (diff-based) child rows
 *
 * Meta-driven: validates the parent entity has a cardinality=many field with the given name,
 * then queries/writes the child entity table using the FK wiring from field metadata.
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
import { getMetaFields } from "@/lib/entity-meta-fields";
import { invalidateEntityQueryCache } from "@/lib/query-cache-invalidation";
import { createCacheMetrics } from "@/lib/redis-cache";

// ============================================================================
// Types
// ============================================================================

interface RouteParams {
  entity: string;
  id: string;
  fieldName: string;
}

interface BatchSaveBody {
  /** Child rows to upsert (id present → update, absent → insert) */
  rows: Record<string, unknown>[];
  /** IDs of child rows to delete */
  deleteIds?: string[];
  /** Parent version for optimistic concurrency (optional) */
  version?: number;
}

// System fields that clients never supply
const SYSTEM_FIELDS = new Set([
  "tenant_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "version",
]);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve collection field wiring from parent entity meta.
 * Returns null if the field doesn't exist or isn't a collection field.
 */
async function resolveCollectionWiring(
  db: any,
  parentEntityName: string,
  tenantUuid: string,
  fieldName: string,
): Promise<{
  childEntityName: string;
  childFkField: string;
  ordering: boolean;
  orderField: string;
  deleteMode: "cascade" | "restrict" | "detach";
} | null> {
  const metrics = createCacheMetrics();
  const fields = await getMetaFields(
    db,
    parentEntityName,
    tenantUuid,
    metrics,
  );

  const collectionField = fields.find(
    (f) => f.columnName === fieldName || f.name === fieldName,
  );

  if (!collectionField) return null;

  const childEntityName = (collectionField as any).childEntityName as
    | string
    | undefined;
  const childFkField = (collectionField as any).childFkField as
    | string
    | undefined;
  if (!childEntityName || !childFkField) return null;

  const cb = (collectionField as any).collectionBehavior as Record<
    string,
    unknown
  > | null;
  return {
    childEntityName,
    childFkField,
    ordering: (cb?.ordering as boolean) ?? false,
    orderField: (cb?.orderField as string) ?? "sort_order",
    deleteMode: (cb?.deleteMode as "cascade" | "restrict" | "detach") ?? ((cb?.ownership as string) === "linked" ? "detach" : "cascade"),
  };
}

// ============================================================================
// GET — List child rows
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const { entity, id, fieldName } = await params;
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

    // Resolve parent entity
    const parentMeta = await resolveEntityMeta(db, entity, tenantUuid);
    if (!parentMeta) {
      return errorResponse("NOT_FOUND", `Entity not found: ${entity}`, 404);
    }

    // Resolve collection field wiring
    const wiring = await resolveCollectionWiring(
      db,
      parentMeta.entityName,
      tenantUuid,
      fieldName,
    );
    if (!wiring) {
      return errorResponse(
        "NOT_FOUND",
        `Collection field "${fieldName}" not found on ${entity}`,
        404,
      );
    }

    // Resolve child entity table
    const childMeta = await resolveEntityMeta(
      db,
      wiring.childEntityName,
      tenantUuid,
    );
    if (!childMeta) {
      return errorResponse(
        "NOT_FOUND",
        `Child entity not found: ${wiring.childEntityName}`,
        404,
      );
    }

    const childTable = `${childMeta.tableSchema}.${childMeta.tableName}`;
    const hasTenantId = await tableHasColumn(
      db,
      childMeta.tableSchema,
      childMeta.tableName,
      "tenant_id",
    );
    const hasSoftDelete = await tableHasColumn(
      db,
      childMeta.tableSchema,
      childMeta.tableName,
      "deleted_at",
    );

    const tenantClause = hasTenantId
      ? sql`AND tenant_id = ${tenantUuid}`
      : sql``;
    const softDeleteClause = hasSoftDelete
      ? sql`AND deleted_at IS NULL`
      : sql``;

    // Order by configured order field or fallback to created_at
    const hasOrderField = wiring.ordering
      ? await tableHasColumn(
          db,
          childMeta.tableSchema,
          childMeta.tableName,
          wiring.orderField,
        )
      : false;
    const orderClause = hasOrderField
      ? sql`ORDER BY ${sql.ref(wiring.orderField)} ASC, created_at ASC`
      : sql`ORDER BY created_at ASC`;

    const result = await sql`
      SELECT *
      FROM ${sql.table(childTable)}
      WHERE ${sql.ref(wiring.childFkField)} = ${id}
        ${tenantClause}
        ${softDeleteClause}
      ${orderClause}
    `.execute(db);

    return successResponse({
      data: result.rows,
      meta: {
        parentEntity: entity,
        parentId: id,
        fieldName,
        childEntity: wiring.childEntityName,
        total: result.rows.length,
        ordering: wiring.ordering,
        orderField: wiring.orderField,
      },
    });
  } catch (error) {
    console.error(
      `[GET /api/data/${entity}/${id}/children/${fieldName}] Error:`,
      error,
    );
    return errorResponse("INTERNAL_ERROR", "Failed to load collection rows");
  } finally {
    await redis?.quit();
  }
}

// ============================================================================
// POST — Batch save (diff-based upsert + delete)
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const { entity, id, fieldName } = await params;
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

    // Resolve parent entity
    const parentMeta = await resolveEntityMeta(db, entity, tenantUuid);
    if (!parentMeta) {
      return errorResponse("NOT_FOUND", `Entity not found: ${entity}`, 404);
    }

    // Resolve collection field wiring
    const wiring = await resolveCollectionWiring(
      db,
      parentMeta.entityName,
      tenantUuid,
      fieldName,
    );
    if (!wiring) {
      return errorResponse(
        "NOT_FOUND",
        `Collection field "${fieldName}" not found on ${entity}`,
        404,
      );
    }

    // Resolve child entity table
    const childMeta = await resolveEntityMeta(
      db,
      wiring.childEntityName,
      tenantUuid,
    );
    if (!childMeta) {
      return errorResponse(
        "NOT_FOUND",
        `Child entity not found: ${wiring.childEntityName}`,
        404,
      );
    }

    const body = (await req.json()) as BatchSaveBody;
    if (!body.rows || !Array.isArray(body.rows)) {
      return errorResponse("VALIDATION", "body.rows must be an array", 400);
    }

    const childTable = `${childMeta.tableSchema}.${childMeta.tableName}`;
    const hasTenantId = await tableHasColumn(
      db,
      childMeta.tableSchema,
      childMeta.tableName,
      "tenant_id",
    );
    const hasSoftDelete = await tableHasColumn(
      db,
      childMeta.tableSchema,
      childMeta.tableName,
      "deleted_at",
    );
    const tenantClause = hasTenantId
      ? sql`AND tenant_id = ${tenantUuid}`
      : sql``;

    const now = new Date();
    const inserted: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const deleted: string[] = [];

    // ── Deletes ──
    if (body.deleteIds && body.deleteIds.length > 0) {
      for (const deleteId of body.deleteIds) {
        if (hasSoftDelete) {
          await sql`
            UPDATE ${sql.table(childTable)}
            SET deleted_at = ${now},
                deleted_by = ${context.userId},
                updated_at = ${now}
            WHERE id = ${deleteId}
              AND ${sql.ref(wiring.childFkField)} = ${id}
              ${tenantClause}
              AND deleted_at IS NULL
          `.execute(db);
        } else {
          await sql`
            DELETE FROM ${sql.table(childTable)}
            WHERE id = ${deleteId}
              AND ${sql.ref(wiring.childFkField)} = ${id}
              ${tenantClause}
          `.execute(db);
        }
        deleted.push(deleteId);
      }
    }

    // ── Upserts ──
    for (let i = 0; i < body.rows.length; i++) {
      const row = body.rows[i];
      const existingId = row.id as string | undefined;

      // Strip system fields from the payload
      const cleanRow: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        if (SYSTEM_FIELDS.has(key)) continue;
        if (key === "id") continue;
        cleanRow[key] = val === "" ? null : val;
      }

      // Ensure FK and ordering
      cleanRow[wiring.childFkField] = id;
      if (wiring.ordering) {
        cleanRow[wiring.orderField] = i + 1;
      }

      if (existingId) {
        // ── Update existing row ──
        const setClauses = Object.entries(cleanRow).map(
          ([col, val]) => sql`${sql.ref(col)} = ${sql.val(val)}`,
        );
        setClauses.push(sql`updated_at = ${sql.val(now)}`);
        setClauses.push(sql`updated_by = ${sql.val(context.userId)}`);
        setClauses.push(sql`version = version + 1`);

        const result = await sql`
          UPDATE ${sql.table(childTable)}
          SET ${sql.join(setClauses, sql`, `)}
          WHERE id = ${existingId}
            AND ${sql.ref(wiring.childFkField)} = ${id}
            ${tenantClause}
          RETURNING *
        `.execute(db);

        if (result.rows[0]) {
          updated.push(result.rows[0] as Record<string, unknown>);
        }
      } else {
        // ── Insert new row ──
        const newId = crypto.randomUUID();
        const record: Record<string, unknown> = {
          id: newId,
          ...cleanRow,
          version: 1,
          created_at: now,
          updated_at: now,
          created_by: context.userId,
          updated_by: context.userId,
        };
        if (hasTenantId) {
          record.tenant_id = tenantUuid;
        }

        const columns = Object.keys(record);
        const values = Object.values(record);

        const result = await sql`
          INSERT INTO ${sql.table(childTable)}
          (${sql.join(columns.map((c) => sql.ref(c)))})
          VALUES (${sql.join(values.map((v) => sql.val(v)))})
          RETURNING *
        `.execute(db);

        if (result.rows[0]) {
          inserted.push(result.rows[0] as Record<string, unknown>);
        }
      }
    }

    // Invalidate caches for both parent and child entities
    await invalidateEntityQueryCache(tenantUuid, entity);
    await invalidateEntityQueryCache(tenantUuid, wiring.childEntityName);

    return successResponse({
      inserted: inserted.length,
      updated: updated.length,
      deleted: deleted.length,
      rows: [...inserted, ...updated],
    });
  } catch (error) {
    console.error(
      `[POST /api/data/${entity}/${id}/children/${fieldName}] Error:`,
      error,
    );
    return errorResponse("INTERNAL_ERROR", "Failed to save collection rows");
  } finally {
    await redis?.quit();
  }
}
