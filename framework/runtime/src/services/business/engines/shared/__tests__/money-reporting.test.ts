// shared/__tests__/money-reporting.test.ts
//
// Regression tests for MC-4 money utilities in reporting contexts.
// Covers edge cases found during the parseFloat→BigInt migration
// across close handlers, P&L routes, trial balance, and reconciliation.

import { describe, it, expect } from "vitest";

import {
  sumAmounts,
  subtractAmounts,
  compareAmounts,
  toScaledBigInt,
  fromScaledBigInt,
} from "../money.js";

// ---------------------------------------------------------------------------
// 1. Sub-cent tolerance comparisons (trial balance handler)
// ---------------------------------------------------------------------------
describe("sub-cent tolerance comparisons", () => {
  it("imbalance of exactly 0.01 is within tolerance", () => {
    const debit = "1234567.8901";
    const credit = "1234567.8801";
    const imbalance = subtractAmounts(debit, credit);
    // |0.01| <= 0.01 → pass
    expect(compareAmounts(imbalance, "0") >= 0 ? imbalance : subtractAmounts("0", imbalance)).toBe("0.01");
    expect(compareAmounts(imbalance, "0.01")).toBeLessThanOrEqual(0);
  });

  it("imbalance of 0.0001 is within tolerance", () => {
    const diff = subtractAmounts("100.0001", "100.0000");
    expect(diff).toBe("0.0001");
    expect(compareAmounts(diff, "0.01")).toBeLessThan(0);
  });

  it("imbalance of 0.02 exceeds tolerance", () => {
    const diff = subtractAmounts("100.02", "100.00");
    expect(compareAmounts(diff, "0.01")).toBeGreaterThan(0);
  });

  it("exactly balanced returns 0", () => {
    expect(subtractAmounts("999999.9999", "999999.9999")).toBe("0");
    expect(compareAmounts("0", "0")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Negative values and sign handling
// ---------------------------------------------------------------------------
describe("negative values", () => {
  it("subtractAmounts with larger b produces negative result", () => {
    expect(subtractAmounts("100", "250")).toBe("-150");
  });

  it("subtractAmounts of two negatives", () => {
    expect(subtractAmounts("-50.25", "-100.75")).toBe("50.5");
  });

  it("compareAmounts with negative values", () => {
    expect(compareAmounts("-10", "0")).toBe(-1);
    expect(compareAmounts("0", "-10")).toBe(1);
    expect(compareAmounts("-100.5", "-100.5")).toBe(0);
    expect(compareAmounts("-99", "-100")).toBe(1); // -99 > -100
  });

  it("sumAmounts with mix of positive and negative", () => {
    const amounts = ["100.50", "-25.25", "50.75", "-126.00"];
    expect(sumAmounts(amounts)).toBe("0");
  });

  it("absolute value via string negate idiom", () => {
    const val = "-123.4567";
    const abs = val.startsWith("-") ? val.slice(1) : val;
    expect(abs).toBe("123.4567");
    expect(compareAmounts(abs, "0")).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Near-zero variances (P&L route variance calculations)
// ---------------------------------------------------------------------------
describe("near-zero variances", () => {
  it("variance between very close amounts preserves precision", () => {
    const revenue = "1000000.1234";
    const priorRevenue = "1000000.1230";
    const variance = subtractAmounts(revenue, priorRevenue);
    expect(variance).toBe("0.0004");
  });

  it("net income = revenue - expense with no drift", () => {
    const revenue = "5432198.7654";
    const expense = "5432198.7654";
    expect(subtractAmounts(revenue, expense)).toBe("0");
  });

  it("repeated subtraction does not accumulate drift (unlike parseFloat)", () => {
    // This is the classic 0.1 + 0.2 != 0.3 scenario at scale
    let total = "0";
    for (let i = 0; i < 1000; i++) {
      total = sumAmounts([total, "0.0001"]);
    }
    expect(total).toBe("0.1");
  });
});

// ---------------------------------------------------------------------------
// 4. Subtotal rollups across many rows (drilldown, P&L totals)
// ---------------------------------------------------------------------------
describe("subtotal rollups across many rows", () => {
  it("summing 10,000 rows of 0.0001 yields exactly 1.0000", () => {
    const amounts = Array.from({ length: 10000 }, () => "0.0001");
    expect(sumAmounts(amounts)).toBe("1");
  });

  it("summing large and small amounts together", () => {
    const amounts = [
      "99999999.9999",
      "0.0001",
      "-99999999.9999",
      "-0.0001",
    ];
    expect(sumAmounts(amounts)).toBe("0");
  });

  it("summing realistic GL balance rows", () => {
    const debits = [
      "15234.50",
      "8921.33",
      "45678.12",
      "102.05",
      "7894.00",
    ];
    const credits = [
      "15234.50",
      "8921.33",
      "45678.12",
      "102.05",
      "7894.00",
    ];
    const totalDebit = sumAmounts(debits);
    const totalCredit = sumAmounts(credits);
    expect(subtractAmounts(totalDebit, totalCredit)).toBe("0");
  });

  it("sumAmounts with empty array returns zero", () => {
    expect(sumAmounts([])).toBe("0");
  });

  it("sumAmounts with null-like values treated as zero", () => {
    expect(sumAmounts(["", "", "100.50"])).toBe("100.5");
  });
});

// ---------------------------------------------------------------------------
// 5. Sign-policy flips (statement engine applySignPolicy)
// ---------------------------------------------------------------------------
describe("sign-policy flips", () => {
  it("negate a positive string amount", () => {
    const val = "1234.5678";
    const negated = val.startsWith("-") ? val.slice(1) : `-${val}`;
    expect(negated).toBe("-1234.5678");
    expect(compareAmounts(negated, "0")).toBeLessThan(0);
  });

  it("negate a negative string amount (double negate = positive)", () => {
    const val = "-9876.5432";
    const negated = val.startsWith("-") ? val.slice(1) : `-${val}`;
    expect(negated).toBe("9876.5432");
    expect(compareAmounts(negated, "0")).toBeGreaterThan(0);
  });

  it("negate zero stays zero", () => {
    const val = "0";
    const negated = val.startsWith("-") ? val.slice(1) : `-${val}`;
    // "-0" is semantically zero
    expect(compareAmounts(negated, "0")).toBe(0);
  });

  it("absolute of negative preserves magnitude", () => {
    const val = "-500.2500";
    const abs = val.startsWith("-") ? val.slice(1) : val;
    expect(abs).toBe("500.2500");
  });

  it("subtractAmounts used for variance after sign flip", () => {
    const currentNet = "1500.00";
    const priorNet = "-500.00"; // was credit-positive, now inverted
    const variance = subtractAmounts(currentNet, priorNet);
    expect(variance).toBe("2000");
  });
});

// ---------------------------------------------------------------------------
// 6. Precision boundary tests
// ---------------------------------------------------------------------------
describe("precision boundaries", () => {
  it("handles amounts with more than 4 decimal places (truncates excess)", () => {
    // toScaledBigInt truncates to the requested precision
    const scaled = toScaledBigInt("1.23456789", 4);
    expect(fromScaledBigInt(scaled, 4)).toBe("1.2345");
  });

  it("handles amounts with fewer decimal places (pads correctly)", () => {
    const scaled = toScaledBigInt("100", 4);
    expect(fromScaledBigInt(scaled, 4)).toBe("100");
  });

  it("large amounts do not overflow (18-digit integer part)", () => {
    const a = "999999999999999999.9999";
    const b = "0.0001";
    // This would overflow a float but BigInt handles it
    const result = sumAmounts([a, b]);
    expect(result).toBe("1000000000000000000");
  });

  it("2-decimal precision for display contexts", () => {
    expect(subtractAmounts("100.50", "75.25", 2)).toBe("25.25");
    expect(sumAmounts(["10.10", "20.20", "30.30"], 2)).toBe("60.60");
  });
});

// ---------------------------------------------------------------------------
// 7. Bank reconciliation discrepancy (absolute value compare)
// ---------------------------------------------------------------------------
describe("bank reconciliation discrepancy check", () => {
  it("negative discrepancy within tolerance passes", () => {
    const discrepancy = "-0.005";
    const abs = compareAmounts(discrepancy, "0") < 0
      ? subtractAmounts("0", discrepancy)
      : discrepancy;
    expect(compareAmounts(abs, "0.01")).toBeLessThanOrEqual(0);
  });

  it("positive discrepancy beyond tolerance fails", () => {
    const discrepancy = "0.015";
    expect(compareAmounts(discrepancy, "0.01")).toBeGreaterThan(0);
  });

  it("zero discrepancy passes", () => {
    expect(compareAmounts("0", "0.01")).toBeLessThan(0);
  });
});
