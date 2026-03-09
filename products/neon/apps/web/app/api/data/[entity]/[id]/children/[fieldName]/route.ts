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

/**
 * Build a set of column names that are NOT writable by clients.
 * Derived from child entity field metadata:
 *   - isReadOnly fields
 *   - isComputed fields (virtual or materialized)
 *   - writeOnce fields (on update — locked after creation)
 *   - system-origin fields
 *
 * Returns null when field metadata is unavailable (fallback to SYSTEM_FIELDS only).
 */
async function resolveNonWritableColumns(
  db: any,
  childEntityName: string,
  tenantUuid: string,
  isUpdate: boolean,
): Promise<Set<string> | null> {
  try {
    const metrics = createCacheMetrics();
    const fields = await getMetaFields(db, childEntityName, tenantUuid, metrics);
    if (fields.length === 0) {
      console.warn(
        `[children-post] No field metadata for child entity "${childEntityName}". ` +
          `Writable-column filter using SYSTEM_FIELDS only. ` +
          `Seed field dictionaries to enable full filtering.`,
      );
      return null;
    }

    const nonWritable = new Set<string>();
    for (const f of fields) {
      if (f.isReadOnly) nonWritable.add(f.columnName);
      if (f.isComputed) nonWritable.add(f.columnName);
      if (f.origin === "system") nonWritable.add(f.columnName);
      if (isUpdate && f.writeOnce) nonWritable.add(f.columnName);
    }
    return nonWritable;
  } catch {
    // Graceful degradation — log and continue with SYSTEM_FIELDS only
    console.warn(
      `[children-post] Failed to resolve writable columns for "${childEntityName}". ` +
        `Falling back to SYSTEM_FIELDS filter. Reason: field metadata query failed.`,
    );
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

interface CollectionWiring {
  childEntityName: string;
  childFkField: string;
  ordering: boolean;
  orderField: string;
  deleteMode: "cascade" | "restrict" | "detach";
}

/**
 * Resolve collection field wiring from parent entity meta.
 *
 * Resolution order:
 *   1. Exact match by columnName or field name
 *   2. If multiple cardinality='many' fields match (ambiguous),
 *      prefer the one with collection_behavior.role matching fieldName
 *   3. If single unambiguous collection field exists, use it
 *   4. Otherwise, return null (safe fallback) and log the ambiguity
 *
 * Returns null if the field doesn't exist, isn't a collection field,
 * or is ambiguous without a role discriminator.
 */
async function resolveCollectionWiring(
  db: any,
  parentEntityName: string,
  tenantUuid: string,
  fieldName: string,
): Promise<CollectionWiring | null> {
  const metrics = createCacheMetrics();
  const fields = await getMetaFields(
    db,
    parentEntityName,
    tenantUuid,
    metrics,
  );

  // 1. Exact match by column name or field name
  const exactMatch = fields.find(
    (f) => f.columnName === fieldName || f.name === fieldName,
  );

  if (exactMatch) {
    const result = extractWiring(exactMatch);
    if (result) return result;
  }

  // 2. Gather all cardinality='many' fields (collection fields)
  const collectionFields = fields.filter(
    (f) =>
      f.cardinality === "many" &&
      (f as any).childEntityName &&
      (f as any).childFkField,
  );

  if (collectionFields.length === 0) return null;

  // 3. Try role-based match: collection_behavior.role === fieldName
  const roleMatch = collectionFields.find((f) => {
    const cb = (f as any).collectionBehavior as Record<string, unknown> | null;
    return cb?.role === fieldName;
  });
  if (roleMatch) {
    return extractWiring(roleMatch);
  }

  // 4. If only one collection field exists, use it (unambiguous)
  if (collectionFields.length === 1) {
    return extractWiring(collectionFields[0]);
  }

  // 5. Ambiguous: multiple collections, no role discriminator
  console.warn(
    `[collection-wiring] AMBIGUITY: parent="${parentEntityName}" has ${collectionFields.length} ` +
      `cardinality='many' fields but none matched fieldName="${fieldName}" by name or role. ` +
      `Fields: [${collectionFields.map((f) => f.columnName).join(", ")}]. ` +
      `Add collection_behavior.role to disambiguate.`,
  );
  return null;
}

function extractWiring(
  field: any,
): CollectionWiring | null {
  const childEntityName = field.childEntityName as string | undefined;
  const childFkField = field.childFkField as string | undefined;
  if (!childEntityName || !childFkField) return null;

  const cb = field.collectionBehavior as Record<string, unknown> | null;
  return {
    childEntityName,
    childFkField,
    ordering: (cb?.ordering as boolean) ?? false,
    orderField: (cb?.orderField as string) ?? "sort_order",
    deleteMode:
      (cb?.deleteMode as "cascade" | "restrict" | "detach") ??
      ((cb?.ownership as string) === "linked" ? "detach" : "cascade"),
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

    // Resolve non-writable columns from child field metadata.
    // Insert and update use different writeOnce semantics.
    const nonWritableForInsert = await resolveNonWritableColumns(
      db,
      wiring.childEntityName,
      tenantUuid,
      false,
    );
    const nonWritableForUpdate = await resolveNonWritableColumns(
      db,
      wiring.childEntityName,
      tenantUuid,
      true,
    );

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

      // Strip system, read-only, computed, and write-once fields from the payload.
      // Uses meta-derived non-writable set when available, SYSTEM_FIELDS as fallback.
      const nonWritable = existingId ? nonWritableForUpdate : nonWritableForInsert;
      const cleanRow: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        if (SYSTEM_FIELDS.has(key)) continue;
        if (key === "id") continue;
        if (nonWritable?.has(key)) continue;
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
