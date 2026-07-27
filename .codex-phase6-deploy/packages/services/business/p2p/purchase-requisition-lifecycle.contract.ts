import { defineLifecycle, type P2pEdge } from "./lifecycle-contract.js";

export const PURCHASE_REQUISITION_STATES = ["draft", "pending_approval", "approved", "rejected", "partially_converted", "fully_converted", "closed", "cancelled"] as const;
export type PurchaseRequisitionState = typeof PURCHASE_REQUISITION_STATES[number];

const edges = [
  ["draft.submit", "draft", "submit", "pending_approval", "authoring_lock", "start"],
  ["draft.cancel", "draft", "cancel", "cancelled", "reversal"],
  ["pending.approve", "pending_approval", "approve", "approved", "commitment", "decision", "ORDER_CREATION"],
  ["pending.deny", "pending_approval", "deny", "rejected", "amendment_baseline", "decision"],
  ["pending.amend", "pending_approval", "amend", "draft", "amendment_baseline", "decision"],
  ["rejected.amend", "rejected", "amend", "draft", "amendment_baseline"],
  ["approved.convert", "approved", "convert", "partially_converted", "commitment"],
  ["partial.convert", "partially_converted", "convert", "fully_converted", "commitment"],
  ["approved.close", "approved", "close", "closed", "reversal"],
  ["partial.close", "partially_converted", "close", "closed", "reversal"],
  ["converted.close", "fully_converted", "close", "closed", "reversal"],
  ["approved.cancel", "approved", "cancel", "cancelled", "reversal"],
  ["partial.cancel", "partially_converted", "cancel", "cancelled", "reversal"],
] as const satisfies readonly P2pEdge<PurchaseRequisitionState>[];

export const PURCHASE_REQUISITION_TRANSITIONS = defineLifecycle("purchase_requisition", edges);
