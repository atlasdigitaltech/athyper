import { describe, expect, it } from "vitest";
import { evaluatePurchaseOrderTransition } from "../p2p/purchase_order/purchase-order-transition-policy.js";

describe("purchase order transition policy", () => {
  it("restores the exact executable state captured by hold", () => {
    const result = evaluatePurchaseOrderTransition({
      status: "suspended",
      metadata: { lifecycle_hold: { previous_status: "partially_fulfilled" } },
    }, "release_hold");
    expect(result).toMatchObject({ allowed: true, targetStatus: "partially_fulfilled" });
  });

  it("refuses release when prior state is unavailable", () => {
    expect(evaluatePurchaseOrderTransition({ status: "suspended" }, "release_hold"))
      .toMatchObject({ allowed: false, code: "PO_HOLD_STATE_MISSING" });
  });

  it("requires short close once operational activity exists", () => {
    expect(evaluatePurchaseOrderTransition({ status: "active", fulfilled_amount: 1 }, "cancel"))
      .toMatchObject({ allowed: false, code: "PO_CANCEL_HAS_ACTIVITY" });
  });

  it("allows expiry only after the policy date and before activity", () => {
    const now = new Date("2026-07-13T00:00:00Z");
    expect(evaluatePurchaseOrderTransition({ status: "active", expiry_date: "2026-07-12" }, "expire", now).allowed).toBe(true);
    expect(evaluatePurchaseOrderTransition({ status: "active", expiry_date: "2026-07-14" }, "expire", now).allowed).toBe(false);
  });

  it("requires complete physical fulfillment before normal close", () => {
    expect(evaluatePurchaseOrderTransition({ status: "fully_fulfilled", total_amount: 10, fulfilled_amount: 9 }, "close"))
      .toMatchObject({ allowed: false, code: "PO_CLOSE_AMOUNT_INCOMPLETE" });
  });
});
