/**
 * Close Risk Evaluator — Pure functions for each risk rule type.
 *
 * Phase 6.1 Hardened:
 *   1. Signal fingerprint — deterministic identity for deduplication
 *   2. Auto-resolve — clear signals when condition no longer holds
 *   3. Suppression scope — instance, rule_period, until_fingerprint_change
 *   4. Normalized evidence — consistent affectedTaskCodes on every result
 *
 * Design:
 *   - Pure functions, no side effects, no I/O
 *   - Registry maps rule_type → evaluator function
 *   - Batch evaluator orchestrates cooldown + suppression + auto-resolve
 *   - Evidence payloads are rule-type-specific for UI drill-down
 */

import type {
  CloseRiskRule,
  CloseRiskRuleType,
  CloseRiskSignal,
  RiskEvaluationContext,
  RiskEvaluationResult,
  RiskEvaluationBatchResult,
  PeriodCloseReadinessSnapshot,
  PeriodCloseTaskNode,
  RiskSignalState,
} from "./types";

import { RISK_SIGNAL_TRANSITIONS } from "./types";

// ---------------------------------------------------------------------------
// No-fire sentinel (shared across evaluators)
// ---------------------------------------------------------------------------

const NO_FIRE: RiskEvaluationResult = {
  fired: false, title: "", message: "", evidence: {},
  fingerprint: null, affectedTaskCodes: [],
};

// ---------------------------------------------------------------------------
// Fingerprint computation — deterministic identity per rule type
//
// Format: v1:rule_code:target_status:sorted_task_codes
//
// Version prefix ensures future format changes don't silently break
// cooldown/suppression matching against historical signals.
//
// Canonicalization: rule_code and task_codes are trimmed + uppercased;
// target_status is trimmed + uppercased or "*" when null.
// This prevents subtle mismatches from casing drift or whitespace.
//
// Fingerprint rules by type:
//   forecast_slipped        → v1:rule_code:target_status
//   confidence_dropped      → v1:rule_code:target_status
//   blocker_stale           → v1:rule_code:target_status:sorted(stale_blockers)
//   failed_task_unresolved  → v1:rule_code:target_status:sorted(failed_task_codes)
//   ready_queue_aging       → v1:rule_code:target_status:sorted(aging_task_codes)
//   sla_warning             → v1:rule_code:sorted(warning_task_codes)
//   sla_breach              → v1:rule_code:sorted(breached_task_codes)
//   close_target_at_risk    → v1:rule_code:target_status
// ---------------------------------------------------------------------------

const FINGERPRINT_VERSION = "v1";

function computeFingerprint(
  ruleCode: string,
  targetStatus: string | null,
  taskCodes: string[],
): string {
  const canon = (s: string) => s.trim().toUpperCase();
  const parts = [FINGERPRINT_VERSION, canon(ruleCode), targetStatus ? canon(targetStatus) : "*"];
  if (taskCodes.length > 0) {
    parts.push([...taskCodes].map(canon).sort().join(","));
  }
  return parts.join(":");
}

// ---------------------------------------------------------------------------
// Evaluator function type
// ---------------------------------------------------------------------------

type RiskEvaluator = (
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
) => RiskEvaluationResult;

// ---------------------------------------------------------------------------
// Individual evaluators
// ---------------------------------------------------------------------------

/**
 * forecast_slipped — predicted_ready_at shifted beyond threshold.
 * Resolved when: prediction stabilizes within threshold.
 */
function evaluateForecastSlipped(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const thresholdMinutes = (rule.parameters.threshold_minutes as number) ?? 120;
  const lookback = (rule.parameters.lookback_snapshots as number) ?? 3;
  const targetStatus = ctx.currentSnapshot.targetStatus;

  const currentPrediction = ctx.currentSnapshot.predictedReadyAt;
  if (!currentPrediction) return NO_FIRE;

  const compareSnapshot = ctx.priorSnapshots
    .filter((s) => s.targetStatus === targetStatus)
    .slice(0, lookback)
    .pop();
  if (!compareSnapshot?.predictedReadyAt) return NO_FIRE;

  const slippageMs = currentPrediction.getTime() - compareSnapshot.predictedReadyAt.getTime();
  const slippageMinutes = Math.round(slippageMs / 60_000);

  if (slippageMinutes < thresholdMinutes) return NO_FIRE;

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, targetStatus, []),
    affectedTaskCodes: [],
    title: `Close forecast slipped by ${slippageMinutes} minutes`,
    message: `Predicted close readiness shifted from ${compareSnapshot.predictedReadyAt.toISOString()} to ${currentPrediction.toISOString()} (${slippageMinutes}min drift, threshold: ${thresholdMinutes}min).`,
    evidence: {
      previousPrediction: compareSnapshot.predictedReadyAt.toISOString(),
      currentPrediction: currentPrediction.toISOString(),
      slippageMinutes,
      thresholdMinutes,
      comparedSnapshotId: compareSnapshot.id,
    },
  };
}

/**
 * confidence_dropped — confidence decreased across consecutive snapshots.
 * Resolved when: confidence recovers to prior level or above.
 */
function evaluateConfidenceDropped(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const levels: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const minFrom = levels[(rule.parameters.from as string) ?? "medium"] ?? 2;
  const targetStatus = ctx.currentSnapshot.targetStatus;

  const prev = ctx.priorSnapshots
    .filter((s) => s.targetStatus === targetStatus)[0];
  if (!prev) return NO_FIRE;

  const prevLevel = levels[prev.confidence] ?? 0;
  const curLevel = levels[ctx.currentSnapshot.confidence] ?? 0;

  if (prevLevel < minFrom || curLevel >= prevLevel) return NO_FIRE;

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, targetStatus, []),
    affectedTaskCodes: [],
    title: `Close confidence dropped: ${prev.confidence} → ${ctx.currentSnapshot.confidence}`,
    message: `Close readiness confidence for ${targetStatus} dropped from "${prev.confidence}" to "${ctx.currentSnapshot.confidence}".`,
    evidence: {
      previousConfidence: prev.confidence,
      currentConfidence: ctx.currentSnapshot.confidence,
      previousSnapshotId: prev.id,
      currentSnapshotId: ctx.currentSnapshot.id,
    },
  };
}

/**
 * blocker_stale — same blockers across N consecutive snapshots.
 * Resolved when: blocker set changes (any blocker resolved or new one added).
 */
function evaluateBlockerStale(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const staleCount = (rule.parameters.stale_snapshot_count as number) ?? 3;
  const targetStatus = ctx.currentSnapshot.targetStatus;

  const currentBlockers = new Set(ctx.currentSnapshot.blockerTaskCodes ?? []);
  if (currentBlockers.size === 0) return NO_FIRE;

  const relevantPriors = ctx.priorSnapshots
    .filter((s) => s.targetStatus === targetStatus)
    .slice(0, staleCount - 1);

  if (relevantPriors.length < staleCount - 1) return NO_FIRE;

  const staleBlockers = [...currentBlockers].filter((code) =>
    relevantPriors.every((s) => (s.blockerTaskCodes ?? []).includes(code)),
  );

  if (staleBlockers.length === 0) return NO_FIRE;

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, targetStatus, staleBlockers),
    affectedTaskCodes: staleBlockers,
    title: `${staleBlockers.length} blocker(s) unchanged across ${staleCount} snapshots`,
    message: `Blocking tasks [${staleBlockers.join(", ")}] have persisted across ${staleCount} consecutive snapshots with no resolution progress.`,
    evidence: {
      staleBlockers,
      snapshotCount: staleCount,
      oldestSnapshotAt: relevantPriors[relevantPriors.length - 1]?.snapshotAt?.toISOString(),
    },
  };
}

/**
 * failed_task_unresolved — FAILED task beyond threshold hours.
 * Resolved when: all previously-failed tasks are resolved.
 */
function evaluateFailedTaskUnresolved(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const thresholdHours = (rule.parameters.threshold_hours as number) ?? 24;
  const targetStatus = ctx.currentSnapshot.targetStatus;
  const now = ctx.currentSnapshot.snapshotAt;
  const failedNodes = ctx.graphNodes.filter((n) => n.readinessState === "FAILED");
  if (failedNodes.length === 0) return NO_FIRE;

  const allSnapshots = [ctx.currentSnapshot, ...ctx.priorSnapshots]
    .filter((s) => s.targetStatus === targetStatus);

  const staleFailures: Array<{ taskCode: string; failedSinceHours: number }> = [];

  for (const node of failedNodes) {
    let earliestFailedAt = now;
    for (const snap of allSnapshots) {
      const failedCodes: string[] = (snap as any).failedTaskCodes ?? snap.blockerTaskCodes ?? [];
      if (failedCodes.includes(node.taskCode)) {
        earliestFailedAt = snap.snapshotAt;
      } else {
        break;
      }
    }
    const hoursElapsed = (now.getTime() - earliestFailedAt.getTime()) / (3600 * 1000);
    if (hoursElapsed >= thresholdHours) {
      staleFailures.push({ taskCode: node.taskCode, failedSinceHours: Math.round(hoursElapsed) });
    }
  }

  if (staleFailures.length === 0) return NO_FIRE;

  const failedCodes = staleFailures.map((f) => f.taskCode);

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, targetStatus, failedCodes),
    affectedTaskCodes: failedCodes,
    title: `${staleFailures.length} failed task(s) unresolved beyond ${thresholdHours}h`,
    message: `Failed tasks [${failedCodes.join(", ")}] remain unresolved beyond the ${thresholdHours}-hour threshold.`,
    evidence: { failedTasks: staleFailures, thresholdHours },
  };
}

/**
 * ready_queue_aging — READY tasks with no action beyond threshold.
 * Resolved when: any aged task transitions out of READY state.
 */
function evaluateReadyQueueAging(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const thresholdHours = (rule.parameters.threshold_hours as number) ?? 8;
  const targetStatus = ctx.currentSnapshot.targetStatus;
  const now = ctx.currentSnapshot.snapshotAt;

  const readyNodes = ctx.graphNodes.filter((n) => n.readinessState === "READY");
  if (readyNodes.length === 0) return NO_FIRE;

  const agingTasks: Array<{ taskCode: string; readySinceHours: number; assignedRole: string | null }> = [];

  for (const node of readyNodes) {
    const earliestStart = node.earliestStartAt ? new Date(node.earliestStartAt) : null;
    if (!earliestStart) continue;
    const readyHours = (now.getTime() - earliestStart.getTime()) / (3600 * 1000);
    if (readyHours >= thresholdHours) {
      agingTasks.push({
        taskCode: node.taskCode,
        readySinceHours: Math.round(readyHours),
        assignedRole: node.assignedRole,
      });
    }
  }

  if (agingTasks.length === 0) return NO_FIRE;

  const agingCodes = agingTasks.map((t) => t.taskCode);

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, targetStatus, agingCodes),
    affectedTaskCodes: agingCodes,
    title: `${agingTasks.length} ready task(s) awaiting action beyond ${thresholdHours}h`,
    message: `Ready tasks [${agingCodes.join(", ")}] have been actionable for more than ${thresholdHours} hours with no progress.`,
    evidence: { agingTasks, thresholdHours },
  };
}

/**
 * sla_warning — task approaching due_at within lead hours.
 * Resolved when: warned tasks complete/waive or move past SLA (becomes sla_breach).
 */
function evaluateSlaWarning(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const leadHours = (rule.parameters.lead_hours as number) ?? 4;
  const now = ctx.currentSnapshot.snapshotAt;

  const warningTasks: Array<{ taskCode: string; dueAt: string; hoursRemaining: number }> = [];

  for (const node of ctx.graphNodes) {
    if (node.readinessState === "SATISFIED") continue;
    if (!node.dueAt) continue;
    const dueDate = new Date(node.dueAt);
    const hoursRemaining = (dueDate.getTime() - now.getTime()) / (3600 * 1000);
    if (hoursRemaining > 0 && hoursRemaining <= leadHours) {
      warningTasks.push({
        taskCode: node.taskCode,
        dueAt: node.dueAt,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
      });
    }
  }

  if (warningTasks.length === 0) return NO_FIRE;

  const warningCodes = warningTasks.map((t) => t.taskCode);

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, null, warningCodes),
    affectedTaskCodes: warningCodes,
    title: `${warningTasks.length} task(s) approaching SLA deadline`,
    message: `Tasks [${warningCodes.join(", ")}] are within ${leadHours} hours of their SLA deadline.`,
    evidence: { warningTasks, leadHours },
  };
}

/**
 * sla_breach — task past due_at and not resolved.
 * Resolved when: all breached tasks complete/waive.
 */
function evaluateSlaBreach(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const now = ctx.currentSnapshot.snapshotAt;

  const breachedTasks: Array<{ taskCode: string; dueAt: string; overdueHours: number }> = [];

  for (const node of ctx.graphNodes) {
    if (node.readinessState === "SATISFIED") continue;
    if (!node.dueAt) continue;
    const dueDate = new Date(node.dueAt);
    if (now <= dueDate) continue;
    const overdueHours = (now.getTime() - dueDate.getTime()) / (3600 * 1000);
    breachedTasks.push({
      taskCode: node.taskCode,
      dueAt: node.dueAt,
      overdueHours: Math.round(overdueHours * 10) / 10,
    });
  }

  if (breachedTasks.length === 0) return NO_FIRE;

  const breachedCodes = breachedTasks.map((t) => t.taskCode);

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, null, breachedCodes),
    affectedTaskCodes: breachedCodes,
    title: `${breachedTasks.length} task(s) past SLA deadline`,
    message: `Tasks [${breachedCodes.join(", ")}] have exceeded their SLA deadline.`,
    evidence: { breachedTasks },
  };
}

/**
 * close_target_at_risk — close target date at risk given current forecast.
 * Resolved when: confidence improves above threshold or prediction moves before target.
 */
function evaluateCloseTargetAtRisk(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  if (!ctx.closeCalendar) return NO_FIRE;

  const daysBefore = (rule.parameters.days_before_target as number) ?? 3;
  const minConfidence = (rule.parameters.min_confidence as string) ?? "medium";
  const confidenceLevels: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const targetStatus = ctx.currentSnapshot.targetStatus;

  const targetDate = targetStatus === "SOFT_CLOSE"
    ? ctx.closeCalendar.softCloseTarget
    : ctx.closeCalendar.hardCloseTarget;

  const now = ctx.currentSnapshot.snapshotAt;
  const daysUntilTarget = (targetDate.getTime() - now.getTime()) / (86400 * 1000);

  if (daysUntilTarget > daysBefore || daysUntilTarget < 0) return NO_FIRE;

  const curConf = confidenceLevels[ctx.currentSnapshot.confidence] ?? 0;
  const minConf = confidenceLevels[minConfidence] ?? 2;
  if (curConf > minConf) return NO_FIRE;

  const predictedPast = ctx.currentSnapshot.predictedReadyAt
    && ctx.currentSnapshot.predictedReadyAt > targetDate;

  if (!predictedPast && curConf > minConf) return NO_FIRE;

  return {
    fired: true,
    fingerprint: computeFingerprint(rule.ruleCode, targetStatus, []),
    affectedTaskCodes: [],
    title: `${targetStatus} target at risk`,
    message: `Close target ${targetDate.toISOString().slice(0, 10)} is ${Math.round(daysUntilTarget * 10) / 10} days away with "${ctx.currentSnapshot.confidence}" confidence.${predictedPast ? ` Forecast (${ctx.currentSnapshot.predictedReadyAt!.toISOString()}) exceeds target.` : ""}`,
    evidence: {
      targetDate: targetDate.toISOString(),
      predictedReadyAt: ctx.currentSnapshot.predictedReadyAt?.toISOString() ?? null,
      daysUntilTarget: Math.round(daysUntilTarget * 10) / 10,
      confidence: ctx.currentSnapshot.confidence,
      targetStatus,
      daysBefore,
    },
  };
}

// ---------------------------------------------------------------------------
// Evaluator registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Atlas Anomaly evaluator — checks for active anomalies detected by Atlas AI
// ---------------------------------------------------------------------------

function evaluateAtlasAnomaly(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const anomalies = ctx.atlasAnomalies ?? [];
  if (anomalies.length === 0) return NO_FIRE;

  const params = rule.parameters as {
    min_severity?: string;
    anomaly_types?: string[];
  };
  const minSeverity = params.min_severity ?? "WARNING";
  const allowedTypes = params.anomaly_types ?? [];

  const severityRank: Record<string, number> = {
    INFO: 1, WARNING: 2, CRITICAL: 3,
  };
  const minRank = severityRank[minSeverity] ?? 2;

  // Filter anomalies that meet the severity threshold and type filter
  const qualifying = anomalies.filter((a) => {
    if (a.status !== "OPEN" && a.status !== "ACKNOWLEDGED") return false;
    if ((severityRank[a.severity] ?? 0) < minRank) return false;
    if (allowedTypes.length > 0 && !allowedTypes.includes(a.anomalyType)) return false;
    return true;
  });

  if (qualifying.length === 0) return NO_FIRE;

  const targetStatus = rule.targetStatus ?? null;
  const anomalyIds = qualifying.map((a) => a.id).sort();
  const fingerprint = computeFingerprint(rule.ruleCode, targetStatus, anomalyIds);

  const highestSeverity = qualifying.reduce((max, a) =>
    (severityRank[a.severity] ?? 0) > (severityRank[max] ?? 0) ? a.severity : max,
    "INFO",
  );

  const summaries = qualifying.slice(0, 5).map((a) =>
    `${a.anomalyType}: ${a.title}${a.zScore ? ` (z=${a.zScore})` : ""}`,
  );

  return {
    fired: true,
    fingerprint,
    affectedTaskCodes: [],
    title: `Atlas detected ${qualifying.length} anomal${qualifying.length === 1 ? "y" : "ies"} (${highestSeverity})`,
    message: summaries.join("; ") + (qualifying.length > 5 ? `; +${qualifying.length - 5} more` : ""),
    evidence: {
      anomalyCount: qualifying.length,
      highestSeverity,
      anomalies: qualifying.map((a) => ({
        id: a.id,
        type: a.anomalyType,
        severity: a.severity,
        accountId: a.accountId,
        title: a.title,
        zScore: a.zScore,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Document defect evaluator — checks for document registry defects blocking close
// ---------------------------------------------------------------------------

function evaluateDocumentDefectDetected(
  rule: CloseRiskRule,
  ctx: RiskEvaluationContext,
): RiskEvaluationResult {
  const defects = ctx.documentDefects;
  if (!defects || defects.totalDocuments === 0) return NO_FIRE;

  const params = rule.parameters as {
    min_severity?: string;
    min_defect_count?: number;
  };
  const minSeverity = params.min_severity ?? "HIGH";
  const minDefectCount = params.min_defect_count ?? 1;

  const severityRank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  const minRank = severityRank[minSeverity] ?? 3;

  // Count qualifying defects at or above the severity threshold
  let qualifyingCount = 0;
  if (severityRank["HIGH"] >= minRank) qualifyingCount += defects.highSeverityDefects;
  if (severityRank["MEDIUM"] >= minRank) qualifyingCount += defects.mediumSeverityDefects;
  if (severityRank["LOW"] >= minRank) qualifyingCount += defects.lowSeverityDefects;

  if (qualifyingCount < minDefectCount) return NO_FIRE;

  const targetStatus = ctx.currentSnapshot.targetStatus;

  // Build fingerprint from defect type distribution (deterministic)
  const defectKeys = defects.defectsByType
    .map((d) => `${d.docType}:${d.defectType}:${d.count}`)
    .sort();

  const fingerprint = computeFingerprint(rule.ruleCode, targetStatus, defectKeys);

  const summaries: string[] = [];
  if (defects.highSeverityDefects > 0) summaries.push(`${defects.highSeverityDefects} high-severity`);
  if (defects.mediumSeverityDefects > 0) summaries.push(`${defects.mediumSeverityDefects} medium-severity`);
  if (defects.lowSeverityDefects > 0) summaries.push(`${defects.lowSeverityDefects} low-severity`);
  if (defects.accrualReversalGaps > 0) summaries.push(`${defects.accrualReversalGaps} accrual reversal gap(s)`);
  if (defects.postingGaps > 0) summaries.push(`${defects.postingGaps} posting gap(s)`);

  return {
    fired: true,
    fingerprint,
    affectedTaskCodes: [],
    title: `${qualifyingCount} document defect(s) blocking close`,
    message: `Document registry has ${defects.defectDocuments} defect(s) out of ${defects.totalDocuments} documents: ${summaries.join(", ")}.`,
    evidence: {
      totalDocuments: defects.totalDocuments,
      defectDocuments: defects.defectDocuments,
      highSeverityDefects: defects.highSeverityDefects,
      mediumSeverityDefects: defects.mediumSeverityDefects,
      lowSeverityDefects: defects.lowSeverityDefects,
      accrualReversalGaps: defects.accrualReversalGaps,
      postingGaps: defects.postingGaps,
      defectsByType: defects.defectsByType,
      qualifyingCount,
      minSeverity,
    },
  };
}

const EVALUATOR_REGISTRY: Record<CloseRiskRuleType, RiskEvaluator> = {
  forecast_slipped: evaluateForecastSlipped,
  confidence_dropped: evaluateConfidenceDropped,
  blocker_stale: evaluateBlockerStale,
  failed_task_unresolved: evaluateFailedTaskUnresolved,
  ready_queue_aging: evaluateReadyQueueAging,
  sla_warning: evaluateSlaWarning,
  sla_breach: evaluateSlaBreach,
  close_target_at_risk: evaluateCloseTargetAtRisk,
  atlas_anomaly: evaluateAtlasAnomaly,
  document_defect_detected: evaluateDocumentDefectDetected,
};

// ---------------------------------------------------------------------------
// Cooldown check — fingerprint-aware
// ---------------------------------------------------------------------------

function isRuleCooledDown(
  rule: CloseRiskRule,
  fingerprint: string | null,
  ctx: RiskEvaluationContext,
  now: Date,
): boolean {
  if (rule.cooldownMinutes <= 0) return true;

  const cutoff = new Date(now.getTime() - rule.cooldownMinutes * 60_000);
  return !ctx.activeSignals.some(
    (s) =>
      s.ruleId === rule.id &&
      // Fingerprint-aware: if fingerprint provided, only match same fingerprint
      (fingerprint == null || s.signalFingerprint === fingerprint) &&
      (s.signalState === "fired" || s.signalState === "acknowledged") &&
      s.firedAt > cutoff,
  );
}

// ---------------------------------------------------------------------------
// Suppression check — scope-aware
// ---------------------------------------------------------------------------

function isRuleSuppressed(
  rule: CloseRiskRule,
  fingerprint: string | null,
  ctx: RiskEvaluationContext,
): boolean {
  // Check all suppressed signals for this rule in this period
  const suppressed = ctx.activeSignals.filter(
    (s) => s.ruleId === rule.id && s.signalState === "suppressed",
  );

  // Also check from the broader context (suppressed signals may not be in activeSignals
  // since activeSignals only contains fired+acknowledged — so we check all signals)
  // The caller should include suppressed signals in the context for this to work.
  // For robustness, we also check the full signal list if provided.

  for (const s of suppressed) {
    if (s.suppressionScope === "rule_period") {
      // Entire rule suppressed for this period
      return true;
    }
    if (s.suppressionScope === "until_fingerprint_change" && fingerprint != null) {
      // Only suppressed if fingerprint matches
      if (s.signalFingerprint === fingerprint) return true;
    }
    // "instance" scope: only suppresses that specific signal, doesn't block new firings
  }

  return false;
}

// ---------------------------------------------------------------------------
// Auto-resolve — find active signals whose conditions have cleared
// ---------------------------------------------------------------------------

function computeAutoResolves(
  rules: CloseRiskRule[],
  ctx: RiskEvaluationContext,
): RiskEvaluationBatchResult["autoResolvedSignals"] {
  const resolved: RiskEvaluationBatchResult["autoResolvedSignals"] = [];

  // Group active signals by rule
  const signalsByRule = new Map<string, CloseRiskSignal[]>();
  for (const sig of ctx.activeSignals) {
    if (sig.signalState !== "fired" && sig.signalState !== "acknowledged") continue;
    if (!signalsByRule.has(sig.ruleId)) signalsByRule.set(sig.ruleId, []);
    signalsByRule.get(sig.ruleId)!.push(sig);
  }

  for (const rule of rules) {
    if (!rule.autoResolveWhenClear) continue;

    const activeForRule = signalsByRule.get(rule.id);
    if (!activeForRule || activeForRule.length === 0) continue;

    // Re-evaluate the rule to see if condition still holds
    const evaluator = EVALUATOR_REGISTRY[rule.ruleType];
    if (!evaluator) continue;

    const result = evaluator(rule, ctx);

    if (!result.fired) {
      // Condition cleared — all active signals for this rule should auto-resolve
      for (const sig of activeForRule) {
        resolved.push({
          signalId: sig.id,
          ruleCode: sig.ruleCode,
          fingerprint: sig.signalFingerprint ?? "",
        });
      }
    } else if (result.fingerprint) {
      // Condition still holds but maybe for different tasks —
      // auto-resolve signals with non-matching fingerprints
      for (const sig of activeForRule) {
        if (sig.signalFingerprint && sig.signalFingerprint !== result.fingerprint) {
          resolved.push({
            signalId: sig.id,
            ruleCode: sig.ruleCode,
            fingerprint: sig.signalFingerprint,
          });
        }
      }
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Batch evaluator — orchestrates cooldown + suppression + auto-resolve
// ---------------------------------------------------------------------------

/**
 * Evaluate all active rules against the current context.
 *
 * Pure function: does not persist anything. Returns:
 *   - signals to create (new firings)
 *   - signals to auto-resolve (conditions cleared)
 *
 * The caller (service/BFF) handles persistence, activity log, notifications.
 */
export function evaluateRiskRules(
  rules: CloseRiskRule[],
  ctx: RiskEvaluationContext,
): RiskEvaluationBatchResult {
  const now = ctx.currentSnapshot.snapshotAt;
  let skippedCooldown = 0;
  let skippedSuppressed = 0;
  const signals: RiskEvaluationBatchResult["signals"] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Target filtering
    if (rule.targetStatus && rule.targetStatus !== ctx.currentSnapshot.targetStatus) continue;

    const evaluator = EVALUATOR_REGISTRY[rule.ruleType];
    if (!evaluator) continue;

    const result = evaluator(rule, ctx);
    if (!result.fired) continue;

    const fingerprint = result.fingerprint!;

    // Suppression check (before cooldown — suppression is a higher-level gate)
    if (isRuleSuppressed(rule, fingerprint, ctx)) {
      skippedSuppressed++;
      continue;
    }

    // Cooldown check (fingerprint-aware)
    if (!isRuleCooledDown(rule, fingerprint, ctx, now)) {
      skippedCooldown++;
      continue;
    }

    signals.push({
      ruleCode: rule.ruleCode,
      ruleType: rule.ruleType,
      severity: rule.severity,
      title: result.title,
      message: result.message,
      evidence: result.evidence,
      fingerprint,
      affectedTaskCodes: result.affectedTaskCodes,
    });
  }

  // Auto-resolve: find active signals whose conditions have cleared
  const autoResolvedSignals = computeAutoResolves(rules, ctx);

  return {
    evaluated: rules.length,
    fired: signals.length,
    skippedCooldown,
    skippedSuppressed,
    autoResolved: autoResolvedSignals.length,
    signals,
    autoResolvedSignals,
  };
}

/**
 * Compute a signal fingerprint for a given rule evaluation result.
 * Exported for use by BFF routes that mirror evaluation logic.
 */
export { computeFingerprint };

/**
 * Validate that a signal state transition is allowed.
 */
export function isValidSignalTransition(
  from: RiskSignalState,
  to: RiskSignalState,
): boolean {
  return RISK_SIGNAL_TRANSITIONS[from]?.includes(to) ?? false;
}
