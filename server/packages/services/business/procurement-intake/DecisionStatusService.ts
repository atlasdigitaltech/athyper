/**
 * DecisionStatusService — derives classification_decision.status from
 * the assembled pipeline output.
 *
 * Status state machine (§4.2 of implementation plan):
 *   blocked      — hard gates: DENY mapping, missing required fields,
 *                  FAILED intent with no category fallback, asset without category
 *   needs_review — soft gates: low confidence, user override, restricted intent,
 *                  CAPEX threshold breached, profile FAILED with category default
 *   resolved     — all gates clear, confidence ≥ 0.70
 */

import type { ClassificationDecision } from "./ClassificationDecision.zod.js";

export interface DerivedFields {
  taxGroupId:      string | null;
  whtGroupId:      string | null;
  costCenterId:    string | null;
  profitCenterId:  string | null;
  isAsset:         boolean;
  assetCategoryId: string | null;
  isCrossBorder:   boolean;
  isIntercompany:  boolean;
}

export type DecisionStatus = ClassificationDecision["status"];

export function computeDecisionStatus(
  d:       ClassificationDecision,
  derived: DerivedFields,
): DecisionStatus {

  // ── Hard blockers ─────────────────────────────────────────────────────────

  if (d.blockers.length > 0) return "blocked";

  if (d.policy.mapping_mode === "DENY") return "blocked";

  if (d.policy.classification_required && !d.selected.commodity_category_id) return "blocked";

  if (d.policy.hs_required && !d.selected.line_commodity_code) return "blocked";

  if (derived.isAsset && !derived.assetCategoryId) return "blocked";

  // Intent FAILED with no fallback is a hard block
  if (
    d.resolved.intent_method === "FAILED" &&
    d.resolved.domain == null
  ) return "blocked";

  // ── Needs-review triggers ─────────────────────────────────────────────────

  const lowConfidence    = d.resolved.confidence < 0.70;
  const hasOverride      = d.overrides.length > 0;
  const restrictedIntent = d.policy.visibility === "RESTRICTED";
  const capexBreach      = d.policy.capex_threshold_breached;
  const profileFailed    = d.resolved.profile_method === "FAILED";

  if (lowConfidence || hasOverride || restrictedIntent || capexBreach || profileFailed) {
    return "needs_review";
  }

  return "resolved";
}
