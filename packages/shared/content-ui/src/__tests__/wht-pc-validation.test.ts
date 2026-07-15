/**
 * WHT pricing-component validation tests (WS-G).
 *
 * Covers the validateWhtInput() gate in pricing-component.service.ts
 * by exercising the client-mirror in validatePcDraft (helpers.ts). The
 * server gate runs against the same rules with a DB-driven jurisdiction
 * lookup — these unit tests focus on the deterministic invariants
 * (recoverable, inclusive, metadata snapshot, section-code required).
 *
 * Integration tests in purchase-invoice-lifecycle.integration.test.ts
 * exercise the server gate end-to-end.
 */

import { describe, it, expect } from "vitest";
import {
  validatePcDraft,
  type PcDraft,
} from "../document-components/pricing-components/drawers/helpers";

function baseWhtDraft(overrides: Partial<PcDraft> = {}): PcDraft {
  return {
    term_type:         "withholding",
    basis:             "percent",
    rate_value:        2,
    amount_value:      null,
    tax_group_id:      "tg-1",
    is_inclusive:      false,
    recoverable_pct:   0,
    tax_section_code:  "194C",
    metadata: {
      rate_schedule_id: "rs-india-tds-194c-2pct",
      wht_basis:        "GROSS",
      resolved_rate:    2,
    },
    entry_level:       "line",
    source_line_id:    "line-1",
    apportion_basis:   null,
    condition_type_id: "ct-wht-generic",
    sequence:          400,
    ...overrides,
  };
}

describe("validatePcDraft — WHT invariants", () => {
  it("accepts a well-formed WHT draft", () => {
    const errors = validatePcDraft(baseWhtDraft());
    expect(errors).toEqual([]);
  });

  it("rejects WHT with is_inclusive=true (WHT is always exclusive)", () => {
    const errors = validatePcDraft(baseWhtDraft({ is_inclusive: true }));
    expect(errors.some((e) => e.code === "WHT_IS_INCLUSIVE_FORBIDDEN")).toBe(true);
  });

  it("accepts WHT with is_inclusive=false or null", () => {
    expect(validatePcDraft(baseWhtDraft({ is_inclusive: false })).filter(
      (e) => e.code === "WHT_IS_INCLUSIVE_FORBIDDEN"
    )).toEqual([]);
    expect(validatePcDraft(baseWhtDraft({ is_inclusive: null })).filter(
      (e) => e.code === "WHT_IS_INCLUSIVE_FORBIDDEN"
    )).toEqual([]);
  });

  it("rejects WHT with recoverable_pct > 0 (WHT is not an input credit)", () => {
    const errors = validatePcDraft(baseWhtDraft({ recoverable_pct: 50 }));
    expect(errors.some((e) => e.code === "WHT_RECOVERABLE_PCT_FORBIDDEN")).toBe(true);
  });

  it("accepts WHT with recoverable_pct = 0 or null", () => {
    expect(validatePcDraft(baseWhtDraft({ recoverable_pct: 0 })).filter(
      (e) => e.code === "WHT_RECOVERABLE_PCT_FORBIDDEN"
    )).toEqual([]);
    expect(validatePcDraft(baseWhtDraft({ recoverable_pct: null })).filter(
      (e) => e.code === "WHT_RECOVERABLE_PCT_FORBIDDEN"
    )).toEqual([]);
  });

  it("rejects WHT missing the metadata snapshot", () => {
    const noMeta = validatePcDraft(baseWhtDraft({ metadata: undefined }));
    expect(noMeta.some((e) => e.code === "WHT_METADATA_SNAPSHOT_REQUIRED")).toBe(true);

    const emptyMeta = validatePcDraft(baseWhtDraft({ metadata: {} }));
    expect(emptyMeta.some((e) => e.code === "WHT_METADATA_SNAPSHOT_REQUIRED")).toBe(true);

    const partialMeta = validatePcDraft(baseWhtDraft({
      metadata: { rate_schedule_id: "rs-1" }, // missing wht_basis + resolved_rate
    }));
    expect(partialMeta.some((e) => e.code === "WHT_METADATA_SNAPSHOT_REQUIRED")).toBe(true);
  });

  it("rejects WHT missing section_code when jurisdiction requires it", () => {
    const errors = validatePcDraft(
      baseWhtDraft({ tax_section_code: null }),
      { wht_section_required: true },
    );
    expect(errors.some((e) => e.code === "WHT_SECTION_CODE_REQUIRED")).toBe(true);
  });

  it("accepts WHT without section_code when jurisdiction doesn't require it", () => {
    const errors = validatePcDraft(
      baseWhtDraft({ tax_section_code: null }),
      { wht_section_required: false },
    );
    expect(errors.filter((e) => e.code === "WHT_SECTION_CODE_REQUIRED")).toEqual([]);
  });

  it("rejects WHT missing tax_group_id", () => {
    const errors = validatePcDraft(baseWhtDraft({ tax_group_id: null }));
    expect(errors.some((e) => e.code === "TAX_GROUP_REQUIRED")).toBe(true);
  });

  it("does not trip WHT-specific rules on non-WHT term types", () => {
    const taxDraft: PcDraft = {
      ...baseWhtDraft(),
      term_type:        "tax",
      is_inclusive:     true,
      recoverable_pct:  50,
      metadata:         undefined,
    };
    const errors = validatePcDraft(taxDraft);
    expect(errors.some((e) => e.code === "WHT_IS_INCLUSIVE_FORBIDDEN")).toBe(false);
    expect(errors.some((e) => e.code === "WHT_RECOVERABLE_PCT_FORBIDDEN")).toBe(false);
    expect(errors.some((e) => e.code === "WHT_METADATA_SNAPSHOT_REQUIRED")).toBe(false);
  });
});
