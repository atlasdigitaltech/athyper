/**
 * GET    /api/data/:entity/:id  — Get a single entity record
 * PATCH  /api/data/:entity/:id  — Update an entity record
 * DELETE /api/data/:entity/:id  — Soft-delete an entity record
 *
 * Queries the real database via meta.entity table resolution.
 * Falls back to mock data when DATABASE_URL is not set.
 */

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
import { ENTITY_DATA_REGISTRY } from "@/lib/mock-data/entities";
import { invalidateEntityQueryCache } from "@/lib/query-cache-invalidation";

// ============================================================================
// GET — Single Record
// ============================================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
  const db = getDb();

  // ── Fallback to mock data ──
  if (!db) {
    const entityData = ENTITY_DATA_REGISTRY[entity];
    if (!entityData) {
      return errorResponse("NOT_FOUND", `Unknown entity: ${entity}`, 404);
    }
    const record = entityData.byId[id];
    if (!record) {
      return errorResponse(
        "NOT_FOUND",
        `Record not found: ${entity}/${id}`,
        404,
      );
    }
    return successResponse(record);
  }

  // ── Real DB query ──
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
    const tenantClause = hasTenantId
      ? sql`AND tenant_id = ${tenantUuid}`
      : sql``;
    const softDeleteClause = hasSoftDelete
      ? sql`AND deleted_at IS NULL`
      : sql``;

    const result = await sql`
            SELECT *
            FROM ${sql.table(fullTableName)}
            WHERE id = ${id}
              ${tenantClause}
              ${softDeleteClause}
            LIMIT 1
        `.execute(db);

    if (result.rows.length === 0) {
      return errorResponse(
        "NOT_FOUND",
        `Record not found: ${entity}/${id}`,
        404,
      );
    }

    return successResponse(result.rows[0]);
  } catch (error) {
    console.error(`[GET /api/data/${entity}/${id}] Error:`, error);
    // Fall back to mock data
    const entityData = ENTITY_DATA_REGISTRY[entity];
    if (entityData) {
      const record = entityData.byId[id];
      if (record) return successResponse(record);
    }
    return errorResponse("INTERNAL_ERROR", "Failed to load entity record");
  } finally {
    await redis?.quit();
  }
}

// ============================================================================
// PATCH — Update Record
// ============================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
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
    const hasSoftDelete = await tableHasColumn(
      db,
      meta.tableSchema,
      meta.tableName,
      "deleted_at",
    );
    const tenantClause = hasTenantId
      ? sql`AND tenant_id = ${tenantUuid}`
      : sql``;
    const softDeleteClause = hasSoftDelete
      ? sql`AND deleted_at IS NULL`
      : sql``;

    // Strip system/readonly fields from the update payload
    const READONLY_FIELDS = new Set([
      "id",
      "tenant_id",
      "realm_id",
      "created_at",
      "created_by",
      "deleted_at",
      "deleted_by",
      "version",
      "_version",
    ]);

    const now = new Date();
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!READONLY_FIELDS.has(key)) {
        updateData[key] = value;
      }
    }
    updateData.updated_at = now;
    updateData.updated_by = context.userId;

    // Build SET clause
    const setClauses = Object.entries(updateData).map(
      ([col, val]) => sql`${sql.ref(col)} = ${sql.val(val)}`,
    );
    setClauses.push(sql`version = version + 1`);

    const result = await sql`
            UPDATE ${sql.table(fullTableName)}
            SET ${sql.join(setClauses, sql`, `)}
            WHERE id = ${id}
              ${tenantClause}
              ${softDeleteClause}
            RETURNING *
        `.execute(db);

    if (result.rows.length === 0) {
      return errorResponse(
        "NOT_FOUND",
        `Record not found: ${entity}/${id}`,
        404,
      );
    }

    // Invalidate query result cache for this entity
    await invalidateEntityQueryCache(tenantUuid, entity);

    return successResponse(result.rows[0]);
  } catch (error) {
    console.error(`[PATCH /api/data/${entity}/${id}] Error:`, error);
    return errorResponse("INTERNAL_ERROR", "Failed to update record");
  } finally {
    await redis?.quit();
  }
}

// ============================================================================
// DELETE — Soft Delete Record
// ============================================================================

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
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

    const fullTableName = `${meta.tableSchema}.${meta.tableName}`;
    const now = new Date();
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
    const hasIsActive = await tableHasColumn(
      db,
      meta.tableSchema,
      meta.tableName,
      "is_active",
    );
    const tenantClause = hasTenantId
      ? sql`AND tenant_id = ${tenantUuid}`
      : sql``;

    let result;

    if (hasSoftDelete) {
      // Soft-delete via deleted_at column
      result = await sql`
                UPDATE ${sql.table(fullTableName)}
                SET deleted_at = ${now},
                    deleted_by = ${context.userId},
                    updated_at = ${now},
                    updated_by = ${context.userId}
                WHERE id = ${id}
                  ${tenantClause}
                  AND deleted_at IS NULL
                RETURNING id
            `.execute(db);
    } else if (hasIsActive) {
      // Deactivate via is_active flag
      result = await sql`
                UPDATE ${sql.table(fullTableName)}
                SET is_active = false,
                    updated_at = ${now},
                    updated_by = ${context.userId}
                WHERE id = ${id}
                  ${tenantClause}
                RETURNING id
            `.execute(db);
    } else {
      // Hard delete as last resort
      result = await sql`
                DELETE FROM ${sql.table(fullTableName)}
                WHERE id = ${id}
                  ${tenantClause}
                RETURNING id
            `.execute(db);
    }

    if (result.rows.length === 0) {
      return errorResponse(
        "NOT_FOUND",
        `Record not found: ${entity}/${id}`,
        404,
      );
    }

    // Invalidate query result cache for this entity
    await invalidateEntityQueryCache(tenantUuid, entity);

    return successResponse({ deleted: true, id });
  } catch (error) {
    console.error(`[DELETE /api/data/${entity}/${id}] Error:`, error);
    return errorResponse("INTERNAL_ERROR", "Failed to delete record");
  } finally {
    await redis?.quit();
  }
}
