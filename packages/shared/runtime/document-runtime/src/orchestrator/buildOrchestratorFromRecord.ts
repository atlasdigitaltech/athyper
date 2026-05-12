/**
 * @athyper/document-runtime — Generic Orchestrator Builder
 *
 * Derives all orchestrator data (status dimensions, action bundle, amount
 * breakdown, health tiles) from the compiled entity descriptor + raw record
 * data + entity operations — WITHOUT any entity-specific code.
 *
 * This is the generic path: any entity with detail_renderer = "document"
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
import type { SemanticIntent } from "@athyper/theme/semantic-colors";
import { POSITIVE, IN_FLIGHT, NEGATIVE, statusToIntent, titleCase } from "@athyper/runtime-shared/core";
import {
  asConfigRecord,
  normalizeStatusKey,
  resolveDocumentActionPresentation,
  textConfig,
  type DocumentActionPresentationConfig,
} from "../documentRuntimeDefaults";

type Intent = SemanticIntent | "primary" | "accent" | "muted";

// ── Action code heuristics ──────────────────────────────────────────────────

// ── Built-in status-driven action groups ────────────────────────────────────
// Applied automatically for any entity with detail_renderer = "document"
// when no entity-specific action_groups is found in display_config.
// Entity-specific config (display_config.action_groups) overrides this entirely.

// ── Amount coercion (val → number for arithmetic, not display) ───────────────

function coerceAmount(val: unknown): number {
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

type DocumentHeaderConfig = CompiledEntity["display_config"]["document_header"] & Record<string, unknown>;

function headerField(dh: DocumentHeaderConfig | undefined, key: string): string | undefined {
  return textConfig(asConfigRecord(dh)?.[key]);
}

function hasConfiguredValue(data: Record<string, unknown>, fieldName: string | undefined): boolean {
  return Boolean(fieldName) && data[fieldName!] !== undefined && data[fieldName!] !== null;
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
  const displayConfig = entity.display_config as Record<string, unknown>;

  // Resolve the canonical status value
  const statusRaw = recordStatus
    ?? (dh?.status_field ? String(data[dh.status_field] ?? "") : "")
    ?? "";
  const statusNorm = normalizeStatusKey(statusRaw);

  // ── Status Dimensions ───────────────────────────────────────────────────
  const statusDimensions = buildStatusDimensions(statusNorm, flags, data, dh);

  // ── Health Tiles ────────────────────────────────────────────────────────
  const healthTiles = buildHealthTiles(statusNorm, flags);

  // ── Amount Breakdown ────────────────────────────────────────────────────
  const amountBreakdown = buildAmountBreakdown(data, dh);

  // ── Action Bundle ───────────────────────────────────────────────────────
  const actionPresentation = resolveDocumentActionPresentation(
    displayConfig,
    entity.display_config.detail_renderer === "document",
  );
  const actionBundle = buildActionBundle(operations, statusNorm, actionPresentation);

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
  dh: DocumentHeaderConfig | undefined,
): StatusDimension[] {
  const dims: StatusDimension[] = [];

  // 1. Lifecycle — always present
  dims.push({
    dimension: "lifecycle",
    label: "Status",
    status_code: statusNorm,
    status_label: titleCase(statusNorm),
    intent: statusToIntent(statusNorm),
  });

  // 2. Accounting — when entity has accounting distributions
  const accountingPostedField = headerField(dh, "accounting_posted_field");
  if (flags?.has_accounting_distribution || hasConfiguredValue(data, accountingPostedField)) {
    const rawPosted = accountingPostedField ? data[accountingPostedField] : undefined;
    const isPosted = rawPosted === undefined ? POSITIVE.has(statusNorm) : rawPosted === true || rawPosted === "true";
    dims.push({
      dimension: "accounting",
      label: "Accounting",
      status_code: isPosted ? "posted" : "unposted",
      status_label: isPosted ? "Posted" : "Unposted",
      intent: isPosted ? "success" : "neutral",
    });
  }

  // 3. Settlement — when entity has payment fields
  const paidAmountField = headerField(dh, "paid_amount_field");
  const payableAmountField = headerField(dh, "payable_amount_field");
  const outstandingAmountField = headerField(dh, "outstanding_amount_field");
  if (
    flags?.has_payment_schedule ||
    hasConfiguredValue(data, paidAmountField) ||
    hasConfiguredValue(data, outstandingAmountField)
  ) {
    const paid = coerceAmount(paidAmountField ? data[paidAmountField] : undefined);
    const payable = coerceAmount(payableAmountField ? data[payableAmountField] : undefined);
    const outstanding = coerceAmount(outstandingAmountField ? data[outstandingAmountField] : undefined);

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
  const matchStatusField = headerField(dh, "match_status_field");
  if (hasConfiguredValue(data, matchStatusField)) {
    const matchStatus = normalizeStatusKey(data[matchStatusField!]);
    dims.push({
      dimension: "matching",
      label: "Reconciliation",
      status_code: matchStatus,
      status_label: titleCase(matchStatus),
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
      summary: isApproved ? "Approved" : NEGATIVE.has(statusNorm) ? titleCase(statusNorm) : IN_FLIGHT.has(statusNorm) ? "In progress" : "Not started",
      satellite_intent: "view_approval_trail",
    });
  }

  // Accounting tile — when entity has accounting distributions
  if (flags?.has_accounting_distribution) {
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
  dh: DocumentHeaderConfig | undefined,
): AmountBreakdownLine[] {
  if (!dh) return [];

  const currency = dh.currency_field ? String(data[dh.currency_field] ?? "") : "";
  const lines: AmountBreakdownLine[] = [];

  // Subtotal
  if (dh.subtotal_field && data[dh.subtotal_field] != null) {
    lines.push({
      label: "Subtotal",
      amount: coerceAmount(data[dh.subtotal_field]),
      currency_code: currency,
      is_total: false,
      indent: 0,
    });
  }

  // Tax
  if (dh.tax_field && data[dh.tax_field] != null) {
    lines.push({
      label: "Tax",
      amount: coerceAmount(data[dh.tax_field]),
      currency_code: currency,
      is_total: false,
      indent: 0,
    });
  }

  // Total (primary amount field)
  if (dh.amount_field && data[dh.amount_field] != null) {
    lines.push({
      label: "Total",
      amount: coerceAmount(data[dh.amount_field]),
      currency_code: currency,
      is_total: true,
      indent: 0,
    });
  }

  const outstandingAmountField = headerField(dh, "outstanding_amount_field");
  if (hasConfiguredValue(data, outstandingAmountField)) {
    const outstanding = coerceAmount(data[outstandingAmountField!]);
    lines.push({
      label: headerField(dh, "outstanding_label") ?? "Outstanding",
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

function expandActionCodes(codes: string[] | undefined, aliases: Record<string, string[]>): Set<string> {
  const expanded = new Set<string>();
  for (const code of codes ?? []) {
    expanded.add(code);
    for (const alias of aliases[code] ?? []) {
      expanded.add(alias);
    }
  }
  return expanded;
}

function buildActionBundle(
  operations: EntityOperation[],
  statusNorm: string,
  actionPresentation: DocumentActionPresentationConfig,
): ActionBundleItem[] {
  const items: ActionBundleItem[] = operations
    .filter((op) => op.is_enabled)
    .filter((op) => op.surface === "DETAIL" || op.surface === "BOTH")
    .filter((op) => op.placement !== "COMMAND")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((op): ActionBundleItem => {
      const code = op.permission_code.includes(".")
        ? op.permission_code.split(".").pop()!
        : op.permission_code;

      const isOutputAction = actionPresentation.outputCodes.has(code);
      const group: ActionBundleGroup =
        isOutputAction && op.placement === "TOOLBAR"
          ? "output"
          : actionPresentation.placementToGroup[op.placement] ?? "overflow";

      return {
        action_code: code,
        label: op.label_override ?? actionPresentation.labelOverrides[code] ?? titleCase(code),
        group,
        icon_key: op.icon_override,
        is_destructive: actionPresentation.destructiveCodes.has(code),
        is_disabled: false,
        disabled_reason: null,
        sort_order: op.sort_order,
        requires_confirmation: actionPresentation.confirmationCodes.has(code) || op.handler_type === "MODAL",
      };
    });

  // Apply status-driven group override when action_groups config is present.
  // Operations not listed for the current status are demoted to "overflow".
  const statusConfig = actionPresentation.groupsByStatus?.[statusNorm];
  if (!statusConfig) return items;

  const primaryCodes = expandActionCodes(statusConfig.primary, actionPresentation.aliases);
  const workingCodes = expandActionCodes(statusConfig.working, actionPresentation.aliases);
  const outputCodes  = expandActionCodes(statusConfig.output, actionPresentation.aliases);
  const allListed    = new Set([...primaryCodes, ...workingCodes, ...outputCodes]);

  return items
    .filter((item) => allListed.has(item.action_code))
    .map((item) => {
      const c = item.action_code;
      if (primaryCodes.has(c)) return { ...item, group: "primary" as ActionBundleGroup };
      if (workingCodes.has(c)) return { ...item, group: "working" as ActionBundleGroup };
      return { ...item, group: "output" as ActionBundleGroup };
    });
}
