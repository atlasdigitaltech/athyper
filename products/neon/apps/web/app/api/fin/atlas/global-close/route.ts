/**
 * Atlas Global Close Monitor API
 *
 * GET /api/fin/atlas/global-close?parentEntityCode=LE-CA&fiscalYear=2026&periodNumber=3
 *   → Multi-entity close intelligence for a parent entity and all subsidiaries
 *
 * Phase 1: Per-entity close status, readiness, anomaly counts, risk score, release status.
 *          Consolidated group risk score, delayed close ranking, IC settlement progress.
 *
 * Phase 2: Cross-entity anomaly patterns & hotspot accounts, IC settlement intelligence
 *          (aging buckets, net exposure), enhanced critical path with projected completion,
 *          group narrative (dashboard summary + CFO brief + delay explanation).
 *
 * Phase 3: Global close forecasting — historical-data-driven per-entity statistical forecast,
 *          group-level predicted completion, SLA breach probability, confidence intervals,
 *          readiness trajectory (improving/stable/worsening).
 *
 * Phase 4: Longitudinal intelligence — cross-period anomaly trends, entity behavior profiles,
 *          persistent hotspot detection, "why does this entity repeatedly delay?" explanations.
 *
 * Design rule: read-only, advisory. Local Control Towers remain authoritative.
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
// Response cache — process-level, 30s TTL (same pattern as tenant UUID cache)
// ---------------------------------------------------------------------------

interface ResponseCacheEntry {
  data: unknown;
  expiresAt: number;
}

const RESPONSE_CACHE_TTL_MS = 30_000;
const _responseCache = new Map<string, ResponseCacheEntry>();

function buildCacheKey(tenantId: string, parent: string, fy: number, pn: number): string {
  return `atlas:gcm:${tenantId}:${parent}:${fy}:${pn}`;
}

// Evict stale entries periodically (prevents unbounded growth)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _responseCache) {
    if (v.expiresAt <= now) _responseCache.delete(k);
  }
}, 60_000).unref();

// ---------------------------------------------------------------------------
// GET — global close intelligence
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const url = new URL(req.url);
    const parentEntityCode = url.searchParams.get("parentEntityCode");
    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");

    if (!parentEntityCode || !fiscalYear || !periodNumber) {
      return errorResponse("VALIDATION", "parentEntityCode, fiscalYear, and periodNumber are required", 400);
    }

    const fy = Number(fiscalYear);
    const pn = Number(periodNumber);

    // Cache check (30s TTL — prevents re-running 19 queries on rapid refresh)
    const cacheKey = buildCacheKey(tenantUuid, parentEntityCode, fy, pn);
    const cached = _responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return successResponse(cached.data, 200, {
        "X-Atlas-Cache": "HIT",
        "Cache-Control": "private, max-age=30",
      });
    }

    const _t0 = performance.now();

    // 1. Resolve entity hierarchy
    const hierarchy = await sql<Record<string, unknown>>`
      WITH RECURSIVE entity_tree AS (
        SELECT id, code, name, entity_type, parent_entity_id,
               consolidation_method, ownership_pct::text,
               functional_currency, reporting_currency, country_code,
               0 AS depth
        FROM fin.legal_entity
        WHERE tenant_id = ${tenantUuid}::uuid AND code = ${parentEntityCode} AND is_active = true
        UNION ALL
        SELECT le.id, le.code, le.name, le.entity_type, le.parent_entity_id,
               le.consolidation_method, le.ownership_pct::text,
               le.functional_currency, le.reporting_currency, le.country_code,
               et.depth + 1
        FROM fin.legal_entity le
        JOIN entity_tree et ON le.parent_entity_id = et.id
        WHERE le.tenant_id = ${tenantUuid}::uuid AND le.is_active = true
      )
      SELECT * FROM entity_tree ORDER BY depth, name
    `.execute(db);

    if (hierarchy.rows.length === 0) {
      return errorResponse("NOT_FOUND", `Parent entity ${parentEntityCode} not found`, 404);
    }

    const entityCodes = hierarchy.rows.map(e => (e as any).code as string);
    const _tHierarchy = performance.now();

    // 2. Parallel queries across all entities in the group
    //    Phase 1: 11 queries | Phase 2: +4 | Phase 3: +3 | Phase 4: +1
    const [
      closeRuns,
      periodStatuses,
      anomalyCounts,
      riskSignalCounts,
      releaseStatuses,
      readinessSnapshots,
      exceptionCounts,
      closeCalendars,
      icTransactions,
      reconStatuses,
      taskProgress,
      // Phase 2 queries
      anomalyDetails,
      icDetailRows,
      overrideCounts,
      calendarDetails,
      // Phase 3 queries
      historicalCloseRuns,
      slaBreachForecasts,
      orchestrationSnapshots,
      // Phase 4 queries
      crossPeriodAnomalies,
    ] = await Promise.all([
      // Close run status per entity
      sql<Record<string, unknown>>`
        SELECT DISTINCT ON (entity_code)
          entity_code AS "entityCode",
          status,
          run_number AS "runNumber",
          started_at AS "startedAt",
          soft_closed_at AS "softClosedAt",
          hard_closed_at AS "hardClosedAt",
          EXTRACT(EPOCH FROM (
            COALESCE(hard_closed_at, soft_closed_at, now()) - started_at
          )) / 86400.0 AS "elapsedDays"
        FROM fin.close_run
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
          AND status != 'CANCELLED'
        ORDER BY entity_code, run_number DESC
      `.execute(db),

      // Fiscal period status per entity
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          status,
          start_date AS "startDate",
          end_date AS "endDate"
        FROM fin.fiscal_period
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
      `.execute(db),

      // Anomaly counts per entity
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          COUNT(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED'))::int AS "activeCount",
          COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "criticalCount",
          COUNT(*) FILTER (WHERE severity = 'WARNING' AND status IN ('OPEN','ACKNOWLEDGED'))::int AS "warningCount",
          COUNT(*)::int AS "totalCount"
        FROM fin.atlas_anomaly
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
        GROUP BY entity_code
      `.execute(db),

      // Risk signal counts per entity
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          COUNT(*)::int AS "activeCount",
          COUNT(*) FILTER (WHERE severity IN ('high','critical'))::int AS "highCriticalCount"
        FROM fin.close_risk_signal
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
          AND signal_state IN ('fired', 'acknowledged')
        GROUP BY entity_code
      `.execute(db),

      // Release status per entity
      sql<Record<string, unknown>>`
        SELECT DISTINCT ON (entity_code)
          entity_code AS "entityCode",
          release_code AS "releaseCode",
          status,
          is_clean_close AS "isCleanClose",
          override_count AS "overrideCount",
          readiness_score::text AS "readinessScore",
          release_type AS "releaseType"
        FROM fin.pack_release
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy}
          AND period_from <= ${pn} AND period_to >= ${pn}
          AND status != 'CANCELLED'
        ORDER BY entity_code, created_at DESC
      `.execute(db),

      // Latest readiness snapshot per entity
      sql<Record<string, unknown>>`
        SELECT DISTINCT ON (cr.entity_code)
          cr.entity_code AS "entityCode",
          rs.completion_pct::text AS "completionPct",
          rs.readiness_score::text AS "readinessScore",
          rs.sla_status AS "slaStatus",
          rs.open_exceptions AS "openExceptions",
          rs.critical_exceptions AS "criticalExceptions",
          rs.days_elapsed AS "daysElapsed",
          rs.days_remaining AS "daysRemaining",
          rs.captured_at AS "capturedAt"
        FROM fin.close_readiness_snapshot rs
        JOIN fin.close_run cr ON cr.id = rs.run_id
        WHERE cr.tenant_id = ${tenantUuid}::uuid
          AND cr.entity_code = ANY(${entityCodes}::text[])
          AND cr.fiscal_year = ${fy} AND cr.period_number = ${pn}
        ORDER BY cr.entity_code, rs.captured_at DESC
      `.execute(db),

      // Exception counts per entity
      sql<Record<string, unknown>>`
        SELECT
          ce.entity_code AS "entityCode",
          COUNT(*) FILTER (WHERE ce.status IN ('OPEN','IN_PROGRESS'))::int AS "openCount",
          COUNT(*) FILTER (WHERE ce.severity = 'CRITICAL' AND ce.status IN ('OPEN','IN_PROGRESS'))::int AS "criticalCount",
          COUNT(*) FILTER (WHERE ce.impact = 'GATE_BLOCKER' AND ce.status IN ('OPEN','IN_PROGRESS'))::int AS "gateBlockerCount"
        FROM fin.close_exception ce
        JOIN fin.close_run cr ON cr.id = ce.run_id
        WHERE cr.tenant_id = ${tenantUuid}::uuid
          AND cr.entity_code = ANY(${entityCodes}::text[])
          AND cr.fiscal_year = ${fy} AND cr.period_number = ${pn}
        GROUP BY ce.entity_code
      `.execute(db),

      // Close calendar (SLA targets) per entity
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          soft_close_target AS "softCloseTarget",
          hard_close_target AS "hardCloseTarget",
          close_type AS "closeType"
        FROM fin.close_calendar
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
      `.execute(db),

      // IC transaction settlement progress (for this period's entities)
      sql<Record<string, unknown>>`
        SELECT
          source_entity_code AS "sourceEntity",
          dest_entity_code AS "destEntity",
          COUNT(*)::int AS "totalTxns",
          COUNT(*) FILTER (WHERE status IN ('POSTED','NETTED','SETTLED'))::int AS "settledCount",
          COUNT(*) FILTER (WHERE status IN ('CREATED','MIRRORED'))::int AS "pendingCount"
        FROM fin.intercompany_transaction
        WHERE tenant_id = ${tenantUuid}::uuid
          AND (source_entity_code = ANY(${entityCodes}::text[])
            OR dest_entity_code = ANY(${entityCodes}::text[]))
          AND created_at >= (
            SELECT start_date FROM fin.fiscal_period
            WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${parentEntityCode}
              AND fiscal_year = ${fy} AND period_number = ${pn}
            LIMIT 1
          )
        GROUP BY source_entity_code, dest_entity_code
      `.execute(db),

      // Reconciliation status per entity
      sql<Record<string, unknown>>`
        SELECT
          bs.entity_code AS "entityCode",
          COUNT(*)::int AS "totalSessions",
          COUNT(*) FILTER (WHERE rs.status = 'COMPLETED')::int AS "completedSessions"
        FROM fin.reconciliation_session rs
        JOIN fin.bank_statement bs ON bs.id = rs.statement_id
        WHERE rs.tenant_id = ${tenantUuid}::uuid
          AND bs.entity_code = ANY(${entityCodes}::text[])
          AND EXISTS (
            SELECT 1 FROM fin.fiscal_period fp
            WHERE fp.tenant_id = ${tenantUuid}::uuid AND fp.entity_code = bs.entity_code
              AND fp.fiscal_year = ${fy} AND fp.period_number = ${pn}
              AND bs.statement_date BETWEEN fp.start_date AND fp.end_date
          )
        GROUP BY bs.entity_code
      `.execute(db),

      // Task progress per entity
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          COUNT(*)::int AS "totalTasks",
          COUNT(*) FILTER (WHERE task_status IN ('COMPLETED','WAIVED'))::int AS "completedTasks",
          COUNT(*) FILTER (WHERE task_status = 'FAILED')::int AS "failedTasks",
          COUNT(*) FILTER (WHERE task_status = 'BLOCKED')::int AS "blockedTasks"
        FROM fin.period_close_checklist
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
        GROUP BY entity_code
      `.execute(db),

      // -----------------------------------------------------------------------
      // Phase 2 queries
      // -----------------------------------------------------------------------

      // Anomaly detail — individual anomalies for cross-entity pattern analysis
      sql<Record<string, unknown>>`
        SELECT
          a.entity_code AS "entityCode",
          a.anomaly_type AS "anomalyType",
          a.severity,
          a.title,
          a.status,
          a.account_id::text AS "accountId",
          c.account_code AS "accountCode",
          c.account_name AS "accountName",
          a.observed_value::text AS "observedValue",
          a.expected_value::text AS "expectedValue",
          a.z_score::text AS "zScore"
        FROM fin.atlas_anomaly a
        LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
        WHERE a.tenant_id = ${tenantUuid}::uuid
          AND a.entity_code = ANY(${entityCodes}::text[])
          AND a.fiscal_year = ${fy} AND a.period_number = ${pn}
          AND a.status IN ('OPEN','ACKNOWLEDGED')
      `.execute(db),

      // IC transaction detail — amounts and dates for aging/exposure computation
      sql<Record<string, unknown>>`
        SELECT
          source_entity_code AS "sourceEntity",
          dest_entity_code AS "destEntity",
          amount::text AS "amount",
          currency_code AS "currencyCode",
          status,
          created_at AS "createdAt",
          txn_type AS "txnType",
          netting_batch_id IS NOT NULL AS "isNetted"
        FROM fin.intercompany_transaction
        WHERE tenant_id = ${tenantUuid}::uuid
          AND (source_entity_code = ANY(${entityCodes}::text[])
            OR dest_entity_code = ANY(${entityCodes}::text[]))
          AND created_at >= (
            SELECT start_date FROM fin.fiscal_period
            WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${parentEntityCode}
              AND fiscal_year = ${fy} AND period_number = ${pn}
            LIMIT 1
          )
      `.execute(db),

      // Override counts per entity (from pack_release)
      sql<Record<string, unknown>>`
        SELECT DISTINCT ON (entity_code)
          entity_code AS "entityCode",
          override_count::int AS "overrideCount"
        FROM fin.pack_release
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy}
          AND period_from <= ${pn} AND period_to >= ${pn}
          AND status != 'CANCELLED'
        ORDER BY entity_code, created_at DESC
      `.execute(db),

      // Close calendar detail — with start dates for projected completion
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          close_start_date AS "closeStartDate",
          soft_close_target AS "softCloseTarget",
          hard_close_target AS "hardCloseTarget",
          target_working_days AS "targetWorkingDays",
          close_type AS "closeType"
        FROM fin.close_calendar
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
      `.execute(db),

      // -----------------------------------------------------------------------
      // Phase 3 queries — Global Close Forecasting
      // -----------------------------------------------------------------------

      // Q16: Historical close run outcomes per entity (last 12 completed periods)
      sql<Record<string, unknown>>`
        SELECT
          cr.entity_code AS "entityCode",
          cr.fiscal_year AS "fiscalYear",
          cr.period_number AS "periodNumber",
          cr.status,
          EXTRACT(EPOCH FROM (
            COALESCE(cr.hard_closed_at, cr.soft_closed_at, cr.completed_at) - cr.started_at
          )) / 86400.0 AS "closeDays",
          cc.close_type AS "closeType",
          cc.target_working_days::int AS "targetWorkingDays",
          CASE
            WHEN cc.hard_close_actual IS NOT NULL AND cc.hard_close_actual > cc.hard_close_target THEN true
            ELSE false
          END AS "slaBreached"
        FROM fin.close_run cr
        LEFT JOIN fin.close_calendar cc
          ON cc.tenant_id = cr.tenant_id AND cc.entity_code = cr.entity_code
          AND cc.fiscal_year = cr.fiscal_year AND cc.period_number = cr.period_number
        WHERE cr.tenant_id = ${tenantUuid}::uuid
          AND cr.entity_code = ANY(${entityCodes}::text[])
          AND cr.status IN ('SOFT_CLOSED', 'HARD_CLOSED')
          AND NOT (cr.fiscal_year = ${fy} AND cr.period_number = ${pn})
        ORDER BY cr.entity_code, cr.fiscal_year DESC, cr.period_number DESC
      `.execute(db),

      // Q17: SLA breach forecast per entity (from predictive intelligence view)
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          soft_close_breach_pct::int AS "softBreachPct",
          hard_close_breach_pct::int AS "hardBreachPct",
          risk_tier AS "riskTier",
          hard_close_buffer_hours::text AS "hardBufferHours",
          soft_close_buffer_hours::text AS "softBufferHours",
          completion_pct::text AS "completionPct",
          slippage_count::int AS "slippageCount",
          hard_predicted_at AS "hardPredictedAt",
          hard_confidence AS "hardConfidence"
        FROM fin.vw_sla_breach_forecast
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
      `.execute(db),

      // Q18: Latest orchestration snapshot per entity (prediction + confidence)
      sql<Record<string, unknown>>`
        SELECT DISTINCT ON (entity_code)
          entity_code AS "entityCode",
          predicted_ready_at AS "predictedReadyAt",
          confidence,
          critical_path_minutes::int AS "criticalPathMinutes",
          total_tasks::int AS "totalTasks",
          satisfied_count::int AS "satisfiedCount",
          blocked_count::int AS "blockedCount",
          failed_count::int AS "failedCount",
          snapshot_at AS "snapshotAt"
        FROM fin.close_orchestration_snapshot
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND fiscal_year = ${fy} AND period_number = ${pn}
          AND target_status = 'HARD_CLOSE'
        ORDER BY entity_code, snapshot_at DESC
      `.execute(db),

      // -----------------------------------------------------------------------
      // Phase 4 queries — Longitudinal Intelligence
      // -----------------------------------------------------------------------

      // Q19: Cross-period anomaly history (aggregated counts per entity/period/type)
      sql<Record<string, unknown>>`
        SELECT
          entity_code AS "entityCode",
          fiscal_year AS "fiscalYear",
          period_number AS "periodNumber",
          anomaly_type AS "anomalyType",
          severity,
          COUNT(*)::int AS "count"
        FROM fin.atlas_anomaly
        WHERE tenant_id = ${tenantUuid}::uuid
          AND entity_code = ANY(${entityCodes}::text[])
          AND NOT (fiscal_year = ${fy} AND period_number = ${pn})
        GROUP BY entity_code, fiscal_year, period_number, anomaly_type, severity
        ORDER BY entity_code, fiscal_year DESC, period_number DESC
      `.execute(db),
    ]);
    const _tQueries = performance.now();

    // 3. Build per-entity readiness records
    const closeRunMap = toMap(closeRuns.rows, "entityCode");
    const periodMap = toMap(periodStatuses.rows, "entityCode");
    const anomalyMap = toMap(anomalyCounts.rows, "entityCode");
    const signalMap = toMap(riskSignalCounts.rows, "entityCode");
    const releaseMap = toMap(releaseStatuses.rows, "entityCode");
    const readinessMap = toMap(readinessSnapshots.rows, "entityCode");
    const exceptionMap = toMap(exceptionCounts.rows, "entityCode");
    const calendarMap = toMap(closeCalendars.rows, "entityCode");
    const reconMap = toMap(reconStatuses.rows, "entityCode");
    const taskMap = toMap(taskProgress.rows, "entityCode");

    const entities = hierarchy.rows.map((entity: any) => {
      const code = entity.code as string;
      const cr = closeRunMap.get(code) as any;
      const fp = periodMap.get(code) as any;
      const an = anomalyMap.get(code) as any;
      const rs = signalMap.get(code) as any;
      const rel = releaseMap.get(code) as any;
      const rdy = readinessMap.get(code) as any;
      const exc = exceptionMap.get(code) as any;
      const cal = calendarMap.get(code) as any;
      const rec = reconMap.get(code) as any;
      const tsk = taskMap.get(code) as any;

      const criticalAnomalies = Number(an?.criticalCount ?? 0);
      const warningAnomalies = Number(an?.warningCount ?? 0);
      const activeSignals = Number(rs?.activeCount ?? 0);
      const highCriticalSignals = Number(rs?.highCriticalCount ?? 0);
      const reconTotal = Number(rec?.totalSessions ?? 0);
      const reconComplete = Number(rec?.completedSessions ?? 0);
      const failedTasks = Number(tsk?.failedTasks ?? 0);
      const blockedTasks = Number(tsk?.blockedTasks ?? 0);

      // Composite risk score per entity (same algorithm as dashboard)
      const riskScore = computeEntityRiskScore({
        criticalAnomalies, warningAnomalies,
        activeSignals, highCriticalSignals,
        reconRemaining: reconTotal - reconComplete,
        failedTasks, blockedTasks,
        gateBlockers: Number(exc?.gateBlockerCount ?? 0),
      });

      return {
        entityCode: code,
        entityName: entity.name,
        entityType: entity.entity_type,
        countryCode: entity.country_code,
        functionalCurrency: entity.functional_currency,
        consolidationMethod: entity.consolidation_method,
        ownershipPct: entity.ownership_pct,
        depth: entity.depth,

        periodStatus: fp?.status ?? null,
        closeStatus: cr?.status ?? null,
        closeRunNumber: cr?.runNumber ?? null,
        elapsedDays: cr?.elapsedDays != null ? Number(Number(cr.elapsedDays).toFixed(1)) : null,

        readiness: rdy ? {
          completionPct: rdy.completionPct,
          readinessScore: rdy.readinessScore,
          slaStatus: rdy.slaStatus,
          openExceptions: Number(rdy.openExceptions),
          criticalExceptions: Number(rdy.criticalExceptions),
          daysElapsed: rdy.daysElapsed,
          daysRemaining: rdy.daysRemaining,
        } : null,

        anomalies: {
          activeCount: Number(an?.activeCount ?? 0),
          criticalCount: criticalAnomalies,
          warningCount: warningAnomalies,
        },

        riskSignals: {
          activeCount: activeSignals,
          highCriticalCount: highCriticalSignals,
        },

        exceptions: {
          openCount: Number(exc?.openCount ?? 0),
          criticalCount: Number(exc?.criticalCount ?? 0),
          gateBlockerCount: Number(exc?.gateBlockerCount ?? 0),
        },

        reconciliation: {
          totalSessions: reconTotal,
          completedSessions: reconComplete,
          isComplete: reconTotal === 0 || reconComplete === reconTotal,
        },

        tasks: {
          totalTasks: Number(tsk?.totalTasks ?? 0),
          completedTasks: Number(tsk?.completedTasks ?? 0),
          failedTasks,
          blockedTasks,
        },

        release: rel ? {
          releaseCode: rel.releaseCode,
          status: rel.status,
          isCleanClose: rel.isCleanClose,
          overrideCount: Number(rel.overrideCount ?? 0),
          readinessScore: rel.readinessScore,
          releaseType: rel.releaseType,
        } : null,

        calendar: cal ? {
          softCloseTarget: cal.softCloseTarget,
          hardCloseTarget: cal.hardCloseTarget,
          closeType: cal.closeType,
        } : null,

        riskScore,
      };
    });

    // 4. Consolidated group metrics
    const groupRiskScore = Math.min(100, Math.round(
      entities.reduce((sum: number, e: any) => sum + e.riskScore.score, 0) / Math.max(entities.length, 1),
    ));
    const groupLevel = groupRiskScore >= 70 ? "HIGH" :
                       groupRiskScore >= 40 ? "MEDIUM" :
                       groupRiskScore > 0 ? "LOW" : "NONE";

    // Delayed close ranking (sorted by elapsed days, descending)
    const delayedEntities = entities
      .filter((e: any) => e.elapsedDays != null && e.closeStatus && !["HARD_CLOSED", "CANCELLED"].includes(e.closeStatus))
      .sort((a: any, b: any) => (b.elapsedDays ?? 0) - (a.elapsedDays ?? 0));

    // Critical path entity (highest risk score among non-closed entities)
    const criticalPathEntity = entities
      .filter((e: any) => e.closeStatus && !["HARD_CLOSED", "CANCELLED"].includes(e.closeStatus))
      .sort((a: any, b: any) => b.riskScore.score - a.riskScore.score)[0] ?? null;

    // Entity status distribution
    const statusDistribution: Record<string, number> = {};
    for (const e of entities) {
      const status = (e as any).closeStatus ?? "NOT_STARTED";
      statusDistribution[status] = (statusDistribution[status] ?? 0) + 1;
    }

    // =========================================================================
    // Phase 2 — Cross-Entity Dependency Intelligence
    // =========================================================================

    // 5. Cross-entity anomaly patterns
    const crossEntityAnomalies = computeCrossEntityAnomalies(anomalyDetails.rows as any[]);

    // 6. IC settlement intelligence (aging, exposure)
    const icIntelligence = computeICIntelligence(icDetailRows.rows as any[]);

    // 7. Enhanced critical path with projected completion
    const calDetailMap = toMap(calendarDetails.rows, "entityCode");
    const enhancedCriticalPath = computeEnhancedCriticalPath(
      entities as any[],
      calDetailMap,
    );

    // 8. Override concentration
    const overrideConcentration = computeOverrideConcentration(
      overrideCounts.rows as any[],
      entities as any[],
    );

    // =========================================================================
    // Phase 3 — Global Close Forecasting
    // =========================================================================

    // 10. Group forecast (historical-data-driven)
    const groupForecast = computeGroupForecast(
      entities as any[],
      historicalCloseRuns.rows as any[],
      slaBreachForecasts.rows as any[],
      orchestrationSnapshots.rows as any[],
      calDetailMap,
    );

    // =========================================================================
    // Phase 4 — Longitudinal Intelligence
    // =========================================================================

    // 11. Cross-period longitudinal intelligence
    const longitudinalIntelligence = computeLongitudinalIntelligence(
      entities as any[],
      historicalCloseRuns.rows as any[],
      crossPeriodAnomalies.rows as any[],
    );

    // 9. Group narrative
    const parentName = (hierarchy.rows[0] as any).name as string;
    const groupNarrative = renderGroupNarrative({
      parentEntityCode,
      parentName,
      fiscalYear: fy,
      periodNumber: pn,
      entityCount: entities.length,
      groupRiskScore,
      groupRiskLevel: groupLevel,
      statusDistribution,
      delayedEntities: delayedEntities.slice(0, 5) as any[],
      criticalPathEntity: criticalPathEntity as any,
      enhancedCriticalPath,
      totalAnomalies: entities.reduce((sum: number, e: any) => sum + e.anomalies.activeCount, 0),
      totalCriticalAnomalies: entities.reduce((sum: number, e: any) => sum + e.anomalies.criticalCount, 0),
      totalGateBlockers: entities.reduce((sum: number, e: any) => sum + e.exceptions.gateBlockerCount, 0),
      crossEntityAnomalies,
      icIntelligence,
      overrideConcentration,
    });

    const _tCompute = performance.now();

    const result = {
      parentEntity: {
        code: parentEntityCode,
        name: parentName,
      },
      fiscalYear: fy,
      periodNumber: pn,
      entities,
      icSettlement: icTransactions.rows,
      consolidated: {
        entityCount: entities.length,
        groupRiskScore,
        groupRiskLevel: groupLevel,
        statusDistribution,
        delayedCloseRanking: delayedEntities.slice(0, 5).map((e: any) => ({
          entityCode: e.entityCode,
          entityName: e.entityName,
          elapsedDays: e.elapsedDays,
          closeStatus: e.closeStatus,
          riskScore: e.riskScore.score,
        })),
        criticalPathEntity: criticalPathEntity ? {
          entityCode: (criticalPathEntity as any).entityCode,
          entityName: (criticalPathEntity as any).entityName,
          riskScore: (criticalPathEntity as any).riskScore.score,
          topDrivers: (criticalPathEntity as any).riskScore.drivers.slice(0, 3),
        } : null,
        totalAnomalies: entities.reduce((sum: number, e: any) => sum + e.anomalies.activeCount, 0),
        totalCriticalAnomalies: entities.reduce((sum: number, e: any) => sum + e.anomalies.criticalCount, 0),
        totalOpenExceptions: entities.reduce((sum: number, e: any) => sum + e.exceptions.openCount, 0),
        totalGateBlockers: entities.reduce((sum: number, e: any) => sum + e.exceptions.gateBlockerCount, 0),
      },
      // Phase 2
      crossEntityAnomalies,
      icIntelligence,
      enhancedCriticalPath,
      overrideConcentration,
      groupNarrative,
      // Phase 3
      groupForecast,
      // Phase 4
      longitudinalIntelligence,
      computedAt: new Date().toISOString(),
      _profiling: {
        hierarchyMs: Math.round(_tHierarchy - _t0),
        queriesMs: Math.round(_tQueries - _tHierarchy),
        computeMs: Math.round(_tCompute - _tQueries),
        totalMs: Math.round(_tCompute - _t0),
        queryCount: 19,
        entityCount: entities.length,
      },
    };

    // Cache result (30s TTL)
    _responseCache.set(cacheKey, { data: result, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });

    return successResponse(result, 200, {
      "X-Atlas-Cache": "MISS",
      "Cache-Control": "private, max-age=30",
    });
  } catch (err) {
    console.error("[atlas/global-close] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to compute global close");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMap(rows: Record<string, unknown>[], key: string): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) map.set(row[key] as string, row);
  return map;
}

interface EntityRiskInput {
  criticalAnomalies: number;
  warningAnomalies: number;
  activeSignals: number;
  highCriticalSignals: number;
  reconRemaining: number;
  failedTasks: number;
  blockedTasks: number;
  gateBlockers: number;
}

function computeEntityRiskScore(input: EntityRiskInput) {
  const drivers: Array<{ source: string; label: string; points: number; count: number }> = [];
  let total = 0;

  const add = (source: string, label: string, count: number, ptsEach: number, max: number) => {
    if (count <= 0) return;
    const pts = Math.min(max, count * ptsEach);
    drivers.push({ source, label, points: pts, count });
    total += pts;
  };

  add("anomaly", "Critical anomalies", input.criticalAnomalies, 15, 45);
  add("anomaly", "Warning anomalies", input.warningAnomalies, 5, 20);
  add("risk_signal", "High/critical risk signals", input.highCriticalSignals, 8, 24);
  add("risk_signal", "Active risk signals", input.activeSignals - input.highCriticalSignals, 3, 12);
  add("reconciliation", "Outstanding reconciliations", input.reconRemaining, 5, 15);
  add("close_task", "Failed close tasks", input.failedTasks, 8, 16);
  add("close_task", "Blocked close tasks", input.blockedTasks, 4, 12);
  add("exception", "Gate blockers", input.gateBlockers, 12, 24);

  const score = Math.min(100, total);
  const level = score >= 70 ? "HIGH" as const :
                score >= 40 ? "MEDIUM" as const :
                score > 0 ? "LOW" as const : "NONE" as const;

  return { score, level, drivers: drivers.sort((a, b) => b.points - a.points) };
}

// ---------------------------------------------------------------------------
// Phase 2 — Cross-Entity Anomaly Patterns
// ---------------------------------------------------------------------------

function computeCrossEntityAnomalies(anomalies: Array<{
  entityCode: string; anomalyType: string; severity: string;
  accountCode: string | null; accountName: string | null; title: string;
}>) {
  // 1. Anomaly type patterns: types appearing in 2+ entities
  const typeByEntity = new Map<string, Set<string>>();
  const typeCount = new Map<string, number>();
  for (const a of anomalies) {
    if (!typeByEntity.has(a.anomalyType)) typeByEntity.set(a.anomalyType, new Set());
    typeByEntity.get(a.anomalyType)!.add(a.entityCode);
    typeCount.set(a.anomalyType, (typeCount.get(a.anomalyType) ?? 0) + 1);
  }
  const repeatedPatterns = Array.from(typeByEntity.entries())
    .filter(([, entities]) => entities.size >= 2)
    .map(([anomalyType, entities]) => ({
      anomalyType,
      entityCount: entities.size,
      totalOccurrences: typeCount.get(anomalyType) ?? 0,
      entities: Array.from(entities),
    }))
    .sort((a, b) => b.entityCount - a.entityCount);

  // 2. Hotspot accounts: accounts with anomalies in 2+ entities
  const accountByEntity = new Map<string, { entities: Set<string>; count: number; name: string }>();
  for (const a of anomalies) {
    if (!a.accountCode) continue;
    if (!accountByEntity.has(a.accountCode)) {
      accountByEntity.set(a.accountCode, { entities: new Set(), count: 0, name: a.accountName ?? "" });
    }
    const entry = accountByEntity.get(a.accountCode)!;
    entry.entities.add(a.entityCode);
    entry.count++;
  }
  const hotspotAccounts = Array.from(accountByEntity.entries())
    .filter(([, v]) => v.entities.size >= 2)
    .map(([accountCode, v]) => ({
      accountCode,
      accountName: v.name,
      entityCount: v.entities.size,
      anomalyCount: v.count,
      entities: Array.from(v.entities),
    }))
    .sort((a, b) => b.entityCount - a.entityCount)
    .slice(0, 10);

  // 3. Severity distribution across group
  const severityDist = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const a of anomalies) {
    if (a.severity in severityDist) severityDist[a.severity as keyof typeof severityDist]++;
  }

  return {
    repeatedPatterns,
    hotspotAccounts,
    severityDistribution: severityDist,
    totalAcrossGroup: anomalies.length,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — IC Settlement Intelligence
// ---------------------------------------------------------------------------

function computeICIntelligence(txns: Array<{
  sourceEntity: string; destEntity: string; amount: string;
  currencyCode: string; status: string; createdAt: string;
  txnType: string; isNetted: boolean;
}>) {
  const now = new Date();

  // 1. Aging buckets for unsettled transactions
  const pendingTxns = txns.filter(t => ["CREATED", "MIRRORED"].includes(t.status));
  const agingBuckets = { current: 0, days7: 0, days14: 0, days30: 0, over30: 0 };
  const agingAmounts = { current: 0, days7: 0, days14: 0, days30: 0, over30: 0 };

  for (const t of pendingTxns) {
    const ageDays = Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / 86400000);
    const amt = Math.abs(Number(t.amount));
    if (ageDays <= 3) { agingBuckets.current++; agingAmounts.current += amt; }
    else if (ageDays <= 7) { agingBuckets.days7++; agingAmounts.days7 += amt; }
    else if (ageDays <= 14) { agingBuckets.days14++; agingAmounts.days14 += amt; }
    else if (ageDays <= 30) { agingBuckets.days30++; agingAmounts.days30 += amt; }
    else { agingBuckets.over30++; agingAmounts.over30 += amt; }
  }

  // 2. Net exposure per entity pair (unsettled amounts)
  const pairExposure = new Map<string, { source: string; dest: string; netAmount: number; currency: string; pendingCount: number }>();
  for (const t of pendingTxns) {
    const pairKey = `${t.sourceEntity}→${t.destEntity}`;
    if (!pairExposure.has(pairKey)) {
      pairExposure.set(pairKey, { source: t.sourceEntity, dest: t.destEntity, netAmount: 0, currency: t.currencyCode, pendingCount: 0 });
    }
    const entry = pairExposure.get(pairKey)!;
    entry.netAmount += Number(t.amount);
    entry.pendingCount++;
  }
  const netExposure = Array.from(pairExposure.values())
    .sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));

  // 3. Exception markers — pairs with high aging or high pending count
  const exceptionPairs = netExposure.filter(
    p => p.pendingCount >= 3 || Math.abs(p.netAmount) > 100000,
  );

  // 4. Settlement summary
  const totalAmount = txns.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const settledAmount = txns
    .filter(t => ["POSTED", "NETTED", "SETTLED"].includes(t.status))
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const nettedCount = txns.filter(t => t.isNetted).length;

  return {
    agingBuckets,
    agingAmounts: {
      current: agingAmounts.current.toFixed(2),
      days7: agingAmounts.days7.toFixed(2),
      days14: agingAmounts.days14.toFixed(2),
      days30: agingAmounts.days30.toFixed(2),
      over30: agingAmounts.over30.toFixed(2),
    },
    netExposure: netExposure.map(e => ({
      ...e,
      netAmount: e.netAmount.toFixed(2),
    })),
    exceptionPairs: exceptionPairs.map(e => ({
      ...e,
      netAmount: e.netAmount.toFixed(2),
    })),
    summary: {
      totalTransactions: txns.length,
      pendingTransactions: pendingTxns.length,
      totalAmount: totalAmount.toFixed(2),
      settledAmount: settledAmount.toFixed(2),
      pendingAmount: (totalAmount - settledAmount).toFixed(2),
      nettedCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Enhanced Critical Path
// ---------------------------------------------------------------------------

function computeEnhancedCriticalPath(
  entities: Array<{
    entityCode: string; entityName: string; closeStatus: string | null;
    elapsedDays: number | null; riskScore: { score: number; level: string; drivers: any[] };
    tasks: { totalTasks: number; completedTasks: number; failedTasks: number; blockedTasks: number };
    exceptions: { gateBlockerCount: number };
    anomalies: { criticalCount: number };
    reconciliation: { isComplete: boolean; totalSessions: number; completedSessions: number };
  }>,
  calendarMap: Map<string, Record<string, unknown>>,
) {
  const openEntities = entities.filter(
    e => e.closeStatus && !["HARD_CLOSED", "CANCELLED"].includes(e.closeStatus),
  );

  if (openEntities.length === 0) {
    return {
      projectedGroupCompletionDays: null,
      slowestEntity: null,
      blockingChain: [],
      delayExplanation: "All entities have completed close.",
    };
  }

  // Estimate remaining days per entity based on task completion rate
  const entityProjections = openEntities.map(e => {
    const cal = calendarMap.get(e.entityCode) as any;
    const targetDays = cal ? Number(cal.targetWorkingDays ?? 10) : 10;
    const completionRate = e.tasks.totalTasks > 0
      ? e.tasks.completedTasks / e.tasks.totalTasks
      : 0;
    // Remaining = target * (1 - completion%) + penalty for blockers/failures
    const baseDaysRemaining = completionRate > 0
      ? ((e.elapsedDays ?? 0) / Math.max(completionRate, 0.01)) - (e.elapsedDays ?? 0)
      : targetDays;
    const penalty = e.tasks.failedTasks * 1.5 + e.tasks.blockedTasks * 1.0 + e.exceptions.gateBlockerCount * 2.0;
    const projectedRemaining = Math.max(0, Math.round((baseDaysRemaining + penalty) * 10) / 10);
    const projectedTotal = (e.elapsedDays ?? 0) + projectedRemaining;

    const hardTarget = cal ? new Date(cal.hardCloseTarget as string) : null;
    const projectedDate = hardTarget
      ? new Date(Date.now() + projectedRemaining * 86400000)
      : null;
    const willBreachSla = hardTarget && projectedDate ? projectedDate > hardTarget : false;

    return {
      entityCode: e.entityCode,
      entityName: e.entityName,
      closeStatus: e.closeStatus,
      elapsedDays: e.elapsedDays,
      projectedRemainingDays: projectedRemaining,
      projectedTotalDays: Math.round(projectedTotal * 10) / 10,
      riskScore: e.riskScore.score,
      willBreachSla,
      hardCloseTarget: hardTarget?.toISOString().split("T")[0] ?? null,
    };
  });

  // Slowest entity = longest projected total
  const sortedByProjected = [...entityProjections].sort((a, b) => b.projectedTotalDays - a.projectedTotalDays);
  const slowest = sortedByProjected[0];

  // Blocking chain: entities that have gate blockers or critical anomalies
  const blockingChain = entityProjections
    .filter(e => {
      const ent = entities.find(x => x.entityCode === e.entityCode)!;
      return ent.exceptions.gateBlockerCount > 0 || ent.anomalies.criticalCount > 0 || ent.tasks.failedTasks > 0;
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  // Generate delay explanation
  const explanationParts: string[] = [];
  if (slowest) {
    explanationParts.push(
      `${slowest.entityName} (${slowest.entityCode}) is the slowest entity with ${slowest.projectedTotalDays} projected total days.`,
    );
  }
  if (blockingChain.length > 0) {
    const blockerNames = blockingChain.slice(0, 3).map(b => b.entityCode);
    explanationParts.push(
      `${blockingChain.length} ${blockingChain.length === 1 ? "entity has" : "entities have"} active blockers: ${blockerNames.join(", ")}.`,
    );
  }
  const slaBreaches = entityProjections.filter(e => e.willBreachSla);
  if (slaBreaches.length > 0) {
    explanationParts.push(
      `${slaBreaches.length} ${slaBreaches.length === 1 ? "entity is" : "entities are"} projected to breach SLA.`,
    );
  }

  return {
    projectedGroupCompletionDays: slowest?.projectedTotalDays ?? null,
    slowestEntity: slowest ?? null,
    blockingChain: blockingChain.slice(0, 5),
    entityProjections: sortedByProjected,
    slaBreachCount: slaBreaches.length,
    delayExplanation: explanationParts.join(" ") || "Group close is progressing normally.",
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Override Concentration
// ---------------------------------------------------------------------------

function computeOverrideConcentration(
  overrides: Array<{ entityCode: string; overrideCount: number }>,
  entities: Array<{ entityCode: string; entityName: string }>,
) {
  const entityNameMap = new Map(entities.map(e => [e.entityCode, e.entityName]));
  const withOverrides = overrides
    .filter(o => Number(o.overrideCount) > 0)
    .map(o => ({
      entityCode: o.entityCode,
      entityName: entityNameMap.get(o.entityCode) ?? o.entityCode,
      overrideCount: Number(o.overrideCount),
    }))
    .sort((a, b) => b.overrideCount - a.overrideCount);

  const totalOverrides = withOverrides.reduce((s, o) => s + o.overrideCount, 0);

  return {
    byEntity: withOverrides,
    totalOverrides,
    entitiesWithOverrides: withOverrides.length,
    concentrationRisk: totalOverrides >= 10 ? "HIGH" as const :
                       totalOverrides >= 5 ? "MEDIUM" as const :
                       totalOverrides > 0 ? "LOW" as const : "NONE" as const,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Group Narrative (pure template functions)
// ---------------------------------------------------------------------------

interface GroupNarrativeInput {
  parentEntityCode: string;
  parentName: string;
  fiscalYear: number;
  periodNumber: number;
  entityCount: number;
  groupRiskScore: number;
  groupRiskLevel: string;
  statusDistribution: Record<string, number>;
  delayedEntities: Array<{ entityCode: string; entityName: string; elapsedDays: number }>;
  criticalPathEntity: { entityCode: string; entityName: string; riskScore: { score: number } } | null;
  enhancedCriticalPath: {
    projectedGroupCompletionDays: number | null;
    slowestEntity: { entityCode: string; entityName: string; projectedTotalDays: number } | null;
    blockingChain: Array<{ entityCode: string; riskScore: number }>;
    slaBreachCount?: number;
    delayExplanation: string;
  };
  totalAnomalies: number;
  totalCriticalAnomalies: number;
  totalGateBlockers: number;
  crossEntityAnomalies: {
    repeatedPatterns: Array<{ anomalyType: string; entityCount: number }>;
    hotspotAccounts: Array<{ accountCode: string; entityCount: number }>;
  };
  icIntelligence: {
    summary: { pendingTransactions: number; pendingAmount: string };
    exceptionPairs: Array<{ source: string; dest: string }>;
  };
  overrideConcentration: {
    totalOverrides: number;
    concentrationRisk: string;
  };
}

function renderGroupNarrative(input: GroupNarrativeInput) {
  return {
    dashboardSummary: renderGroupDashboardSummary(input),
    cfoBrief: renderGroupCfoBrief(input),
    delayExplanation: input.enhancedCriticalPath.delayExplanation,
    generatedAt: new Date().toISOString(),
    provider: "template" as const,
    deterministic: true,
  };
}

function renderGroupDashboardSummary(input: GroupNarrativeInput): string {
  const parts: string[] = [];
  const periodLabel = `P${input.periodNumber} FY${input.fiscalYear}`;

  // Opening: group health
  const healthWord = input.groupRiskLevel === "HIGH" ? "elevated risk" :
                     input.groupRiskLevel === "MEDIUM" ? "moderate risk" :
                     input.groupRiskLevel === "LOW" ? "low risk" : "healthy";
  parts.push(`${input.parentName} group close for ${periodLabel} is in ${healthWord} status across ${input.entityCount} entities.`);

  // Status distribution
  const hardClosed = input.statusDistribution["HARD_CLOSED"] ?? 0;
  const softClosed = input.statusDistribution["SOFT_CLOSED"] ?? 0;
  const inProgress = input.entityCount - hardClosed - softClosed;
  if (hardClosed > 0 || softClosed > 0) {
    parts.push(`${hardClosed + softClosed} of ${input.entityCount} entities have reached close (${hardClosed} hard-closed, ${softClosed} soft-closed), ${inProgress} remain in progress.`);
  }

  // Anomalies
  if (input.totalAnomalies > 0) {
    let anomalyText = `Atlas detected ${input.totalAnomalies} active anomalies across the group`;
    if (input.totalCriticalAnomalies > 0) anomalyText += `, ${input.totalCriticalAnomalies} critical`;
    parts.push(anomalyText + ".");
  }

  // Cross-entity patterns
  if (input.crossEntityAnomalies.repeatedPatterns.length > 0) {
    const top = input.crossEntityAnomalies.repeatedPatterns[0];
    parts.push(`${top.anomalyType} is repeating across ${top.entityCount} entities — potential systemic issue.`);
  }

  // Projected completion
  if (input.enhancedCriticalPath.projectedGroupCompletionDays != null) {
    parts.push(`Projected group close duration: ${input.enhancedCriticalPath.projectedGroupCompletionDays} days.`);
  }

  // IC settlement
  if (Number(input.icIntelligence.summary.pendingTransactions) > 0) {
    parts.push(`${input.icIntelligence.summary.pendingTransactions} intercompany transactions remain pending (${input.icIntelligence.summary.pendingAmount} unsettled).`);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Phase 3 — Global Close Forecasting
// ---------------------------------------------------------------------------

function computeGroupForecast(
  entities: Array<{
    entityCode: string; entityName: string; closeStatus: string | null;
    elapsedDays: number | null;
    tasks: { totalTasks: number; completedTasks: number; failedTasks: number; blockedTasks: number };
    exceptions: { gateBlockerCount: number };
  }>,
  historicalRuns: Array<{
    entityCode: string; fiscalYear: number; periodNumber: number;
    closeDays: string | number; closeType: string; targetWorkingDays: number;
    slaBreached: boolean;
  }>,
  breachForecasts: Array<{
    entityCode: string; softBreachPct: number; hardBreachPct: number;
    riskTier: string; hardBufferHours: string; slippageCount: number;
    hardPredictedAt: string | null; hardConfidence: string | null;
  }>,
  orchestrationSnapshots: Array<{
    entityCode: string; predictedReadyAt: string | null; confidence: string;
    criticalPathMinutes: number; totalTasks: number; satisfiedCount: number;
    blockedCount: number; failedCount: number;
  }>,
  calendarMap: Map<string, Record<string, unknown>>,
) {
  // Group historical runs by entity
  const histByEntity = new Map<string, Array<{ closeDays: number; slaBreached: boolean }>>();
  for (const r of historicalRuns) {
    const days = Number(r.closeDays);
    if (isNaN(days) || days <= 0) continue;
    if (!histByEntity.has(r.entityCode)) histByEntity.set(r.entityCode, []);
    histByEntity.get(r.entityCode)!.push({ closeDays: days, slaBreached: r.slaBreached });
  }

  const breachMap = toMap(breachForecasts as any[], "entityCode");
  const snapMap = toMap(orchestrationSnapshots as any[], "entityCode");

  const openEntities = entities.filter(
    e => e.closeStatus && !["HARD_CLOSED", "CANCELLED"].includes(e.closeStatus),
  );

  // Per-entity forecast
  const entityForecasts = openEntities.map(e => {
    const hist = histByEntity.get(e.entityCode) ?? [];
    const breach = breachMap.get(e.entityCode) as any;
    const snap = snapMap.get(e.entityCode) as any;
    const cal = calendarMap.get(e.entityCode) as any;

    // Historical stats
    const histDays = hist.map(h => h.closeDays);
    const avgDays = histDays.length > 0
      ? histDays.reduce((a, b) => a + b, 0) / histDays.length
      : null;
    const stddev = avgDays != null && histDays.length >= 2
      ? Math.sqrt(histDays.reduce((s, d) => s + (d - avgDays) ** 2, 0) / histDays.length)
      : null;
    const slaBreachRate = hist.length > 0
      ? hist.filter(h => h.slaBreached).length / hist.length
      : null;

    // Current pace estimate
    const completionRate = e.tasks.totalTasks > 0 ? e.tasks.completedTasks / e.tasks.totalTasks : 0;
    const paceEstimate = completionRate > 0.1 && e.elapsedDays != null
      ? e.elapsedDays / completionRate
      : null;

    // Blended forecast: 60% historical + 40% pace (if both available)
    const riskPenalty = e.tasks.failedTasks * 1.5 + e.tasks.blockedTasks * 1.0 + e.exceptions.gateBlockerCount * 2.0;
    let predictedDays: number;
    if (avgDays != null && paceEstimate != null) {
      predictedDays = avgDays * 0.6 + paceEstimate * 0.4 + riskPenalty;
    } else if (avgDays != null) {
      predictedDays = avgDays + riskPenalty;
    } else if (paceEstimate != null) {
      predictedDays = paceEstimate + riskPenalty;
    } else {
      const targetDays = cal ? Number(cal.targetWorkingDays ?? 10) : 10;
      predictedDays = targetDays + riskPenalty;
    }
    predictedDays = Math.max(0.5, Math.round(predictedDays * 10) / 10);

    // Confidence (based on sample size + variance)
    const cv = avgDays != null && avgDays > 0 && stddev != null ? stddev / avgDays : 1;
    const confidence = Math.round(
      Math.max(25, Math.min(95, 80 - cv * 40 + Math.min(histDays.length, 8) * 2)),
    );

    // Breach probability (prefer view-computed if available)
    const hardBreachPct = breach ? Number(breach.hardBreachPct) : null;

    // Trend: compare latest 3 vs prior 3 close durations
    let trend: "improving" | "stable" | "worsening" = "stable";
    if (histDays.length >= 4) {
      const recent = histDays.slice(0, Math.min(3, Math.floor(histDays.length / 2)));
      const prior = histDays.slice(recent.length, recent.length * 2);
      if (prior.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
        const delta = (recentAvg - priorAvg) / Math.max(priorAvg, 1);
        if (delta < -0.1) trend = "improving";
        else if (delta > 0.1) trend = "worsening";
      }
    }

    // P75 and P95 estimates from historical data
    const sortedDays = [...histDays].sort((a, b) => a - b);
    const p75 = sortedDays.length >= 4 ? sortedDays[Math.floor(sortedDays.length * 0.75)] : null;
    const p95 = sortedDays.length >= 4 ? sortedDays[Math.floor(sortedDays.length * 0.95)] : null;

    return {
      entityCode: e.entityCode,
      entityName: e.entityName,
      historicalAvgDays: avgDays != null ? Math.round(avgDays * 10) / 10 : null,
      historicalStddev: stddev != null ? Math.round(stddev * 10) / 10 : null,
      historicalP75Days: p75 != null ? Math.round(p75 * 10) / 10 : null,
      historicalP95Days: p95 != null ? Math.round(p95 * 10) / 10 : null,
      historicalPeriodCount: histDays.length,
      currentPaceDays: paceEstimate != null ? Math.round(paceEstimate * 10) / 10 : null,
      predictedDays,
      confidence,
      hardBreachPct,
      slaBreachRate: slaBreachRate != null ? Math.round(slaBreachRate * 100) : null,
      trend,
      elapsedDays: e.elapsedDays,
      completionPct: Math.round(completionRate * 100),
    };
  });

  // Group-level forecast: driven by slowest entity
  const sortedForecasts = [...entityForecasts].sort((a, b) => b.predictedDays - a.predictedDays);
  const slowest = sortedForecasts[0] ?? null;
  const groupPredictedDays = slowest?.predictedDays ?? null;
  const groupConfidence = entityForecasts.length > 0
    ? Math.round(entityForecasts.reduce((s, e) => s + e.confidence, 0) / entityForecasts.length)
    : null;

  // Breach risk distribution
  const breachDistribution = {
    critical: entityForecasts.filter(e => (e.hardBreachPct ?? 0) >= 70).length,
    high: entityForecasts.filter(e => (e.hardBreachPct ?? 0) >= 50 && (e.hardBreachPct ?? 0) < 70).length,
    medium: entityForecasts.filter(e => (e.hardBreachPct ?? 0) >= 30 && (e.hardBreachPct ?? 0) < 50).length,
    low: entityForecasts.filter(e => (e.hardBreachPct ?? 0) < 30).length,
  };

  // Trajectory summary
  const trajectorySummary = {
    improving: entityForecasts.filter(e => e.trend === "improving").length,
    stable: entityForecasts.filter(e => e.trend === "stable").length,
    worsening: entityForecasts.filter(e => e.trend === "worsening").length,
  };

  return {
    entityForecasts: sortedForecasts,
    group: {
      predictedCompletionDays: groupPredictedDays,
      confidence: groupConfidence,
      slowestEntity: slowest ? { entityCode: slowest.entityCode, entityName: slowest.entityName, predictedDays: slowest.predictedDays } : null,
      entityCount: entityForecasts.length,
    },
    breachDistribution,
    trajectorySummary,
  };
}

// ---------------------------------------------------------------------------
// Phase 4 — Longitudinal Intelligence
// ---------------------------------------------------------------------------

function computeLongitudinalIntelligence(
  entities: Array<{
    entityCode: string; entityName: string; closeStatus: string | null;
    elapsedDays: number | null;
    anomalies: { activeCount: number; criticalCount: number };
  }>,
  historicalRuns: Array<{
    entityCode: string; fiscalYear: number; periodNumber: number;
    closeDays: string | number; closeType: string; targetWorkingDays: number;
    slaBreached: boolean;
  }>,
  crossPeriodAnomalyRows: Array<{
    entityCode: string; fiscalYear: number; periodNumber: number;
    anomalyType: string; severity: string; count: number;
  }>,
) {
  const entityNameMap = new Map(entities.map(e => [e.entityCode, e.entityName]));

  // -------------------------------------------------------------------------
  // 1. Entity behavior profiles (from historical close runs)
  // -------------------------------------------------------------------------
  const histByEntity = new Map<string, Array<{ closeDays: number; slaBreached: boolean; fy: number; pn: number }>>();
  for (const r of historicalRuns) {
    const days = Number(r.closeDays);
    if (isNaN(days) || days <= 0) continue;
    if (!histByEntity.has(r.entityCode)) histByEntity.set(r.entityCode, []);
    histByEntity.get(r.entityCode)!.push({ closeDays: days, slaBreached: r.slaBreached, fy: r.fiscalYear, pn: r.periodNumber });
  }

  const entityProfiles = Array.from(histByEntity.entries())
    .map(([entityCode, runs]) => {
      const days = runs.map(r => r.closeDays);
      const avgDays = days.reduce((a, b) => a + b, 0) / days.length;
      const sortedDays = [...days].sort((a, b) => a - b);
      const medianDays = sortedDays[Math.floor(sortedDays.length / 2)];
      const slaBreachCount = runs.filter(r => r.slaBreached).length;
      const slaBreachRate = Math.round((slaBreachCount / runs.length) * 100);

      // Trend: compare recent half vs older half
      let trend: "improving" | "stable" | "worsening" = "stable";
      if (days.length >= 4) {
        const mid = Math.floor(days.length / 2);
        const recentAvg = days.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
        const olderAvg = days.slice(mid).reduce((a, b) => a + b, 0) / (days.length - mid);
        const delta = (recentAvg - olderAvg) / Math.max(olderAvg, 1);
        if (delta < -0.1) trend = "improving";
        else if (delta > 0.1) trend = "worsening";
      }

      return {
        entityCode,
        entityName: entityNameMap.get(entityCode) ?? entityCode,
        avgCloseDays: Math.round(avgDays * 10) / 10,
        medianCloseDays: Math.round(medianDays * 10) / 10,
        periodCount: runs.length,
        slaBreachCount,
        slaBreachRate,
        trend,
      };
    })
    .sort((a, b) => b.avgCloseDays - a.avgCloseDays);

  // -------------------------------------------------------------------------
  // 2. Persistent anomaly patterns (types appearing across 2+ periods)
  // -------------------------------------------------------------------------
  const typeByPeriod = new Map<string, Map<string, Set<string>>>();  // type → entity → Set<"fy-pn">
  const typeByEntity = new Map<string, Set<string>>();               // type → Set<entity>
  const typeTotal = new Map<string, number>();                        // type → total count

  for (const a of crossPeriodAnomalyRows) {
    const periodKey = `${a.fiscalYear}-${a.periodNumber}`;
    const count = Number(a.count);

    if (!typeByPeriod.has(a.anomalyType)) typeByPeriod.set(a.anomalyType, new Map());
    if (!typeByPeriod.get(a.anomalyType)!.has(a.entityCode)) {
      typeByPeriod.get(a.anomalyType)!.set(a.entityCode, new Set());
    }
    typeByPeriod.get(a.anomalyType)!.get(a.entityCode)!.add(periodKey);

    if (!typeByEntity.has(a.anomalyType)) typeByEntity.set(a.anomalyType, new Set());
    typeByEntity.get(a.anomalyType)!.add(a.entityCode);

    typeTotal.set(a.anomalyType, (typeTotal.get(a.anomalyType) ?? 0) + count);
  }

  const persistentPatterns = Array.from(typeByPeriod.entries())
    .map(([anomalyType, entityMap]) => {
      // Count distinct periods across all entities
      const allPeriods = new Set<string>();
      for (const periods of entityMap.values()) {
        for (const p of periods) allPeriods.add(p);
      }
      return {
        anomalyType,
        entityCount: entityMap.size,
        periodCount: allPeriods.size,
        totalOccurrences: typeTotal.get(anomalyType) ?? 0,
        entities: Array.from(entityMap.keys()),
        isPersistent: allPeriods.size >= 2,
      };
    })
    .filter(p => p.isPersistent)
    .sort((a, b) => b.periodCount - a.periodCount || b.totalOccurrences - a.totalOccurrences)
    .slice(0, 15);

  // -------------------------------------------------------------------------
  // 3. Entity anomaly trends (improving/worsening across periods)
  // -------------------------------------------------------------------------
  const anomalyByEntityPeriod = new Map<string, Map<string, number>>();  // entity → Map<"fy-pn", count>
  for (const a of crossPeriodAnomalyRows) {
    const periodKey = `${a.fiscalYear}-${a.periodNumber}`;
    if (!anomalyByEntityPeriod.has(a.entityCode)) anomalyByEntityPeriod.set(a.entityCode, new Map());
    const ePeriods = anomalyByEntityPeriod.get(a.entityCode)!;
    ePeriods.set(periodKey, (ePeriods.get(periodKey) ?? 0) + Number(a.count));
  }

  const entityTrends = Array.from(anomalyByEntityPeriod.entries())
    .map(([entityCode, periodMap]) => {
      const periods = Array.from(periodMap.entries())
        .sort(([a], [b]) => b.localeCompare(a));  // most recent first
      const counts = periods.map(([, c]) => c);

      let anomalyTrend: "improving" | "stable" | "worsening" = "stable";
      if (counts.length >= 3) {
        const recentAvg = counts.slice(0, Math.ceil(counts.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(counts.length / 2);
        const olderAvg = counts.slice(Math.ceil(counts.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(counts.length / 2);
        if (olderAvg > 0) {
          const delta = (recentAvg - olderAvg) / olderAvg;
          if (delta < -0.15) anomalyTrend = "improving";
          else if (delta > 0.15) anomalyTrend = "worsening";
        }
      }

      // Find the entity profile for close speed trend
      const profile = entityProfiles.find(p => p.entityCode === entityCode);
      const closeSpeedTrend = profile?.trend ?? "stable";

      // Overall direction
      const overall =
        closeSpeedTrend === "worsening" || anomalyTrend === "worsening" ? "needs_attention" as const :
        closeSpeedTrend === "improving" ? "improving" as const :
        "stable" as const;

      return {
        entityCode,
        entityName: entityNameMap.get(entityCode) ?? entityCode,
        closeSpeedTrend,
        anomalyTrend,
        overallDirection: overall,
        periodCount: counts.length,
        latestAnomalyCount: counts[0] ?? 0,
      };
    })
    .sort((a, b) => {
      const order = { needs_attention: 0, stable: 1, improving: 2 };
      return (order[a.overallDirection] ?? 1) - (order[b.overallDirection] ?? 1);
    });

  // -------------------------------------------------------------------------
  // 4. Delay explanations — "why does this entity repeatedly delay?"
  // -------------------------------------------------------------------------
  const delayExplanations = entityProfiles
    .filter(p => p.slaBreachRate >= 30 || p.trend === "worsening")
    .map(p => {
      const reasons: string[] = [];

      if (p.slaBreachRate >= 50) {
        reasons.push(`breached SLA in ${p.slaBreachCount} of ${p.periodCount} periods (${p.slaBreachRate}% breach rate)`);
      } else if (p.slaBreachRate >= 30) {
        reasons.push(`SLA breach rate of ${p.slaBreachRate}% over ${p.periodCount} periods`);
      }

      if (p.trend === "worsening") {
        reasons.push("close duration trend is worsening (recent periods are slower than historical average)");
      }

      // Check for persistent anomalies affecting this entity
      const entityPatterns = persistentPatterns.filter(pat => pat.entities.includes(p.entityCode));
      if (entityPatterns.length > 0) {
        const topPatterns = entityPatterns.slice(0, 2).map(pat => pat.anomalyType).join(", ");
        reasons.push(`recurring anomaly patterns: ${topPatterns}`);
      }

      // Check entity anomaly trend
      const eTrend = entityTrends.find(t => t.entityCode === p.entityCode);
      if (eTrend?.anomalyTrend === "worsening") {
        reasons.push("anomaly count is increasing across recent periods");
      }

      return {
        entityCode: p.entityCode,
        entityName: p.entityName,
        explanation: `${p.entityName} (${p.entityCode}) shows repeated delay patterns: ${reasons.join("; ")}.`,
        avgCloseDays: p.avgCloseDays,
        slaBreachRate: p.slaBreachRate,
      };
    });

  return {
    entityProfiles,
    persistentPatterns,
    entityTrends,
    delayExplanations,
  };
}

function renderGroupCfoBrief(input: GroupNarrativeInput): string {
  const bullets: string[] = [];
  const periodLabel = `P${input.periodNumber} FY${input.fiscalYear}`;

  // 1. Overall status
  const statusWord = input.groupRiskLevel === "NONE" ? "On track" :
                     input.groupRiskLevel === "LOW" ? "Minor items noted" :
                     input.groupRiskLevel === "MEDIUM" ? "Attention needed" : "Immediate attention required";
  bullets.push(`${input.parentName} ${periodLabel}: ${statusWord} (Group Risk Score: ${input.groupRiskScore}).`);

  // 2. Close progress
  const closed = (input.statusDistribution["HARD_CLOSED"] ?? 0) + (input.statusDistribution["SOFT_CLOSED"] ?? 0);
  bullets.push(`Close progress: ${closed}/${input.entityCount} entities closed.`);

  // 3. Critical path
  if (input.enhancedCriticalPath.slowestEntity) {
    const s = input.enhancedCriticalPath.slowestEntity;
    bullets.push(`Critical path: ${s.entityName} (${s.entityCode}) — projected ${s.projectedTotalDays} days total.`);
  }

  // 4. Key risks
  const risks: string[] = [];
  if (input.totalCriticalAnomalies > 0) risks.push(`${input.totalCriticalAnomalies} critical anomalies`);
  if (input.totalGateBlockers > 0) risks.push(`${input.totalGateBlockers} gate blockers`);
  if (input.overrideConcentration.totalOverrides > 0) risks.push(`${input.overrideConcentration.totalOverrides} overrides (${input.overrideConcentration.concentrationRisk} concentration)`);
  if (input.enhancedCriticalPath.slaBreachCount && input.enhancedCriticalPath.slaBreachCount > 0) {
    risks.push(`${input.enhancedCriticalPath.slaBreachCount} projected SLA breaches`);
  }
  if (risks.length > 0) bullets.push(`Key risks: ${risks.join(", ")}.`);

  // 5. Systemic patterns
  if (input.crossEntityAnomalies.repeatedPatterns.length > 0) {
    const patterns = input.crossEntityAnomalies.repeatedPatterns.slice(0, 2).map(
      p => `${p.anomalyType} (${p.entityCount} entities)`,
    );
    bullets.push(`Cross-entity patterns: ${patterns.join(", ")}.`);
  }

  // 6. IC settlement
  if (Number(input.icIntelligence.summary.pendingTransactions) > 0) {
    bullets.push(`IC settlement: ${input.icIntelligence.summary.pendingTransactions} pending (${input.icIntelligence.summary.pendingAmount} unsettled).`);
  }

  return bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");
}
