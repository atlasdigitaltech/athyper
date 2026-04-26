/**
 * EntityHeader static model fixtures
 *
 * Six canonical shapes that cover the full priority-row matrix.
 * Each is a plain EntityHeaderModel — no async, no adapters, no server data.
 * Import into the (dev)/header-fixtures pages or unit tests.
 *
 * Fixture map:
 *   create-invoice-draft          P1 only  (wizard/create surface)
 *   view-invoice-approved         All Ps   (mature document, timeline collapsed)
 *   edit-invoice-dirty            P1+P2+P3 (unsaved changes badge, Save/Cancel actions)
 *   view-invoice-with-exceptions  P1+P1.5+P2+P3+P5 (one blocking + one warning)
 *   view-invoice-pinned           Same as approved — rendered at mode="pinned"
 *   view-invoice-mobile           Minimal facts — xl cell only
 */

import type { EntityHeaderModel } from "../types";

// ── 1. Create — Invoice Draft ─────────────────────────────────────────────

export const createInvoiceDraft: EntityHeaderModel = {
  identity: {
    typeLabel: "INVOICE",
    typeHref: "/app/purchase_invoice",
    typeTooltip: "View all invoices",
    number: "New",
    identifierAction: "none",
    status: { label: "Draft", intent: "neutral" },
  },
  progress: {
    kind: "wizard",
    currentKey: "identify",
    stepIndex: 0,
    stages: [
      { key: "identify",   label: "Identify" },
      { key: "commercial", label: "Commercial" },
      { key: "review",     label: "Review" },
    ],
  },
  actions: [
    {
      id: "cancel",
      label: "Cancel",
      placement: "secondary",
      order: 99,
    },
  ],
};

// ── 2. View — Invoice Approved ────────────────────────────────────────────

export const viewInvoiceApproved: EntityHeaderModel = {
  identity: {
    typeLabel: "INVOICE",
    typeHref: "/app/purchase_invoice",
    typeTooltip: "View all invoices",
    number: "PI-202604-QNBTBC",
    identifierAction: "copy",
    description: "Vendor Invoice No. 34324234",
    status: { label: "Approved", intent: "success" },
  },
  actions: [
    { id: "post",            label: "Post",            placement: "primary",   order: 1 },
    { id: "propose_payment", label: "Propose Payment", placement: "secondary", order: 2 },
    { id: "view_je",         label: "View JE",         placement: "secondary", order: 3 },
    { id: "cancel_invoice",  label: "Cancel",          placement: "danger",    order: 4 },
  ],
  facts: [
    { id: "supplier",     label: "Supplier",       value: "Acme Consulting LLC",         subValue: "ACME-CONSULT-US" },
    { id: "invoice_date", label: "Invoice Date",   value: "25 Apr 2026" },
    { id: "company",      label: "Company Code",   value: "AUKA · Athyper UK Agriculture" },
    { id: "source",       label: "Invoice Source", value: "Non PO" },
    { id: "total",        label: "Invoice Total",  value: "450.00", currency: "USD", xl: true,
      subValue: "Subtotal 450.00 · Tax 0.00" },
  ],
  statuses: [
    { id: "accounting",     label: "Accounting",     value: "Unposted",  intent: "warning" },
    { id: "settlement",     label: "Settlement",     value: "Unpaid",    intent: "warning" },
    { id: "reconciliation", label: "Reconciliation", value: "Unmatched", intent: "neutral" },
  ],
  progress: {
    currentKey: "approved",
    stepIndex: 2,
    stages: [
      { key: "draft",     label: "Draft",     reachedAt: "25 Apr 2026" },
      { key: "submitted", label: "Submitted", reachedAt: "25 Apr 2026", durationLabel: "0m" },
      { key: "approved",  label: "Approved",  reachedAt: "25 Apr 2026", durationLabel: "0m",
        slaStatus: "completed_ok", slaTargetHours: 24 },
      { key: "posted",    label: "Posted" },
      { key: "paid",      label: "Paid" },
    ],
  },
  tabs: [
    { id: "overview",      label: "Overview" },
    { id: "distributions", label: "Distributions" },
    { id: "workflow",      label: "Workflow" },
    { id: "attachments",   label: "Attachments", count: 0, countPending: false },
    { id: "versions",      label: "Versions" },
    { id: "approvals",     label: "Approvals", count: 1 },
    { id: "comments",      label: "Comments",  count: 0, countPending: true },
    { id: "activity",      label: "Activity" },
  ],
  audit: {
    createdAt: "25 Apr 2026 14:22",
    createdBy: "A. Admin",
    updatedAt: "25 Apr 2026 14:25",
    updatedBy: "A. Admin",
    statusChangedAt: "25 Apr 2026 14:24",
    statusChangedBy: "A. Admin",
  },
};

// ── 3. Edit — Invoice Dirty ───────────────────────────────────────────────

export const editInvoiceDirty: EntityHeaderModel = {
  identity: {
    typeLabel: "INVOICE",
    typeHref: "/app/purchase_invoice",
    typeTooltip: "View all invoices",
    number: "PI-202604-QNBTBC",
    identifierAction: "copy",
    description: "Vendor Invoice No. 34324234",
    status: { label: "Unsaved changes", intent: "warning" },
  },
  actions: [
    { id: "save",    label: "Save",    placement: "primary",   order: 1, icon: "approve" },
    { id: "discard", label: "Discard", placement: "secondary", order: 2 },
  ],
  facts: viewInvoiceApproved.facts,
  statuses: viewInvoiceApproved.statuses,
  tabs: viewInvoiceApproved.tabs,
};

// ── 4. View — Invoice With Exceptions ────────────────────────────────────

export const viewInvoiceWithExceptions: EntityHeaderModel = {
  ...viewInvoiceApproved,
  identity: {
    ...viewInvoiceApproved.identity,
    status: { label: "Approved", intent: "success" },
  },
  actions: [
    { id: "post",           label: "Post",   placement: "primary",   order: 1,
      disabled: true, disabledReason: "Resolve blocking exceptions before posting" },
    { id: "cancel_invoice", label: "Cancel", placement: "danger",    order: 2 },
  ],
  exceptions: [
    {
      id: "exc-1",
      severity: "error",
      message: "Three-way match failed — received quantity (10) does not match invoiced quantity (12).",
      isBlocking: true,
      scope: "line",
      lineNumber: 1,
      resolutionLabel: "Review matching",
      resolutionPath: "#",
    },
    {
      id: "exc-2",
      severity: "warning",
      message: "Invoice date is outside the open posting period. Posting date will default to today.",
      isBlocking: false,
      scope: "header",
    },
  ],
};

// ── 5. View — Invoice Pinned (same model, render at mode="pinned") ────────

export const viewInvoicePinned: EntityHeaderModel = viewInvoiceApproved;

// ── 6. View — Mobile (xl fact cell only) ─────────────────────────────────

export const viewInvoiceMobile: EntityHeaderModel = {
  ...viewInvoiceApproved,
  facts: viewInvoiceApproved.facts?.filter(f => f.xl),
};

// ── Named fixture map for the (dev) fixture page ──────────────────────────

export const FIXTURES: Record<string, EntityHeaderModel> = {
  "create-invoice-draft":          createInvoiceDraft,
  "view-invoice-approved":         viewInvoiceApproved,
  "edit-invoice-dirty":            editInvoiceDirty,
  "view-invoice-with-exceptions":  viewInvoiceWithExceptions,
  "view-invoice-pinned":           viewInvoicePinned,
  "view-invoice-mobile":           viewInvoiceMobile,
};
