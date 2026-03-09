/**
 * Release Orchestration API (207-208)
 *
 * GET  /api/fin/releases?entityCode=...&fiscalYear=...
 *   → release dashboard list from vw_pack_release_dashboard
 *
 * GET  /api/fin/releases?releaseId=...
 *   → single release detail with decision log, overrides, notifications, SLA
 *
 * GET  /api/fin/releases?releaseId=...&view=audit-chain
 *   → audit chain from vw_pack_audit_chain
 *
 * GET  /api/fin/releases?releaseId=...&view=manifest
 *   → publication manifest items for the release's batch
 *
 * GET  /api/fin/releases?releaseId=...&view=timeline&source=...&severity=...&q=...
 *   → server-side filtered timeline from vw_release_timeline
 *
 * GET  /api/fin/releases?view=kpis&entityCode=...&fiscalYear=...
 *   → aggregated KPIs from mv_release_kpi_summary (with live fallback)
 *
 * GET  /api/fin/releases?releaseId=...&view=audit-package
 *   → bundled audit package with content hash + governed export logging
 *
 * GET  /api/fin/releases?releaseId=...&view=export-history
 *   → immutable export log from fin.release_export_log
 *
 * POST /api/fin/releases  { command, ... }
 *   → execute release commands (assemble, mark-ready, release, cancel, supersede,
 *     exception-signoff, verify-integrity)
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string) { return UUID_RE.test(v); }

// ---------------------------------------------------------------------------
// GET — dashboard list / detail / audit-chain / manifest
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
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
    const url = new URL(req.url);

    let releaseId = url.searchParams.get("releaseId");
    const view = url.searchParams.get("view");

    // Dashboard-level views (no releaseId required)
    if (!releaseId && view === "kpis") {
      return await getKPIs(db, tenantUuid, url.searchParams);
    }

    // Resolve release_code → UUID when the caller passes a code instead of a UUID
    if (releaseId && !isUuid(releaseId)) {
      const resolved = await sql`
        SELECT id FROM fin.pack_release
        WHERE release_code = ${releaseId} AND tenant_id = ${tenantUuid}
        LIMIT 1
      `.execute(db);
      const row = (resolved.rows as any[])[0];
      if (!row) {
        return errorResponse("NOT_FOUND", `Release not found: ${releaseId}`, 404);
      }
      releaseId = row.id;
    }

    // Single release sub-views
    if (releaseId) {
      if (view === "audit-chain") {
        return await getAuditChain(db, tenantUuid, releaseId);
      }
      if (view === "manifest") {
        return await getManifest(db, tenantUuid, releaseId);
      }
      if (view === "decisions") {
        return await getDecisionLog(db, tenantUuid, releaseId);
      }
      if (view === "notifications") {
        return await getNotifications(db, tenantUuid, releaseId);
      }
      if (view === "sla") {
        return await getSLASnapshot(db, tenantUuid, releaseId);
      }
      if (view === "overrides") {
        return await getOverrides(db, tenantUuid, releaseId);
      }
      if (view === "timeline") {
        return await getTimeline(db, tenantUuid, releaseId, url.searchParams);
      }
      if (view === "preflight") {
        const action = url.searchParams.get("action") ?? "release";
        return await getPreflight(db, tenantUuid, releaseId, action);
      }
      if (view === "audit-package") {
        return await getAuditPackage(db, tenantUuid, releaseId, context.userId);
      }
      if (view === "export-history") {
        return await getExportHistory(db, tenantUuid, releaseId);
      }
      return await getReleaseDetail(db, tenantUuid, releaseId);
    }

    // Dashboard list
    return await getReleaseDashboard(db, tenantUuid, url.searchParams);
  } catch (error) {
    console.error("[GET /api/fin/releases] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load release data");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — release commands
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const command = body.command as string;
    const nonce = body.nonce as string | undefined;

    if (!command) {
      return errorResponse("VALIDATION", "command is required", 400);
    }

    // Idempotency: if client sends a nonce, check if this command was already executed
    if (nonce && body.releaseId) {
      const existing = await sql`
        SELECT id, result, policy_evaluation
        FROM fin.release_decision_log
        WHERE release_id = ${body.releaseId}::uuid
          AND tenant_id = ${tenantUuid}
          AND correlation_id = ${nonce}
        LIMIT 1
      `.execute(db);
      if ((existing.rows as any[]).length > 0) {
        const prev = (existing.rows as any[])[0];
        return successResponse({
          ok: prev.result === "APPROVED",
          releaseId: body.releaseId,
          status: "current",
          message: "Command already executed (duplicate nonce)",
          command: command.toUpperCase().replace(/-/g, "_"),
          blockers: [],
          warnings: [{ code: "DUPLICATE_NONCE", message: "This command was already processed", severity: "warning" as const }],
          _idempotent: true,
        });
      }
    }

    switch (command) {
      case "assemble":
        return await cmdAssemble(db, tenantUuid, context.userId, body);
      case "mark-ready":
        return await cmdMarkReady(db, tenantUuid, context.userId, body);
      case "release":
        return await cmdRelease(db, tenantUuid, context.userId, body);
      case "cancel":
        return await cmdCancel(db, tenantUuid, context.userId, body);
      case "supersede":
        return await cmdSupersede(db, tenantUuid, context.userId, body);
      case "exception-signoff":
        return await cmdExceptionSignoff(db, tenantUuid, context.userId, body);
      case "verify-integrity":
        return await cmdVerifyIntegrity(db, tenantUuid, context.userId, body);
      default:
        return errorResponse("VALIDATION", `Unknown command: ${command}`, 400);
    }
  } catch (error) {
    console.error("[POST /api/fin/releases] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to execute release command");
  } finally {
    await redis?.quit();
  }
}

// ===========================================================================
// GET handlers
// ===========================================================================

async function getReleaseDashboard(
  db: any,
  tenantUuid: string,
  params: URLSearchParams,
) {
  const entityCode = params.get("entityCode");
  const fiscalYear = params.get("fiscalYear");
  const status = params.get("status");

  const rows = await sql`
    SELECT *
    FROM fin.vw_pack_release_dashboard
    WHERE tenant_id = ${tenantUuid}
      ${entityCode ? sql`AND entity_code = ${entityCode}` : sql``}
      ${fiscalYear ? sql`AND fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
      ${status ? sql`AND status = ${status}` : sql``}
    ORDER BY created_at DESC
    LIMIT 100
  `.execute(db);

  return successResponse({
    releases: (rows.rows as any[]).map(mapDashboardRow),
  });
}

async function getReleaseDetail(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  const rows = await sql`
    SELECT
      r.*,
      pi.status AS pack_status,
      pb.status AS batch_status,
      pb.batch_code,
      pb.manifest_item_count,
      pb.manifest_hash,
      cert.certification_status,
      cert.certified_at,
      cert.certified_by
    FROM fin.pack_release r
    LEFT JOIN fin.report_pack_instance pi ON pi.id = r.pack_instance_id
    LEFT JOIN fin.publication_batch pb ON pb.id = r.publication_batch_id
    LEFT JOIN fin.pack_certification cert ON cert.id = r.certification_id
    WHERE r.id = ${releaseId}
      AND r.tenant_id = ${tenantUuid}
  `.execute(db);

  if ((rows.rows as any[]).length === 0) {
    return errorResponse("NOT_FOUND", "Release not found", 404);
  }

  return successResponse({ release: mapReleaseDetailRow((rows.rows as any[])[0]) });
}

async function getAuditChain(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  // Get entity_code and period scope from the release first
  const relRows = await sql`
    SELECT entity_code, fiscal_year, period_from, period_to
    FROM fin.pack_release
    WHERE id = ${releaseId} AND tenant_id = ${tenantUuid}
  `.execute(db);

  const rel = (relRows.rows as any[])[0];
  if (!rel) {
    return errorResponse("NOT_FOUND", "Release not found", 404);
  }

  const rows = await sql`
    SELECT *
    FROM fin.vw_pack_audit_chain
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${rel.entity_code}
      AND fiscal_year = ${rel.fiscal_year}
      AND period_from = ${rel.period_from}
      AND period_to = ${rel.period_to}
    ORDER BY released_at DESC NULLS LAST
  `.execute(db);

  return successResponse({
    auditChain: (rows.rows as any[]).map(mapAuditChainRow),
  });
}

async function getManifest(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  const rows = await sql`
    SELECT mi.*
    FROM fin.publication_manifest_item mi
    JOIN fin.pack_release r ON r.publication_batch_id = mi.publication_batch_id
    WHERE r.id = ${releaseId}
      AND r.tenant_id = ${tenantUuid}
      AND mi.tenant_id = ${tenantUuid}
    ORDER BY mi.artifact_type, mi.definition_code, mi.period_number
  `.execute(db);

  return successResponse({
    manifestItems: (rows.rows as any[]).map(mapManifestItemRow),
  });
}

async function getDecisionLog(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  const rows = await sql`
    SELECT *
    FROM fin.release_decision_log
    WHERE release_id = ${releaseId}
      AND tenant_id = ${tenantUuid}
    ORDER BY created_at DESC
  `.execute(db);

  return successResponse({
    decisions: (rows.rows as any[]).map(mapDecisionLogRow),
  });
}

async function getNotifications(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  const rows = await sql`
    SELECT *
    FROM fin.release_notification_event
    WHERE release_id = ${releaseId}
      AND tenant_id = ${tenantUuid}
    ORDER BY created_at DESC
  `.execute(db);

  return successResponse({
    notifications: (rows.rows as any[]).map(mapNotificationRow),
  });
}

async function getSLASnapshot(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  const rows = await sql`
    SELECT *
    FROM fin.release_sla_snapshot
    WHERE release_id = ${releaseId}
      AND tenant_id = ${tenantUuid}
    ORDER BY captured_at DESC
    LIMIT 1
  `.execute(db);

  if ((rows.rows as any[]).length === 0) {
    return successResponse({ sla: null });
  }

  return successResponse({ sla: mapSLARow((rows.rows as any[])[0]) });
}

async function getOverrides(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  const rows = await sql`
    SELECT o.*
    FROM fin.close_override o
    JOIN fin.pack_release r ON r.close_run_id = o.run_id
    WHERE r.id = ${releaseId}
      AND r.tenant_id = ${tenantUuid}
      AND o.tenant_id = ${tenantUuid}
    ORDER BY o.requested_at DESC
  `.execute(db);

  return successResponse({
    overrides: (rows.rows as any[]).map(mapOverrideRow),
  });
}

// ===========================================================================
// Timeline — unified chronological view
// ===========================================================================

async function getTimeline(
  db: any,
  tenantUuid: string,
  releaseId: string,
  params?: URLSearchParams,
) {
  // Server-side filters (pushed to DB for scalability)
  const source = params?.get("source");
  const severity = params?.get("severity");
  const search = params?.get("q");
  const after = params?.get("after");
  const before = params?.get("before");
  const limit = Math.min(parseInt(params?.get("limit") ?? "200", 10), 500);

  // Use the vw_release_timeline view with WHERE pushdown.
  // Falls back to inline UNION ALL if the view doesn't exist yet.
  const rows = await sql`
    SELECT
      t.id,
      t.event_at AS timestamp,
      t.source,
      t.title,
      t.detail,
      t.severity,
      t.command,
      t.decision_result,
      t.event_code,
      t.override_reason_code,
      t.payload
    FROM fin.vw_release_timeline t
    WHERE t.release_id = ${releaseId}
      AND t.tenant_id = ${tenantUuid}
      ${source ? sql`AND t.source = ${source}` : sql``}
      ${severity ? sql`AND t.severity = ${severity}` : sql``}
      ${search ? sql`AND (t.title ILIKE ${"%" + search + "%"} OR t.detail ILIKE ${"%" + search + "%"})` : sql``}
      ${after ? sql`AND t.event_at >= ${after}::timestamptz` : sql``}
      ${before ? sql`AND t.event_at <= ${before}::timestamptz` : sql``}
    ORDER BY t.event_at DESC
    LIMIT ${limit}
  `.execute(db);

  return successResponse({
    timeline: (rows.rows as any[]).map((r) => ({
      id: r.id,
      timestamp: r.timestamp?.toISOString() ?? null,
      source: r.source,
      title: r.title,
      detail: r.detail ?? null,
      severity: r.severity,
      command: r.command ?? undefined,
      decisionResult: r.decision_result ?? undefined,
      eventCode: r.event_code ?? undefined,
      overrideReasonCode: r.override_reason_code ?? undefined,
      payload: r.payload ?? undefined,
    })),
  });
}

// ===========================================================================
// Preflight — impact summary before destructive actions
// ===========================================================================

async function getPreflight(
  db: any,
  tenantUuid: string,
  releaseId: string,
  _action: string,
) {
  const rows = await sql`
    SELECT
      r.id,
      r.release_code,
      r.release_name,
      r.status,
      r.entity_code,
      r.fiscal_year,
      r.period_from,
      r.is_clean_close,
      r.override_count,
      r.override_impact_total,
      r.requires_exception_signoff,
      r.exception_signoff_by IS NOT NULL AS has_exception_signoff,
      -- Certification count
      (SELECT count(*) FROM fin.pack_certification c
       WHERE c.pack_instance_id = r.pack_instance_id
         AND c.certification_status NOT IN ('REJECTED', 'INVALIDATED')) AS impacted_certifications,
      -- Distribution count + recipients
      (SELECT count(*) FROM fin.pack_distribution d
       WHERE d.pack_instance_id = r.pack_instance_id
         AND d.status NOT IN ('RECALLED', 'FAILED')) AS impacted_distributions,
      (SELECT COALESCE(sum(d.recipient_count), 0) FROM fin.pack_distribution d
       WHERE d.pack_instance_id = r.pack_instance_id
         AND d.status = 'SENT') AS distribution_recipient_count,
      -- Last integrity check
      (SELECT dl.created_at FROM fin.release_decision_log dl
       WHERE dl.release_id = r.id AND dl.command = 'INTEGRITY_CHECK'
       ORDER BY dl.created_at DESC LIMIT 1) AS integrity_last_checked,
      (SELECT dl.result = 'APPROVED' FROM fin.release_decision_log dl
       WHERE dl.release_id = r.id AND dl.command = 'INTEGRITY_CHECK'
       ORDER BY dl.created_at DESC LIMIT 1) AS integrity_passed
    FROM fin.pack_release r
    WHERE r.id = ${releaseId} AND r.tenant_id = ${tenantUuid}
  `.execute(db);

  const r = (rows.rows as any[])[0];
  if (!r) {
    return errorResponse("NOT_FOUND", "Release not found", 404);
  }

  // Build warnings
  const warnings: string[] = [];
  if (r.impacted_distributions > 0) {
    warnings.push(`${r.impacted_distributions} active distribution(s) with ${r.distribution_recipient_count} recipient(s) will be affected`);
  }
  if (r.impacted_certifications > 0) {
    warnings.push(`${r.impacted_certifications} certification(s) will be invalidated`);
  }
  if (!r.is_clean_close && r.override_count > 0) {
    warnings.push(`Non-clean close with ${r.override_count} override(s) totaling $${parseFloat(r.override_impact_total ?? "0").toLocaleString()}`);
  }
  if (r.integrity_passed === false) {
    warnings.push("Last integrity check FAILED — verify before proceeding");
  }
  if (r.integrity_last_checked == null) {
    warnings.push("No integrity check has been run for this release");
  }

  // ── Consistency gates ──────────────────────────────────────────────────
  // Run inline consistency checks (GL vs journal, snapshot, reconciliation)
  // These enforce DATA_INTEGRITY and RECONCILIATION gates at preflight time.
  const consistencyGates = await evaluateConsistencyGates(
    db, tenantUuid, r.entity_code, r.fiscal_year, r.period_from,
  );

  if (!consistencyGates.dataIntegrity) {
    warnings.push("DATA_INTEGRITY gate FAILED — GL balance or snapshot inconsistency detected");
  }
  if (!consistencyGates.reconciliation) {
    warnings.push("RECONCILIATION gate FAILED — bank reconciliation incomplete for this period");
  }

  return successResponse({
    preflight: {
      releaseId: r.id,
      releaseCode: r.release_code,
      releaseName: r.release_name,
      status: r.status,
      impactedCertifications: r.impacted_certifications ?? 0,
      impactedDistributions: r.impacted_distributions ?? 0,
      distributionRecipientCount: r.distribution_recipient_count ?? 0,
      overrideCount: r.override_count ?? 0,
      overrideImpactTotal: r.override_impact_total?.toString() ?? null,
      isCleanClose: r.is_clean_close,
      integrityLastChecked: r.integrity_last_checked?.toISOString() ?? null,
      integrityPassed: r.integrity_passed ?? null,
      consistencyGates: {
        dataIntegrity: consistencyGates.dataIntegrity ? "PASS" : "FAIL",
        reconciliation: consistencyGates.reconciliation ? "PASS" : "FAIL",
        checks: consistencyGates.checks,
      },
      warnings,
    },
  });
}

// ---------------------------------------------------------------------------
// Inline consistency gate evaluator (used by preflight)
// ---------------------------------------------------------------------------

async function evaluateConsistencyGates(
  db: any,
  tenantUuid: string,
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
): Promise<{
  dataIntegrity: boolean;
  reconciliation: boolean;
  checks: Array<{ check: string; gate: string; status: string; message: string }>;
}> {
  const checks: Array<{ check: string; gate: string; status: string; message: string }> = [];
  const bookCode = "STAT";

  // CHECK 1: GL Balance vs Journal Lines
  try {
    const glVsJe = await sql<{ source: string; total_debit: string; total_credit: string }>`
      select 'gl_balance' as source,
             coalesce(sum(period_debit), 0)::text  as total_debit,
             coalesce(sum(period_credit), 0)::text as total_credit
      from fin.gl_balance
      where tenant_id = ${tenantUuid}::uuid
        and entity_code = ${entityCode}
        and book_code = ${bookCode}
        and fiscal_year = ${fiscalYear}
        and period_number = ${periodNumber}
      union all
      select 'journal_lines' as source,
             coalesce(sum(jl.debit_amount), 0)::text  as total_debit,
             coalesce(sum(jl.credit_amount), 0)::text as total_credit
      from fin.journal_line jl
      join fin.journal_entry je on je.id = jl.je_id and je.tenant_id = jl.tenant_id
      where je.tenant_id = ${tenantUuid}::uuid
        and je.entity_code = ${entityCode}
        and je.book_code = ${bookCode}
        and je.fiscal_year = ${fiscalYear}
        and je.period_number = ${periodNumber}
        and je.status = 'POSTED'
    `.execute(db);

    const gl = glVsJe.rows.find((r) => r.source === "gl_balance");
    const je = glVsJe.rows.find((r) => r.source === "journal_lines");

    if (!je || (je.total_debit === "0" && je.total_credit === "0")) {
      checks.push({ check: "GL_BALANCE_VS_JOURNAL", gate: "DATA_INTEGRITY", status: "SKIP", message: "No posted JEs" });
    } else if (gl && gl.total_debit === je.total_debit && gl.total_credit === je.total_credit) {
      checks.push({ check: "GL_BALANCE_VS_JOURNAL", gate: "DATA_INTEGRITY", status: "PASS", message: "GL matches journal truth" });
    } else {
      checks.push({ check: "GL_BALANCE_VS_JOURNAL", gate: "DATA_INTEGRITY", status: "FAIL", message: "GL balance mismatch" });
    }
  } catch {
    checks.push({ check: "GL_BALANCE_VS_JOURNAL", gate: "DATA_INTEGRITY", status: "SKIP", message: "Could not evaluate" });
  }

  // CHECK 2: Bank reconciliation completeness
  try {
    const recon = await sql<{ total: number; incomplete: number }>`
      select
        count(*)::int as total,
        count(*) filter (
          where rs.status is distinct from 'COMPLETED'
             or coalesce(rs.unmatched, 0) > 0
             or abs(coalesce(rs.discrepancy, 0)) > 0.01
        )::int as incomplete
      from fin.bank_statement bs
      left join lateral (
        select * from fin.reconciliation_session r
        where r.statement_id = bs.id and r.tenant_id = bs.tenant_id
        order by r.created_at desc limit 1
      ) rs on true
      where bs.tenant_id = ${tenantUuid}::uuid
        and bs.entity_code = ${entityCode}
        and bs.period_end >= (
          select fp.start_date from fin.fiscal_period fp
          where fp.tenant_id = ${tenantUuid}::uuid
            and fp.entity_code = ${entityCode}
            and fp.fiscal_year = ${fiscalYear}
            and fp.period_number = ${periodNumber}
        )
        and bs.period_start <= (
          select fp.end_date from fin.fiscal_period fp
          where fp.tenant_id = ${tenantUuid}::uuid
            and fp.entity_code = ${entityCode}
            and fp.fiscal_year = ${fiscalYear}
            and fp.period_number = ${periodNumber}
        )
    `.execute(db);

    const row = recon.rows[0];
    if (!row || row.total === 0) {
      checks.push({ check: "BANK_RECONCILIATION", gate: "RECONCILIATION", status: "SKIP", message: "No bank statements for period" });
    } else if (row.incomplete === 0) {
      checks.push({ check: "BANK_RECONCILIATION", gate: "RECONCILIATION", status: "PASS", message: `${row.total} statement(s) reconciled` });
    } else {
      checks.push({ check: "BANK_RECONCILIATION", gate: "RECONCILIATION", status: "FAIL", message: `${row.incomplete}/${row.total} statement(s) incomplete` });
    }
  } catch {
    checks.push({ check: "BANK_RECONCILIATION", gate: "RECONCILIATION", status: "SKIP", message: "Could not evaluate" });
  }

  return {
    dataIntegrity: !checks.some((c) => c.gate === "DATA_INTEGRITY" && c.status === "FAIL"),
    reconciliation: !checks.some((c) => c.gate === "RECONCILIATION" && c.status === "FAIL"),
    checks,
  };
}

// ===========================================================================
// KPIs — dashboard-level aggregate metrics
// ===========================================================================

async function getKPIs(
  db: any,
  tenantUuid: string,
  params: URLSearchParams,
) {
  const entityCode = params.get("entityCode");
  const fiscalYear = params.get("fiscalYear");

  // Try materialized view first (fast path). Falls back to live aggregate if view doesn't exist.
  let rows;
  try {
    rows = await sql`
      SELECT
        COALESCE(sum(in_progress), 0) AS in_progress,
        COALESCE(sum(policy_blocked), 0) AS policy_blocked,
        COALESCE(sum(awaiting_exception_signoff), 0) AS awaiting_exception_signoff,
        COALESCE(sum(superseded_count), 0) AS superseded_count,
        COALESCE(sum(released_count), 0) AS released_count,
        avg(avg_release_hours) AS avg_release_hours,
        COALESCE(sum(integrity_failures), 0) AS integrity_failures,
        max(refreshed_at) AS refreshed_at
      FROM fin.mv_release_kpi_summary
      WHERE tenant_id = ${tenantUuid}
        ${entityCode ? sql`AND entity_code = ${entityCode}` : sql``}
        ${fiscalYear ? sql`AND fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
    `.execute(db);
  } catch {
    // Materialized view not yet created — fall back to live aggregate
    rows = await sql`
      SELECT
        count(*) FILTER (WHERE status IN ('ASSEMBLING', 'READY')) AS in_progress,
        count(*) FILTER (WHERE status IN ('ASSEMBLING', 'READY')
          AND is_clean_close = false) AS policy_blocked,
        count(*) FILTER (WHERE requires_exception_signoff = true
          AND exception_signoff_by IS NULL
          AND status IN ('ASSEMBLING', 'READY')) AS awaiting_exception_signoff,
        count(*) FILTER (WHERE status = 'SUPERSEDED') AS superseded_count,
        count(*) FILTER (WHERE status = 'RELEASED') AS released_count,
        avg(EXTRACT(EPOCH FROM (released_at - assembled_at)) / 3600.0)
          FILTER (WHERE released_at IS NOT NULL AND assembled_at IS NOT NULL) AS avg_release_hours,
        (SELECT count(*) FROM fin.release_decision_log dl
         WHERE dl.tenant_id = ${tenantUuid}
           AND dl.command = 'INTEGRITY_CHECK'
           AND dl.result = 'BLOCKED'
           ${entityCode ? sql`AND dl.entity_code = ${entityCode}` : sql``}
           ${fiscalYear ? sql`AND EXISTS (
             SELECT 1 FROM fin.pack_release r2
             WHERE r2.id = dl.release_id AND r2.fiscal_year = ${parseInt(fiscalYear, 10)}
           )` : sql``}
        ) AS integrity_failures,
        NULL AS refreshed_at
      FROM fin.pack_release
      WHERE tenant_id = ${tenantUuid}
        ${entityCode ? sql`AND entity_code = ${entityCode}` : sql``}
        ${fiscalYear ? sql`AND fiscal_year = ${parseInt(fiscalYear, 10)}` : sql``}
    `.execute(db);
  }

  const r = (rows.rows as any[])[0] ?? {};

  return successResponse({
    kpis: {
      inProgress: parseInt(r.in_progress ?? "0", 10),
      policyBlocked: parseInt(r.policy_blocked ?? "0", 10),
      awaitingExceptionSignoff: parseInt(r.awaiting_exception_signoff ?? "0", 10),
      supersededCount: parseInt(r.superseded_count ?? "0", 10),
      releasedCount: parseInt(r.released_count ?? "0", 10),
      avgReleaseHours: r.avg_release_hours != null
        ? parseFloat(parseFloat(r.avg_release_hours).toFixed(1))
        : null,
      integrityFailures: parseInt(r.integrity_failures ?? "0", 10),
      refreshedAt: r.refreshed_at?.toISOString() ?? null,
    },
  });
}

// ===========================================================================
// Audit Package — bundled export of all release data
// ===========================================================================

async function getAuditPackage(
  db: any,
  tenantUuid: string,
  releaseId: string,
  userId?: string,
) {
  // Fetch all sections in parallel
  const [detailRes, decisionsRes, overridesRes, manifestRes, notificationsRes, slaRes, timelineRes] =
    await Promise.all([
      getReleaseDetail(db, tenantUuid, releaseId),
      getDecisionLog(db, tenantUuid, releaseId),
      getOverrides(db, tenantUuid, releaseId),
      getManifest(db, tenantUuid, releaseId),
      getNotifications(db, tenantUuid, releaseId),
      getSLASnapshot(db, tenantUuid, releaseId),
      getTimeline(db, tenantUuid, releaseId),
    ]);

  // Extract JSON from each Response
  const [detail, decisions, overrides, manifest, notifications, sla, timeline] =
    await Promise.all([
      detailRes.json(),
      decisionsRes.json(),
      overridesRes.json(),
      manifestRes.json(),
      notificationsRes.json(),
      slaRes.json(),
      timelineRes.json(),
    ]);

  // Run integrity check inline
  const integrityResult = await sql`
    SELECT fin.verify_release_integrity(${releaseId}::uuid) AS integrity
  `.execute(db);
  const integrity = (integrityResult.rows as any[])[0]?.integrity ?? null;

  const auditPackage = {
    exportedAt: new Date().toISOString(),
    release: detail.release ?? null,
    decisions: decisions.decisions ?? [],
    overrides: overrides.overrides ?? [],
    manifestItems: manifest.manifestItems ?? [],
    notifications: notifications.notifications ?? [],
    sla: sla.sla ?? null,
    timeline: timeline.timeline ?? [],
    integrity: integrity ? {
      valid: integrity.valid,
      checks: integrity.checks ?? [],
      checkedAt: integrity.checked_at ?? null,
    } : null,
    // Governed export metadata (populated after logging)
    exportId: null as string | null,
    contentHash: null as string | null,
  };

  // Compute SHA-256 content hash of the canonical payload.
  // Sort all arrays by id for reproducible hashing — same data always yields the same hash
  // regardless of DB query ordering or concurrent activity.
  const sortById = <T extends { id?: string }>(arr: T[]) =>
    [...arr].sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
  const canonicalPayload = JSON.stringify({
    release: auditPackage.release,
    decisions: sortById(auditPackage.decisions),
    overrides: sortById(auditPackage.overrides),
    manifestItems: sortById(auditPackage.manifestItems),
    notifications: sortById(auditPackage.notifications),
    sla: auditPackage.sla,
    timeline: sortById(auditPackage.timeline),
    integrity: auditPackage.integrity,
  });
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPayload));
  const contentHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

  auditPackage.contentHash = contentHash;

  // Log the export to fin.release_export_log for governance trail
  const entityCode = detail.release?.entityCode ?? "";
  try {
    const exportLogResult = await sql`
      SELECT fin.log_release_export(
        ${tenantUuid}::uuid,
        ${entityCode}::varchar,
        ${releaseId}::uuid,
        ${userId ?? null}::uuid,
        'EXCEL'::varchar,
        ${contentHash}::varchar
      ) AS result
    `.execute(db);
    const exportResult = (exportLogResult.rows as any[])[0]?.result;
    if (exportResult?.success) {
      auditPackage.exportId = exportResult.export_id;
    }
  } catch (err) {
    // Non-fatal — export log table may not exist yet in older deployments
    console.warn("[getAuditPackage] Failed to log export:", err);
  }

  return successResponse({ auditPackage });
}

// ===========================================================================
// Export History — governed audit export log for a release
// ===========================================================================

async function getExportHistory(
  db: any,
  tenantUuid: string,
  releaseId: string,
) {
  const rows = await sql`
    SELECT
      id,
      exported_by,
      exported_at,
      export_format,
      content_hash,
      hash_algorithm,
      included_sections,
      release_status_at_export,
      is_clean_close_at_export,
      override_count_at_export,
      integrity_valid_at_export,
      export_version
    FROM fin.release_export_log
    WHERE release_id = ${releaseId}
      AND tenant_id = ${tenantUuid}
    ORDER BY exported_at DESC
    LIMIT 50
  `.execute(db);

  return successResponse({
    exports: (rows.rows as any[]).map((r) => ({
      id: r.id,
      exportedBy: r.exported_by ?? null,
      exportedAt: r.exported_at?.toISOString() ?? null,
      exportFormat: r.export_format,
      contentHash: r.content_hash,
      hashAlgorithm: r.hash_algorithm,
      includedSections: r.included_sections ?? [],
      releaseStatusAtExport: r.release_status_at_export,
      isCleanCloseAtExport: r.is_clean_close_at_export,
      overrideCountAtExport: r.override_count_at_export ?? 0,
      integrityValidAtExport: r.integrity_valid_at_export,
      exportVersion: r.export_version ?? 1,
    })),
  });
}

// ===========================================================================
// Status snapshot helper — used by all command responses
// ===========================================================================

async function getStatusSnapshot(db: any, tenantUuid: string, releaseId: string) {
  const rows = await sql`
    SELECT
      r.status,
      r.is_clean_close,
      r.override_count,
      r.readiness_score,
      r.requires_exception_signoff,
      r.exception_signoff_by IS NOT NULL AS has_exception_signoff,
      pi.status AS pack_status,
      pb.status AS batch_status,
      cert.certification_status,
      (SELECT count(*) FROM fin.pack_distribution d
       WHERE d.pack_instance_id = r.pack_instance_id) AS distribution_count
    FROM fin.pack_release r
    LEFT JOIN fin.report_pack_instance pi ON pi.id = r.pack_instance_id
    LEFT JOIN fin.publication_batch pb ON pb.id = r.publication_batch_id
    LEFT JOIN fin.pack_certification cert ON cert.id = r.certification_id
    WHERE r.id = ${releaseId} AND r.tenant_id = ${tenantUuid}
  `.execute(db);

  const r = (rows.rows as any[])[0];
  if (!r) return undefined;

  return {
    status: r.status,
    isCleanClose: r.is_clean_close,
    overrideCount: r.override_count ?? 0,
    readinessScore: r.readiness_score?.toString() ?? null,
    requiresExceptionSignoff: r.requires_exception_signoff ?? false,
    hasExceptionSignoff: r.has_exception_signoff ?? false,
    packStatus: r.pack_status ?? null,
    batchStatus: r.batch_status ?? null,
    certificationStatus: r.certification_status ?? null,
    distributionCount: r.distribution_count ?? 0,
  };
}

// ===========================================================================
// POST command handlers — delegate to DB functions
// ===========================================================================

async function cmdAssemble(
  db: any,
  tenantUuid: string,
  userId: string,
  body: any,
) {
  const { entityCode, releaseCode, releaseName, releaseType,
    fiscalYear, periodFrom, periodTo, bookCode,
    packInstanceId, publicationBatchId, certificationId, closeRunId } = body;

  if (!entityCode || !releaseCode || !releaseName) {
    return errorResponse("VALIDATION", "entityCode, releaseCode, releaseName are required", 400);
  }

  const result = await sql`
    SELECT fin.assemble_pack_release(
      ${tenantUuid}::uuid,
      ${entityCode}::varchar,
      ${releaseCode}::varchar,
      ${releaseName}::varchar,
      ${releaseType ?? "MANAGEMENT_PACK"}::varchar,
      ${fiscalYear ?? null}::smallint,
      ${periodFrom ?? null}::smallint,
      ${periodTo ?? null}::smallint,
      ${bookCode ?? "STAT"}::varchar,
      ${packInstanceId ?? null}::uuid,
      ${publicationBatchId ?? null}::uuid,
      ${certificationId ?? null}::uuid,
      ${closeRunId ?? null}::uuid,
      ${userId}::uuid
    ) AS release_id
  `.execute(db);

  const releaseId = (result.rows as any[])[0]?.release_id;
  const snapshot = await getStatusSnapshot(db, tenantUuid, releaseId);

  return successResponse({
    ok: true,
    releaseId,
    status: "ASSEMBLING",
    message: `Release ${releaseCode} assembled`,
    command: "ASSEMBLE",
    blockers: [],
    warnings: [],
    snapshot,
  });
}

async function cmdMarkReady(
  db: any,
  tenantUuid: string,
  userId: string,
  body: any,
) {
  const { releaseId } = body;
  if (!releaseId) {
    return errorResponse("VALIDATION", "releaseId is required", 400);
  }

  // Run clean close evaluation first to get policy data for the response
  const cleanCloseResult = await sql`
    SELECT fin.evaluate_clean_close(
      ${tenantUuid}::uuid,
      (SELECT entity_code FROM fin.pack_release WHERE id = ${releaseId}),
      (SELECT fiscal_year FROM fin.pack_release WHERE id = ${releaseId}),
      (SELECT period_from FROM fin.pack_release WHERE id = ${releaseId})
    ) AS evaluation
  `.execute(db);
  const cleanCloseEval = (cleanCloseResult.rows as any[])[0]?.evaluation;

  // mark_release_ready returns JSONB: { success, release_id, ... } or { success: false, error, blockers }
  const result = await sql`
    SELECT fin.mark_release_ready(
      ${releaseId}::uuid,
      ${userId}::uuid
    ) AS result
  `.execute(db);

  const cmdResult = (result.rows as any[])[0]?.result;
  const success = cmdResult?.success === true;
  const snapshot = await getStatusSnapshot(db, tenantUuid, releaseId);

  // Build blockers/warnings from command result + clean close evaluation
  const blockers: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
  const warnings: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];

  if (!success) {
    // Use blockers from the DB function when available
    if (cmdResult?.blockers?.length) {
      for (const b of cmdResult.blockers) {
        blockers.push({ code: "READY_BLOCKED", message: b, severity: "error" });
      }
    } else {
      // Fallback: check component readiness from snapshot
      if (!snapshot?.packStatus || !["APPROVED", "FINALIZED", "PUBLISHED"].includes(snapshot.packStatus)) {
        blockers.push({ code: "PACK_NOT_READY", message: `Pack instance status: ${snapshot?.packStatus ?? "missing"}`, severity: "error" });
      }
      if (!snapshot?.batchStatus || !["FINALIZED", "PUBLISHED"].includes(snapshot.batchStatus)) {
        blockers.push({ code: "BATCH_NOT_READY", message: `Publication batch status: ${snapshot?.batchStatus ?? "missing"}`, severity: "error" });
      }
      if (!snapshot?.certificationStatus || !["APPROVED", "CERTIFIED"].includes(snapshot.certificationStatus)) {
        blockers.push({ code: "CERT_NOT_READY", message: `Certification status: ${snapshot?.certificationStatus ?? "missing"}`, severity: "error" });
      }
    }
  }

  // evaluate_clean_close uses "disqualification_reasons" (not "failure_reasons")
  const disqualReasons = cleanCloseEval?.disqualification_reasons ?? [];
  for (const reason of disqualReasons) {
    warnings.push({ code: "CLEAN_CLOSE_FAIL", message: reason, severity: "warning" });
  }
  if (snapshot?.requiresExceptionSignoff) {
    warnings.push({ code: "EXCEPTION_REQUIRED", message: "Exception signoff will be required before release", severity: "warning" });
  }

  // ── Consistency gates (DATA_INTEGRITY + RECONCILIATION) ────────────────
  // These enforce that GL balance matches journal truth and bank reconciliation
  // is complete before a release can be marked READY.
  const releaseContext = await sql<{ entity_code: string; fiscal_year: number; period_from: number }>`
    select entity_code, fiscal_year, period_from
    from fin.pack_release where id = ${releaseId}::uuid and tenant_id = ${tenantUuid}::uuid
  `.execute(db);
  const rCtx = releaseContext.rows[0];
  if (rCtx) {
    const cGates = await evaluateConsistencyGates(
      db, tenantUuid, rCtx.entity_code, rCtx.fiscal_year, rCtx.period_from,
    );
    if (!cGates.dataIntegrity) {
      blockers.push({
        code: "DATA_INTEGRITY_FAIL",
        message: "GL balance does not match journal truth — financial data inconsistency detected",
        severity: "error",
      });
    }
    if (!cGates.reconciliation) {
      blockers.push({
        code: "RECONCILIATION_FAIL",
        message: "Bank reconciliation incomplete — all statements must be reconciled before release",
        severity: "error",
      });
    }
  }

  // Re-evaluate success: if consistency gates added blockers, mark as blocked
  const finalSuccess = success && blockers.length === 0;

  // Log decision with policy data
  await logDecision(db, tenantUuid, releaseId, "MARK_READY", userId,
    finalSuccess ? "APPROVED" : "BLOCKED", { cleanCloseEval, blockers, warnings }, body.nonce);

  // evaluate_clean_close nests thresholds under "policy" and uses "is_clean" / "override_impact"
  return successResponse({
    ok: finalSuccess,
    releaseId,
    status: snapshot?.status ?? "ASSEMBLING",
    message: finalSuccess
      ? "Release marked as READY"
      : `Release cannot be marked ready — ${blockers.length} blocker(s)`,
    command: "MARK_READY",
    blockers,
    warnings,
    snapshot,
    cleanClose: cleanCloseEval ? {
      isCleanClose: cleanCloseEval.is_clean ?? false,
      overrideCount: cleanCloseEval.override_count ?? 0,
      overrideImpactTotal: cleanCloseEval.override_impact?.toString() ?? "0",
      readinessScore: cleanCloseEval.readiness_score?.toString() ?? "0",
      maxOverridesAllowed: cleanCloseEval.policy?.max_overrides ?? 0,
      minReadinessRequired: cleanCloseEval.policy?.min_readiness?.toString() ?? "0",
      maxImpactAllowed: cleanCloseEval.policy?.max_impact?.toString() ?? "0",
      requiresExceptionSignoff: cleanCloseEval.requires_exception_signoff ?? false,
      failureReasons: disqualReasons,
    } : undefined,
  });
}

async function cmdRelease(
  db: any,
  tenantUuid: string,
  userId: string,
  body: any,
) {
  const { releaseId } = body;
  if (!releaseId) {
    return errorResponse("VALIDATION", "releaseId is required", 400);
  }

  // release_pack returns JSONB: { success, release_id, decision_id, integrity, period_status_at_release }
  // or { success: false, error, blockers, integrity, decision_id }
  const result = await sql`
    SELECT fin.release_pack(
      ${releaseId}::uuid,
      ${userId}::uuid
    ) AS result
  `.execute(db);

  const cmdResult = (result.rows as any[])[0]?.result;
  const success = cmdResult?.success === true;
  const snapshot = await getStatusSnapshot(db, tenantUuid, releaseId);

  const blockers: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
  const warnings: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];

  if (!success) {
    // Use blockers from the DB function when available
    if (cmdResult?.blockers?.length) {
      for (const b of cmdResult.blockers) {
        blockers.push({ code: "RELEASE_BLOCKED", message: b, severity: "error" });
      }
    } else {
      if (snapshot?.status !== "READY") {
        blockers.push({ code: "NOT_READY", message: `Release must be in READY status (current: ${snapshot?.status})`, severity: "error" });
      }
      if (snapshot?.requiresExceptionSignoff && !snapshot?.hasExceptionSignoff) {
        blockers.push({ code: "EXCEPTION_MISSING", message: "Exception signoff required but not granted", severity: "error" });
      }
    }
    // Map integrity check failures as blockers
    const integrityChecks = cmdResult?.integrity?.checks ?? [];
    for (const c of integrityChecks) {
      if (!c.passed) {
        blockers.push({
          code: `INTEGRITY_${(c.check ?? "UNKNOWN").toUpperCase()}`,
          message: c.detail ?? `Integrity check '${c.check}' failed`,
          severity: "error",
        });
      }
    }
  }

  // Decision is already logged by the DB function (returns decision_id)

  return successResponse({
    ok: success,
    releaseId,
    status: snapshot?.status ?? "READY",
    message: success
      ? "Release completed — status is RELEASED"
      : `Release blocked — ${blockers.length} blocker(s)`,
    command: "RELEASE",
    blockers,
    warnings,
    snapshot,
  });
}

async function cmdCancel(
  db: any,
  tenantUuid: string,
  userId: string,
  body: any,
) {
  const { releaseId, reason } = body;
  if (!releaseId) {
    return errorResponse("VALIDATION", "releaseId is required", 400);
  }

  // cancel_pack_release returns JSONB: { success: true, release_id } or { success: false, error }
  const result = await sql`
    SELECT fin.cancel_pack_release(
      ${releaseId}::uuid,
      ${userId}::uuid,
      ${reason ?? null}::text
    ) AS result
  `.execute(db);

  const cmdResult = (result.rows as any[])[0]?.result;
  const success = cmdResult?.success === true;
  const snapshot = await getStatusSnapshot(db, tenantUuid, releaseId);

  const blockers: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
  if (!success) {
    blockers.push({ code: "CANCEL_DENIED", message: "Release cannot be cancelled in its current state", severity: "error" });
  }

  await logDecision(db, tenantUuid, releaseId, "CANCEL", userId,
    success ? "APPROVED" : "BLOCKED", { blockers }, body.nonce);

  return successResponse({
    ok: success,
    releaseId,
    status: snapshot?.status ?? "unknown",
    message: success ? "Release cancelled" : "Cannot cancel this release",
    command: "CANCEL",
    blockers,
    warnings: [],
    snapshot,
  });
}

async function cmdSupersede(
  db: any,
  tenantUuid: string,
  userId: string,
  body: any,
) {
  const { releaseId, correctionReleaseCode, correctionReleaseName, supersessionReason } = body;
  if (!releaseId || !correctionReleaseCode || !correctionReleaseName || !supersessionReason) {
    return errorResponse("VALIDATION",
      "releaseId, correctionReleaseCode, correctionReleaseName, supersessionReason are required", 400);
  }

  // supersede_pack_release returns JSONB: { success, old_release_id, new_release_id }
  const result = await sql`
    SELECT fin.supersede_pack_release(
      ${releaseId}::uuid,
      ${correctionReleaseCode}::varchar,
      ${correctionReleaseName}::varchar,
      ${supersessionReason}::text,
      ${userId}::uuid
    ) AS result
  `.execute(db);

  const cmdResult = (result.rows as any[])[0]?.result;
  const newReleaseId = cmdResult?.success ? cmdResult.new_release_id : null;
  const snapshot = newReleaseId
    ? await getStatusSnapshot(db, tenantUuid, newReleaseId)
    : await getStatusSnapshot(db, tenantUuid, releaseId);

  const blockers: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
  const warnings: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
  if (!newReleaseId) {
    blockers.push({ code: "SUPERSEDE_DENIED", message: "Release cannot be superseded in its current state", severity: "error" });
  } else {
    warnings.push({ code: "CERTS_INVALIDATED", message: "Certifications on the original release have been invalidated", severity: "warning" });
    warnings.push({ code: "DISTS_RECALLED", message: "Distributions from the original release should be recalled", severity: "warning" });
  }

  await logDecision(db, tenantUuid, releaseId, "SUPERSEDE", userId,
    newReleaseId ? "APPROVED" : "BLOCKED", { blockers, newReleaseId }, body.nonce);

  return successResponse({
    ok: !!newReleaseId,
    releaseId: newReleaseId ?? releaseId,
    status: snapshot?.status ?? "unknown",
    message: newReleaseId
      ? `Original release superseded. New release: ${correctionReleaseCode}`
      : "Supersession failed — check policy",
    command: "SUPERSEDE",
    blockers,
    warnings,
    snapshot,
    supersededReleaseId: newReleaseId ? releaseId : undefined,
    newReleaseId: newReleaseId ?? undefined,
  });
}

async function cmdExceptionSignoff(
  db: any,
  tenantUuid: string,
  userId: string,
  body: any,
) {
  const { releaseId, notes } = body;
  if (!releaseId || !notes) {
    return errorResponse("VALIDATION", "releaseId and notes are required", 400);
  }

  await sql`
    UPDATE fin.pack_release
    SET exception_signoff_by = ${userId}::uuid,
        exception_signoff_at = NOW(),
        exception_signoff_notes = ${notes},
        updated_at = NOW()
    WHERE id = ${releaseId}
      AND tenant_id = ${tenantUuid}
      AND requires_exception_signoff = true
      AND exception_signoff_by IS NULL
      AND status = 'READY'
  `.execute(db);

  await logDecision(db, tenantUuid, releaseId, "EXCEPTION_SIGNOFF", userId, "APPROVED", undefined, body.nonce);

  // Emit notification
  await sql`
    INSERT INTO fin.release_notification_event (
      tenant_id, entity_code, release_id,
      event_code, severity, summary, detail_payload
    )
    SELECT
      r.tenant_id, r.entity_code, r.id,
      'EXCEPTION_SIGNOFF_GRANTED', 'INFO',
      format('Exception signoff granted for release %s', r.release_code),
      jsonb_build_object(
        'release_code', r.release_code,
        'signoff_by', ${userId},
        'notes', ${notes}
      )
    FROM fin.pack_release r
    WHERE r.id = ${releaseId} AND r.tenant_id = ${tenantUuid}
  `.execute(db);

  const snapshot = await getStatusSnapshot(db, tenantUuid, releaseId);

  return successResponse({
    ok: true,
    releaseId,
    status: "READY",
    message: "Exception signoff granted — release can now proceed",
    command: "EXCEPTION_SIGNOFF",
    blockers: [],
    warnings: [],
    snapshot,
  });
}

async function cmdVerifyIntegrity(
  db: any,
  tenantUuid: string,
  userId: string,
  body: any,
) {
  const { releaseId } = body;
  if (!releaseId) {
    return errorResponse("VALIDATION", "releaseId is required", 400);
  }

  const result = await sql`
    SELECT fin.verify_release_integrity(${releaseId}::uuid) AS integrity
  `.execute(db);

  // verify_release_integrity returns JSONB: { valid, release_id, release_code, checks[], checked_at }
  // checks[].check (not check_name), and check-specific fields (hash, count, status, total, sent)
  const integrity = (result.rows as any[])[0]?.integrity;
  const overallPass = integrity?.valid ?? false;
  const snapshot = await getStatusSnapshot(db, tenantUuid, releaseId);

  const failedChecks = (integrity?.checks ?? []).filter((c: any) => !c.passed);
  const blockers = failedChecks.map((c: any) => ({
    code: `INTEGRITY_${(c.check ?? "UNKNOWN").toUpperCase()}`,
    message: c.detail ?? `Check '${c.check}' failed`,
    severity: "error" as const,
  }));

  await logDecision(db, tenantUuid, releaseId, "INTEGRITY_CHECK", userId,
    overallPass ? "APPROVED" : "BLOCKED", integrity, body.nonce);

  return successResponse({
    ok: overallPass,
    releaseId,
    status: snapshot?.status ?? "current",
    message: overallPass
      ? "All integrity checks passed"
      : `Integrity verification failed: ${failedChecks.length} check(s) failed`,
    command: "INTEGRITY_CHECK",
    blockers,
    warnings: [],
    snapshot,
    integrity: integrity ? {
      releaseId,
      overallPass,
      checks: (integrity.checks ?? []).map((c: any) => ({
        checkName: c.check,
        passed: c.passed,
        expected: c.hash ?? c.status ?? (c.count != null ? String(c.count) : null),
        actual: c.passed ? (c.hash ?? c.status ?? (c.count != null ? String(c.count) : null)) : null,
        detail: c.detail ?? null,
      })),
      checkedAt: integrity.checked_at ?? new Date().toISOString(),
    } : undefined,
  });
}

// ===========================================================================
// Helpers
// ===========================================================================

async function logDecision(
  db: any,
  tenantUuid: string,
  releaseId: string,
  command: string,
  actorId: string,
  result: string,
  policyEvaluation?: any,
  correlationId?: string | null,
) {
  // Look up entity_code from release
  const rel = await sql`
    SELECT entity_code FROM fin.pack_release
    WHERE id = ${releaseId} AND tenant_id = ${tenantUuid}
  `.execute(db);
  const entityCode = (rel.rows as any[])[0]?.entity_code;
  if (!entityCode) return;

  await sql`
    INSERT INTO fin.release_decision_log (
      tenant_id, entity_code, release_id,
      command, actor_id, policy_evaluation, result, correlation_id
    ) VALUES (
      ${tenantUuid}, ${entityCode}, ${releaseId}::uuid,
      ${command}, ${actorId}::uuid,
      ${JSON.stringify(policyEvaluation ?? {})}::jsonb,
      ${result},
      ${correlationId ?? null}
    )
  `.execute(db);
}

// ===========================================================================
// Row mappers
// ===========================================================================

function mapDashboardRow(r: any) {
  return {
    releaseCode: r.release_code,
    releaseName: r.release_name,
    releaseType: r.release_type,
    entityCode: r.entity_code,
    fiscalYear: r.fiscal_year,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    status: r.status,
    isCleanClose: r.is_clean_close,
    overrideCount: r.override_count ?? 0,
    overrideImpactTotal: r.override_impact_total?.toString() ?? null,
    readinessScore: r.readiness_score?.toString() ?? null,
    requiresExceptionSignoff: r.requires_exception_signoff ?? false,
    hasExceptionSignoff: r.has_exception_signoff ?? false,
    packStatus: r.pack_status ?? null,
    batchStatus: r.batch_status ?? null,
    certificationStatus: r.certification_status ?? null,
    manifestItemCount: r.manifest_item_count ?? null,
    hasManifestHash: r.has_manifest_hash ?? false,
    distributionCount: r.distribution_count ?? 0,
    distributionsSent: r.distributions_sent ?? 0,
    createdAt: r.created_at?.toISOString() ?? null,
    assembledAt: r.assembled_at?.toISOString() ?? null,
    readyAt: r.ready_at?.toISOString() ?? null,
    releasedAt: r.released_at?.toISOString() ?? null,
    releaseDurationHours: r.release_duration_hours != null
      ? parseFloat(r.release_duration_hours) : null,
  };
}

function mapReleaseDetailRow(r: any) {
  return {
    id: r.id,
    entityCode: r.entity_code,
    releaseCode: r.release_code,
    releaseName: r.release_name,
    description: r.description ?? null,
    fiscalYear: r.fiscal_year,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    bookCode: r.book_code,
    releaseType: r.release_type,
    packInstanceId: r.pack_instance_id ?? null,
    publicationBatchId: r.publication_batch_id ?? null,
    certificationId: r.certification_id ?? null,
    closeRunId: r.close_run_id ?? null,
    readinessSnapshotId: r.readiness_snapshot_id ?? null,
    status: r.status,
    assembledAt: r.assembled_at?.toISOString() ?? null,
    readyAt: r.ready_at?.toISOString() ?? null,
    releasedAt: r.released_at?.toISOString() ?? null,
    releasedBy: r.released_by ?? null,
    supersededAt: r.superseded_at?.toISOString() ?? null,
    supersessionReason: r.supersession_reason ?? null,
    supersedesId: r.supersedes_id ?? null,
    isCleanClose: r.is_clean_close,
    overrideCount: r.override_count ?? 0,
    overrideImpactTotal: r.override_impact_total?.toString() ?? null,
    readinessScore: r.readiness_score?.toString() ?? null,
    periodStatusAtRelease: r.period_status_at_release ?? null,
    requiresExceptionSignoff: r.requires_exception_signoff ?? false,
    exceptionSignoffBy: r.exception_signoff_by ?? null,
    exceptionSignoffAt: r.exception_signoff_at?.toISOString() ?? null,
    exceptionSignoffNotes: r.exception_signoff_notes ?? null,
    createdAt: r.created_at?.toISOString() ?? null,
    updatedAt: r.updated_at?.toISOString() ?? null,
    createdBy: r.created_by ?? null,
    // Joined component status
    packStatus: r.pack_status ?? null,
    batchStatus: r.batch_status ?? null,
    batchCode: r.batch_code ?? null,
    manifestItemCount: r.manifest_item_count ?? null,
    manifestHash: r.manifest_hash ?? null,
    certificationStatus: r.certification_status ?? null,
    certifiedAt: r.certified_at?.toISOString() ?? null,
    certifiedBy: r.certified_by ?? null,
  };
}

function mapAuditChainRow(r: any) {
  return {
    entityCode: r.entity_code,
    fiscalYear: r.fiscal_year,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    releaseCode: r.release_code ?? null,
    releaseStatus: r.release_status ?? null,
    releasedAt: r.released_at?.toISOString() ?? null,
    isCleanClose: r.is_clean_close ?? null,
    packInstanceId: r.pack_instance_id ?? null,
    packStatus: r.pack_status ?? null,
    batchCode: r.batch_code ?? null,
    batchStatus: r.batch_status ?? null,
    manifestItemCount: r.manifest_item_count ?? null,
    manifestHash: r.manifest_hash ?? null,
    certificationStatus: r.certification_status ?? null,
    certifiedAt: r.certified_at?.toISOString() ?? null,
    distributionCount: r.distribution_count ?? 0,
  };
}

function mapManifestItemRow(r: any) {
  return {
    id: r.id,
    publicationBatchId: r.publication_batch_id,
    artifactType: r.artifact_type,
    artifactId: r.artifact_id,
    definitionCode: r.definition_code ?? null,
    definitionVersion: r.definition_version ?? null,
    fiscalYear: r.fiscal_year,
    periodNumber: r.period_number,
    bookCode: r.book_code,
    publishedValue: r.published_value?.toString() ?? null,
    publishedCurrency: r.published_currency ?? null,
    dimensionSetId: r.dimension_set_id ?? null,
    artifactHash: r.artifact_hash ?? null,
    createdAt: r.created_at?.toISOString() ?? null,
  };
}

function mapDecisionLogRow(r: any) {
  return {
    id: r.id,
    entityCode: r.entity_code,
    releaseId: r.release_id,
    command: r.command,
    actorId: r.actor_id ?? null,
    policyEvaluation: r.policy_evaluation ?? {},
    result: r.result,
    correlationId: r.correlation_id ?? null,
    publicationBatchId: r.publication_batch_id ?? null,
    certificationId: r.certification_id ?? null,
    distributionId: r.distribution_id ?? null,
    createdAt: r.created_at?.toISOString() ?? null,
  };
}

function mapNotificationRow(r: any) {
  return {
    id: r.id,
    entityCode: r.entity_code,
    releaseId: r.release_id ?? null,
    eventCode: r.event_code,
    severity: r.severity,
    summary: r.summary,
    detailPayload: r.detail_payload ?? {},
    processed: r.processed ?? false,
    processedAt: r.processed_at?.toISOString() ?? null,
    createdAt: r.created_at?.toISOString() ?? null,
  };
}

function mapSLARow(r: any) {
  return {
    id: r.id,
    entityCode: r.entity_code,
    releaseId: r.release_id,
    fiscalYear: r.fiscal_year,
    periodNumber: r.period_number,
    closeStartDate: r.close_start_date ?? null,
    closeHardCloseTarget: r.close_hard_close_target ?? null,
    closeHardCloseActual: r.close_hard_close_actual ?? null,
    closeDurationHours: r.close_duration_hours?.toString() ?? null,
    assemblyDurationHours: r.assembly_duration_hours?.toString() ?? null,
    certificationWaitHours: r.certification_wait_hours?.toString() ?? null,
    exceptionSignoffWaitHours: r.exception_signoff_wait_hours?.toString() ?? null,
    releaseToDistributionHours: r.release_to_distribution_hours?.toString() ?? null,
    totalPipelineHours: r.total_pipeline_hours?.toString() ?? null,
    closeSlaMet: r.close_sla_met ?? null,
    releaseType: r.release_type ?? null,
    overrideCount: r.override_count ?? 0,
    isCleanClose: r.is_clean_close ?? null,
    capturedAt: r.captured_at?.toISOString() ?? null,
  };
}

function mapOverrideRow(r: any) {
  return {
    id: r.id,
    entityCode: r.entity_code,
    overrideScope: r.override_scope,
    runId: r.run_id,
    taskId: r.task_id ?? null,
    checklistId: r.checklist_id ?? null,
    taskCategory: r.task_category ?? null,
    reasonCode: r.reason_code,
    reasonSubcode: r.reason_subcode ?? null,
    reasonDetail: r.reason_detail ?? null,
    appliesToTransition: r.applies_to_transition ?? null,
    effectiveFrom: r.effective_from?.toISOString() ?? null,
    effectiveTo: r.effective_to?.toISOString() ?? null,
    impactAmount: r.impact_amount?.toString() ?? null,
    impactCurrency: r.impact_currency ?? null,
    status: r.status,
    requestedBy: r.requested_by,
    requestedAt: r.requested_at?.toISOString() ?? null,
    decidedBy: r.decided_by ?? null,
    decidedAt: r.decided_at?.toISOString() ?? null,
    decisionNotes: r.decision_notes ?? null,
    revokedBy: r.revoked_by ?? null,
    revokedAt: r.revoked_at?.toISOString() ?? null,
    revocationReason: r.revocation_reason ?? null,
    evidencePayload: r.evidence_payload ?? {},
    createdAt: r.created_at?.toISOString() ?? null,
  };
}
