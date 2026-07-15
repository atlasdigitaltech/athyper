import type { PricingComponent } from "../../purchase-invoice/types";

/**
 * Cost assigned to accounting distributions. Recoverable tax and other
 * NO_COST_EFFECT components remain outside the line expense/cost allocation.
 */
export function deriveDistributableCost(
  baseAmount: number,
  components: ReadonlyArray<PricingComponent>,
): number {
  let cost = baseAmount;
  for (const component of components) {
    if (component.cost_effect === "REDUCE_COST" || (!component.cost_effect && component.term_type === "discount")) {
      cost -= component.computed_amount;
      continue;
    }
    if (component.cost_effect === "ADD_TO_COST" || (!component.cost_effect && component.term_type === "charge")) {
      cost += component.computed_amount;
      continue;
    }
    if (component.term_type === "tax") {
      const recovery = Math.min(100, Math.max(0, component.recoverable_pct ?? 100)) / 100;
      cost += component.computed_amount * (1 - recovery);
    }
  }
  return Math.max(0, Math.round((cost + Number.EPSILON) * 10_000) / 10_000);
}
