/**
 * GET  /api/fin/:docType/:id/lines  → line items for any registered document type
 * POST /api/fin/:docType/:id/lines  → replace all lines (DRAFT only)
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

// ---------------------------------------------------------------------------
// GET — fetch all lines for a document
// ---------------------------------------------------------------------------

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

    // Build SELECT clause from projected columns (all identifiers validated by resolver)
    const selectExprs = def.selectColumns.map((col) => {
      const cast = col.selectCast || "";
      const colRef = `l."${col.columnName}"${cast}`;
      return col.columnName === col.alias
        ? colRef
        : `${colRef} as "${col.alias}"`;
    });

    const result = await sql`
      select ${sql.raw(selectExprs.join(", "))}
      from ${sql.table(def.child.qualifiedTable)} l
      join ${sql.table(def.parent.qualifiedTable)} p
        on p.id = l."${sql.raw(def.child.fkColumn)}" and p.tenant_id = l.tenant_id
      where l.tenant_id = ${tenantUuid}::uuid
        and l."${sql.raw(def.child.fkColumn)}" = ${docId}::uuid
      order by l."${sql.raw(def.collection.orderField)}"
    `.execute(db);

    return successResponse(result.rows, 200, {
      "X-Resolution-Source": def.resolvedFrom,
    });
  } catch (err) {
    console.error("[doc-lines] GET error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to fetch document lines",
    );
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — replace all lines for a document (DRAFT only)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: RouteParams) {
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

    const body = await req.json();
    const { lines, version } = body as { lines: Record<string, unknown>[]; version?: number };

    if (!Array.isArray(lines)) {
      return errorResponse("VALIDATION", "lines must be an array", 400);
    }

    // Verify parent exists, is DRAFT, and version matches (tenant-scoped)
    const parent = await sql<{ status: string; version: number }>`
      select status, version
      from ${sql.table(def.parent.qualifiedTable)}
      where tenant_id = ${tenantUuid}::uuid
        and id = ${docId}::uuid
    `.execute(db);

    if (parent.rows.length === 0) {
      return errorResponse("NOT_FOUND", "Document not found", 404);
    }
    if (parent.rows[0].status !== "DRAFT") {
      return errorResponse("CONFLICT", "Can only edit lines on DRAFT documents", 409);
    }
    if (version != null && parent.rows[0].version !== version) {
      return errorResponse("CONFLICT", "Version mismatch — document was modified", 409);
    }

    const fk = def.child.fkColumn;
    const orderField = def.collection.orderField;

    await db.transaction().execute(async (trx) => {
      // Delete existing lines (tenant-scoped)
      await sql`
        delete from ${sql.table(def.child.qualifiedTable)}
        where tenant_id = ${tenantUuid}::uuid
          and "${sql.raw(fk)}" = ${docId}::uuid
      `.execute(trx);

      // Insert new lines using writable columns from the resolver.
      // Since this is a delete-all+re-insert (replace) operation, writeOnce
      // columns are included — each insert is effectively a fresh creation.
      // A future PATCH endpoint should filter: wc.writeOnce === false.
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];

        // System columns always included first: tenant_id, FK, order field
        const colNames = ["tenant_id", fk, orderField];
        const colVals = [
          sql`${tenantUuid}::uuid`,
          sql`${docId}::uuid`,
          sql`${i + 1}`,
        ];

        // Writable columns from definition
        for (const wc of def.writableColumns) {
          colNames.push(wc.columnName);
          const rawVal = ln[wc.alias];
          if (wc.dataType === "jsonb" || wc.dataType === "json") {
            colVals.push(
              sql`${JSON.stringify(rawVal ?? (wc.isRequired ? [] : null))}${sql.raw(wc.insertCast)}`,
            );
          } else if (wc.dataType === "boolean") {
            colVals.push(sql`${(rawVal as boolean) ?? false}`);
          } else {
            const val = rawVal != null ? String(rawVal) : (wc.isRequired ? "" : null);
            colVals.push(
              wc.insertCast
                ? sql`${val}${sql.raw(wc.insertCast)}`
                : sql`${val}`,
            );
          }
        }

        await sql`
          insert into ${sql.table(def.child.qualifiedTable)}
            (${sql.raw(colNames.map((c) => `"${c}"`).join(", "))})
          values
            (${sql.join(colVals, sql`, `)})
        `.execute(trx);
      }

      // Bump parent version and recalculate totals (tenant-scoped)
      await sql`
        update ${sql.table(def.parent.qualifiedTable)}
        set
          tax_amount = coalesce((
            select sum(tax_amount) from ${sql.table(def.child.qualifiedTable)}
            where tenant_id = ${tenantUuid}::uuid and "${sql.raw(fk)}" = ${docId}::uuid
          ), 0),
          total_amount = coalesce((
            select sum(amount + tax_amount) from ${sql.table(def.child.qualifiedTable)}
            where tenant_id = ${tenantUuid}::uuid and "${sql.raw(fk)}" = ${docId}::uuid
          ), 0),
          version = version + 1,
          updated_at = now()
        where tenant_id = ${tenantUuid}::uuid
          and id = ${docId}::uuid
      `.execute(trx);
    });

    return successResponse({ ok: true }, 200, {
      "X-Resolution-Source": def.resolvedFrom,
    });
  } catch (err) {
    console.error("[doc-lines] POST error:", err);
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Failed to save document lines",
    );
  } finally {
    await redis?.quit();
  }
}
