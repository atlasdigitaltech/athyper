import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingComponentWaterfall } from "../pricing-component-waterfall";
import type { PricingComponent } from "../../../purchase-invoice/types";

const taxComponent: PricingComponent = {
  id: "tax-pc-1",
  sequence: 23,
  term_type: "tax",
  condition_type_id: "ct-tax",
  condition_type_label: "Sales Tax",
  condition_type_code: "SALES_TAX",
  basis: "percent",
  rate_value: 10,
  amount_value: null,
  base_for_calculation: 93.94,
  computed_amount: 9.39,
  computed_base_amount: 9.39,
  entry_level: "line",
  origin: "manual",
  source_line_id: "line-1",
  apportion_basis: null,
  is_apportioned: false,
  is_apportioned_from_id: null,
  tax_group_label: "MY SST Sales 10%",
  is_inclusive: false,
  recoverable_pct: 100,
  tax_section_code: null,
  currency_code: "MYR",
  base_currency_code: "MYR",
  exchange_rate: 1,
  superseded_by_id: null,
  superseded_at: null,
  superseded_by_user_label: null,
  metadata: {
    taxable_base_mode: "after_discounts",
    taxable_base_amount: 93.94,
  },
};

describe("pricing-component-waterfall", () => {
  it("shows tax basis using the actual taxable base amount", () => {
    render(
      <PricingComponentWaterfall
        components={[taxComponent]}
        lineNetAmount={121.25}
        currencyCode="MYR"
        baseCurrencyCode="MYR"
        exchangeRate={1}
        affordance="edit"
        onJumpToHeaderRow={() => undefined}
      />,
    );

    expect(screen.getByText("10% on MYR 93.94")).toBeTruthy();
    expect(screen.queryByText("10% on net + charges")).toBeNull();
    expect(screen.getByLabelText(/Base after discounts: MYR 93.94/)).toBeTruthy();
    expect(screen.getByLabelText(/10% x MYR 93.94 = MYR 9.39/)).toBeTruthy();
  });
});
