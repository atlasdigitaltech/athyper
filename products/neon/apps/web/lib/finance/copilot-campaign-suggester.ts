// lib/finance/copilot-campaign-suggester.ts
//
// Phase 12C: Deterministic Auto-Campaign Suggestion Engine.
// Analyzes defect queue for groupable clusters by actionType,
// scores urgency, and proposes named campaign drafts.
// Campaign constraint: all actions must share the same actionType.

import type { AdvisorDefectQueueItemDTO, CampaignSuggestion } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum cluster size to propose a campaign */
const MIN_CLUSTER_SIZE = 2;

/** Minimum urgency score to surface a suggestion */
const MIN_URGENCY_SCORE = 20;

/** Maximum number of suggestions to return */
const MAX_SUGGESTIONS = 5;

/** Maximum items per campaign suggestion */
const MAX_ITEMS_PER_CAMPAIGN = 25;

// ---------------------------------------------------------------------------
// Urgency scoring weights
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 5,
};

const SLA_BREACH_MULTIPLIER = 0.3;
const HOURS_PENDING_MULTIPLIER = 0.1;
const CLUSTER_SIZE_MULTIPLIER = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a defect queue and propose campaign suggestions.
 * Groups by actionType (the campaign constraint), scores each cluster,
 * and returns ranked suggestions.
 */
export function suggestCampaigns(
  defects: AdvisorDefectQueueItemDTO[],
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
): CampaignSuggestion[] {
  if (!defects || defects.length === 0) return [];

  // Filter to target entity
  const entityDefects = defects.filter((d) => d.entityCode === entityCode);
  if (entityDefects.length === 0) return [];

  // Group by actionType (campaign constraint)
  const byActionType = new Map<string, AdvisorDefectQueueItemDTO[]>();
  for (const d of entityDefects) {
    const group = byActionType.get(d.actionType) ?? [];
    group.push(d);
    byActionType.set(d.actionType, group);
  }

  const suggestions: CampaignSuggestion[] = [];

  for (const [actionType, items] of byActionType) {
    if (items.length < MIN_CLUSTER_SIZE) continue;

    // Sort by priority score descending, take top items
    const sorted = [...items].sort(
      (a, b) => b.queuePriorityScore - a.queuePriorityScore,
    );
    const campaignItems = sorted.slice(0, MAX_ITEMS_PER_CAMPAIGN);

    const criticalCount = campaignItems.filter(
      (d) => d.severity === "critical",
    ).length;
    const highCount = campaignItems.filter(
      (d) => d.severity === "high",
    ).length;
    const avgHoursPending =
      campaignItems.reduce((s, d) => s + d.hoursPending, 0) /
      campaignItems.length;
    const maxSlaBreachPct = Math.max(
      ...campaignItems.map((d) => d.slaBreachPct),
    );

    // Collect unique trigger types
    const triggerTypes = [
      ...new Set(campaignItems.map((d) => d.triggerType)),
    ];

    // Score urgency
    const urgencyScore = computeUrgencyScore(
      campaignItems,
      criticalCount,
      highCount,
      avgHoursPending,
      maxSlaBreachPct,
    );

    if (urgencyScore < MIN_URGENCY_SCORE) continue;

    // Build human-readable campaign name
    const campaignName = buildCampaignName(
      actionType,
      entityCode,
      periodNumber,
      fiscalYear,
      criticalCount,
    );

    // Build rationale
    const rationale = buildRationale(
      campaignItems.length,
      criticalCount,
      highCount,
      actionType,
      avgHoursPending,
      maxSlaBreachPct,
      triggerTypes,
    );

    suggestions.push({
      key: `${actionType}::${entityCode}`,
      actionType,
      entityCode,
      campaignName,
      actionIds: campaignItems.map((d) => d.actionId),
      itemCount: campaignItems.length,
      criticalCount,
      highCount,
      avgHoursPending: Math.round(avgHoursPending * 10) / 10,
      maxSlaBreachPct,
      urgencyScore: Math.round(urgencyScore),
      triggerTypes,
      rationale,
    });
  }

  // Sort by urgency descending, limit
  return suggestions
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, MAX_SUGGESTIONS);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function computeUrgencyScore(
  items: AdvisorDefectQueueItemDTO[],
  criticalCount: number,
  highCount: number,
  avgHoursPending: number,
  maxSlaBreachPct: number,
): number {
  // Base: sum of severity weights
  let score = 0;
  for (const item of items) {
    score += SEVERITY_WEIGHT[item.severity] ?? 5;
  }

  // Cluster size bonus
  score += items.length * CLUSTER_SIZE_MULTIPLIER;

  // SLA breach pressure
  score += maxSlaBreachPct * SLA_BREACH_MULTIPLIER;

  // Aging pressure
  score += Math.min(avgHoursPending, 200) * HOURS_PENDING_MULTIPLIER;

  // Critical mass bonus: if ≥3 critical items, significant boost
  if (criticalCount >= 3) score += 30;
  else if (criticalCount >= 1) score += 15;

  // High count bonus
  if (highCount >= 5) score += 10;

  return score;
}

function buildCampaignName(
  actionType: string,
  entityCode: string,
  periodNumber: number,
  fiscalYear: number,
  criticalCount: number,
): string {
  const readableType = actionType.replace(/_/g, " ");
  const prefix = criticalCount > 0 ? "Urgent" : "Batch";
  return `${prefix} ${readableType} — ${entityCode} P${periodNumber} FY${fiscalYear}`;
}

function buildRationale(
  itemCount: number,
  criticalCount: number,
  highCount: number,
  actionType: string,
  avgHoursPending: number,
  maxSlaBreachPct: number,
  triggerTypes: string[],
): string {
  const parts: string[] = [];

  parts.push(
    `${itemCount} ${actionType.replace(/_/g, " ")} defects detected`,
  );

  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical`);
  }
  if (highCount > 0) {
    parts.push(`${highCount} high severity`);
  }

  if (avgHoursPending > 24) {
    parts.push(`avg ${avgHoursPending.toFixed(1)}h pending`);
  }

  if (maxSlaBreachPct > 50) {
    parts.push(`SLA breach risk up to ${maxSlaBreachPct}%`);
  }

  if (triggerTypes.length > 1) {
    parts.push(
      `across ${triggerTypes.length} trigger types (${triggerTypes.slice(0, 3).map((t) => t.replace(/_/g, " ")).join(", ")})`,
    );
  }

  return parts.join(". ") + ".";
}
