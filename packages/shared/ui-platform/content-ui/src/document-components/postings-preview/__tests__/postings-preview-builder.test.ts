/**
 * Tests for buildPostingsPreview — aggregation, header CR lines,
 * tax recoverable/cost split, drift detection, frozen-state.
 */
import { describe, it, expect } from "vitest";
import { buildPostingsPreview, type BuildPostingsPreviewInput } from "../postings-preview-builder";
import type {
  PurchaseInvoiceHeader,
  PurchaseInvoiceLine,
  PricingComponent,
  AccountingDistribution,
} from "../../../purchase-invoice/types";

// ── Fixtures ──────────────────────────────────────────────────────

function makeHeader(over: Partial<PurchaseInvoiceHeader> = {}): PurchaseInvoiceHeader {
  return {
    id: "pi-1",
    code: "INV-001",
    supplier_invoice_number: "SUP-001",
    supplier_invoice_date: "2026-06-15",
    supplier_label: "Acme",
    status: "draft",
    currency_code: "INR",
    base_currency_code: "INR",
    exchange_rate: 1,
    amounts: {
      subtotal_amount: 10000,
      discount_amount: 0,
      charges_amount: 0,
      tax_amount: 1800,
      withholding_tax_amount: 0,
      retention_amount: 0,
      advance_deduction_amount: 0,
      payable_amount: 11800,
      outstanding_amount: 11800,
    },
    match_type: "three_way",
    match_status: "fully_matched",
    match_exception_count: 0,
    ...over,
  };
}

function makeLine(over: Partial<PurchaseInvoiceLine> = {}): PurchaseInvoiceLine {
  return {
    id: "pil-1",
    line_no: 1,
    item_description: "Item",
    uom_code: "EA",
    quantity: 1,
    unit_price: 10000,
    net_amount: 10000,
    gross_amount: 11800,
    match_status: "fully_matched",
    currency_code: "INR",
    base_currency_code: "INR",
    exchange_rate: 1,
    status: "open",
    ...over,
  };
}

function makeAd(over: Partial<AccountingDistribution> = {}): AccountingDistribution {
  return {
    id: "ad-1",
    distribution_no: 1,
    source_line_id: "pil-1",
    distribution_basis: "PERCENT",
    split_pct: 100,
    split_amount: null,
    split_quantity: null,
    distributed_amount: 11800,
    currency_code: "INR",
    account_source: "PENDING",
    gl_account_id: null,
    gl_account_label: "5100 Office Supplies",
    cost_center_id: null,
    profit_center_id: null,
    project_id: null,
    cost_center_label: null,
    profit_center_label: null,
    project_label: null,
    asset_id: null,
    budget_check_result: null,
    ...over,
  };
}

function makePc(over: Partial<PricingComponent> = {}): PricingComponent {
  return {
    id: "pc-1",
    sequence: 20,
    term_type: "tax",
    condition_type_id: "ct-tax-gst-18",
    condition_type_label: "GST 18%",
    condition_type_code: "TAX_GST_18",
    basis: "percent",
    rate_value: 18,
    amount_value: null,
    base_for_calculation: 10000,
    computed_amount: 1800,
    computed_base_amount: 10000,
    entry_level: "line",
    origin: "manual",
    source_line_id: "pil-1",
    apportion_basis: null,
    is_apportioned: false,
    is_apportioned_from_id: null,
    tax_group_label: "GST 18%",
    is_inclusive: false,
    recoverable_pct: 100,
    tax_section_code: null,
    currency_code: "INR",
    base_currency_code: "INR",
    exchange_rate: 1,
    superseded_by_id: null,
    superseded_at: null,
    superseded_by_user_label: null,
    ...over,
  };
}

function input(over: Partial<BuildPostingsPreviewInput> = {}): BuildPostingsPreviewInput {
  return {
    header: makeHeader(),
    lines: [makeLine()],
    components: [],
    distributions: [],
    ...over,
  };
}

// ── AD aggregation ────────────────────────────────────────────────

describe("buildPostingsPreview — AD aggregation", () => {
  it("groups AD rows by gl_account_label", () => {
    const model = buildPostingsPreview(input({
      distributions: [
        makeAd({ id: "ad-1", gl_account_label: "5100 Office", distributed_amount: 6000 }),
        makeAd({ id: "ad-2", gl_account_label: "5100 Office", distributed_amount: 4000 }),
        makeAd({ id: "ad-3", gl_account_label: "5200 Travel", distributed_amount: 1800 }),
      ],
    }));

    const drRows = model.rows.filter((r) => r.side === "DR" && r.source.kind === "ad_aggregation");
    expect(drRows).toHaveLength(2);

    const officeRow = drRows.find((r) => r.account_label === "5100 Office");
    expect(officeRow?.amount).toBeCloseTo(10000, 2);

    const travelRow = drRows.find((r) => r.account_label === "5200 Travel");
    expect(travelRow?.amount).toBeCloseTo(1800, 2);
  });

  // §7.2: pil_ids must be populated with unique source_line_ids per bucket.
  // Drill-back from the postings preview row depends on it.
  it("populates pil_ids with unique source_line_ids per gl_account bucket", () => {
    const model = buildPostingsPreview(input({
      distributions: [
        // 3 ADs going to "5100 Office" — but only 2 unique source lines (pil-1 and pil-2).
        makeAd({ id: "ad-1", gl_account_label: "5100 Office", source_line_id: "pil-1", distributed_amount: 3000 }),
        makeAd({ id: "ad-2", gl_account_label: "5100 Office", source_line_id: "pil-2", distributed_amount: 4000 }),
        makeAd({ id: "ad-3", gl_account_label: "5100 Office", source_line_id: "pil-1", distributed_amount: 3000 }),
        // 1 AD going to "5200 Travel" from a different line.
        makeAd({ id: "ad-4", gl_account_label: "5200 Travel", source_line_id: "pil-3", distributed_amount: 1800 }),
      ],
    }));

    const officeRow = model.rows.find((r) =>
      r.side === "DR" && r.source.kind === "ad_aggregation" && r.account_label === "5100 Office"
    );
    if (!officeRow || officeRow.source.kind !== "ad_aggregation") throw new Error("expected ad_aggregation row");
    expect(officeRow.source.ad_ids).toEqual(["ad-1", "ad-2", "ad-3"]);
    expect(officeRow.source.pil_ids).toHaveLength(2);
    expect(new Set(officeRow.source.pil_ids)).toEqual(new Set(["pil-1", "pil-2"]));
    // pil_count reports unique source lines, not AD rows.
    expect(officeRow.source.pil_count).toBe(2);

    const travelRow = model.rows.find((r) =>
      r.side === "DR" && r.source.kind === "ad_aggregation" && r.account_label === "5200 Travel"
    );
    if (!travelRow || travelRow.source.kind !== "ad_aggregation") throw new Error("expected ad_aggregation row");
    expect(travelRow.source.pil_ids).toEqual(["pil-3"]);
    expect(travelRow.source.pil_count).toBe(1);
  });

  it("falls back to AD row count when source_line_id missing", () => {
    const model = buildPostingsPreview(input({
      distributions: [
        makeAd({ id: "ad-1", gl_account_label: "5100", source_line_id: null, distributed_amount: 100 }),
        makeAd({ id: "ad-2", gl_account_label: "5100", source_line_id: null, distributed_amount: 200 }),
      ],
    }));
    const row = model.rows.find((r) => r.source.kind === "ad_aggregation");
    if (!row || row.source.kind !== "ad_aggregation") throw new Error("expected ad_aggregation row");
    expect(row.source.pil_ids).toEqual([]);
    expect(row.source.pil_count).toBe(2);
  });

  it("renders a 'will resolve by policy' simulated row when no AD exists", () => {
    const model = buildPostingsPreview(input({
      distributions: [],
      lines: [makeLine({ gross_amount: 11800 })],
    }));

    const simulated = model.rows.find((r) => r.source.kind === "ad_unresolved");
    expect(simulated).toBeDefined();
    expect(simulated?.status).toBe("simulated");
    expect(simulated?.amount).toBeCloseTo(11800, 2);
  });
});

// ── Tax recoverable / cost split ──────────────────────────────────

describe("buildPostingsPreview — tax PC recoverable/cost split", () => {
  it("100% recoverable → only Input tax DR line", () => {
    const model = buildPostingsPreview(input({
      components: [makePc({ recoverable_pct: 100, computed_amount: 1800 })],
    }));

    const recoverable = model.rows.find((r) => r.source.kind === "pc_tax_recoverable");
    const cost = model.rows.find((r) => r.source.kind === "pc_tax_cost");

    expect(recoverable?.amount).toBeCloseTo(1800, 2);
    expect(cost).toBeUndefined();
  });

  it("0% recoverable → only Cost-of-goods DR line", () => {
    const model = buildPostingsPreview(input({
      components: [makePc({ recoverable_pct: 0, computed_amount: 1800 })],
    }));

    const recoverable = model.rows.find((r) => r.source.kind === "pc_tax_recoverable");
    const cost = model.rows.find((r) => r.source.kind === "pc_tax_cost");

    expect(recoverable).toBeUndefined();
    expect(cost?.amount).toBeCloseTo(1800, 2);
  });

  it("partial recoverable → both DR lines with correct split", () => {
    const model = buildPostingsPreview(input({
      components: [makePc({ recoverable_pct: 80, computed_amount: 1000 })],
    }));

    const recoverable = model.rows.find((r) => r.source.kind === "pc_tax_recoverable");
    const cost = model.rows.find((r) => r.source.kind === "pc_tax_cost");

    expect(recoverable?.amount).toBeCloseTo(800, 2);
    expect(cost?.amount).toBeCloseTo(200, 2);
  });

  it("withholding term_type also routes through tax split", () => {
    const model = buildPostingsPreview(input({
      components: [makePc({
        term_type: "withholding",
        recoverable_pct: 100,
        computed_amount: 500,
      })],
    }));

    const recoverable = model.rows.find((r) => r.source.kind === "pc_tax_recoverable");
    expect(recoverable?.amount).toBeCloseTo(500, 2);
  });

  it("sums multiple tax rows of the same recoverability class", () => {
    const model = buildPostingsPreview(input({
      components: [
        makePc({ id: "pc-1", recoverable_pct: 100, computed_amount: 1800 }),
        makePc({ id: "pc-2", recoverable_pct: 100, computed_amount: 200 }),
      ],
    }));

    const recoverable = model.rows.find((r) => r.source.kind === "pc_tax_recoverable");
    expect(recoverable?.amount).toBeCloseTo(2000, 2);
  });
});

// ── Header CR lines (§A7 single source of truth) ──────────────────

describe("buildPostingsPreview — header CR lines", () => {
  it("adds AP payable CR row from header.amounts.payable_amount", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({
        amounts: {
          subtotal_amount: 10000, discount_amount: 0, charges_amount: 0, tax_amount: 0,
          withholding_tax_amount: 0, retention_amount: 0, advance_deduction_amount: 0,
          payable_amount: 11800, outstanding_amount: 11800,
        },
      }),
    }));

    const apRow = model.rows.find((r) =>
      r.source.kind === "ap_payable_header"
    );
    expect(apRow?.side).toBe("CR");
    expect(apRow?.amount).toBeCloseTo(11800, 2);
  });

  it("adds Retention payable CR row when retention > 0", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({
        amounts: {
          subtotal_amount: 10000, discount_amount: 0, charges_amount: 0, tax_amount: 0,
          withholding_tax_amount: 0, retention_amount: 500,
          advance_deduction_amount: 0,
          payable_amount: 11300, outstanding_amount: 11300,
        },
      }),
    }));

    const retentionRow = model.rows.find((r) =>
      r.source.kind === "ap_retention_payable_header"
    );
    expect(retentionRow?.side).toBe("CR");
    expect(retentionRow?.amount).toBeCloseTo(500, 2);
  });

  it("adds Withholding payable CR row when withholding > 0", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({
        amounts: {
          subtotal_amount: 10000, discount_amount: 0, charges_amount: 0, tax_amount: 0,
          withholding_tax_amount: 200, retention_amount: 0,
          advance_deduction_amount: 0,
          payable_amount: 11600, outstanding_amount: 11600,
        },
      }),
    }));

    const whtRow = model.rows.find((r) =>
      r.source.kind === "withholding_payable_header"
    );
    expect(whtRow?.side).toBe("CR");
    expect(whtRow?.amount).toBeCloseTo(200, 2);
  });

  it("omits CR rows whose header amount is zero", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({
        amounts: {
          subtotal_amount: 10000, discount_amount: 0, charges_amount: 0, tax_amount: 0,
          withholding_tax_amount: 0, retention_amount: 0,
          advance_deduction_amount: 0,
          payable_amount: 0, outstanding_amount: 0,
        },
      }),
    }));

    expect(model.rows.find((r) => r.side === "CR")).toBeUndefined();
  });
});

// ── Posted state freezes statuses ─────────────────────────────────

describe("buildPostingsPreview — posted state", () => {
  it("marks all rows as 'frozen' when status is posted", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({ status: "posted" }),
      distributions: [makeAd({ distributed_amount: 11800 })],
      components: [makePc({ recoverable_pct: 100, computed_amount: 1800 })],
    }));

    expect(model.is_posted).toBe(true);
    expect(model.rows.every((r) => r.status === "frozen")).toBe(true);
  });

  it("marks rows 'frozen' for partially_paid / fully_paid / reversed too", () => {
    for (const status of ["partially_paid", "fully_paid", "reversed"] as const) {
      const model = buildPostingsPreview(input({
        header: makeHeader({ status }),
        distributions: [makeAd({ distributed_amount: 11800 })],
      }));
      expect(model.is_posted, `status=${status}`).toBe(true);
      expect(model.rows.every((r) => r.status === "frozen"), `status=${status}`).toBe(true);
    }
  });

  it("marks rows 'live' for draft / pending_approval / approved", () => {
    for (const status of ["draft", "pending_approval", "approved"] as const) {
      const model = buildPostingsPreview(input({
        header: makeHeader({ status }),
        distributions: [makeAd({ distributed_amount: 11800 })],
      }));
      expect(model.is_posted, `status=${status}`).toBe(false);
      const adRow = model.rows.find((r) => r.source.kind === "ad_aggregation");
      expect(adRow?.status, `status=${status}`).toBe("live");
    }
  });
});

// ── Balance + drift ───────────────────────────────────────────────

describe("buildPostingsPreview — balance and drift", () => {
  it("computes total_dr and total_cr", () => {
    const model = buildPostingsPreview(input({
      distributions: [makeAd({ distributed_amount: 11800 })],
    }));
    expect(model.total_dr).toBeCloseTo(11800, 2);
    expect(model.total_cr).toBeCloseTo(11800, 2);
    expect(model.balanced).toBe(true);
  });

  it("flags drift when cached payable disagrees with computed", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({
        amounts: {
          subtotal_amount: 10000, discount_amount: 0, charges_amount: 0, tax_amount: 1800,
          withholding_tax_amount: 0, retention_amount: 0,
          advance_deduction_amount: 0,
          payable_amount: 12000, // cache wrong — gross is 11800
          outstanding_amount: 12000,
        },
      }),
      lines: [makeLine({ gross_amount: 11800 })],
    }));

    expect(model.drift).not.toBeNull();
    expect(model.drift!.delta).toBeCloseTo(200, 2);
  });

  it("no drift when cached payable agrees with computed", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({
        amounts: {
          subtotal_amount: 10000, discount_amount: 0, charges_amount: 0, tax_amount: 1800,
          withholding_tax_amount: 0, retention_amount: 0,
          advance_deduction_amount: 0,
          payable_amount: 11800,
          outstanding_amount: 11800,
        },
      }),
      lines: [makeLine({ gross_amount: 11800 })],
    }));

    expect(model.drift).toBeNull();
  });

  it("respects drift_tolerance for small rounding diffs", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({
        amounts: {
          subtotal_amount: 10000, discount_amount: 0, charges_amount: 0, tax_amount: 1800,
          withholding_tax_amount: 0, retention_amount: 0,
          advance_deduction_amount: 0,
          payable_amount: 11800.005, // tiny cache delta
          outstanding_amount: 11800.005,
        },
      }),
      lines: [makeLine({ gross_amount: 11800 })],
      drift_tolerance: 0.01,
    }));

    expect(model.drift).toBeNull();
  });
});

// ── JE link plumbing ──────────────────────────────────────────────

describe("buildPostingsPreview — JE link", () => {
  it("passes journal_entry_code through when posted", () => {
    const model = buildPostingsPreview(input({
      header: makeHeader({ status: "posted" }),
      journal_entry_code: "JE-2026-04531",
      journal_entry_date: "2026-06-15",
    }));

    expect(model.journal_entry_code).toBe("JE-2026-04531");
    expect(model.journal_entry_date).toBe("2026-06-15");
  });
});
