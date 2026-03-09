// lib/finance/copilot-narrative-builder.ts
//
// Phase 12B: Deterministic Narrative Pack Generator.
// Composes existing close data into role-appropriate narrative briefs.
// No LLM — template-based, auditable, governed.

import type { CopilotContext } from "./copilot-answer-builder";
import type {
  NarrativeAudience,
  NarrativeBrief,
  NarrativeSection,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "N/A";
  return `${n}%`;
}

function fmtHours(n: number | null | undefined): string {
  if (n == null) return "N/A";
  return `${n.toFixed(1)}h`;
}

function riskLabel(color: string | undefined): string {
  switch (color) {
    case "RED": return "elevated risk";
    case "AMBER": return "moderate risk";
    case "GREEN": return "within tolerance";
    default: return "unknown risk level";
  }
}

function slaLabel(status: string | null | undefined): string {
  switch (status) {
    case "BREACHED": return "SLA has been breached";
    case "AT_RISK": return "SLA is at risk";
    case "ON_TRACK": return "SLA is on track";
    default: return "SLA status unknown";
  }
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Controller Close Brief
// ---------------------------------------------------------------------------

function buildControllerBrief(ctx: CopilotContext): NarrativeBrief {
  const es = ctx.executiveSummary;
  const fc = ctx.completionForecast;
  const entity = ctx.heatmap?.find(
    (e) => e.entityCode === ctx.entityCode && e.fiscalYear === ctx.fiscalYear && e.periodNumber === ctx.periodNumber,
  );
  const defects = ctx.defectQueue?.filter((d) => d.entityCode === ctx.entityCode) ?? [];
  const critAlerts = ctx.alerts?.filter(
    (a) => a.entityCode === ctx.entityCode && (a.alertSeverity === "critical" || a.alertSeverity === "high"),
  ) ?? [];

  const riskColor = entity?.riskColor ?? "GREEN";
  const riskScore = entity?.compositeRiskScore ?? 0;
  const completionPct = es?.completionPct ?? fc?.completionPct ?? 0;
  const slaStatus = es?.slaStatus ?? "ON_TRACK";

  const sections: NarrativeSection[] = [];
  const takeaways: string[] = [];
  const riskItems: NarrativeBrief["riskItems"] = [];

  // Summary
  const summary = `${ctx.entityCode} FY${ctx.fiscalYear} P${ctx.periodNumber} close is at ${riskLabel(riskColor)} ` +
    `with a composite risk score of ${riskScore}/100. Completion stands at ${fmtPct(completionPct)} and ${slaLabel(slaStatus)}.`;

  // Section 1: Close Progress
  sections.push({
    heading: "Close Progress",
    paragraphs: [
      `The period close for ${ctx.entityCode} is ${fmtPct(completionPct)} complete. ` +
        `${fc?.totalTasks ?? "N/A"} total tasks are tracked, with ${fc?.satisfiedCount ?? 0} satisfied, ` +
        `${fc?.blockedCount ?? 0} blocked, and ${fc?.failedCount ?? 0} failed.`,
      fc?.forecastAssessment
        ? `Forecast assessment: ${fc.forecastAssessment.replace(/_/g, " ")}. ` +
          `Hard close buffer: ${fmtHours(fc.hardBufferHours)}. ` +
          `Breach probability: ${fmtPct(fc.hardBreachPct)}.`
        : "No forecast data available for this period.",
    ],
    keyMetrics: [
      { label: "Completion", value: fmtPct(completionPct), trend: completionPct >= 80 ? "up" : "down" },
      { label: "Blocked Tasks", value: String(fc?.blockedCount ?? 0), trend: (fc?.blockedCount ?? 0) > 0 ? "down" : "flat" },
      { label: "Breach Probability", value: fmtPct(fc?.hardBreachPct), trend: (fc?.hardBreachPct ?? 0) > 50 ? "down" : "up" },
    ],
  });

  // Section 2: Risk & Exceptions
  const totalOverrides = es?.totalOverrides ?? entity?.totalOverrides ?? 0;
  const critExceptions = es?.criticalExceptions ?? entity?.criticalExceptions ?? 0;
  const openExceptions = es?.openExceptions ?? entity?.openExceptions ?? 0;

  sections.push({
    heading: "Risk & Exceptions",
    paragraphs: [
      `${totalOverrides} override${totalOverrides !== 1 ? "s" : ""} are active ` +
        `with a combined impact of ${es?.overrideImpactTotal ?? entity?.overrideImpactTotal ?? "0"}.`,
      `${openExceptions} exception${openExceptions !== 1 ? "s" : ""} remain open, ` +
        `of which ${critExceptions} are critical.`,
      critAlerts.length > 0
        ? `${critAlerts.length} critical/high alerts require attention: ${critAlerts.slice(0, 3).map((a) => a.alertTitle).join("; ")}.`
        : "No critical or high alerts active.",
    ],
    keyMetrics: [
      { label: "Overrides", value: String(totalOverrides) },
      { label: "Open Exceptions", value: String(openExceptions) },
      { label: "Critical Exceptions", value: String(critExceptions), trend: critExceptions > 0 ? "down" : "flat" },
    ],
    severity: critExceptions > 0 ? "critical" : totalOverrides > 5 ? "high" : "info",
  });

  // Section 3: Defect Queue & Remediation
  const critDefects = defects.filter((d) => d.severity === "critical");
  const pendingRemediation = es?.remediationPending ?? 0;

  sections.push({
    heading: "Defect Queue & Remediation",
    paragraphs: [
      `${defects.length} item${defects.length !== 1 ? "s" : ""} in the defect queue. ` +
        `${critDefects.length} critical, ${defects.filter((d) => d.severity === "high").length} high severity.`,
      defects.length > 0
        ? `Top defect: ${defects[0].policyName} (score: ${defects[0].queuePriorityScore}, pending ${defects[0].hoursPending.toFixed(1)}h).`
        : "Defect queue is clear.",
      `${pendingRemediation} remediation action${pendingRemediation !== 1 ? "s" : ""} pending.`,
    ],
    keyMetrics: [
      { label: "Defect Queue", value: String(defects.length) },
      { label: "Critical Defects", value: String(critDefects.length) },
      { label: "Pending Remediation", value: String(pendingRemediation) },
    ],
    severity: critDefects.length > 0 ? "high" : "info",
  });

  // Section 4: Document Health
  const docRating = es?.docHealthRating ?? entity?.docHealthRating ?? "N/A";
  const docScore = es?.docHealthScore ?? entity?.docHealthScore ?? "N/A";

  sections.push({
    heading: "Document Health",
    paragraphs: [
      `Document health rating: ${docRating} (score: ${docScore}).`,
      docRating === "RED"
        ? "Document health is critical — review required before certification."
        : docRating === "AMBER"
          ? "Document health is moderate — some gaps may need attention."
          : "Document health is satisfactory.",
    ],
    keyMetrics: [
      { label: "Doc Health", value: String(docRating) },
      { label: "Doc Score", value: String(docScore) },
    ],
    severity: docRating === "RED" ? "high" : docRating === "AMBER" ? "medium" : "info",
  });

  // Takeaways
  if (riskColor === "RED" || riskColor === "AMBER") {
    takeaways.push(`Entity is rated ${riskColor} — escalation may be required.`);
  }
  if (critDefects.length > 0) {
    takeaways.push(`${critDefects.length} critical defects need immediate resolution.`);
  }
  if ((fc?.hardBreachPct ?? 0) >= 50) {
    takeaways.push(`Hard close breach probability is ${fmtPct(fc?.hardBreachPct)} — timeline action needed.`);
  }
  if (critExceptions > 0) {
    takeaways.push(`${critExceptions} critical exceptions must be resolved before certification.`);
  }
  if (takeaways.length === 0) {
    takeaways.push("Close is progressing within normal parameters.");
  }

  // Risk items
  if (critExceptions > 0) riskItems.push({ severity: "critical", title: "Critical Exceptions", detail: `${critExceptions} critical exceptions open` });
  if (critDefects.length > 0) riskItems.push({ severity: "critical", title: "Critical Defects", detail: `${critDefects.length} critical defects pending` });
  if ((fc?.hardBreachPct ?? 0) >= 70) riskItems.push({ severity: "critical", title: "SLA Breach Risk", detail: `${fmtPct(fc?.hardBreachPct)} breach probability` });
  critAlerts.slice(0, 3).forEach((a) => riskItems.push({ severity: a.alertSeverity, title: a.alertTitle, detail: a.alertDetail ?? "" }));

  return {
    audience: "CONTROLLER",
    title: `Controller Close Brief — ${ctx.entityCode} P${ctx.periodNumber} FY${ctx.fiscalYear}`,
    entityCode: ctx.entityCode,
    fiscalYear: ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
    generatedAt: now(),
    deterministic: true,
    summary,
    sections,
    takeaways,
    riskItems,
  };
}

// ---------------------------------------------------------------------------
// CFO Briefing
// ---------------------------------------------------------------------------

function buildCfoBrief(ctx: CopilotContext): NarrativeBrief {
  const es = ctx.executiveSummary;
  const brief = ctx.executiveBrief;
  const breachForecasts = ctx.breachForecasts ?? [];
  const heatmap = ctx.heatmap ?? [];
  const atlas = ctx.atlasDashboard;

  const completionPct = es?.completionPct ?? 0;
  const slaStatus = es?.slaStatus ?? "ON_TRACK";
  const readiness = es?.readinessScore ?? brief?.readinessScore ?? 0;

  const sections: NarrativeSection[] = [];
  const takeaways: string[] = [];
  const riskItems: NarrativeBrief["riskItems"] = [];

  // Summary — high-level, executive tone
  const summary = brief?.paragraphs?.join(" ") ??
    `Period ${ctx.periodNumber} FY${ctx.fiscalYear} close for ${ctx.entityCode}: ` +
    `readiness score ${readiness}, ${fmtPct(completionPct)} complete, ${slaLabel(slaStatus)}.`;

  // Section 1: Portfolio Risk Overview
  const redEntities = heatmap.filter((e) => e.riskColor === "RED");
  const amberEntities = heatmap.filter((e) => e.riskColor === "AMBER");
  const criticalBreaches = breachForecasts.filter((f) => f.riskTier === "CRITICAL");

  sections.push({
    heading: "Portfolio Risk Overview",
    paragraphs: [
      `Across the close portfolio, ${redEntities.length} entit${redEntities.length === 1 ? "y is" : "ies are"} rated RED ` +
        `and ${amberEntities.length} rated AMBER.`,
      criticalBreaches.length > 0
        ? `${criticalBreaches.length} entit${criticalBreaches.length === 1 ? "y is" : "ies are"} at CRITICAL risk of missing hard close: ` +
          `${criticalBreaches.slice(0, 3).map((f) => `${f.entityCode} (${f.hardCloseBreachPct}%)`).join(", ")}.`
        : "No entities are at critical risk of missing hard close.",
    ],
    keyMetrics: [
      { label: "RED Entities", value: String(redEntities.length), trend: redEntities.length > 0 ? "down" : "flat" },
      { label: "AMBER Entities", value: String(amberEntities.length) },
      { label: "Critical Breach Risk", value: String(criticalBreaches.length) },
    ],
    severity: redEntities.length > 0 ? "critical" : amberEntities.length > 0 ? "high" : "info",
  });

  // Section 2: Key Metrics
  sections.push({
    heading: "Key Performance Indicators",
    paragraphs: [
      `Readiness score: ${readiness}. Overall completion: ${fmtPct(completionPct)}.`,
      `Override posture: ${es?.totalOverrides ?? 0} overrides with impact of ${es?.overrideImpactTotal ?? "0"}.`,
      `Exceptions: ${es?.openExceptions ?? 0} open (${es?.criticalExceptions ?? 0} critical).`,
    ],
    keyMetrics: [
      { label: "Readiness", value: String(readiness) },
      { label: "Completion", value: fmtPct(completionPct) },
      { label: "SLA Status", value: slaStatus },
    ],
  });

  // Section 3: Predictive Intelligence
  if (atlas) {
    const riskScore = atlas.compositeRisk?.score ?? 0;
    const topRecs = atlas.recommendations?.items?.slice(0, 3) ?? [];

    sections.push({
      heading: "Predictive Intelligence",
      paragraphs: [
        atlas.narratives?.cfoBrief ?? `Composite risk score: ${riskScore}. ${topRecs.length} active recommendations.`,
        topRecs.length > 0
          ? `Top recommendations: ${topRecs.map((r) => `${r.title} (${r.priority})`).join("; ")}.`
          : "No active recommendations.",
      ],
      keyMetrics: [
        { label: "Composite Risk", value: String(riskScore) },
        { label: "Active Recommendations", value: String(topRecs.length) },
      ],
    });
  }

  // Section 4: Attention Items
  const attentionItems = brief?.attentionItems ?? [];
  if (attentionItems.length > 0) {
    sections.push({
      heading: "Items Requiring CFO Attention",
      paragraphs: attentionItems.map((a) => `[${a.severity.toUpperCase()}] ${a.title}: ${a.detail}`),
      severity: attentionItems.some((a) => a.severity === "critical") ? "critical" : "high",
    });
  }

  // Takeaways
  if (redEntities.length > 0) takeaways.push(`${redEntities.length} entities at RED risk — executive intervention recommended.`);
  if (criticalBreaches.length > 0) takeaways.push(`${criticalBreaches.length} entities at critical breach risk.`);
  if (slaStatus === "BREACHED") takeaways.push("SLA has been breached — root cause review required.");
  if (takeaways.length === 0) takeaways.push("Close is progressing within acceptable parameters across the portfolio.");

  // Risk items
  redEntities.slice(0, 3).forEach((e) => riskItems.push({ severity: "critical", title: `${e.entityCode} rated RED`, detail: `Risk score: ${e.compositeRiskScore}` }));
  criticalBreaches.slice(0, 3).forEach((f) => riskItems.push({ severity: "critical", title: `${f.entityCode} breach risk`, detail: `${f.hardCloseBreachPct}% probability` }));
  attentionItems.filter((a) => a.severity === "critical").forEach((a) => riskItems.push({ severity: "critical", title: a.title, detail: a.detail }));

  return {
    audience: "CFO",
    title: `CFO Close Briefing — P${ctx.periodNumber} FY${ctx.fiscalYear}`,
    entityCode: ctx.entityCode,
    fiscalYear: ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
    generatedAt: now(),
    deterministic: true,
    summary,
    sections,
    takeaways,
    riskItems,
  };
}

// ---------------------------------------------------------------------------
// Audit Committee Summary
// ---------------------------------------------------------------------------

function buildAuditCommitteeBrief(ctx: CopilotContext): NarrativeBrief {
  const es = ctx.executiveSummary;
  const delta = ctx.packDelta;
  const entity = ctx.heatmap?.find(
    (e) => e.entityCode === ctx.entityCode && e.fiscalYear === ctx.fiscalYear && e.periodNumber === ctx.periodNumber,
  );
  const defects = ctx.defectQueue?.filter((d) => d.entityCode === ctx.entityCode) ?? [];

  const sections: NarrativeSection[] = [];
  const takeaways: string[] = [];
  const riskItems: NarrativeBrief["riskItems"] = [];

  const summary = `Audit Committee close report for ${ctx.entityCode} P${ctx.periodNumber} FY${ctx.fiscalYear}. ` +
    `Close completion: ${fmtPct(es?.completionPct)}. Readiness: ${es?.readinessScore ?? "N/A"}. ` +
    `${es?.openExceptions ?? 0} exceptions open, ${es?.totalOverrides ?? 0} overrides active.`;

  // Section 1: Control Environment
  sections.push({
    heading: "Control Environment Assessment",
    paragraphs: [
      `${es?.totalOverrides ?? 0} overrides active with combined impact of ${es?.overrideImpactTotal ?? "0"}. ` +
        `Override posture represents ${(es?.totalOverrides ?? 0) > 5 ? "elevated" : "normal"} control bypass activity.`,
      `${es?.openExceptions ?? 0} exceptions remain open, ${es?.criticalExceptions ?? 0} classified as critical. ` +
        `All critical exceptions require resolution before certification sign-off.`,
      `Document health: ${es?.docHealthRating ?? "N/A"} (score: ${es?.docHealthScore ?? "N/A"}). ` +
        `${(es?.docHealthRating === "RED") ? "Documentation gaps may impair audit trail completeness." : "Documentation is within acceptable levels."}`,
    ],
    keyMetrics: [
      { label: "Overrides", value: String(es?.totalOverrides ?? 0) },
      { label: "Override Impact", value: String(es?.overrideImpactTotal ?? "0") },
      { label: "Open Exceptions", value: String(es?.openExceptions ?? 0) },
      { label: "Doc Health", value: String(es?.docHealthRating ?? "N/A") },
    ],
    severity: (es?.criticalExceptions ?? 0) > 0 ? "critical" : (es?.totalOverrides ?? 0) > 5 ? "high" : "info",
  });

  // Section 2: Defect & Remediation Governance
  sections.push({
    heading: "Defect & Remediation Governance",
    paragraphs: [
      `${defects.length} items in the defect queue. ` +
        `${defects.filter((d) => d.severity === "critical").length} critical, ` +
        `${defects.filter((d) => d.severity === "high").length} high severity.`,
      `${es?.remediationPending ?? 0} remediation actions pending. ` +
        `${(es?.remediationPending ?? 0) > 3 ? "Remediation backlog may delay certification timeline." : "Remediation is within normal cadence."}`,
    ],
    keyMetrics: [
      { label: "Defect Queue", value: String(defects.length) },
      { label: "Pending Remediation", value: String(es?.remediationPending ?? 0) },
    ],
  });

  // Section 3: Material Changes (if delta available)
  if (delta?.hasChanges) {
    const paragraphs: string[] = [];
    if (delta.glChanges && delta.glChanges.changed_accounts > 0) {
      paragraphs.push(
        `${delta.glChanges.changed_accounts} GL accounts changed since last snapshot. ` +
          `P&L changes: ${delta.glChanges.pnl_changes}, Balance Sheet changes: ${delta.glChanges.bs_changes}.`,
      );
    }
    if (delta.materiality?.hasMaterialChanges) {
      paragraphs.push(
        `Material changes detected: risk level ${delta.materiality.riskLevel}. ` +
          `${delta.materiality.insights.join(" ")}`,
      );
    }
    if (delta.overrideChanges && delta.overrideChanges.new_overrides > 0) {
      paragraphs.push(
        `${delta.overrideChanges.new_overrides} new overrides since last snapshot ` +
          `(impact: ${delta.overrideChanges.new_override_impact.toLocaleString()}).`,
      );
    }
    if (paragraphs.length > 0) {
      sections.push({
        heading: "Material Changes Since Last Review",
        paragraphs,
        severity: delta.materiality?.riskLevel === "high" ? "high" : "medium",
      });
    }
  }

  // Section 4: Risk Signals
  const activeSignals = entity?.activeSignalCount ?? 0;
  const critSignals = entity?.criticalSignalCount ?? 0;

  if (activeSignals > 0) {
    sections.push({
      heading: "Active Risk Signals",
      paragraphs: [
        `${activeSignals} risk signals active, ${critSignals} at critical level.`,
        entity?.topBottleneckTask
          ? `Primary bottleneck: "${entity.topBottleneckTask}" (pattern: ${entity.bottleneckPattern ?? "unknown"}).`
          : "No persistent bottleneck pattern identified.",
      ],
      keyMetrics: [
        { label: "Active Signals", value: String(activeSignals) },
        { label: "Critical Signals", value: String(critSignals) },
      ],
      severity: critSignals > 0 ? "critical" : "medium",
    });
  }

  // Takeaways
  if ((es?.criticalExceptions ?? 0) > 0) takeaways.push(`${es!.criticalExceptions} critical exceptions require resolution — certification blocked.`);
  if ((es?.totalOverrides ?? 0) > 5) takeaways.push(`Override volume (${es!.totalOverrides}) exceeds typical threshold — review control bypass posture.`);
  if (delta?.materiality?.riskLevel === "high") takeaways.push("Material GL changes detected — substantive review recommended.");
  if (takeaways.length === 0) takeaways.push("Control environment is within acceptable parameters for the current close cycle.");

  // Risk items
  if ((es?.criticalExceptions ?? 0) > 0) riskItems.push({ severity: "critical", title: "Critical Exceptions", detail: `${es!.criticalExceptions} unresolved` });
  if ((es?.totalOverrides ?? 0) > 5) riskItems.push({ severity: "high", title: "Override Volume", detail: `${es!.totalOverrides} active` });
  if (delta?.materiality?.riskLevel === "high") riskItems.push({ severity: "high", title: "Material Changes", detail: delta.materiality.insights[0] ?? "Material GL changes" });

  return {
    audience: "AUDIT_COMMITTEE",
    title: `Audit Committee Close Summary — ${ctx.entityCode} P${ctx.periodNumber} FY${ctx.fiscalYear}`,
    entityCode: ctx.entityCode,
    fiscalYear: ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
    generatedAt: now(),
    deterministic: true,
    summary,
    sections,
    takeaways,
    riskItems,
  };
}

// ---------------------------------------------------------------------------
// Board Close Summary
// ---------------------------------------------------------------------------

function buildBoardBrief(ctx: CopilotContext): NarrativeBrief {
  const es = ctx.executiveSummary;
  const brief = ctx.executiveBrief;
  const heatmap = ctx.heatmap ?? [];
  const breachForecasts = ctx.breachForecasts ?? [];

  const sections: NarrativeSection[] = [];
  const takeaways: string[] = [];
  const riskItems: NarrativeBrief["riskItems"] = [];

  const redCount = heatmap.filter((e) => e.riskColor === "RED").length;
  const greenCount = heatmap.filter((e) => e.riskColor === "GREEN").length;
  const totalEntities = heatmap.length || 1;
  const greenPct = Math.round((greenCount / totalEntities) * 100);

  const summary = `Board close summary for P${ctx.periodNumber} FY${ctx.fiscalYear}. ` +
    `${greenPct}% of entities are GREEN (${greenCount}/${totalEntities}). ` +
    `${redCount > 0 ? `${redCount} entit${redCount === 1 ? "y" : "ies"} require attention.` : "No entities at elevated risk."}`;

  // Section 1: Close Health (high-level, minimal detail)
  sections.push({
    heading: "Close Health Summary",
    paragraphs: [
      `The financial close for period ${ctx.periodNumber} is ${fmtPct(es?.completionPct)} complete ` +
        `with a readiness score of ${es?.readinessScore ?? "N/A"}.`,
      `${slaLabel(es?.slaStatus)}. ` +
        `${redCount > 0 ? `Management attention is directed at ${redCount} elevated-risk entities.` : "All entities are progressing within acceptable timelines."}`,
    ],
    keyMetrics: [
      { label: "Completion", value: fmtPct(es?.completionPct) },
      { label: "GREEN Entities", value: `${greenCount}/${totalEntities}` },
      { label: "SLA Status", value: es?.slaStatus ?? "N/A" },
    ],
  });

  // Section 2: Risk Exposure (minimal, board-appropriate)
  const critBreaches = breachForecasts.filter((f) => f.riskTier === "CRITICAL");
  sections.push({
    heading: "Risk Exposure",
    paragraphs: [
      `${es?.totalOverrides ?? 0} control overrides active (impact: ${es?.overrideImpactTotal ?? "0"}).`,
      `${es?.openExceptions ?? 0} exceptions open, ${es?.criticalExceptions ?? 0} critical.`,
      critBreaches.length > 0
        ? `${critBreaches.length} entit${critBreaches.length === 1 ? "y faces" : "ies face"} potential SLA breach.`
        : "No entities at risk of SLA breach.",
    ],
    keyMetrics: [
      { label: "Overrides", value: String(es?.totalOverrides ?? 0) },
      { label: "Critical Exceptions", value: String(es?.criticalExceptions ?? 0) },
      { label: "Breach Risk Entities", value: String(critBreaches.length) },
    ],
    severity: redCount > 0 ? "high" : "info",
  });

  // Section 3: Management Actions (if attention items exist)
  const attentionItems = brief?.attentionItems ?? [];
  if (attentionItems.length > 0) {
    sections.push({
      heading: "Management Actions in Progress",
      paragraphs: [
        `${attentionItems.length} item${attentionItems.length !== 1 ? "s" : ""} flagged for management attention:`,
        ...attentionItems.slice(0, 5).map((a) => `${a.title}: ${a.detail}`),
      ],
    });
  }

  // Takeaways — board-level, concise
  if (redCount === 0 && (es?.criticalExceptions ?? 0) === 0) {
    takeaways.push("Close is progressing normally with no board-level escalations required.");
  } else {
    if (redCount > 0) takeaways.push(`${redCount} entities at elevated risk — management is actively remediating.`);
    if ((es?.criticalExceptions ?? 0) > 0) takeaways.push(`${es!.criticalExceptions} critical exceptions under active management review.`);
    if (critBreaches.length > 0) takeaways.push(`SLA breach risk exists for ${critBreaches.length} entities — mitigation plans in place.`);
  }

  // Risk items
  if (redCount > 0) riskItems.push({ severity: "high", title: "Elevated Risk Entities", detail: `${redCount} entities rated RED` });
  if (critBreaches.length > 0) riskItems.push({ severity: "high", title: "SLA Breach Risk", detail: `${critBreaches.length} entities at critical tier` });

  return {
    audience: "BOARD",
    title: `Board Close Summary — P${ctx.periodNumber} FY${ctx.fiscalYear}`,
    entityCode: ctx.entityCode,
    fiscalYear: ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
    generatedAt: now(),
    deterministic: true,
    summary,
    sections,
    takeaways,
    riskItems,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a narrative brief for the specified audience.
 * Pure function — no LLM, template-based, deterministic.
 */
export function buildNarrativeBrief(
  audience: NarrativeAudience,
  ctx: CopilotContext,
): NarrativeBrief {
  switch (audience) {
    case "CONTROLLER":
      return buildControllerBrief(ctx);
    case "CFO":
      return buildCfoBrief(ctx);
    case "AUDIT_COMMITTEE":
      return buildAuditCommitteeBrief(ctx);
    case "BOARD":
      return buildBoardBrief(ctx);
    default:
      return buildControllerBrief(ctx);
  }
}

/**
 * Build all 4 narrative briefs at once (for full pack export).
 */
export function buildNarrativePack(ctx: CopilotContext): NarrativeBrief[] {
  return [
    buildControllerBrief(ctx),
    buildCfoBrief(ctx),
    buildAuditCommitteeBrief(ctx),
    buildBoardBrief(ctx),
  ];
}
