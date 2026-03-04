"use client";

// components/finance/list/purchase-invoice-list-config.tsx
//
// ListPageConfig factory for the Purchase Invoices collection page.

import { FileText, Plus } from "lucide-react";

import type { ListPageConfig } from "@/components/mesh/list";
import type { PurchaseInvoiceSummary } from "@/lib/finance/types";

import { DateCell, MoneyCell, StatusBadgeCell } from "./finance-shared";

// ---------------------------------------------------------------------------
// Config factory
// ---------------------------------------------------------------------------

export function createPurchaseInvoiceListConfig(
    basePath: string,
): ListPageConfig<PurchaseInvoiceSummary> {
    return {
        // ── Identity ──────────────────────────────────────────────
        pageTitle: "Purchase Invoices",
        entityLabel: "invoice",
        entityLabelPlural: "invoices",
        icon: FileText,
        basePath,
        getId: (item) => item.id,
        getItemHref: (item) => `${basePath}/${item.id}`,

        // ── Zone 2 — KPI summary ─────────────────────────────────
        kpis: [
            {
                id: "total",
                label: "Total Invoices",
                icon: FileText,
                compute: (items) => items.length,
                format: "number",
            },
            {
                id: "drafts",
                label: "Drafts",
                icon: FileText,
                compute: (items) => items.filter((i) => i.status === "DRAFT").length,
                format: "number",
                filterOnClick: { status: "DRAFT" },
                variantFn: (v) => (v > 10 ? "warning" : "default"),
            },
            {
                id: "pending",
                label: "Pending Approval",
                icon: FileText,
                compute: (items) => items.filter((i) => i.status === "SUBMITTED").length,
                format: "number",
                filterOnClick: { status: "SUBMITTED" },
                variantFn: (v) => (v > 20 ? "critical" : v > 5 ? "warning" : "default"),
            },
        ],

        // ── Zone 3 — Command bar ─────────────────────────────────
        searchPlaceholder: "Search invoices...",
        searchFn: (item, query) => {
            const q = query.toLowerCase();
            return (
                item.invoiceNumber.toLowerCase().includes(q) ||
                (item.supplierName?.toLowerCase().includes(q) ?? false)
            );
        },
        quickFilters: [
            {
                id: "status",
                label: "Status",
                defaultValue: "all",
                options: [
                    { value: "all",            label: "All Statuses" },
                    { value: "DRAFT",          label: "Draft" },
                    { value: "SUBMITTED",      label: "Submitted" },
                    { value: "APPROVED",       label: "Approved" },
                    { value: "POSTED",         label: "Posted" },
                    { value: "PARTIALLY_PAID", label: "Partially Paid" },
                    { value: "PAID",           label: "Paid" },
                    { value: "CANCELLED",      label: "Cancelled" },
                ],
            },
        ],
        filterFn: (item, filters) => {
            if (filters.status && filters.status !== "all" && item.status !== filters.status) {
                return false;
            }
            return true;
        },

        // ── Zone 4 — Columns ─────────────────────────────────────
        columns: [
            {
                id: "invoiceNumber",
                header: "Invoice #",
                sortKey: "invoiceNumber",
                width: "w-[140px]",
                accessor: (item) => (
                    <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
                ),
            },
            {
                id: "supplier",
                header: "Supplier",
                sortKey: "supplierName",
                accessor: (item) => (
                    <span className="text-sm">{item.supplierName ?? item.supplierId}</span>
                ),
                filterable: true,
                filterType: "text",
            },
            {
                id: "invoiceDate",
                header: "Date",
                sortKey: "invoiceDate",
                width: "w-[120px]",
                accessor: (item) => <DateCell date={item.invoiceDate} />,
            },
            {
                id: "totalAmount",
                header: "Total",
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
                width: "w-[140px]",
                accessor: (item) => <StatusBadgeCell status={item.status} />,
                filterable: true,
                filterType: "select",
                filterOptions: [
                    { value: "DRAFT",          label: "Draft" },
                    { value: "SUBMITTED",      label: "Submitted" },
                    { value: "APPROVED",       label: "Approved" },
                    { value: "POSTED",         label: "Posted" },
                    { value: "PARTIALLY_PAID", label: "Partially Paid" },
                    { value: "PAID",           label: "Paid" },
                    { value: "CANCELLED",      label: "Cancelled" },
                ],
            },
        ],

        // ── Zone 4 — Card renderer ───────────────────────────────
        cardRenderer: (item) => (
            <div className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
                    <StatusBadgeCell status={item.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                    {item.supplierName ?? item.supplierId}
                </p>
                <div className="flex items-center justify-between text-sm">
                    <DateCell date={item.invoiceDate} />
                    <MoneyCell amount={item.totalAmount} currency={item.currencyCode} />
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
                id: "my-drafts",
                label: "My Drafts",
                filters: { status: "DRAFT" },
            },
            {
                id: "pending-approval",
                label: "Pending Approval",
                filters: { status: "SUBMITTED" },
            },
        ],

        // ── Primary action ───────────────────────────────────────
        primaryAction: {
            label: "New Invoice",
            icon: Plus,
            onClick: () => {
                // TODO: navigate to create invoice form / open dialog
            },
        },
    };
}
