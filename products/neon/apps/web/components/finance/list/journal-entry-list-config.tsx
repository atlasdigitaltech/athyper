"use client";

// components/finance/list/journal-entry-list-config.tsx
//
// ListPageConfig factory for the Journal Entries collection page.

import { BookOpen, Plus } from "lucide-react";

import { DateCell, MoneyCell, StatusBadgeCell } from "./finance-shared";

import type { ListPageConfig } from "@/components/mesh/list";
import type { JournalEntrySummary } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Common document type display labels
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<string, string> = {
  PURCHASE_INVOICE: "Purchase Invoice",
  PAYMENT: "Payment",
  MANUAL: "Manual",
  REVERSAL: "Reversal",
  ACCRUAL: "Accrual",
  ADJUSTMENT: "Adjustment",
};

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

export function createJournalEntryListConfig(
  basePath: string,
): ListPageConfig<JournalEntrySummary> {
  return {
    // ── Identity ──────────────────────────────────────────────
    pageTitle: "Journal Entries",
    entityLabel: "journal entry",
    entityLabelPlural: "journal entries",
    icon: BookOpen,
    basePath,
    getId: (item) => item.id,
    getItemHref: (item) => `${basePath}/${item.id}`,

    // ── Zone 2 — KPI summary ─────────────────────────────────
    kpis: [
      {
        id: "total",
        label: "Total JEs",
        icon: BookOpen,
        compute: (items) => items.length,
        format: "number",
      },
      {
        id: "posted",
        label: "Posted",
        icon: BookOpen,
        compute: (items) => items.filter((i) => i.status === "POSTED").length,
        format: "number",
        filterOnClick: { status: "POSTED" },
      },
      {
        id: "created",
        label: "Created (Draft)",
        icon: BookOpen,
        compute: (items) => items.filter((i) => i.status === "CREATED").length,
        format: "number",
        filterOnClick: { status: "CREATED" },
        variantFn: (v) => (v > 20 ? "warning" : "default"),
      },
    ],

    // ── Zone 3 — Command bar ─────────────────────────────────
    searchPlaceholder: "Search journal entries...",
    searchFn: (item, query) => {
      const q = query.toLowerCase();
      return (
        item.jeNumber.toLowerCase().includes(q) ||
        item.docType.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false)
      );
    },
    quickFilters: [
      {
        id: "status",
        label: "Status",
        defaultValue: "all",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "CREATED", label: "Created" },
          { value: "POSTED", label: "Posted" },
          { value: "REVERSED", label: "Reversed" },
        ],
      },
      {
        id: "docType",
        label: "Type",
        defaultValue: "all",
        options: [
          { value: "all", label: "All Types" },
          { value: "PURCHASE_INVOICE", label: "Purchase Invoice" },
          { value: "PAYMENT", label: "Payment" },
          { value: "MANUAL", label: "Manual" },
          { value: "REVERSAL", label: "Reversal" },
          { value: "ACCRUAL", label: "Accrual" },
          { value: "ADJUSTMENT", label: "Adjustment" },
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
        filters.docType &&
        filters.docType !== "all" &&
        item.docType !== filters.docType
      ) {
        return false;
      }
      return true;
    },

    // ── Zone 4 — Columns ─────────────────────────────────────
    columns: [
      {
        id: "jeNumber",
        header: "JE #",
        sortKey: "jeNumber",
        width: "w-[120px]",
        accessor: (item) => (
          <span className="font-mono text-sm font-medium">{item.jeNumber}</span>
        ),
      },
      {
        id: "docType",
        header: "Type",
        sortKey: "docType",
        width: "w-[140px]",
        accessor: (item) => (
          <span className="text-sm">
            {DOC_TYPE_LABELS[item.docType] ?? item.docType}
          </span>
        ),
        filterable: true,
        filterType: "select",
        filterOptions: [
          { value: "PURCHASE_INVOICE", label: "Purchase Invoice" },
          { value: "PAYMENT", label: "Payment" },
          { value: "MANUAL", label: "Manual" },
          { value: "REVERSAL", label: "Reversal" },
          { value: "ACCRUAL", label: "Accrual" },
          { value: "ADJUSTMENT", label: "Adjustment" },
        ],
      },
      {
        id: "postingDate",
        header: "Date",
        sortKey: "postingDate",
        width: "w-[120px]",
        accessor: (item) => <DateCell date={item.postingDate} />,
      },
      {
        id: "totalDebit",
        header: "Debit",
        sortKey: "totalDebit",
        align: "right",
        width: "w-[130px]",
        sortFn: (a, b) => Number(a.totalDebit) - Number(b.totalDebit),
        accessor: (item) => (
          <MoneyCell amount={item.totalDebit} currency={item.currencyCode} />
        ),
      },
      {
        id: "totalCredit",
        header: "Credit",
        sortKey: "totalCredit",
        align: "right",
        width: "w-[130px]",
        sortFn: (a, b) => Number(a.totalCredit) - Number(b.totalCredit),
        accessor: (item) => (
          <MoneyCell amount={item.totalCredit} currency={item.currencyCode} />
        ),
      },
      {
        id: "status",
        header: "Status",
        sortKey: "status",
        width: "w-[110px]",
        accessor: (item) => <StatusBadgeCell status={item.status} />,
        filterable: true,
        filterType: "select",
        filterOptions: [
          { value: "CREATED", label: "Created" },
          { value: "POSTED", label: "Posted" },
          { value: "REVERSED", label: "Reversed" },
        ],
      },
    ],

    // ── Zone 4 — Card renderer ───────────────────────────────
    cardRenderer: (item) => (
      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-medium">{item.jeNumber}</span>
          <StatusBadgeCell status={item.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {DOC_TYPE_LABELS[item.docType] ?? item.docType}
        </p>
        <div className="flex items-center justify-between text-sm">
          <DateCell date={item.postingDate} />
          <div className="flex gap-3">
            <span className="text-xs text-muted-foreground">DR</span>
            <MoneyCell amount={item.totalDebit} />
            <span className="text-xs text-muted-foreground">CR</span>
            <MoneyCell amount={item.totalCredit} />
          </div>
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
        id: "created-draft",
        label: "Created (Draft)",
        filters: { status: "CREATED" },
      },
    ],

    // ── Primary action ───────────────────────────────────────
    primaryAction: {
      label: "New Journal Entry",
      icon: Plus,
      onClick: () => {
        // TODO: navigate to create journal entry form / open dialog
      },
    },
  };
}
