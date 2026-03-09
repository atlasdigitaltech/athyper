/**
 * GET /api/fin/reporting/statement/compare — Compare two statement sources
 *
 * Computes a line-by-line comparison between two statement sources.
 * Each source can be either "live" (fresh render) or a snapshot instanceId.
 *
 * Use cases:
 *   - live vs latest finalized snapshot (has the statement drifted since close?)
 *   - period-close snapshot vs current definition (definition changes?)
 *   - superseded vs current snapshot (what changed in a re-snapshot?)
 *
 * Query params:
 *   entityCode     — required
 *   statementCode  — required
 *   fiscalYear     — required
 *   periodFrom     — optional, defaults to 1
 *   periodTo       — optional, defaults to 12
 *   bookCode       — optional
 *   cubeCode       — optional, defaults to FS_MONTHLY (for live source)
 *   baseSource     — required: "live" or a snapshot instanceId (UUID)
 *   compareSource  — required: "live" or a snapshot instanceId (UUID)
 *
 * Response: StatementCompareDTO with per-row deltas and summary statistics.
 * Rows are matched by rowCode. Rows present in only one source are
 * classified as ADDED or REMOVED.
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceRow {
  rowCode: string;
  label: string;
  rowType: string;
  sortOrder: number;
  indentLevel: number;
  displayStyle: string;
  amountNet: string;
  priorNet: string;
}

interface SourceInfo {
  type: "live" | "snapshot";
  instanceId: string | null;
  snapshotHash: string | null;
  generatedAt: string | null;
  triggerContext: string | null;
  definitionVersion: number | null;
  diagnosticCount: number;
  diagnosticSummary: { errorCount: number; warningCount: number; infoCount: number } | null;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  try {
    const apiCtx = await getApiContext();
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    const statementCode = url.searchParams.get("statementCode");
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodFrom = parseInt(url.searchParams.get("periodFrom") ?? "1", 10);
    const periodTo = parseInt(url.searchParams.get("periodTo") ?? "12", 10);
    const bookCode = url.searchParams.get("bookCode") ?? null;
    const cubeCode = url.searchParams.get("cubeCode") ?? "FS_MONTHLY";
    const baseSource = url.searchParams.get("baseSource");
    const compareSource = url.searchParams.get("compareSource");

    if (!entityCode) return errorResponse("VALIDATION", "entityCode is required", 400);
    if (!statementCode) return errorResponse("VALIDATION", "statementCode is required", 400);
    if (isNaN(fiscalYear)) return errorResponse("VALIDATION", "fiscalYear is required", 400);
    if (!baseSource) return errorResponse("VALIDATION", "baseSource is required ('live' or instanceId)", 400);
    if (!compareSource) return errorResponse("VALIDATION", "compareSource is required ('live' or instanceId)", 400);

    // ── Early validation: reject self-comparison ──

    if (
      baseSource !== "live" && compareSource !== "live" &&
      baseSource === compareSource
    ) {
      return errorResponse(
        "VALIDATION",
        "Base and compare sources are the same snapshot — nothing to compare",
        400,
      );
    }

    // ── Load definition for display ──

    const defResult = await sql`
      SELECT
        id,
        statement_code AS "statementCode",
        name,
        description,
        statement_type AS "statementType",
        scope,
        book_code AS "bookCode",
        is_active AS "isActive",
        version
      FROM fin.rpt_statement_definition
      WHERE tenant_id = ${tenantUuid}
        AND statement_code = ${statementCode}
        AND is_active = TRUE
    `.execute(db);

    if ((defResult.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", `Statement '${statementCode}' not found`, 404);
    }

    const definition = (defResult.rows as any[])[0];

    // ── Resolve both sources ──

    const [baseData, compareData] = await Promise.all([
      resolveSource(db, tenantUuid, baseSource, {
        entityCode, statementCode, fiscalYear, periodFrom, periodTo,
        bookCode: bookCode ?? definition.bookCode ?? "STAT", cubeCode,
      }),
      resolveSource(db, tenantUuid, compareSource, {
        entityCode, statementCode, fiscalYear, periodFrom, periodTo,
        bookCode: bookCode ?? definition.bookCode ?? "STAT", cubeCode,
      }),
    ]);

    if (!baseData) {
      return errorResponse("NOT_FOUND", `Base source '${baseSource}' not found`, 404);
    }
    if (!compareData) {
      return errorResponse("NOT_FOUND", `Compare source '${compareSource}' not found`, 404);
    }

    // ── Compute line-by-line comparison ──

    const baseMap = new Map<string, SourceRow>();
    for (const row of baseData.rows) baseMap.set(row.rowCode, row);

    const compareMap = new Map<string, SourceRow>();
    for (const row of compareData.rows) compareMap.set(row.rowCode, row);

    // Row ordering: base-side order first, then ADDED rows appended in
    // compare-side order. This ensures a stable, predictable layout where the
    // base serves as the structural anchor.
    const sortedCodes: string[] = [];
    const baseRowCodes = new Set<string>();
    for (const row of baseData.rows) {
      sortedCodes.push(row.rowCode);
      baseRowCodes.add(row.rowCode);
    }
    // Append rows that exist only in compare source, preserving their sort order
    for (const row of compareData.rows) {
      if (!baseRowCodes.has(row.rowCode)) {
        sortedCodes.push(row.rowCode);
      }
    }

    const comparisonRows: any[] = [];
    let changedCount = 0;
    let addedCount = 0;
    let removedCount = 0;
    let unchangedCount = 0;
    let totalDelta = 0;

    // Delta semantics:
    //   delta = compare − base
    //   ADDED   → row exists only in compare; base values are 0, delta = compareNet − 0
    //   REMOVED → row exists only in base; compare values are 0, delta = 0 − baseNet
    //   CHANGED → row exists in both with material difference (|delta| ≥ 0.005)
    //   UNCHANGED → row exists in both with immaterial difference

    for (const rowCode of sortedCodes) {
      const base = baseMap.get(rowCode);
      const compare = compareMap.get(rowCode);

      const baseNet = parseFloat(base?.amountNet ?? "0");
      const compareNet = parseFloat(compare?.amountNet ?? "0");
      const basePriorNet = parseFloat(base?.priorNet ?? "0");
      const comparePriorNet = parseFloat(compare?.priorNet ?? "0");

      const deltaNet = compareNet - baseNet;
      const deltaPriorNet = comparePriorNet - basePriorNet;

      let changeType: string;
      if (!base) {
        changeType = "ADDED";
        addedCount++;
      } else if (!compare) {
        changeType = "REMOVED";
        removedCount++;
      } else if (Math.abs(deltaNet) < 0.005 && Math.abs(deltaPriorNet) < 0.005) {
        changeType = "UNCHANGED";
        unchangedCount++;
      } else {
        changeType = "CHANGED";
        changedCount++;
      }

      totalDelta += deltaNet;

      // Use the richer side for display metadata
      const displayRow = base ?? compare!;

      comparisonRows.push({
        rowCode,
        label: displayRow.label,
        rowType: displayRow.rowType,
        indentLevel: displayRow.indentLevel,
        sortOrder: displayRow.sortOrder,
        displayStyle: displayRow.displayStyle,
        changeType,
        baseNet: String(baseNet),
        basePriorNet: String(basePriorNet),
        compareNet: String(compareNet),
        comparePriorNet: String(comparePriorNet),
        deltaNet: String(deltaNet),
        deltaPriorNet: String(deltaPriorNet),
        deltaPct: baseNet !== 0
          ? String(((deltaNet / Math.abs(baseNet)) * 100).toFixed(4))
          : null,
      });
    }

    return successResponse({
      definition,
      base: baseData.info,
      compare: compareData.info,
      rows: comparisonRows,
      summary: {
        totalRows: comparisonRows.length,
        changedRows: changedCount,
        addedRows: addedCount,
        removedRows: removedCount,
        unchangedRows: unchangedCount,
        totalDeltaNet: String(totalDelta),
      },
    });
  } catch (err) {
    console.error("[statement/compare/GET]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Comparison failed",
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

interface RenderParams {
  entityCode: string;
  statementCode: string;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  cubeCode: string;
}

interface ResolvedSource {
  info: SourceInfo;
  rows: SourceRow[];
}

async function resolveSource(
  db: any,
  tenantUuid: string,
  source: string,
  params: RenderParams,
): Promise<ResolvedSource | null> {
  if (source === "live") {
    return resolveLiveSource(db, tenantUuid, params);
  }
  return resolveSnapshotSource(db, tenantUuid, source);
}

async function resolveLiveSource(
  db: any,
  tenantUuid: string,
  params: RenderParams,
): Promise<ResolvedSource | null> {
  const renderResult = await sql`
    SELECT
      row_code       AS "rowCode",
      label,
      row_type       AS "rowType",
      sort_order     AS "sortOrder",
      indent_level   AS "indentLevel",
      display_style  AS "displayStyle",
      amount_net     AS "amountNet",
      prior_net      AS "priorNet"
    FROM fin.render_statement(
      ${tenantUuid},
      ${params.entityCode},
      ${params.statementCode},
      ${params.fiscalYear}::SMALLINT,
      ${params.periodFrom}::SMALLINT,
      ${params.periodTo}::SMALLINT,
      ${params.bookCode},
      ${params.cubeCode}
    )
  `.execute(db);

  const rows: SourceRow[] = (renderResult.rows as any[]).map((r) => ({
    rowCode: r.rowCode,
    label: r.label,
    rowType: r.rowType,
    sortOrder: r.sortOrder ?? 0,
    indentLevel: r.indentLevel ?? 0,
    displayStyle: r.displayStyle ?? "NORMAL",
    amountNet: String(r.amountNet ?? "0"),
    priorNet: String(r.priorNet ?? "0"),
  }));

  return {
    info: {
      type: "live",
      instanceId: null,
      snapshotHash: null,
      generatedAt: new Date().toISOString(),
      triggerContext: null,
      definitionVersion: null,
      diagnosticCount: 0,
      diagnosticSummary: null,
    },
    rows,
  };
}

async function resolveSnapshotSource(
  db: any,
  tenantUuid: string,
  instanceId: string,
): Promise<ResolvedSource | null> {
  // Load instance metadata including diagnostic summary
  const instResult = await sql`
    SELECT
      si.id                           AS "instanceId",
      si.snapshot_hash                AS "snapshotHash",
      si.generated_at                 AS "generatedAt",
      si.trigger_context              AS "triggerContext",
      si.definition_version           AS "definitionVersion",
      COALESCE(si.diagnostic_count, 0)         AS "diagnosticCount",
      COALESCE(si.diagnostic_error_count, 0)   AS "diagnosticErrorCount",
      COALESCE(si.diagnostic_warning_count, 0) AS "diagnosticWarningCount",
      COALESCE(si.diagnostic_info_count, 0)    AS "diagnosticInfoCount"
    FROM fin.statement_instance si
    WHERE si.tenant_id = ${tenantUuid}
      AND si.id = ${instanceId}::UUID
  `.execute(db);

  if ((instResult.rows as any[]).length === 0) return null;
  const inst = (instResult.rows as any[])[0];

  // Load snapshot lines
  const linesResult = await sql`
    SELECT
      sil.line_code         AS "rowCode",
      sil.label,
      sil.line_type         AS "rowType",
      sil.sort_order        AS "sortOrder",
      sil.indent_level      AS "indentLevel",
      COALESCE(sil.display_style, 'NORMAL') AS "displayStyle",
      sil.current_amount    AS "amountNet",
      COALESCE(sil.prior_amount, 0) AS "priorNet"
    FROM fin.statement_instance_line sil
    WHERE sil.instance_id = ${instanceId}::UUID
    ORDER BY sil.sort_order
  `.execute(db);

  const rows: SourceRow[] = (linesResult.rows as any[]).map((r) => ({
    rowCode: r.rowCode,
    label: r.label,
    rowType: r.rowType,
    sortOrder: r.sortOrder ?? 0,
    indentLevel: r.indentLevel ?? 0,
    displayStyle: r.displayStyle ?? "NORMAL",
    amountNet: String(r.amountNet ?? "0"),
    priorNet: String(r.priorNet ?? "0"),
  }));

  const diagCount = inst.diagnosticCount ?? 0;
  return {
    info: {
      type: "snapshot",
      instanceId: inst.instanceId,
      snapshotHash: inst.snapshotHash,
      generatedAt: inst.generatedAt,
      triggerContext: inst.triggerContext,
      definitionVersion: inst.definitionVersion,
      diagnosticCount: diagCount,
      diagnosticSummary: diagCount > 0
        ? {
            errorCount: inst.diagnosticErrorCount ?? 0,
            warningCount: inst.diagnosticWarningCount ?? 0,
            infoCount: inst.diagnosticInfoCount ?? 0,
          }
        : null,
    },
    rows,
  };
}
