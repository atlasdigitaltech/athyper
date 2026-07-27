/**
 * pc-precedence unit tests (WS-G).
 *
 * Covers:
 *   • Banker's rounding (round-half-even) at boundary cases.
 *   • Apportionment residue policy: residue → argmax(net_amount);
 *     tie-break → argmin(line_no).
 *   • Degenerate-basis rejection (value/quantity sum to zero).
 *   • Canonical default-sequence map (discount=100, charge=200,
 *     tax=300, withholding=400, retention=500).
 *
 * No DB; pure helpers. Documented policy: docs/specs/pricing-component-ordering.md
 */

import { describe, it, expect } from "vitest";
import {
  apportion,
  defaultSequenceFor,
  roundHalfEven,
  roundPc,
  roundPosting,
} from "../pricing_component/pc-precedence.js";

describe("roundHalfEven — banker's rounding", () => {
  it("ties round to the nearest even neighbour (positive)", () => {
    expect(roundHalfEven(0.005, 2)).toBe(0.00);
    expect(roundHalfEven(0.015, 2)).toBe(0.02);
    expect(roundHalfEven(0.025, 2)).toBe(0.02);
    expect(roundHalfEven(0.035, 2)).toBe(0.04);
    expect(roundHalfEven(0.045, 2)).toBe(0.04);
    expect(roundHalfEven(0.055, 2)).toBe(0.06);
  });

  it("non-tie cases follow the larger neighbour", () => {
    expect(roundHalfEven(0.014999, 2)).toBe(0.01);
    expect(roundHalfEven(0.015001, 2)).toBe(0.02);
    expect(roundHalfEven(0.024999, 2)).toBe(0.02);
    expect(roundHalfEven(0.025001, 2)).toBe(0.03);
  });

  it("handles negative values symmetrically (Floor-half-even toward zero)", () => {
    // For negatives, Math.floor returns the more-negative neighbour; banker
    // policy still picks the even of (floor, floor+1). 0 is even. Use
    // Object.is-equivalent magnitude check to avoid +0/-0 JS quirk.
    expect(Math.abs(roundHalfEven(-0.005, 2))).toBe(0);
  });

  it("respects the decimals argument", () => {
    expect(roundHalfEven(1.23456, 4)).toBe(1.2346);
    expect(roundHalfEven(1.23455, 4)).toBe(1.2346); // ties to even — 6 is even
    expect(roundHalfEven(1.23445, 4)).toBe(1.2344); // ties to even — 4 is even
  });

  it("convenience helpers: roundPc(4dp), roundPosting(2dp)", () => {
    expect(roundPc(1.234567)).toBe(1.2346);
    expect(roundPosting(0.005)).toBe(0.00);
    expect(roundPosting(0.015)).toBe(0.02);
  });
});

describe("defaultSequenceFor — canonical waterfall sequence", () => {
  it("assigns each term_type its own decade", () => {
    expect(defaultSequenceFor("discount")).toBe(100);
    expect(defaultSequenceFor("charge")).toBe(200);
    expect(defaultSequenceFor("tax")).toBe(300);
    expect(defaultSequenceFor("withholding")).toBe(400);
    expect(defaultSequenceFor("retention")).toBe(500);
    expect(defaultSequenceFor("principal_marker")).toBe(900);
  });

  it("falls back to 100 for unknown term_types (safe default)", () => {
    expect(defaultSequenceFor("unknown_term")).toBe(100);
    expect(defaultSequenceFor("")).toBe(100);
  });
});

describe("apportion — residue policy + degenerate-basis rejection", () => {
  it("equal split across 3 lines assigns residue to largest net_amount", () => {
    // total=100 across 3 lines of 100/100/100 → 33.33 each, residue 0.01
    // → goes to line_no 10 (smallest line_no on tie).
    const result = apportion(
      100.00,
      [
        { id: "a", line_no: 10, net_amount: 100 },
        { id: "b", line_no: 20, net_amount: 100 },
        { id: "c", line_no: 30, net_amount: 100 },
      ],
      "equal",
    );
    expect(result.reduce((s, r) => s + r.allocated, 0)).toBeCloseTo(100, 8);
    expect(result.find((r) => r.id === "a")?.allocated).toBe(33.34);
    expect(result.find((r) => r.id === "b")?.allocated).toBe(33.33);
    expect(result.find((r) => r.id === "c")?.allocated).toBe(33.33);
  });

  it("value basis: residue goes to the line with the largest net_amount", () => {
    // Lines 30/40/30 → shares 0.3/0.4/0.3 of 100 = 30/40/30 (exact, no residue).
    const exact = apportion(
      100,
      [
        { id: "a", line_no: 10, net_amount: 30 },
        { id: "b", line_no: 20, net_amount: 40 },
        { id: "c", line_no: 30, net_amount: 30 },
      ],
      "value",
    );
    expect(exact.find((r) => r.id === "b")?.allocated).toBe(40);

    // 33/34/33 with total 100 → 33.00/34.00/33.00 (no residue).
    const exact2 = apportion(
      100,
      [
        { id: "a", line_no: 10, net_amount: 33 },
        { id: "b", line_no: 20, net_amount: 34 },
        { id: "c", line_no: 30, net_amount: 33 },
      ],
      "value",
    );
    expect(exact2.reduce((s, r) => s + r.allocated, 0)).toBeCloseTo(100, 8);

    // 1/1/1 → 0.33/0.33/0.33 = 0.99 ; residue 0.01 → largest net_amount,
    // tie → smallest line_no.
    const residueCase = apportion(
      1,
      [
        { id: "a", line_no: 10, net_amount: 1 },
        { id: "b", line_no: 20, net_amount: 1 },
        { id: "c", line_no: 30, net_amount: 1 },
      ],
      "value",
    );
    expect(residueCase.reduce((s, r) => s + r.allocated, 0)).toBeCloseTo(1, 8);
    expect(residueCase.find((r) => r.id === "a")?.allocated).toBe(0.34); // largest+min line_no
  });

  it("tie-break is deterministic across permuted inputs", () => {
    const input = [
      { id: "b", line_no: 20, net_amount: 100 },
      { id: "c", line_no: 30, net_amount: 100 },
      { id: "a", line_no: 10, net_amount: 100 },
    ];
    // Permute inputs; residue still lands on id="a" (line_no 10).
    const r1 = apportion(100, input, "equal");
    const r2 = apportion(100, input.slice().reverse(), "equal");
    const r3 = apportion(100, [input[1]!, input[0]!, input[2]!], "equal");
    expect(r1.find((r) => r.id === "a")?.allocated).toBe(33.34);
    expect(r2.find((r) => r.id === "a")?.allocated).toBe(33.34);
    expect(r3.find((r) => r.id === "a")?.allocated).toBe(33.34);
  });

  it("rejects value-basis when all net_amounts sum to zero", () => {
    expect(() =>
      apportion(
        100,
        [
          { id: "a", line_no: 10, net_amount: 0 },
          { id: "b", line_no: 20, net_amount: 0 },
        ],
        "value",
      ),
    ).toThrow(/APPORTION_DEGENERATE_BASIS/);
  });

  it("rejects quantity-basis when all quantities sum to zero", () => {
    expect(() =>
      apportion(
        100,
        [
          { id: "a", line_no: 10, net_amount: 50, quantity: 0 },
          { id: "b", line_no: 20, net_amount: 50, quantity: 0 },
        ],
        "quantity",
      ),
    ).toThrow(/APPORTION_DEGENERATE_BASIS/);
  });

  it("equal-basis works with zero net_amounts (residue safe)", () => {
    const result = apportion(
      100,
      [
        { id: "a", line_no: 10, net_amount: 0 },
        { id: "b", line_no: 20, net_amount: 0 },
      ],
      "equal",
    );
    expect(result.reduce((s, r) => s + r.allocated, 0)).toBeCloseTo(100, 8);
    expect(result[0]!.allocated).toBe(50);
    expect(result[1]!.allocated).toBe(50);
  });

  it("returns empty array for empty input", () => {
    expect(apportion(100, [], "equal")).toEqual([]);
  });

  it("preserves input row order in the result", () => {
    const result = apportion(
      90,
      [
        { id: "c", line_no: 30, net_amount: 30 },
        { id: "a", line_no: 10, net_amount: 30 },
        { id: "b", line_no: 20, net_amount: 30 },
      ],
      "equal",
    );
    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});
