"use client";

/**
 * Entity List Config Overrides
 *
 * Per-entity customizations for the generic ListPageConfig builder.
 * Finance entities need custom column formatting (money, status badges,
 * date formatting) that the generic auto-discovery cannot infer.
 *
 * These overrides are applied AFTER buildEntityListConfig() generates
 * the default config from field metadata.
 *
 * Usage in [entity]/view/list/page.tsx:
 *   const cfg = buildEntityListConfig({ ... });
 *   applyListOverrides(entityName, cfg);
 */

import {
  BookOpen,
  CreditCard,
  FileText,
  Receipt,
  FileCheck,
  FileMinus,
  FileSpreadsheet,
  Repeat,
  Globe,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ColumnDef, QuickFilterDef, ListPageConfig } from "@/components/mesh/list/types";

type EntityRecord = Record<string, unknown>;

// ============================================================================
// Override Registry
// ============================================================================

interface ListOverride {
  icon?: LucideIcon;
  /** Column overrides by column id. Merged into existing columns. */
  columns?: Record<string, Partial<ColumnDef<EntityRecord>>>;
  /** Additional quick filters to prepend/replace. */
  quickFilters?: QuickFilterDef[];
  /** Priority field ordering (first columns shown). */
  priorityFields?: string[];
  /** Default sort field. */
  defaultSort?: string;
}

const OVERRIDES: Record<string, ListOverride> = {
  ManualJournalEntry: {
    icon: BookOpen,
    priorityFields: [
      "je_number", "doc_type", "posting_date", "fiscal_year",
      "period_number", "total_debit", "total_credit", "status", "description",
    ],
    columns: {
      je_number: { width: "w-[140px]" },
      doc_type: { width: "w-[100px]" },
      posting_date: { width: "w-[130px]" },
      fiscal_year: { width: "w-[80px]" },
      period_number: { width: "w-[80px]" },
      total_debit: { width: "w-[150px]", align: "right" },
      total_credit: { width: "w-[150px]", align: "right" },
      status: { width: "w-[120px]" },
    },
    quickFilters: [{
      id: "status",
      label: "Status",
      defaultValue: "all",
      options: [
        { value: "all", label: "All Statuses" },
        { value: "CREATED", label: "Created" },
        { value: "POSTED", label: "Posted" },
        { value: "REVERSED", label: "Reversed" },
      ],
    }],
    defaultSort: "posting_date",
  },

  PaymentEntry: {
    icon: CreditCard,
    priorityFields: [
      "payment_number", "supplier_id", "payment_date",
      "total_amount", "payment_method", "status", "approval_route",
    ],
    columns: {
      payment_number: { width: "w-[160px]" },
      payment_date: { width: "w-[130px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      payment_method: { width: "w-[100px]" },
      status: { width: "w-[130px]" },
      approval_route: { width: "w-[120px]" },
    },
    quickFilters: [{
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
    }],
    defaultSort: "payment_date",
  },

  PurchaseInvoice: {
    icon: FileText,
    priorityFields: [
      "invoice_number", "supplier_id", "invoice_date", "due_date",
      "total_amount", "paid_amount", "status", "approval_route",
    ],
    columns: {
      invoice_number: { width: "w-[160px]" },
      invoice_date: { width: "w-[130px]" },
      due_date: { width: "w-[120px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      paid_amount: { width: "w-[150px]", align: "right" },
      status: { width: "w-[130px]" },
      approval_route: { width: "w-[120px]" },
    },
    quickFilters: [{
      id: "status",
      label: "Status",
      defaultValue: "all",
      options: [
        { value: "all", label: "All Statuses" },
        { value: "DRAFT", label: "Draft" },
        { value: "SUBMITTED", label: "Submitted" },
        { value: "APPROVED", label: "Approved" },
        { value: "POSTED", label: "Posted" },
        { value: "PARTIALLY_PAID", label: "Partially Paid" },
        { value: "PAID", label: "Paid" },
        { value: "CANCELLED", label: "Cancelled" },
      ],
    }],
    defaultSort: "invoice_date",
  },

  CreditNote: {
    icon: FileMinus,
    priorityFields: [
      "document_number", "supplier_id", "document_date",
      "total_amount", "status",
    ],
    columns: {
      document_number: { width: "w-[160px]" },
      document_date: { width: "w-[130px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      status: { width: "w-[130px]" },
    },
    defaultSort: "document_date",
  },

  DebitNote: {
    icon: Receipt,
    priorityFields: [
      "document_number", "supplier_id", "document_date",
      "total_amount", "status",
    ],
    columns: {
      document_number: { width: "w-[160px]" },
      document_date: { width: "w-[130px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      status: { width: "w-[130px]" },
    },
    defaultSort: "document_date",
  },

  AccrualDocument: {
    icon: FileCheck,
    priorityFields: [
      "document_number", "document_date", "total_amount",
      "status", "accrual_type",
    ],
    columns: {
      document_number: { width: "w-[160px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      status: { width: "w-[130px]" },
    },
    defaultSort: "document_date",
  },

  ReclassDocument: {
    icon: FileSpreadsheet,
    priorityFields: [
      "document_number", "document_date", "total_amount",
      "status", "reason",
    ],
    columns: {
      document_number: { width: "w-[160px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      status: { width: "w-[130px]" },
    },
    defaultSort: "document_date",
  },

  FxRevaluation: {
    icon: Globe,
    priorityFields: [
      "document_number", "document_date", "total_amount",
      "status", "base_currency", "target_currency",
    ],
    columns: {
      document_number: { width: "w-[160px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      status: { width: "w-[130px]" },
    },
    defaultSort: "document_date",
  },

  IcElimination: {
    icon: Repeat,
    priorityFields: [
      "document_number", "document_date", "total_amount",
      "status", "counterparty_entity_code",
    ],
    columns: {
      document_number: { width: "w-[160px]" },
      total_amount: { width: "w-[150px]", align: "right" },
      status: { width: "w-[130px]" },
    },
    defaultSort: "document_date",
  },
};

// ============================================================================
// Apply Overrides
// ============================================================================

/**
 * Apply entity-specific overrides to a generated ListPageConfig.
 * Mutates the config in-place for efficiency.
 *
 * @returns true if overrides were applied, false if no overrides exist
 */
export function applyListOverrides(
  entityName: string,
  config: ListPageConfig<EntityRecord>,
): boolean {
  const override = OVERRIDES[entityName];
  if (!override) return false;

  // Icon
  if (override.icon) {
    config.icon = override.icon;
  }

  // Reorder columns by priority fields
  if (override.priorityFields) {
    const priorityOrder = override.priorityFields;
    config.columns.sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a.id);
      const bIdx = priorityOrder.indexOf(b.id);
      const aPos = aIdx >= 0 ? aIdx : 100 + config.columns.indexOf(a);
      const bPos = bIdx >= 0 ? bIdx : 100 + config.columns.indexOf(b);
      return aPos - bPos;
    });

    // Show priority columns, hide the rest beyond the priority count
    for (const col of config.columns) {
      const idx = priorityOrder.indexOf(col.id);
      col.hidden = idx < 0;
    }
  }

  // Apply column-level overrides (width, align, etc.)
  if (override.columns) {
    for (const col of config.columns) {
      const colOverride = override.columns[col.id];
      if (colOverride) {
        Object.assign(col, colOverride);
      }
    }
  }

  // Replace quick filters
  if (override.quickFilters) {
    config.quickFilters = override.quickFilters;
  }

  return true;
}

/**
 * Check if an entity has custom list overrides.
 */
export function hasListOverrides(entityName: string): boolean {
  return entityName in OVERRIDES;
}
