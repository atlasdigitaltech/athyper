import { describe, expect, it } from "vitest";
import { PURCHASE_ORDER_TRANSITIONS } from "../p2p/purchase_order/purchase-order-lifecycle.contract.js";
import { evaluatePurchaseOrderTransition } from "../p2p/purchase_order/purchase-order-transition-policy.js";

function edge(from: string, command: string) {
  const found = PURCHASE_ORDER_TRANSITIONS.find((row) => row.from === from && row.command === command);
  if (!found) throw new Error(`Missing lifecycle edge ${from}/${command}`);
  return found;
}

describe("Phase 0A purchase-order lifecycle integration matrix", () => {
  it("covers the canonical draft-to-close path", () => {
    expect(edge("draft", "submit").to).toBe("pending_approval");
    expect(edge("pending_approval", "approve").to).toBe("approved");
    expect(edge("approved", "place_order").to).toBe("active");
    expect(edge("active", "record_fulfillment").to).toBe("derived_fulfillment_state");
    expect(edge("partially_fulfilled", "record_fulfillment").to).toBe("derived_fulfillment_state");
    expect(edge("fully_fulfilled", "close").to).toBe("closed");
  });

  it("covers rejection, revision, return, and requester withdrawal", () => {
    expect(edge("pending_approval", "reject").to).toBe("rejected");
    expect(edge("rejected", "revise").to).toBe("draft");
    expect(edge("pending_approval", "return").to).toBe("draft");
    expect(edge("pending_approval", "withdraw").to).toBe("draft");
  });

  it("covers all executable hold states and exact restoration", () => {
    for (const state of ["approved", "active", "partially_fulfilled"]) {
      expect(edge(state, "hold").to).toBe("suspended");
      expect(evaluatePurchaseOrderTransition({
        status: "suspended",
        metadata: { lifecycle_hold: { previous_status: state } },
      }, "release_hold")).toMatchObject({ allowed: true, targetStatus: state });
    }
  });

  it("covers every supported terminal route", () => {
    for (const state of ["approved", "active", "partially_fulfilled"]) {
      expect(edge(state, "short_close").to).toBe("closed");
      expect(edge(state, "cancel").to).toBe("cancelled");
    }
    expect(edge("approved", "expire").to).toBe("expired");
    expect(edge("active", "expire").to).toBe("expired");
  });

  it("requires the full exit-gate evidence on every matrix row", () => {
    for (const row of PURCHASE_ORDER_TRANSITIONS) {
      expect(row.permission).toBeTruthy();
      expect(row.handler).toBeTruthy();
      expect(row.validationPolicy).toBeTruthy();
      expect(row.businessEffect).toBeTruthy();
      expect(row.activityEvent).toBeTruthy();
      expect(row.outboxEvent).toBeTruthy();
      expect(["required", "not_required"]).toContain(row.snapshot);
    }
  });
});
