/**
 * Canonical Phase 0A purchase-order lifecycle contract.
 *
 * This is the executable source for the PO transition matrix. Control-plane
 * seeds, handlers, hook policies, and integration tests must remain equivalent
 * to this contract. Public commands may converge on one lifecycle edge (return
 * and withdraw), but their command identity must survive in audit/outbox data.
 */

export const PO_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "active",
  "partially_fulfilled",
  "fully_fulfilled",
  "suspended",
  "rejected",
  "closed",
  "cancelled",
  "expired",
] as const;

export type PurchaseOrderState = (typeof PO_STATES)[number];

export type PoSnapshotDecision =
  | "required"
  | "not_required";

export interface PurchaseOrderTransitionContract {
  readonly key: string;
  readonly from: PurchaseOrderState;
  readonly command: string;
  readonly lifecycleOperation: string;
  readonly to: PurchaseOrderState | "previous_executable_state" | "derived_fulfillment_state";
  readonly permission: string;
  readonly handler: string;
  readonly workflow: "start" | "decision" | "cancel" | "none";
  readonly validationPolicy: string;
  readonly businessEffect: string;
  readonly activityEvent: string;
  readonly snapshot: PoSnapshotDecision;
  readonly snapshotKind?: "authoring_lock" | "commitment" | "fulfillment" | "reversal";
  readonly outboxEvent: string;
}

export const PURCHASE_ORDER_TRANSITIONS: readonly PurchaseOrderTransitionContract[] = [
  edge("draft.submit", "draft", "submit", "submit", "pending_approval", "submit", "po.submit", "start", "po.submit", "po.submit", "po.submitted", "required", "authoring_lock", "purchase_order.submitted"),
  edge("draft.cancel", "draft", "cancel", "cancel", "cancelled", "cancel", "po.cancel", "none", "po.cancel", "po.cancel", "po.cancelled", "required", "reversal", "purchase_order.cancelled"),
  edge("pending.approve", "pending_approval", "approve", "approve", "approved", "approve", "po.workflow_decision", "decision", "po.approve", "po.approve", "po.approved", "required", "commitment", "purchase_order.approved"),
  edge("pending.reject", "pending_approval", "reject", "reject", "rejected", "reject", "po.workflow_decision", "decision", "po.reject", "po.reject", "po.rejected", "required", "reversal", "purchase_order.rejected"),
  edge("pending.return", "pending_approval", "return", "return", "draft", "return", "po.workflow_decision", "decision", "po.return", "po.return", "po.returned", "required", "reversal", "purchase_order.returned"),
  edge("pending.withdraw", "pending_approval", "withdraw", "return", "draft", "withdraw", "po.workflow_withdraw", "cancel", "po.withdraw", "po.withdraw", "po.withdrawn", "required", "reversal", "purchase_order.withdrawn"),
  edge("rejected.revise", "rejected", "revise", "revise", "draft", "revise", "po.revise", "none", "po.revise", "po.revise", "po.revised", "required", "commitment", "purchase_order.revised"),
  edge("approved.place", "approved", "place_order", "PO.PLACE_ORDER", "active", "PO.PLACE_ORDER", "place_order", "none", "po.place_order", "po.place_order", "po.placed", "required", "commitment", "purchase_order.placed"),
  edge("approved.hold", "approved", "hold", "hold", "suspended", "update", "po.hold", "none", "po.hold", "po.hold", "po.suspended", "not_required", undefined, "purchase_order.suspended"),
  edge("active.hold", "active", "hold", "hold", "suspended", "update", "po.hold", "none", "po.hold", "po.hold", "po.suspended", "not_required", undefined, "purchase_order.suspended"),
  edge("partial.hold", "partially_fulfilled", "hold", "hold", "suspended", "update", "po.hold", "none", "po.hold", "po.hold", "po.suspended", "not_required", undefined, "purchase_order.suspended"),
  edge("suspended.release", "suspended", "release_hold", "release_hold", "previous_executable_state", "update", "po.release_hold", "none", "po.release_hold", "po.release_hold", "po.hold_released", "not_required", undefined, "purchase_order.hold_released"),
  edge("active.fulfill", "active", "record_fulfillment", "record_fulfillment", "derived_fulfillment_state", "create_receipt", "po.fulfillment", "none", "po.fulfillment", "po.fulfillment", "po.fulfillment_recorded", "required", "fulfillment", "purchase_order.fulfillment_recorded"),
  edge("partial.fulfill", "partially_fulfilled", "record_fulfillment", "record_fulfillment", "derived_fulfillment_state", "create_receipt", "po.fulfillment", "none", "po.fulfillment", "po.fulfillment", "po.fulfillment_recorded", "required", "fulfillment", "purchase_order.fulfillment_recorded"),
  edge("approved.short_close", "approved", "short_close", "PO.SHORT_CLOSE", "closed", "PO.SHORT_CLOSE", "po.short_close", "none", "po.short_close", "po.short_close", "po.short_closed", "required", "reversal", "purchase_order.short_closed"),
  edge("active.short_close", "active", "short_close", "PO.SHORT_CLOSE", "closed", "PO.SHORT_CLOSE", "po.short_close", "none", "po.short_close", "po.short_close", "po.short_closed", "required", "reversal", "purchase_order.short_closed"),
  edge("partial.short_close", "partially_fulfilled", "short_close", "PO.SHORT_CLOSE", "closed", "PO.SHORT_CLOSE", "po.short_close", "none", "po.short_close", "po.short_close", "po.short_closed", "required", "reversal", "purchase_order.short_closed"),
  edge("fulfilled.close", "fully_fulfilled", "close", "close", "closed", "close", "po.close", "none", "po.close", "po.close", "po.closed", "required", "commitment", "purchase_order.closed"),
  edge("approved.cancel", "approved", "cancel", "cancel", "cancelled", "cancel", "po.cancel", "none", "po.cancel", "po.cancel", "po.cancelled", "required", "reversal", "purchase_order.cancelled"),
  edge("active.cancel", "active", "cancel", "cancel", "cancelled", "cancel", "po.cancel", "none", "po.cancel", "po.cancel", "po.cancelled", "required", "reversal", "purchase_order.cancelled"),
  edge("partial.cancel", "partially_fulfilled", "cancel", "cancel", "cancelled", "cancel", "po.cancel", "none", "po.cancel", "po.cancel", "po.cancelled", "required", "reversal", "purchase_order.cancelled"),
  edge("approved.expire", "approved", "expire", "expire", "expired", "update", "po.expire", "none", "po.expire", "po.expire", "po.expired", "required", "reversal", "purchase_order.expired"),
  edge("active.expire", "active", "expire", "expire", "expired", "update", "po.expire", "none", "po.expire", "po.expire", "po.expired", "required", "reversal", "purchase_order.expired"),
] as const;

function edge(
  key: string,
  from: PurchaseOrderState,
  command: string,
  lifecycleOperation: string,
  to: PurchaseOrderTransitionContract["to"],
  permission: string,
  handler: string,
  workflow: PurchaseOrderTransitionContract["workflow"],
  validationPolicy: string,
  businessEffect: string,
  activityEvent: string,
  snapshot: PoSnapshotDecision,
  snapshotKind: PurchaseOrderTransitionContract["snapshotKind"],
  outboxEvent: string,
): PurchaseOrderTransitionContract {
  return { key, from, command, lifecycleOperation, to, permission, handler, workflow, validationPolicy, businessEffect, activityEvent, snapshot, snapshotKind, outboxEvent };
}
