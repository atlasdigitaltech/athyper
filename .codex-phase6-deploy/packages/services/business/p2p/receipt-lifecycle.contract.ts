import { defineLifecycle, type P2pEdge } from "./lifecycle-contract.js";

export const RECEIPT_STATES = ["draft", "pending_approval", "approved", "posted", "reversed", "cancelled"] as const;
export type ReceiptState = typeof RECEIPT_STATES[number];

const edges = [
  ["draft.submit", "draft", "submit", "pending_approval", "authoring_lock", "start"],
  ["draft.cancel", "draft", "cancel", "cancelled", "reversal"],
  ["pending.approve", "pending_approval", "approve", "approved", "commitment", "decision"],
  ["pending.amend", "pending_approval", "amend", "draft", "amendment_baseline", "decision"],
  ["pending.cancel", "pending_approval", "cancel", "cancelled", "reversal", "cancel"],
  ["approved.post", "approved", "post", "posted", "financial_post", "none", "FULFILLMENT"],
  ["approved.cancel", "approved", "cancel", "cancelled", "reversal"],
  ["posted.reverse", "posted", "reverse", "reversed", "reversal", "none", "REVERSAL"],
] as const satisfies readonly P2pEdge<ReceiptState>[];

export const RECEIPT_TRANSITIONS = defineLifecycle("receipt", edges);
