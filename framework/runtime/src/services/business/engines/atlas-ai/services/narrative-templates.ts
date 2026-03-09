// framework/runtime/src/services/business/engines/atlas-ai/services/narrative-templates.ts
//
// Atlas Phase 3A — Deterministic Narrative Templates
//
// Pure functions that transform structured Atlas data into human-readable
// narrative text. No LLM, no external dependencies, fully testable.
//
// Each template function receives typed input and returns a plain string.
// The service layer handles data gathering; these functions handle language.

import type {
  NarrativeInput,
  AnomalyExplanationInput,
} from "../domain/narrative-types.js";

// ---------------------------------------------------------------------------
// 1. Dashboard Summary — one-paragraph period health overview
// ---------------------------------------------------------------------------

export function renderDashboardSummary(input: NarrativeInput): string {
  const { entityCode, periodLabel, anomalySummary, riskScore, closeProgress, predictions, reconStatus, consistency } = input;

  const parts: string[] = [];

  // Opening line: overall health
  const healthWord = riskScore === "HIGH" ? "elevated risk" :
                     riskScore === "MEDIUM" ? "moderate risk" :
                     riskScore === "LOW" ? "low risk" : "healthy";
  parts.push(`${entityCode} ${periodLabel} is in ${healthWord} status.`);

  // Close progress
  if (closeProgress.totalTasks > 0) {
    const pct = Math.round((closeProgress.completedTasks / closeProgress.totalTasks) * 100);
    const taskSummary = `Close tasks are ${pct}% complete (${closeProgress.completedTasks}/${closeProgress.totalTasks})`;
    if (closeProgress.failedTasks > 0) {
      parts.push(`${taskSummary}, with ${closeProgress.failedTasks} failed.`);
    } else if (closeProgress.blockedTasks > 0) {
      parts.push(`${taskSummary}, with ${closeProgress.blockedTasks} blocked.`);
    } else {
      parts.push(`${taskSummary}.`);
    }
  }

  // Anomalies
  if (anomalySummary.activeCount > 0) {
    const anomalyParts: string[] = [];
    if (anomalySummary.criticalCount > 0) anomalyParts.push(`${anomalySummary.criticalCount} critical`);
    if (anomalySummary.warningCount > 0) anomalyParts.push(`${anomalySummary.warningCount} warning`);
    parts.push(`Atlas detected ${anomalySummary.activeCount} active ${pluralize("anomaly", anomalySummary.activeCount)} (${anomalyParts.join(", ")}).`);
  } else {
    parts.push("No active anomalies detected.");
  }

  // Predictions
  if (predictions.closeDuration) {
    const expected = Number(predictions.closeDuration.expectedCloseDays);
    const baseline = Number(predictions.closeDuration.historicalAvgDays);
    const delta = expected - baseline;
    if (Math.abs(delta) >= 0.5) {
      const direction = delta > 0 ? "above" : "below";
      parts.push(`Expected close duration is ${predictions.closeDuration.expectedCloseDays} days (${Math.abs(delta).toFixed(1)} days ${direction} baseline).`);
    } else {
      parts.push(`Expected close duration is ${predictions.closeDuration.expectedCloseDays} days, in line with baseline.`);
    }
  }

  // Release readiness
  if (predictions.releaseReadiness) {
    const pct = Math.round(predictions.releaseReadiness.probability * 100);
    parts.push(`Release readiness is at ${pct}%.`);
  }

  // Reconciliation
  if (!reconStatus.isComplete && reconStatus.totalSessions > 0) {
    const remaining = reconStatus.totalSessions - reconStatus.completedSessions;
    parts.push(`${remaining} reconciliation ${pluralize("session", remaining)} ${remaining === 1 ? "remains" : "remain"} open.`);
  }

  // GL consistency
  if (!consistency.balanced) {
    parts.push("GL consistency check is failing — debit/credit imbalance detected.");
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// 2. Release Summary — release readiness explanation with blockers
// ---------------------------------------------------------------------------

export function renderReleaseSummary(input: NarrativeInput): string {
  const { entityCode, periodLabel, predictions, anomalySummary, closeProgress, reconStatus, consistency, riskSignals } = input;

  const parts: string[] = [];

  if (!predictions.releaseReadiness) {
    return `Release readiness for ${entityCode} ${periodLabel} cannot be assessed — insufficient data for prediction.`;
  }

  const pct = Math.round(predictions.releaseReadiness.probability * 100);

  // Opening assessment
  const readinessWord = pct >= 90 ? "ready for release" :
                        pct >= 70 ? "approaching readiness" :
                        pct >= 40 ? "not yet ready" : "at significant risk";
  parts.push(`${entityCode} ${periodLabel} is ${readinessWord} (${pct}% probability).`);

  // Blocker details
  const blockers = predictions.releaseReadiness.blockers;
  if (blockers.length > 0) {
    parts.push(`Blockers: ${blockers.join("; ")}.`);
  }

  // Task status
  if (closeProgress.totalTasks > 0) {
    const remaining = closeProgress.totalTasks - closeProgress.completedTasks;
    if (remaining > 0) {
      parts.push(`${remaining} close ${pluralize("task", remaining)} ${remaining === 1 ? "is" : "are"} still outstanding.`);
    } else {
      parts.push("All close tasks are complete.");
    }
  }

  // Anomaly gate
  if (anomalySummary.criticalCount > 0) {
    parts.push(`${anomalySummary.criticalCount} critical ${pluralize("anomaly", anomalySummary.criticalCount)} must be resolved before the EXCEPTION_SIGNOFF gate can clear.`);
  }

  // Risk signals
  if (riskSignals.highCriticalCount > 0) {
    parts.push(`${riskSignals.highCriticalCount} high/critical risk ${pluralize("signal", riskSignals.highCriticalCount)} ${riskSignals.highCriticalCount === 1 ? "is" : "are"} active.`);
  }

  // Reconciliation
  if (!reconStatus.isComplete && reconStatus.totalSessions > 0) {
    const remaining = reconStatus.totalSessions - reconStatus.completedSessions;
    parts.push(`Reconciliation is incomplete (${reconStatus.completedSessions}/${reconStatus.totalSessions} sessions done, ${remaining} remaining).`);
  }

  // Consistency
  if (!consistency.balanced) {
    parts.push("GL consistency check is failing — this is a hard blocker for release certification.");
  }

  // Duration forecast
  if (predictions.closeDuration) {
    parts.push(`Expected close duration: ${predictions.closeDuration.expectedCloseDays} days (${predictions.closeDuration.confidencePercent}% confidence).`);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// 3. Anomaly Explanation — per-anomaly human-readable explanation
// ---------------------------------------------------------------------------

export function renderAnomalyExplanation(input: AnomalyExplanationInput): string {
  const parts: string[] = [];

  // What was detected
  parts.push(input.title);

  // Statistical evidence
  if (input.zScore && input.baselineMean && input.baselineStddev) {
    const zAbs = Math.abs(Number(input.zScore));
    const mean = Number(input.baselineMean);
    const observed = input.observedValue ? Number(input.observedValue) : null;

    parts.push(
      `The observed value${observed !== null ? ` of ${formatNumber(observed)}` : ""} ` +
      `is ${zAbs.toFixed(1)} standard deviations from the baseline mean of ${formatNumber(mean)}` +
      `${input.sampleCount ? ` (computed over ${input.sampleCount} periods)` : ""}.`
    );
  } else if (input.observedValue && input.expectedValue) {
    parts.push(
      `Observed: ${formatNumber(Number(input.observedValue))}. ` +
      `Expected: ${formatNumber(Number(input.expectedValue))}.`
    );
  }

  // Severity context
  if (input.severity === "CRITICAL") {
    parts.push("This is classified as CRITICAL and will block the EXCEPTION_SIGNOFF gate until resolved or acknowledged.");
  } else if (input.severity === "WARNING") {
    parts.push("This is classified as WARNING. It may escalate to a close risk signal if matching rules are configured.");
  }

  // Account context
  if (input.accountCode && input.accountName) {
    parts.push(`Account: ${input.accountCode} — ${input.accountName}.`);
  }

  // Type-specific guidance
  const guidance = ANOMALY_GUIDANCE[input.anomalyType];
  if (guidance) {
    parts.push(guidance);
  }

  return parts.join(" ");
}

const ANOMALY_GUIDANCE: Record<string, string> = {
  AMOUNT_OUTLIER: "Review the account balance and recent journal entries for unusual postings.",
  UNUSUAL_ADJUSTMENT: "Check whether the adjustment entries have proper approval and supporting documentation.",
  RECON_VARIANCE: "Investigate the reconciliation discrepancy and ensure bank and GL balances align.",
  PERIOD_END_SPIKE: "Unusual journal volume near period-end may indicate catch-up postings or misclassification.",
  MANUAL_JOURNAL_RATIO: "A high proportion of manual entries increases error risk. Verify entries against source documents.",
  LATE_CLOSE_TASK: "Close tasks are taking longer than historical average. Check for resource or dependency bottlenecks.",
  OVERRIDE_SPIKE: "Elevated waiver/override activity may indicate process gaps. Escalate to Controller for review.",
  LARGE_ADJUSTMENT: "Large single adjustments are flagged for size. Verify amount and authorization.",
  EXCEPTION_PATTERN: "Recurring exceptions suggest a systematic issue. Consider process or control review.",
  TIMING_ANOMALY: "Posting cadence differs from historical pattern. Verify no entries were posted to the wrong period.",
  MISSING_RECURRENCE: "An expected recurring entry was not found this period. Check if the entry was missed or reclassified.",
};

// ---------------------------------------------------------------------------
// 4. CFO Brief — executive digest: 3-5 bullet points
// ---------------------------------------------------------------------------

export function renderCfoBrief(input: NarrativeInput): string {
  const { entityCode, periodLabel, anomalySummary, riskScore, closeProgress, predictions, reconStatus, consistency, topAnomalies } = input;

  const bullets: string[] = [];

  // 1. Overall status
  const statusEmoji = riskScore === "NONE" ? "On track" :
                      riskScore === "LOW" ? "Minor items noted" :
                      riskScore === "MEDIUM" ? "Attention needed" : "Immediate attention required";
  bullets.push(`${entityCode} ${periodLabel}: ${statusEmoji}.`);

  // 2. Close progress
  if (closeProgress.totalTasks > 0) {
    const pct = Math.round((closeProgress.completedTasks / closeProgress.totalTasks) * 100);
    let closeText = `Close progress: ${pct}%`;
    if (predictions.closeDuration) {
      closeText += `, expected completion in ${predictions.closeDuration.expectedCloseDays} days`;
    }
    bullets.push(closeText + ".");
  }

  // 3. Release readiness
  if (predictions.releaseReadiness) {
    const pct = Math.round(predictions.releaseReadiness.probability * 100);
    let relText = `Release readiness: ${pct}%`;
    if (predictions.releaseReadiness.blockers.length > 0) {
      relText += ` — ${predictions.releaseReadiness.blockers.length} ${pluralize("blocker", predictions.releaseReadiness.blockers.length)}`;
    }
    bullets.push(relText + ".");
  }

  // 4. Key risks
  const risks: string[] = [];
  if (anomalySummary.criticalCount > 0) {
    risks.push(`${anomalySummary.criticalCount} critical ${pluralize("anomaly", anomalySummary.criticalCount)}`);
  }
  if (!consistency.balanced) {
    risks.push("GL imbalance");
  }
  if (!reconStatus.isComplete && reconStatus.totalSessions > 0) {
    const remaining = reconStatus.totalSessions - reconStatus.completedSessions;
    risks.push(`${remaining} open ${pluralize("reconciliation", remaining)}`);
  }
  if (closeProgress.failedTasks > 0) {
    risks.push(`${closeProgress.failedTasks} failed ${pluralize("task", closeProgress.failedTasks)}`);
  }
  if (risks.length > 0) {
    bullets.push(`Key risks: ${risks.join(", ")}.`);
  }

  // 5. Top anomaly callout (if critical exists)
  const criticalAnomaly = topAnomalies.find(a => a.severity === "CRITICAL");
  if (criticalAnomaly) {
    bullets.push(`Top concern: ${criticalAnomaly.title}${criticalAnomaly.accountCode ? ` (${criticalAnomaly.accountCode})` : ""}.`);
  }

  return bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralize(word: string, count: number): string {
  if (count === 1) return word;
  if (word.endsWith("y") && !word.endsWith("ay") && !word.endsWith("ey")) {
    return word.slice(0, -1) + "ies";
  }
  return word + "s";
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}
