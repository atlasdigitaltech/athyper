/**
 * @athyper/finance-workbench — Invoice Orchestrator Mock Data
 *
 * Pure functions producing mock orchestrator payloads keyed on invoice status.
 * Enables visual development of the document detail shell before the
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

export function mockStatusDimensions(
  status: string,
  invoice?: Pick<ApInvoiceDetail, "matchStatus" | "apJeId">,
): StatusDimension[] {
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
    const isPosted = !!invoice?.apJeId || ["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s);
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
    const ms = (invoice?.matchStatus ?? "").toLowerCase();
    if (ms === "fully_matched")
      return { dimension: "matching", label: "Reconciliation", status_code: "fully_matched", status_label: "Matched", intent: "success" };
    if (ms === "partially_matched")
      return { dimension: "matching", label: "Reconciliation", status_code: "partially_matched", status_label: "Partial Match", intent: "warning" };
    if (ms === "match_exception")
      return { dimension: "matching", label: "Reconciliation", status_code: "match_exception", status_label: "Exception", intent: "error" };
    if (["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s))
      return { dimension: "matching", label: "Reconciliation", status_code: "fully_matched", status_label: "Matched", intent: "success" };
    return { dimension: "matching", label: "Reconciliation", status_code: "unmatched", status_label: "Unmatched", intent: "neutral" };
  };

  return [lifecycle(), accounting(), settlement(), matching()];
}

// ── Health Tiles ─────────────────────────────────────────────────────────────

export function mockHealthTiles(
  status: string,
  invoice?: Pick<ApInvoiceDetail, "matchStatus" | "apJeId" | "budgetCheckResult" | "paymentTermId" | "taxAmount" | "withholdingTaxAmount">,
): ProcessHealthTile[] {
  const s = status.toUpperCase();
  const isApproved = ["APPROVED", "POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s);
  const isPosted   = !!invoice?.apJeId || ["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s);

  // Matching tile: use live matchStatus when available
  const ms = (invoice?.matchStatus ?? "").toLowerCase();
  const matchSeverity: "success" | "warning" | "error" | "neutral" =
    ms === "fully_matched"     ? "success" :
    ms === "partially_matched" ? "warning" :
    ms === "match_exception"   ? "error"   :
    isPosted                   ? "success" : "neutral";
  const matchSummary =
    ms === "fully_matched"     ? "3-way matched"     :
    ms === "partially_matched" ? "Partially matched" :
    ms === "match_exception"   ? "Match exception"   :
    isPosted                   ? "Matched"           : "Awaiting match";

  // Budget tile: use live budgetCheckResult when available
  const bcr = (invoice?.budgetCheckResult ?? "").toLowerCase();
  const budgetSeverity: "success" | "warning" | "error" | "neutral" =
    bcr === "passed"  ? "success" :
    bcr === "warning" ? "warning" :
    bcr === "failed"  ? "error"   : "neutral";
  const budgetSummary =
    bcr === "passed"  ? "Check passed"  :
    bcr === "warning" ? "Within buffer" :
    bcr === "failed"  ? "Budget exceeded" : "Not checked";

  // Payment terms tile
  const hasTerms = !!invoice?.paymentTermId;

  // Tax tile
  const hasTax = (invoice?.taxAmount ?? 0) > 0 || (invoice?.withholdingTaxAmount ?? 0) > 0;

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
      severity: hasTerms ? "success" : isApproved ? "warning" : "neutral",
      summary: hasTerms ? "Terms evaluated" : isApproved ? "Pending evaluation" : "Not configured",
      satellite_intent: "view_payment_terms",
    },
    {
      dimension: "matching",
      label: "Reconciliation",
      severity: matchSeverity,
      summary: matchSummary,
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
      severity: hasTax ? "success" : "neutral",
      summary: hasTax ? "Calculated" : "No tax",
      satellite_intent: "view_tax_detail",
    },
    {
      dimension: "budget",
      label: "Budget",
      severity: budgetSeverity,
      summary: budgetSummary,
      satellite_intent: "view_budget_trace",
    },
  ];
}

// ── Satellite Groups ─────────────────────────────────────────────────────────

export function mockSatelliteGroups(invoice: ApInvoiceDetail): SatelliteGroup[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

  const s      = invoice.status.toUpperCase();
  const isPosted = !!invoice.apJeId || ["POSTED", "PARTIALLY_PAID", "PAID", "FULLY_PAID"].includes(s);

  // Payment terms
  const hasTerms = !!invoice.paymentTermId;

  // Budget check
  const bcr = (invoice.budgetCheckResult ?? "").toLowerCase();
  const budgetIntent: "success" | "warning" | "error" | "neutral" =
    bcr === "passed" ? "success" : bcr === "warning" ? "warning" : bcr === "failed" ? "error" : "neutral";
  const budgetSubtitle = bcr === "passed" ? "passed" : bcr === "warning" ? "within buffer" : bcr === "failed" ? "exceeded" : "not checked";

  // Tax amounts
  const taxAmt = invoice.taxAmount ?? 0;
  const whtAmt = invoice.withholdingTaxAmount ?? 0;

  // Settlement
  const paid    = invoice.paidAmount ?? 0;
  const payable = invoice.payableAmount ?? 0;
  const outstanding = invoice.outstandingAmount ?? 0;

  return [
    {
      group_key: "commercial_controls",
      label: "Commercial Controls",
      cards: [
        {
          id: "sat_payment_terms",
          group: "commercial_controls",
          title: "Payment Terms",
          subtitle: hasTerms ? "evaluated" : "not configured",
          intent: hasTerms ? "success" : "neutral",
          icon_key: "clock",
          summary_lines: hasTerms
            ? [{ label: "Terms", value: "Applied" }]
            : [{ label: "Terms", value: "—" }],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View Applications",
          primary_action_intent: "view_payment_applications",
        },
      ],
    },
    ...(invoice.commitmentId ? [{
      group_key: "commitment_trace",
      label: "Commitment Trace",
      cards: [
        {
          id: "sat_po",
          group: "commitment_trace",
          title: "Purchase Order",
          subtitle: "linked",
          intent: "info" as const,
          icon_key: "document",
          summary_lines: [{ label: "Commitment", value: "Linked" }],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View Commitment",
          primary_action_intent: "navigate_commitment",
        },
      ],
    }] : []),
    {
      group_key: "accounting",
      label: "Accounting",
      cards: [
        {
          id: "sat_je",
          group: "accounting",
          title: "Accounting Entry",
          subtitle: isPosted ? "posted" : "pending",
          intent: isPosted ? "success" : "neutral",
          icon_key: "document",
          summary_lines: invoice.apJeId
            ? [{ label: "Journal Entry", value: invoice.apJeId }]
            : [{ label: "Status", value: "Not posted" }],
          has_detail: false,
          detail_data: null,
          primary_action_label: "View Journal Entry",
          primary_action_intent: "view_journal_entry",
        },
        {
          id: "sat_budget",
          group: "accounting",
          title: "Budget Impact",
          subtitle: budgetSubtitle,
          intent: budgetIntent,
          icon_key: "chart_bar",
          summary_lines: [
            ...(bcr ? [{ label: "Check", value: bcr.toUpperCase() }] : []),
            { label: "Amount", value: `${invoice.currencyCode} ${fmt(payable)}` },
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
          subtitle: taxAmt > 0 ? "calculated" : "no tax",
          intent: taxAmt > 0 ? "success" : "neutral",
          icon_key: "calculator",
          summary_lines: [
            { label: "Tax", value: `${invoice.currencyCode} ${fmt(taxAmt)}` },
            ...(whtAmt > 0 ? [{ label: "WHT", value: `${invoice.currencyCode} ${fmt(whtAmt)}` }] : []),
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
          intent: outstanding <= 0 ? "success" : outstanding < payable ? "warning" : "neutral",
          icon_key: "credit_card",
          summary_lines: [
            { label: "Payable",     value: `${invoice.currencyCode} ${fmt(payable)}` },
            ...(paid > 0 ? [{ label: "Paid",        value: `${invoice.currencyCode} ${fmt(paid)}` }] : []),
            { label: "Outstanding", value: `${invoice.currencyCode} ${fmt(outstanding)}` },
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
  const c         = invoice.currencyCode;
  const subtotal  = invoice.subtotalAmount ?? 0;
  const tax       = invoice.taxAmount ?? 0;
  const wht       = invoice.withholdingTaxAmount ?? 0;
  const total     = invoice.totalAmount ?? 0;
  const payable   = invoice.payableAmount ?? total;
  const paid      = invoice.paidAmount ?? 0;
  const outstanding = invoice.outstandingAmount ?? payable;

  const lines: AmountBreakdownLine[] = [
    { label: "Subtotal", amount: subtotal, currency_code: c, is_total: false, indent: 0 },
  ];
  if (tax > 0) {
    lines.push({ label: "Tax", amount: tax, currency_code: c, is_total: false, indent: 1 });
  }
  if (wht > 0) {
    lines.push({ label: "Withholding Tax", amount: wht, currency_code: c, is_total: false, indent: 1 });
  }
  lines.push({ label: "Total", amount: total, currency_code: c, is_total: false, indent: 0 });
  if (payable !== total) {
    lines.push({ label: "Net Payable", amount: payable, currency_code: c, is_total: true, indent: 0 });
  } else {
    lines.push({ label: "Total Payable", amount: payable, currency_code: c, is_total: true, indent: 0 });
  }
  if (paid > 0) {
    lines.push({ label: "Paid", amount: paid, currency_code: c, is_total: false, indent: 1 });
  }
  lines.push({
    label: "Outstanding",
    amount: outstanding,
    currency_code: c,
    is_total: false,
    indent: 0,
    intent: outstanding > 0 ? "warning" : "success",
  } as AmountBreakdownLine);
  return lines;
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
