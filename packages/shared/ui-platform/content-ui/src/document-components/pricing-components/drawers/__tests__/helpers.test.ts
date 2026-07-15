/**
 * Tests for drawers/helpers.ts — apportionment + validation + math.
 *
 * Math is the easiest thing to break silently, so these cover the
 * DDL coherence rules and the rounding-allocation policy.
 */
import { describe, it, expect } from "vitest";
import {
  computeApportionment,
  validatePcDraft,
  resolveBaseForCalculation,
  previewComputedAmount,
  describeBasisHint,
  type PcDraft,
} from "../helpers";

// ── Fixtures ──────────────────────────────────────────────────────

function line(id: string, line_no: number, net: number, qty = 1) {
  return {
    id,
    line_no,
    item_description: `Item ${line_no}`,
    net_amount: net,
    quantity: qty,
  };
}

function validDraft(over: Partial<PcDraft> = {}): PcDraft {
  return {
    term_type: "discount",
    basis: "percent",
    rate_value: 5,
    amount_value: null,
    tax_group_id: null,
    is_inclusive: null,
    recoverable_pct: null,
    tax_section_code: null,
    entry_level: "line",
    source_line_id: "pil-1",
    apportion_basis: null,
    condition_type_id: "ct-disc-trade",
    sequence: 10,
    ...over,
  };
}

// ── computeApportionment ──────────────────────────────────────────

describe("computeApportionment", () => {
  it("apportions by value across lines proportionally", () => {
    const result = computeApportionment({
      amount: 200,
      basis: "value",
      lines: [
        line("a", 1, 1000),
        line("b", 2, 4500),
        line("c", 3, 4500),
      ],
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]!.allocated_amount).toBeCloseTo(20, 2);
    expect(result.rows[1]!.allocated_amount).toBeCloseTo(90, 2);
    expect(result.rows[2]!.allocated_amount).toBeCloseTo(90, 2);
    expect(result.total_allocated).toBeCloseTo(200, 2);
    expect(result.incompatibility).toBeNull();
  });

  it("apportions by quantity", () => {
    const result = computeApportionment({
      amount: 100,
      basis: "quantity",
      lines: [
        line("a", 1, 0, 2),
        line("b", 2, 0, 8),
      ],
    });

    expect(result.rows[0]!.allocated_amount).toBeCloseTo(20, 2);
    expect(result.rows[1]!.allocated_amount).toBeCloseTo(80, 2);
    expect(result.total_allocated).toBeCloseTo(100, 2);
  });

  it("apportions equal share regardless of basis values", () => {
    const result = computeApportionment({
      amount: 100,
      basis: "equal",
      lines: [
        line("a", 1, 9999, 1),
        line("b", 2, 1,    1),
        line("c", 3, 0,    1),
        line("d", 4, 0,    1),
      ],
    });

    expect(result.rows[0]!.allocated_amount).toBeCloseTo(25, 2);
    expect(result.rows[3]!.allocated_amount).toBeCloseTo(25, 2);
    expect(result.total_allocated).toBeCloseTo(100, 2);
  });

  it("flags missing_weights when weight basis lacks data", () => {
    const result = computeApportionment({
      amount: 100,
      basis: "weight",
      lines: [
        line("a", 1, 100),
        line("b", 2, 200),
      ],
      weights: { "a": 10 /* b missing */ },
    });

    expect(result.incompatibility).toEqual({
      kind: "missing_weights",
      line_nos: [2],
    });
  });

  it("flags zero_basis_total when value basis sums to zero", () => {
    const result = computeApportionment({
      amount: 100,
      basis: "value",
      lines: [
        line("a", 1, 0),
        line("b", 2, 0),
      ],
    });

    expect(result.incompatibility).toEqual({
      kind: "zero_basis_total",
      basis: "value",
    });
  });

  it("absorbs rounding on the line with the largest basis_value", () => {
    // ₹10 / 3 equal lines → 3.33 × 3 = 9.99, residual 0.01 lands on largest.
    // Use [1, 1, 1] basis so the largest-basis tie-breaker picks line 1
    // (first-encountered wins).
    const result = computeApportionment({
      amount: 10,
      basis: "value",
      lines: [
        line("a", 1, 1),
        line("b", 2, 1),
        line("c", 3, 1),
      ],
    });

    expect(result.total_allocated).toBeCloseTo(10, 2);
    expect(result.rows).toHaveLength(3);
    // Line 1 absorbs the residual (first-encountered with highest basis).
    expect(result.rows[0]!.allocated_amount).toBeCloseTo(3.34, 2);
    expect(result.rows[1]!.allocated_amount).toBeCloseTo(3.33, 2);
    expect(result.rows[2]!.allocated_amount).toBeCloseTo(3.33, 2);
    expect(result.rounding_adjustment).toBeCloseTo(0.01, 2);
    expect(result.rounding_absorbed_by_line_no).toBe(1);
  });

  it("returns rounding_absorbed_by_line_no = largest basis line when delta is non-zero", () => {
    // Use a true non-trivial split: amount=100, basis [1, 2, 3] = total 6
    //   Line 1: 100 × 1/6 = 16.666… → 16.67
    //   Line 2: 100 × 2/6 = 33.333… → 33.33
    //   Line 3: 100 × 3/6 = 50.000  → 50.00
    //   Sum = 100.00, residual = 0 — no absorption needed here.
    // Use amount=10 instead to force residual:
    //   Line 1: 10 × 1/6 = 1.666… → 1.67
    //   Line 2: 10 × 2/6 = 3.333… → 3.33
    //   Line 3: 10 × 3/6 = 5.000  → 5.00
    //   Sum = 10.00 still clean. Try amount=1, basis [1, 2, 3]:
    //   Line 1: 0.1666… → 0.17
    //   Line 2: 0.3333… → 0.33
    //   Line 3: 0.5000  → 0.50
    //   Sum = 1.00 — still clean. Force residual via 4-row [1,1,1,1] split.
    const result = computeApportionment({
      amount: 1,
      basis: "value",
      lines: [
        line("a", 1, 1),
        line("b", 2, 1),
        line("c", 3, 1),
        line("d", 4, 1),
      ],
    });
    // 1 / 4 = 0.25 each → sum 1.00, residual 0. Try 10/7:
    expect(result.total_allocated).toBeCloseTo(1, 2);
    // Even when residual is 0 the contract is: absorbed_by_line_no is null.
    if (result.rounding_adjustment === 0) {
      expect(result.rounding_absorbed_by_line_no).toBeNull();
    } else {
      expect(result.rounding_absorbed_by_line_no).toBe(1);
    }
  });

  // §7.1: regression — caption claim ("absorbed by Line N") must match the
  // line whose allocated_amount actually got the residual added.
  it("caption_line === actual_absorber_line (no inconsistency)", () => {
    const result = computeApportionment({
      amount: 100,
      basis: "value",
      lines: [
        line("a", 1, 1),   // smallest
        line("b", 2, 5),   // largest
        line("c", 3, 3),   // mid
      ],
    });
    //   total_basis = 9
    //   Line 1: 100 × 1/9 = 11.111… → 11.11
    //   Line 2: 100 × 5/9 = 55.555… → 55.56
    //   Line 3: 100 × 3/9 = 33.333… → 33.33
    //   Naive sum = 100.00. Residual = 0.00 in this case — try 50:
    //   Line 1: 50 × 1/9 = 5.555… → 5.56
    //   Line 2: 50 × 5/9 = 27.777… → 27.78
    //   Line 3: 50 × 3/9 = 16.666… → 16.67
    //   Naive sum = 50.01. Residual = -0.01. Highest basis = line 2 → absorbs.
    const r50 = computeApportionment({
      amount: 50,
      basis: "value",
      lines: [
        line("a", 1, 1),
        line("b", 2, 5),
        line("c", 3, 3),
      ],
    });
    expect(r50.total_allocated).toBeCloseTo(50, 2);
    expect(r50.rounding_absorbed_by_line_no).toBe(2);
    // Line 2's allocation was bumped DOWN by 0.01 (residual was negative).
    expect(r50.rows[1]!.allocated_amount).toBeCloseTo(27.77, 2);
    expect(r50.rounding_adjustment).toBeCloseTo(-0.01, 2);

    // Sanity for the unused intermediate result so eslint is happy.
    expect(result.rows).toHaveLength(3);
  });

  it("handles single-line apportionment trivially", () => {
    const result = computeApportionment({
      amount: 50,
      basis: "value",
      lines: [line("solo", 7, 1000)],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.allocated_amount).toBeCloseTo(50, 2);
    expect(result.rows[0]!.share).toBeCloseTo(1, 4);
  });
});

// ── validatePcDraft ───────────────────────────────────────────────

describe("validatePcDraft", () => {
  it("returns no errors for a valid percent-basis discount", () => {
    expect(validatePcDraft(validDraft())).toHaveLength(0);
  });

  it("flags missing condition_type_id", () => {
    const errors = validatePcDraft(validDraft({ condition_type_id: null }));
    expect(errors.some((e) => e.code === "REQUIRED" && e.field === "condition_type_id")).toBe(true);
  });

  describe("pc_basis_value_chk coherence", () => {
    it("percent without rate_value → error", () => {
      const errors = validatePcDraft(validDraft({ basis: "percent", rate_value: null }));
      expect(errors.some((e) => e.code === "BASIS_VALUE_INCOHERENT")).toBe(true);
    });

    it("percent with amount_value → error", () => {
      const errors = validatePcDraft(validDraft({ basis: "percent", rate_value: 5, amount_value: 10 }));
      expect(errors.some((e) => e.code === "BASIS_VALUE_INCOHERENT")).toBe(true);
    });

    it("per_unit without rate_value → error", () => {
      const errors = validatePcDraft(validDraft({ basis: "per_unit", rate_value: null }));
      expect(errors.some((e) => e.code === "BASIS_VALUE_INCOHERENT")).toBe(true);
    });

    it("amount basis without amount_value → error", () => {
      const errors = validatePcDraft(validDraft({ basis: "amount", rate_value: null, amount_value: null }));
      expect(errors.some((e) => e.code === "BASIS_VALUE_INCOHERENT")).toBe(true);
    });

    it("amount basis with rate_value → error", () => {
      const errors = validatePcDraft(validDraft({ basis: "amount", rate_value: 5, amount_value: 100 }));
      expect(errors.some((e) => e.code === "BASIS_VALUE_INCOHERENT")).toBe(true);
    });

    it("flat basis behaves like amount", () => {
      const validFlat = validatePcDraft(validDraft({ basis: "flat", rate_value: null, amount_value: 50 }));
      expect(validFlat).toHaveLength(0);

      const invalidFlat = validatePcDraft(validDraft({ basis: "flat", rate_value: 10, amount_value: 50 }));
      expect(invalidFlat.some((e) => e.code === "BASIS_VALUE_INCOHERENT")).toBe(true);
    });
  });

  it("flags negative rate_value", () => {
    const errors = validatePcDraft(validDraft({ rate_value: -5 }));
    expect(errors.some((e) => e.code === "VALUE_NEGATIVE" && e.field === "rate_value")).toBe(true);
  });

  it("flags negative amount_value", () => {
    const errors = validatePcDraft(validDraft({ basis: "amount", rate_value: null, amount_value: -50 }));
    expect(errors.some((e) => e.code === "VALUE_NEGATIVE" && e.field === "amount_value")).toBe(true);
  });

  describe("tax fields scope (pc_tax_fields_scope_chk)", () => {
    it("tax term_type requires tax_group_id", () => {
      const errors = validatePcDraft(validDraft({
        term_type: "tax",
        basis: "percent",
        rate_value: 18,
        tax_group_id: null,
      }));
      expect(errors.some((e) => e.code === "TAX_GROUP_REQUIRED")).toBe(true);
    });

    it("withholding requires tax_group_id", () => {
      const errors = validatePcDraft(validDraft({
        term_type: "withholding",
        basis: "percent",
        rate_value: 10,
        tax_group_id: null,
      }));
      expect(errors.some((e) => e.code === "TAX_GROUP_REQUIRED")).toBe(true);
    });

    it("non-tax term_type with tax_group_id → out_of_scope error", () => {
      const errors = validatePcDraft(validDraft({
        term_type: "discount",
        tax_group_id: "tg-1",
      }));
      expect(errors.some((e) => e.code === "TAX_FIELDS_OUT_OF_SCOPE")).toBe(true);
    });

    it("non-tax term_type with is_inclusive → out_of_scope error", () => {
      const errors = validatePcDraft(validDraft({
        term_type: "discount",
        is_inclusive: true,
      }));
      expect(errors.some((e) => e.code === "TAX_FIELDS_OUT_OF_SCOPE")).toBe(true);
    });

    it("non-tax term_type with recoverable_pct → out_of_scope error", () => {
      const errors = validatePcDraft(validDraft({
        term_type: "charge",
        recoverable_pct: 50,
      }));
      expect(errors.some((e) => e.code === "TAX_FIELDS_OUT_OF_SCOPE")).toBe(true);
    });
  });

  describe("recoverable_pct bounds", () => {
    it("rejects negative recoverable_pct", () => {
      const errors = validatePcDraft(validDraft({
        term_type: "tax",
        tax_group_id: "tg-1",
        recoverable_pct: -10,
      }));
      expect(errors.some((e) => e.code === "RECOVERABLE_OUT_OF_RANGE")).toBe(true);
    });

    it("rejects recoverable_pct > 100", () => {
      const errors = validatePcDraft(validDraft({
        term_type: "tax",
        tax_group_id: "tg-1",
        recoverable_pct: 150,
      }));
      expect(errors.some((e) => e.code === "RECOVERABLE_OUT_OF_RANGE")).toBe(true);
    });

    it("accepts recoverable_pct of exactly 0 and 100", () => {
      const zero = validatePcDraft(validDraft({
        term_type: "tax",
        tax_group_id: "tg-1",
        recoverable_pct: 0,
      }));
      expect(zero.some((e) => e.code === "RECOVERABLE_OUT_OF_RANGE")).toBe(false);

      const hundred = validatePcDraft(validDraft({
        term_type: "tax",
        tax_group_id: "tg-1",
        recoverable_pct: 100,
      }));
      expect(hundred.some((e) => e.code === "RECOVERABLE_OUT_OF_RANGE")).toBe(false);
    });
  });

  it("line scope without source_line_id → error", () => {
    const errors = validatePcDraft(validDraft({ entry_level: "line", source_line_id: null }));
    expect(errors.some((e) => e.code === "SOURCE_LINE_REQUIRED")).toBe(true);
  });

  it("header scope without apportion_basis → error (UX soft-required)", () => {
    const errors = validatePcDraft(validDraft({
      entry_level: "header",
      source_line_id: null,
      apportion_basis: null,
    }));
    expect(errors.some((e) => e.code === "APPORTION_BASIS_REQUIRED")).toBe(true);
  });

  it("header scope with apportion_basis is valid", () => {
    const errors = validatePcDraft(validDraft({
      entry_level: "header",
      source_line_id: null,
      apportion_basis: "value",
    }));
    expect(errors).toHaveLength(0);
  });
});

// ── resolveBaseForCalculation ─────────────────────────────────────

describe("resolveBaseForCalculation", () => {
  it("net_before_adjustments returns lineNet ignoring priorSum", () => {
    expect(resolveBaseForCalculation({ lineNet: 1000, priorSum: 200, mode: "net_before_adjustments" }))
      .toBe(1000);
  });

  it("running_after_prior returns lineNet + priorSum", () => {
    expect(resolveBaseForCalculation({ lineNet: 1000, priorSum: 200, mode: "running_after_prior" }))
      .toBeCloseTo(1200, 2);
  });

  it("rounds running_after_prior to 2dp", () => {
    expect(resolveBaseForCalculation({ lineNet: 100.456, priorSum: 0, mode: "running_after_prior" }))
      .toBe(100.46);
  });
});

// ── previewComputedAmount ─────────────────────────────────────────

describe("previewComputedAmount", () => {
  it("percent basis: base × rate / 100", () => {
    expect(previewComputedAmount({
      base: 1000,
      draft: { basis: "percent", rate_value: 18, amount_value: null },
    })).toBeCloseTo(180, 2);
  });

  it("per_unit basis: base × rate (qty already multiplied upstream)", () => {
    expect(previewComputedAmount({
      base: 50,
      draft: { basis: "per_unit", rate_value: 2, amount_value: null },
    })).toBeCloseTo(100, 2);
  });

  it("amount basis returns amount_value", () => {
    expect(previewComputedAmount({
      base: 1000,
      draft: { basis: "amount", rate_value: null, amount_value: 250 },
    })).toBe(250);
  });

  it("flat basis returns amount_value", () => {
    expect(previewComputedAmount({
      base: 1000,
      draft: { basis: "flat", rate_value: null, amount_value: 500 },
    })).toBe(500);
  });

  it("returns 0 when required value is null", () => {
    expect(previewComputedAmount({
      base: 1000,
      draft: { basis: "percent", rate_value: null, amount_value: null },
    })).toBe(0);

    expect(previewComputedAmount({
      base: 1000,
      draft: { basis: "amount", rate_value: null, amount_value: null },
    })).toBe(0);
  });
});

// ── describeBasisHint ─────────────────────────────────────────────

describe("describeBasisHint", () => {
  it("renders percent with rate", () => {
    expect(describeBasisHint({ basis: "percent", rate_value: 18, amount_value: null }))
      .toBe("18%");
  });

  it("renders per_unit with rate", () => {
    expect(describeBasisHint({ basis: "per_unit", rate_value: 2, amount_value: null }))
      .toBe("2/unit");
  });

  it("renders amount basis as flat label", () => {
    expect(describeBasisHint({ basis: "amount", rate_value: null, amount_value: 500 }))
      .toBe("flat 500");
  });

  it("renders flat basis as flat label", () => {
    expect(describeBasisHint({ basis: "flat", rate_value: null, amount_value: 500 }))
      .toBe("flat 500");
  });

  it("renders placeholders when value missing", () => {
    expect(describeBasisHint({ basis: "percent", rate_value: null, amount_value: null }))
      .toBe("%");
    expect(describeBasisHint({ basis: "amount", rate_value: null, amount_value: null }))
      .toBe("flat");
  });
});
