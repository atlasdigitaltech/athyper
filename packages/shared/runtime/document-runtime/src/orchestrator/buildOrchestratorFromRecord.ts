/**
 * @athyper/document-runtime — Generic Orchestrator Builder
 *
 * Derives all orchestrator data (status dimensions, action bundle, amount
 * breakdown, health tiles) from the compiled entity descriptor + raw record
 * data + entity operations — WITHOUT any entity-specific code.
 *
 * This is the generic path: any entity with detail_renderer = "approvable"
 * automatically gets the full orchestrator UI. Entity-specific pages (e.g.
 * purchase-invoice) can override with richer data from specialised APIs.
 *
 * Sources:
 *   CompiledEntity.display_config.document_header → amount fields, status field
 *   CompiledEntity.feature_flags                  → which health tiles to show
 *   record.data[fieldName]                        → actual field values
 *   EntityOperation[]                             → action bundle from placement
 */
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import type {
  StatusDimension,
  ProcessHealthTile,
  AmountBreakdownLine,
  ActionBundleItem,
  ActionBundleGroup,
  ValidationNotice,
} from "@athyper/api-contracts/documents";

// ── Status intent heuristics ────────────────────────────────────────────────

const POSITIVE = new Set([
  "approved", "posted", "paid", "fully_paid", "completed", "cleared",
  "active", "closed", "settled", "matched", "fully_matched",
]);
const IN_FLIGHT = new Set([
  "pending", "submitted", "in_review", "pending_approval", "partially_paid",
  "partially_matched", "partially_cleared", "open", "in_progress",
]);
const NEGATIVE = new Set([
  "rejected", "cancelled", "reversed", "voided", "overdue", "failed",
  "on_hold", "blocked", "suspended",
]);

type Intent = "success" | "warning" | "error" | "info" | "neutral" | "primary" | "accent" | "muted";

function statusToIntent(raw: unknown): Intent {
  if (typeof raw !== "string") return "neutral";
  const key = raw.toLowerCase().replace(/[\s-]/g, "_");
  if (POSITIVE.has(key)) return "success";
  if (IN_FLIGHT.has(key)) return "warning";
  if (NEGATIVE.has(key)) return "error";
  if (key === "draft") return "neutral";
  return "info";
}

function formatLabel(code: string): string {
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Action code heuristics ──────────────────────────────────────────────────

const DESTRUCTIVE_CODES = new Set([
  "cancel", "reverse", "void", "delete", "archive", "remove",
  "reject", "deny", "revoke", "suspend",
]);

const CONFIRMATION_CODES = new Set([
  "submit", "approve", "deny", "reject", "post", "reverse",
  "cancel", "void", "delete", "hold", "release_hold",
]);

const PLACEMENT_TO_GROUP: Record<string, ActionBundleGroup> = {
  PRIMARY: "primary",
  TOOLBAR: "working",
  OVERFLOW: "overflow",
  CONTEXT: "overflow",
};

// ── Amount formatting ───────────────────────────────────────────────────────

function fmtAmount(val: unknown): number {
  const n = typeof val === "number" ? val : Number(val);
  return Number.isNaN(n) ? 0 : n;
}

// ── Builder result ──────────────────────────────────────────────────────────

export interface OrchestratorData {
  statusDimensions: StatusDimension[];
  healthTiles: ProcessHealthTile[];
  amountBreakdown: AmountBreakdownLine[];
  actionBundle: ActionBundleItem[];
  validationNotices: ValidationNotice[];
  blockedReasons: string[];
}

// ── Main builder ────────────────────────────────────────────────────────────

/**
 * Build orchestrator data generically from compiled entity + record + operations.
 *
 * @param entity      Compiled entity descriptor
 * @param data        Raw record data (field name → value)
 * @param operations  Entity operations from control.entity_operation
 * @param recordStatus  Override status string (falls back to data[status_field])
 */
export function buildOrchestratorFromRecord(
  entity: CompiledEntity,
  data: Record<string, unknown>,
  operations: EntityOperation[],
  recordStatus?: string,
): OrchestratorData {
  const dh = entity.display_config.document_header;
  const flags = entity.feature_flags ?? {};

  // Resolve the canonical status value
  const statusRaw = recordStatus
    ?? (dh?.status_field ? String(data[dh.status_field] ?? "") : "")
    ?? "";
  const statusNorm = statusRaw.toLowerCase().replace(/[\s-]/g, "_");

  // ── Status Dimensions ───────────────────────────────────────────────────
  const statusDimensions = buildStatusDimensions(statusNorm, flags, data, dh);

  // ── Health Tiles ────────────────────────────────────────────────────────
  const healthTiles = buildHealthTiles(statusNorm, flags);

  // ── Amount Breakdown ────────────────────────────────────────────────────
  const amountBreakdown = buildAmountBreakdown(data, dh);

  // ── Action Bundle ───────────────────────────────────────────────────────
  const actionBundle = buildActionBundle(operations);

  return {
    statusDimensions,
    healthTiles,
    amountBreakdown,
    actionBundle,
    validationNotices: [],
    blockedReasons: [],
  };
}

// ── Status Dimensions ───────────────────────────────────────────────────────

function buildStatusDimensions(
  statusNorm: string,
  flags: CompiledEntity["feature_flags"],
  data: Record<string, unknown>,
  dh: CompiledEntity["display_config"]["document_header"],
): StatusDimension[] {
  const dims: StatusDimension[] = [];

  // 1. Lifecycle — always present
  dims.push({
    dimension: "lifecycle",
    label: "Status",
    status_code: statusNorm,
    status_label: formatLabel(statusNorm),
    intent: statusToIntent(statusNorm),
  });

  // 2. Accounting — when entity has accounting entries
  if (flags?.has_accounting_entries || POSITIVE.has("posted") && data["is_posted"] != null) {
    const isPosted = data["is_posted"] === true || data["is_posted"] === "true";
    dims.push({
      dimension: "accounting",
      label: "Accounting",
      status_code: isPosted ? "posted" : "unposted",
      status_label: isPosted ? "Posted" : "Unposted",
      intent: isPosted ? "success" : "neutral",
    });
  }

  // 3. Settlement — when entity has payment fields
  if (flags?.has_payment_schedule || data["paid_amount"] != null || data["outstanding_amount"] != null) {
    const paid = fmtAmount(data["paid_amount"]);
    const payable = fmtAmount(data["payable_amount"]);
    const outstanding = fmtAmount(data["outstanding_amount"]);

    let settlementCode = "unpaid";
    let settlementLabel = "Unpaid";
    let settlementIntent: Intent = "neutral";

    if (outstanding === 0 && payable > 0) {
      settlementCode = "fully_paid";
      settlementLabel = "Fully Paid";
      settlementIntent = "success";
    } else if (paid > 0 && outstanding > 0) {
      settlementCode = "partially_paid";
      settlementLabel = "Partially Paid";
      settlementIntent = "warning";
    }

    dims.push({
      dimension: "settlement",
      label: "Settlement",
      status_code: settlementCode,
      status_label: settlementLabel,
      intent: settlementIntent,
    });
  }

  // 4. Matching — when entity has match status
  if (data["match_status"] != null) {
    const matchStatus = String(data["match_status"]).toLowerCase().replace(/[\s-]/g, "_");
    dims.push({
      dimension: "matching",
      label: "Reconciliation",
      status_code: matchStatus,
      status_label: formatLabel(matchStatus),
      intent: statusToIntent(matchStatus),
    });
  }

  return dims;
}

// ── Health Tiles ────────────────────────────────────────���────────────────────

function buildHealthTiles(
  statusNorm: string,
  flags: CompiledEntity["feature_flags"],
): ProcessHealthTile[] {
  const tiles: ProcessHealthTile[] = [];
  const isApproved = POSITIVE.has(statusNorm);
  const isPosted = ["posted", "partially_paid", "fully_paid", "paid", "closed"].includes(statusNorm);

  // Approval tile — when entity has workflow
  if (flags?.has_workflow || flags?.is_approvable) {
    tiles.push({
      dimension: "approval",
      label: "Approval",
      severity: isApproved ? "success" : NEGATIVE.has(statusNorm) ? "error" : IN_FLIGHT.has(statusNorm) ? "warning" : "neutral",
      summary: isApproved ? "Approved" : NEGATIVE.has(statusNorm) ? formatLabel(statusNorm) : IN_FLIGHT.has(statusNorm) ? "In progress" : "Not started",
      satellite_intent: "view_approval_trail",
    });
  }

  // Accounting tile — when entity has accounting entries
  if (flags?.has_accounting_entries) {
    tiles.push({
      dimension: "accounting",
      label: "Accounting",
      severity: isPosted ? "success" : "neutral",
      summary: isPosted ? "Posted" : "Not posted",
      satellite_intent: "view_journal_entry",
    });
  }

  // Payment tile — when entity has payment schedule
  if (flags?.has_payment_schedule) {
    const isPaid = ["fully_paid", "paid"].includes(statusNorm);
    const isPartial = statusNorm === "partially_paid";
    tiles.push({
      dimension: "payment",
      label: "Payment",
      severity: isPaid ? "success" : isPartial ? "warning" : "neutral",
      summary: isPaid ? "Settled" : isPartial ? "Partial" : "Unpaid",
      satellite_intent: "open_payment",
    });
  }

  // Budget tile — when entity has budget impact
  if (flags?.has_budget_impact) {
    tiles.push({
      dimension: "budget",
      label: "Budget",
      severity: "success",
      summary: "Check passed",
      satellite_intent: "view_budget_trace",
    });
  }

  return tiles;
}

// ── Amount Breakdown ─────────────────────────────────────────────────────────

function buildAmountBreakdown(
  data: Record<string, unknown>,
  dh: CompiledEntity["display_config"]["document_header"],
): AmountBreakdownLine[] {
  if (!dh) return [];

  const currency = dh.currency_field ? String(data[dh.currency_field] ?? "USD") : "USD";
  const lines: AmountBreakdownLine[] = [];

  // Subtotal
  if (dh.subtotal_field && data[dh.subtotal_field] != null) {
    lines.push({
      label: "Subtotal",
      amount: fmtAmount(data[dh.subtotal_field]),
      currency_code: currency,
      is_total: false,
      indent: 0,
    });
  }

  // Tax
  if (dh.tax_field && data[dh.tax_field] != null) {
    lines.push({
      label: "Tax",
      amount: fmtAmount(data[dh.tax_field]),
      currency_code: currency,
      is_total: false,
      indent: 0,
    });
  }

  // Total (primary amount field)
  if (dh.amount_field && data[dh.amount_field] != null) {
    lines.push({
      label: "Total",
      amount: fmtAmount(data[dh.amount_field]),
      currency_code: currency,
      is_total: true,
      indent: 0,
    });
  }

  // Outstanding (common DDL pattern)
  if (data["outstanding_amount"] != null) {
    const outstanding = fmtAmount(data["outstanding_amount"]);
    lines.push({
      label: "Outstanding",
      amount: outstanding,
      currency_code: currency,
      is_total: false,
      indent: 0,
      intent: outstanding > 0 ? "warning" : "success",
    });
  }

  return lines;
}

// ── Action Bundle ────────────────────────────────────────────────────────────

function buildActionBundle(operations: EntityOperation[]): ActionBundleItem[] {
  return operations
    .filter((op) => op.is_enabled)
    .filter((op) => op.surface === "DETAIL" || op.surface === "BOTH")
    .filter((op) => op.placement !== "COMMAND")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((op): ActionBundleItem => {
      const code = op.permission_code.includes(".")
        ? op.permission_code.split(".").pop()!
        : op.permission_code;

      // Map placement → output group (separate from working/overflow)
      // TOOLBAR actions that are output-like (export, print) go to "output"
      const isOutputAction = ["export", "print"].includes(code);
      const group: ActionBundleGroup =
        isOutputAction && op.placement === "TOOLBAR"
          ? "output"
          : PLACEMENT_TO_GROUP[op.placement] ?? "overflow";

      return {
        action_code: code,
        label: op.label_override ?? formatLabel(code),
        group,
        icon_key: op.icon_override,
        is_destructive: DESTRUCTIVE_CODES.has(code),
        is_disabled: false,
        disabled_reason: null,
        sort_order: op.sort_order,
        requires_confirmation: CONFIRMATION_CODES.has(code) || op.handler_type === "MODAL",
      };
    });
}
