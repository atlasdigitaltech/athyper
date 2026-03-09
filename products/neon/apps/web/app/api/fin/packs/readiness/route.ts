/**
 * Pack Readiness API — CFO Workspace
 *
 * GET /api/fin/packs/readiness?entityCode=...&fiscalYear=...&periodNumber=...
 *   -> Unified readiness assessment for the management pack pipeline
 *
 * GET /api/fin/packs/readiness?entityCode=...&fiscalYear=...&periodNumber=...&view=delta
 *   -> What changed since the last pack (materiality-aware delta analysis)
 *
 * GET /api/fin/packs/readiness?entityCode=...&fiscalYear=...&periodNumber=...&view=brief
 *   -> Executive narrative briefing (structured summary for CFO)
 *
 * GET /api/fin/packs/readiness?entityCode=...&fiscalYear=...&view=trends
 *   -> Cross-period readiness history (requires only entityCode + fiscalYear)
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
// GET
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
    const view = url.searchParams.get("view") ?? "readiness";

    if (!entityCode || isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    if (view === "delta") {
      return await handleDelta(db, tenantUuid, entityCode, fiscalYear, periodNumber);
    }

    if (view === "brief") {
      return await handleBrief(db, tenantUuid, entityCode, fiscalYear, periodNumber);
    }

    if (view === "trends") {
      return await handleTrends(db, tenantUuid, entityCode, fiscalYear);
    }

    return await handleReadiness(db, tenantUuid, entityCode, fiscalYear, periodNumber);
  } catch (error) {
    console.error("[GET /api/fin/packs/readiness] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to compute readiness");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Readiness computation
// ---------------------------------------------------------------------------

async function handleReadiness(
  db: any,
  tenantUuid: string,
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
) {
  // Run all queries in parallel
  const [
    closeStateResult,
    packResult,
    certResult,
    releaseResult,
    cleanCloseResult,
    distributionResult,
    overrideResult,
    recommendationResult,
  ] = await Promise.all([
    // 1. Close state summary
    sql`
      SELECT
        cr.id AS close_run_id,
        cr.status AS close_status,
        cr.run_number,
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
        ) AS blocked_or_failed_tasks,
        (SELECT s.readiness_score FROM fin.close_readiness_snapshot s
         WHERE s.run_id = cr.id ORDER BY s.captured_at DESC LIMIT 1
        ) AS readiness_score
      FROM fin.close_run cr
      WHERE cr.tenant_id = ${tenantUuid}
        AND cr.entity_code = ${entityCode}
        AND cr.fiscal_year = ${fiscalYear}
        AND cr.period_number = ${periodNumber}
        AND cr.status NOT IN ('CANCELLED')
      ORDER BY cr.run_number DESC
      LIMIT 1
    `.execute(db),

    // 2. Latest pack instance for this period
    sql`
      SELECT
        pi.id, pi.status, pi.total_items, pi.items_completed,
        pd.pack_code, pd.pack_name,
        pi.generated_at, pi.generated_by,
        pi.reviewed_by, pi.reviewed_at,
        pi.approved_by, pi.approved_at,
        pi.finalized_at,
        pi.published_by, pi.published_at,
        (SELECT count(*) FROM fin.report_pack_instance_item ii
         WHERE ii.pack_instance_id = pi.id AND ii.item_status = 'COMPLETED'
        ) AS items_generated,
        (SELECT count(*) FROM fin.report_pack_instance_item ii
         WHERE ii.pack_instance_id = pi.id AND ii.item_status = 'FAILED'
        ) AS items_failed,
        (SELECT count(*) FROM fin.report_pack_instance_item ii
         WHERE ii.pack_instance_id = pi.id AND ii.item_status = 'PENDING'
        ) AS items_pending
      FROM fin.report_pack_instance pi
      JOIN fin.report_pack_definition pd ON pd.id = pi.pack_definition_id
      WHERE pi.tenant_id = ${tenantUuid}
        AND pi.entity_code = ${entityCode}
        AND pi.fiscal_year = ${fiscalYear}
        AND pi.period_to = ${periodNumber}
        AND pi.status != 'SUPERSEDED'
      ORDER BY pi.generated_at DESC
      LIMIT 1
    `.execute(db),

    // 3. Certification status
    sql`
      SELECT
        c.id, c.certification_status,
        c.prepared_by, c.prepared_at, c.prepared_by_name,
        c.reviewed_by, c.reviewed_at, c.reviewed_by_name,
        c.approved_by, c.approved_at, c.approved_by_name,
        c.certified_by, c.certified_at, c.certified_by_name,
        c.readiness_score_at_cert,
        c.active_override_count,
        c.override_impact_total,
        c.period_status_at_cert
      FROM fin.pack_certification c
      JOIN fin.report_pack_instance pi ON pi.id = c.pack_instance_id
      WHERE c.tenant_id = ${tenantUuid}
        AND pi.entity_code = ${entityCode}
        AND pi.fiscal_year = ${fiscalYear}
        AND pi.period_to = ${periodNumber}
        AND c.certification_status NOT IN ('REJECTED', 'INVALIDATED')
      ORDER BY c.created_at DESC
      LIMIT 1
    `.execute(db),

    // 4. Release status
    sql`
      SELECT
        r.id, r.release_code, r.release_name, r.status,
        r.release_type, r.is_clean_close,
        r.override_count, r.override_impact_total, r.readiness_score,
        r.requires_exception_signoff,
        r.exception_signoff_by IS NOT NULL AS has_exception_signoff,
        r.assembled_at, r.ready_at, r.released_at
      FROM fin.pack_release r
      WHERE r.tenant_id = ${tenantUuid}
        AND r.entity_code = ${entityCode}
        AND r.fiscal_year = ${fiscalYear}
        AND r.period_to = ${periodNumber}
        AND r.status NOT IN ('CANCELLED', 'SUPERSEDED')
      ORDER BY r.created_at DESC
      LIMIT 1
    `.execute(db),

    // 5. Clean close evaluation
    sql`
      SELECT fin.evaluate_clean_close(
        ${tenantUuid}::uuid, ${entityCode}::varchar, ${fiscalYear}::smallint, ${periodNumber}::smallint
      ) AS result
    `.execute(db),

    // 6. Distribution summary
    sql`
      SELECT
        count(*) AS total_distributions,
        count(*) FILTER (WHERE d.status = 'SENT') AS sent_count,
        count(*) FILTER (WHERE d.status = 'DRAFT') AS draft_count,
        sum(d.recipient_count) AS total_recipients,
        sum(d.delivered_count) AS total_delivered,
        sum(d.viewed_count) AS total_viewed,
        sum(d.downloaded_count) AS total_downloaded,
        max(d.distributed_at) AS last_distributed_at
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
        coalesce(sum(o.impact_amount), 0) AS total_impact
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

    // 8. Pending close recommendations
    sql`
      SELECT count(*) AS pending_count
      FROM fin.close_action_log cal
      WHERE cal.tenant_id = ${tenantUuid}
        AND cal.entity_code = ${entityCode}
        AND cal.fiscal_year = ${fiscalYear}
        AND cal.period_number = ${periodNumber}
        AND cal.status = 'proposed'
    `.execute(db),
  ]);

  const closeState = (closeStateResult.rows as any[])[0] ?? null;
  const pack = (packResult.rows as any[])[0] ?? null;
  const cert = (certResult.rows as any[])[0] ?? null;
  const release = (releaseResult.rows as any[])[0] ?? null;
  const cleanClose = (cleanCloseResult.rows as any[])[0]?.result ?? null;
  const distribution = (distributionResult.rows as any[])[0] ?? null;
  const overrides = (overrideResult.rows as any[])[0] ?? { active_count: 0, total_impact: 0 };
  const recommendations = (recommendationResult.rows as any[])[0] ?? { pending_count: 0 };

  // Compute composite readiness
  const readiness = computeReadiness(closeState, pack, cert, release, cleanClose, overrides);

  return successResponse({
    data: {
      readiness,
      closeState,
      pack,
      certification: cert,
      release,
      cleanClose,
      distribution,
      overrides,
      pendingRecommendations: Number(recommendations.pending_count),
    },
  });
}

// ---------------------------------------------------------------------------
// Delta analysis — what changed since the last pack
// ---------------------------------------------------------------------------

async function handleDelta(
  db: any,
  tenantUuid: string,
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
) {
  // Find the most recent pack instance for this period
  const packResult = await sql`
    SELECT pi.id, pi.generated_at, pi.status
    FROM fin.report_pack_instance pi
    WHERE pi.tenant_id = ${tenantUuid}
      AND pi.entity_code = ${entityCode}
      AND pi.fiscal_year = ${fiscalYear}
      AND pi.period_to = ${periodNumber}
    ORDER BY pi.generated_at DESC
    LIMIT 1
  `.execute(db);

  const pack = (packResult.rows as any[])[0];
  if (!pack) {
    return successResponse({
      data: {
        hasPriorPack: false,
        deltas: [],
        summary: "No pack has been generated for this period yet.",
      },
    });
  }

  const packGeneratedAt = pack.generated_at;

  // Find changes since pack was generated
  const [
    glChangesResult,
    overrideChangesResult,
    taskChangesResult,
    certChangesResult,
  ] = await Promise.all([
    // GL balance changes since pack generation (with materiality context)
    sql`
      SELECT
        count(*) AS changed_accounts,
        count(DISTINCT a.account_code) AS distinct_accounts,
        sum(abs(gb.closing_debit - gb.closing_credit)) AS total_abs_balance,
        count(*) FILTER (WHERE a.account_type IN ('REVENUE', 'EXPENSE')) AS pnl_changes,
        count(*) FILTER (WHERE a.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')) AS bs_changes,
        max(abs(gb.closing_debit - gb.closing_credit)) AS max_single_balance,
        json_agg(json_build_object(
          'account_code', a.account_code,
          'account_name', a.account_name,
          'account_type', a.account_type,
          'balance', gb.closing_debit - gb.closing_credit
        ) ORDER BY abs(gb.closing_debit - gb.closing_credit) DESC) FILTER (WHERE true) AS top_changes
      FROM fin.gl_balance gb
      JOIN fin.chart_of_accounts a ON a.id = gb.account_id
      WHERE gb.tenant_id = ${tenantUuid}
        AND gb.entity_code = ${entityCode}
        AND gb.fiscal_year = ${fiscalYear}
        AND gb.period_number = ${periodNumber}
        AND gb.updated_at > ${packGeneratedAt}
    `.execute(db),

    // Override changes since pack generation
    sql`
      SELECT
        count(*) AS new_overrides,
        coalesce(sum(impact_amount), 0) AS new_override_impact
      FROM fin.close_override o
      JOIN fin.close_run cr ON cr.id = o.run_id
      WHERE cr.tenant_id = ${tenantUuid}
        AND cr.entity_code = ${entityCode}
        AND cr.fiscal_year = ${fiscalYear}
        AND cr.period_number = ${periodNumber}
        AND o.created_at > ${packGeneratedAt}
    `.execute(db),

    // Close task completions since pack generation
    sql`
      SELECT
        count(*) AS tasks_completed_since,
        count(*) FILTER (WHERE cl.task_status = 'COMPLETED') AS newly_completed,
        count(*) FILTER (WHERE cl.task_status = 'WAIVED') AS newly_waived,
        count(*) FILTER (WHERE cl.task_status = 'FAILED') AS newly_failed
      FROM fin.period_close_checklist cl
      WHERE cl.tenant_id = ${tenantUuid}
        AND cl.entity_code = ${entityCode}
        AND cl.fiscal_year = ${fiscalYear}
        AND cl.period_number = ${periodNumber}
        AND cl.updated_at > ${packGeneratedAt}
    `.execute(db),

    // Certification events since pack generation
    sql`
      SELECT
        activity_type, count(*) AS event_count
      FROM fin.pack_activity
      WHERE pack_instance_id = ${pack.id}
        AND created_at > ${packGeneratedAt}
      GROUP BY activity_type
      ORDER BY count(*) DESC
    `.execute(db),
  ]);

  const glChanges = (glChangesResult.rows as any[])[0] ?? { changed_accounts: 0 };
  const overrideChanges = (overrideChangesResult.rows as any[])[0] ?? { new_overrides: 0 };
  const taskChanges = (taskChangesResult.rows as any[])[0] ?? { tasks_completed_since: 0 };
  const certEvents = certChangesResult.rows as any[];

  const hasChanges =
    Number(glChanges.changed_accounts) > 0 ||
    Number(overrideChanges.new_overrides) > 0 ||
    Number(taskChanges.tasks_completed_since) > 0;

  // Materiality classification
  const topChanges = (glChanges.top_changes as any[] ?? []).slice(0, 10);
  const materialityInsights = classifyMateriality(glChanges, overrideChanges, topChanges);

  return successResponse({
    data: {
      hasPriorPack: true,
      packId: pack.id,
      packStatus: pack.status,
      packGeneratedAt: packGeneratedAt,
      hasChanges,
      glChanges: {
        changed_accounts: Number(glChanges.changed_accounts),
        distinct_accounts: Number(glChanges.distinct_accounts),
        total_abs_balance: Number(glChanges.total_abs_balance ?? 0),
        pnl_changes: Number(glChanges.pnl_changes ?? 0),
        bs_changes: Number(glChanges.bs_changes ?? 0),
        max_single_balance: Number(glChanges.max_single_balance ?? 0),
        topChanges,
      },
      overrideChanges,
      taskChanges,
      certificationEvents: certEvents,
      materiality: materialityInsights,
      summary: hasChanges
        ? `${Number(glChanges.changed_accounts)} GL account(s) updated, ${Number(overrideChanges.new_overrides)} new override(s), ${Number(taskChanges.tasks_completed_since)} task status change(s) since pack generation.`
        : "No material changes since pack was generated.",
    },
  });
}

// ---------------------------------------------------------------------------
// Composite readiness computation
// ---------------------------------------------------------------------------

interface ReadinessResult {
  score: number;
  phase: string;
  blockers: string[];
  nextAction: string;
  phases: {
    close: { status: string; pct: number };
    packGeneration: { status: string; pct: number };
    certification: { status: string; step: string };
    distribution: { status: string; count: number };
  };
}

function computeReadiness(
  closeState: any,
  pack: any,
  cert: any,
  release: any,
  cleanClose: any,
  overrides: any,
): ReadinessResult {
  const blockers: string[] = [];
  let phase = "close";
  let nextAction = "";

  // Phase 1: Close completion
  const totalTasks = Number(closeState?.total_tasks ?? 0);
  const completedTasks = Number(closeState?.completed_tasks ?? 0);
  const waivedTasks = Number(closeState?.waived_tasks ?? 0);
  const resolvedTasks = completedTasks + waivedTasks;
  const closePct = totalTasks > 0 ? Math.round((resolvedTasks / totalTasks) * 100) : 0;
  const closeStatus = closeState?.close_status ?? "NOT_STARTED";

  if (closePct < 100) {
    blockers.push(`Close ${closePct}% complete (${totalTasks - resolvedTasks} tasks remaining)`);
    nextAction = "Complete remaining close tasks";
  }

  const blockedOrFailed = Number(closeState?.blocked_or_failed_tasks ?? 0);
  if (blockedOrFailed > 0) {
    blockers.push(`${blockedOrFailed} task(s) blocked or failed`);
  }

  // Phase 2: Pack generation
  let packPct = 0;
  let packStatus = "NOT_GENERATED";
  if (pack) {
    packStatus = pack.status;
    const packTotal = Number(pack.total_items ?? 0);
    const packCompleted = Number(pack.items_generated ?? 0);
    packPct = packTotal > 0 ? Math.round((packCompleted / packTotal) * 100) : 0;
    if (pack.status === "GENERATING") {
      blockers.push("Pack generation in progress");
    } else if (Number(pack.items_failed) > 0) {
      blockers.push(`${pack.items_failed} pack item(s) failed to generate`);
    }
    if (closePct >= 100) phase = "packGeneration";
  } else if (closePct >= 100) {
    blockers.push("No pack generated yet");
    nextAction = nextAction || "Generate management pack";
  }

  // Phase 3: Certification
  let certStep = "NOT_STARTED";
  let certStatus = "NOT_STARTED";
  if (cert) {
    certStatus = cert.certification_status;
    certStep = cert.certification_status;
    if (pack && ["DRAFT", "REVIEWED", "APPROVED", "FINALIZED", "PUBLISHED"].includes(pack.status)) {
      phase = "certification";
    }
  } else if (pack && ["REVIEWED", "APPROVED", "FINALIZED"].includes(pack.status)) {
    nextAction = nextAction || "Start certification process";
  }

  if (certStatus === "REJECTED") {
    blockers.push("Certification was rejected");
  }

  // Phase 4: Distribution
  let distStatus = "NOT_STARTED";
  let distCount = 0;
  if (release) {
    if (release.status === "RELEASED") {
      phase = "distribution";
      distStatus = "RELEASED";
    } else if (release.status === "READY") {
      phase = "distribution";
      distStatus = "READY";
      nextAction = nextAction || "Release management pack";
    }
  }

  // Override warnings
  const activeOverrides = Number(overrides?.active_count ?? 0);
  if (activeOverrides > 0) {
    blockers.push(`${activeOverrides} active override(s) (impact: ${overrides.total_impact})`);
  }

  // Clean close check
  if (cleanClose?.evaluated && !cleanClose.is_clean) {
    const reasons = cleanClose.disqualification_reasons ?? [];
    if (reasons.length > 0 && !blockers.some((b) => b.includes("override"))) {
      blockers.push("Not a clean close: " + reasons[0]);
    }
  }

  // Default next action
  if (!nextAction) {
    if (blockers.length === 0) {
      nextAction = phase === "distribution" ? "Pack released successfully" : "Continue pipeline";
    } else {
      nextAction = "Resolve blockers";
    }
  }

  // Composite score (weighted: close 40%, pack 25%, cert 20%, release 15%)
  const certScore =
    certStatus === "CERTIFIED" ? 100 :
    certStatus === "APPROVED" ? 80 :
    certStatus === "REVIEWED" ? 60 :
    certStatus === "IN_REVIEW" ? 40 :
    certStatus === "PENDING" ? 20 : 0;

  const releaseScore =
    release?.status === "RELEASED" ? 100 :
    release?.status === "READY" ? 75 :
    release?.status === "ASSEMBLING" ? 25 : 0;

  const score = Math.round(
    closePct * 0.4 +
    packPct * 0.25 +
    certScore * 0.2 +
    releaseScore * 0.15,
  );

  return {
    score,
    phase,
    blockers,
    nextAction,
    phases: {
      close: { status: closeStatus, pct: closePct },
      packGeneration: { status: packStatus, pct: packPct },
      certification: { status: certStatus, step: certStep },
      distribution: { status: distStatus, count: distCount },
    },
  };
}

// ---------------------------------------------------------------------------
// Materiality classification
// ---------------------------------------------------------------------------

interface MaterialityInsight {
  hasMaterialChanges: boolean;
  materialPnLChanges: number;
  materialBSChanges: number;
  largestChange: { accountCode: string; accountName: string; accountType: string; balance: number } | null;
  riskLevel: "none" | "low" | "medium" | "high";
  insights: string[];
}

function classifyMateriality(
  glChanges: any,
  overrideChanges: any,
  topChanges: any[],
): MaterialityInsight {
  const insights: string[] = [];
  const pnlChanges = Number(glChanges.pnl_changes ?? 0);
  const bsChanges = Number(glChanges.bs_changes ?? 0);
  const maxBalance = Number(glChanges.max_single_balance ?? 0);
  const overrideImpact = Number(overrideChanges.new_override_impact ?? 0);

  // Determine if P&L changes are present (more impactful for management reporting)
  if (pnlChanges > 0) {
    insights.push(`${pnlChanges} P&L account(s) changed — may affect reported performance`);
  }
  if (bsChanges > 0) {
    insights.push(`${bsChanges} balance sheet account(s) changed`);
  }
  if (overrideImpact > 0) {
    insights.push(`New overrides with ${overrideImpact.toLocaleString()} total impact`);
  }

  const largest = topChanges.length > 0 ? topChanges[0] : null;
  if (largest && Math.abs(Number(largest.balance)) > 0) {
    insights.push(
      `Largest change: ${largest.account_name} (${largest.account_code}) at ${Math.abs(Number(largest.balance)).toLocaleString()}`,
    );
  }

  // Risk classification based on change magnitude and type
  let riskLevel: MaterialityInsight["riskLevel"] = "none";
  if (pnlChanges > 0 || overrideImpact > 0) {
    riskLevel = "medium";
  }
  if (pnlChanges > 5 || overrideImpact > 10000) {
    riskLevel = "high";
  }
  if (pnlChanges === 0 && bsChanges === 0 && overrideImpact === 0) {
    riskLevel = "none";
  } else if (riskLevel === "none") {
    riskLevel = "low";
  }

  return {
    hasMaterialChanges: pnlChanges > 0 || overrideImpact > 0,
    materialPnLChanges: pnlChanges,
    materialBSChanges: bsChanges,
    largestChange: largest
      ? {
          accountCode: largest.account_code,
          accountName: largest.account_name,
          accountType: largest.account_type,
          balance: Number(largest.balance),
        }
      : null,
    riskLevel,
    insights,
  };
}

// ---------------------------------------------------------------------------
// Executive briefing — structured narrative for CFO
// ---------------------------------------------------------------------------

async function handleBrief(
  db: any,
  tenantUuid: string,
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
) {
  // Reuse the readiness computation
  const readinessResponse = await handleReadiness(db, tenantUuid, entityCode, fiscalYear, periodNumber);
  const readinessBody = await readinessResponse.json();
  const data = readinessBody.data;

  if (!data) {
    return successResponse({ data: { paragraphs: [], attentionItems: [] } });
  }

  const paragraphs: string[] = [];
  const attentionItems: { priority: number; severity: "critical" | "high" | "medium" | "info"; title: string; detail: string }[] = [];

  // 1. Readiness overview paragraph
  const rd = data.readiness;
  paragraphs.push(
    `Pack readiness is ${rd.score}%. ` +
    phaseNarrative(rd.phase, rd.phases) +
    (rd.blockers.length > 0
      ? ` There ${rd.blockers.length === 1 ? "is" : "are"} ${rd.blockers.length} blocker(s) preventing progression.`
      : " The pipeline is unblocked."),
  );

  // 2. Close state paragraph
  const cs = data.closeState;
  if (cs) {
    const closePct = rd.phases.close.pct;
    if (closePct >= 100) {
      paragraphs.push(`Close is complete (${cs.completed_tasks} completed, ${cs.waived_tasks} waived).`);
    } else {
      const remaining = Number(cs.total_tasks) - Number(cs.completed_tasks) - Number(cs.waived_tasks);
      paragraphs.push(
        `Close is ${closePct}% complete with ${remaining} task(s) remaining. ` +
        (Number(cs.blocked_or_failed_tasks) > 0
          ? `${cs.blocked_or_failed_tasks} task(s) are blocked or failed and require attention.`
          : "All in-flight tasks are progressing normally."),
      );
    }
  }

  // 3. Clean close paragraph
  const cc = data.cleanClose;
  if (cc?.evaluated) {
    if (cc.is_clean) {
      paragraphs.push("This qualifies as a clean close — no overrides, all mandatory tasks completed.");
    } else {
      const reasons = (cc.disqualification_reasons ?? []).join("; ");
      paragraphs.push(
        `This is not a clean close. ${reasons}. ` +
        (cc.requires_exception_signoff ? "Exception sign-off is required before release." : ""),
      );
    }
  }

  // 4. Certification paragraph
  const cert = data.certification;
  if (cert) {
    paragraphs.push(certificationNarrative(cert));
  }

  // 5. Distribution paragraph
  const dist = data.distribution;
  if (dist && Number(dist.total_distributions) > 0) {
    const sentPct = Number(dist.total_recipients) > 0
      ? Math.round((Number(dist.total_delivered) / Number(dist.total_recipients)) * 100)
      : 0;
    const unviewed = Number(dist.total_recipients) - Number(dist.total_viewed);
    paragraphs.push(
      `Distribution is ${sentPct}% delivered. ` +
      (unviewed > 0 ? `${unviewed} recipient(s) have not viewed the pack.` : "All recipients have viewed the pack."),
    );
  }

  // Build attention items from blockers
  for (const [i, blocker] of rd.blockers.entries()) {
    attentionItems.push({
      priority: i + 1,
      severity: i === 0 ? "critical" : i < 3 ? "high" : "medium",
      title: blocker,
      detail: blocker,
    });
  }

  // Add pending recommendations as attention item
  if (data.pendingRecommendations > 0) {
    attentionItems.push({
      priority: attentionItems.length + 1,
      severity: "medium",
      title: `${data.pendingRecommendations} pending close recommendation(s)`,
      detail: "Close recommendations have been generated by the policy engine and are awaiting review.",
    });
  }

  // Add override attention if present
  if (Number(data.overrides?.active_count) > 0 && !attentionItems.some((a) => a.title.includes("override"))) {
    attentionItems.push({
      priority: attentionItems.length + 1,
      severity: "high",
      title: `${data.overrides.active_count} active override(s) with ${Number(data.overrides.total_impact).toLocaleString()} impact`,
      detail: "Active overrides may prevent clean close designation.",
    });
  }

  return successResponse({
    data: {
      paragraphs,
      attentionItems: attentionItems.slice(0, 5), // Top 5
      readinessScore: rd.score,
      phase: rd.phase,
      generatedAt: new Date().toISOString(),
    },
  });
}

function phaseNarrative(phase: string, phases: any): string {
  switch (phase) {
    case "close":
      return `Close is the current phase at ${phases.close.pct}% completion.`;
    case "packGeneration":
      return `Pack generation is in progress (${phases.packGeneration.pct}% items generated).`;
    case "certification":
      return `Certification is the current bottleneck (status: ${phases.certification.step}).`;
    case "distribution":
      return phases.distribution.status === "RELEASED"
        ? "The pack has been released and distributed."
        : "The release is ready for final sign-off.";
    default:
      return "";
  }
}

function certificationNarrative(cert: any): string {
  const status = cert.certification_status;
  switch (status) {
    case "PENDING":
      return `Certification has been prepared${cert.prepared_by_name ? ` by ${cert.prepared_by_name}` : ""} and is awaiting review.`;
    case "IN_REVIEW":
      return "Certification is currently under review.";
    case "REVIEWED":
      return `Certification has been reviewed${cert.reviewed_by_name ? ` by ${cert.reviewed_by_name}` : ""} and is awaiting approval.`;
    case "APPROVED":
      return `Certification has been approved${cert.approved_by_name ? ` by ${cert.approved_by_name}` : ""} and is ready for final certification.`;
    case "CERTIFIED":
      return `Pack has been certified${cert.certified_by_name ? ` by ${cert.certified_by_name}` : ""}${cert.certified_at ? ` on ${new Date(cert.certified_at).toLocaleDateString()}` : ""}.`;
    default:
      return `Certification status: ${status}.`;
  }
}

// ---------------------------------------------------------------------------
// Cross-period readiness trends
// ---------------------------------------------------------------------------

async function handleTrends(
  db: any,
  tenantUuid: string,
  entityCode: string,
  fiscalYear: number,
) {
  // Get readiness data for all periods in the fiscal year
  const result = await sql`
    SELECT
      cc.period_number,
      cc.close_type,
      cc.soft_close_target,
      cc.hard_close_target,
      cc.soft_close_actual,
      cc.hard_close_actual,
      cc.target_working_days,
      cc.actual_working_days,
      cr.status AS close_status,
      cr.run_number,
      -- Latest readiness snapshot
      (SELECT s.readiness_score FROM fin.close_readiness_snapshot s
       WHERE s.run_id = cr.id ORDER BY s.captured_at DESC LIMIT 1
      ) AS readiness_score,
      (SELECT s.completion_pct FROM fin.close_readiness_snapshot s
       WHERE s.run_id = cr.id ORDER BY s.captured_at DESC LIMIT 1
      ) AS completion_pct,
      (SELECT s.sla_status FROM fin.close_readiness_snapshot s
       WHERE s.run_id = cr.id ORDER BY s.captured_at DESC LIMIT 1
      ) AS sla_status,
      (SELECT s.open_exceptions FROM fin.close_readiness_snapshot s
       WHERE s.run_id = cr.id ORDER BY s.captured_at DESC LIMIT 1
      ) AS open_exceptions,
      (SELECT s.critical_exceptions FROM fin.close_readiness_snapshot s
       WHERE s.run_id = cr.id ORDER BY s.captured_at DESC LIMIT 1
      ) AS critical_exceptions,
      -- Pack status
      (SELECT pi.status FROM fin.report_pack_instance pi
       WHERE pi.tenant_id = ${tenantUuid} AND pi.entity_code = ${entityCode}
         AND pi.fiscal_year = ${fiscalYear} AND pi.period_to = cc.period_number
         AND pi.status != 'SUPERSEDED'
       ORDER BY pi.generated_at DESC LIMIT 1
      ) AS pack_status,
      -- Certification status
      (SELECT c.certification_status FROM fin.pack_certification c
       JOIN fin.report_pack_instance pi ON pi.id = c.pack_instance_id
       WHERE c.tenant_id = ${tenantUuid} AND pi.entity_code = ${entityCode}
         AND pi.fiscal_year = ${fiscalYear} AND pi.period_to = cc.period_number
       ORDER BY c.created_at DESC LIMIT 1
      ) AS certification_status,
      -- Override count
      (SELECT count(*) FROM fin.close_override o
       WHERE o.run_id = cr.id AND o.status = 'APPROVED'
      ) AS override_count,
      -- Clean close evaluation
      (SELECT (fin.evaluate_clean_close(
        ${tenantUuid}::uuid, ${entityCode}::varchar, ${fiscalYear}::smallint, cc.period_number
      ))->>'is_clean') AS is_clean_close
    FROM fin.close_calendar cc
    LEFT JOIN fin.close_run cr ON cr.tenant_id = cc.tenant_id
      AND cr.entity_code = cc.entity_code
      AND cr.fiscal_year = cc.fiscal_year
      AND cr.period_number = cc.period_number
      AND cr.status NOT IN ('CANCELLED')
    WHERE cc.tenant_id = ${tenantUuid}
      AND cc.entity_code = ${entityCode}
      AND cc.fiscal_year = ${fiscalYear}
    ORDER BY cc.period_number ASC
  `.execute(db);

  const periods = result.rows as any[];

  // Compute trends
  const scores = periods
    .filter((p) => p.readiness_score != null)
    .map((p) => Number(p.readiness_score));
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const cleanCloseCount = periods.filter((p) => p.is_clean_close === "true" || p.is_clean_close === true).length;
  const closedPeriods = periods.filter((p) =>
    p.close_status === "HARD_CLOSED" || p.close_status === "SOFT_CLOSED",
  ).length;

  // SLA performance
  const slaBreaches = periods.filter((p) => p.sla_status === "BREACHED").length;
  const slaMet = periods.filter((p) => p.sla_status === "ON_TRACK" || p.close_status === "HARD_CLOSED").length;

  // Working days trend
  const daysData = periods
    .filter((p) => p.actual_working_days != null && p.target_working_days != null)
    .map((p) => ({
      period: p.period_number,
      target: Number(p.target_working_days),
      actual: Number(p.actual_working_days),
      variance: Number(p.actual_working_days) - Number(p.target_working_days),
    }));

  return successResponse({
    data: {
      fiscalYear,
      entityCode,
      periods,
      summary: {
        totalPeriods: periods.length,
        closedPeriods,
        averageReadinessScore: avgScore,
        cleanCloseCount,
        cleanCloseRate: closedPeriods > 0 ? Math.round((cleanCloseCount / closedPeriods) * 100) : null,
        slaBreaches,
        slaMet,
        avgWorkingDays: daysData.length > 0
          ? Math.round(daysData.reduce((a, d) => a + d.actual, 0) / daysData.length * 10) / 10
          : null,
      },
      workingDaysTrend: daysData,
    },
  });
}
