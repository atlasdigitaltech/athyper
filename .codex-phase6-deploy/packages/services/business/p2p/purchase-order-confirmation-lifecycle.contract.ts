import { defineLifecycle, type P2pEdge } from "./lifecycle-contract.js";

export const PURCHASE_ORDER_CONFIRMATION_STATES = ["received", "confirmed", "changes_proposed", "changes_accepted", "changes_rejected", "rejected", "cancelled"] as const;
export type PurchaseOrderConfirmationState = typeof PURCHASE_ORDER_CONFIRMATION_STATES[number];

const edges = [
  ["received.confirm", "received", "confirm", "confirmed", "commitment"],
  ["received.propose", "received", "propose_changes", "changes_proposed", "amendment_baseline"],
  ["received.reject", "received", "reject", "rejected", "reversal"],
  ["proposed.accept", "changes_proposed", "accept_changes", "changes_accepted", "amendment_baseline"],
  ["proposed.reject", "changes_proposed", "reject_changes", "changes_rejected", "amendment_baseline"],
  ["rejected.repropose", "changes_rejected", "propose_changes", "changes_proposed", "amendment_baseline"],
  ["received.cancel", "received", "cancel", "cancelled", "reversal"],
  ["changes_rejected.cancel", "changes_rejected", "cancel", "cancelled", "reversal"],
] as const satisfies readonly P2pEdge<PurchaseOrderConfirmationState>[];

export const PURCHASE_ORDER_CONFIRMATION_TRANSITIONS = defineLifecycle("purchase_order_confirmation", edges);
