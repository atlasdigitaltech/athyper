"use client";

// components/finance/list/payment-entry-list-config.tsx
//
// ListPageConfig factory for the Payment Entries collection page.

import { CreditCard, Plus } from "lucide-react";

import { DateCell, MoneyCell, StatusBadgeCell } from "./finance-shared";

import type { ListPageConfig } from "@/components/mesh/list";
import type { PaymentEntrySummary } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Payment method display labels
// ---------------------------------------------------------------------------

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CHECK: "Check",
  WIRE: "Wire Transfer",
  ACH: "ACH",
  CARD: "Card",
  CASH: "Cash",
  NETTING: "Netting",
};

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

export function createPaymentEntryListConfig(
  basePath: string,
): ListPageConfig<PaymentEntrySummary> {
  return {
    // ── Identity ──────────────────────────────────────────────
    pageTitle: "Payment Entries",
    entityLabel: "payment",
    entityLabelPlural: "payments",
    icon: CreditCard,
    basePath,
    getId: (item) => item.id,
    getItemHref: (item) => `${basePath}/${item.id}`,

    // ── Zone 2 — KPI summary ─────────────────────────────────
    kpis: [
      {
        id: "total",
        label: "Total Payments",
        icon: CreditCard,
        compute: (items) => items.length,
        format: "number",
      },
      {
        id: "posted",
        label: "Posted",
        icon: CreditCard,
        compute: (items) => items.filter((i) => i.status === "POSTED").length,
        format: "number",
        filterOnClick: { status: "POSTED" },
      },
      {
        id: "pending",
        label: "Pending",
        icon: CreditCard,
        compute: (items) =>
          items.filter((i) => i.status === "DRAFT" || i.status === "SUBMITTED")
            .length,
        format: "number",
        variantFn: (v) => (v > 15 ? "warning" : "default"),
      },
    ],

    // ── Zone 3 — Command bar ─────────────────────────────────
    searchPlaceholder: "Search payments...",
    searchFn: (item, query) => {
      const q = query.toLowerCase();
      return (
        item.paymentNumber.toLowerCase().includes(q) ||
        (item.supplierName?.toLowerCase().includes(q) ?? false)
      );
    },
    quickFilters: [
      {
        id: "status",
        label: "Status",
        defaultValue: "all",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "DRAFT", label: "Draft" },
          { value: "SUBMITTED", label: "Submitted" },
          { value: "APPROVED", label: "Approved" },
          { value: "POSTED", label: "Posted" },
          { value: "RECONCILED", label: "Reconciled" },
          { value: "CANCELLED", label: "Cancelled" },
          { value: "VOIDED", label: "Voided" },
        ],
      },
      {
        id: "paymentMethod",
        label: "Method",
        defaultValue: "all",
        options: [
          { value: "all", label: "All Methods" },
          { value: "CHECK", label: "Check" },
          { value: "WIRE", label: "Wire Transfer" },
          { value: "ACH", label: "ACH" },
          { value: "CARD", label: "Card" },
          { value: "CASH", label: "Cash" },
          { value: "NETTING", label: "Netting" },
        ],
      },
    ],
    filterFn: (item, filters) => {
      if (
        filters.status &&
        filters.status !== "all" &&
        item.status !== filters.status
      ) {
        return false;
      }
      if (
        filters.paymentMethod &&
        filters.paymentMethod !== "all" &&
        item.paymentMethod !== filters.paymentMethod
      ) {
        return false;
      }
      return true;
    },

    // ── Zone 4 — Columns ─────────────────────────────────────
    columns: [
      {
        id: "paymentNumber",
        header: "Payment #",
        sortKey: "paymentNumber",
        width: "w-[140px]",
        accessor: (item) => (
          <span className="font-mono text-sm font-medium">
            {item.paymentNumber}
          </span>
        ),
      },
      {
        id: "supplier",
        header: "Supplier",
        sortKey: "supplierName",
        accessor: (item) => (
          <span className="text-sm">
            {item.supplierName ?? item.supplierId}
          </span>
        ),
        filterable: true,
        filterType: "text",
      },
      {
        id: "paymentMethod",
        header: "Method",
        sortKey: "paymentMethod",
        width: "w-[120px]",
        accessor: (item) => (
          <span className="text-sm">
            {PAYMENT_METHOD_LABELS[item.paymentMethod] ?? item.paymentMethod}
          </span>
        ),
        filterable: true,
        filterType: "select",
        filterOptions: [
          { value: "CHECK", label: "Check" },
          { value: "WIRE", label: "Wire Transfer" },
          { value: "ACH", label: "ACH" },
          { value: "CARD", label: "Card" },
          { value: "CASH", label: "Cash" },
          { value: "NETTING", label: "Netting" },
        ],
      },
      {
        id: "paymentDate",
        header: "Date",
        sortKey: "paymentDate",
        width: "w-[120px]",
        accessor: (item) => <DateCell date={item.paymentDate} />,
      },
      {
        id: "totalAmount",
        header: "Amount",
        sortKey: "totalAmount",
        align: "right",
        width: "w-[130px]",
        sortFn: (a, b) => Number(a.totalAmount) - Number(b.totalAmount),
        accessor: (item) => (
          <MoneyCell amount={item.totalAmount} currency={item.currencyCode} />
        ),
      },
      {
        id: "status",
        header: "Status",
        sortKey: "status",
        width: "w-[130px]",
        accessor: (item) => <StatusBadgeCell status={item.status} />,
        filterable: true,
        filterType: "select",
        filterOptions: [
          { value: "DRAFT", label: "Draft" },
          { value: "SUBMITTED", label: "Submitted" },
          { value: "APPROVED", label: "Approved" },
          { value: "POSTED", label: "Posted" },
          { value: "RECONCILED", label: "Reconciled" },
          { value: "CANCELLED", label: "Cancelled" },
          { value: "VOIDED", label: "Voided" },
        ],
      },
    ],

    // ── Zone 4 — Card renderer ───────────────────────────────
    cardRenderer: (item) => (
      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-medium">
            {item.paymentNumber}
          </span>
          <StatusBadgeCell status={item.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {item.supplierName ?? item.supplierId}
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs text-muted-foreground">
            {PAYMENT_METHOD_LABELS[item.paymentMethod] ?? item.paymentMethod}
          </span>
          <MoneyCell amount={item.totalAmount} currency={item.currencyCode} />
        </div>
        <div className="text-xs text-muted-foreground">
          <DateCell date={item.paymentDate} />
        </div>
      </div>
    ),

    // ── View configuration ───────────────────────────────────
    availableViews: ["table", "table-columns", "card-grid"],
    defaultViewMode: "card-grid",
    defaultViewModeDesktop: "table",
    defaultDensity: "comfortable",
    defaultDensityDesktop: "compact",

    presets: [
      { id: "default", label: "Default", isDefault: true },
      {
        id: "posted",
        label: "Posted",
        filters: { status: "POSTED" },
      },
      {
        id: "pending",
        label: "Pending",
        filters: { status: "SUBMITTED" },
      },
    ],

    // ── Primary action ───────────────────────────────────────
    primaryAction: {
      label: "New Payment",
      icon: Plus,
      onClick: () => {
        // TODO: navigate to create payment form / open dialog
      },
    },
  };
}
