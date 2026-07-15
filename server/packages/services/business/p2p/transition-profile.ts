import type { P2pGateEventKind, P2pParentEntityType } from "./entity-dispatch.js";
import type { P2pLifecycleTransitionContract } from "./lifecycle-contract.js";
import { PURCHASE_REQUISITION_TRANSITIONS } from "./purchase-requisition-lifecycle.contract.js";
import { PURCHASE_ORDER_CONFIRMATION_TRANSITIONS } from "./purchase-order-confirmation-lifecycle.contract.js";
import { DELIVERY_NOTE_TRANSITIONS } from "./delivery-note-lifecycle.contract.js";
import { RECEIPT_TRANSITIONS } from "./receipt-lifecycle.contract.js";
import { SERVICE_SHEET_TRANSITIONS } from "./service-sheet-lifecycle.contract.js";
import { PURCHASE_INVOICE_TRANSITIONS } from "./purchase-invoice-lifecycle.contract.js";
import { PAYMENT_ENTRY_TRANSITIONS } from "./payment-entry-lifecycle.contract.js";
import { PURCHASE_ORDER_TRANSITIONS } from "./purchase_order/purchase-order-lifecycle.contract.js";

export type P2pTransitionHookAction =
  | "snapshot.capture"
  | "je_reverse.capture"
  | "activity.write";

export interface P2pTransitionBinding {
  entityType: P2pParentEntityType;
  fromStatus: string;
  toStatus: string;
  gateEventKind: P2pGateEventKind;
  bindsHooks: readonly P2pTransitionHookAction[];
}

const DOCUMENT_CONTRACTS: readonly P2pLifecycleTransitionContract[] = [
  ...PURCHASE_REQUISITION_TRANSITIONS,
  ...PURCHASE_ORDER_CONFIRMATION_TRANSITIONS,
  ...DELIVERY_NOTE_TRANSITIONS,
  ...RECEIPT_TRANSITIONS,
  ...SERVICE_SHEET_TRANSITIONS,
  ...PURCHASE_INVOICE_TRANSITIONS,
  ...PAYMENT_ENTRY_TRANSITIONS,
];

const documentBindings = DOCUMENT_CONTRACTS
  .filter((row) => row.snapshot === "required" && row.snapshotKind)
  .map((row): P2pTransitionBinding => ({
    entityType: row.entity as P2pParentEntityType,
    fromStatus: row.from,
    toStatus: row.to,
    gateEventKind: row.snapshotKind!,
    bindsHooks: row.financialEvent === "REVERSAL"
      ? ["snapshot.capture", "je_reverse.capture", "activity.write"]
      : ["snapshot.capture", "activity.write"],
  }));

const commitmentBindings: P2pTransitionBinding[] = PURCHASE_ORDER_TRANSITIONS
  .filter((row) => row.snapshot === "required" && row.snapshotKind && typeof row.to === "string"
    && row.to !== "previous_executable_state" && row.to !== "derived_fulfillment_state")
  .map((row) => ({
    entityType: "commitment",
    fromStatus: row.from,
    toStatus: row.to,
    gateEventKind: row.snapshotKind!,
    bindsHooks: ["snapshot.capture", "activity.write"],
  }));

// Derived fulfilment status is determined from aggregate quantities. The DB
// lifecycle still contains concrete edges so metadata and snapshots remain
// deterministic after the derived state is known.
commitmentBindings.push(
  { entityType: "commitment", fromStatus: "active", toStatus: "partially_fulfilled", gateEventKind: "fulfillment", bindsHooks: ["snapshot.capture", "activity.write"] },
  { entityType: "commitment", fromStatus: "active", toStatus: "fully_fulfilled", gateEventKind: "fulfillment", bindsHooks: ["snapshot.capture", "activity.write"] },
  { entityType: "commitment", fromStatus: "partially_fulfilled", toStatus: "fully_fulfilled", gateEventKind: "fulfillment", bindsHooks: ["snapshot.capture", "activity.write"] },
);

export const P2P_TRANSITION_BINDINGS: readonly P2pTransitionBinding[] = [
  ...documentBindings,
  ...commitmentBindings,
];
