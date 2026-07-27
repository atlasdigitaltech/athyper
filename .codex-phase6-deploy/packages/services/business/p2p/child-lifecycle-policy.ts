export type P2pChildStatusGroup =
  | "editable"
  | "review"
  | "approved_not_posted"
  | "active_or_posted"
  | "terminal";

export type P2pChildAction = "replace" | "read" | "posting_finalize" | "approver_metadata";

const EDITABLE = new Set(["draft", "proforma"]);
const REVIEW = new Set(["pending_approval", "pending_acceptance"]);
const APPROVED_NOT_POSTED = new Set(["approved", "accepted"]);
const ACTIVE_OR_POSTED = new Set([
  "active",
  "posted",
  "partially_converted",
  "fully_converted",
  "partially_fulfilled",
  "fully_fulfilled",
  "partially_paid",
  "fully_paid",
  "on_hold",
]);
const TERMINAL = new Set(["closed", "cancelled", "canceled", "reversed", "expired", "suspended"]);

export function p2pChildStatusGroup(status: string): P2pChildStatusGroup {
  if (EDITABLE.has(status)) return "editable";
  if (REVIEW.has(status)) return "review";
  if (APPROVED_NOT_POSTED.has(status)) return "approved_not_posted";
  if (ACTIVE_OR_POSTED.has(status)) return "active_or_posted";
  if (TERMINAL.has(status)) return "terminal";

  // Rejected must be explicitly reopened to draft/revision before child data
  // can change. That keeps maker/checker responsibility clear.
  if (status === "rejected") return "terminal";

  return "terminal";
}

export function canMutateP2pChild(status: string, action: P2pChildAction): boolean {
  if (action === "read") return true;
  if (action === "approver_metadata") return p2pChildStatusGroup(status) === "review";
  if (action === "posting_finalize") return p2pChildStatusGroup(status) === "approved_not_posted";
  return p2pChildStatusGroup(status) === "editable";
}

export function assertP2pChildReplaceAllowed(status: string, childLabel: string): void {
  if (canMutateP2pChild(status, "replace")) return;
  throw new Error(
    `CHILD_NOT_EDITABLE: ${childLabel} is governed by parent status '${status}'. `
    + "Request revision/reopen to draft before changing child data.",
  );
}
