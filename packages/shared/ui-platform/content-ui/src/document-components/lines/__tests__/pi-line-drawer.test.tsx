import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PiLineDrawer } from "../pi-line-drawer";
import type { PricingComponent, PurchaseInvoiceLine } from "../../../purchase-invoice/types";

const line: PurchaseInvoiceLine = {
  id: "line-1",
  line_no: 1,
  item_description: "SOFTWARE IMPLEMENTATION SERVICES",
  uom_code: "EA",
  quantity: 1,
  unit_price: 121.25,
  net_amount: 121.25,
  gross_amount: 133.38,
  match_status: "unmatched",
  currency_code: "MYR",
  base_currency_code: "MYR",
  exchange_rate: 1,
  status: "open",
};

const appliedTax: PricingComponent = {
  id: "applied:header-tax:line-1",
  sequence: 23,
  term_type: "tax",
  condition_type_id: "ct-tax",
  condition_type_label: "Sales Tax",
  condition_type_code: "SALES_TAX",
  basis: "percent",
  rate_value: 10,
  amount_value: null,
  base_for_calculation: 121.25,
  computed_amount: 12.13,
  computed_base_amount: 12.13,
  entry_level: "line",
  origin: "system_resolved",
  source_line_id: "line-1",
  apportion_basis: null,
  is_apportioned: false,
  is_apportioned_from_id: "header-tax",
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
};

const lineCharge: PricingComponent = {
  ...appliedTax,
  id: "line-charge",
  sequence: 40,
  term_type: "charge",
  condition_type_id: "ct-charge",
  condition_type_label: "Freight In",
  condition_type_code: "FREIGHT_IN",
  basis: "amount",
  rate_value: null,
  amount_value: 8,
  base_for_calculation: 121.25,
  computed_amount: 8,
  computed_base_amount: 8,
  origin: "manual",
  is_apportioned_from_id: null,
  recoverable_pct: null,
};

function renderDrawer(props: Partial<React.ComponentProps<typeof PiLineDrawer>> = {}) {
  return render(
    <PiLineDrawer
      line={line}
      appliedHeaderComponents={[]}
      components={[]}
      distributions={[]}
      componentsAffordance="edit"
      distributionsAffordance="edit"
      onJumpToHeaderRow={() => undefined}
      {...props}
    />,
  );
}

describe("pi-line-drawer", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows document-applied components as read-only and keeps line components separate", () => {
    renderDrawer({
      appliedHeaderComponents: [appliedTax],
      components: [lineCharge],
    });

    expect(screen.getByText("Applied from document")).toBeTruthy();
    expect(screen.getByText("Document applied")).toBeTruthy();
    expect(screen.getAllByText("Line components").length).toBeGreaterThan(0);
    expect(screen.getByText("Sales Tax")).toBeTruthy();
    expect(screen.getByText("10% on MYR 121.25")).toBeTruthy();
    expect(screen.getByText("from document")).toBeTruthy();
    expect(screen.getByText("read-only")).toBeTruthy();

    expect(screen.getByText("Freight In")).toBeTruthy();
  });

  it("does not collapse document-applied impact into the empty line-component message", () => {
    renderDrawer({
      appliedHeaderComponents: [appliedTax],
      components: [],
    });

    expect(screen.getByText("Applied from document")).toBeTruthy();
    expect(screen.getByText("Line components")).toBeTruthy();
    expect(screen.getByText("none yet")).toBeTruthy();
    expect(screen.queryByText(/No components\. Net = Gross/i)).toBeNull();
  });

  it("hides fetched line rows that duplicate the projected header allocation", () => {
    renderDrawer({
      appliedHeaderComponents: [appliedTax],
      components: [{
        ...appliedTax,
        id: "legacy-child-without-lineage",
        origin: "manual",
        is_apportioned_from_id: null,
      }],
    });

    expect(screen.getByText("Applied from document")).toBeTruthy();
    expect(screen.getByText("Line components")).toBeTruthy();
    expect(screen.getByText("none yet")).toBeTruthy();
    expect(screen.getAllByText("Sales Tax")).toHaveLength(1);
  });
});
