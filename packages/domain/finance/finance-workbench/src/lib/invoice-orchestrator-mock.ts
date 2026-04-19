/**
 * @athyper/finance-workbench — Invoice Orchestrator Mock Data
 *
 * Pure functions producing mock orchestrator payloads keyed on invoice status.
 * Enables visual development of the approvable document shell before the
 * backend API endpoints for ProcessHealth, StatusBundle, etc. are built.
 *
 * All action codes use ONLY seeded entity_operation.permission_code values:
 *   Base: create, update, submit, approve, deny, post, cancel, reverse, copy, export
 *   Blueprint (AP Non-PO): hold, release_hold, propose_payment, view_je,
 *                           match_advance, allocate_payment
 */

import type {
  StatusDimension,
  ProcessHealthTile,
  SatelliteGroup,
  AmountBreakdownLine,
  ValidationNotice,
  ActionBundleItem,
} from "@athyper/api-contracts/documents";
import type { ApInvoiceDetail } from "../hooks/useApWorkbench";

// ── Status Dimensions ───────────────────────────────────────────────────────

export function mockStatusDimensions(status: string): StatusDimension[] {
  const s = status.toUpperCase();

  const lifecycle = (): StatusDimension => {
    const label = status.replace(/_/g, " ");
    if (["APPROVED", "POSTED", "PAID", "FULLY_PAID"].includes(s))
      return { dimension: "lifecycle", label: "Status", status_code: status, status_label: label, intent: "success" };
    if (["SUBMITTED", "PENDING_APPROVAL", "PARTIALLY_PAID"].includes(s))
      return { dimension: "lifecycle", label: "Status", status_code: status, status_label: label, intent: "warning" };
    if (["REJECTED", "CANCELLED", "REVERSED"].includes(s))
      return { dimension: "lifecycle", label: "Status", status_code: status, status_label: label, intent: "error" };
    return { dimension: "lifecycle", label: "Status", status_code: status, status_label: label, intent: "neutral" };
  };

  const accounting = (): StatusDimension => {
    const isPosted = ["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s);
    return {
      dimension: "accounting",
      label: "Accounting",
      status_code: isPosted ? "posted" : "unposted",
      status_label: isPosted ? "Posted" : "Unposted",
      intent: isPosted ? "success" : "neutral",
    };
  };

  const settlement = (): StatusDimension => {
    if (["PAID", "FULLY_PAID"].includes(s))
      return { dimension: "settlement", label: "Settlement", status_code: "fully_paid", status_label: "Fully Paid", intent: "success" };
    if (s === "PARTIALLY_PAID")
      return { dimension: "settlement", label: "Settlement", status_code: "partially_paid", status_label: "Partially Paid", intent: "warning" };
    return { dimension: "settlement", label: "Settlement", status_code: "unpaid", status_label: "Unpaid", intent: "neutral" };
  };

  const matching = (): StatusDimension => {
    if (["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s))
      return { dimension: "matching", label: "Reconciliation", status_code: "fully_matched", status_label: "Matched", intent: "success" };
    return { dimension: "matching", label: "Reconciliation", status_code: "unmatched", status_label: "Unmatched", intent: "neutral" };
  };

  return [lifecycle(), accounting(), settlement(), matching()];
}

// ── Health Tiles ─────────────────────────────────────────────────────────────

export function mockHealthTiles(status: string): ProcessHealthTile[] {
  const s = status.toUpperCase();
  const isApproved = ["APPROVED", "POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s);
  const isPosted = ["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s);

  return [
    {
      dimension: "approval",
      label: "Approval",
      severity: isApproved ? "success" : s === "PENDING_APPROVAL" ? "warning" : s === "REJECTED" ? "error" : "neutral",
      summary: isApproved ? "Approved" : s === "PENDING_APPROVAL" ? "Awaiting approval" : s === "REJECTED" ? "Rejected" : "Not submitted",
      satellite_intent: "view_approval_trail",
    },
    {
      dimension: "payment_terms",
      label: "Payment Terms",
      severity: isApproved ? "success" : "neutral",
      summary: isApproved ? "Net 30 evaluated" : "Pending evaluation",
      satellite_intent: "view_payment_terms",
    },
    {
      dimension: "matching",
      label: "Reconciliation",
      severity: isPosted ? "success" : "neutral",
      summary: isPosted ? "3-way matched" : "Awaiting match",
      satellite_intent: "view_match_detail",
    },
    {
      dimension: "accounting",
      label: "Accounting",
      severity: isPosted ? "success" : "neutral",
      summary: isPosted ? "Posted to GL" : "Not posted",
      satellite_intent: "view_journal_entry",
    },
    {
      dimension: "payment",
      label: "Payment",
      severity: s === "PARTIALLY_PAID" ? "warning" : ["PAID", "FULLY_PAID"].includes(s) ? "success" : "neutral",
      summary: s === "PARTIALLY_PAID" ? "Partial payment" : ["PAID", "FULLY_PAID"].includes(s) ? "Fully settled" : "Unpaid",
      satellite_intent: "open_payment",
    },
    {
      dimension: "tax_wht",
      label: "Tax & WHT",
      severity: "success",
      summary: "Calculated",
      satellite_intent: "view_tax_detail",
    },
    {
      dimension: "budget",
      label: "Budget",
      severity: "success",
      summary: "Check passed",
      satellite_intent: "view_budget_trace",
    },
  ];
}

// ── Satellite Groups ─────────────────────────────────────────────────────────

export function mockSatelliteGroups(invoice: ApInvoiceDetail): SatelliteGroup[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

  return [
    {
      group_key: "commercial_controls",
      label: "Commercial Controls",
      cards: [
        {
          id: "sat_payment_terms",
          group: "commercial_controls",
          title: "Payment Terms",
          subtitle: "evaluated",
          intent: "success",
          icon_key: "clock",
          summary_lines: [
            { label: "Base Terms", value: "Net 30" },
            { label: "Clauses", value: "Applied" },
          ],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View Applications",
          primary_action_intent: "view_payment_applications",
        },
      ],
    },
    {
      group_key: "commitment_trace",
      label: "Commitment Trace",
      cards: [
        {
          id: "sat_po",
          group: "commitment_trace",
          title: "Purchase Order",
          subtitle: "linked",
          intent: "info",
          icon_key: "document",
          summary_lines: [
            { label: "PO", value: "Linked" },
          ],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View PO",
          primary_action_intent: "navigate_po",
        },
      ],
    },
    {
      group_key: "accounting",
      label: "Accounting",
      cards: [
        {
          id: "sat_je",
          group: "accounting",
          title: "Accounting Entry",
          subtitle: invoice.status.toUpperCase() === "POSTED" ? "posted" : "pending",
          intent: ["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(invoice.status.toUpperCase()) ? "success" : "neutral",
          icon_key: "document",
          summary_lines: [
            { label: "Status", value: ["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(invoice.status.toUpperCase()) ? "Posted" : "Not posted" },
          ],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View Journal Entry",
          primary_action_intent: "view_journal_entry",
        },
        {
          id: "sat_budget",
          group: "accounting",
          title: "Budget Impact",
          subtitle: "passed",
          intent: "success",
          icon_key: "chart_bar",
          summary_lines: [
            { label: "Check", value: "PASSED" },
            { label: "Amount", value: `${invoice.currencyCode} ${fmt(invoice.payableAmount)}` },
          ],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View Budget Trace",
          primary_action_intent: "view_budget_trace",
        },
      ],
    },
    {
      group_key: "compliance_charges",
      label: "Compliance & Charges",
      cards: [
        {
          id: "sat_tax",
          group: "compliance_charges",
          title: "Tax Calculation",
          subtitle: "calculated",
          intent: "success",
          icon_key: "calculator",
          summary_lines: [
            { label: "Tax", value: `${invoice.currencyCode} ${fmt(invoice.tax_amount)}` },
          ],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View Tax Detail",
          primary_action_intent: "view_tax_calculation",
        },
      ],
    },
    {
      group_key: "settlement",
      label: "Settlement",
      cards: [
        {
          id: "sat_payment",
          group: "settlement",
          title: "Payment Status",
          subtitle: invoice.status.toLowerCase().replace(/_/g, " "),
          intent: invoice.outstandingAmount > 0 ? "warning" : "success",
          icon_key: "credit_card",
          summary_lines: [
            { label: "Payable", value: `${invoice.currencyCode} ${fmt(invoice.payableAmount)}` },
            { label: "Outstanding", value: `${invoice.currencyCode} ${fmt(invoice.outstandingAmount)}` },
          ],
          has_detail: false,
          detail_data: null,
          primary_action_label: "Open Payment",
          primary_action_intent: "open_payment_entry",
        },
      ],
    },
  ];
}

// ── Amount Breakdown ─────────────────────────────────────────────────────────

export function mockAmountBreakdown(invoice: ApInvoiceDetail): AmountBreakdownLine[] {
  const c = invoice.currencyCode;
  return [
    { label: "Subtotal", amount: invoice.payableAmount - invoice.tax_amount, currency_code: c, is_total: false, indent: 0 },
    { label: "Tax", amount: invoice.tax_amount, currency_code: c, is_total: false, indent: 0 },
    { label: "Total Payable", amount: invoice.payableAmount, currency_code: c, is_total: true, indent: 0 },
    { label: "Outstanding", amount: invoice.outstandingAmount, currency_code: c, is_total: false, indent: 0, intent: invoice.outstandingAmount > 0 ? "warning" : "success" },
  ];
}

// ── Validation Notices ───────────────────────────────────────────────────────

export function mockValidationNotices(status: string): ValidationNotice[] {
  const s = status.toUpperCase();
  const notices: ValidationNotice[] = [];

  if (s === "APPROVED") {
    notices.push({
      code: "early_pay_discount",
      level: "warning",
      message: "Early payment discount expires in 3 days",
      action_hint: null,
    });
  }

  return notices;
}

// ── Action Bundle ────────────────────────────────────────────────────────────

export function mockActionBundle(status: string): ActionBundleItem[] {
  const s = status.toUpperCase();

  const bundles: Record<string, ActionBundleItem[]> = {
    DRAFT: [
      { action_code: "submit", label: "Submit for Approval", group: "primary", icon_key: "arrow_right", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: false },
      { action_code: "update", label: "Edit", group: "working", icon_key: "pencil", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 2, requires_confirmation: false },
      { action_code: "copy", label: "Copy", group: "working", icon_key: "document_duplicate", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 3, requires_confirmation: false },
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 4, requires_confirmation: false },
      { action_code: "cancel", label: "Cancel Invoice", group: "overflow", icon_key: "x_circle", is_destructive: true, is_disabled: false, disabled_reason: null, sort_order: 5, requires_confirmation: true },
    ],
    PENDING_APPROVAL: [
      { action_code: "approve", label: "Approve", group: "primary", icon_key: "check_circle", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: true },
      { action_code: "deny", label: "Reject", group: "working", icon_key: "x_circle", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 2, requires_confirmation: true },
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 3, requires_confirmation: false },
    ],
    APPROVED: [
      { action_code: "post", label: "Post to Ledger", group: "primary", icon_key: "document", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: true },
      { action_code: "update", label: "Edit", group: "working", icon_key: "pencil", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 2, requires_confirmation: false },
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 3, requires_confirmation: false },
      { action_code: "hold", label: "Put on Hold", group: "overflow", icon_key: "shield", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 4, requires_confirmation: true },
    ],
    POSTED: [
      { action_code: "propose_payment", label: "Schedule Payment", group: "primary", icon_key: "credit_card", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: false },
      { action_code: "copy", label: "Copy", group: "working", icon_key: "document_duplicate", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 2, requires_confirmation: false },
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 3, requires_confirmation: false },
      { action_code: "reverse", label: "Reverse Posting", group: "overflow", icon_key: "arrow_path", is_destructive: true, is_disabled: false, disabled_reason: null, sort_order: 4, requires_confirmation: true },
    ],
    PARTIALLY_PAID: [
      { action_code: "propose_payment", label: "Schedule Remaining", group: "primary", icon_key: "credit_card", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: false },
      { action_code: "copy", label: "Copy", group: "working", icon_key: "document_duplicate", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 2, requires_confirmation: false },
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 3, requires_confirmation: false },
      { action_code: "reverse", label: "Reverse Posting", group: "overflow", icon_key: "arrow_path", is_destructive: true, is_disabled: false, disabled_reason: null, sort_order: 4, requires_confirmation: true },
    ],
    FULLY_PAID: [
      { action_code: "copy", label: "Copy", group: "working", icon_key: "document_duplicate", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: false },
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 2, requires_confirmation: false },
    ],
    REJECTED: [
      { action_code: "update", label: "Amend & Resubmit", group: "primary", icon_key: "pencil", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: false },
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 2, requires_confirmation: false },
    ],
    REVERSED: [
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: false },
    ],
    CANCELLED: [
      { action_code: "export", label: "Export", group: "output", icon_key: "document_arrow_down", is_destructive: false, is_disabled: false, disabled_reason: null, sort_order: 1, requires_confirmation: false },
    ],
  };

  return bundles[s] ?? bundles.DRAFT ?? [];
}
