// products/neon/apps/web/lib/finance/risk-signal-service-adapter.ts
//
// BFF adapter factory — constructs CloseRiskSignalOperationsService with
// lightweight SQL-backed repo implementations, so the BFF route delegates
// to the same single-truth service used by the scheduled worker.
//
// This eliminates the dual-path problem where the BFF had inline persistence
// and evaluation logic diverging from the domain service.

import { sql } from "kysely";

import type {
  CloseRiskRule,
  CloseRiskSignal,
  RiskSignalState,
  RiskSignalEventPayload,
  SuppressionScope,
  CloseGateTarget,
  RiskEvaluationContext,
  PeriodCloseReadinessSnapshot,
  PeriodCloseActivity,
  CloseActivityType,
  CloseActivityActorType,
  CloseRiskRuleType,
  CloseTaskSeverity,
  SnapshotSource,
  OperationContext,
} from "@athyper/runtime/services/business/engines/posting-engine";

import type {
  CloseRiskRuleRepo,
  CloseRiskSignalRepo,
  CloseOrchestrationSnapshotRepo,
  PeriodCloseActivityRepo,
} from "@athyper/runtime/services/business/engines/posting-engine";

import {
  DefaultCloseRiskSignalOperationsService,
} from "@athyper/runtime/services/business/engines/posting-engine";

import type {
  RiskSignalEventEmitter,
  RiskEvaluationContextLoader,
} from "@athyper/runtime/services/business/engines/posting-engine";

// ---------------------------------------------------------------------------
// Row mappers — snake_case SQL → camelCase domain
// ---------------------------------------------------------------------------

function mapRuleRow(r: any): CloseRiskRule {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityCode: r.entity_code,
    ruleCode: r.rule_code,
    ruleName: r.rule_name,
    description: r.description ?? null,
    ruleType: r.rule_type as CloseRiskRuleType,
    parameters: r.parameters ?? {},
    severity: r.severity as CloseTaskSeverity,
    escalationRole: r.escalation_role ?? null,
    escalationUserId: r.escalation_user_id ?? null,
    cooldownMinutes: r.cooldown_minutes ?? 240,
    targetStatus: r.target_status as CloseGateTarget | null,
    autoResolveWhenClear: r.auto_resolve_when_clear ?? false,
    suppressionScope: (r.suppression_scope ?? "instance") as SuppressionScope,
    acknowledgeSlaMinutes: r.acknowledge_sla_minutes ?? 0,
    resolveSlaMinutes: r.resolve_sla_minutes ?? 0,
    escalationEnabled: r.escalation_enabled ?? false,
    maxEscalationLevel: r.max_escalation_level ?? 1,
    escalationIntervalMinutes: r.escalation_interval_minutes ?? 60,
    isActive: r.is_active,
    sortOrder: r.sort_order ?? 0,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

function mapSignalRow(r: any): CloseRiskSignal {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityCode: r.entity_code,
    fiscalYear: r.fiscal_year,
    periodNumber: r.period_number,
    ruleId: r.rule_id,
    ruleCode: r.rule_code,
    ruleType: r.rule_type as CloseRiskRuleType,
    severity: r.severity as CloseTaskSeverity,
    signalState: r.signal_state as RiskSignalState,
    signalFingerprint: r.signal_fingerprint ?? null,
    suppressionScope: r.suppression_scope as SuppressionScope | null,
    triggerSnapshotId: r.trigger_snapshot_id ?? null,
    title: r.title,
    message: r.message,
    evidence: r.evidence ?? {},
    firedAt: new Date(r.fired_at),
    acknowledgedBy: r.acknowledged_by ?? null,
    acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at) : null,
    resolvedBy: r.resolved_by ?? null,
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    resolutionNotes: r.resolution_notes ?? null,
    escalationLevel: r.escalation_level ?? 0,
    lastEscalatedAt: r.last_escalated_at ? new Date(r.last_escalated_at) : null,
    createdAt: new Date(r.created_at),
  };
}

function mapSnapshotRow(r: any): PeriodCloseReadinessSnapshot {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    entityCode: r.entity_code,
    fiscalYear: r.fiscal_year,
    periodNumber: r.period_number,
    snapshotAt: new Date(r.snapshot_at),
    targetStatus: r.target_status as CloseGateTarget,
    totalTasks: r.total_tasks,
    satisfiedCount: r.satisfied_count,
    readyCount: r.ready_count,
    blockedCount: r.blocked_count,
    failedCount: r.failed_count,
    notReadyCount: r.not_ready_count,
    inProgressCount: r.in_progress_count,
    criticalPathMinutes: r.critical_path_minutes,
    predictedReadyAt: r.predicted_ready_at ? new Date(r.predicted_ready_at) : null,
    blockerTaskCodes: r.blocker_task_codes ?? [],
    confidence: r.confidence as "low" | "medium" | "high",
    snapshotSource: (r.snapshot_source ?? "api_call") as SnapshotSource,
    computationVersion: r.computation_version ?? "1.0",
    triggeredBy: r.triggered_by ?? "system",
    createdAt: new Date(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// SQL-backed repo implementations
// ---------------------------------------------------------------------------

function createRuleRepo(db: any): CloseRiskRuleRepo {
  return {
    async listByEntity(tenantId, entityCode) {
      const result = await sql`
        SELECT * FROM fin.close_risk_rule
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
        ORDER BY sort_order, rule_code
      `.execute(db);
      return (result.rows as any[]).map(mapRuleRow);
    },

    async getByCode(tenantId, entityCode, ruleCode) {
      const result = await sql`
        SELECT * FROM fin.close_risk_rule
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
          AND rule_code = ${ruleCode}
        LIMIT 1
      `.execute(db);
      const row = (result.rows as any[])[0];
      return row ? mapRuleRow(row) : null;
    },

    async upsert(_tenantId, _rule) {
      throw new Error("upsert not supported in BFF adapter");
    },

    async setActive(_tenantId, _ruleId, _isActive) {
      throw new Error("setActive not supported in BFF adapter");
    },
  };
}

function createSignalRepo(db: any): CloseRiskSignalRepo {
  return {
    async getById(tenantId, signalId) {
      const result = await sql`
        SELECT * FROM fin.close_risk_signal
        WHERE id = ${signalId} AND tenant_id = ${tenantId}
      `.execute(db);
      const row = (result.rows as any[])[0];
      return row ? mapSignalRow(row) : null;
    },

    async insert(tenantId, signal) {
      const result = await sql`
        INSERT INTO fin.close_risk_signal (
          tenant_id, entity_code, fiscal_year, period_number,
          rule_id, rule_code, rule_type, severity,
          signal_state, signal_fingerprint, suppression_scope,
          trigger_snapshot_id,
          title, message, evidence,
          fired_at, acknowledged_by, acknowledged_at,
          resolved_by, resolved_at, resolution_notes,
          escalation_level, last_escalated_at
        ) VALUES (
          ${tenantId}, ${signal.entityCode}, ${signal.fiscalYear}, ${signal.periodNumber},
          ${signal.ruleId}, ${signal.ruleCode}, ${signal.ruleType}, ${signal.severity},
          ${signal.signalState}, ${signal.signalFingerprint ?? null}, ${signal.suppressionScope ?? null},
          ${signal.triggerSnapshotId ?? null},
          ${signal.title}, ${signal.message},
          ${JSON.stringify(signal.evidence)}::jsonb,
          ${signal.firedAt}, ${signal.acknowledgedBy ?? null}, ${signal.acknowledgedAt ?? null},
          ${signal.resolvedBy ?? null}, ${signal.resolvedAt ?? null}, ${signal.resolutionNotes ?? null},
          ${signal.escalationLevel ?? 0}, ${signal.lastEscalatedAt ?? null}
        ) RETURNING *
      `.execute(db);
      return mapSignalRow((result.rows as any[])[0]);
    },

    async listActive(tenantId, entityCode, fiscalYear, periodNumber) {
      const result = await sql`
        SELECT * FROM fin.close_risk_signal
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
          AND signal_state IN ('fired', 'acknowledged')
        ORDER BY fired_at DESC
      `.execute(db);
      return (result.rows as any[]).map(mapSignalRow);
    },

    async listByPeriod(tenantId, entityCode, fiscalYear, periodNumber, options) {
      const limit = options?.limit ?? 200;
      if (options?.signalState) {
        const result = await sql`
          SELECT * FROM fin.close_risk_signal
          WHERE tenant_id = ${tenantId}
            AND entity_code = ${entityCode}
            AND fiscal_year = ${fiscalYear}
            AND period_number = ${periodNumber}
            AND signal_state = ${options.signalState}
          ORDER BY fired_at DESC
          LIMIT ${limit}
        `.execute(db);
        return (result.rows as any[]).map(mapSignalRow);
      }
      const result = await sql`
        SELECT * FROM fin.close_risk_signal
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
        ORDER BY fired_at DESC
        LIMIT ${limit}
      `.execute(db);
      return (result.rows as any[]).map(mapSignalRow);
    },

    async updateState(tenantId, signalId, update) {
      if (update.signalState === "acknowledged") {
        const result = await sql`
          UPDATE fin.close_risk_signal
          SET signal_state = 'acknowledged',
              acknowledged_by = ${update.acknowledgedBy ?? null},
              acknowledged_at = ${update.acknowledgedAt ?? null}
          WHERE id = ${signalId} AND tenant_id = ${tenantId}
          RETURNING *
        `.execute(db);
        return mapSignalRow((result.rows as any[])[0]);
      }
      if (update.signalState === "resolved") {
        const result = await sql`
          UPDATE fin.close_risk_signal
          SET signal_state = 'resolved',
              resolved_by = ${update.resolvedBy ?? null},
              resolved_at = ${update.resolvedAt ?? null},
              resolution_notes = ${update.resolutionNotes ?? null}
          WHERE id = ${signalId} AND tenant_id = ${tenantId}
          RETURNING *
        `.execute(db);
        return mapSignalRow((result.rows as any[])[0]);
      }
      if (update.signalState === "suppressed") {
        const result = await sql`
          UPDATE fin.close_risk_signal
          SET signal_state = 'suppressed',
              suppression_scope = ${update.suppressionScope ?? 'instance'}
          WHERE id = ${signalId} AND tenant_id = ${tenantId}
          RETURNING *
        `.execute(db);
        return mapSignalRow((result.rows as any[])[0]);
      }
      // Generic fallback — just update state
      const result = await sql`
        UPDATE fin.close_risk_signal
        SET signal_state = ${update.signalState}
        WHERE id = ${signalId} AND tenant_id = ${tenantId}
        RETURNING *
      `.execute(db);
      return mapSignalRow((result.rows as any[])[0]);
    },

    async escalate(tenantId, signalId, escalationLevel, escalatedAt) {
      const result = await sql`
        UPDATE fin.close_risk_signal
        SET escalation_level = ${escalationLevel},
            last_escalated_at = ${escalatedAt}
        WHERE id = ${signalId} AND tenant_id = ${tenantId}
        RETURNING *
      `.execute(db);
      return mapSignalRow((result.rows as any[])[0]);
    },

    async getSummary(tenantId, entityCode, fiscalYear, periodNumber) {
      const result = await sql`
        SELECT
          COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged')) AS active_count,
          COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'critical') AS critical_count,
          COUNT(*) FILTER (WHERE signal_state IN ('fired', 'acknowledged') AND severity = 'high') AS high_count,
          COUNT(*) FILTER (WHERE signal_state = 'fired') AS unacknowledged_count
        FROM fin.close_risk_signal
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
      `.execute(db);
      const row = (result.rows as any[])[0] ?? {};
      return {
        activeCount: parseInt(row.active_count ?? "0", 10),
        criticalCount: parseInt(row.critical_count ?? "0", 10),
        highCount: parseInt(row.high_count ?? "0", 10),
        unacknowledgedCount: parseInt(row.unacknowledged_count ?? "0", 10),
      };
    },
  };
}

function createActivityRepo(db: any): PeriodCloseActivityRepo {
  return {
    async append(tenantId, activity) {
      const result = await sql`
        INSERT INTO fin.period_close_activity (
          tenant_id, entity_code, fiscal_year, period_number,
          task_code, activity_type, actor_type, actor_id,
          message, payload
        ) VALUES (
          ${tenantId}, ${activity.entityCode}, ${activity.fiscalYear}, ${activity.periodNumber},
          ${activity.taskCode ?? null}, ${activity.activityType}, ${activity.actorType}, ${activity.actorId ?? null},
          ${activity.message},
          ${activity.payload ? JSON.stringify(activity.payload) : null}::jsonb
        ) RETURNING *
      `.execute(db);
      const r = (result.rows as any[])[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        entityCode: r.entity_code,
        fiscalYear: r.fiscal_year,
        periodNumber: r.period_number,
        checklistId: r.checklist_id ?? null,
        taskCode: r.task_code ?? null,
        activityType: r.activity_type as CloseActivityType,
        actorType: r.actor_type as CloseActivityActorType,
        actorId: r.actor_id ?? null,
        message: r.message,
        payload: r.payload ?? null,
        createdAt: new Date(r.created_at),
      } satisfies PeriodCloseActivity;
    },

    async listByPeriod() {
      throw new Error("listByPeriod not needed in BFF adapter");
    },

    async listByChecklist() {
      throw new Error("listByChecklist not needed in BFF adapter");
    },
  };
}

// Stub — snapshotRepo is not used directly by the service (contextLoader handles it)
function createSnapshotRepoStub(): CloseOrchestrationSnapshotRepo {
  return {
    async insert() { throw new Error("Not used in BFF adapter"); },
    async getLatest() { return null; },
    async listByPeriod() { return []; },
  };
}

// ---------------------------------------------------------------------------
// Context loader — assembles RiskEvaluationContext from SQL
// ---------------------------------------------------------------------------

function createContextLoader(db: any): RiskEvaluationContextLoader {
  return {
    async load(tenantId, entityCode, fiscalYear, periodNumber, targetStatus) {
      // 1. Load snapshots (most recent 10 for this target)
      const snapshotsResult = await sql`
        SELECT * FROM fin.close_orchestration_snapshot
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
          AND target_status = ${targetStatus}
        ORDER BY snapshot_at DESC
        LIMIT 10
      `.execute(db);
      const snapshots = (snapshotsResult.rows as any[]).map(mapSnapshotRow);
      if (snapshots.length === 0) return null;

      // 2. Load active + suppressed signals (suppressed needed for suppression checks)
      const signalsResult = await sql`
        SELECT * FROM fin.close_risk_signal
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
          AND signal_state IN ('fired', 'acknowledged', 'suppressed')
      `.execute(db);
      const activeSignals = (signalsResult.rows as any[]).map(mapSignalRow);

      // 3. Load close calendar targets
      const calendarResult = await sql`
        SELECT soft_close_target, hard_close_target
        FROM fin.close_calendar
        WHERE tenant_id = ${tenantId}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
      `.execute(db);
      const calRow = (calendarResult.rows as any[])[0];
      const closeCalendar = calRow
        ? {
            softCloseTarget: new Date(calRow.soft_close_target),
            hardCloseTarget: new Date(calRow.hard_close_target),
          }
        : null;

      // 4. Load graph nodes (incomplete tasks for task-level evaluators)
      const graphResult = await sql`
        SELECT
          cl.id AS checklist_id, cl.task_id, cl.task_code, cl.task_status,
          cl.due_at, cl.assigned_role, cl.assigned_user_id,
          t.task_name, t.category, t.required_before, t.completion_mode,
          t.severity, t.estimated_duration_minutes, t.orchestration_group
        FROM fin.period_close_checklist cl
        JOIN fin.period_close_task t ON t.id = cl.task_id
        WHERE cl.tenant_id = ${tenantId}
          AND cl.entity_code = ${entityCode}
          AND cl.fiscal_year = ${fiscalYear}
          AND cl.period_number = ${periodNumber}
          AND cl.task_status NOT IN ('COMPLETED', 'WAIVED')
      `.execute(db);

      // Map to minimal PeriodCloseTaskNode shape required by evaluators
      const graphNodes = (graphResult.rows as any[]).map((n: any) => ({
        checklistId: n.checklist_id,
        taskId: n.task_id,
        taskCode: n.task_code,
        taskName: n.task_name,
        category: n.category,
        requiredBefore: n.required_before as CloseGateTarget,
        completionMode: n.completion_mode,
        status: n.task_status,
        readinessState: n.task_status === "FAILED" ? "FAILED" as const
          : n.task_status === "BLOCKED" ? "BLOCKED" as const
          : n.task_status === "IN_PROGRESS" ? "IN_PROGRESS" as const
          : n.task_status === "PENDING" ? "READY" as const
          : "NOT_READY" as const,
        satisfactionState: "UNSATISFIED" as const,
        predecessorTaskCodes: [],
        successorTaskCodes: [],
        blockedByTaskCodes: [],
        downstreamImpactCount: 0,
        estimatedDurationMinutes: n.estimated_duration_minutes ?? null,
        severity: n.severity ?? null,
        orchestrationGroup: n.orchestration_group ?? null,
        assignedRole: n.assigned_role ?? null,
        assignedUserId: n.assigned_user_id ?? null,
        dueAt: n.due_at ? new Date(n.due_at).toISOString() : null,
        earliestStartAt: null,
        predictedFinishAt: null,
        activeSignalCount: 0,
      }));

      return {
        tenantId,
        entityCode,
        fiscalYear,
        periodNumber,
        currentSnapshot: snapshots[0],
        priorSnapshots: snapshots.slice(1),
        activeSignals,
        closeCalendar,
        graphNodes,
      } satisfies RiskEvaluationContext;
    },
  };
}

// ---------------------------------------------------------------------------
// Outbox-backed event emitter — writes to fin.domain_event_outbox
// ---------------------------------------------------------------------------

function createOutboxEmitter(db: any): RiskSignalEventEmitter {
  return {
    async emit(eventType: string, payload: RiskSignalEventPayload, ctx: OperationContext) {
      try {
        await sql`
          INSERT INTO fin.domain_event_outbox (
            tenant_id, event_type, entity_code,
            aggregate_id, aggregate_type,
            actor_id, actor_type, source,
            correlation_id, payload
          ) VALUES (
            ${ctx.tenantId}::uuid,
            ${eventType},
            ${payload.entityCode},
            ${payload.signalId},
            ${"CloseRiskSignal"},
            ${ctx.actorId},
            ${ctx.actorType},
            ${"bff"},
            ${ctx.correlationId}::uuid,
            ${JSON.stringify(payload)}::jsonb
          )
        `.execute(db);
      } catch (err) {
        // Outbox write failure must not block the operation.
        // The activity log (already written by the service) provides audit coverage.
        console.error("[risk-signal-event-publisher] Outbox write failed:", err);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory — constructs the operations service from a Kysely db instance
// ---------------------------------------------------------------------------

export function createRiskSignalOperationsService(db: any) {
  const ruleRepo = createRuleRepo(db);
  const signalRepo = createSignalRepo(db);
  const snapshotRepo = createSnapshotRepoStub();
  const activityRepo = createActivityRepo(db);
  const eventEmitter = createOutboxEmitter(db);
  const contextLoader = createContextLoader(db);

  return new DefaultCloseRiskSignalOperationsService(
    ruleRepo, signalRepo, snapshotRepo, activityRepo,
    eventEmitter, contextLoader,
  );
}
