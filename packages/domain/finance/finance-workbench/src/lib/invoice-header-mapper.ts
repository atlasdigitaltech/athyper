/**
 * @athyper/finance-workbench — Purchase Invoice → ApprovableDocumentHeaderDTO mapper
 *
 * Reference implementation for Phase B of the Approvable Document Header spec.
 * Maps the AP workbench's ApInvoiceDetail shape (+ optional extras) into the
 * canonical ApprovableDocumentHeaderDTO consumed by ApprovableDocumentHeader /
 * ApprovableDocumentShell.
 *
 * Design decisions:
 *  - Pure function, no side-effects, no React dependency.
 *  - Works with the existing lean ApInvoiceDetail; richer fields are accepted
 *    via ApInvoiceHeaderExtras so the mapper stays forward-compatible.
 *  - Assignee names require a `principalNames` map (UUID → display name)
 *    because the API only returns IDs in work_items. Pass an empty Map when
 *    names are unavailable; the flow strip still renders correctly.
 */

import type {
  ApprovableDocumentHeaderDTO,
  ApprovableFlowStep,
  ApprovableDueMeta,
} from "@athyper/document-runtime/header";
import type { ApprovalContext } from "@athyper/api-contracts/workflow";
import type { StatusDimension, ActionBundleItem } from "@athyper/api-contracts/documents";
import type { ApInvoiceDetail } from "../hooks/useApWorkbench";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";

// ── Optional enrichment fields ───────────────────────────────────────────────

export interface ApInvoiceHeaderExtras {
  /** Net amount before tax. Shown as "Subtotal …" beneath the total. */
  subtotalAmount?: number;
  costCenter?: { code: string; name: string };
  /** e.g. "Net 30" */
  paymentTerms?: string;
  /** e.g. "2/10 discount" */
  earlyPayDiscount?: string;
  /** Related PO references. Each renders as a PO REFERENCE metadata item. */
  purchaseOrders?: Array<{ number: string; id?: string }>;
  /** Supplier location for the party subtitle, e.g. "Riyadh, SA" */
  supplierLocation?: string;
  /** YTD invoice count for the party subtitle, e.g. 42 */
  supplierYtdCount?: number;
  /** Display name of the submitter */
  submittedByName?: string;
  /** Amendment revision number — shown as "v{n}" when > 1 */
  version?: number;
  /** Full approval context; when provided the Approval Flow strip is rendered. */
  approvalContext?: ApprovalContext;
  /**
   * UUID → display name map for resolving assignee names in workflow work_items.
   * Pass an empty Map (default) to skip names.
   */
  principalNames?: Map<string, string>;

  /** Multi-dimensional status badges for the header identity bar. */
  statusDimensions?: StatusDimension[];
  /** State-adaptive action bundle (replaces simple primary/secondary/destructive). */
  actionBundle?: ActionBundleItem[];
  /** Blocked reasons that disable the primary CTA. */
  blockedReasons?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Upper-case status string → SemanticIntent */
function mapStatusIntent(status: string): SemanticIntent {
  const s = status.toUpperCase();
  if (["APPROVED", "POSTED", "PAID", "FULLY_PAID", "CLOSED"].includes(s))
    return "success";
  if (["SUBMITTED", "IN_REVIEW", "PENDING_APPROVAL", "ON_HOLD"].includes(s))
    return "warning";
  if (["REJECTED", "VOIDED", "CANCELLED", "REVERSED"].includes(s))
    return "error";
  if (["DRAFT"].includes(s)) return "neutral";
  return "info";
}

/** Upper-case status string → human label */
function mapStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    IN_REVIEW: "In Review",
    PENDING_APPROVAL: "Pending Approval",
    APPROVED: "Approved",
    POSTED: "Posted",
    PARTIALLY_PAID: "Partially Paid",
    PAID: "Paid",
    FULLY_PAID: "Paid",
    ON_HOLD: "On Hold",
    REJECTED: "Rejected",
    VOIDED: "Voided",
    CANCELLED: "Cancelled",
    REVERSED: "Reversed",
  };
  return map[status.toUpperCase()] ?? status;
}

/** Derive two-letter initials from a company/person name. */
function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "??";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/** Format a number as a locale amount string (no currency symbol). */
function fmtAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format an ISO date string as "18 Mar 2026". Returns undefined for nulls. */
function fmtDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format creation timestamp as "18 Mar 2026 14:22". */
function fmtDateTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Calculate the due-status chip for a due date.
 * Returns undefined when the date is more than 7 days away (no chip needed).
 */
function calcDueMeta(dueDateIso: string | null | undefined): ApprovableDueMeta | undefined {
  if (!dueDateIso) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateIso);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 864e5);

  if (diffDays === 0) return { label: "Due today", intent: "warning" };
  if (diffDays < 0)
    return {
      label: `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`,
      intent: "error",
    };
  if (diffDays <= 7)
    return {
      label: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`,
      intent: "info",
    };
  return undefined;
}

/**
 * Map an ApprovalContext's stages into ApprovableFlowStep[].
 *
 * Prepends a synthetic "Submitted" step derived from the workflow request.
 * Assignee names are resolved from the optional principalNames map.
 */
function mapApprovalFlow(
  ctx: ApprovalContext,
  principalNames: Map<string, string>,
): ApprovableFlowStep[] {
  const steps: ApprovableFlowStep[] = [];

  // Synthetic first step — submission
  const submitterName = principalNames.get(ctx.workflow_request.submitted_by);
  steps.push({
    name: "Submitted",
    status: "completed",
    assignee: submitterName,
  });

  // Workflow stages
  for (const stage of ctx.stages) {
    let stepStatus: ApprovableFlowStep["status"];
    switch (stage.status) {
      case "completed":
        stepStatus = "completed";
        break;
      case "active":
        stepStatus = "current";
        break;
      case "rejected":
        stepStatus = "blocked";
        break;
      default:
        stepStatus = "pending";
    }

    // Resolve assignee from first non-pending work item, or first item overall
    const primaryItem =
      stage.work_items.find((wi) => wi.status !== "pending") ??
      stage.work_items[0];
    const assigneeName = primaryItem
      ? principalNames.get(primaryItem.assignee_id)
      : undefined;

    steps.push({
      name: stage.stage_name,
      status: stepStatus,
      assignee: assigneeName,
    });
  }

  return steps;
}

// ── Main mapper ───────────────────────────────────────────────────────────────

/**
 * Maps an `ApInvoiceDetail` (from the AP workbench hooks) into an
 * `ApprovableDocumentHeaderDTO` ready for `<ApprovableDocumentHeader>`.
 *
 * @param invoice   AP invoice detail from `useApInvoiceDetail`
 * @param extras    Optional enrichment fields (cost center, PO refs, etc.)
 */
export function mapApInvoiceToHeader(
  invoice: ApInvoiceDetail,
  extras: ApInvoiceHeaderExtras = {},
): ApprovableDocumentHeaderDTO {
  const {
    subtotalAmount,
    costCenter,
    paymentTerms,
    earlyPayDiscount,
    purchaseOrders,
    supplierLocation,
    supplierYtdCount,
    submittedByName,
    version,
    approvalContext,
    principalNames = new Map(),
    statusDimensions,
    actionBundle,
    blockedReasons,
  } = extras;

  // Compute subtotal: prefer explicit extra, fall back to summing line net_amounts
  const computedSubtotal =
    subtotalAmount ??
    (invoice.lines.length > 0
      ? invoice.lines.reduce((acc, l) => acc + (l.net_amount ?? 0), 0)
      : undefined);

  // Party subtitle: "Riyadh, SA · 42 Invoices YTD"
  const subtitleParts: string[] = [];
  if (supplierLocation) subtitleParts.push(supplierLocation);
  if (supplierYtdCount != null)
    subtitleParts.push(`${supplierYtdCount} Invoices YTD`);
  const partySubtitle = subtitleParts.join(" · ") || undefined;

  // PO reference items
  const poCount = purchaseOrders?.length ?? 0;
  const references =
    purchaseOrders?.map((po) => ({
      label: "PO Reference",
      value: poCount > 1 ? `Multi-Parent (${poCount})` : po.number,
      url: po.id ? `/purchase-orders/${po.id}` : undefined,
    })) ?? [];

  // Version badge: "v2" only when version > 1
  const versionBadge =
    version != null && version > 1 ? `v${version}` : undefined;

  // Approval flow
  const approvalFlow =
    approvalContext != null
      ? mapApprovalFlow(approvalContext, principalNames)
      : undefined;

  // Context counters (for caller to build tabs)
  const context = {
    lineItems: invoice.lines.length,
    attachments: undefined as number | undefined,
    historyEvents: undefined as number | undefined,
    comments: undefined as number | undefined,
  };

  const dto: ApprovableDocumentHeaderDTO = {
    identity: {
      typeLabel: "INVOICE",
      number: invoice.invoiceNumber,
      version: versionBadge,
      statusLabel: mapStatusLabel(invoice.status),
      statusIntent: mapStatusIntent(invoice.status),
    },

    party: invoice.supplierName
      ? {
          id: invoice.supplierId ?? invoice.invoiceNumber,
          name: invoice.supplierName,
          initials: getInitials(invoice.supplierName),
          subtitle: partySubtitle,
        }
      : undefined,

    money: {
      totalLabel: "INVOICE TOTAL",
      currency: invoice.currencyCode,
      formatted: fmtAmount(invoice.payableAmount),
      subtotal:
        computedSubtotal != null ? fmtAmount(computedSubtotal) : undefined,
      tax:
        invoice.tax_amount > 0 ? fmtAmount(invoice.tax_amount) : undefined,
      paymentTerms,
      earlyPayDiscount,
    },

    dates: {
      documentDateLabel: "INVOICE DATE",
      documentDate: fmtDate(invoice.invoiceDate) ?? invoice.invoiceDate,
      dueDate: fmtDate(invoice.dueDate),
      dueMeta: calcDueMeta(invoice.dueDate),
      createdAt: fmtDateTime(invoice.created_at ?? invoice.invoiceDate),
    },

    references: references.length > 0 ? references : undefined,
    costCenter,
    submittedBy: submittedByName,
    approvalFlow,
    statusDimensions,
    actionBundle,
    blockedReasons,
    context,

    // Actions are document-state-dependent; leave undefined here so the
    // page component can inject them based on current status + permissions.
    primaryAction: undefined,
    secondaryActions: [
      { action: "copy", label: "Copy" },
      { action: "export", label: "Export" },
    ],
    destructiveAction: invoice.isVoided
      ? undefined
      : invoice.status.toUpperCase() === "DRAFT"
        ? { action: "cancel", label: "Cancel" }
        : undefined,
  };

  return dto;
}
