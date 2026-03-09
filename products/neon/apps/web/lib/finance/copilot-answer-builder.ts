// lib/finance/copilot-answer-builder.ts
//
// Phase 11B: Deterministic answer builder for the Close Copilot.
// Pure functions that compose existing data into structured answers.
// No LLM — template-based, explainable, auditable.

import { buildNarrativeBrief, buildNarrativePack } from "./copilot-narrative-builder";
import { suggestCampaigns } from "./copilot-campaign-suggester";
import { runAllSimulations, PRESET_SCENARIOS } from "./copilot-simulation-engine";
import { analyzeRootCauses } from "./copilot-root-cause-engine";
import { evaluateOrchestrationPlan } from "./copilot-orchestration-engine";

import type {
  CopilotAnswerSection,
  CopilotAction,
  CopilotEvidence,
  CopilotDrillAction,
  CopilotDrillTarget,
  CopilotRoleDTO,
  NarrativeAudience,
  NarrativeBrief,
  CampaignSuggestion,
  SimulationResult,
  RootCause,
  RootCauseAnalysis,
  OrchestrationPlan,
  OrchestrationAction,
  AdvisorEntityHeatmapDTO,
  AdvisorControllerAlertDTO,
  AdvisorDefectQueueItemDTO,
  AdvisorCompletionForecastDTO,
  SlaBreachForecastDTO,
} from "./types";

import type {
  CloseExecutiveSummaryDTO,
} from "./types";

import type {
  PackDeltaDTO,
  ExecutiveBriefDTO,
  AttentionItemDTO,
} from "./use-pack-readiness";

import type {
  AtlasRecommendation,
  AtlasDashboardData,
} from "./use-atlas-dashboard";

// ---------------------------------------------------------------------------
// Drill-through target mapping
// ---------------------------------------------------------------------------

/** Maps evidence sources to CloseControlTower tab/sub-tab IDs */
function drillFor(
  source: string,
  opts?: { entityCode?: string; focusId?: string; action?: CopilotDrillAction; subTab?: string },
): CopilotDrillTarget | undefined {
  const base: Partial<CopilotDrillTarget> = {};
  if (opts?.entityCode) base.entityCode = opts.entityCode;
  if (opts?.focusId) {
    base.focusId = opts.focusId;
    // Auto-attach highlight_item when focusId is provided and no explicit action
    if (!opts.action) base.action = { type: "highlight_item" };
  }
  if (opts?.action) base.action = opts.action;
  if (opts?.subTab) base.subTab = opts.subTab;

  switch (source) {
    case "defect_queue":
      return { tab: "advisor", subTab: "defects", ...base };
    case "risk_signal":
      return { tab: "advisor", subTab: "alerts", ...base };
    case "override":
    case "override_change":
      return { tab: "overrides", ...base };
    case "exception":
      return { tab: "certification", subTab: "exceptions", ...base };
    case "breach_forecast":
      return { tab: "predictive", subTab: "breach", ...base };
    case "doc_health":
      return { tab: "documents", ...base };
    case "remediation":
      return { tab: "remediation", ...base };
    case "atlas_recommendation":
      return { tab: "predictive", subTab: "actions", ...base };
    case "bottleneck":
      return { tab: "predictive", subTab: "risk-map", ...base };
    case "sla_status":
      return { tab: "sla", ...base };
    case "completion_forecast":
      return { tab: "advisor", subTab: "forecast", ...base };
    case "gl_change":
    case "materiality":
      return { tab: "certification", subTab: "evidence", ...base };
    case "certification":
      return { tab: "certification", subTab: "status", ...base };
    case "task_status":
    case "task_change":
    case "slippage":
      return { tab: "overview", ...base };
    case "executive_summary":
    case "executive_brief":
    case "attention_item":
      return { tab: "executive", ...base };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Context type — aggregated from existing hooks
// ---------------------------------------------------------------------------

export interface CopilotContext {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  role: CopilotRoleDTO;
  // Data from existing hooks (all optional — builder handles missing data)
  executiveSummary?: CloseExecutiveSummaryDTO | null;
  heatmap?: AdvisorEntityHeatmapDTO[] | null;
  alerts?: AdvisorControllerAlertDTO[] | null;
  defectQueue?: AdvisorDefectQueueItemDTO[] | null;
  completionForecast?: AdvisorCompletionForecastDTO | null;
  breachForecasts?: SlaBreachForecastDTO[] | null;
  atlasDashboard?: AtlasDashboardData | null;
  packDelta?: PackDeltaDTO | null;
  executiveBrief?: ExecutiveBriefDTO | null;
}

export interface CopilotAnswer {
  text: string;
  sections: CopilotAnswerSection[];
  actions: CopilotAction[];
}

// ---------------------------------------------------------------------------
// WHY_RED — "Why are we red?"
// ---------------------------------------------------------------------------

export function buildWhyRedAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  // Find the entity in heatmap
  const entity = ctx.heatmap?.find(
    (e) =>
      e.entityCode === ctx.entityCode &&
      e.fiscalYear === ctx.fiscalYear &&
      e.periodNumber === ctx.periodNumber,
  );

  const es = ctx.executiveSummary;

  if (!entity && !es) {
    return {
      text: `No close data available for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}.`,
      sections: [],
      actions: [],
    };
  }

  const riskColor = entity?.riskColor ?? "GREEN";
  const riskScore = entity?.compositeRiskScore ?? 0;
  const slaStatus = entity?.slaStatus ?? es?.slaStatus ?? "ON_TRACK";

  // Summary text
  let summary: string;
  if (riskColor === "RED") {
    summary = `${ctx.entityCode} is rated RED with a composite risk score of ${riskScore}/100. `;
  } else if (riskColor === "AMBER") {
    summary = `${ctx.entityCode} is rated AMBER with a composite risk score of ${riskScore}/100. `;
  } else {
    summary = `${ctx.entityCode} is rated GREEN with a composite risk score of ${riskScore}/100. No critical issues detected. `;
  }

  // Contributing factors
  const factors: CopilotEvidence[] = [];

  // SLA proximity
  if (slaStatus === "BREACHED" || slaStatus === "AT_RISK") {
    factors.push({
      source: "sla_status",
      label: `SLA status: ${slaStatus}`,
      severity: slaStatus === "BREACHED" ? "critical" : "high",
      value: entity?.daysRemaining != null ? `${entity.daysRemaining} days remaining` : undefined,
      drillTarget: drillFor("sla_status"),
    });
  }

  // Overrides
  const totalOverrides = entity?.totalOverrides ?? es?.totalOverrides ?? 0;
  if (totalOverrides > 0) {
    factors.push({
      source: "override",
      label: `${totalOverrides} overrides active`,
      severity: totalOverrides > 5 ? "high" : "medium",
      value: entity?.overrideImpactTotal ?? String(es?.overrideImpactTotal ?? 0),
      drillTarget: drillFor("override"),
    });
  }

  // Critical exceptions
  const critExceptions = entity?.criticalExceptions ?? es?.criticalExceptions ?? 0;
  if (critExceptions > 0) {
    factors.push({
      source: "exception",
      label: `${critExceptions} critical exceptions open`,
      severity: "critical",
      drillTarget: drillFor("exception"),
    });
  }

  // Document health
  const docRating = entity?.docHealthRating ?? es?.docHealthRating;
  if (docRating === "RED" || docRating === "AMBER") {
    factors.push({
      source: "doc_health",
      label: `Document health: ${docRating}`,
      severity: docRating === "RED" ? "high" : "medium",
      value: `Score: ${entity?.docHealthScore ?? es?.docHealthScore ?? "N/A"}`,
      drillTarget: drillFor("doc_health"),
    });
  }

  // Risk signals
  const critSignals = entity?.criticalSignalCount ?? 0;
  const activeSignals = entity?.activeSignalCount ?? 0;
  if (critSignals > 0 || activeSignals > 0) {
    factors.push({
      source: "risk_signal",
      label: `${critSignals} critical, ${activeSignals} active risk signals`,
      severity: critSignals > 0 ? "critical" : "high",
      drillTarget: drillFor("risk_signal"),
    });
  }

  // Breach probability
  const breachPct = entity?.breachProbability ?? 0;
  if (breachPct >= 50) {
    factors.push({
      source: "breach_forecast",
      label: `Hard close breach probability: ${breachPct}%`,
      severity: breachPct >= 70 ? "critical" : "high",
      value: entity?.hardCloseBufferHours != null
        ? `${entity.hardCloseBufferHours.toFixed(1)}h buffer`
        : undefined,
      drillTarget: drillFor("breach_forecast"),
    });
  }

  // Remediation backlog
  const remPending = entity?.remediationPending ?? es?.remediationPending ?? 0;
  if (remPending > 0) {
    factors.push({
      source: "remediation",
      label: `${remPending} remediation actions pending`,
      severity: remPending > 3 ? "high" : "medium",
      drillTarget: drillFor("remediation"),
    });
  }

  if (factors.length > 0) {
    const factorSeverities = factors.filter((f) => f.severity === "critical" || f.severity === "high");
    summary += `There are ${factorSeverities.length} high/critical contributing factors.`;

    sections.push({
      heading: "Contributing Factors",
      content: factors.map((f) => `• ${f.label}${f.value ? ` (${f.value})` : ""}`).join("\n"),
      evidence: factors,
      severity: factorSeverities.length > 0 ? "critical" : "medium",
      drillTarget: drillFor("risk_signal"),
    });
  }

  // Alerts section
  const critAlerts = ctx.alerts?.filter(
    (a) => a.entityCode === ctx.entityCode && a.alertSeverity === "critical",
  ) ?? [];
  if (critAlerts.length > 0) {
    sections.push({
      heading: "Critical Alerts",
      content: critAlerts.map((a) => `• [${a.alertType}] ${a.alertTitle}`).join("\n"),
      evidence: critAlerts.map((a) => ({
        source: a.alertType.toLowerCase(),
        label: a.alertTitle,
        severity: a.alertSeverity,
        referenceId: a.alertId,
        drillTarget: drillFor("risk_signal", { focusId: a.alertId }),
      })),
      severity: "critical",
      drillTarget: drillFor("risk_signal"),
    });
  }

  // Bottleneck
  if (entity?.topBottleneckTask) {
    sections.push({
      heading: "Top Bottleneck",
      content: `Task "${entity.topBottleneckTask}" is the primary bottleneck (pattern: ${entity.bottleneckPattern ?? "unknown"}).`,
      evidence: [{
        source: "bottleneck",
        label: entity.topBottleneckTask,
        value: entity.bottleneckPattern ?? undefined,
        drillTarget: drillFor("bottleneck"),
      }],
      severity: "medium",
      drillTarget: drillFor("bottleneck"),
    });
  }

  // Build recommended actions from alerts and defect queue
  const entityDefects = ctx.defectQueue?.filter(
    (d) => d.entityCode === ctx.entityCode,
  ) ?? [];

  entityDefects.slice(0, 3).forEach((d, i) => {
    actions.push({
      priority: i + 1,
      title: d.policyName,
      rationale: `${d.triggerType.replace(/_/g, " ")} — severity: ${d.severity}, pending ${d.hoursPending.toFixed(1)}h`,
      actionType: d.actionType,
      ownerRole: ctx.role,
      drillTarget: drillFor("defect_queue", {
        focusId: d.actionId,
        action: { type: "accept_defect", actionId: d.actionId },
      }),
    });
  });

  // Atlas recommendations
  const atlasRecs = ctx.atlasDashboard?.recommendations?.items ?? [];
  const roleRecs = atlasRecs.filter(
    (r) => r.suggestedOwnerRole === ctx.role || r.priority === "CRITICAL",
  );
  roleRecs.slice(0, 2).forEach((r) => {
    actions.push({
      priority: actions.length + 1,
      title: r.title,
      rationale: r.rationale,
      ownerRole: r.suggestedOwnerRole as CopilotRoleDTO,
      estimatedImpact: r.estimatedImpact ?? undefined,
      drillTarget: drillFor("atlas_recommendation"),
    });
  });

  // Suggest campaign creation when multiple defects exist
  if (entityDefects.length >= 2) {
    const defectIds = entityDefects.slice(0, 10).map((d) => d.actionId);
    actions.push({
      priority: actions.length + 1,
      title: `Create remediation campaign (${defectIds.length} actions)`,
      rationale: `Bundle ${defectIds.length} pending defect queue items into a coordinated remediation campaign.`,
      ownerRole: "CLOSE_MANAGER",
      drillTarget: drillFor("remediation", {
        action: {
          type: "prefill_campaign",
          actionIds: defectIds,
          campaignName: `Copilot Campaign — P${ctx.periodNumber} FY${ctx.fiscalYear}`,
        },
      }),
    });
  }

  return { text: summary, sections, actions };
}

// ---------------------------------------------------------------------------
// TODAY_ACTIONS — "What should I do today?"
// ---------------------------------------------------------------------------

export function buildTodayActionsAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];
  let priority = 0;

  // 1. Critical alerts requiring immediate attention
  const critAlerts = ctx.alerts?.filter(
    (a) =>
      a.entityCode === ctx.entityCode &&
      (a.alertSeverity === "critical" || a.alertSeverity === "high"),
  ) ?? [];

  if (critAlerts.length > 0) {
    sections.push({
      heading: "Urgent Alerts",
      content: `${critAlerts.length} critical/high alerts need attention.`,
      evidence: critAlerts.slice(0, 5).map((a) => ({
        source: a.alertType.toLowerCase(),
        label: a.alertTitle,
        severity: a.alertSeverity,
        referenceId: a.alertId,
        drillTarget: drillFor("risk_signal", { focusId: a.alertId }),
      })),
      severity: "critical",
      drillTarget: drillFor("risk_signal"),
    });

    critAlerts.slice(0, 2).forEach((a) => {
      actions.push({
        priority: ++priority,
        title: `Address: ${a.alertTitle}`,
        rationale: a.alertDetail ?? `${a.alertType} alert requires ${a.alertSeverity === "critical" ? "immediate" : "prompt"} action`,
        ownerRole: ctx.role,
        drillTarget: drillFor("risk_signal", { focusId: a.alertId }),
      });
    });
  }

  // 2. Top defect queue items (role-aware)
  const myDefects = ctx.defectQueue?.filter(
    (d) => d.entityCode === ctx.entityCode,
  ) ?? [];

  if (myDefects.length > 0) {
    sections.push({
      heading: "Pending Recommendations",
      content: `${myDefects.length} pending actions in the defect queue. Top priority score: ${myDefects[0]?.queuePriorityScore ?? 0}.`,
      evidence: myDefects.slice(0, 5).map((d) => ({
        source: "defect_queue",
        label: d.policyName,
        severity: d.severity,
        value: `Score: ${d.queuePriorityScore}`,
        referenceId: d.actionId,
        drillTarget: drillFor("defect_queue", { focusId: d.actionId }),
      })),
      severity: myDefects.some((d) => d.severity === "critical") ? "critical" : "medium",
      drillTarget: drillFor("defect_queue", {
        action: { type: "filter_view", severity: myDefects.some((d) => d.severity === "critical") ? "critical" : undefined },
      }),
    });

    myDefects.slice(0, 3).forEach((d) => {
      actions.push({
        priority: ++priority,
        title: `Review: ${d.policyName}`,
        rationale: `${d.triggerType.replace(/_/g, " ")} — ${d.severity} severity, pending ${d.hoursPending.toFixed(1)}h`,
        actionType: d.actionType,
        ownerRole: ctx.role,
        drillTarget: drillFor("defect_queue", {
          focusId: d.actionId,
          action: { type: "accept_defect", actionId: d.actionId },
        }),
      });
    });
  }

  // 3. Atlas recommendations for this role
  const atlasRecs = ctx.atlasDashboard?.recommendations?.items ?? [];
  const roleFiltered = atlasRecs.filter(
    (r) => r.suggestedOwnerRole === ctx.role || r.priority === "CRITICAL",
  );

  if (roleFiltered.length > 0) {
    sections.push({
      heading: "Atlas AI Recommendations",
      content: `${roleFiltered.length} recommendations for your role.`,
      evidence: roleFiltered.map((r) => ({
        source: "atlas_recommendation",
        label: r.title,
        severity: r.priority.toLowerCase(),
        drillTarget: drillFor("atlas_recommendation"),
      })),
      severity: roleFiltered.some((r) => r.priority === "CRITICAL") ? "critical" : "medium",
      drillTarget: drillFor("atlas_recommendation"),
    });

    roleFiltered.slice(0, 2).forEach((r) => {
      actions.push({
        priority: ++priority,
        title: r.title,
        rationale: r.rationale,
        ownerRole: r.suggestedOwnerRole as CopilotRoleDTO,
        estimatedImpact: r.estimatedImpact ?? undefined,
        drillTarget: drillFor("atlas_recommendation"),
      });
    });
  }

  // 4. Executive brief attention items
  const attentionItems = ctx.executiveBrief?.attentionItems ?? [];
  const roleAttention = ctx.role === "CFO"
    ? attentionItems
    : attentionItems.filter((a) => a.severity === "critical" || a.severity === "high");

  if (roleAttention.length > 0) {
    sections.push({
      heading: "Attention Required",
      content: roleAttention.map((a) => `• [${a.severity}] ${a.title}: ${a.detail}`).join("\n"),
      evidence: roleAttention.map((a) => ({
        source: "executive_brief",
        label: a.title,
        severity: a.severity,
        drillTarget: drillFor("executive_brief"),
      })),
      severity: roleAttention.some((a) => a.severity === "critical") ? "critical" : "medium",
      drillTarget: drillFor("executive_brief"),
    });
  }

  // 5. Forecast check
  const fc = ctx.completionForecast;
  if (fc && (fc.forecastAssessment === "WILL_BREACH" || fc.forecastAssessment === "CRITICAL")) {
    sections.push({
      heading: "Close Timeline at Risk",
      content: `Forecast assessment: ${fc.forecastAssessment.replace(/_/g, " ")}. Hard close buffer: ${fc.hardBufferHours != null ? fc.hardBufferHours.toFixed(1) + "h" : "unknown"}.`,
      evidence: [{
        source: "completion_forecast",
        label: `Breach probability: ${fc.hardBreachPct}%`,
        severity: fc.hardBreachPct >= 70 ? "critical" : "high",
        value: `${fc.completionPct}% complete`,
        drillTarget: drillFor("completion_forecast"),
      }],
      severity: "critical",
      drillTarget: drillFor("completion_forecast"),
    });

    actions.push({
      priority: ++priority,
      title: "Expedite critical path tasks",
      rationale: `${fc.blockedCount ?? 0} blocked, ${fc.failedCount ?? 0} failed tasks. Prediction trend: ${fc.predictionTrend}.`,
      ownerRole: "CLOSE_MANAGER",
      drillTarget: drillFor("completion_forecast"),
    });
  }

  const totalActions = actions.length;
  const text = totalActions === 0
    ? `No urgent actions for ${ctx.role} on ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}. All clear.`
    : `${totalActions} actions recommended for ${ctx.role} today on ${ctx.entityCode}. ${critAlerts.length > 0 ? `${critAlerts.length} critical alerts need immediate attention.` : ""}`;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// BREACH_RISK — "Which entity is most likely to miss hard close?"
// ---------------------------------------------------------------------------

export function buildBreachRiskAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const forecasts = ctx.breachForecasts ?? [];
  const sorted = [...forecasts].sort((a, b) => b.hardCloseBreachPct - a.hardCloseBreachPct);

  if (sorted.length === 0) {
    return {
      text: "No active close runs found to assess breach risk.",
      sections: [],
      actions: [],
    };
  }

  const top = sorted[0];
  const critical = sorted.filter((f) => f.riskTier === "CRITICAL");
  const high = sorted.filter((f) => f.riskTier === "HIGH");

  let text = "";
  if (critical.length > 0) {
    text = `${critical.length} entit${critical.length === 1 ? "y is" : "ies are"} at CRITICAL risk of missing hard close. `;
    text += `Highest risk: ${top.entityCode} at ${top.hardCloseBreachPct}% breach probability.`;
  } else if (high.length > 0) {
    text = `No critical-risk entities, but ${high.length} at HIGH risk. Closest to breach: ${top.entityCode} at ${top.hardCloseBreachPct}%.`;
  } else {
    text = `All entities are tracking within acceptable SLA margins. Highest breach probability: ${top.entityCode} at ${top.hardCloseBreachPct}%.`;
  }

  // Ranked entity table
  sections.push({
    heading: "Entity Breach Ranking",
    content: sorted
      .slice(0, 10)
      .map(
        (f, i) =>
          `${i + 1}. ${f.entityCode} — ${f.hardCloseBreachPct}% breach probability (${f.riskTier}), ` +
          `${f.completionPct}% complete, ` +
          `buffer: ${f.hardCloseBufferHours != null ? f.hardCloseBufferHours.toFixed(1) + "h" : "unknown"}`,
      )
      .join("\n"),
    evidence: sorted.slice(0, 10).map((f) => ({
      source: "breach_forecast",
      label: `${f.entityCode}: ${f.hardCloseBreachPct}% breach risk`,
      severity: f.riskTier === "CRITICAL" ? "critical" : f.riskTier === "HIGH" ? "high" : "medium",
      value: `${f.completionPct}% complete`,
      drillTarget: drillFor("breach_forecast", { entityCode: f.entityCode }),
    })),
    severity: critical.length > 0 ? "critical" : high.length > 0 ? "high" : "info",
    drillTarget: drillFor("breach_forecast"),
  });

  // Detail on top risk entity
  if (top.hardCloseBreachPct >= 50) {
    const evidence: CopilotEvidence[] = [];
    if (top.blockedCount && top.blockedCount > 0) {
      evidence.push({ source: "task_status", label: `${top.blockedCount} blocked tasks`, severity: "high", drillTarget: drillFor("task_status", { entityCode: top.entityCode }) });
    }
    if (top.failedCount && top.failedCount > 0) {
      evidence.push({ source: "task_status", label: `${top.failedCount} failed tasks`, severity: "critical", drillTarget: drillFor("task_status", { entityCode: top.entityCode }) });
    }
    if (top.slippageCount > 0) {
      evidence.push({ source: "slippage", label: `${top.slippageCount} prediction slippages`, severity: "high", drillTarget: drillFor("slippage", { entityCode: top.entityCode }) });
    }

    sections.push({
      heading: `${top.entityCode} Risk Detail`,
      content: `${top.entityCode} FY${top.fiscalYear} P${top.periodNumber}: ${top.completionPct}% complete, ${top.totalTasks ?? 0} total tasks. ` +
        `Confidence: ${top.hardConfidence ?? "unknown"}. Slippage count: ${top.slippageCount}.`,
      evidence,
      severity: "critical",
      drillTarget: drillFor("breach_forecast", { entityCode: top.entityCode }),
    });

    actions.push({
      priority: 1,
      title: `Focus on ${top.entityCode} close execution`,
      rationale: `At ${top.hardCloseBreachPct}% breach probability with only ${top.hardCloseBufferHours?.toFixed(1) ?? "unknown"} hours of buffer remaining.`,
      ownerRole: "CLOSE_MANAGER",
      drillTarget: drillFor("breach_forecast", { entityCode: top.entityCode }),
    });
  }

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// WHAT_CHANGED — "What changed since yesterday?"
// ---------------------------------------------------------------------------

export function buildWhatChangedAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const delta = ctx.packDelta;

  if (!delta) {
    return {
      text: `No delta data available for ${ctx.entityCode}. This may be the first pack generation for this period.`,
      sections: [],
      actions: [],
    };
  }

  if (!delta.hasChanges) {
    return {
      text: `No material changes detected for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber} since the last pack snapshot.`,
      sections: [],
      actions: [],
    };
  }

  let text = delta.summary || "Changes detected since last snapshot:";

  // GL changes
  if (delta.glChanges && delta.glChanges.changed_accounts > 0) {
    const gl = delta.glChanges;
    sections.push({
      heading: "GL Balance Changes",
      content: `${gl.changed_accounts} accounts changed. P&L: ${gl.pnl_changes}, Balance Sheet: ${gl.bs_changes}. ` +
        `Largest single balance: ${gl.max_single_balance.toLocaleString()}.`,
      evidence: [
        { source: "gl_change", label: `${gl.changed_accounts} accounts changed`, severity: gl.changed_accounts > 10 ? "high" : "medium", drillTarget: drillFor("gl_change") },
        ...(gl.topChanges?.slice(0, 3).map((c) => ({
          source: "gl_change",
          label: `${c.account_code} (${c.account_name})`,
          value: c.balance.toLocaleString(),
          severity: "medium" as const,
          drillTarget: drillFor("gl_change"),
        })) ?? []),
      ],
      severity: gl.changed_accounts > 10 ? "high" : "medium",
      drillTarget: drillFor("gl_change"),
    });
  }

  // Materiality assessment
  if (delta.materiality && delta.materiality.hasMaterialChanges) {
    const mat = delta.materiality;
    sections.push({
      heading: "Materiality Assessment",
      content: mat.insights.join(" "),
      evidence: [
        { source: "materiality", label: `Risk level: ${mat.riskLevel}`, severity: mat.riskLevel === "high" ? "high" : "medium", drillTarget: drillFor("materiality") },
        ...(mat.largestChange
          ? [{ source: "materiality", label: `Largest: ${mat.largestChange.accountCode}`, value: mat.largestChange.balance.toLocaleString(), severity: "high" as const, drillTarget: drillFor("materiality") }]
          : []),
      ],
      severity: mat.riskLevel === "high" ? "high" : "medium",
      drillTarget: drillFor("materiality"),
    });

    if (mat.riskLevel === "high") {
      actions.push({
        priority: 1,
        title: "Review material GL changes",
        rationale: `${mat.materialPnLChanges} material P&L changes and ${mat.materialBSChanges} material BS changes detected.`,
        ownerRole: ctx.role,
        drillTarget: drillFor("gl_change"),
      });
    }
  }

  // Override changes
  if (delta.overrideChanges && delta.overrideChanges.new_overrides > 0) {
    sections.push({
      heading: "New Overrides",
      content: `${delta.overrideChanges.new_overrides} new overrides since last snapshot (impact: ${delta.overrideChanges.new_override_impact.toLocaleString()}).`,
      evidence: [{
        source: "override_change",
        label: `${delta.overrideChanges.new_overrides} new overrides`,
        severity: delta.overrideChanges.new_overrides > 2 ? "high" : "medium",
        value: delta.overrideChanges.new_override_impact.toLocaleString(),
        drillTarget: drillFor("override_change"),
      }],
      severity: delta.overrideChanges.new_overrides > 2 ? "high" : "medium",
      drillTarget: drillFor("override_change"),
    });
  }

  // Task changes
  if (delta.taskChanges) {
    const tc = delta.taskChanges;
    const parts: string[] = [];
    if (tc.newly_completed > 0) parts.push(`${tc.newly_completed} newly completed`);
    if (tc.newly_waived > 0) parts.push(`${tc.newly_waived} newly waived`);
    if (tc.newly_failed > 0) parts.push(`${tc.newly_failed} newly failed`);

    if (parts.length > 0) {
      sections.push({
        heading: "Task Progress",
        content: `${tc.tasks_completed_since} tasks completed since last snapshot. ${parts.join(", ")}.`,
        evidence: [
          { source: "task_change", label: parts.join(", "), severity: tc.newly_failed > 0 ? "high" : "info", drillTarget: drillFor("task_change") },
        ],
        severity: tc.newly_failed > 0 ? "high" : "info",
        drillTarget: drillFor("task_change"),
      });

      if (tc.newly_failed > 0) {
        actions.push({
          priority: actions.length + 1,
          title: `Investigate ${tc.newly_failed} newly failed tasks`,
          rationale: "Failed tasks may block close progression and trigger SLA risk.",
          ownerRole: "CLOSE_MANAGER",
          drillTarget: drillFor("task_change"),
        });
      }
    }
  }

  // Certification events
  if (delta.certificationEvents && delta.certificationEvents.length > 0) {
    sections.push({
      heading: "Certification Activity",
      content: delta.certificationEvents
        .map((ce) => `• ${ce.activity_type}: ${ce.event_count} events`)
        .join("\n"),
      evidence: delta.certificationEvents.map((ce) => ({
        source: "certification",
        label: ce.activity_type,
        value: String(ce.event_count),
        drillTarget: drillFor("certification"),
      })),
      severity: "info",
      drillTarget: drillFor("certification", { action: { type: "trigger_export" } }),
    });
  }

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// EXECUTIVE_SUMMARY — Quick status brief
// ---------------------------------------------------------------------------

export function buildExecutiveSummaryAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const brief = ctx.executiveBrief;
  const es = ctx.executiveSummary;

  if (!brief && !es) {
    return {
      text: `No executive data available for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}.`,
      sections: [],
      actions: [],
    };
  }

  // Use executive brief paragraphs if available
  const text = brief
    ? brief.paragraphs.join(" ")
    : `${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}: ${es?.runStatus ?? "Unknown"} status, ` +
      `${es?.completionPct ?? 0}% complete, SLA: ${es?.slaStatus ?? "Unknown"}.`;

  // KPI section from executive summary
  if (es) {
    sections.push({
      heading: "Key Metrics",
      content: [
        `Status: ${es.runStatus}`,
        `Completion: ${es.completionPct ?? 0}%`,
        `SLA: ${es.slaStatus}`,
        `Readiness: ${es.readinessScore ?? "N/A"}`,
        `Overrides: ${es.totalOverrides} (impact: ${es.overrideImpactTotal})`,
        `Exceptions: ${es.openExceptions} open (${es.criticalExceptions} critical)`,
        `Doc Health: ${es.docHealthRating ?? "N/A"} (${es.docHealthScore ?? "N/A"})`,
        `Remediation: ${es.remediationPending} pending`,
      ].join("\n"),
      evidence: [
        { source: "executive_summary", label: `Run: ${es.runStatus}`, value: `${es.completionPct}%`, drillTarget: drillFor("executive_summary") },
        { source: "executive_summary", label: `SLA: ${es.slaStatus}`, severity: es.slaStatus === "BREACHED" ? "critical" : es.slaStatus === "AT_RISK" ? "high" : "info", drillTarget: drillFor("sla_status") },
      ],
      drillTarget: drillFor("executive_summary"),
    });
  }

  // Attention items
  if (brief?.attentionItems && brief.attentionItems.length > 0) {
    sections.push({
      heading: "Items Requiring Attention",
      content: brief.attentionItems
        .map((a) => `• [${a.severity.toUpperCase()}] ${a.title}: ${a.detail}`)
        .join("\n"),
      evidence: brief.attentionItems.map((a) => ({
        source: "attention_item",
        label: a.title,
        severity: a.severity,
        drillTarget: drillFor("attention_item"),
      })),
      severity: brief.attentionItems.some((a) => a.severity === "critical") ? "critical" : "medium",
      drillTarget: drillFor("attention_item"),
    });

    brief.attentionItems
      .filter((a) => a.severity === "critical" || a.severity === "high")
      .slice(0, 3)
      .forEach((a, i) => {
        actions.push({
          priority: i + 1,
          title: a.title,
          rationale: a.detail,
          ownerRole: ctx.role,
          drillTarget: drillFor("attention_item"),
        });
      });
  }

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// REMEDIATE_GAPS — "Create campaign for critical gaps"
// Multi-step: Filter → Review → Prepare campaign
// ---------------------------------------------------------------------------

export function buildRemediateGapsAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const allDefects = ctx.defectQueue?.filter(
    (d) => d.entityCode === ctx.entityCode,
  ) ?? [];

  // Step 1: Filter defects by severity
  const criticalDefects = allDefects.filter((d) => d.severity === "critical");
  const highDefects = allDefects.filter((d) => d.severity === "high");
  const gapDefects = [...criticalDefects, ...highDefects];

  if (gapDefects.length === 0) {
    return {
      text: `No critical or high severity defects found for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}. No campaign needed.`,
      sections: [{
        heading: "Step 1 — Filter Critical Gaps",
        stepNumber: 1,
        content: "Scanned the defect queue for critical and high severity items. None found — the entity is clean.",
        evidence: [],
        severity: "info",
        drillTarget: drillFor("defect_queue"),
      }],
      actions: [],
    };
  }

  sections.push({
    heading: "Step 1 — Filter Critical Gaps",
    stepNumber: 1,
    content: `Found ${gapDefects.length} critical/high defects out of ${allDefects.length} total. ` +
      `${criticalDefects.length} critical, ${highDefects.length} high severity.`,
    evidence: [
      ...(criticalDefects.length > 0 ? [{
        source: "defect_queue",
        label: `${criticalDefects.length} critical defects`,
        severity: "critical" as const,
        drillTarget: drillFor("defect_queue", {
          action: { type: "filter_view" as const, severity: "critical" },
        }),
      }] : []),
      ...(highDefects.length > 0 ? [{
        source: "defect_queue",
        label: `${highDefects.length} high severity defects`,
        severity: "high" as const,
        drillTarget: drillFor("defect_queue", {
          action: { type: "filter_view" as const, severity: "high" },
        }),
      }] : []),
    ],
    severity: criticalDefects.length > 0 ? "critical" : "high",
    drillTarget: drillFor("defect_queue", {
      action: { type: "filter_view" as const, severity: "critical" },
    }),
  });

  // Step 2: Review matching items
  const byType = new Map<string, AdvisorDefectQueueItemDTO[]>();
  for (const d of gapDefects) {
    const key = d.triggerType;
    const group = byType.get(key) ?? [];
    group.push(d);
    byType.set(key, group);
  }

  const groupLines: string[] = [];
  const groupEvidence: CopilotEvidence[] = [];
  for (const [type, items] of byType) {
    groupLines.push(`• ${type.replace(/_/g, " ")}: ${items.length} item${items.length > 1 ? "s" : ""}`);
    groupEvidence.push({
      source: "defect_queue",
      label: `${type.replace(/_/g, " ")} (${items.length})`,
      severity: items.some((i) => i.severity === "critical") ? "critical" : "high",
      drillTarget: drillFor("defect_queue"),
    });
  }

  sections.push({
    heading: "Step 2 — Review Matching Items",
    stepNumber: 2,
    content: `${gapDefects.length} items grouped by trigger type:\n${groupLines.join("\n")}\n\n` +
      `Top items by priority score:\n` +
      gapDefects
        .sort((a, b) => b.queuePriorityScore - a.queuePriorityScore)
        .slice(0, 5)
        .map((d, i) => `${i + 1}. ${d.policyName} — score ${d.queuePriorityScore}, pending ${d.hoursPending.toFixed(1)}h`)
        .join("\n"),
    evidence: gapDefects.slice(0, 8).map((d) => ({
      source: "defect_queue",
      label: d.policyName,
      severity: d.severity,
      value: `Score: ${d.queuePriorityScore}`,
      referenceId: d.actionId,
      drillTarget: drillFor("defect_queue", { focusId: d.actionId }),
    })),
    severity: "high",
    drillTarget: drillFor("defect_queue"),
  });

  // Step 3: Prepare campaign
  const campaignIds = gapDefects.slice(0, 20).map((d) => d.actionId);
  const campaignName = `Critical Gaps — ${ctx.entityCode} P${ctx.periodNumber} FY${ctx.fiscalYear}`;

  sections.push({
    heading: "Step 3 — Prepare Remediation Campaign",
    stepNumber: 3,
    content: `Ready to create a campaign with ${campaignIds.length} items. ` +
      `Campaign name: "${campaignName}". ` +
      `Click the action below to open the Remediation panel with these items pre-selected.`,
    evidence: [{
      source: "remediation",
      label: `${campaignIds.length} items ready for campaign`,
      severity: "info",
      drillTarget: drillFor("remediation", {
        action: {
          type: "prefill_campaign",
          actionIds: campaignIds,
          campaignName,
        },
      }),
    }],
    severity: "info",
    drillTarget: drillFor("remediation", {
      action: {
        type: "prefill_campaign",
        actionIds: campaignIds,
        campaignName,
      },
    }),
  });

  actions.push({
    priority: 1,
    title: `Create campaign: "${campaignName}"`,
    rationale: `Bundle ${campaignIds.length} critical/high defect items into a coordinated remediation campaign.`,
    ownerRole: "CLOSE_MANAGER",
    drillTarget: drillFor("remediation", {
      action: {
        type: "prefill_campaign",
        actionIds: campaignIds,
        campaignName,
      },
    }),
  });

  const text = `Found ${gapDefects.length} critical/high gaps for ${ctx.entityCode}. ` +
    `${criticalDefects.length} critical, ${highDefects.length} high — ready to bundle into a remediation campaign.`;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// BATCH_OVERDUE — "Show overdue defects and prepare batch"
// Multi-step: Filter overdue → Group by type → Prepare batch accept
// ---------------------------------------------------------------------------

export function buildBatchOverdueAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const allDefects = ctx.defectQueue?.filter(
    (d) => d.entityCode === ctx.entityCode,
  ) ?? [];

  // Step 1: Filter by overdue (hours pending > SLA threshold — use 24h as default)
  const overdueThresholdH = 24;
  const overdue = allDefects
    .filter((d) => d.hoursPending >= overdueThresholdH)
    .sort((a, b) => b.hoursPending - a.hoursPending);

  if (overdue.length === 0) {
    return {
      text: `No overdue defects (>${overdueThresholdH}h pending) found for ${ctx.entityCode}. All items are within SLA.`,
      sections: [{
        heading: "Step 1 — Filter Overdue Items",
        stepNumber: 1,
        content: `Checked ${allDefects.length} defect queue items against the ${overdueThresholdH}h threshold. None are overdue.`,
        evidence: [],
        severity: "info",
        drillTarget: drillFor("defect_queue"),
      }],
      actions: [],
    };
  }

  sections.push({
    heading: "Step 1 — Filter Overdue Items",
    stepNumber: 1,
    content: `Found ${overdue.length} items pending longer than ${overdueThresholdH}h out of ${allDefects.length} total. ` +
      `Oldest item: ${overdue[0].policyName} pending ${overdue[0].hoursPending.toFixed(1)}h.`,
    evidence: overdue.slice(0, 5).map((d) => ({
      source: "defect_queue",
      label: `${d.policyName} — ${d.hoursPending.toFixed(1)}h`,
      severity: d.severity,
      referenceId: d.actionId,
      drillTarget: drillFor("defect_queue", { focusId: d.actionId }),
    })),
    severity: overdue.some((d) => d.severity === "critical") ? "critical" : "high",
    drillTarget: drillFor("defect_queue"),
  });

  // Step 2: Group by action type
  const byAction = new Map<string, AdvisorDefectQueueItemDTO[]>();
  for (const d of overdue) {
    const key = d.actionType;
    const group = byAction.get(key) ?? [];
    group.push(d);
    byAction.set(key, group);
  }

  const groupLines: string[] = [];
  const groupEvidence: CopilotEvidence[] = [];
  for (const [actionType, items] of byAction) {
    const avgHours = items.reduce((s, i) => s + i.hoursPending, 0) / items.length;
    groupLines.push(`• ${actionType}: ${items.length} items (avg ${avgHours.toFixed(1)}h pending)`);
    groupEvidence.push({
      source: "defect_queue",
      label: `${actionType} (${items.length})`,
      severity: items.some((i) => i.severity === "critical") ? "critical" : "high",
      value: `avg ${avgHours.toFixed(1)}h`,
      drillTarget: drillFor("defect_queue"),
    });
  }

  sections.push({
    heading: "Step 2 — Group by Action Type",
    stepNumber: 2,
    content: `${overdue.length} overdue items across ${byAction.size} action types:\n${groupLines.join("\n")}`,
    evidence: groupEvidence,
    severity: "high",
    drillTarget: drillFor("defect_queue"),
  });

  // Step 3: Prepare batch — suggest accept for SUGGESTED items, campaign for rest
  const suggestedItems = overdue.filter((d) => d.status === "SUGGESTED");
  const nonSuggested = overdue.filter((d) => d.status !== "SUGGESTED");

  const step3Evidence: CopilotEvidence[] = [];
  const step3Parts: string[] = [];

  if (suggestedItems.length > 0) {
    step3Parts.push(
      `${suggestedItems.length} items in SUGGESTED status — ready for batch acceptance.`,
    );
    step3Evidence.push({
      source: "defect_queue",
      label: `${suggestedItems.length} ready for batch accept`,
      severity: "info",
      drillTarget: drillFor("defect_queue", {
        action: { type: "filter_view" as const, severity: undefined, slaRiskTier: undefined },
      }),
    });

    // Top 3 individual accept actions
    suggestedItems.slice(0, 3).forEach((d, i) => {
      actions.push({
        priority: i + 1,
        title: `Accept: ${d.policyName}`,
        rationale: `Overdue by ${d.hoursPending.toFixed(1)}h — ${d.severity} severity.`,
        actionType: d.actionType,
        ownerRole: ctx.role,
        drillTarget: drillFor("defect_queue", {
          focusId: d.actionId,
          action: { type: "accept_defect", actionId: d.actionId },
        }),
      });
    });

    // Bulk campaign if many
    if (suggestedItems.length >= 3) {
      const batchIds = suggestedItems.map((d) => d.actionId);
      const campaignName = `Overdue Batch — ${ctx.entityCode} P${ctx.periodNumber}`;
      actions.push({
        priority: actions.length + 1,
        title: `Create batch campaign (${batchIds.length} overdue items)`,
        rationale: `Bundle all ${batchIds.length} overdue SUGGESTED items into a remediation campaign for coordinated resolution.`,
        ownerRole: "CLOSE_MANAGER",
        drillTarget: drillFor("remediation", {
          action: {
            type: "prefill_campaign",
            actionIds: batchIds,
            campaignName,
          },
        }),
      });
    }
  }

  if (nonSuggested.length > 0) {
    step3Parts.push(
      `${nonSuggested.length} items are not in SUGGESTED status and need manual review.`,
    );
  }

  sections.push({
    heading: "Step 3 — Prepare Batch",
    stepNumber: 3,
    content: step3Parts.join(" "),
    evidence: step3Evidence,
    severity: "info",
    drillTarget: suggestedItems.length >= 3
      ? drillFor("remediation", {
          action: {
            type: "prefill_campaign",
            actionIds: suggestedItems.map((d) => d.actionId),
            campaignName: `Overdue Batch — ${ctx.entityCode} P${ctx.periodNumber}`,
          },
        })
      : drillFor("defect_queue"),
  });

  const text = `${overdue.length} overdue defects for ${ctx.entityCode} (>${overdueThresholdH}h pending). ` +
    `${suggestedItems.length} ready for batch acceptance, ${nonSuggested.length} require manual review.`;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// EXPORT_AND_REVIEW — "Export cert pack and review exceptions"
// Multi-step: Summarize cert status → List exceptions → Trigger export
// ---------------------------------------------------------------------------

export function buildExportAndReviewAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const es = ctx.executiveSummary;
  const brief = ctx.executiveBrief;

  // Step 1: Certification status summary
  const readiness = es?.readinessScore ?? "N/A";
  const openExceptions = es?.openExceptions ?? 0;
  const critExceptions = es?.criticalExceptions ?? 0;
  const completionPct = es?.completionPct ?? 0;

  sections.push({
    heading: "Step 1 — Certification Status",
    stepNumber: 1,
    content: [
      `Readiness score: ${readiness}`,
      `Completion: ${completionPct}%`,
      `Open exceptions: ${openExceptions} (${critExceptions} critical)`,
      `Overrides: ${es?.totalOverrides ?? 0} (impact: ${es?.overrideImpactTotal ?? 0})`,
      `Document health: ${es?.docHealthRating ?? "N/A"} (${es?.docHealthScore ?? "N/A"})`,
    ].join("\n"),
    evidence: [
      {
        source: "certification",
        label: `Readiness: ${readiness}`,
        severity: completionPct >= 90 ? "info" : completionPct >= 70 ? "medium" : "high",
        drillTarget: drillFor("certification"),
      },
      ...(critExceptions > 0 ? [{
        source: "exception",
        label: `${critExceptions} critical exceptions`,
        severity: "critical" as const,
        drillTarget: drillFor("exception"),
      }] : []),
    ],
    severity: critExceptions > 0 ? "critical" : openExceptions > 0 ? "high" : "info",
    drillTarget: drillFor("certification"),
  });

  // Step 2: List open exceptions from alerts and attention items
  const exceptionAlerts = ctx.alerts?.filter(
    (a) =>
      a.entityCode === ctx.entityCode &&
      (a.alertType === "EXCEPTION" || a.alertType === "CERTIFICATION_GAP"),
  ) ?? [];

  const attentionExceptions = brief?.attentionItems?.filter(
    (a) => a.severity === "critical" || a.severity === "high",
  ) ?? [];

  const exceptionEvidence: CopilotEvidence[] = [];
  const exceptionLines: string[] = [];

  exceptionAlerts.forEach((a) => {
    exceptionLines.push(`• [${a.alertSeverity}] ${a.alertTitle}`);
    exceptionEvidence.push({
      source: "exception",
      label: a.alertTitle,
      severity: a.alertSeverity,
      referenceId: a.alertId,
      drillTarget: drillFor("exception", { focusId: a.alertId }),
    });
  });

  attentionExceptions.forEach((a) => {
    exceptionLines.push(`• [${a.severity}] ${a.title}: ${a.detail}`);
    exceptionEvidence.push({
      source: "attention_item",
      label: a.title,
      severity: a.severity,
      drillTarget: drillFor("exception"),
    });
  });

  const totalExceptions = exceptionAlerts.length + attentionExceptions.length;

  sections.push({
    heading: "Step 2 — Open Exceptions",
    stepNumber: 2,
    content: totalExceptions === 0
      ? "No open exceptions or critical attention items found. The certification pack should be clean."
      : `${totalExceptions} items requiring attention before certification:\n${exceptionLines.join("\n")}`,
    evidence: exceptionEvidence,
    severity: exceptionEvidence.some((e) => e.severity === "critical") ? "critical" : totalExceptions > 0 ? "high" : "info",
    drillTarget: drillFor("exception"),
  });

  // Step 3: Export action
  sections.push({
    heading: "Step 3 — Export & Navigate",
    stepNumber: 3,
    content: totalExceptions === 0
      ? "Certification pack is ready for export. Click the action below to trigger the download."
      : `${totalExceptions} exceptions remain open. You can still export the pack for review, ` +
        `then navigate to the exceptions tab to address remaining items.`,
    evidence: [
      {
        source: "certification",
        label: "Export certification pack",
        severity: "info",
        drillTarget: drillFor("certification", { action: { type: "trigger_export" } }),
      },
      ...(totalExceptions > 0 ? [{
        source: "exception",
        label: `Review ${totalExceptions} exceptions`,
        severity: "high" as const,
        drillTarget: drillFor("exception"),
      }] : []),
    ],
    severity: "info",
    drillTarget: drillFor("certification", { action: { type: "trigger_export" } }),
  });

  // Actions
  actions.push({
    priority: 1,
    title: "Export certification pack",
    rationale: `Download the current certification pack for ${ctx.entityCode} P${ctx.periodNumber} FY${ctx.fiscalYear}.`,
    ownerRole: ctx.role,
    drillTarget: drillFor("certification", { action: { type: "trigger_export" } }),
  });

  if (totalExceptions > 0) {
    actions.push({
      priority: 2,
      title: `Review ${totalExceptions} open exceptions`,
      rationale: "Navigate to the exceptions tab to resolve remaining items before final certification.",
      ownerRole: ctx.role,
      drillTarget: drillFor("exception"),
    });
  }

  const text = `Certification for ${ctx.entityCode} P${ctx.periodNumber}: readiness ${readiness}, ${openExceptions} exceptions open. ` +
    (totalExceptions === 0
      ? "Pack is ready for export."
      : `${totalExceptions} items need attention. Export available for review.`);

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// Narrative → CopilotAnswer adapter
// ---------------------------------------------------------------------------

const NARRATIVE_AUDIENCE_MAP: Record<string, NarrativeAudience> = {
  NARRATIVE_CONTROLLER: "CONTROLLER",
  NARRATIVE_CFO: "CFO",
  NARRATIVE_AUDIT: "AUDIT_COMMITTEE",
  NARRATIVE_BOARD: "BOARD",
};

function narrativeToCopilotAnswer(brief: NarrativeBrief): CopilotAnswer {
  const sections: CopilotAnswerSection[] = brief.sections.map((s, i) => ({
    heading: s.heading,
    stepNumber: i + 1,
    content: s.paragraphs.join("\n\n") +
      (s.keyMetrics && s.keyMetrics.length > 0
        ? "\n\n" + s.keyMetrics.map((m) => `${m.label}: ${m.value}${m.trend ? ` (${m.trend})` : ""}`).join("  |  ")
        : ""),
    evidence: [
      ...(s.keyMetrics ?? []).map((m) => ({
        source: "narrative",
        label: m.label,
        value: m.value,
        severity: (m.trend === "down" ? "high" : "info") as "high" | "info",
      })),
    ],
    severity: s.severity,
  }));

  // Add takeaways section
  if (brief.takeaways.length > 0) {
    sections.push({
      heading: "Key Takeaways",
      content: brief.takeaways.map((t) => `• ${t}`).join("\n"),
      evidence: [],
      severity: "info",
    });
  }

  // Add risk items section
  if (brief.riskItems.length > 0) {
    sections.push({
      heading: "Risk Items",
      content: brief.riskItems.map((r) => `[${r.severity.toUpperCase()}] ${r.title}: ${r.detail}`).join("\n"),
      evidence: brief.riskItems.map((r) => ({
        source: "narrative",
        label: r.title,
        value: r.detail,
        severity: r.severity as "critical" | "high" | "medium" | "info",
      })),
      severity: brief.riskItems.some((r) => r.severity === "critical") ? "critical" : "high",
    });
  }

  const actions: CopilotAction[] = [
    {
      priority: 1,
      title: `Export ${brief.audience.replace(/_/g, " ")} narrative`,
      rationale: `Download the ${brief.title} as an Excel file.`,
      ownerRole: brief.audience === "BOARD" || brief.audience === "CFO" ? "CFO" : "CONTROLLER",
      drillTarget: drillFor("certification", {
        action: { type: "trigger_narrative_export", audience: brief.audience },
      }),
    },
  ];

  return { text: brief.summary, sections, actions };
}

// ---------------------------------------------------------------------------
// PROPOSE_CAMPAIGNS — "Auto-suggest campaigns from defect clusters"
// Analyzes defect queue, groups by actionType, proposes campaign drafts.
// ---------------------------------------------------------------------------

export function buildProposeCampaignsAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const suggestions = suggestCampaigns(
    ctx.defectQueue ?? [],
    ctx.entityCode,
    ctx.fiscalYear,
    ctx.periodNumber,
  );

  if (suggestions.length === 0) {
    return {
      text: `No campaign-worthy defect clusters found for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}. The defect queue has either too few items or insufficient urgency to warrant bundled remediation.`,
      sections: [{
        heading: "Step 1 — Cluster Analysis",
        stepNumber: 1,
        content: "Scanned defect queue for actionType clusters with ≥2 items and sufficient urgency. No clusters met the threshold.",
        evidence: [],
        severity: "info",
        drillTarget: drillFor("defect_queue"),
      }],
      actions: [],
    };
  }

  // Step 1: Analysis summary
  const totalItems = suggestions.reduce((s, sg) => s + sg.itemCount, 0);
  const totalCritical = suggestions.reduce((s, sg) => s + sg.criticalCount, 0);

  sections.push({
    heading: "Step 1 — Defect Cluster Analysis",
    stepNumber: 1,
    content: `Identified ${suggestions.length} campaign-worthy cluster${suggestions.length > 1 ? "s" : ""} ` +
      `covering ${totalItems} defects. ${totalCritical} critical items detected across all clusters.`,
    evidence: suggestions.map((sg) => ({
      source: "defect_queue",
      label: `${sg.actionType.replace(/_/g, " ")} (${sg.itemCount})`,
      severity: sg.criticalCount > 0 ? ("critical" as const) : ("high" as const),
      value: `Urgency: ${sg.urgencyScore}`,
    })),
    severity: totalCritical > 0 ? "critical" : "high",
    drillTarget: drillFor("defect_queue"),
  });

  // Step 2: Detail each suggestion
  const detailLines: string[] = [];
  const detailEvidence: CopilotEvidence[] = [];

  for (const [idx, sg] of suggestions.entries()) {
    const num = idx + 1;
    detailLines.push(
      `${num}. ${sg.campaignName}\n` +
      `   ${sg.rationale}\n` +
      `   Urgency score: ${sg.urgencyScore} | Items: ${sg.itemCount} | ` +
      `Critical: ${sg.criticalCount} | High: ${sg.highCount}`,
    );

    detailEvidence.push({
      source: "campaign_suggestion",
      label: sg.campaignName,
      severity: sg.criticalCount > 0 ? "critical" : sg.highCount > 0 ? "high" : "medium",
      value: `${sg.itemCount} items, urgency ${sg.urgencyScore}`,
      drillTarget: drillFor("remediation", {
        action: {
          type: "prefill_campaign",
          actionIds: sg.actionIds,
          campaignName: sg.campaignName,
        },
      }),
    });
  }

  sections.push({
    heading: "Step 2 — Proposed Campaigns",
    stepNumber: 2,
    content: detailLines.join("\n\n"),
    evidence: detailEvidence,
    severity: totalCritical > 0 ? "critical" : "high",
    drillTarget: drillFor("defect_queue"),
  });

  // Step 3: Launch actions
  const launchLines: string[] = [];
  for (const sg of suggestions) {
    launchLines.push(
      `• "${sg.campaignName}" — ${sg.itemCount} items ready`,
    );

    actions.push({
      priority: sg.urgencyScore,
      title: `Launch: ${sg.campaignName}`,
      rationale: sg.rationale,
      actionType: sg.actionType,
      ownerRole: "CLOSE_MANAGER",
      estimatedImpact: `${sg.itemCount} defects bundled, ${sg.criticalCount} critical`,
      drillTarget: drillFor("remediation", {
        action: {
          type: "prefill_campaign",
          actionIds: sg.actionIds,
          campaignName: sg.campaignName,
        },
      }),
    });
  }

  sections.push({
    heading: "Step 3 — Review & Launch",
    stepNumber: 3,
    content: `${suggestions.length} campaign${suggestions.length > 1 ? "s" : ""} ready for review:\n` +
      launchLines.join("\n") +
      "\n\nClick any action below to open the Remediation panel with items pre-selected.",
    evidence: [],
    severity: "info",
    drillTarget: drillFor("remediation"),
  });

  const text = `Found ${suggestions.length} campaign suggestion${suggestions.length > 1 ? "s" : ""} ` +
    `for ${ctx.entityCode}: ${totalItems} defects across ${suggestions.length} actionType cluster${suggestions.length > 1 ? "s" : ""}. ` +
    `${totalCritical > 0 ? `${totalCritical} critical items require urgent attention.` : "Review and launch when ready."}`;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// SIMULATE_CLOSE — "What if" scenario modeling
// Runs all preset scenarios, compares projected vs baseline, ranks by impact.
// ---------------------------------------------------------------------------

export function buildSimulateCloseAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const results = runAllSimulations(
    ctx.completionForecast,
    ctx.executiveSummary,
    ctx.defectQueue,
  );

  if (results.length === 0) {
    return {
      text: "Unable to run simulations — no forecast or summary data available.",
      sections: [],
      actions: [],
    };
  }

  // Step 1: Current baseline
  const baseline = results[0].baseline;
  sections.push({
    heading: "Step 1 — Current Baseline",
    stepNumber: 1,
    content:
      `Current close status for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}:\n` +
      `• Breach probability: ${baseline.breachProbability}% (${baseline.riskTier})\n` +
      `• Buffer: ${baseline.bufferHours.toFixed(1)}h\n` +
      `• Completion: ${baseline.completionPct.toFixed(1)}%\n` +
      `• Blocked tasks: ${baseline.blockedTasks}\n` +
      `• Critical path: ${Math.round(baseline.criticalPathMinutes / 60)}h\n` +
      `• Predicted ready: ${baseline.predictedReadyLabel}`,
    evidence: [
      {
        source: "completion_forecast",
        label: `Breach: ${baseline.breachProbability}%`,
        severity: baseline.breachProbability >= 50 ? "critical" : baseline.breachProbability >= 25 ? "high" : "info",
        value: `${baseline.riskTier}`,
        drillTarget: drillFor("predictive"),
      },
      {
        source: "completion_forecast",
        label: `Buffer: ${baseline.bufferHours.toFixed(1)}h`,
        severity: baseline.bufferHours < 12 ? "high" : "info",
        drillTarget: drillFor("advisor", { subTab: "forecast" }),
      },
    ],
    severity: baseline.breachProbability >= 50 ? "critical" : baseline.breachProbability >= 25 ? "high" : "info",
    drillTarget: drillFor("advisor", { subTab: "forecast" }),
  });

  // Step 2: Scenario comparison table
  const scenarioLines: string[] = [];
  const scenarioEvidence: CopilotEvidence[] = [];

  for (const [idx, result] of results.entries()) {
    const breachDelta = result.projected.breachProbability - baseline.breachProbability;
    const bufferDelta = result.projected.bufferHours - baseline.bufferHours;

    const assessmentEmoji =
      result.assessment === "SAFE" ? "[SAFE]" :
      result.assessment === "IMPROVED" ? "[IMPROVED]" :
      result.assessment === "MARGINAL" ? "[MARGINAL]" :
      "[AT RISK]";

    scenarioLines.push(
      `${idx + 1}. ${result.scenarioName} ${assessmentEmoji}\n` +
      `   Breach: ${baseline.breachProbability}% → ${result.projected.breachProbability}% (${breachDelta > 0 ? "+" : ""}${breachDelta}%)\n` +
      `   Buffer: ${baseline.bufferHours.toFixed(1)}h → ${result.projected.bufferHours.toFixed(1)}h (${bufferDelta > 0 ? "+" : ""}${bufferDelta.toFixed(1)}h)\n` +
      `   Completion: ${baseline.completionPct.toFixed(1)}% → ${result.projected.completionPct.toFixed(1)}%`,
    );

    scenarioEvidence.push({
      source: "simulation",
      label: `${result.scenarioName}: ${result.projected.breachProbability}%`,
      severity:
        result.assessment === "SAFE" ? "info" :
        result.assessment === "IMPROVED" ? "medium" :
        result.assessment === "MARGINAL" ? "high" : "critical",
      value: `${breachDelta > 0 ? "+" : ""}${breachDelta}% breach`,
    });
  }

  sections.push({
    heading: "Step 2 — Scenario Comparison",
    stepNumber: 2,
    content: `Ran ${results.length} scenarios. Results ranked by projected breach probability:\n\n` +
      scenarioLines.join("\n\n"),
    evidence: scenarioEvidence,
    severity: results[0].projected.breachProbability >= 50 ? "high" : "info",
  });

  // Step 3: Best scenario detail
  const best = results[0];
  const impactLines = best.impacts.map((imp) => `• ${imp.narrative}`).join("\n");

  sections.push({
    heading: "Step 3 — Recommended Scenario",
    stepNumber: 3,
    content:
      `Best scenario: "${best.scenarioName}" (${best.assessment})\n\n` +
      `${best.summary}\n\n` +
      `Impact breakdown:\n${impactLines}\n\n` +
      (best.recommendations.length > 0
        ? `Recommendations:\n${best.recommendations.map((r) => `• ${r}`).join("\n")}`
        : ""),
    evidence: best.impacts.map((imp) => ({
      source: "simulation",
      label: imp.adjustmentLabel,
      severity: imp.breachDelta < -10 ? "info" : imp.breachDelta < 0 ? "medium" : "high",
      value: `Buffer: ${imp.bufferDelta > 0 ? "+" : ""}${imp.bufferDelta.toFixed(1)}h`,
    })),
    severity: best.assessment === "SAFE" || best.assessment === "IMPROVED" ? "info" : "high",
  });

  // Actions for each scenario
  for (const result of results.slice(0, 3)) {
    actions.push({
      priority: 100 - result.projected.breachProbability,
      title: `Execute: ${result.scenarioName}`,
      rationale: result.summary,
      ownerRole: "CLOSE_MANAGER",
      estimatedImpact: `Breach: ${baseline.breachProbability}% → ${result.projected.breachProbability}%`,
    });
  }

  const text =
    `Simulated ${results.length} scenarios for ${ctx.entityCode}. ` +
    `Best outcome: "${best.scenarioName}" reduces breach from ${baseline.breachProbability}% to ${best.projected.breachProbability}% ` +
    `(${best.assessment}).`;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// ROOT_CAUSE_ANALYSIS — "What is causing the close risk?"
// ---------------------------------------------------------------------------

function rootCauseSeverityToEvidence(
  severity: RootCause["severity"],
): CopilotEvidence["severity"] {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "info";
  }
}

export function buildRootCauseAnalysisAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const analysis: RootCauseAnalysis = analyzeRootCauses({
    entityCode: ctx.entityCode,
    fiscalYear: ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
    executiveSummary: ctx.executiveSummary,
    heatmap: ctx.heatmap,
    alerts: ctx.alerts,
    defectQueue: ctx.defectQueue,
    completionForecast: ctx.completionForecast,
    atlasDashboard: ctx.atlasDashboard,
  });

  if (analysis.causes.length === 0) {
    return {
      text: `No significant root causes detected for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}. Close health is ${analysis.healthStatus}.`,
      sections: [],
      actions: [],
    };
  }

  // Step 1: Health Assessment
  const statusLabel =
    analysis.healthStatus === "CRITICAL" ? "CRITICAL — immediate action required" :
    analysis.healthStatus === "DEGRADED" ? "DEGRADED — multiple risk factors active" :
    analysis.healthStatus === "WATCH" ? "WATCH — elevated risk detected" :
    "HEALTHY — within tolerance";

  sections.push({
    heading: "Step 1 — Health Assessment",
    stepNumber: 1,
    content:
      `Close health for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}: **${statusLabel}**\n\n` +
      `${analysis.causes.length} root cause${analysis.causes.length > 1 ? "s" : ""} identified, ` +
      `contributing an estimated ${analysis.totalBreachContribution.toFixed(0)}% to breach probability.\n\n` +
      analysis.summary,
    evidence: [
      {
        source: "root_cause_analysis",
        label: `Health: ${analysis.healthStatus}`,
        severity: analysis.healthStatus === "CRITICAL" ? "critical" :
          analysis.healthStatus === "DEGRADED" ? "high" :
          analysis.healthStatus === "WATCH" ? "medium" : "info",
        value: `${analysis.causes.length} cause${analysis.causes.length > 1 ? "s" : ""}`,
      },
      {
        source: "root_cause_analysis",
        label: `Total breach contribution`,
        severity: analysis.totalBreachContribution >= 50 ? "critical" :
          analysis.totalBreachContribution >= 25 ? "high" : "medium",
        value: `${analysis.totalBreachContribution.toFixed(0)}%`,
      },
    ],
    severity: analysis.healthStatus === "CRITICAL" ? "critical" :
      analysis.healthStatus === "DEGRADED" ? "high" :
      analysis.healthStatus === "WATCH" ? "medium" : "info",
  });

  // Step 2: Root Cause Chain — each cause with evidence trail
  const causeLines: string[] = [];
  const causeEvidence: CopilotEvidence[] = [];

  for (const [idx, cause] of analysis.causes.entries()) {
    const chainSteps = cause.evidenceChain
      .map((e) => {
        const levelLabel =
          e.level === "symptom" ? "Symptom" :
          e.level === "contributing_factor" ? "Factor" :
          "Root Cause";
        return `  ${levelLabel}: ${e.description}`;
      })
      .join("\n");

    causeLines.push(
      `${idx + 1}. [${cause.severity.toUpperCase()}] ${cause.title} (${cause.category})\n` +
      `   Breach contribution: +${cause.breachContribution.toFixed(0)}%\n` +
      `   ${cause.explanation}\n` +
      `   Evidence chain:\n${chainSteps}`,
    );

    causeEvidence.push({
      source: "root_cause_analysis",
      label: `${cause.title}`,
      severity: rootCauseSeverityToEvidence(cause.severity),
      value: `+${cause.breachContribution.toFixed(0)}% breach`,
      drillTarget: cause.drillTab
        ? drillFor(cause.drillTab, { subTab: cause.drillSubTab })
        : undefined,
    });
  }

  sections.push({
    heading: "Step 2 — Root Cause Chain",
    stepNumber: 2,
    content:
      `Identified ${analysis.causes.length} root cause${analysis.causes.length > 1 ? "s" : ""}, ` +
      `ranked by breach contribution:\n\n` +
      causeLines.join("\n\n"),
    evidence: causeEvidence,
    severity: analysis.causes[0].severity === "critical" ? "critical" : "high",
  });

  // Step 3: Remediation Plan
  const remediationLines = analysis.causes
    .filter((c) => c.severity === "critical" || c.severity === "high")
    .map((c, idx) => `${idx + 1}. ${c.remediation}`)
    .join("\n");

  sections.push({
    heading: "Step 3 — Remediation Plan",
    stepNumber: 3,
    content:
      `Priority remediations for critical and high-severity root causes:\n\n` +
      (remediationLines || "No critical/high severity causes require immediate remediation.") +
      `\n\nUse "Simulate Close" to model the impact of these remediations before executing.`,
    evidence: analysis.causes
      .filter((c) => c.severity === "critical" || c.severity === "high")
      .map((c) => ({
        source: "root_cause_analysis" as const,
        label: `Fix: ${c.title}`,
        severity: rootCauseSeverityToEvidence(c.severity),
        value: c.remediation.slice(0, 60) + (c.remediation.length > 60 ? "…" : ""),
        drillTarget: c.drillTab
          ? drillFor(c.drillTab, { subTab: c.drillSubTab })
          : undefined,
      })),
    severity: "info",
  });

  // Actions — one per critical/high cause
  for (const cause of analysis.causes.filter((c) => c.severity === "critical" || c.severity === "high")) {
    actions.push({
      priority: Math.round(cause.breachContribution),
      title: `Remediate: ${cause.title}`,
      rationale: cause.remediation,
      ownerRole: "CLOSE_MANAGER",
      estimatedImpact: `Reduces breach contribution by ~${cause.breachContribution.toFixed(0)}%`,
      drillTarget: cause.drillTab
        ? drillFor(cause.drillTab, { subTab: cause.drillSubTab })
        : undefined,
    });
  }

  const criticalCount = analysis.causes.filter((c) => c.severity === "critical").length;
  const highCount = analysis.causes.filter((c) => c.severity === "high").length;

  const text =
    `Root cause analysis for ${ctx.entityCode}: ${analysis.healthStatus}. ` +
    `Found ${analysis.causes.length} cause${analysis.causes.length > 1 ? "s" : ""} ` +
    `(${criticalCount} critical, ${highCount} high) ` +
    `contributing ~${analysis.totalBreachContribution.toFixed(0)}% to breach risk.`;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// ORCHESTRATE_CLOSE — "Evaluate automation rules for close actions"
// ---------------------------------------------------------------------------

function verdictSeverity(
  verdict: OrchestrationAction["verdict"],
): CopilotEvidence["severity"] {
  switch (verdict) {
    case "AUTO_EXECUTED":
      return "info";
    case "REQUIRES_APPROVAL":
      return "high";
    case "BLOCKED_BY_KILL_SWITCH":
    case "BLOCKED_BY_THRESHOLD":
      return "critical";
    case "BLOCKED_BY_RATE_LIMIT":
    case "BLOCKED_BY_COOLDOWN":
    case "BLOCKED_BY_SCHEDULE":
      return "medium";
    case "ESCALATED":
      return "high";
    case "SKIPPED_NO_RULE":
      return "info";
  }
}

export function buildOrchestrationAnswer(ctx: CopilotContext): CopilotAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const plan = evaluateOrchestrationPlan({
    entityCode: ctx.entityCode,
    fiscalYear: ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
    defectQueue: ctx.defectQueue,
    completionForecast: ctx.completionForecast,
    executiveSummary: ctx.executiveSummary,
  });

  if (plan.totalScanned === 0) {
    return {
      text: `No pending actions in the defect queue for ${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber}. Nothing to orchestrate.`,
      sections: [],
      actions: [],
    };
  }

  // Step 1: Automation Status & Risk Context
  sections.push({
    heading: "Step 1 — Automation Status",
    stepNumber: 1,
    content:
      `Entity: ${ctx.entityCode} — FY${ctx.fiscalYear} P${ctx.periodNumber}\n` +
      `Automation: ${plan.automationEnabled ? "ENABLED" : "DISABLED/NO RULES"} (${plan.rulesEvaluated} rule${plan.rulesEvaluated !== 1 ? "s" : ""} evaluated)\n` +
      `Breach probability: ${plan.breachProbability}% | Buffer: ${plan.bufferHours.toFixed(1)}h\n` +
      `Scanned ${plan.totalScanned} pending action${plan.totalScanned !== 1 ? "s" : ""}`,
    evidence: [
      {
        source: "automation_status",
        label: plan.automationEnabled ? "Automation ON" : "Automation OFF",
        severity: plan.automationEnabled ? "info" : "medium",
      },
      {
        source: "completion_forecast",
        label: `Breach: ${plan.breachProbability}%`,
        severity: plan.breachProbability >= 50 ? "critical" : plan.breachProbability >= 25 ? "high" : "info",
        drillTarget: drillFor("completion_forecast"),
      },
    ],
    severity: plan.automationEnabled ? "info" : "medium",
  });

  // Step 2: Gate Evaluation Results
  const autoLines = plan.autoExecutable
    .map((a) => `  [AUTO] ${a.policyName} (${a.severity}) — ${a.rationale}`)
    .join("\n");
  const approvalLines = plan.requiresApproval
    .map((a) => `  [APPROVAL] ${a.policyName} (${a.severity}) — ${a.blockingGate ?? "severity gate"}`)
    .join("\n");
  const blockedLines = plan.blocked
    .map((a) => `  [BLOCKED] ${a.policyName} — ${a.blockingGate ?? "unknown gate"}: ${a.gates.find((g) => !g.passed)?.reason ?? ""}`)
    .join("\n");

  const evalContent: string[] = [];
  if (plan.autoExecutable.length > 0) {
    evalContent.push(`Auto-executable (${plan.autoExecutable.length}):\n${autoLines}`);
  }
  if (plan.requiresApproval.length > 0) {
    evalContent.push(`Requires approval (${plan.requiresApproval.length}):\n${approvalLines}`);
  }
  if (plan.blocked.length > 0) {
    evalContent.push(`Blocked (${plan.blocked.length}):\n${blockedLines}`);
  }

  const allActions = [...plan.autoExecutable, ...plan.requiresApproval, ...plan.blocked];
  const evalEvidence: CopilotEvidence[] = allActions.slice(0, 8).map((a) => ({
    source: "defect_queue",
    label: a.policyName,
    severity: verdictSeverity(a.verdict),
    value: a.verdict.replace(/_/g, " "),
    drillTarget: drillFor("defect_queue", { focusId: a.id }),
  }));

  sections.push({
    heading: "Step 2 — Gate Evaluation",
    stepNumber: 2,
    content: evalContent.join("\n\n") || "No actions evaluated.",
    evidence: evalEvidence,
    severity: plan.totalBlocked > 0 ? "high" : plan.totalRequiresApproval > 0 ? "medium" : "info",
    drillTarget: drillFor("defect_queue"),
  });

  // Step 3: Orchestration Plan Summary
  const planLines: string[] = [];
  if (plan.autoExecutable.length > 0) {
    planLines.push(
      `${plan.autoExecutable.length} action${plan.autoExecutable.length > 1 ? "s" : ""} eligible for auto-execution:`,
      ...plan.autoExecutable.map((a) =>
        `  • ${a.policyName} (${a.actionType}, ${a.severity})\n    Gates passed: ${a.gates.filter((g) => g.passed).map((g) => g.gate).join(", ")}`,
      ),
    );
  }
  if (plan.requiresApproval.length > 0) {
    planLines.push(
      `\n${plan.requiresApproval.length} action${plan.requiresApproval.length > 1 ? "s" : ""} need human approval:`,
      ...plan.requiresApproval.map((a) =>
        `  • ${a.policyName} — ${a.severity} severity, blocked by ${a.blockingGate ?? "severity gate"}`,
      ),
    );
  }
  if (plan.blocked.length > 0) {
    planLines.push(
      `\n${plan.blocked.length} action${plan.blocked.length > 1 ? "s" : ""} blocked by governance:`,
      ...plan.blocked.map((a) =>
        `  • ${a.policyName} — ${a.gates.find((g) => !g.passed)?.reason ?? a.blockingGate ?? "governance gate"}`,
      ),
    );
  }

  sections.push({
    heading: "Step 3 — Orchestration Plan",
    stepNumber: 3,
    content: planLines.join("\n"),
    evidence: [
      {
        source: "orchestration",
        label: `Auto: ${plan.totalAutoEligible}`,
        severity: "info",
      },
      {
        source: "orchestration",
        label: `Approval: ${plan.totalRequiresApproval}`,
        severity: plan.totalRequiresApproval > 0 ? "high" : "info",
      },
      {
        source: "orchestration",
        label: `Blocked: ${plan.totalBlocked}`,
        severity: plan.totalBlocked > 0 ? "medium" : "info",
      },
    ],
    severity: plan.totalBlocked > plan.totalAutoEligible ? "high" : "info",
  });

  // Actions: auto-executable items as recommended actions
  for (const a of plan.autoExecutable.slice(0, 5)) {
    actions.push({
      priority: 1,
      title: `Auto-execute: ${a.policyName}`,
      rationale: a.rationale,
      ownerRole: "CLOSE_MANAGER",
      estimatedImpact: a.estimatedImpact,
      drillTarget: drillFor("defect_queue", { focusId: a.id }),
    });
  }

  // Actions: items requiring approval
  for (const a of plan.requiresApproval.slice(0, 5)) {
    actions.push({
      priority: 2,
      title: `Review & approve: ${a.policyName}`,
      rationale: `${a.severity} severity — requires human approval (${a.blockingGate ?? "severity gate"})`,
      ownerRole: "CONTROLLER",
      estimatedImpact: a.estimatedImpact,
      drillTarget: drillFor("defect_queue", { focusId: a.id }),
    });
  }

  const text = plan.summary;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// Dispatcher — routes question type to the right builder
// ---------------------------------------------------------------------------

export function buildCopilotAnswer(
  questionType: string,
  ctx: CopilotContext,
): CopilotAnswer {
  // Narrative types
  const narrativeAudience = NARRATIVE_AUDIENCE_MAP[questionType];
  if (narrativeAudience) {
    const brief = buildNarrativeBrief(narrativeAudience, ctx);
    return narrativeToCopilotAnswer(brief);
  }

  switch (questionType) {
    case "WHY_RED":
      return buildWhyRedAnswer(ctx);
    case "TODAY_ACTIONS":
      return buildTodayActionsAnswer(ctx);
    case "BREACH_RISK":
      return buildBreachRiskAnswer(ctx);
    case "WHAT_CHANGED":
      return buildWhatChangedAnswer(ctx);
    case "EXECUTIVE_SUMMARY":
      return buildExecutiveSummaryAnswer(ctx);
    case "REMEDIATE_GAPS":
      return buildRemediateGapsAnswer(ctx);
    case "BATCH_OVERDUE":
      return buildBatchOverdueAnswer(ctx);
    case "EXPORT_AND_REVIEW":
      return buildExportAndReviewAnswer(ctx);
    case "PROPOSE_CAMPAIGNS":
      return buildProposeCampaignsAnswer(ctx);
    case "SIMULATE_CLOSE":
      return buildSimulateCloseAnswer(ctx);
    case "ROOT_CAUSE_ANALYSIS":
      return buildRootCauseAnalysisAnswer(ctx);
    case "ORCHESTRATE_CLOSE":
      return buildOrchestrationAnswer(ctx);
    default:
      return {
        text: "I can help you with: status assessment, today's actions, breach risk analysis, change tracking, executive summaries, and narrative report generation. Try one of the quick questions or type a question below.",
        sections: [],
        actions: [],
      };
  }
}
