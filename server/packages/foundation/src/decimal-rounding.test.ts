import { describe, expect, it } from "vitest";
import { resolveDecimalRounding, roundDecimal } from "./decimal-rounding.js";

describe("decimal rounding", () => {
  const settings = (method: Parameters<typeof resolveDecimalRounding>[0]["method"], precisionDigits = 2) =>
    resolveDecimalRounding({ method, precisionDigits });

  it("rounds half up and half even at the tie", () => {
    expect(roundDecimal("1.005", settings("ROUND_HALF_UP"))).toBe("1.01");
    expect(roundDecimal("1.005", settings("ROUND_HALF_EVEN"))).toBe("1.00");
    expect(roundDecimal("1.015", settings("ROUND_HALF_EVEN"))).toBe("1.02");
  });

  it("rounds negatives symmetrically and truncates toward zero", () => {
    expect(roundDecimal("-1.005", settings("ROUND_HALF_UP"))).toBe("-1.01");
    expect(roundDecimal("-1.009", settings("TRUNCATE"))).toBe("-1.00");
    expect(roundDecimal("1.001", settings("ROUND_UP"))).toBe("1.01");
  });

  it("resolves precision from currency minor units and rejects invalid input", () => {
    expect(resolveDecimalRounding({ method: "ROUND_DOWN" }, { minorUnits: 0 }).roundingIncrement).toBe("1");
    expect(() => resolveDecimalRounding({ method: "ROUND_DOWN" })).toThrow(RangeError);
    expect(() => roundDecimal("abc", settings("ROUND_DOWN"))).toThrow(RangeError);
  });
});
