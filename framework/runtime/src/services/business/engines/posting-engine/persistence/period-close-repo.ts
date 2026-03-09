// framework/runtime/src/services/business/engines/posting-engine/persistence/period-close-repo.ts

import type {
  PeriodCloseTask,
  PeriodCloseChecklist,
  PeriodCloseActivity,
  PeriodCloseTaskDependency,
  PeriodCloseReadinessSnapshot,
  ChecklistTaskStatus,
  CloseGateResult,
  CloseProgress,
  CloseGateTarget,
  CloseActivityType,
  CloseActivityActorType,
  CloseTaskAssignment,
  WaiverStatus,
  CloseRiskRule,
  CloseRiskSignal,
  RiskSignalState,
  SuppressionScope,
  CloseRiskRuleType,
  CloseTaskSeverity,
  CloseActionPolicy,
  CloseActionLogEntry,
  CloseActionLogStatus,
  CloseActionTriggerType,
  CloseBottleneckPattern,
} from "../domain/types";

export interface PeriodCloseTaskRepo {
  listByEntity(
    tenantId: string,
    entityCode: string,
  ): Promise<PeriodCloseTask[]>;

  getByCode(
    tenantId: string,
    entityCode: string,
    taskCode: string,
  ): Promise<PeriodCloseTask | null>;

  // Phase 5: Dependency graph queries
  listDependencies(
    tenantId: string,
    entityCode: string,
  ): Promise<PeriodCloseTaskDependency[]>;
}

export interface PeriodCloseChecklistRepo {
  /** Get a single checklist item by ID */
  getById(
    tenantId: string,
    id: string,
  ): Promise<PeriodCloseChecklist | null>;

  /** Materialize checklist from task catalogue for a period */
  materialize(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    blueprint?: string,
  ): Promise<number>;

  listByPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<PeriodCloseChecklist[]>;

  getByTaskCode(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    taskCode: string,
  ): Promise<PeriodCloseChecklist | null>;

  updateStatus(
    tenantId: string,
    id: string,
    status: ChecklistTaskStatus,
    updates: Partial<
      Pick<
        PeriodCloseChecklist,
        | "completedBy"
        | "completedAt"
        | "completionNotes"
        | "evidencePayload"
        | "waivedBy"
        | "waivedAt"
        | "waiverReason"
        | "waiverApprovalRef"
        | "failureReason"
        | "failedAt"
        | "assignedTo"
      >
    >,
  ): Promise<PeriodCloseChecklist>;

  /** Check if all mandatory tasks for a gate are resolved */
  checkGate(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<CloseGateResult>;

  /** Get dashboard-friendly progress summary */
  getProgress(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<CloseProgress>;

  // ── Phase 3: Assignment ──

  /** Update task assignment */
  assignTask(
    tenantId: string,
    id: string,
    assignment: CloseTaskAssignment,
  ): Promise<PeriodCloseChecklist>;

  /** Bulk-assign tasks by ID */
  bulkAssignTasks(
    tenantId: string,
    assignments: Array<{ id: string } & CloseTaskAssignment>,
  ): Promise<PeriodCloseChecklist[]>;

  // ── Phase 3: Waiver Approval ──

  /** Update waiver status and related fields */
  updateWaiverStatus(
    tenantId: string,
    id: string,
    updates: {
      waiverStatus: WaiverStatus;
      waiverRequestSubmittedAt?: Date | null;
      waiverRequestSubmittedBy?: string | null;
      waiverReason?: string | null;
      waiverDecisionAt?: Date | null;
      waiverDecisionBy?: string | null;
      approvalInstanceId?: string | null;
    },
  ): Promise<PeriodCloseChecklist>;

  // ── Phase 3: Handler Execution ──

  /** Record handler execution telemetry */
  updateHandlerExecution(
    tenantId: string,
    id: string,
    updates: {
      lastHandlerRunAt: Date;
      lastHandlerResult: Record<string, unknown>;
      handlerRunCount: number;
    },
  ): Promise<PeriodCloseChecklist>;

  // ── Phase 3: SLA / Escalation Queries ──

  /** List tasks past their SLA deadline that are not yet resolved */
  listOverdueTasks(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<PeriodCloseChecklist[]>;

  /** List tasks approaching SLA within the reminder lead window */
  listReminderCandidates(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    leadHours: number,
  ): Promise<PeriodCloseChecklist[]>;
}

// ── Phase 3: Activity Repository ──────────────────────────────────────

export interface PeriodCloseActivityRepo {
  /** Append an activity event (immutable — no updates) */
  append(
    tenantId: string,
    activity: {
      entityCode: string;
      fiscalYear: number;
      periodNumber: number;
      checklistId?: string | null;
      taskCode?: string | null;
      activityType: CloseActivityType;
      actorType: CloseActivityActorType;
      actorId?: string | null;
      message: string;
      payload?: Record<string, unknown> | null;
    },
  ): Promise<PeriodCloseActivity>;

  /** List activity for a period (newest first) */
  listByPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    options?: { limit?: number; offset?: number; activityType?: CloseActivityType },
  ): Promise<PeriodCloseActivity[]>;

  /** List activity for a specific checklist item (newest first) */
  listByChecklist(
    tenantId: string,
    checklistId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<PeriodCloseActivity[]>;
}

// ── Phase 6: Orchestration Snapshot Repository ──────────────────────────

export interface CloseOrchestrationSnapshotRepo {
  /** Persist a computed graph snapshot */
  insert(
    tenantId: string,
    snapshot: Omit<PeriodCloseReadinessSnapshot, "id" | "tenantId" | "createdAt">,
  ): Promise<PeriodCloseReadinessSnapshot>;

  /** Get the latest snapshot for a period + target */
  getLatest(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<PeriodCloseReadinessSnapshot | null>;

  /** List snapshot history (time series) for a period + target */
  listByPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
    options?: { limit?: number; since?: Date },
  ): Promise<PeriodCloseReadinessSnapshot[]>;
}

// ── Phase 6.1: Risk Signal Repositories ─────────────────────────────────

export interface CloseRiskRuleRepo {
  /** List active rules for an entity */
  listByEntity(
    tenantId: string,
    entityCode: string,
  ): Promise<CloseRiskRule[]>;

  /** Get a single rule by code */
  getByCode(
    tenantId: string,
    entityCode: string,
    ruleCode: string,
  ): Promise<CloseRiskRule | null>;

  /** Create or update a rule */
  upsert(
    tenantId: string,
    rule: Omit<CloseRiskRule, "id" | "tenantId" | "createdAt" | "updatedAt">,
  ): Promise<CloseRiskRule>;

  /** Enable or disable a rule */
  setActive(
    tenantId: string,
    ruleId: string,
    isActive: boolean,
  ): Promise<CloseRiskRule>;
}

export interface CloseRiskSignalRepo {
  /** Get a single signal by ID */
  getById(
    tenantId: string,
    signalId: string,
  ): Promise<CloseRiskSignal | null>;

  /** Insert a fired signal */
  insert(
    tenantId: string,
    signal: Omit<CloseRiskSignal, "id" | "tenantId" | "createdAt">,
  ): Promise<CloseRiskSignal>;

  /** List active signals for a period (fired + acknowledged) */
  listActive(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<CloseRiskSignal[]>;

  /** List all signals for a period (including resolved/suppressed) */
  listByPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    options?: { limit?: number; signalState?: RiskSignalState },
  ): Promise<CloseRiskSignal[]>;

  /** Transition signal state (acknowledge, resolve, suppress) */
  updateState(
    tenantId: string,
    signalId: string,
    update: {
      signalState: RiskSignalState;
      acknowledgedBy?: string;
      acknowledgedAt?: Date;
      resolvedBy?: string;
      resolvedAt?: Date;
      resolutionNotes?: string;
      suppressionScope?: SuppressionScope;
    },
  ): Promise<CloseRiskSignal>;

  /** Update escalation tracking on a signal */
  escalate(
    tenantId: string,
    signalId: string,
    escalationLevel: number,
    escalatedAt: Date,
  ): Promise<CloseRiskSignal>;

  /** Get risk summary counts for a period */
  getSummary(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<{
    activeCount: number;
    criticalCount: number;
    highCount: number;
    unacknowledgedCount: number;
  }>;
}

// ── Phase 8: Task Duration History Repository ────────────────────────────

export interface CloseTaskDurationRecord {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  taskCode: string;
  taskId: string;
  startedAt: Date | null;
  completedAt: Date;
  actualDurationMinutes: number;
  closeType: string | null;
  completionMode: string;
  wasWaived: boolean;
  wasBlocked: boolean;
  blockDurationMinutes: number;
  completedBy: string | null;
}

export interface CloseTaskDurationHistoryRepo {
  /** Upsert a duration record (one per task per period) */
  upsert(
    tenantId: string,
    record: CloseTaskDurationRecord,
  ): Promise<void>;
}

// ── Phase 9: Action Policy & Log Repositories ────────────────────────────

export interface CloseActionPolicyRepo {
  /** List active policies for an entity, optionally filtered by trigger type */
  listByEntity(
    tenantId: string,
    entityCode: string,
    triggerType?: CloseActionTriggerType,
  ): Promise<CloseActionPolicy[]>;

  /** Get a single policy by code */
  getByCode(
    tenantId: string,
    entityCode: string,
    policyCode: string,
  ): Promise<CloseActionPolicy | null>;

  /** Create or update a policy */
  upsert(
    tenantId: string,
    policy: Omit<CloseActionPolicy, "id" | "tenantId" | "createdAt" | "updatedAt">,
  ): Promise<CloseActionPolicy>;

  /** Enable or disable a policy */
  setActive(
    tenantId: string,
    policyId: string,
    isActive: boolean,
  ): Promise<CloseActionPolicy>;
}

export interface CloseActionLogRepo {
  /** Insert a new action log entry (recommendation or auto-action) */
  insert(
    tenantId: string,
    entry: Omit<CloseActionLogEntry, "id" | "tenantId" | "createdAt">,
  ): Promise<CloseActionLogEntry>;

  /** List action log for a period */
  listByPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    options?: { status?: CloseActionLogStatus; limit?: number },
  ): Promise<CloseActionLogEntry[]>;

  /** Update status (accept, dismiss, execute, expire, fail) */
  updateStatus(
    tenantId: string,
    actionId: string,
    update: {
      status: CloseActionLogStatus;
      decidedBy?: string;
      decidedAt?: Date;
      executedAt?: Date;
      executionResult?: Record<string, unknown>;
      outcomeNotes?: string;
      wasEffective?: boolean;
    },
  ): Promise<CloseActionLogEntry>;

  /** Check if a fingerprinted recommendation already exists for this period */
  existsByFingerprint(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    fingerprint: string,
  ): Promise<boolean>;
}

export interface CloseBottleneckPatternRepo {
  /** List bottleneck patterns for an entity (from materialized view) */
  listByEntity(
    tenantId: string,
    entityCode: string,
    options?: { minAppearances?: number; classification?: string },
  ): Promise<CloseBottleneckPattern[]>;
}
