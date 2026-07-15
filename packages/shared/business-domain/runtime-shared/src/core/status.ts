import type { SemanticIntent } from "@athyper/theme/semantic-colors";

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

/**
 * Map a raw status value to a canonical SemanticIntent token.
 *
 * Normalises the input (lowercase, spaces/hyphens → underscores) before
 * matching so callers don't need to pre-process the value.
 */
export function statusToIntent(raw: unknown): SemanticIntent {
  if (typeof raw !== "string") return "neutral";
  const key = raw.toLowerCase().replace(/[\s-]/g, "_");
  if (POSITIVE.has(key)) return "success";
  if (IN_FLIGHT.has(key)) return "warning";
  if (NEGATIVE.has(key)) return "error";
  if (key === "draft") return "info";
  return "neutral";
}
