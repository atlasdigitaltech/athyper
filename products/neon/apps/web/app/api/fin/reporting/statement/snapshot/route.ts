/**
 * GET /api/fin/reporting/statement/snapshot — Retrieve a captured statement snapshot
 *
 * Returns a point-in-time rendered statement from fin.statement_instance,
 * captured at period close or via manual snapshot. Same response shape as
 * the live render endpoint so the UI can display either interchangeably.
 *
 * Query params:
 *   entityCode     — required
 *   statementCode  — required (source_definition_code)
 *   fiscalYear     — required
 *   periodFrom     — optional, defaults to 1
 *   periodTo       — optional, defaults to 12
 *   bookCode       — optional
 *   instanceId     — optional, retrieve a specific snapshot by ID
 *   triggerContext  — optional, filter by MANUAL | PERIOD_CLOSE | SCHEDULED
 *
 * If instanceId is provided, it takes precedence over the other filters.
 * Otherwise, returns the most recent FINALIZED/PUBLISHED snapshot matching
 * the filter criteria.
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

    const instanceId = url.searchParams.get("instanceId");
    const entityCode = url.searchParams.get("entityCode");
    const statementCode = url.searchParams.get("statementCode");
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodFrom = parseInt(url.searchParams.get("periodFrom") ?? "1", 10);
    const periodTo = parseInt(url.searchParams.get("periodTo") ?? "12", 10);
    const bookCode = url.searchParams.get("bookCode") ?? null;
    const triggerContext = url.searchParams.get("triggerContext") ?? null;

    // ── Resolve the snapshot instance ──

    let instance: any = null;

    if (instanceId) {
      // Direct lookup by instance ID
      const result = await sql`
        SELECT
          si.id                     AS "instanceId",
          si.definition_id          AS "definitionId",
          si.definition_version     AS "definitionVersion",
          si.source_definition_code AS "sourceDefinitionCode",
          si.fiscal_year            AS "fiscalYear",
          si.period_from            AS "periodFrom",
          si.period_to              AS "periodTo",
          si.book_code              AS "bookCode",
          si.currency_code          AS "currencyCode",
          si.status,
          si.trigger_context        AS "triggerContext",
          si.snapshot_hash          AS "snapshotHash",
          si.period_status_at_capture AS "periodStatusAtCapture",
          si.generated_at           AS "generatedAt",
          si.generated_by           AS "generatedBy",
          si.gl_balance_as_of       AS "glBalanceAsOf",
          si.cube_refresh_run_id    AS "cubeRefreshRunId",
          si.finalized_at           AS "finalizedAt",
          si.published_at           AS "publishedAt",
          si.total_line_count       AS "totalLineCount",
          si.diagnostic_count       AS "diagnosticCount",
          si.diagnostic_error_count AS "diagnosticErrorCount",
          si.diagnostic_warning_count AS "diagnosticWarningCount",
          si.diagnostic_info_count  AS "diagnosticInfoCount",
          si.diagnostics_payload    AS "diagnosticsPayload",
          si.notes
        FROM fin.statement_instance si
        WHERE si.tenant_id = ${tenantUuid}
          AND si.id = ${instanceId}::UUID
      `.execute(db);

      if ((result.rows as any[]).length > 0) {
        instance = (result.rows as any[])[0];
      }
    } else {
      // Lookup by filters — most recent FINALIZED/PUBLISHED
      if (!entityCode) {
        return errorResponse("VALIDATION", "entityCode is required (or provide instanceId)", 400);
      }
      if (!statementCode) {
        return errorResponse("VALIDATION", "statementCode is required (or provide instanceId)", 400);
      }
      if (isNaN(fiscalYear)) {
        return errorResponse("VALIDATION", "fiscalYear is required (or provide instanceId)", 400);
      }

      const result = await sql`
        SELECT
          si.id                     AS "instanceId",
          si.definition_id          AS "definitionId",
          si.definition_version     AS "definitionVersion",
          si.source_definition_code AS "sourceDefinitionCode",
          si.fiscal_year            AS "fiscalYear",
          si.period_from            AS "periodFrom",
          si.period_to              AS "periodTo",
          si.book_code              AS "bookCode",
          si.currency_code          AS "currencyCode",
          si.status,
          si.trigger_context        AS "triggerContext",
          si.snapshot_hash          AS "snapshotHash",
          si.period_status_at_capture AS "periodStatusAtCapture",
          si.generated_at           AS "generatedAt",
          si.generated_by           AS "generatedBy",
          si.gl_balance_as_of       AS "glBalanceAsOf",
          si.cube_refresh_run_id    AS "cubeRefreshRunId",
          si.finalized_at           AS "finalizedAt",
          si.published_at           AS "publishedAt",
          si.total_line_count       AS "totalLineCount",
          si.diagnostic_count       AS "diagnosticCount",
          si.diagnostic_error_count AS "diagnosticErrorCount",
          si.diagnostic_warning_count AS "diagnosticWarningCount",
          si.diagnostic_info_count  AS "diagnosticInfoCount",
          si.diagnostics_payload    AS "diagnosticsPayload",
          si.notes
        FROM fin.statement_instance si
        WHERE si.tenant_id = ${tenantUuid}
          AND si.entity_code = ${entityCode}
          AND si.source_definition_code = ${statementCode}
          AND si.fiscal_year = ${fiscalYear}::SMALLINT
          AND si.period_from = ${periodFrom}::SMALLINT
          AND si.period_to = ${periodTo}::SMALLINT
          AND (${bookCode}::VARCHAR IS NULL OR si.book_code = ${bookCode})
          AND (${triggerContext}::VARCHAR IS NULL OR si.trigger_context = ${triggerContext})
          AND si.status IN ('FINALIZED', 'PUBLISHED')
        ORDER BY si.generated_at DESC
        LIMIT 1
      `.execute(db);

      if ((result.rows as any[]).length > 0) {
        instance = (result.rows as any[])[0];
      }
    }

    if (!instance) {
      return errorResponse(
        "NOT_FOUND",
        instanceId
          ? `Snapshot instance '${instanceId}' not found`
          : `No finalized snapshot found for ${statementCode} FY${fiscalYear} P${periodFrom}-P${periodTo}`,
        404,
      );
    }

    // ── Load snapshot lines ──

    const linesResult = await sql`
      SELECT
        sil.line_code         AS "rowCode",
        sil.label,
        sil.line_type         AS "rowType",
        sil.level             AS "depth",
        sil.sort_order        AS "sortOrder",
        sil.parent_line_code  AS "parentRowCode",
        COALESCE(sil.display_style, 'NORMAL')  AS "displayStyle",
        COALESCE(sil.sign_policy, 'NATURAL')    AS "signPolicy",
        COALESCE(sil.emphasis_style, 'NONE')    AS "emphasisStyle",
        sil.formula_expression AS "formulaExpression",
        sil.indent_level      AS "indentLevel",
        COALESCE(sil.is_expandable, FALSE) AS "isExpandable",
        COALESCE(sil.is_visible, TRUE)     AS "isVisible",
        COALESCE(sil.show_zero, FALSE)     AS "showZero",
        COALESCE(sil.current_debit, 0)     AS "amountDebit",
        COALESCE(sil.current_credit, 0)    AS "amountCredit",
        sil.current_amount                 AS "amountNet",
        COALESCE(sil.prior_debit, 0)       AS "priorDebit",
        COALESCE(sil.prior_credit, 0)      AS "priorCredit",
        COALESCE(sil.prior_amount, 0)      AS "priorNet",
        sil.variance_amount                AS "variance",
        sil.variance_pct                   AS "variancePct",
        sil.mapped_account_codes           AS "mappedAccountCodes"
      FROM fin.statement_instance_line sil
      WHERE sil.instance_id = ${instance.instanceId}::UUID
      ORDER BY sil.sort_order
    `.execute(db);

    // MC-4: convert all monetary values to string
    const rows = (linesResult.rows as any[]).map((r) => ({
      ...r,
      amountDebit: String(r.amountDebit ?? "0"),
      amountCredit: String(r.amountCredit ?? "0"),
      amountNet: String(r.amountNet ?? "0"),
      priorDebit: String(r.priorDebit ?? "0"),
      priorCredit: String(r.priorCredit ?? "0"),
      priorNet: String(r.priorNet ?? "0"),
      variance: String(r.variance ?? "0"),
      variancePct: r.variancePct != null ? String(r.variancePct) : null,
    }));

    // Build definition DTO from instance metadata
    const definition = {
      id: instance.definitionId,
      statementCode: instance.sourceDefinitionCode,
      name: instance.sourceDefinitionCode, // will be enriched below
      description: null as string | null,
      statementType: "CUSTOM" as string,
      scope: "TENANT",
      bookCode: instance.bookCode,
      isActive: true,
      version: instance.definitionVersion,
    };

    // Try to enrich with the actual definition name
    if (instance.sourceDefinitionCode) {
      const defResult = await sql`
        SELECT name, description, statement_type AS "statementType", scope
        FROM fin.rpt_statement_definition
        WHERE tenant_id = ${tenantUuid}
          AND statement_code = ${instance.sourceDefinitionCode}
        LIMIT 1
      `.execute(db);
      if ((defResult.rows as any[]).length > 0) {
        const def = (defResult.rows as any[])[0];
        definition.name = def.name;
        definition.description = def.description;
        definition.statementType = def.statementType;
        definition.scope = def.scope;
      }
    }

    // Build diagnostics summary from snapshot (if captured)
    const diagCount = instance.diagnosticCount ?? 0;
    const diagnosticSummary = diagCount > 0
      ? {
          errorCount: instance.diagnosticErrorCount ?? 0,
          warningCount: instance.diagnosticWarningCount ?? 0,
          infoCount: instance.diagnosticInfoCount ?? 0,
        }
      : undefined;

    return successResponse({
      definition,
      rows,
      fiscalYear: instance.fiscalYear,
      periodFrom: instance.periodFrom,
      periodTo: instance.periodTo,
      bookCode: instance.bookCode,
      cubeCode: null, // snapshots are cube-independent once captured
      // Diagnostics captured at snapshot time
      ...(diagCount > 0 ? { diagnosticCount: diagCount } : {}),
      ...(diagnosticSummary ? { diagnosticSummary } : {}),
      // Snapshot metadata
      snapshot: {
        instanceId: instance.instanceId,
        status: instance.status,
        triggerContext: instance.triggerContext,
        snapshotHash: instance.snapshotHash,
        periodStatusAtCapture: instance.periodStatusAtCapture,
        generatedAt: instance.generatedAt,
        glBalanceAsOf: instance.glBalanceAsOf,
        cubeRefreshRunId: instance.cubeRefreshRunId,
        finalizedAt: instance.finalizedAt,
        publishedAt: instance.publishedAt,
        totalLineCount: instance.totalLineCount,
        diagnosticCount: diagCount,
        diagnosticSummary: diagnosticSummary ?? null,
        notes: instance.notes,
      },
    });
  } catch (err) {
    console.error("[statement/snapshot/GET]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to retrieve statement snapshot",
      500,
    );
  }
}
