// lib/finance/copilot-root-cause-engine.ts
//
// Phase 14: Deterministic Root Cause Analysis Engine.
// Traces from symptoms (red status, breach risk) through contributing
// factors down to specific root causes with evidence chains.
// No LLM — rule-based causality tracing on existing data.

import type {
  RootCause,
  RootCauseAnalysis,
  RootCauseCategory,
  RootCauseEvidence,
  AdvisorEntityHeatmapDTO,
  AdvisorControllerAlertDTO,
  AdvisorDefectQueueItemDTO,
  AdvisorCompletionForecastDTO,
  CloseExecutiveSummaryDTO,
} from "./types";

import type { AtlasDashboardData } from "./use-atlas-dashboard";

// ---------------------------------------------------------------------------
// Cause ID counter
// ---------------------------------------------------------------------------

let causeIdCounter = 0;
function nextCauseId(): string {
  return `rc-${++causeIdCounter}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RootCauseInput {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  executiveSummary?: CloseExecutiveSummaryDTO | null;
  heatmap?: AdvisorEntityHeatmapDTO[] | null;
  alerts?: AdvisorControllerAlertDTO[] | null;
  defectQueue?: AdvisorDefectQueueItemDTO[] | null;
  completionForecast?: AdvisorCompletionForecastDTO | null;
  atlasDashboard?: AtlasDashboardData | null;
}

/**
 * Perform deterministic root cause analysis.
 * Traces from visible symptoms → contributing factors → root causes.
 */
export function analyzeRootCauses(input: RootCauseInput): RootCauseAnalysis {
  const causes: RootCause[] = [];

  // Run all analyzers
  analyzeBlockers(input, causes);
  analyzeDefectQueue(input, causes);
  analyzeAnomalies(input, causes);
  analyzeOverrideRisk(input, causes);
  analyzeDocumentHealth(input, causes);
  analyzeSlaPressure(input, causes);
  analyzeTrendDegradation(input, causes);

  // Sort by breach contribution descending
  causes.sort((a, b) => b.breachContribution - a.breachContribution);

  const totalBreachContribution = causes.reduce(
    (sum, c) => sum + c.breachContribution,
    0,
  );

  // Determine health status
  const criticalCount = causes.filter((c) => c.severity === "critical").length;
  const highCount = causes.filter((c) => c.severity === "high").length;

  let healthStatus: RootCauseAnalysis["healthStatus"];
  if (criticalCount >= 2 || totalBreachContribution >= 60) {
    healthStatus = "CRITICAL";
  } else if (criticalCount >= 1 || highCount >= 2 || totalBreachContribution >= 30) {
    healthStatus = "DEGRADED";
  } else if (highCount >= 1 || totalBreachContribution >= 10) {
    healthStatus = "WATCH";
  } else {
    healthStatus = "HEALTHY";
  }

  // Build summary
  const summaryParts: string[] = [];
  if (causes.length === 0) {
    summaryParts.push(
      `No significant root causes identified for ${input.entityCode}. Close health is nominal.`,
    );
  } else {
    summaryParts.push(
      `Identified ${causes.length} root cause${causes.length > 1 ? "s" : ""} for ${input.entityCode} FY${input.fiscalYear} P${input.periodNumber}. ` +
      `Health status: ${healthStatus}.`,
    );
    if (criticalCount > 0) {
      summaryParts.push(`${criticalCount} critical cause${criticalCount > 1 ? "s" : ""} require immediate attention.`);
    }
    const topCause = causes[0];
    summaryParts.push(
      `Primary driver: ${topCause.title} (est. ${topCause.breachContribution}% breach contribution).`,
    );
  }

  return {
    entityCode: input.entityCode,
    fiscalYear: input.fiscalYear,
    periodNumber: input.periodNumber,
    healthStatus,
    causes,
    summary: summaryParts.join(" "),
    totalBreachContribution: Math.min(100, totalBreachContribution),
  };
}

// ---------------------------------------------------------------------------
// Analyzer: Blocked Tasks
// ---------------------------------------------------------------------------

function analyzeBlockers(input: RootCauseInput, causes: RootCause[]): void {
  const forecast = input.completionForecast;
  if (!forecast) return;

  const blocked = forecast.blockedCount ?? 0;
  const failed = forecast.failedCount ?? 0;
  const total = forecast.totalTasks ?? 1;

  if (blocked > 0) {
    const blockedPct = (blocked / total) * 100;
    const severity = blocked >= 3 ? "critical" : blocked >= 2 ? "high" : "medium";
    const breachContribution = Math.min(30, blockedPct * 1.5);

    const chain: RootCauseEvidence[] = [
      {
        level: "symptom",
        label: `Close completion at ${forecast.completionPct}%`,
        value: `${forecast.satisfiedCount ?? 0}/${total} tasks done`,
        source: "completion_forecast",
      },
      {
        level: "factor",
        label: `${blocked} task${blocked > 1 ? "s" : ""} blocked`,
        value: `${blockedPct.toFixed(1)}% of total tasks`,
        source: "completion_forecast",
      },
      {
        level: "root_cause",
        label: "Task dependency chain blocked",
        value: forecast.criticalPathMinutes
          ? `Critical path: ${Math.round(forecast.criticalPathMinutes / 60)}h`
          : undefined,
        source: "task_graph",
      },
    ];

    causes.push({
      id: nextCauseId(),
      category: "BLOCKER",
      severity,
      title: `${blocked} blocked task${blocked > 1 ? "s" : ""} on dependency chain`,
      explanation:
        `${blocked} task${blocked > 1 ? "s are" : " is"} blocked in the close checklist, ` +
        `representing ${blockedPct.toFixed(1)}% of total tasks. ` +
        (forecast.criticalPathMinutes
          ? `The critical path runs ${Math.round(forecast.criticalPathMinutes / 60)}h. `
          : "") +
        `Blocked tasks prevent downstream dependencies from starting.`,
      evidenceChain: chain,
      breachContribution: Math.round(breachContribution),
      remediation: "Investigate blocked task dependencies. Resolve prerequisites or request waivers for non-critical gates.",
      drillTab: "advisor",
      drillSubTab: "forecast",
    });
  }

  if (failed > 0) {
    const severity = failed >= 2 ? "critical" : "high";
    const breachContribution = Math.min(25, failed * 8);

    causes.push({
      id: nextCauseId(),
      category: "BLOCKER",
      severity,
      title: `${failed} failed task${failed > 1 ? "s" : ""} unresolved`,
      explanation:
        `${failed} task${failed > 1 ? "s have" : " has"} failed execution and remain${failed === 1 ? "s" : ""} unresolved. ` +
        `Failed tasks block the close pipeline and degrade prediction confidence.`,
      evidenceChain: [
        { level: "symptom", label: "Task failures detected", value: `${failed} failed`, source: "completion_forecast" },
        { level: "factor", label: "Close pipeline blocked by failures", source: "task_execution" },
        { level: "root_cause", label: "Unresolved task execution failures", source: "task_graph" },
      ],
      breachContribution: Math.round(breachContribution),
      remediation: "Review failed tasks. Retry execution, fix input data, or escalate to task owner.",
      drillTab: "advisor",
      drillSubTab: "forecast",
    });
  }
}

// ---------------------------------------------------------------------------
// Analyzer: Defect Queue
// ---------------------------------------------------------------------------

function analyzeDefectQueue(input: RootCauseInput, causes: RootCause[]): void {
  const queue = input.defectQueue?.filter(
    (d) => d.entityCode === input.entityCode,
  ) ?? [];

  if (queue.length === 0) return;

  const criticalDefects = queue.filter((d) => d.severity === "critical");
  const highDefects = queue.filter((d) => d.severity === "high");
  const overdue = queue.filter((d) => d.hoursPending > 24);
  const avgHours = queue.reduce((s, d) => s + d.hoursPending, 0) / queue.length;

  // Critical defects
  if (criticalDefects.length > 0) {
    const breachContribution = Math.min(20, criticalDefects.length * 5);

    // Group by trigger type for root cause detail
    const byTrigger = new Map<string, number>();
    for (const d of criticalDefects) {
      byTrigger.set(d.triggerType, (byTrigger.get(d.triggerType) ?? 0) + 1);
    }
    const triggerBreakdown = [...byTrigger.entries()]
      .map(([t, c]) => `${t.replace(/_/g, " ")} (${c})`)
      .join(", ");

    causes.push({
      id: nextCauseId(),
      category: "DEFECT",
      severity: "critical",
      title: `${criticalDefects.length} critical defects pending resolution`,
      explanation:
        `${criticalDefects.length} critical defect${criticalDefects.length > 1 ? "s" : ""} in the queue. ` +
        `Trigger breakdown: ${triggerBreakdown}. ` +
        `Top policy: ${criticalDefects[0].policyName} (score: ${criticalDefects[0].queuePriorityScore}).`,
      evidenceChain: [
        { level: "symptom", label: "Risk signals elevated", value: `${queue.length} total defects`, source: "defect_queue" },
        { level: "factor", label: "Critical severity defects pending", value: `${criticalDefects.length} critical`, source: "defect_queue" },
        { level: "root_cause", label: `Policy violations: ${triggerBreakdown}`, source: "close_policy" },
      ],
      breachContribution: Math.round(breachContribution),
      remediation: `Accept or remediate ${criticalDefects.length} critical defects. Consider creating a remediation campaign.`,
      drillTab: "advisor",
      drillSubTab: "defects",
    });
  }

  // Overdue defects (stale queue)
  if (overdue.length >= 2) {
    const maxHours = Math.max(...overdue.map((d) => d.hoursPending));
    const breachContribution = Math.min(15, overdue.length * 3);

    causes.push({
      id: nextCauseId(),
      category: "DEFECT",
      severity: maxHours > 72 ? "high" : "medium",
      title: `${overdue.length} defects overdue (>24h pending)`,
      explanation:
        `${overdue.length} defect${overdue.length > 1 ? "s have" : " has"} been pending for over 24 hours. ` +
        `Longest pending: ${maxHours.toFixed(1)}h. Average across queue: ${avgHours.toFixed(1)}h. ` +
        `Aging defects indicate potential process bottleneck or insufficient review bandwidth.`,
      evidenceChain: [
        { level: "symptom", label: "Defect aging detected", value: `Avg ${avgHours.toFixed(1)}h`, source: "defect_queue" },
        { level: "factor", label: `${overdue.length} items >24h pending`, value: `Max: ${maxHours.toFixed(1)}h`, source: "defect_queue" },
        { level: "root_cause", label: "Insufficient review bandwidth or process gap", source: "operational" },
      ],
      breachContribution: Math.round(breachContribution),
      remediation: "Batch-accept low-risk overdue items or escalate blocked approvals.",
      drillTab: "advisor",
      drillSubTab: "defects",
    });
  }
}

// ---------------------------------------------------------------------------
// Analyzer: Atlas Anomalies
// ---------------------------------------------------------------------------

function analyzeAnomalies(input: RootCauseInput, causes: RootCause[]): void {
  const atlas = input.atlasDashboard;
  if (!atlas) return;

  const topAnomalies = atlas.topAnomalies ?? [];
  const critAnomalies = topAnomalies.filter(
    (a) => a.severity === "CRITICAL" && a.status === "OPEN",
  );
  const warnAnomalies = topAnomalies.filter(
    (a) => a.severity === "WARNING" && a.status === "OPEN",
  );

  if (critAnomalies.length > 0) {
    const topAnomaly = critAnomalies[0];
    const breachContribution = Math.min(15, critAnomalies.length * 5);

    causes.push({
      id: nextCauseId(),
      category: "ANOMALY",
      severity: "critical",
      title: `${critAnomalies.length} critical anomal${critAnomalies.length > 1 ? "ies" : "y"} detected by Atlas AI`,
      explanation:
        `Atlas AI flagged ${critAnomalies.length} critical anomal${critAnomalies.length > 1 ? "ies" : "y"}. ` +
        `Top: "${topAnomaly.title}" (z-score: ${topAnomaly.zScore ?? "N/A"}, ` +
        `type: ${topAnomaly.anomalyType.replace(/_/g, " ")}). ` +
        (topAnomaly.observedValue && topAnomaly.expectedValue
          ? `Observed: ${topAnomaly.observedValue} vs expected: ${topAnomaly.expectedValue}. `
          : "") +
        `Anomalies indicate statistical deviations requiring investigation.`,
      evidenceChain: [
        { level: "symptom", label: "Composite risk elevated", value: `${atlas.compositeRisk?.score ?? "N/A"}/100`, source: "atlas_ai" },
        { level: "factor", label: `${critAnomalies.length} critical anomalies`, value: `z≥3.0`, source: "atlas_anomaly" },
        {
          level: "root_cause",
          label: `${topAnomaly.anomalyType.replace(/_/g, " ")}: ${topAnomaly.title}`,
          value: `z=${topAnomaly.zScore ?? "N/A"}`,
          source: "atlas_detection",
        },
      ],
      breachContribution: Math.round(breachContribution),
      remediation: `Investigate "${topAnomaly.title}". Review underlying transactions and validate against business context.`,
      drillTab: "predictive",
    });
  }

  // Composite risk drivers
  const drivers = atlas.compositeRisk?.drivers;
  if (drivers && Array.isArray(drivers) && drivers.length > 0) {
    const riskLevel = atlas.compositeRisk?.level ?? "NONE";
    if (riskLevel === "HIGH" || riskLevel === "MEDIUM") {
      const breachContribution = riskLevel === "HIGH" ? 10 : 5;

      causes.push({
        id: nextCauseId(),
        category: "ANOMALY",
        severity: riskLevel === "HIGH" ? "high" : "medium",
        title: `Atlas composite risk: ${riskLevel}`,
        explanation:
          `Atlas composite risk score is ${atlas.compositeRisk?.score ?? 0}/` +
          `${atlas.compositeRisk?.maxPossible ?? 100} (${riskLevel}). ` +
          `Key drivers: ${drivers.slice(0, 3).map((d) => d.label).join(", ")}.`,
        evidenceChain: [
          { level: "symptom", label: `Composite risk: ${riskLevel}`, value: `${atlas.compositeRisk?.score}`, source: "atlas_ai" },
          { level: "factor", label: `${drivers.length} risk drivers active`, source: "atlas_risk" },
          { level: "root_cause", label: drivers.slice(0, 3).map((d) => d.label).join("; "), source: "atlas_drivers" },
        ],
        breachContribution,
        remediation: "Review Atlas recommendations and address top-priority drivers.",
        drillTab: "predictive",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Analyzer: Override Risk
// ---------------------------------------------------------------------------

function analyzeOverrideRisk(input: RootCauseInput, causes: RootCause[]): void {
  const es = input.executiveSummary;
  const entity = input.heatmap?.find(
    (e) => e.entityCode === input.entityCode,
  );

  const totalOverrides = entity?.totalOverrides ?? es?.totalOverrides ?? 0;
  const pendingOverrides = entity?.pendingOverrides ?? es?.pendingOverrides ?? 0;

  if (totalOverrides <= 3) return;

  const severity = totalOverrides > 10 ? "high" : "medium";
  const breachContribution = Math.min(10, totalOverrides * 1);

  const chain: RootCauseEvidence[] = [
    { level: "symptom", label: "Elevated override count", value: `${totalOverrides} overrides`, source: "override_posture" },
    { level: "factor", label: `${pendingOverrides} pending approval`, source: "override_posture" },
    { level: "root_cause", label: "Process exceptions requiring manual intervention", source: "governance" },
  ];

  // Add impact info if available
  const impact = entity?.overrideImpactTotal ?? es?.overrideImpactTotal;
  if (impact) {
    chain[0].value = `${totalOverrides} overrides, impact: ${impact}`;
  }

  causes.push({
    id: nextCauseId(),
    category: "OVERRIDE_SPIKE",
    severity,
    title: `Override spike: ${totalOverrides} overrides active`,
    explanation:
      `${totalOverrides} overrides are active for this period, with ${pendingOverrides} pending approval. ` +
      (impact ? `Total monetary impact: ${impact}. ` : "") +
      `High override counts indicate process exceptions or control weaknesses that may warrant governance review.`,
    evidenceChain: chain,
    breachContribution: Math.round(breachContribution),
    remediation: "Review pending overrides. Approve legitimate ones and escalate exceptions to governance.",
    drillTab: "overrides",
  });
}

// ---------------------------------------------------------------------------
// Analyzer: Document Health
// ---------------------------------------------------------------------------

function analyzeDocumentHealth(input: RootCauseInput, causes: RootCause[]): void {
  const entity = input.heatmap?.find(
    (e) => e.entityCode === input.entityCode,
  );
  const es = input.executiveSummary;

  const docRating = entity?.docHealthRating ?? es?.docHealthRating;
  const docScore = entity?.docHealthScore ?? es?.docHealthScore;

  if (!docRating || docRating === "GREEN" || docRating === "NOT_APPLICABLE") return;

  const severity = docRating === "RED" ? "high" : "medium";
  const breachContribution = docRating === "RED" ? 10 : 5;

  causes.push({
    id: nextCauseId(),
    category: "DOCUMENT_HEALTH",
    severity,
    title: `Document health rated ${docRating}`,
    explanation:
      `Document health is rated ${docRating} with a score of ${docScore ?? "N/A"}/100. ` +
      `Poor document health indicates missing documentation, unresolved posting reconciliation findings, ` +
      `or aging documents that need review before certification.`,
    evidenceChain: [
      { level: "symptom", label: `Doc health: ${docRating}`, value: `Score: ${docScore ?? "N/A"}`, source: "doc_health" },
      { level: "factor", label: "Document readiness below threshold", source: "doc_registry" },
      { level: "root_cause", label: "Missing or defective close documentation", source: "doc_registry" },
    ],
    breachContribution,
    remediation: "Review document registry for missing items. Address posting reconciliation findings.",
    drillTab: "documents",
  });
}

// ---------------------------------------------------------------------------
// Analyzer: SLA Pressure
// ---------------------------------------------------------------------------

function analyzeSlaPressure(input: RootCauseInput, causes: RootCause[]): void {
  const entity = input.heatmap?.find(
    (e) => e.entityCode === input.entityCode,
  );
  const es = input.executiveSummary;
  const forecast = input.completionForecast;

  const slaStatus = entity?.slaStatus ?? es?.slaStatus;
  const breachPct = entity?.breachProbability ?? forecast?.hardBreachPct ?? 0;
  const bufferHours = entity?.hardCloseBufferHours ?? forecast?.hardBufferHours;

  if (breachPct < 30 && slaStatus !== "BREACHED" && slaStatus !== "AT_RISK") return;

  const severity =
    slaStatus === "BREACHED" ? "critical" :
    breachPct >= 70 ? "critical" :
    breachPct >= 50 ? "high" : "medium";

  const breachContribution = Math.min(25, Math.round(breachPct * 0.3));

  const chain: RootCauseEvidence[] = [
    {
      level: "symptom",
      label: slaStatus === "BREACHED" ? "SLA breached" : `SLA at risk (${breachPct}% breach probability)`,
      value: bufferHours != null ? `${bufferHours.toFixed(1)}h buffer` : undefined,
      source: "sla_forecast",
    },
  ];

  if (forecast?.slippageCount && forecast.slippageCount > 0) {
    chain.push({
      level: "factor",
      label: `Prediction slipped ${forecast.slippageCount} time${forecast.slippageCount > 1 ? "s" : ""}`,
      value: forecast.predictionTrend,
      source: "prediction_trend",
    });
  }

  if (bufferHours != null && bufferHours < 0) {
    chain.push({
      level: "root_cause",
      label: `Predicted completion ${Math.abs(bufferHours).toFixed(1)}h after deadline`,
      source: "completion_forecast",
    });
  } else if (bufferHours != null && bufferHours < 12) {
    chain.push({
      level: "root_cause",
      label: `Only ${bufferHours.toFixed(1)}h buffer — insufficient margin for risks`,
      source: "completion_forecast",
    });
  } else {
    chain.push({
      level: "root_cause",
      label: "Accumulated delays and blockers eroding SLA margin",
      source: "close_orchestration",
    });
  }

  causes.push({
    id: nextCauseId(),
    category: "SLA_PRESSURE",
    severity,
    title: slaStatus === "BREACHED"
      ? "SLA already breached"
      : `SLA at risk — ${breachPct}% breach probability`,
    explanation:
      (slaStatus === "BREACHED"
        ? `The hard close SLA has been breached. `
        : `Breach probability stands at ${breachPct}%. `) +
      (bufferHours != null
        ? bufferHours < 0
          ? `Predicted completion is ${Math.abs(bufferHours).toFixed(1)}h past the deadline. `
          : `Only ${bufferHours.toFixed(1)}h of buffer remain. `
        : "") +
      (forecast?.slippageCount && forecast.slippageCount > 1
        ? `The prediction has slipped ${forecast.slippageCount} times, indicating persistent deterioration.`
        : ""),
    evidenceChain: chain,
    breachContribution,
    remediation: slaStatus === "BREACHED"
      ? "Escalate to leadership. Request deadline extension or fast-track remaining tasks."
      : "Expedite critical path tasks. Consider the simulation engine for recovery scenario modeling.",
    drillTab: "predictive",
  });
}

// ---------------------------------------------------------------------------
// Analyzer: Trend Degradation
// ---------------------------------------------------------------------------

function analyzeTrendDegradation(input: RootCauseInput, causes: RootCause[]): void {
  const forecast = input.completionForecast;
  if (!forecast) return;

  // Prediction trend slipping
  if (forecast.predictionTrend === "SLIPPING" && forecast.slippageCount >= 2) {
    const breachContribution = Math.min(10, forecast.slippageCount * 3);

    causes.push({
      id: nextCauseId(),
      category: "TREND_DEGRADATION",
      severity: forecast.slippageCount >= 3 ? "high" : "medium",
      title: `Prediction trend slipping (${forecast.slippageCount} slippages)`,
      explanation:
        `Close prediction has slipped ${forecast.slippageCount} times across consecutive snapshots. ` +
        (forecast.trendShiftHours != null
          ? `Latest shift: ${forecast.trendShiftHours > 0 ? "+" : ""}${forecast.trendShiftHours.toFixed(1)}h. `
          : "") +
        `Persistent slippage indicates systemic issues not captured by individual task status.`,
      evidenceChain: [
        { level: "symptom", label: "Prediction trend: SLIPPING", value: `${forecast.slippageCount} slippages`, source: "prediction_trend" },
        { level: "factor", label: "Consecutive prediction delays", source: "close_orchestration_snapshot" },
        { level: "root_cause", label: "Systemic execution delays or underestimated task complexity", source: "operational" },
      ],
      breachContribution: Math.round(breachContribution),
      remediation: "Perform root cause review of slippage pattern. Check if specific task categories repeatedly delay.",
      drillTab: "advisor",
      drillSubTab: "forecast",
    });
  }

  // Confidence degrading
  if (forecast.confidenceTrend === "DEGRADING") {
    causes.push({
      id: nextCauseId(),
      category: "TREND_DEGRADATION",
      severity: "medium",
      title: "Prediction confidence degrading",
      explanation:
        `Forecast confidence is degrading across snapshots (current: ${forecast.hardConfidence ?? "unknown"}). ` +
        `Degrading confidence means the system's ability to predict close timing is worsening, ` +
        `typically due to volatile task status changes or new blockers appearing.`,
      evidenceChain: [
        { level: "symptom", label: "Confidence trend: DEGRADING", value: forecast.hardConfidence ?? "unknown", source: "prediction_confidence" },
        { level: "factor", label: "Volatile task status changes", source: "close_orchestration_snapshot" },
        { level: "root_cause", label: "Unstable execution environment or emerging risks", source: "operational" },
      ],
      breachContribution: 5,
      remediation: "Stabilize execution environment. Resolve outstanding blockers to restore prediction confidence.",
      drillTab: "advisor",
      drillSubTab: "forecast",
    });
  }
}
