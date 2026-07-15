import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiscountDrawer } from "../discount-drawer";
import { TaxDrawer } from "../tax-drawer";
import { WhtDrawer } from "../wht-drawer";
import type { PricingComponent, PurchaseInvoiceLine } from "../../../../purchase-invoice/types";

const line: PurchaseInvoiceLine = {
  id: "line-1",
  line_no: 1,
  item_description: "SOFTWARE IMPLEMENTATION SERVICES",
  uom_code: "EA",
  quantity: 1,
  unit_price: 121.25,
  net_amount: 121.25,
  gross_amount: 121.25,
  match_status: "unmatched",
  currency_code: "MYR",
  base_currency_code: "MYR",
  exchange_rate: 1,
  status: "open",
};

const component: PricingComponent = {
  id: "pc-1",
  sequence: 10,
  term_type: "discount",
  condition_type_id: "ct-discount",
  condition_type_label: "Commercial Discount",
  condition_type_code: "COMMERCIAL_DISCOUNT",
  basis: "percent",
  rate_value: 10,
  amount_value: null,
  base_for_calculation: 121.25,
  computed_amount: 12.13,
  computed_base_amount: 121.25,
  entry_level: "line",
  origin: "manual",
  source_line_id: "line-1",
  apportion_basis: null,
  is_apportioned: false,
  is_apportioned_from_id: null,
  tax_group_label: null,
  is_inclusive: null,
  recoverable_pct: null,
  tax_section_code: null,
  currency_code: "MYR",
  base_currency_code: "MYR",
  exchange_rate: 1,
  superseded_by_id: null,
  superseded_at: null,
  superseded_by_user_label: null,
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  piCode: "PO-001",
  piSupplierLabel: "Supplier",
  piStatus: "draft" as const,
  lines: [line],
  currencyCode: "MYR",
  baseCurrencyCode: "MYR",
  exchangeRate: 1,
  invoiceNetAmount: 121.25,
  conditionTypes: [{
    id: "ct-discount",
    code: "COMMERCIAL_DISCOUNT",
    label: "Commercial Discount",
    default_sequence: 10,
  }, {
    id: "ct-prompt",
    code: "PROMPT_PAYMENT_DISCOUNT",
    label: "Prompt Payment Discount",
    default_sequence: 11,
  }],
};

describe("DiscountDrawer draft edit mode", () => {
  it("renders draft edits as ordinary edits, not component replacement", () => {
    render(
      <DiscountDrawer
        {...baseProps}
        mode="edit"
        replacingComponent={component}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Edit discount")).toBeTruthy();
    expect(screen.getByText("Line 1 · SOFTWARE IMPLEMENTATION SERVICES")).toBeTruthy();
    expect(screen.getByText("Locked to this line")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByText("All lines")).toBeNull();
    expect(screen.queryByText("One line")).toBeNull();
    expect(screen.queryByText("Calculation base")).toBeNull();
    expect(screen.queryByText("Supersede mode")).toBeNull();
    expect(screen.queryByText(/Replacing/i)).toBeNull();
    expect(screen.queryByText("Replace as v2")).toBeNull();
    expect(screen.queryByText(/Reason for replacement/i)).toBeNull();
  });

  it("submits the existing component id so draft edit patches in place", async () => {
    const onSubmit = vi.fn();

    render(
      <DiscountDrawer
        {...baseProps}
        mode="edit"
        replacingComponent={component}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        replacingId: "pc-1",
        reason: undefined,
      }));
    });
  });

  it("refreshes form state when editing a different discount row", async () => {
    const promptPaymentComponent: PricingComponent = {
      ...component,
      id: "pc-2",
      sequence: 11,
      condition_type_id: "ct-prompt",
      condition_type_label: "Prompt Payment Discount",
      condition_type_code: "PROMPT_PAYMENT_DISCOUNT",
      rate_value: 10,
      computed_amount: 12.13,
    };

    const { rerender } = render(
      <DiscountDrawer
        {...baseProps}
        mode="edit"
        replacingComponent={{
          ...component,
          rate_value: 5,
          computed_amount: 6.06,
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Commercial Discount")).toBeTruthy();
    expect(screen.getByDisplayValue("5")).toBeTruthy();

    rerender(
      <DiscountDrawer
        {...baseProps}
        mode="edit"
        replacingComponent={promptPaymentComponent}
        onSubmit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Prompt Payment Discount")).toBeTruthy();
      expect(screen.getByDisplayValue("10")).toBeTruthy();
    });
  });

  it("keeps true replacement mode explicit", () => {
    render(
      <DiscountDrawer
        {...baseProps}
        mode="replace"
        replacingComponent={component}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Replace discount")).toBeTruthy();
    expect(screen.getByText("Supersede mode")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace as v2" })).toBeTruthy();
  });
});

describe("TaxDrawer draft edit mode", () => {
  it("defaults tax to after prior discounts and submits the taxable base", async () => {
    const onSubmit = vi.fn();
    const firstDiscount: PricingComponent = {
      ...component,
      id: "discount-pc-1",
      sequence: 10,
      term_type: "discount",
      basis: "percent",
      rate_value: 5,
      amount_value: null,
      computed_amount: 6.06,
      source_line_id: "line-1",
    };
    const secondDiscount: PricingComponent = {
      ...component,
      id: "discount-pc-2",
      sequence: 10,
      term_type: "discount",
      basis: "flat",
      rate_value: null,
      amount_value: 21.25,
      computed_amount: 21.25,
      source_line_id: "line-1",
    };

    render(
      <TaxDrawer
        mode="add"
        open
        onOpenChange={vi.fn()}
        piCode="PO-001"
        piSupplierLabel="Supplier"
        piStatus="draft"
        lines={[line]}
        currencyCode="MYR"
        baseCurrencyCode="MYR"
        exchangeRate={1}
        invoiceNetAmount={121.25}
        taxGroups={[{
          id: "tax-group-1",
          code: "VAT",
          label: "VAT 10%",
          default_rate: 10,
          default_recoverable_pct: 100,
        }]}
        conditionTypeId="ct-tax"
        conditionTypeSequence={23}
        derivedPlaceOfSupply="inter_state"
        components={[firstDiscount, secondDiscount]}
        initialApplyTo="one_item"
        initialLineId="line-1"
        onSubmit={onSubmit}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("After discounts")).toBeTruthy();
      expect(screen.getAllByText(/MYR 93.94/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/MYR 9.39/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add tax" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        draft: expect.objectContaining({
          base_for_calculation: 93.94,
          metadata: expect.objectContaining({
            taxable_base_mode: "after_discounts",
            taxable_base_amount: 93.94,
          }),
        }),
      }));
    });
  });

  it("can calculate tax only on selected charges", async () => {
    const onSubmit = vi.fn();
    const freightCharge: PricingComponent = {
      ...component,
      id: "charge-pc-1",
      sequence: 40,
      term_type: "charge",
      condition_type_id: "ct-freight",
      condition_type_label: "Freight In",
      condition_type_code: "FREIGHT_IN",
      basis: "flat",
      rate_value: null,
      amount_value: 18.75,
      computed_amount: 18.75,
      source_line_id: "line-1",
    };

    render(
      <TaxDrawer
        mode="add"
        open
        onOpenChange={vi.fn()}
        piCode="PO-001"
        piSupplierLabel="Supplier"
        piStatus="draft"
        lines={[line]}
        currencyCode="MYR"
        baseCurrencyCode="MYR"
        exchangeRate={1}
        invoiceNetAmount={121.25}
        taxGroups={[{
          id: "tax-group-1",
          code: "VAT",
          label: "VAT 10%",
          default_rate: 10,
          default_recoverable_pct: 100,
        }]}
        conditionTypeId="ct-tax"
        conditionTypeSequence={23}
        derivedPlaceOfSupply="inter_state"
        components={[freightCharge]}
        initialApplyTo="one_item"
        initialLineId="line-1"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Charges only/i }));

    await waitFor(() => {
      expect(screen.getByText("Freight In")).toBeTruthy();
      expect(screen.getAllByText(/MYR 18.75/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/MYR 1.88/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add tax" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        draft: expect.objectContaining({
          base_for_calculation: 18.75,
          metadata: expect.objectContaining({
            taxable_base_mode: "charges_only",
            taxable_base_amount: 18.75,
            taxable_base_charge_ids: ["charge-pc-1"],
          }),
        }),
      }));
    });
  });

  it("can calculate tax on a manually entered partial taxable amount", async () => {
    const onSubmit = vi.fn();
    const partialLine: PurchaseInvoiceLine = {
      ...line,
      net_amount: 100,
      gross_amount: 100,
      unit_price: 100,
    };

    render(
      <TaxDrawer
        mode="add"
        open
        onOpenChange={vi.fn()}
        piCode="PO-001"
        piSupplierLabel="Supplier"
        piStatus="draft"
        lines={[partialLine]}
        currencyCode="MYR"
        baseCurrencyCode="MYR"
        exchangeRate={1}
        invoiceNetAmount={100}
        taxGroups={[{
          id: "tax-group-1",
          code: "VAT",
          label: "VAT 10%",
          default_rate: 10,
          default_recoverable_pct: 100,
        }]}
        conditionTypeId="ct-tax"
        conditionTypeSequence={23}
        derivedPlaceOfSupply="inter_state"
        initialApplyTo="one_item"
        initialLineId="line-1"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Custom amount/i }));
    fireEvent.change(screen.getByLabelText("Taxable amount"), { target: { value: "25" } });

    await waitFor(() => {
      expect(screen.getAllByText(/MYR 25.00/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/MYR 2.50/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add tax" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        draft: expect.objectContaining({
          base_for_calculation: 25,
          metadata: expect.objectContaining({
            taxable_base_mode: "manual_amount",
            taxable_base_amount: 25,
            taxable_base_source_amount: 100,
            taxable_base_manual_pct: 25,
          }),
        }),
      }));
    });
  });

  it("renders line-scope edits with the locked scope card", () => {
    render(
      <TaxDrawer
        mode="edit"
        open
        onOpenChange={vi.fn()}
        piCode="PO-001"
        piSupplierLabel="Supplier"
        piStatus="draft"
        lines={[line]}
        currencyCode="MYR"
        baseCurrencyCode="MYR"
        exchangeRate={1}
        invoiceNetAmount={121.25}
        taxGroups={[{
          id: "tax-group-1",
          code: "VAT",
          label: "VAT 5%",
          default_rate: 5,
          default_recoverable_pct: 100,
        }]}
        derivedPlaceOfSupply="inter_state"
        replacingComponent={{
          ...component,
          id: "tax-pc-1",
          term_type: "tax",
          condition_type_id: "ct-tax",
          condition_type_label: "VAT",
          condition_type_code: "VAT",
          tax_group_label: "VAT 5%",
          rate_value: 5,
          computed_amount: 6.06,
          recoverable_pct: 100,
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Edit tax")).toBeTruthy();
    expect(screen.getByText("Line 1 · SOFTWARE IMPLEMENTATION SERVICES")).toBeTruthy();
    expect(screen.getByText("Locked to this line")).toBeTruthy();
    expect(screen.queryByText("Place of supply")).toBeNull();
    expect(screen.queryByText("Resolves to")).toBeNull();
    expect(screen.queryByText("Calculation base")).toBeNull();
    expect(screen.queryByText("All lines")).toBeNull();
    expect(screen.queryByText("One line")).toBeNull();
    expect(screen.queryByText("Replace as v2")).toBeNull();
  });

  it("hydrates edit mode from the persisted tax rate before tax group defaults", async () => {
    const onSubmit = vi.fn();

    render(
      <TaxDrawer
        mode="edit"
        open
        onOpenChange={vi.fn()}
        piCode="PO-001"
        piSupplierLabel="Supplier"
        piStatus="draft"
        lines={[line]}
        currencyCode="MYR"
        baseCurrencyCode="MYR"
        exchangeRate={1}
        invoiceNetAmount={121.25}
        taxGroups={[{
          id: "tax-group-1",
          code: "SST",
          label: "MY SST Sales 10%",
          default_rate: 0,
          default_recoverable_pct: 100,
        }]}
        conditionTypeId="ct-tax"
        conditionTypeSequence={23}
        derivedPlaceOfSupply="inter_state"
        replacingComponent={{
          ...component,
          id: "tax-pc-1",
          sequence: 23,
          term_type: "tax",
          condition_type_id: "ct-tax",
          condition_type_label: "Sales Tax",
          condition_type_code: "SALES_TAX",
          tax_group_label: "MY SST Sales 10%",
          rate_value: 10,
          base_for_calculation: 93.94,
          computed_amount: 9.39,
          recoverable_pct: 100,
          metadata: {
            taxable_base_mode: "after_discounts",
            taxable_base_amount: 93.94,
          },
        }}
        onSubmit={onSubmit}
      />,
    );

    const rateInputs = screen.getAllByLabelText("Tax rate");
    expect(rateInputs.length).toBeGreaterThan(0);
    rateInputs.forEach((input) => expect(input).toHaveValue(10));

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        draft: expect.objectContaining({
          rate_value: 10,
        }),
      }));
    });
  });
});

describe("WhtDrawer draft edit mode", () => {
  it("renders line-scope edits with the locked scope card", () => {
    render(
      <WhtDrawer
        mode="edit"
        open
        onOpenChange={vi.fn()}
        piCode="PO-001"
        piSupplierLabel="Supplier"
        piStatus="draft"
        lines={[line]}
        currencyCode="MYR"
        baseCurrencyCode="MYR"
        exchangeRate={1}
        invoiceNetAmount={121.25}
        whtGroups={[{
          id: "wht-group-1",
          code: "WHT",
          label: "WHT 2%",
          jurisdiction_id: null,
          default_rate: 2,
          wht_basis: "GROSS",
          rate_schedule_id: "schedule-1",
          section_code_required: false,
        }]}
        replacingComponent={{
          ...component,
          id: "wht-pc-1",
          term_type: "withholding",
          condition_type_id: "ct-wht",
          condition_type_label: "WHT",
          condition_type_code: "WHT",
          tax_group_label: "WHT 2%",
          rate_value: 2,
          computed_amount: 2.43,
          recoverable_pct: 0,
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Edit withholding")).toBeTruthy();
    expect(screen.getByText("Line 1 · SOFTWARE IMPLEMENTATION SERVICES")).toBeTruthy();
    expect(screen.getByText("Locked to this line")).toBeTruthy();
    expect(screen.queryByText("All lines")).toBeNull();
    expect(screen.queryByText("One line")).toBeNull();
    expect(screen.queryByText("Replace as v2")).toBeNull();
  });
});
