import { defineLifecycle, type P2pEdge } from "./lifecycle-contract.js";

export const PAYMENT_ENTRY_STATES = ["draft", "pending_approval", "approved", "posted", "transmitted", "printed", "cleared", "reversed", "voided", "cancelled", "rejected"] as const;
export type PaymentEntryState = typeof PAYMENT_ENTRY_STATES[number];

const edges = [
  ["draft.submit", "draft", "submit", "pending_approval", "authoring_lock", "start"],
  ["draft.cancel", "draft", "cancel", "cancelled", "reversal"],
  ["pending.approve", "pending_approval", "approve", "approved", "commitment", "decision"],
  ["pending.deny", "pending_approval", "deny", "rejected", "reversal", "decision"],
  ["pending.amend", "pending_approval", "amend", "draft", "reversal", "decision"],
  ["rejected.amend", "rejected", "amend", "draft", "reversal"],
  ["approved.cancel", "approved", "cancel", "cancelled", "reversal"],
  ["approved.post", "approved", "post", "posted", "financial_post", "none", "SETTLEMENT"],
  ["posted.transmit", "posted", "transmit", "transmitted", "commitment"],
  ["posted.print", "posted", "print", "printed", "commitment"],
  ["posted.reverse", "posted", "reverse", "reversed", "reversal", "none", "REVERSAL"],
  ["posted.void", "posted", "void", "voided", "reversal", "none", "REVERSAL"],
  ["transmitted.clear", "transmitted", "clear", "cleared", "financial_post"],
  ["printed.clear", "printed", "clear", "cleared", "financial_post"],
] as const satisfies readonly P2pEdge<PaymentEntryState>[];

export const PAYMENT_ENTRY_TRANSITIONS = defineLifecycle("payment_entry", edges);
