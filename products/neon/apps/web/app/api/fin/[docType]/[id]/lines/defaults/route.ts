/**
 * GET /api/fin/:docType/:id/lines/defaults
 *
 * Returns default line values for a document based on its
 * spend category, OU, and funding profile configuration.
 *
 * Resolution is meta-driven via doc-lines-runtime resolver with registry fallback.
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
import { getDb } from "@/lib/db";
import { resolveDocumentLineRuntime } from "@/lib/finance/doc-lines-runtime";

type RouteParams = { params: Promise<{ docType: string; id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const { docType, id: docId } = await params;
    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);

    const def = await resolveDocumentLineRuntime(db, tenantUuid, docType);
    if (!def) return errorResponse("NOT_FOUND", `Unknown document type: ${docType}`, 404);

    // Build dynamic SELECT + JOINs from resolved defaults sources
    const selectParts: string[] = [];
    const joinParts: string[] = [];

    if (def.defaults.sources.length === 0) {
      // No defaults sources — return nulls for standard default fields
      return successResponse({
        accountId: null,
        taxCode: null,
        costCenterId: null,
        profitCenterId: null,
        fpId: null,
      });
    }

    // Collect all default field aliases we need to provide
    const providedAliases = new Set<string>();
    for (const source of def.defaults.sources) {
      joinParts.push(source.joinClause);
      for (const field of source.fields) {
        selectParts.push(`${field.selectExpr} as "${field.alias}"`);
        providedAliases.add(field.alias);
      }
    }

    // Fill in nulls for standard fields not covered by any source
    const standardDefaults = ["accountId", "taxCode", "costCenterId", "profitCenterId", "fpId"];
    for (const alias of standardDefaults) {
      if (!providedAliases.has(alias)) {
        selectParts.push(`null as "${alias}"`);
      }
    }

    const result = await sql`
      select ${sql.raw(selectParts.join(", "))}
      from ${sql.table(def.parent.qualifiedTable)} d
      ${sql.raw(joinParts.join("\n"))}
      where d.tenant_id = ${tenantUuid}::uuid
        and d.id = ${docId}::uuid
    `.execute(db);

    if ((result.rows as unknown[]).length === 0) {
      return errorResponse("NOT_FOUND", "Document not found", 404);
    }

    return successResponse((result.rows as unknown[])[0], 200, {
      "X-Resolution-Source": def.resolvedFrom,
    });
  } catch (err) {
    console.error("[doc-lines/defaults] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch line defaults",
    );
  } finally {
    await redis?.quit();
  }
}
