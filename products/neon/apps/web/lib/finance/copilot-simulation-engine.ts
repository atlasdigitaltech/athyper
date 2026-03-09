// lib/finance/copilot-simulation-engine.ts
//
// Phase 13: Deterministic Close Simulation Engine.
// Computes "what if" scenario projections by adjusting baseline close metrics.
// No LLM — pure arithmetic on existing forecast data.

import type {
  SimulationAdjustment,
  SimulationAdjustmentType,
  SimulationImpact,
  SimulationMetrics,
  SimulationResult,
  SimulationScenario,
  AdvisorCompletionForecastDTO,
  AdvisorDefectQueueItemDTO,
  CloseExecutiveSummaryDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Preset Scenarios
// ---------------------------------------------------------------------------

export const PRESET_SCENARIOS: SimulationScenario[] = [
  {
    id: "resolve_all_blockers",
    name: "Resolve All Blockers",
    description: "What if every blocked task is unblocked immediately?",
    icon: "Unlock",
    adjustments: [
      { type: "RESOLVE_BLOCKERS", label: "Unblock all blocked tasks", value: 100, unit: "%" },
    ],
  },
  {
    id: "expedite_critical_path",
    name: "Expedite Critical Path",
    description: "What if we cut the critical path by 50%?",
    icon: "Zap",
    adjustments: [
      { type: "EXPEDITE_CRITICAL_PATH", label: "Reduce critical path by 50%", value: 50, unit: "%" },
    ],
  },
  {
    id: "accept_top_defects",
    name: "Accept Top 5 Defects",
    description: "What if we accept the top 5 priority defects now?",
    icon: "CheckCircle2",
    adjustments: [
      { type: "ACCEPT_TOP_DEFECTS", label: "Accept top 5 defects immediately", value: 5, unit: "defects" },
    ],
  },
  {
    id: "extend_deadline_24h",
    name: "Extend Deadline 24h",
    description: "What if hard close is extended by 24 hours?",
    icon: "Clock",
    adjustments: [
      { type: "EXTEND_DEADLINE", label: "Extend hard close by 24h", value: 24, unit: "hours" },
    ],
  },
  {
    id: "aggressive_recovery",
    name: "Aggressive Recovery",
    description: "Resolve blockers + expedite critical path + accept top defects",
    icon: "Rocket",
    adjustments: [
      { type: "RESOLVE_BLOCKERS", label: "Unblock all blocked tasks", value: 100, unit: "%" },
      { type: "EXPEDITE_CRITICAL_PATH", label: "Reduce critical path by 30%", value: 30, unit: "%" },
      { type: "ACCEPT_TOP_DEFECTS", label: "Accept top 3 defects", value: 3, unit: "defects" },
    ],
  },
  {
    id: "add_resources",
    name: "Add Weekend Resources",
    description: "What if we add resources to gain 12h of parallel capacity?",
    icon: "Users",
    adjustments: [
      { type: "ADD_RESOURCES", label: "Add 12h parallel capacity", value: 12, unit: "hours" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Breach Probability Heuristic
// ---------------------------------------------------------------------------

// Matches the database view fin.vw_sla_breach_forecast logic
function computeBreachProbability(
  bufferHours: number,
  blockedTasks: number,
  totalTasks: number,
  completionPct: number,
): number {
  let base: number;

  if (bufferHours < 0) {
    base = 95;
  } else if (bufferHours < 4) {
    base = 75;
  } else if (bufferHours < 12) {
    base = 50;
  } else if (bufferHours < 24) {
    base = 30;
  } else if (bufferHours < 48) {
    base = 15;
  } else {
    base = 5;
  }

  // Blocked tasks penalty (0-20%)
  const blockedPct = totalTasks > 0 ? (blockedTasks / totalTasks) * 100 : 0;
  const blockedPenalty = Math.min(20, blockedPct * 2);

  // Completion penalty — if < 50% done, add penalty
  const completionPenalty = completionPct < 50 ? Math.min(15, (50 - completionPct) * 0.5) : 0;

  return Math.min(100, Math.max(0, Math.round(base + blockedPenalty + completionPenalty)));
}

function assessRiskTier(breachPct: number): string {
  if (breachPct >= 75) return "CRITICAL";
  if (breachPct >= 50) return "HIGH";
  if (breachPct >= 25) return "MEDIUM";
  return "LOW";
}

function assessResult(
  baseline: SimulationMetrics,
  projected: SimulationMetrics,
): "SAFE" | "IMPROVED" | "MARGINAL" | "STILL_AT_RISK" {
  if (projected.breachProbability <= 10 && projected.bufferHours >= 24) return "SAFE";
  if (projected.breachProbability < baseline.breachProbability - 20) return "IMPROVED";
  if (projected.breachProbability < baseline.breachProbability - 5) return "MARGINAL";
  return "STILL_AT_RISK";
}

// ---------------------------------------------------------------------------
// Baseline Extraction
// ---------------------------------------------------------------------------

function extractBaseline(
  forecast: AdvisorCompletionForecastDTO | null | undefined,
  summary: CloseExecutiveSummaryDTO | null | undefined,
): SimulationMetrics {
  if (forecast) {
    return {
      breachProbability: forecast.hardBreachPct,
      bufferHours: forecast.hardBufferHours ?? 0,
      completionPct: forecast.completionPct,
      blockedTasks: forecast.blockedCount ?? 0,
      criticalPathMinutes: forecast.criticalPathMinutes ?? 0,
      riskTier: forecast.riskTier,
      predictedReadyLabel: forecast.hardPredictedAt
        ? new Date(forecast.hardPredictedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Unknown",
    };
  }

  // Fallback to executive summary if no forecast
  if (summary) {
    return {
      breachProbability: 50,
      bufferHours: 0,
      completionPct: summary.completionPct ?? 0,
      blockedTasks: 0,
      criticalPathMinutes: 0,
      riskTier: "MEDIUM",
      predictedReadyLabel: "Unknown",
    };
  }

  // No data at all
  return {
    breachProbability: 50,
    bufferHours: 0,
    completionPct: 0,
    blockedTasks: 0,
    criticalPathMinutes: 0,
    riskTier: "MEDIUM",
    predictedReadyLabel: "No data",
  };
}

// ---------------------------------------------------------------------------
// Adjustment Appliers
// ---------------------------------------------------------------------------

interface AdjustmentContext {
  forecast: AdvisorCompletionForecastDTO | null | undefined;
  defectQueue: AdvisorDefectQueueItemDTO[] | null | undefined;
  summary: CloseExecutiveSummaryDTO | null | undefined;
}

function applyAdjustment(
  metrics: SimulationMetrics,
  adj: SimulationAdjustment,
  ctx: AdjustmentContext,
): { metrics: SimulationMetrics; impact: SimulationImpact } {
  const m = { ...metrics };
  let breachDelta = 0;
  let bufferDelta = 0;
  let completionDelta = 0;
  let narrative = "";

  switch (adj.type) {
    case "RESOLVE_BLOCKERS": {
      const blocked = m.blockedTasks;
      const pctToResolve = adj.value / 100;
      const resolved = Math.round(blocked * pctToResolve);
      const totalTasks = ctx.forecast?.totalTasks ?? 1;

      // Each resolved blocker contributes to completion
      const completionGain = totalTasks > 0 ? (resolved / totalTasks) * 100 : 0;
      m.completionPct = Math.min(100, m.completionPct + completionGain);
      m.blockedTasks = Math.max(0, blocked - resolved);

      // Buffer improvement: each blocker resolved saves ~2h on average
      const bufferGain = resolved * 2;
      m.bufferHours += bufferGain;

      // Critical path reduction: blockers often sit on critical path
      if (resolved > 0 && m.criticalPathMinutes > 0) {
        const cpReduction = Math.min(
          m.criticalPathMinutes * 0.3,
          resolved * 60,
        );
        m.criticalPathMinutes = Math.max(0, m.criticalPathMinutes - cpReduction);
      }

      bufferDelta = bufferGain;
      completionDelta = completionGain;
      narrative = `Resolving ${resolved} blocked task${resolved > 1 ? "s" : ""} adds ~${bufferGain}h buffer and ${completionGain.toFixed(1)}% completion.`;
      break;
    }

    case "EXPEDITE_CRITICAL_PATH": {
      const reduction = (adj.value / 100) * m.criticalPathMinutes;
      m.criticalPathMinutes = Math.max(0, m.criticalPathMinutes - reduction);
      const hoursSaved = reduction / 60;
      m.bufferHours += hoursSaved;

      bufferDelta = hoursSaved;
      narrative = `Reducing critical path by ${adj.value}% saves ${hoursSaved.toFixed(1)}h, increasing buffer.`;
      break;
    }

    case "ACCEPT_TOP_DEFECTS": {
      const queue = ctx.defectQueue ?? [];
      const sorted = [...queue].sort(
        (a, b) => b.queuePriorityScore - a.queuePriorityScore,
      );
      const toAccept = sorted.slice(0, adj.value);
      const criticalAccepted = toAccept.filter(
        (d) => d.severity === "critical",
      ).length;
      const totalTasks = ctx.forecast?.totalTasks ?? 1;

      // Each accepted defect contributes to completion
      const completionGain =
        totalTasks > 0 ? (toAccept.length / totalTasks) * 100 : 0;
      m.completionPct = Math.min(100, m.completionPct + completionGain);

      // Critical defects accepted reduce breach risk more
      const bufferGain = toAccept.length * 1.5 + criticalAccepted * 2;
      m.bufferHours += bufferGain;

      bufferDelta = bufferGain;
      completionDelta = completionGain;
      narrative = `Accepting ${toAccept.length} defect${toAccept.length > 1 ? "s" : ""} (${criticalAccepted} critical) adds ~${bufferGain.toFixed(1)}h buffer.`;
      break;
    }

    case "EXTEND_DEADLINE": {
      m.bufferHours += adj.value;
      bufferDelta = adj.value;
      narrative = `Extending deadline by ${adj.value}h directly increases buffer from ${(m.bufferHours - adj.value).toFixed(1)}h to ${m.bufferHours.toFixed(1)}h.`;
      break;
    }

    case "ADD_RESOURCES": {
      // Additional resources reduce critical path
      const cpReduction = Math.min(m.criticalPathMinutes, adj.value * 60);
      m.criticalPathMinutes = Math.max(0, m.criticalPathMinutes - cpReduction);
      m.bufferHours += adj.value;

      bufferDelta = adj.value;
      narrative = `Adding ${adj.value}h of parallel capacity reduces critical path and adds buffer.`;
      break;
    }

    case "WAIVE_TASKS": {
      const totalTasks = ctx.forecast?.totalTasks ?? 1;
      const completionGain =
        totalTasks > 0 ? (adj.value / totalTasks) * 100 : 0;
      m.completionPct = Math.min(100, m.completionPct + completionGain);
      m.blockedTasks = Math.max(0, m.blockedTasks - adj.value);

      const bufferGain = adj.value * 1;
      m.bufferHours += bufferGain;

      bufferDelta = bufferGain;
      completionDelta = completionGain;
      narrative = `Waiving ${adj.value} task${adj.value > 1 ? "s" : ""} adds ${completionGain.toFixed(1)}% completion.`;
      break;
    }

    case "ADD_OVERRIDES": {
      // Overrides can unblock but carry governance risk
      const bufferGain = adj.value * 0.5;
      m.bufferHours += bufferGain;

      bufferDelta = bufferGain;
      narrative = `Adding ${adj.value} override${adj.value > 1 ? "s" : ""} may unblock progress but carries governance risk.`;
      break;
    }
  }

  // Recompute breach probability
  const totalTasks = ctx.forecast?.totalTasks ?? 1;
  const oldBreach = m.breachProbability;
  m.breachProbability = computeBreachProbability(
    m.bufferHours,
    m.blockedTasks,
    totalTasks,
    m.completionPct,
  );
  m.riskTier = assessRiskTier(m.breachProbability);
  breachDelta = m.breachProbability - oldBreach;

  // Update predicted ready label based on buffer change
  if (bufferDelta > 0 && m.bufferHours > 0) {
    m.predictedReadyLabel = `~${m.bufferHours.toFixed(0)}h before deadline`;
  } else if (m.bufferHours < 0) {
    m.predictedReadyLabel = `~${Math.abs(m.bufferHours).toFixed(0)}h after deadline`;
  }

  return {
    metrics: m,
    impact: {
      adjustmentLabel: adj.label,
      breachDelta,
      bufferDelta,
      completionDelta,
      narrative,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a simulation scenario against the current close baseline.
 * Pure function — deterministic, no side effects.
 */
export function runSimulation(
  scenario: SimulationScenario,
  forecast: AdvisorCompletionForecastDTO | null | undefined,
  summary: CloseExecutiveSummaryDTO | null | undefined,
  defectQueue: AdvisorDefectQueueItemDTO[] | null | undefined,
): SimulationResult {
  const baseline = extractBaseline(forecast, summary);
  let projected = { ...baseline };
  const impacts: SimulationImpact[] = [];

  const ctx: AdjustmentContext = { forecast, defectQueue, summary };

  // Apply each adjustment sequentially (order matters for compound scenarios)
  for (const adj of scenario.adjustments) {
    const result = applyAdjustment(projected, adj, ctx);
    projected = result.metrics;
    impacts.push(result.impact);
  }

  const assessment = assessResult(baseline, projected);

  // Build summary narrative
  const breachChange = projected.breachProbability - baseline.breachProbability;
  const bufferChange = projected.bufferHours - baseline.bufferHours;

  const summaryParts: string[] = [];
  summaryParts.push(
    `Scenario "${scenario.name}" projects breach probability ` +
    `${breachChange < 0 ? "improving" : breachChange > 0 ? "worsening" : "unchanged"} ` +
    `from ${baseline.breachProbability}% to ${projected.breachProbability}%.`,
  );

  if (bufferChange !== 0) {
    summaryParts.push(
      `Buffer ${bufferChange > 0 ? "increases" : "decreases"} by ${Math.abs(bufferChange).toFixed(1)}h ` +
      `(${baseline.bufferHours.toFixed(1)}h → ${projected.bufferHours.toFixed(1)}h).`,
    );
  }

  if (projected.completionPct > baseline.completionPct) {
    summaryParts.push(
      `Completion advances from ${baseline.completionPct.toFixed(1)}% to ${projected.completionPct.toFixed(1)}%.`,
    );
  }

  // Recommendations
  const recommendations: string[] = [];
  if (assessment === "STILL_AT_RISK") {
    recommendations.push(
      "This scenario alone is insufficient. Consider combining with deadline extension or additional resource allocation.",
    );
    if (projected.blockedTasks > 0) {
      recommendations.push(
        `${projected.blockedTasks} tasks remain blocked. Prioritize unblocking before other actions.`,
      );
    }
  }
  if (assessment === "MARGINAL") {
    recommendations.push(
      "Improvement is marginal. Monitor closely and prepare fallback actions.",
    );
  }
  if (assessment === "IMPROVED" || assessment === "SAFE") {
    recommendations.push(
      "Scenario shows meaningful improvement. Review adjustments and execute if feasible.",
    );
  }
  if (projected.breachProbability > 30) {
    recommendations.push(
      `Breach probability remains at ${projected.breachProbability}%. Consider escalation to leadership.`,
    );
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    baseline,
    projected,
    impacts,
    assessment,
    summary: summaryParts.join(" "),
    recommendations,
  };
}

/**
 * Run all preset scenarios and return ranked results.
 */
export function runAllSimulations(
  forecast: AdvisorCompletionForecastDTO | null | undefined,
  summary: CloseExecutiveSummaryDTO | null | undefined,
  defectQueue: AdvisorDefectQueueItemDTO[] | null | undefined,
): SimulationResult[] {
  return PRESET_SCENARIOS.map((scenario) =>
    runSimulation(scenario, forecast, summary, defectQueue),
  ).sort((a, b) => a.projected.breachProbability - b.projected.breachProbability);
}
