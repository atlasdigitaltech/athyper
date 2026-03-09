// framework/runtime/src/services/business/engines/posting-engine/services/close-recommendation-engine.ts
//
// Phase 9 — Prescriptive Close Automation: Recommendation Engine
//
// Evaluates active close action policies against the current close state
// and produces ranked recommendations (or auto-executes safe actions).
//
// Flow:
//   1. Load active policies for entity
//   2. For each policy, evaluate trigger condition against current state
//   3. Generate fingerprinted recommendations (deduplicated)
//   4. Sort by priority + severity
//   5. For auto/auto_safe policies, execute immediately
//   6. Persist to close_action_log

import type { OperationContext, ServiceResult } from "../../shared/engine-base";
import { ok, fail } from "../../shared/engine-base";

import type {
  CloseActionPolicy,
  CloseActionTriggerType,
  CloseActionType,
  CloseRecommendation,
  CloseActionLogEntry,
  CloseActionLogStatus,
  CloseActionExecutionMode,
  PeriodCloseGraphResult,
  ClosePredictionResult,
  CriticalPathResult,
  CloseBottleneckPattern,
  PeriodCloseTaskNode,
} from "../domain/types";
import { SAFE_ACTION_TYPES } from "../domain/types";

import type {
  CloseActionPolicyRepo,
  CloseActionLogRepo,
  CloseBottleneckPatternRepo,
} from "../persistence/period-close-repo";

// ── Evaluation Context ──────────────────────────────────────────────────

export interface RecommendationEvaluationContext {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  graph: PeriodCloseGraphResult;
  prediction: ClosePredictionResult;
  criticalPath: CriticalPathResult;
  activeSignalCount: number;
  criticalSignalCount: number;
  highSignalCount: number;
  bottleneckPatterns: CloseBottleneckPattern[];
  /** Parallel opportunities from Phase 8 (optional) */
  parallelOpportunities?: {
    improvementMinutes: number;
    layers: Array<{
      layer: number;
      tasks: Array<{ taskCode: string }>;
      maxDurationMinutes: number;
      sumDurationMinutes: number;
    }>;
  };
}

// ── Evaluation Result ───────────────────────────────────────────────────

export interface RecommendationEngineResult {
  recommendations: CloseRecommendation[];
  autoExecuted: Array<{
    policyCode: string;
    actionType: CloseActionType;
    result: "executed" | "failed";
    detail?: string;
  }>;
  policiesEvaluated: number;
  policiesTriggered: number;
  deduplicatedCount: number;
}

// ── Service Interface ───────────────────────────────────────────────────

export interface CloseRecommendationEngine {
  /** Evaluate all active policies and produce recommendations */
  evaluate(
    ctx: OperationContext,
    evalCtx: RecommendationEvaluationContext,
  ): Promise<ServiceResult<RecommendationEngineResult>>;

  /** Accept a recommendation and mark it for execution */
  acceptRecommendation(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<CloseActionLogEntry>>;

  /** Dismiss a recommendation */
  dismissRecommendation(
    ctx: OperationContext,
    actionId: string,
    reason?: string,
  ): Promise<ServiceResult<CloseActionLogEntry>>;

  /** Record outcome feedback on an executed action */
  recordOutcome(
    ctx: OperationContext,
    actionId: string,
    wasEffective: boolean,
    notes?: string,
  ): Promise<ServiceResult<CloseActionLogEntry>>;
}

// ── Default Implementation ──────────────────────────────────────────────

export class DefaultCloseRecommendationEngine implements CloseRecommendationEngine {
  constructor(
    private readonly policyRepo: CloseActionPolicyRepo,
    private readonly actionLogRepo: CloseActionLogRepo,
    private readonly actionExecutor?: CloseActionExecutor,
  ) {}

  async evaluate(
    ctx: OperationContext,
    evalCtx: RecommendationEvaluationContext,
  ): Promise<ServiceResult<RecommendationEngineResult>> {
    const policies = await this.policyRepo.listByEntity(ctx.tenantId, evalCtx.entityCode);

    const activePolicies = policies.filter((p) => {
      if (!p.isActive) return false;
      const now = new Date();
      if (p.effectiveFrom && now < p.effectiveFrom) return false;
      if (p.effectiveTo && now > p.effectiveTo) return false;
      return true;
    });

    const recommendations: CloseRecommendation[] = [];
    const autoExecuted: RecommendationEngineResult["autoExecuted"] = [];
    let deduplicatedCount = 0;

    for (const policy of activePolicies) {
      const triggerResult = evaluateTrigger(policy, evalCtx);
      if (!triggerResult.triggered) continue;

      const fingerprint = computeFingerprint(
        policy.policyCode,
        policy.triggerType,
        triggerResult.context,
      );

      // Deduplication check
      const exists = await this.actionLogRepo.existsByFingerprint(
        ctx.tenantId,
        evalCtx.entityCode,
        evalCtx.fiscalYear,
        evalCtx.periodNumber,
        fingerprint,
      );
      if (exists) {
        deduplicatedCount++;
        continue;
      }

      const recommendation: CloseRecommendation = {
        policyId: policy.id,
        policyCode: policy.policyCode,
        policyName: policy.policyName,
        triggerType: policy.triggerType,
        actionType: policy.actionType,
        actionParams: policy.actionParams,
        executionMode: policy.executionMode,
        priority: policy.priority,
        severity: policy.severity,
        triggerContext: triggerResult.context,
        fingerprint,
        rationale: triggerResult.rationale,
      };

      // Determine if we auto-execute
      const shouldAutoExecute =
        policy.executionMode === "auto" ||
        (policy.executionMode === "auto_safe" && SAFE_ACTION_TYPES.has(policy.actionType));

      if (shouldAutoExecute && this.actionExecutor) {
        // Auto-execute: persist as executed
        const entry = await this.actionLogRepo.insert(ctx.tenantId, {
          entityCode: evalCtx.entityCode,
          fiscalYear: evalCtx.fiscalYear,
          periodNumber: evalCtx.periodNumber,
          policyId: policy.id,
          policyCode: policy.policyCode,
          actionType: policy.actionType,
          actionParams: policy.actionParams,
          triggerContext: triggerResult.context,
          status: "accepted",
          proposedAt: new Date(),
          decidedAt: new Date(),
          decidedBy: "system",
          executedAt: null,
          executionResult: null,
          outcomeNotes: null,
          wasEffective: null,
          fingerprint,
        });

        try {
          const execResult = await this.actionExecutor.execute(ctx, evalCtx, recommendation);
          await this.actionLogRepo.updateStatus(ctx.tenantId, entry.id, {
            status: "executed",
            executedAt: new Date(),
            executionResult: execResult,
          });
          autoExecuted.push({
            policyCode: policy.policyCode,
            actionType: policy.actionType,
            result: "executed",
            detail: JSON.stringify(execResult),
          });
        } catch (err) {
          await this.actionLogRepo.updateStatus(ctx.tenantId, entry.id, {
            status: "failed",
            executionResult: {
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
          autoExecuted.push({
            policyCode: policy.policyCode,
            actionType: policy.actionType,
            result: "failed",
            detail: err instanceof Error ? err.message : "Unknown error",
          });
        }
      } else {
        // Manual approval required — persist as proposed
        await this.actionLogRepo.insert(ctx.tenantId, {
          entityCode: evalCtx.entityCode,
          fiscalYear: evalCtx.fiscalYear,
          periodNumber: evalCtx.periodNumber,
          policyId: policy.id,
          policyCode: policy.policyCode,
          actionType: policy.actionType,
          actionParams: policy.actionParams,
          triggerContext: triggerResult.context,
          status: "proposed",
          proposedAt: new Date(),
          decidedAt: null,
          decidedBy: null,
          executedAt: null,
          executionResult: null,
          outcomeNotes: null,
          wasEffective: null,
          fingerprint,
        });
        recommendations.push(recommendation);
      }
    }

    // Sort by priority (lower = higher priority), then severity
    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };
    recommendations.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5);
    });

    return ok({
      recommendations,
      autoExecuted,
      policiesEvaluated: activePolicies.length,
      policiesTriggered: recommendations.length + autoExecuted.length,
      deduplicatedCount,
    });
  }

  async acceptRecommendation(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<CloseActionLogEntry>> {
    const updated = await this.actionLogRepo.updateStatus(ctx.tenantId, actionId, {
      status: "accepted",
      decidedBy: ctx.actorId,
      decidedAt: new Date(),
    });
    return ok(updated);
  }

  async dismissRecommendation(
    ctx: OperationContext,
    actionId: string,
    reason?: string,
  ): Promise<ServiceResult<CloseActionLogEntry>> {
    const updated = await this.actionLogRepo.updateStatus(ctx.tenantId, actionId, {
      status: "dismissed",
      decidedBy: ctx.actorId,
      decidedAt: new Date(),
      outcomeNotes: reason ?? undefined,
    });
    return ok(updated);
  }

  async recordOutcome(
    ctx: OperationContext,
    actionId: string,
    wasEffective: boolean,
    notes?: string,
  ): Promise<ServiceResult<CloseActionLogEntry>> {
    const updated = await this.actionLogRepo.updateStatus(ctx.tenantId, actionId, {
      status: "executed",
      wasEffective,
      outcomeNotes: notes ?? undefined,
    });
    return ok(updated);
  }
}

// ── Action Executor Interface ───────────────────────────────────────────

export interface CloseActionExecutor {
  /** Execute a recommended action. Returns execution result payload. */
  execute(
    ctx: OperationContext,
    evalCtx: RecommendationEvaluationContext,
    recommendation: CloseRecommendation,
  ): Promise<Record<string, unknown>>;
}

// ── Trigger Evaluation (pure functions) ─────────────────────────────────

interface TriggerResult {
  triggered: boolean;
  context: Record<string, unknown>;
  rationale: string;
}

function evaluateTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  switch (policy.triggerType) {
    case "ready_tasks_available":
      return evaluateReadyTasksTrigger(policy, evalCtx);
    case "critical_signal_active":
      return evaluateCriticalSignalTrigger(policy, evalCtx);
    case "delay_impact_exceeded":
      return evaluateDelayImpactTrigger(policy, evalCtx);
    case "confidence_below":
      return evaluateConfidenceTrigger(policy, evalCtx);
    case "blocker_stale":
      return evaluateBlockerStaleTrigger(policy, evalCtx);
    case "sla_at_risk":
      return evaluateSlaAtRiskTrigger(policy, evalCtx);
    case "bottleneck_recurring":
      return evaluateBottleneckRecurringTrigger(policy, evalCtx);
    case "handler_failed":
      return evaluateHandlerFailedTrigger(policy, evalCtx);
    case "parallel_opportunity":
      return evaluateParallelOpportunityTrigger(policy, evalCtx);
    default:
      return { triggered: false, context: {}, rationale: "Unknown trigger type" };
  }
}

function evaluateReadyTasksTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const minReady = (policy.triggerCondition.minReadyCount as number) ?? 1;
  const readyTasks = evalCtx.graph.nodes.filter((n) => n.readinessState === "READY");

  if (readyTasks.length < minReady) {
    return { triggered: false, context: {}, rationale: "" };
  }

  return {
    triggered: true,
    context: {
      readyCount: readyTasks.length,
      readyTaskCodes: readyTasks.map((t) => t.taskCode),
    },
    rationale: `${readyTasks.length} task(s) are ready to start (threshold: ${minReady}). ` +
      `Tasks: ${readyTasks.map((t) => t.taskCode).join(", ")}.`,
  };
}

function evaluateCriticalSignalTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const minSeverity = (policy.triggerCondition.minSeverity as string) ?? "high";
  const count = minSeverity === "critical"
    ? evalCtx.criticalSignalCount
    : evalCtx.criticalSignalCount + evalCtx.highSignalCount;

  if (count === 0) {
    return { triggered: false, context: {}, rationale: "" };
  }

  return {
    triggered: true,
    context: {
      criticalCount: evalCtx.criticalSignalCount,
      highCount: evalCtx.highSignalCount,
      totalActive: evalCtx.activeSignalCount,
    },
    rationale: `${count} active risk signal(s) at ${minSeverity}+ severity. ` +
      `${evalCtx.criticalSignalCount} critical, ${evalCtx.highSignalCount} high.`,
  };
}

function evaluateDelayImpactTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const threshold = (policy.triggerCondition.thresholdMinutes as number) ?? 120;

  // Check critical path for delay risk: if remaining > threshold
  const remaining = evalCtx.criticalPath.totalEstimatedMinutes;
  if (remaining < threshold) {
    return { triggered: false, context: {}, rationale: "" };
  }

  const blocker = evalCtx.criticalPath.dominantBlockerTaskCode;
  return {
    triggered: true,
    context: {
      criticalPathMinutes: remaining,
      thresholdMinutes: threshold,
      dominantBlocker: blocker,
      path: evalCtx.criticalPath.path.map((p) => p.taskCode),
    },
    rationale: `Critical path is ${remaining}min (threshold: ${threshold}min). ` +
      (blocker ? `Dominant blocker: ${blocker}.` : "No single blocker identified."),
  };
}

function evaluateConfidenceTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const threshold = (policy.triggerCondition.threshold as string) ?? "medium";
  const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const currentRank = confidenceRank[evalCtx.prediction.confidence] ?? 0;
  const thresholdRank = confidenceRank[threshold] ?? 2;

  if (currentRank >= thresholdRank) {
    return { triggered: false, context: {}, rationale: "" };
  }

  return {
    triggered: true,
    context: {
      currentConfidence: evalCtx.prediction.confidence,
      threshold,
      blockerCount: evalCtx.prediction.blockerTaskCodes.length,
      failedCount: evalCtx.prediction.failedTaskCodes.length,
    },
    rationale: `Close confidence is '${evalCtx.prediction.confidence}' (below '${threshold}' threshold). ` +
      `${evalCtx.prediction.blockerTaskCodes.length} blockers, ${evalCtx.prediction.failedTaskCodes.length} failed tasks.`,
  };
}

function evaluateBlockerStaleTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  // Identify blocked tasks — we can check if they have high downstream impact
  const blockedTasks = evalCtx.graph.nodes.filter(
    (n) => n.readinessState === "BLOCKED" && n.downstreamImpactCount > 0,
  );

  if (blockedTasks.length === 0) {
    return { triggered: false, context: {}, rationale: "" };
  }

  // Sort by downstream impact (worst first)
  blockedTasks.sort((a, b) => b.downstreamImpactCount - a.downstreamImpactCount);
  const worst = blockedTasks[0];

  return {
    triggered: true,
    context: {
      blockedTaskCodes: blockedTasks.map((t) => t.taskCode),
      worstBlocker: worst.taskCode,
      worstBlockerImpact: worst.downstreamImpactCount,
      blockedByTaskCodes: worst.blockedByTaskCodes,
    },
    rationale: `${blockedTasks.length} blocked task(s) with downstream impact. ` +
      `Worst: ${worst.taskCode} (blocks ${worst.downstreamImpactCount} downstream tasks, ` +
      `blocked by: ${worst.blockedByTaskCodes.join(", ")}).`,
  };
}

function evaluateSlaAtRiskTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const leadHours = (policy.triggerCondition.leadHours as number) ?? 4;
  const now = new Date();
  const leadMs = leadHours * 60 * 60 * 1000;

  const atRiskTasks = evalCtx.graph.nodes.filter((n) => {
    if (n.readinessState === "SATISFIED") return false;
    if (!n.dueAt) return false;
    const due = new Date(n.dueAt);
    return due.getTime() - now.getTime() <= leadMs && due.getTime() > now.getTime();
  });

  if (atRiskTasks.length === 0) {
    return { triggered: false, context: {}, rationale: "" };
  }

  return {
    triggered: true,
    context: {
      atRiskTaskCodes: atRiskTasks.map((t) => t.taskCode),
      leadHours,
    },
    rationale: `${atRiskTasks.length} task(s) approaching SLA deadline within ${leadHours}h: ` +
      atRiskTasks.map((t) => t.taskCode).join(", ") + ".",
  };
}

function evaluateBottleneckRecurringTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const minOccurrences = (policy.triggerCondition.minOccurrences as number) ?? 3;

  // Cross-reference bottleneck patterns with current critical path
  const critPathCodes = new Set(evalCtx.criticalPath.path.map((p) => p.taskCode));
  const recurringBottlenecks = evalCtx.bottleneckPatterns.filter(
    (b) => critPathCodes.has(b.taskCode) && b.timesLongestTask >= minOccurrences,
  );

  if (recurringBottlenecks.length === 0) {
    return { triggered: false, context: {}, rationale: "" };
  }

  const worst = recurringBottlenecks.sort(
    (a, b) => b.bottleneckFrequencyPct - a.bottleneckFrequencyPct,
  )[0];

  return {
    triggered: true,
    context: {
      recurringBottlenecks: recurringBottlenecks.map((b) => ({
        taskCode: b.taskCode,
        timesLongestTask: b.timesLongestTask,
        totalCloses: b.totalCloses,
        frequencyPct: b.bottleneckFrequencyPct,
        classification: b.patternClassification,
        avgDurationMinutes: b.avgDurationMinutes,
      })),
    },
    rationale: `${recurringBottlenecks.length} recurring bottleneck(s) on current critical path. ` +
      `${worst.taskCode} was the longest task in ${worst.timesLongestTask} of ${worst.totalCloses} closes ` +
      `(${worst.bottleneckFrequencyPct}%, classified: ${worst.patternClassification}).`,
  };
}

function evaluateHandlerFailedTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const failedTasks = evalCtx.graph.nodes.filter(
    (n) => n.readinessState === "FAILED" || n.status === "FAILED",
  );

  if (failedTasks.length === 0) {
    return { triggered: false, context: {}, rationale: "" };
  }

  return {
    triggered: true,
    context: {
      failedTaskCodes: failedTasks.map((t) => t.taskCode),
    },
    rationale: `${failedTasks.length} task(s) in FAILED state: ` +
      failedTasks.map((t) => t.taskCode).join(", ") + ". Handler re-run may resolve.",
  };
}

function evaluateParallelOpportunityTrigger(
  policy: CloseActionPolicy,
  evalCtx: RecommendationEvaluationContext,
): TriggerResult {
  const minSavings = (policy.triggerCondition.minSavingsMinutes as number) ?? 60;
  const po = evalCtx.parallelOpportunities;

  if (!po || po.improvementMinutes < minSavings) {
    return { triggered: false, context: {}, rationale: "" };
  }

  const parallelLayers = po.layers.filter((l) => l.tasks.length > 1);

  return {
    triggered: true,
    context: {
      improvementMinutes: po.improvementMinutes,
      parallelLayerCount: parallelLayers.length,
      layers: parallelLayers.map((l) => ({
        layer: l.layer,
        taskCodes: l.tasks.map((t) => t.taskCode),
        savings: l.sumDurationMinutes - l.maxDurationMinutes,
      })),
    },
    rationale: `Parallelization opportunity: ${po.improvementMinutes}min savings available ` +
      `across ${parallelLayers.length} layer(s) (threshold: ${minSavings}min).`,
  };
}

// ── Fingerprint ─────────────────────────────────────────────────────────

function computeFingerprint(
  policyCode: string,
  triggerType: CloseActionTriggerType,
  context: Record<string, unknown>,
): string {
  // Extract key identifiers from context for stable fingerprint
  const contextKeys: string[] = [];

  if (Array.isArray(context.readyTaskCodes)) {
    contextKeys.push(...(context.readyTaskCodes as string[]).sort());
  }
  if (Array.isArray(context.failedTaskCodes)) {
    contextKeys.push(...(context.failedTaskCodes as string[]).sort());
  }
  if (Array.isArray(context.blockedTaskCodes)) {
    contextKeys.push(...(context.blockedTaskCodes as string[]).sort());
  }
  if (context.worstBlocker) {
    contextKeys.push(context.worstBlocker as string);
  }
  if (context.currentConfidence) {
    contextKeys.push(context.currentConfidence as string);
  }

  const suffix = contextKeys.length > 0 ? ":" + contextKeys.join(",") : "";
  return `v1:${policyCode}:${triggerType}${suffix}`;
}
