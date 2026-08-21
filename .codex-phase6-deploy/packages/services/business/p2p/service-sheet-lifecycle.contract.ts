import { defineLifecycle, type P2pEdge } from "./lifecycle-contract.js";

export const SERVICE_SHEET_STATES = ["draft", "pending_acceptance", "accepted", "pending_approval", "approved", "posted", "reversed", "cancelled"] as const;
export type ServiceSheetState = typeof SERVICE_SHEET_STATES[number];

const edges = [
  ["draft.submit_acceptance", "draft", "submit_for_acceptance", "pending_acceptance", "authoring_lock"],
  ["draft.cancel", "draft", "cancel", "cancelled", "reversal"],
  ["acceptance.accept", "pending_acceptance", "accept", "accepted", "commitment"],
  ["acceptance.reject", "pending_acceptance", "reject_acceptance", "draft", "amendment_baseline"],
  ["accepted.submit", "accepted", "submit", "pending_approval", "authoring_lock", "start"],
  ["pending.approve", "pending_approval", "approve", "approved", "commitment", "decision"],
  ["pending.amend", "pending_approval", "amend", "draft", "amendment_baseline", "decision"],
  ["pending.cancel", "pending_approval", "cancel", "cancelled", "reversal", "cancel"],
  ["approved.post", "approved", "post", "posted", "financial_post", "none", "FULFILLMENT"],
  ["approved.cancel", "approved", "cancel", "cancelled", "reversal"],
  ["posted.reverse", "posted", "reverse", "reversed", "reversal", "none", "REVERSAL"],
] as const satisfies readonly P2pEdge<ServiceSheetState>[];

export const SERVICE_SHEET_TRANSITIONS = defineLifecycle("service_sheet", edges);
