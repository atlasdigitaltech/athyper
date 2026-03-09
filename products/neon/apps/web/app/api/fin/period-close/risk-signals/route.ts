/**
 * Period Close Risk Signals API
 *
 * GET  /api/fin/period-close/risk-signals?entityCode=...&fiscalYear=...&periodNumber=...
 *   → active risk signals for a period (dashboard)
 *
 * GET  /api/fin/period-close/risk-signals?entityCode=...&fiscalYear=...&periodNumber=...&view=summary
 *   → risk summary counts (badge data)
 *
 * GET  /api/fin/period-close/risk-signals?entityCode=...&fiscalYear=...&periodNumber=...&view=all
 *   → all signals including resolved/suppressed
 *
 * GET  /api/fin/period-close/risk-signals?entityCode=...&view=rules
 *   → configured risk rules for entity
 *
 * POST /api/fin/period-close/risk-signals?entityCode=...&fiscalYear=...&periodNumber=...&action=evaluate&targetStatus=SOFT_CLOSE
 *   → evaluate all active rules against current state, fire signals
 *
 * POST /api/fin/period-close/risk-signals?entityCode=...&fiscalYear=...&periodNumber=...&action=acknowledge&signalId=...
 *   → acknowledge a signal
 *
 * POST /api/fin/period-close/risk-signals?entityCode=...&fiscalYear=...&periodNumber=...&action=resolve&signalId=...
 *   → resolve a signal (requires resolutionNotes in body)
 *
 * POST /api/fin/period-close/risk-signals?entityCode=...&fiscalYear=...&periodNumber=...&action=suppress&signalId=...
 *   → suppress a signal (copies suppression_scope from rule)
 *
 * POST /api/fin/period-close/risk-signals?entityCode=...&action=schedule
 *   → get/set scheduled evaluation config (body: { enabled?, cadenceMinutes? })
 *
 * All POST actions delegate to CloseRiskSignalOperationsService — the same
 * single-truth service used by the scheduled dispatcher worker. This ensures
 * identical persistence, activity logging, and event emission behavior
 * regardless of invocation path (manual BFF vs. automated scheduler).
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
import { createRiskSignalOperationsService } from "@/lib/finance/risk-signal-service-adapter";

import type {
  CloseGateTarget,
  RiskSignalState,
} from "@athyper/runtime/services/business/engines/posting-engine";

import type { OperationContext } from "@athyper/runtime/services/business/engines/posting-engine";

// ---------------------------------------------------------------------------
// GET — query signals, summary, rules (pure reads, no service delegation)
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
    const view = url.searchParams.get("view") ?? "active";

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    // Rules view (no period needed)
    if (view === "rules") {
      return await handleListRules(db, tenantUuid, entityCode);
    }

    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "fiscalYear and periodNumber are required", 400);
    }

    if (view === "summary") {
      return await handleSummary(db, tenantUuid, entityCode, fiscalYear, periodNumber);
    }

    if (view === "all") {
      const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
      return await handleListAll(db, tenantUuid, entityCode, fiscalYear, periodNumber, limit);
    }

    // Default: active signals
    return await handleListActive(db, tenantUuid, entityCode, fiscalYear, periodNumber);
  } catch (error) {
    console.error("[GET /api/fin/period-close/risk-signals] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to query risk signals");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — evaluate, acknowledge, resolve, suppress
// All actions delegate to CloseRiskSignalOperationsService.
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
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    const action = url.searchParams.get("action");

    if (!entityCode || !action) {
      return errorResponse("VALIDATION", "entityCode and action are required", 400);
    }

    const actorId = context.userId ?? "system";

    // Schedule action operates at entity level — no period required
    if (action === "schedule") {
      return await handleSchedule(db, tenantUuid, entityCode, req);
    }

    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "fiscalYear and periodNumber are required", 400);
    }

    const service = createRiskSignalOperationsService(db);

    const opCtx: OperationContext = {
      tenantId: tenantUuid,
      actorId,
      actorType: "USER",
      correlationId: crypto.randomUUID(),
      entityCode,
    };

    switch (action) {
      case "evaluate": {
        const targetStatus = url.searchParams.get("targetStatus") as CloseGateTarget | null;
        if (!targetStatus) {
          return errorResponse("VALIDATION", "targetStatus is required for evaluate action", 400);
        }
        const result = await service.evaluate(
          opCtx, entityCode, fiscalYear, periodNumber, targetStatus,
        );
        if (!result.ok) {
          const status = result.error.code === "NO_SNAPSHOTS" ? 404 : 500;
          return errorResponse(result.error.code, result.error.message, status);
        }
        return successResponse({ data: result.value });
      }

      case "acknowledge": {
        const signalId = url.searchParams.get("signalId");
        if (!signalId) {
          return errorResponse("VALIDATION", "signalId is required for acknowledge action", 400);
        }
        const result = await service.transition(opCtx, signalId, "acknowledged");
        if (!result.ok) {
          const status = result.error.code === "NOT_FOUND" ? 404 : 400;
          return errorResponse(result.error.code, result.error.message, status);
        }
        return successResponse({ data: result.value.signal });
      }

      case "resolve": {
        const signalId = url.searchParams.get("signalId");
        if (!signalId) {
          return errorResponse("VALIDATION", "signalId is required for resolve action", 400);
        }
        const body = await req.json().catch(() => ({}));
        const resolutionNotes = body.resolutionNotes;
        if (!resolutionNotes) {
          return errorResponse("VALIDATION", "resolutionNotes is required for resolve action", 400);
        }
        const result = await service.transition(opCtx, signalId, "resolved", resolutionNotes);
        if (!result.ok) {
          const status = result.error.code === "NOT_FOUND" ? 404 : 400;
          return errorResponse(result.error.code, result.error.message, status);
        }
        return successResponse({ data: result.value.signal });
      }

      case "suppress": {
        const signalId = url.searchParams.get("signalId");
        if (!signalId) {
          return errorResponse("VALIDATION", "signalId is required for suppress action", 400);
        }
        const result = await service.transition(opCtx, signalId, "suppressed");
        if (!result.ok) {
          const status = result.error.code === "NOT_FOUND" ? 404 : 400;
          return errorResponse(result.error.code, result.error.message, status);
        }
        return successResponse({ data: result.value.signal });
      }

      default:
        return errorResponse("VALIDATION", `Unknown action: ${action}. Use evaluate, acknowledge, resolve, or suppress.`, 400);
    }
  } catch (error) {
    console.error("[POST /api/fin/period-close/risk-signals] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to process risk signal action");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// GET handlers — pure SQL reads (no service delegation needed)
// ---------------------------------------------------------------------------

async function handleListRules(db: any, tenantUuid: string, entityCode: string) {
  const result = await sql`
    SELECT id, entity_code, rule_code, rule_name, description,
           rule_type, parameters, severity,
           escalation_role, escalation_user_id,
           cooldown_minutes, target_status, is_active, sort_order,
           auto_resolve_when_clear, suppression_scope,
           acknowledge_sla_minutes, resolve_sla_minutes,
           escalation_enabled, max_escalation_level, escalation_interval_minutes,
           created_at, updated_at
    FROM fin.close_risk_rule
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
    ORDER BY sort_order, rule_code
  `.execute(db);
  return successResponse({ data: result.rows });
}

async function handleListActive(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  const result = await sql`
    SELECT s.id, s.entity_code, s.fiscal_year, s.period_number,
           s.rule_code, s.rule_type, s.severity, s.signal_state,
           s.signal_fingerprint, s.escalation_level, s.last_escalated_at,
           s.title, s.message, s.evidence,
           s.fired_at, s.acknowledged_by, s.acknowledged_at,
           r.rule_name, r.escalation_role, r.target_status AS rule_target_status,
           r.auto_resolve_when_clear, r.suppression_scope AS rule_suppression_scope,
           EXTRACT(EPOCH FROM (now() - s.fired_at)) / 3600 AS age_hours
    FROM fin.close_risk_signal s
    JOIN fin.close_risk_rule r ON r.id = s.rule_id
    WHERE s.tenant_id = ${tenantUuid}
      AND s.entity_code = ${entityCode}
      AND s.fiscal_year = ${fiscalYear}
      AND s.period_number = ${periodNumber}
      AND s.signal_state IN ('fired', 'acknowledged')
    ORDER BY
      CASE s.severity
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      s.fired_at DESC
  `.execute(db);
  return successResponse({ data: result.rows });
}

async function handleListAll(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number, limit: number,
) {
  const result = await sql`
    SELECT s.id, s.entity_code, s.fiscal_year, s.period_number,
           s.rule_code, s.rule_type, s.severity, s.signal_state,
           s.signal_fingerprint, s.suppression_scope,
           s.escalation_level, s.last_escalated_at,
           s.title, s.message, s.evidence,
           s.fired_at, s.acknowledged_by, s.acknowledged_at,
           s.resolved_by, s.resolved_at, s.resolution_notes,
           r.rule_name, r.escalation_role
    FROM fin.close_risk_signal s
    JOIN fin.close_risk_rule r ON r.id = s.rule_id
    WHERE s.tenant_id = ${tenantUuid}
      AND s.entity_code = ${entityCode}
      AND s.fiscal_year = ${fiscalYear}
      AND s.period_number = ${periodNumber}
    ORDER BY s.fired_at DESC
    LIMIT ${limit}
  `.execute(db);
  return successResponse({ data: result.rows });
}

async function handleSummary(
  db: any, tenantUuid: string, entityCode: string,
  fiscalYear: number, periodNumber: number,
) {
  const result = await sql`
    SELECT
      COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged')) AS active_count,
      COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'critical') AS critical_count,
      COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'high') AS high_count,
      COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'medium') AS medium_count,
      COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'low') AS low_count,
      COUNT(*) FILTER (WHERE signal_state = 'fired') AS unacknowledged_count,
      COUNT(*) FILTER (WHERE signal_state = 'resolved') AS resolved_count,
      COUNT(*) FILTER (WHERE signal_state = 'suppressed') AS suppressed_count,
      MAX(fired_at) FILTER (WHERE signal_state IN ('fired', 'acknowledged')) AS latest_signal_at
    FROM fin.close_risk_signal
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      AND fiscal_year = ${fiscalYear}
      AND period_number = ${periodNumber}
  `.execute(db);

  const row = (result.rows as any[])[0] ?? {};
  return successResponse({
    data: {
      activeCount: parseInt(row.active_count ?? "0", 10),
      criticalCount: parseInt(row.critical_count ?? "0", 10),
      highCount: parseInt(row.high_count ?? "0", 10),
      mediumCount: parseInt(row.medium_count ?? "0", 10),
      lowCount: parseInt(row.low_count ?? "0", 10),
      unacknowledgedCount: parseInt(row.unacknowledged_count ?? "0", 10),
      resolvedCount: parseInt(row.resolved_count ?? "0", 10),
      suppressedCount: parseInt(row.suppressed_count ?? "0", 10),
      latestSignalAt: row.latest_signal_at ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Schedule control — enable/disable/configure scheduled evaluation per entity
// POST ?entityCode=...&action=schedule  body: { enabled, cadenceMinutes }
// GET equivalent via ?view=schedule handled inline below
// ---------------------------------------------------------------------------

async function handleSchedule(
  db: any, tenantUuid: string, entityCode: string,
  req: NextRequest,
) {
  const body = await req.json().catch(() => ({}));
  const { enabled, cadenceMinutes } = body as {
    enabled?: boolean;
    cadenceMinutes?: number;
  };

  if (enabled === undefined && cadenceMinutes === undefined) {
    // Read-only: return current schedule config
    const result = await sql`
      SELECT id, entity_code, is_enabled, cadence_minutes, active_periods_only,
             created_at, updated_at
      FROM fin.close_risk_schedule
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
    `.execute(db);
    const row = (result.rows as any[])[0];
    return successResponse({
      data: row
        ? {
            entityCode: row.entity_code,
            enabled: row.is_enabled,
            cadenceMinutes: row.cadence_minutes,
            activePeriodsOnly: row.active_periods_only,
            updatedAt: row.updated_at,
          }
        : { entityCode, enabled: false, cadenceMinutes: 30, activePeriodsOnly: true, updatedAt: null },
    });
  }

  // Validate cadence
  if (cadenceMinutes !== undefined && (cadenceMinutes < 5 || cadenceMinutes > 1440)) {
    return errorResponse("VALIDATION", "cadenceMinutes must be between 5 and 1440", 400);
  }

  // Upsert schedule config
  const result = await sql`
    INSERT INTO fin.close_risk_schedule (tenant_id, entity_code, is_enabled, cadence_minutes)
    VALUES (${tenantUuid}, ${entityCode}, ${enabled ?? false}, ${cadenceMinutes ?? 30})
    ON CONFLICT (tenant_id, entity_code)
    DO UPDATE SET
      is_enabled = COALESCE(${enabled ?? null}::boolean, fin.close_risk_schedule.is_enabled),
      cadence_minutes = COALESCE(${cadenceMinutes ?? null}::integer, fin.close_risk_schedule.cadence_minutes),
      updated_at = now()
    RETURNING id, entity_code, is_enabled, cadence_minutes, active_periods_only, updated_at
  `.execute(db);

  const row = (result.rows as any[])[0];
  return successResponse({
    data: {
      entityCode: row.entity_code,
      enabled: row.is_enabled,
      cadenceMinutes: row.cadence_minutes,
      activePeriodsOnly: row.active_periods_only,
      updatedAt: row.updated_at,
    },
  });
}
