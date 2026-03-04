// framework/runtime/src/services/business/engines/decision-grid/domain/composite-scoring.ts

import { DEFAULT_SCORE_THRESHOLDS } from "./types.js";

import type {
  PolicyDecision,
  WorkflowPath,
  CompositeScoreThresholds,
} from "./types.js";

/**
 * Calculate composite score from policy decisions.
 * Weighted average of all module scores.
 */
export function calculateCompositeScore(decisions: PolicyDecision[]): number {
  if (decisions.length === 0) return 1.0; // No policies = fully approved

  // Any BLOCK action → score = 0
  if (decisions.some((d) => d.action === "BLOCK")) return 0;

  // Weighted average
  const totalScore = decisions.reduce((sum, d) => sum + d.score, 0);
  return Math.round((totalScore / decisions.length) * 100) / 100;
}

/**
 * Map composite score to workflow path.
 */
export function scoreToWorkflowPath(
  score: number,
  thresholds: CompositeScoreThresholds = DEFAULT_SCORE_THRESHOLDS,
): WorkflowPath {
  if (score >= thresholds.zeroApprovalMin) return "ZERO_APPROVAL";
  if (score >= thresholds.standardMin) return "STANDARD";
  if (score >= thresholds.enhancedMin) return "ENHANCED";
  if (score >= thresholds.executiveMin) return "EXECUTIVE";
  return "BLOCKED";
}

/**
 * Determine the most restrictive action from all policy decisions.
 */
export function determineMostRestrictiveAction(
  decisions: PolicyDecision[],
): PolicyDecision["action"] {
  const priority: Record<string, number> = {
    BLOCK: 0,
    ESCALATE: 1,
    REVIEW: 2,
    APPROVE: 3,
  };

  let mostRestrictive: PolicyDecision["action"] = "APPROVE";
  let minPriority = priority["APPROVE"]!;

  for (const d of decisions) {
    const p = priority[d.action] ?? 3;
    if (p < minPriority) {
      minPriority = p;
      mostRestrictive = d.action;
    }
  }

  return mostRestrictive;
}

/**
 * Aggregate approvers from all policy decisions (deduplicated).
 */
export function aggregateApprovers(
  decisions: PolicyDecision[],
): PolicyDecision["approvers"] {
  const seen = new Set<string>();
  const approvers: PolicyDecision["approvers"] = [];

  for (const d of decisions) {
    for (const a of d.approvers) {
      if (!seen.has(a.userId)) {
        seen.add(a.userId);
        approvers.push(a);
      }
    }
  }

  // Sort by level (highest authority first)
  return approvers.sort((a, b) => b.level - a.level);
}

/**
 * Calculate maximum SLA from policy decisions.
 */
export function calculateMaxSla(decisions: PolicyDecision[]): number {
  return Math.max(...decisions.map((d) => d.slaHours), 0);
}
