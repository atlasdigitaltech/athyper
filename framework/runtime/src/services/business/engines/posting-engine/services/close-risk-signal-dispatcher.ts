// framework/runtime/src/services/business/engines/posting-engine/services/close-risk-signal-dispatcher.ts
//
// Scheduled dispatcher for risk signal evaluation.
// Pattern 1: Global dispatcher job runs every N minutes,
// discovers active close contexts, invokes operations service per entity/period.
//
// Job name: fin.job.riskSignalDispatcher
// Registered as BullMQ repeatable via JobRegistry in accounting module.

import { sql } from "kysely";
import type { Kysely } from "kysely";

import type { OperationContext } from "../../shared/engine-base";
import type { CloseRiskSignalOperationsService } from "./close-risk-signal-operations";
import type { CloseGateTarget, CloseRiskSchedule } from "../domain/types";

// ---------------------------------------------------------------------------
// Active close context — represents a period currently undergoing close
// ---------------------------------------------------------------------------

export interface ActiveCloseContext {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Which gate targets to evaluate (could be both) */
  activeTargets: CloseGateTarget[];
}

// ---------------------------------------------------------------------------
// Context discovery interface — decoupled from SQL
// ---------------------------------------------------------------------------

export interface ActiveCloseContextDiscovery {
  /** Find all active close contexts across all tenants */
  discoverActiveContexts(): Promise<ActiveCloseContext[]>;
  /** Load schedule config for an entity (null = use defaults) */
  getSchedule(tenantId: string, entityCode: string): Promise<CloseRiskSchedule | null>;
}

// ---------------------------------------------------------------------------
// Dispatcher — called by the repeatable BullMQ job
// ---------------------------------------------------------------------------

export interface CloseRiskSignalDispatcher {
  /** Discover active contexts and evaluate each one. */
  dispatch(): Promise<DispatchResult>;
}

export interface DispatchResult {
  contextsDiscovered: number;
  contextsEvaluated: number;
  contextsSkipped: number;
  totalFired: number;
  totalAutoResolved: number;
  totalEscalated: number;
  errors: Array<{ entityCode: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Default discovery implementation — queries fiscal_period + close_calendar
// ---------------------------------------------------------------------------

export class DefaultActiveCloseContextDiscovery
  implements ActiveCloseContextDiscovery
{
  constructor(private readonly db: Kysely<any>) {}

  async discoverActiveContexts(): Promise<ActiveCloseContext[]> {
    // Find all fiscal periods in OPEN or SOFT_CLOSE state across all tenants.
    // OPEN periods may target SOFT_CLOSE; SOFT_CLOSE periods target HARD_CLOSE.
    // Joined with close_calendar to confirm a calendar row exists (meaning
    // a close cycle has been planned for this period).
    const result = await sql`
      SELECT
        fp.tenant_id,
        fp.entity_code,
        fp.fiscal_year,
        fp.period_number,
        fp.status
      FROM fin.fiscal_period fp
      INNER JOIN fin.close_calendar cc
        ON cc.tenant_id = fp.tenant_id
        AND cc.entity_code = fp.entity_code
        AND cc.fiscal_year = fp.fiscal_year
        AND cc.period_number = fp.period_number
      WHERE fp.status IN ('OPEN', 'SOFT_CLOSE')
        AND cc.hard_close_actual IS NULL
      ORDER BY fp.tenant_id, fp.entity_code, fp.fiscal_year, fp.period_number
    `.execute(this.db);

    return (result.rows as any[]).map((r) => {
      const activeTargets: CloseGateTarget[] = [];
      if (r.status === "OPEN") {
        activeTargets.push("SOFT_CLOSE");
      } else if (r.status === "SOFT_CLOSE") {
        activeTargets.push("HARD_CLOSE");
      }
      return {
        tenantId: r.tenant_id,
        entityCode: r.entity_code,
        fiscalYear: r.fiscal_year,
        periodNumber: r.period_number,
        activeTargets,
      };
    });
  }

  async getSchedule(
    tenantId: string,
    entityCode: string,
  ): Promise<CloseRiskSchedule | null> {
    const result = await sql`
      SELECT id, tenant_id, entity_code,
             is_enabled, cadence_minutes, active_periods_only,
             created_at, updated_at
      FROM fin.close_risk_schedule
      WHERE tenant_id = ${tenantId}
        AND entity_code = ${entityCode}
    `.execute(this.db);

    const row = (result.rows as any[])[0];
    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityCode: row.entity_code,
      isEnabled: row.is_enabled,
      cadenceMinutes: row.cadence_minutes,
      activePeriodsOnly: row.active_periods_only,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// ---------------------------------------------------------------------------
// Dispatcher — called by the repeatable BullMQ job
// ---------------------------------------------------------------------------

export class DefaultCloseRiskSignalDispatcher implements CloseRiskSignalDispatcher {
  constructor(
    private readonly discovery: ActiveCloseContextDiscovery,
    private readonly operationsService: CloseRiskSignalOperationsService,
  ) {}

  async dispatch(): Promise<DispatchResult> {
    const result: DispatchResult = {
      contextsDiscovered: 0,
      contextsEvaluated: 0,
      contextsSkipped: 0,
      totalFired: 0,
      totalAutoResolved: 0,
      totalEscalated: 0,
      errors: [],
    };

    // 1. Discover active close contexts
    const contexts = await this.discovery.discoverActiveContexts();
    result.contextsDiscovered = contexts.length;

    // 2. Evaluate each context
    for (const closeCtx of contexts) {
      // Check if scheduled evaluation is enabled for this entity
      const schedule = await this.discovery.getSchedule(
        closeCtx.tenantId,
        closeCtx.entityCode,
      );
      if (schedule && !schedule.isEnabled) {
        result.contextsSkipped++;
        continue;
      }

      const opCtx: OperationContext = {
        tenantId: closeCtx.tenantId,
        actorId: "risk-signal-dispatcher",
        actorType: "SCHEDULER",
        correlationId: crypto.randomUUID(),
        entityCode: closeCtx.entityCode,
      };

      for (const targetStatus of closeCtx.activeTargets) {
        try {
          // Evaluate risk rules
          const evalResult = await this.operationsService.evaluate(
            opCtx,
            closeCtx.entityCode,
            closeCtx.fiscalYear,
            closeCtx.periodNumber,
            targetStatus,
          );

          if (evalResult.ok) {
            result.totalFired += evalResult.value.fired;
            result.totalAutoResolved += evalResult.value.autoResolved;
          }

          // Escalate overdue signals
          const escalateResult = await this.operationsService.escalateOverdue(
            opCtx,
            closeCtx.entityCode,
            closeCtx.fiscalYear,
            closeCtx.periodNumber,
          );

          if (escalateResult.ok) {
            result.totalEscalated += escalateResult.value.escalated;
          }

          result.contextsEvaluated++;
        } catch (err) {
          result.errors.push({
            entityCode: closeCtx.entityCode,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return result;
  }
}
