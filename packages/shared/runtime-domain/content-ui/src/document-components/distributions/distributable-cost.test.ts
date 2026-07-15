import { describe, expect, it } from "vitest";
import type { PricingComponent } from "../../purchase-invoice/types";
import { deriveDistributableCost } from "./distributable-cost";

function component(overrides: Partial<PricingComponent>): PricingComponent {
  return {
    id: "pc-1",
    sequence: 1,
    term_type: "tax",
    condition_type_id: "ct-1",
    condition_type_label: "VAT",
    condition_type_code: "TAX_VAT",
    cost_effect: "NO_COST_EFFECT",
    basis: "percent",
    rate_value: 15,
    amount_value: null,
    base_for_calculation: 1_179_407.3,
    computed_amount: 176_911.095,
    computed_base_amount: 176_911.095,
    entry_level: "line",
    origin: "system_resolved",
    recoverable_pct: 100,
    ...overrides,
  } as PricingComponent;
}

describe("deriveDistributableCost", () => {
  it("excludes fully recoverable VAT from accounting cost", () => {
    expect(deriveDistributableCost(1_179_407.3, [component({})])).toBe(1_179_407.3);
  });

  it("includes only the non-recoverable portion of tax", () => {
    expect(deriveDistributableCost(1_000, [component({ computed_amount: 150, recoverable_pct: 60 })]))
      .toBe(1_060);
  });

  it("applies cost-bearing charges and discounts", () => {
    expect(deriveDistributableCost(1_000, [
      component({ term_type: "charge", computed_amount: 80, cost_effect: "ADD_TO_COST" }),
      component({ term_type: "discount", computed_amount: 25, cost_effect: "REDUCE_COST" }),
    ])).toBe(1_055);
  });
});
