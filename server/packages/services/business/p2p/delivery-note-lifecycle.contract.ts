import { defineLifecycle, type P2pEdge } from "./lifecycle-contract.js";

export const DELIVERY_NOTE_STATES = ["draft", "in_transit", "arrived", "partially_receipted", "fully_receipted", "returned", "cancelled"] as const;
export type DeliveryNoteState = typeof DELIVERY_NOTE_STATES[number];

const edges = [
  ["draft.dispatch", "draft", "dispatch", "in_transit", "fulfillment"],
  ["transit.arrive", "in_transit", "mark_arrived", "arrived", "fulfillment"],
  ["arrived.partial", "arrived", "receipt", "partially_receipted", "fulfillment"],
  ["arrived.full", "arrived", "receipt", "fully_receipted", "fulfillment"],
  ["partial.full", "partially_receipted", "receipt", "fully_receipted", "fulfillment"],
  ["arrived.return", "arrived", "return", "returned", "reversal"],
  ["partial.return", "partially_receipted", "return", "returned", "reversal"],
  ["draft.cancel", "draft", "cancel", "cancelled", "reversal"],
  ["transit.cancel", "in_transit", "cancel", "cancelled", "reversal"],
] as const satisfies readonly P2pEdge<DeliveryNoteState>[];

export const DELIVERY_NOTE_TRANSITIONS = defineLifecycle("delivery_note", edges);
