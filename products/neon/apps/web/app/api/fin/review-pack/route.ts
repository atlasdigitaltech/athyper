/**
 * Review Pack Assembly API — Phase 13
 *
 * GET /api/fin/review-pack?entityCode=...&fiscalYear=...&periodNumber=...
 *   → Assemble a live review pack DTO from current workspace state.
 *     Pulls: readiness, delta, brief, action items, decisions, commentary,
 *     carry-forward, certification, distribution.
 *     Returns structured sections + raw data for rendering or export.
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
// GET — assemble live review pack
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

    const entityCode = url.searchParams.get("entityCode");
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (!entityCode || isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    // Run all data-gathering queries in parallel
    const [
      closeStateResult,
      packResult,
      certResult,
      releaseResult,
      cleanCloseResult,
      distributionResult,
      overrideResult,
      actionItemsResult,
      decisionsResult,
      carryForwardResult,
      commentaryResult,
      deltaGlResult,
      deltaOverrideResult,
    ] = await Promise.all([
      // 1. Close state
      sql`
        SELECT
          cr.id AS close_run_id,
          cr.status AS close_status,
          (SELECT count(*) FROM fin.period_close_checklist cl
           WHERE cl.tenant_id = ${tenantUuid} AND cl.entity_code = ${entityCode}
             AND cl.fiscal_year = ${fiscalYear} AND cl.period_number = ${periodNumber}
          ) AS total_tasks,
          (SELECT count(*) FROM fin.period_close_checklist cl
           WHERE cl.tenant_id = ${tenantUuid} AND cl.entity_code = ${entityCode}
             AND cl.fiscal_year = ${fiscalYear} AND cl.period_number = ${periodNumber}
             AND cl.task_status = 'COMPLETED'
          ) AS completed_tasks,
          (SELECT count(*) FROM fin.period_close_checklist cl
           WHERE cl.tenant_id = ${tenantUuid} AND cl.entity_code = ${entityCode}
             AND cl.fiscal_year = ${fiscalYear} AND cl.period_number = ${periodNumber}
             AND cl.task_status = 'WAIVED'
          ) AS waived_tasks,
          (SELECT count(*) FROM fin.period_close_checklist cl
           WHERE cl.tenant_id = ${tenantUuid} AND cl.entity_code = ${entityCode}
             AND cl.fiscal_year = ${fiscalYear} AND cl.period_number = ${periodNumber}
             AND cl.task_status IN ('BLOCKED', 'FAILED')
          ) AS blocked_tasks,
          (SELECT s.readiness_score FROM fin.close_readiness_snapshot s
           WHERE s.run_id = cr.id ORDER BY s.captured_at DESC LIMIT 1
          ) AS readiness_score
        FROM fin.close_run cr
        WHERE cr.tenant_id = ${tenantUuid}
          AND cr.entity_code = ${entityCode}
          AND cr.fiscal_year = ${fiscalYear}
          AND cr.period_number = ${periodNumber}
          AND cr.status NOT IN ('CANCELLED')
        ORDER BY cr.run_number DESC LIMIT 1
      `.execute(db),

      // 2. Latest pack
      sql`
        SELECT
          pi.id, pi.status, pi.total_items, pi.items_completed,
          pd.pack_code, pd.pack_name, pd.pack_type,
          pi.generated_at, pi.reviewed_at, pi.approved_at,
          pi.finalized_at, pi.published_at,
          (SELECT count(*) FROM fin.report_pack_instance_item ii
           WHERE ii.pack_instance_id = pi.id AND ii.item_status = 'COMPLETED') AS items_generated,
          (SELECT count(*) FROM fin.report_pack_instance_item ii
           WHERE ii.pack_instance_id = pi.id AND ii.item_status = 'FAILED') AS items_failed
        FROM fin.report_pack_instance pi
        JOIN fin.report_pack_definition pd ON pd.id = pi.pack_definition_id
        WHERE pi.tenant_id = ${tenantUuid}
          AND pi.entity_code = ${entityCode}
          AND pi.fiscal_year = ${fiscalYear}
          AND pi.period_to = ${periodNumber}
          AND pi.status != 'SUPERSEDED'
        ORDER BY pi.generated_at DESC LIMIT 1
      `.execute(db),

      // 3. Certification
      sql`
        SELECT
          c.id, c.certification_status,
          c.prepared_by_name, c.prepared_at,
          c.reviewed_by_name, c.reviewed_at, c.review_notes,
          c.approved_by_name, c.approved_at, c.approval_notes,
          c.certified_by_name, c.certified_at, c.certification_notes,
          c.readiness_score_at_cert,
          c.active_override_count, c.override_impact_total
        FROM fin.pack_certification c
        JOIN fin.report_pack_instance pi ON pi.id = c.pack_instance_id
        WHERE c.tenant_id = ${tenantUuid}
          AND pi.entity_code = ${entityCode}
          AND pi.fiscal_year = ${fiscalYear}
          AND pi.period_to = ${periodNumber}
          AND c.certification_status NOT IN ('REJECTED', 'INVALIDATED')
        ORDER BY c.created_at DESC LIMIT 1
      `.execute(db),

      // 4. Release
      sql`
        SELECT
          r.id, r.release_code, r.release_name, r.status,
          r.is_clean_close, r.override_count, r.readiness_score,
          r.released_at
        FROM fin.pack_release r
        WHERE r.tenant_id = ${tenantUuid}
          AND r.entity_code = ${entityCode}
          AND r.fiscal_year = ${fiscalYear}
          AND r.period_to = ${periodNumber}
          AND r.status NOT IN ('CANCELLED', 'SUPERSEDED')
        ORDER BY r.created_at DESC LIMIT 1
      `.execute(db),

      // 5. Clean close
      sql`
        SELECT fin.evaluate_clean_close(
          ${tenantUuid}::uuid, ${entityCode}::varchar, ${fiscalYear}::smallint, ${periodNumber}::smallint
        ) AS result
      `.execute(db),

      // 6. Distribution
      sql`
        SELECT
          count(*) AS total_distributions,
          count(*) FILTER (WHERE d.status = 'SENT') AS sent_count,
          sum(d.recipient_count) AS total_recipients,
          sum(d.delivered_count) AS total_delivered,
          sum(d.viewed_count) AS total_viewed
        FROM fin.pack_distribution d
        JOIN fin.report_pack_instance pi ON pi.id = d.pack_instance_id
        WHERE d.tenant_id = ${tenantUuid}
          AND pi.entity_code = ${entityCode}
          AND pi.fiscal_year = ${fiscalYear}
          AND pi.period_to = ${periodNumber}
      `.execute(db),

      // 7. Active overrides
      sql`
        SELECT
          count(*) AS active_count,
          coalesce(sum(o.impact_amount), 0) AS total_impact,
          json_agg(json_build_object(
            'override_type', o.override_type,
            'description', o.description,
            'impact_amount', o.impact_amount,
            'approved_by_name', o.approved_by_name,
            'approved_at', o.approved_at
          ) ORDER BY abs(o.impact_amount) DESC) FILTER (WHERE o.id IS NOT NULL) AS overrides
        FROM fin.close_override o
        JOIN fin.close_run cr ON cr.id = o.run_id
        WHERE cr.tenant_id = ${tenantUuid}
          AND cr.entity_code = ${entityCode}
          AND cr.fiscal_year = ${fiscalYear}
          AND cr.period_number = ${periodNumber}
          AND o.status = 'APPROVED'
          AND o.effective_from <= now()
          AND (o.effective_to IS NULL OR o.effective_to > now())
      `.execute(db),

      // 8. Open action items
      sql`
        SELECT
          id, title, detail, severity, priority, category,
          status, source, assigned_role, due_at,
          created_by_name, created_at
        FROM fin.action_item
        WHERE tenant_id = ${tenantUuid}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
        ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          priority ASC NULLS LAST
      `.execute(db),

      // 9. Decisions
      sql`
        SELECT
          id, decision_type, title, rationale,
          decided_by_name, decided_at
        FROM fin.decision_log
        WHERE tenant_id = ${tenantUuid}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
        ORDER BY decided_at DESC
      `.execute(db),

      // 10. Carry-forward items
      sql`
        SELECT
          fl.id, fl.source_kind, fl.reason, fl.carry_note,
          fl.source_period, fl.source_fy,
          fl.resolved, fl.resolved_at,
          ai.title AS source_title,
          ai.severity AS source_severity
        FROM fin.followup_link fl
        LEFT JOIN fin.action_item ai ON ai.id = fl.source_id AND fl.source_kind = 'action_item'
        WHERE fl.tenant_id = ${tenantUuid}
          AND fl.entity_code = ${entityCode}
          AND fl.target_fy = ${fiscalYear}
          AND fl.target_period = ${periodNumber}
        ORDER BY fl.resolved ASC, fl.created_at DESC
      `.execute(db),

      // 11. Commentary (pack-level)
      sql`
        SELECT
          rc.id, rc.commentary_type, rc.title, rc.body,
          rc.version, rc.author_name, rc.created_at
        FROM fin.report_commentary rc
        JOIN fin.report_pack_instance pi ON pi.id = rc.target_id
        WHERE rc.tenant_id = ${tenantUuid}
          AND rc.target_kind = 'pack_instance'
          AND rc.is_current = TRUE
          AND pi.entity_code = ${entityCode}
          AND pi.fiscal_year = ${fiscalYear}
          AND pi.period_to = ${periodNumber}
        ORDER BY rc.commentary_type, rc.created_at DESC
      `.execute(db),

      // 12. Top GL changes (material movements)
      sql`
        SELECT
          a.account_code, a.account_name, a.account_type,
          gb.closing_debit - gb.closing_credit AS balance
        FROM fin.gl_balance gb
        JOIN fin.chart_of_accounts a ON a.id = gb.account_id
        WHERE gb.tenant_id = ${tenantUuid}
          AND gb.entity_code = ${entityCode}
          AND gb.fiscal_year = ${fiscalYear}
          AND gb.period_number = ${periodNumber}
        ORDER BY abs(gb.closing_debit - gb.closing_credit) DESC
        LIMIT 10
      `.execute(db),

      // 13. Override changes (for controls section)
      sql`
        SELECT count(*) AS total_overrides,
          count(*) FILTER (WHERE o.status = 'APPROVED') AS approved_count,
          count(*) FILTER (WHERE o.status = 'PENDING') AS pending_count
        FROM fin.close_override o
        JOIN fin.close_run cr ON cr.id = o.run_id
        WHERE cr.tenant_id = ${tenantUuid}
          AND cr.entity_code = ${entityCode}
          AND cr.fiscal_year = ${fiscalYear}
          AND cr.period_number = ${periodNumber}
      `.execute(db),
    ]);

    const closeState = (closeStateResult.rows as any[])[0] ?? null;
    const pack = (packResult.rows as any[])[0] ?? null;
    const cert = (certResult.rows as any[])[0] ?? null;
    const release = (releaseResult.rows as any[])[0] ?? null;
    const cleanClose = (cleanCloseResult.rows as any[])[0]?.result ?? null;
    const distribution = (distributionResult.rows as any[])[0] ?? null;
    const overrideData = (overrideResult.rows as any[])[0] ?? { active_count: 0, total_impact: 0 };
    const actionItems = actionItemsResult.rows as any[];
    const decisions = decisionsResult.rows as any[];
    const carryForward = carryForwardResult.rows as any[];
    const commentary = commentaryResult.rows as any[];
    const topGlChanges = deltaGlResult.rows as any[];
    const overrideSummary = (deltaOverrideResult.rows as any[])[0] ?? {};

    // Compute readiness score
    const totalTasks = Number(closeState?.total_tasks ?? 0);
    const completedTasks = Number(closeState?.completed_tasks ?? 0);
    const waivedTasks = Number(closeState?.waived_tasks ?? 0);
    const closePct = totalTasks > 0 ? Math.round(((completedTasks + waivedTasks) / totalTasks) * 100) : 0;

    const certScore =
      cert?.certification_status === "CERTIFIED" ? 100 :
      cert?.certification_status === "APPROVED" ? 80 :
      cert?.certification_status === "REVIEWED" ? 60 :
      cert?.certification_status === "IN_REVIEW" ? 40 : 0;

    const packPct = pack
      ? (Number(pack.total_items) > 0 ? Math.round((Number(pack.items_generated) / Number(pack.total_items)) * 100) : 0)
      : 0;

    const releaseScore =
      release?.status === "RELEASED" ? 100 :
      release?.status === "READY" ? 75 : 0;

    const readinessScore = Math.round(closePct * 0.4 + packPct * 0.25 + certScore * 0.2 + releaseScore * 0.15);

    const phase =
      release?.status === "RELEASED" ? "distribution" :
      cert ? "certification" :
      pack && closePct >= 100 ? "packGeneration" :
      "close";

    // Build blockers
    const blockers: string[] = [];
    if (closePct < 100) blockers.push(`Close ${closePct}% complete (${totalTasks - completedTasks - waivedTasks} tasks remaining)`);
    if (Number(closeState?.blocked_tasks ?? 0) > 0) blockers.push(`${closeState.blocked_tasks} task(s) blocked or failed`);
    if (pack && Number(pack.items_failed) > 0) blockers.push(`${pack.items_failed} pack item(s) failed`);
    if (Number(overrideData.active_count) > 0) blockers.push(`${overrideData.active_count} active override(s)`);

    const openActionItems = actionItems.filter((a: any) => !["resolved", "dismissed"].includes(a.status));
    const openCarryForward = carryForward.filter((c: any) => !c.resolved);

    // Build formal sections
    const sections = buildSections({
      closeState, closePct, pack, cert, release, cleanClose,
      distribution, overrideData, overrideSummary, actionItems: openActionItems,
      decisions, carryForward: openCarryForward, commentary, topGlChanges,
      readinessScore, phase, blockers, entityCode, fiscalYear, periodNumber,
    });

    return successResponse({
      data: {
        entityCode,
        fiscalYear,
        periodNumber,
        assembledAt: new Date().toISOString(),
        readinessScore,
        phase,
        blockers,
        closeState,
        pack,
        certification: cert,
        release,
        cleanClose,
        distribution,
        overrides: {
          active_count: Number(overrideData.active_count),
          total_impact: Number(overrideData.total_impact),
          details: overrideData.overrides ?? [],
        },
        actionItems,
        decisions,
        carryForward,
        commentary,
        topGlChanges,
        overrideSummary,
        sections,
        // Counts for snapshot metadata
        openActionItemCount: openActionItems.length,
        decisionCount: decisions.length,
        carryForwardCount: openCarryForward.length,
      },
    });
  } catch (error) {
    console.error("[GET /api/fin/review-pack] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to assemble review pack");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Section builder — generates formal commentary sections from workspace state
// ---------------------------------------------------------------------------

interface SectionInput {
  closeState: any;
  closePct: number;
  pack: any;
  cert: any;
  release: any;
  cleanClose: any;
  distribution: any;
  overrideData: any;
  overrideSummary: any;
  actionItems: any[];
  decisions: any[];
  carryForward: any[];
  commentary: any[];
  topGlChanges: any[];
  readinessScore: number;
  phase: string;
  blockers: string[];
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

interface ReviewSection {
  sectionKey: string;
  title: string;
  body: string;
  sourceType: "generated" | "commentary" | "data";
  itemCount?: number;
}

function buildSections(input: SectionInput): ReviewSection[] {
  const sections: ReviewSection[] = [];
  const {
    closePct, pack, cert, release, cleanClose,
    distribution, overrideData, overrideSummary, actionItems,
    decisions, carryForward, commentary, topGlChanges,
    readinessScore, phase, blockers, entityCode, fiscalYear, periodNumber,
  } = input;

  // 1. Executive Summary
  const narrativeCommentary = commentary.find((c: any) => c.commentary_type === "NARRATIVE");
  const execSummaryLines: string[] = [];
  execSummaryLines.push(
    `Pack readiness for ${entityCode} P${periodNumber} FY${fiscalYear} stands at ${readinessScore}%.`,
  );
  if (closePct >= 100) {
    execSummaryLines.push("Period close is complete.");
  } else {
    execSummaryLines.push(`Close is ${closePct}% complete.`);
  }
  if (pack) {
    execSummaryLines.push(`Management pack "${pack.pack_name}" is in ${formatStatus(pack.status)} status.`);
  }
  if (cert) {
    execSummaryLines.push(`Certification: ${formatStatus(cert.certification_status)}.`);
  }
  if (cleanClose?.is_clean) {
    execSummaryLines.push("This qualifies as a clean close.");
  } else if (cleanClose?.evaluated) {
    execSummaryLines.push("This is not a clean close.");
  }
  if (narrativeCommentary) {
    execSummaryLines.push("", narrativeCommentary.body);
  }

  sections.push({
    sectionKey: "executive_summary",
    title: "Executive Summary",
    body: execSummaryLines.join(" "),
    sourceType: narrativeCommentary ? "commentary" : "generated",
  });

  // 2. Key Exceptions & Risks
  if (blockers.length > 0 || actionItems.length > 0) {
    const lines: string[] = [];
    if (blockers.length > 0) {
      lines.push(`${blockers.length} blocker(s) identified:`);
      blockers.forEach((b) => lines.push(`  - ${b}`));
    }
    if (actionItems.length > 0) {
      const critical = actionItems.filter((a: any) => a.severity === "critical" || a.severity === "high");
      lines.push(`${actionItems.length} open action item(s)${critical.length > 0 ? ` (${critical.length} critical/high)` : ""}.`);
      critical.slice(0, 3).forEach((a: any) => lines.push(`  - [${a.severity.toUpperCase()}] ${a.title}`));
    }

    const riskCommentary = commentary.find((c: any) => c.commentary_type === "RISK");
    if (riskCommentary) lines.push("", riskCommentary.body);

    sections.push({
      sectionKey: "key_exceptions",
      title: "Key Exceptions & Risks",
      body: lines.join("\n"),
      sourceType: riskCommentary ? "commentary" : "generated",
      itemCount: blockers.length + actionItems.length,
    });
  }

  // 3. Material Financial Movements
  if (topGlChanges.length > 0) {
    const lines: string[] = [];
    lines.push("Top account balances by magnitude:");
    topGlChanges.slice(0, 5).forEach((gl: any) => {
      const balance = Number(gl.balance);
      const sign = balance >= 0 ? "Dr" : "Cr";
      lines.push(`  - ${gl.account_code} ${gl.account_name} (${gl.account_type}): ${Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${sign}`);
    });

    const highlightCommentary = commentary.find((c: any) => c.commentary_type === "HIGHLIGHT");
    if (highlightCommentary) lines.push("", highlightCommentary.body);

    sections.push({
      sectionKey: "material_movements",
      title: "Material Financial Movements",
      body: lines.join("\n"),
      sourceType: "data",
      itemCount: topGlChanges.length,
    });
  }

  // 4. Controls & Override Commentary
  const overrideCount = Number(overrideData.active_count);
  const totalOverrides = Number(overrideSummary.total_overrides ?? 0);
  if (overrideCount > 0 || totalOverrides > 0) {
    const lines: string[] = [];
    lines.push(`${overrideCount} active override(s) with total impact of ${Number(overrideData.total_impact).toLocaleString(undefined, { minimumFractionDigits: 2 })}.`);
    if (Number(overrideSummary.pending_count ?? 0) > 0) {
      lines.push(`${overrideSummary.pending_count} override(s) still pending approval.`);
    }
    if (cleanClose?.evaluated) {
      lines.push(cleanClose.is_clean
        ? "Override posture meets clean close thresholds."
        : `Override posture exceeds clean close thresholds: ${(cleanClose.disqualification_reasons ?? []).join("; ")}.`);
    }

    sections.push({
      sectionKey: "controls_overrides",
      title: "Controls & Override Commentary",
      body: lines.join(" "),
      sourceType: "generated",
      itemCount: overrideCount,
    });
  }

  // 5. Decisions & Follow-Up
  if (decisions.length > 0 || carryForward.length > 0) {
    const lines: string[] = [];
    if (decisions.length > 0) {
      lines.push(`${decisions.length} decision(s) recorded this period:`);
      decisions.slice(0, 5).forEach((d: any) => {
        lines.push(`  - [${d.decision_type.toUpperCase()}] ${d.title}${d.decided_by_name ? ` (${d.decided_by_name})` : ""}`);
      });
    }
    if (carryForward.length > 0) {
      lines.push(`${carryForward.length} carry-forward item(s) from prior period(s):`);
      carryForward.slice(0, 3).forEach((cf: any) => {
        lines.push(`  - [${cf.reason}] ${cf.source_title ?? `${cf.source_kind} item`} (from P${cf.source_period} FY${cf.source_fy})`);
      });
    }

    const actionCommentary = commentary.find((c: any) => c.commentary_type === "ACTION");
    if (actionCommentary) lines.push("", actionCommentary.body);

    sections.push({
      sectionKey: "decisions_followup",
      title: "Decisions & Required Follow-Up",
      body: lines.join("\n"),
      sourceType: actionCommentary ? "commentary" : "generated",
      itemCount: decisions.length + carryForward.length,
    });
  }

  // 6. Distribution Status (if applicable)
  if (distribution && Number(distribution.total_distributions) > 0) {
    const delivered = Number(distribution.total_delivered ?? 0);
    const recipients = Number(distribution.total_recipients ?? 0);
    const viewed = Number(distribution.total_viewed ?? 0);
    const pct = recipients > 0 ? Math.round((delivered / recipients) * 100) : 0;

    sections.push({
      sectionKey: "distribution_status",
      title: "Distribution Status",
      body: `${Number(distribution.sent_count)} distribution(s) sent. Delivery rate: ${pct}% (${delivered}/${recipients} recipients). ${viewed} recipient(s) have viewed the pack.`,
      sourceType: "data",
    });
  }

  return sections;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
