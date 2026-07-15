/**
 * v3.1 Medium-1 — deterministic override selection.
 *
 * `projectHeaderScopeProjections` must pick the SAME override row for a
 * given (condition_type_code, source_line_id) regardless of the order
 * the API returned the line-scope PCs. The selection rule is "most
 * recent active candidate wins"; we encode "most recent" as id DESC
 * (uuidv7 puts the creation timestamp in the high bits).
 *
 * Without this fix, two active candidates from a brief supersession
 * window would let Map's last-write-wins semantics leak into the UI,
 * making which-override-displays depend on undocumented API ordering.
 */
import { describe, it, expect } from "vitest";
import { projectHeaderScopeProjections } from "../projections";
import type {
  PricingComponent,
  PurchaseInvoiceLine,
  HeaderPcProjection,
} from "../types";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeLine(over: Partial<PurchaseInvoiceLine> = {}): PurchaseInvoiceLine {
  return {
    id:                  "pil-1",
    line_no:             1,
    item_id:             "item-1",
    item_description:    "Widget",
    procurement_type:    "goods",
    quantity:            10,
    uom_code:            "EA",
    unit_price:          100,
    price_unit:          1,
    net_amount:          1000,
    discount_pct:        0,
    discount_amount:     0,
    tax_amount:          0,
    withholding_tax_amount: 0,
    gross_amount:        1000,
    currency_code:       "INR",
    base_currency_code:  "INR",
    exchange_rate:       1,
    status:              "open",
    ...over,
  } as PurchaseInvoiceLine;
}

function makeHeaderPc(over: Partial<PricingComponent> = {}): PricingComponent {
  return {
    id:                     "pc-header",
    sequence:               100,
    term_type:              "charge",
    condition_type_id:      "ct-freight",
    condition_type_label:   "Freight",
    condition_type_code:    "FREIGHT",
    basis:                  "amount",
    rate_value:             null,
    amount_value:           60,
    base_for_calculation:   null,
    computed_amount:        60,
    computed_base_amount:   60,
    entry_level:            "header",
    origin:                 "manual",
    source_line_id:         null,
    apportion_basis:        "value",
    is_apportioned:         true,
    is_apportioned_from_id: null,
    tax_group_label:        null,
    is_inclusive:           null,
    recoverable_pct:        null,
    tax_section_code:       null,
    currency_code:          "INR",
    base_currency_code:     "INR",
    exchange_rate:          1,
    superseded_by_id:       null,
    superseded_at:          null,
    superseded_by_user_label: null,
    ...over,
  } as PricingComponent;
}

function makeOverrideRow(over: Partial<PricingComponent> = {}): PricingComponent {
  return {
    ...makeHeaderPc(),
    sequence:               100,
    condition_type_id:      "ct-freight",
    condition_type_label:   "Freight",
    condition_type_code:    "FREIGHT",
    basis:                  "amount",
    entry_level:            "line",
    source_line_id:         "pil-1",
    is_apportioned:         false,
    is_apportioned_from_id: null,
    origin:                 "manual",
    ...over,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("projectHeaderScopeProjections — deterministic override selection (Medium-1)", () => {
  const headerPc = makeHeaderPc();
  const line     = makeLine();

  // Two candidates for the same (condition_type_code, source_line_id).
  // The "newer" one has the higher uuidv7 id (lexicographically later).
  // Older v1: id starts with 01900000…
  // Newer v2: id starts with 019aaaaa… (higher in lex order)
  const olderV1 = makeOverrideRow({
    id:              "01900000-0000-7000-8000-000000000001",
    computed_amount: 18,
  });
  const newerV2 = makeOverrideRow({
    id:              "019aaaaa-0000-7000-8000-000000000002",
    computed_amount: 21,
  });

  function getOverride(projections: HeaderPcProjection[]): { amount: number | null; ok: boolean } {
    const proj = projections[0];
    if (!proj) return { amount: null, ok: false };
    const alloc = proj.allocations.find((a) => a.line_id === "pil-1");
    if (!alloc) return { amount: null, ok: false };
    return { amount: alloc.override_amount, ok: alloc.overridden };
  }

  it("picks newer v2 when input is (v2, v1)", () => {
    const projections = projectHeaderScopeProjections([headerPc], [line], [newerV2, olderV1]);
    const { amount, ok } = getOverride(projections);
    expect(ok).toBe(true);
    expect(amount).toBe(21);
  });

  it("picks newer v2 when input is (v1, v2) — same result regardless of order", () => {
    const projections = projectHeaderScopeProjections([headerPc], [line], [olderV1, newerV2]);
    const { amount, ok } = getOverride(projections);
    expect(ok).toBe(true);
    expect(amount).toBe(21);
  });

  it("returns no override when neither matches the condition_type_code", () => {
    const otherCondition = makeOverrideRow({
      id:                  "019aaaaa-0000-7000-8000-000000000099",
      condition_type_code: "DISC_TRADE",
      computed_amount:     50,
    });
    const projections = projectHeaderScopeProjections([headerPc], [line], [otherCondition]);
    const { ok } = getOverride(projections);
    expect(ok).toBe(false);
  });

  it("treats different lines independently — each line picks its own newest", () => {
    const lineA = makeLine({ id: "pil-A", line_no: 1, net_amount: 600 });
    const lineB = makeLine({ id: "pil-B", line_no: 2, net_amount: 400 });
    const overrideA_v1 = makeOverrideRow({
      id:              "01900000-0000-7000-8000-00000000000A",
      source_line_id:  "pil-A",
      computed_amount: 30,
    });
    const overrideA_v2 = makeOverrideRow({
      id:              "019aaaaa-0000-7000-8000-00000000000A",
      source_line_id:  "pil-A",
      computed_amount: 35,
    });
    const overrideB_v1 = makeOverrideRow({
      id:              "01900000-0000-7000-8000-00000000000B",
      source_line_id:  "pil-B",
      computed_amount: 20,
    });

    const projections = projectHeaderScopeProjections(
      [headerPc],
      [lineA, lineB],
      // Deliberately shuffled to exercise the sort.
      [overrideB_v1, overrideA_v1, overrideA_v2],
    );

    const proj = projections[0]!;
    const allocA = proj.allocations.find((a) => a.line_id === "pil-A")!;
    const allocB = proj.allocations.find((a) => a.line_id === "pil-B")!;
    expect(allocA.override_amount).toBe(35); // pil-A's v2 (newer)
    expect(allocB.override_amount).toBe(20); // pil-B's v1 (only one)
  });
});
