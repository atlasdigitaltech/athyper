// finance/__tests__/money-library.test.ts
//
// Test 29: multiplyByRate precision verification.
// Confirms MC-4 compliant arithmetic: no float truncation.

import { describe, it, expect } from "vitest";

import {
  money,
  multiplyByRate,
  multiplyAmounts,
  sumAmounts,
  subtractAmounts,
  compareAmounts,
  addMoney,
  subtractMoney,
  formatMoney,
  isZero,
  toRatio,
} from "../../engines/shared/money.js";

describe("Money Library — MC-4 compliance", () => {
  // Test 29: multiplyByRate precision
  it("multiplyByRate preserves precision with HALF_UP rounding", () => {
    const m = money("100", "USD");
    const result = multiplyByRate(m, "0.185", "HALF_UP");
    // 100 × 0.185 = 18.5 exactly. With 4dp precision: "18.5"
    expect(result.amount).toBe("18.5");
    expect(result.currencyCode).toBe("USD");
  });

  it("multiplyAmounts preserves precision for rate × amount", () => {
    const result = multiplyAmounts("100.0000", "0.185");
    // 100.0000 × 0.185 = 18.5000 (HALF_UP at 4dp)
    expect(result).toBe("18.5");
  });

  it("multiplyAmounts handles high-precision rates correctly", () => {
    // 1000 × 7.5% = 75
    const result = multiplyAmounts("1000", "0.075");
    expect(result).toBe("75");
  });

  it("sumAmounts aggregates correctly without float drift", () => {
    // Classic float issue: 0.1 + 0.2 !== 0.3
    const result = sumAmounts(["0.1", "0.2"]);
    expect(result).toBe("0.3");
  });

  it("sumAmounts handles many values", () => {
    const values = Array.from({ length: 10 }, () => "33.3333");
    const result = sumAmounts(values);
    expect(result).toBe("333.333");
  });

  it("subtractAmounts is precise", () => {
    const result = subtractAmounts("100.0000", "33.3333");
    expect(result).toBe("66.6667");
  });

  it("compareAmounts works correctly", () => {
    expect(compareAmounts("100", "99.9999")).toBe(1);
    expect(compareAmounts("100", "100")).toBe(0);
    expect(compareAmounts("99.9999", "100")).toBe(-1);
  });

  it("addMoney + subtractMoney are inverse operations", () => {
    const a = money("1234.5678", "USD");
    const b = money("9876.5432", "USD");
    const sum = addMoney(a, b);
    const diff = subtractMoney(sum, b);
    expect(diff.amount).toBe(a.amount);
  });

  it("formatMoney rounds for display", () => {
    const m = money("1234.5678", "USD");
    expect(formatMoney(m, 2)).toBe("1234.56");
  });

  it("isZero detects zero values", () => {
    expect(isZero(money("0", "USD"))).toBe(true);
    expect(isZero(money("0.0000", "USD"))).toBe(true);
    expect(isZero(money("0.0001", "USD"))).toBe(false);
  });

  it("toRatio produces decimal string, not Money", () => {
    const a = money("75", "USD");
    const b = money("100", "USD");
    const ratio = toRatio(a, b);
    expect(ratio).toBe("0.75");
    expect(typeof ratio).toBe("string");
  });

  // Verify "33.3333" x 3 balanced (Test 19 conceptual overlap)
  it("three equal fractions sum correctly", () => {
    const result = sumAmounts(["33.3333", "33.3333", "33.3334"]);
    expect(result).toBe("100");
  });
});
