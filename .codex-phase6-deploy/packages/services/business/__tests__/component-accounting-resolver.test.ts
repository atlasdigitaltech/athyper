import { describe, expect, it } from "vitest";
import { projectComponentAccounting } from "../pricing_component/component-accounting-resolver.service.js";

describe("component accounting resolver", () => {
  it("splits cost, partial tax recovery, WHT and retention without adding liabilities to cost", () => {
    const result = projectComponentAccounting([{
      id: "line-1",
      baseAmount: 100_000,
      distributions: [
        { id: "ad-1", sourceLineId: "line-1", distributionNo: 1, ratio: 0.6 },
        { id: "ad-2", sourceLineId: "line-1", distributionNo: 2, ratio: 0.4 },
      ],
      components: [
        { id: "discount", conditionTypeId: "ct-d", sourceLineId: "line-1", termType: "discount", computedAmount: 5_000, costEffect: "REDUCE_COST", postingPattern: "INHERIT_LINE_ACCOUNT", distributionPolicy: "INHERIT_LINE" },
        { id: "freight", conditionTypeId: "ct-f", sourceLineId: "line-1", termType: "charge", computedAmount: 2_000, costEffect: "ADD_TO_COST", postingPattern: "INHERIT_LINE_ACCOUNT", distributionPolicy: "INHERIT_LINE" },
        { id: "tax", conditionTypeId: "ct-t", sourceLineId: "line-1", termType: "tax", computedAmount: 10_000, recoverablePct: 60, costEffect: "NO_COST_EFFECT", postingPattern: "TAX_RECOVERABLE", distributionPolicy: "NO_COST_DISTRIBUTION", postingRoleCode: "input_tax_recoverable" },
        { id: "wht", conditionTypeId: "ct-w", sourceLineId: "line-1", termType: "withholding", computedAmount: 1_500, costEffect: "NO_COST_EFFECT", postingPattern: "LIABILITY_SPLIT", distributionPolicy: "NO_COST_DISTRIBUTION" },
        { id: "ret", conditionTypeId: "ct-r", sourceLineId: "line-1", termType: "retention", computedAmount: 5_000, costEffect: "NO_COST_EFFECT", postingPattern: "LIABILITY_SPLIT", distributionPolicy: "NO_COST_DISTRIBUTION" },
      ],
    }]);

    expect(result.totals.DISTRIBUTABLE_COST).toBe(101_000);
    expect(result.totals.RECOVERABLE_TAX).toBe(6_000);
    expect(result.totals.NONRECOVERABLE_TAX).toBe(4_000);
    expect(result.totals.WHT_LIABILITY).toBe(1_500);
    expect(result.totals.RETENTION_LIABILITY).toBe(5_000);
    expect(result.allocations.filter((row) => row.componentBucket === "NONRECOVERABLE_TAX").map((row) => row.amount)).toEqual([2_400, 1_600]);
  });

  it("keeps rounded allocations equal to the parent amount", () => {
    const result = projectComponentAccounting([{
      id: "line-1",
      baseAmount: 100,
      components: [],
      distributions: [
        { id: "a", sourceLineId: "line-1", distributionNo: 1, ratio: 1 / 3 },
        { id: "b", sourceLineId: "line-1", distributionNo: 2, ratio: 1 / 3 },
        { id: "c", sourceLineId: "line-1", distributionNo: 3, ratio: 1 / 3 },
      ],
    }]);
    expect(result.allocations.reduce((sum, row) => sum + row.amount, 0)).toBe(100);
  });
});
