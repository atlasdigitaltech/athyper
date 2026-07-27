import { defineLifecycle, type P2pEdge } from "./lifecycle-contract.js";

export const PURCHASE_INVOICE_STATES = ["draft", "pending_approval", "approved", "posted", "partially_paid", "on_hold", "fully_paid", "rejected", "cancelled", "reversed"] as const;
export type PurchaseInvoiceState = typeof PURCHASE_INVOICE_STATES[number];

const edges = [
  ["draft.submit", "draft", "submit", "pending_approval", "authoring_lock", "start"],
  ["draft.cancel", "draft", "cancel", "cancelled", "reversal"],
  ["pending.approve", "pending_approval", "approve", "approved", "commitment", "decision"],
  ["pending.deny", "pending_approval", "deny", "rejected", "amendment_baseline", "decision"],
  ["pending.amend", "pending_approval", "amend", "draft", "amendment_baseline", "decision"],
  ["rejected.amend", "rejected", "amend", "draft", "amendment_baseline"],
  ["approved.post", "approved", "post", "posted", "financial_post", "none", "INVOICE_MATCHED"],
  ["approved.cancel", "approved", "cancel", "cancelled", "reversal"],
  ["posted.pay", "posted", "pay", "partially_paid"],
  ["partial.pay", "partially_paid", "pay", "fully_paid"],
  ["posted.reverse", "posted", "reverse", "reversed", "reversal", "none", "REVERSAL"],
  ["approved.hold", "approved", "hold", "on_hold"],
  ["posted.hold", "posted", "hold", "on_hold"],
  ["partial.hold", "partially_paid", "hold", "on_hold"],
  ["hold.approved", "on_hold", "release_hold", "approved"],
  ["hold.posted", "on_hold", "release_hold", "posted"],
  ["hold.partial", "on_hold", "release_hold", "partially_paid"],
] as const satisfies readonly P2pEdge<PurchaseInvoiceState>[];

export const PURCHASE_INVOICE_TRANSITIONS = defineLifecycle("purchase_invoice", edges);
