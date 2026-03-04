/**
 * GET /api/entity-meta/:entityKey/fields
 *
 * Returns field metadata for an entity type.
 *
 * Resolution order:
 *   1. meta.field rows (from the latest published entity_version)
 *   2. Fallback: auto-detect columns from information_schema.columns
 *
 * Includes entity-level metadata (kind, governance, etc.).
 *
 * Field queries delegate to the shared utility (lib/entity-meta-fields.ts)
 * to avoid code duplication with entity-page descriptor and data APIs.
 */

import type { NextRequest } from "next/server";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";
import { resolveEntityMeta } from "@/lib/entity-meta";
import { resolveFieldsWithFKs } from "@/lib/entity-meta-fields";

// Re-export type for backward compatibility
export type { ServerFieldMeta as FieldMeta } from "@/lib/entity-meta-fields";

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entityKey: string }> },
) {
  const { entityKey } = await params;
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
    const meta = await resolveEntityMeta(db, entityKey, tenantUuid);
    if (!meta) {
      return errorResponse("NOT_FOUND", `Entity not found: ${entityKey}`, 404);
    }

    // Resolve fields with FK enrichment (shared utility handles
    // meta.field → information_schema fallback and FK priority)
    const fields = await resolveFieldsWithFKs(
      db,
      meta.entityName,
      tenantUuid,
      meta.tableSchema,
      meta.tableName,
    );

    return successResponse({
      entityName: meta.entityName,
      kind: meta.kind,
      governanceLevel: meta.governanceLevel,
      entityShort: meta.entityShort,
      featureFlags: meta.featureFlags,
      fields,
    });
  } catch (error) {
    console.error(`[GET /api/entity-meta/${entityKey}/fields] Error:`, error);
    return errorResponse("INTERNAL_ERROR", "Failed to load field metadata");
  } finally {
    await redis?.quit();
  }
}
