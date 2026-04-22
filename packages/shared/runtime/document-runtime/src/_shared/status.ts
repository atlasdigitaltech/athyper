/**
 * Shared status-to-intent logic — internal to document-runtime.
 *
 * Single source of truth for the status sets and statusToIntent() used by
 * buildApprovableHeaderFromRecord, buildOrchestratorFromRecord, and
 * ProcessChainRibbon. Previously three independent implementations.
 */

export type StatusIntent = "success" | "warning" | "error" | "info" | "neutral";

export const POSITIVE = new Set([
  "approved", "posted", "paid", "fully_paid", "completed", "cleared",
  "active", "closed", "settled", "matched", "fully_matched",
]);

export const IN_FLIGHT = new Set([
  "pending", "submitted", "in_review", "pending_approval", "partially_paid",
  "partially_matched", "partially_cleared", "open", "in_progress",
]);

export const NEGATIVE = new Set([
  "rejected", "cancelled", "reversed", "voided", "overdue", "failed",
  "on_hold", "blocked", "suspended",
]);

/** Map a raw status value to a semantic intent token.
 *
 *  Normalises the input (lowercase, spaces/hyphens → underscores) before
 *  matching against the canonical status sets so callers don't need to
 *  pre-process the value. */
export function statusToIntent(raw: unknown): StatusIntent {
  if (typeof raw !== "string") return "neutral";
  const key = raw.toLowerCase().replace(/[\s-]/g, "_");
  if (POSITIVE.has(key)) return "success";
  if (IN_FLIGHT.has(key)) return "warning";
  if (NEGATIVE.has(key)) return "error";
  if (key === "draft") return "info";
  return "neutral";
}
