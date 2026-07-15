import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAmountDelta } from "./useAmountDelta";
import type { AmountBreakdownLine, DocumentLine } from "@athyper/api-contracts/documents";

const SUBTOTAL: AmountBreakdownLine = {
  label: "Subtotal", amount: 1000, currency_code: "USD", is_total: false, indent: 0,
};
const TAX: AmountBreakdownLine = {
  label: "Tax", amount: 100, currency_code: "USD", is_total: false, indent: 0,
};
const TOTAL: AmountBreakdownLine = {
  label: "Gross Total", amount: 1100, currency_code: "USD", is_total: true, indent: 0,
};

const breakdown = [SUBTOTAL, TAX, TOTAL];

function makeLine(id: string, gross: number): DocumentLine {
  return { id, gross_amount: gross } as unknown as DocumentLine;
}

describe("useAmountDelta", () => {
  it("mode=off: returns empty object regardless of pending state", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [makeLine("L1", 100)],
      pendingLineCreates:  [{ quantity: 1, unit_price: 50 }],
      pendingLineUpdates:  { "L1": { unit_price: 200 } },
      pendingLineDeletes:  ["L2"],
      mode:                "off",
    }));
    expect(result.current).toEqual({});
  });

  it("mode=simple with empty pending state: returns empty (no badge to show)", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [],
      pendingLineCreates:  [],
      pendingLineUpdates:  {},
      pendingLineDeletes:  [],
      mode:                "simple",
    }));
    expect(result.current).toEqual({});
  });

  it("mode=simple: a pending create contributes its inferred gross amount", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [],
      pendingLineCreates:  [{ quantity: 2, unit_price: 50, price_unit: 1 }],
      pendingLineUpdates:  {},
      pendingLineDeletes:  [],
      mode:                "simple",
    }));
    expect(result.current["Subtotal"]?.delta).toBe(100);
    expect(result.current["Gross Total"]?.delta).toBe(100);
    expect(result.current["Tax"]).toBeUndefined();   // tax lines skipped in simple mode
    expect(result.current["Subtotal"]?.sources.creates).toBe(1);
    expect(result.current["Subtotal"]?.approximate).toBe(false);
  });

  it("mode=simple: a pending update contributes (new gross − saved gross)", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [makeLine("L1", 100)],
      pendingLineCreates:  [],
      pendingLineUpdates:  { "L1": { quantity: 3, unit_price: 50 } }, // → 150
      pendingLineDeletes:  [],
      mode:                "simple",
    }));
    // 150 (projected) − 100 (saved) = +50 delta
    expect(result.current["Gross Total"]?.delta).toBe(50);
    expect(result.current["Gross Total"]?.sources.updates).toBe(1);
  });

  it("mode=simple: a pending delete contributes the saved gross as negative", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [makeLine("L1", 100), makeLine("L2", 50)],
      pendingLineCreates:  [],
      pendingLineUpdates:  {},
      pendingLineDeletes:  ["L2"],
      mode:                "simple",
    }));
    expect(result.current["Gross Total"]?.delta).toBe(-50);
    expect(result.current["Gross Total"]?.sources.deletes).toBe(1);
  });

  it("mode=simple: creates + updates + deletes combine into one net delta", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [makeLine("L1", 100), makeLine("L2", 50)],
      pendingLineCreates:  [{ quantity: 1, unit_price: 200 }], // +200
      pendingLineUpdates:  { "L1": { unit_price: 250 } },      // L1 was 100, now 250 → +150
      pendingLineDeletes:  ["L2"],                              // −50
      mode:                "simple",
    }));
    // +200 + 150 + (−50) = +300
    expect(result.current["Gross Total"]?.delta).toBe(300);
    expect(result.current["Gross Total"]?.sources).toEqual({ creates: 1, updates: 1, deletes: 1 });
  });

  it("mode=simple: a pending update on a line not in the saved set is silently skipped", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [makeLine("L1", 100)],
      pendingLineCreates:  [],
      pendingLineUpdates:  { "L99-unknown": { unit_price: 999 } },
      pendingLineDeletes:  [],
      mode:                "simple",
    }));
    // No baseline → contributes 0 → net delta is 0 → returns empty
    expect(result.current).toEqual({});
  });

  it("mode=full: returns empty (gracefully downgrades — never shows misleading deltas)", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [makeLine("L1", 100)],
      pendingLineCreates:  [{ quantity: 1, unit_price: 50 }],
      pendingLineUpdates:  {},
      pendingLineDeletes:  [],
      mode:                "full",
    }));
    expect(result.current).toEqual({});
  });

  it("explicit gross_amount in pending create overrides qty × price inference", () => {
    const { result } = renderHook(() => useAmountDelta({
      amountBreakdown:     breakdown,
      lines:               [],
      pendingLineCreates:  [{ quantity: 1, unit_price: 50, gross_amount: 99 }],
      pendingLineUpdates:  {},
      pendingLineDeletes:  [],
      mode:                "simple",
    }));
    expect(result.current["Gross Total"]?.delta).toBe(99);
  });
});
