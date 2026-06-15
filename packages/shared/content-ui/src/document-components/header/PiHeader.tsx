/**
 * @athyper/content-ui — PiHeader composite
 *
 * Spec v1.1 §4.1 — assembles the PI Header surface:
 *   • Identity (code, supplier, supplier inv #, status)
 *   • Snapshot-state hint ("Live from supplier master" → "Snapshot · timestamp")
 *   • AmountSummary chip strip (cached rollups, read-only)
 *   • Conditional FX revaluation badge
 *   • Conditional Netting batch badge
 *   • PaymentTermsCard slot
 *   • Toolbar actions (Submit, Approve, Reject, Postings Preview, etc.)
 *
 * Per §A1 every amount renders with CurrencyTriad.
 * Per §A5 hold-restoration phase is decided by the parent (this
 * component just exposes the current status).
 */
"use client";

import type { ReactNode } from "react";
import { Calendar, Banknote, History, ChevronRight, Lock } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { CurrencyTriad } from "../money/CurrencyTriad";
import { MatchBadge } from "../match/MatchBadge";
import type {
  PurchaseInvoiceHeader,
  PiAmountSummary,
  PiStatus,
} from "../../purchase-invoice/types";

// ── Public types ──────────────────────────────────────────────────

export interface PiHeaderAction {
  action: string;
  label: string;
  variant?: "default" | "destructive" | "primary";
  disabled?: boolean;
  reason?: string;
}

export interface PiHeaderProps {
  header: PurchaseInvoiceHeader;

  /** Snapshot freeze state — affects the "Parties & References" tagline. */
  snapshotsFrozen: boolean;
  /** ISO timestamp when snapshots were frozen (post-submit). */
  snapshotsFrozenAt?: string | null;

  /** Conditional FX revaluation count for non-base currencies. */
  fxRevaluationCount?: number;
  onOpenFxHistory?: () => void;

  /** Conditional netting batch reference. */
  nettingBatchCode?: string | null;
  onOpenNettingBatch?: () => void;

  /** Toolbar actions (Submit, Approve, Reject, etc.). */
  actions?: ReadonlyArray<PiHeaderAction>;
  onAction?: (action: string) => void;

  /** Open Postings Preview sheet. */
  onOpenPostingsPreview?: () => void;

  /** PaymentTermsCard slot — parent passes it composed with PTA + PTDR. */
  paymentTermsSlot?: ReactNode;

  /** Snapshot card slot — parent composes party/address/bank/tax summaries. */
  snapshotCardSlot?: ReactNode;

  /**
   * Match-exception click. PI-header level summary jumps to the lines
   * grid filtered to exception lines.
   */
  onJumpToMatchExceptions?: () => void;

  className?: string;
}

// ── Status intent mapping ─────────────────────────────────────────

const PI_STATUS_INTENT: Record<PiStatus, SemanticIntent> = {
  draft:              "muted",
  pending_approval:   "info",
  approved:           "info",
  rejected:           "error",
  posted:             "success",
  partially_paid:     "primary",
  fully_paid:         "success",
  on_hold:            "warning",
  reversed:           "error",
  cancelled:          "muted",
};

function StatusBadge({ status }: { status: PiStatus }) {
  const colors = resolveSemanticColors(PI_STATUS_INTENT[status]);
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
      colors.subtleBadge,
    )}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

// ── AmountSummary chip strip ───────────────────────────────────────

function AmountChip({
  label,
  amount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  emphasized = false,
  intent,
}: {
  label: string;
  amount: number;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  emphasized?: boolean;
  intent?: SemanticIntent;
}) {
  const colors = intent ? resolveSemanticColors(intent) : null;
  return (
    <div className={cn(
      "flex flex-col gap-0.5 px-3 py-2 rounded-md border border-border",
      emphasized ? "bg-card" : "bg-muted/40",
      colors?.text,
    )}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn(
        "text-sm tabular-nums",
        emphasized && "font-semibold",
      )}>
        <CurrencyTriad
          amount={amount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
      </div>
    </div>
  );
}

function AmountSummaryStrip({
  amounts,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  amounts: PiAmountSummary;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      <AmountChip label="Net"          amount={amounts.subtotal_amount}        currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      <AmountChip label="Charges"      amount={amounts.charges_amount}         currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      <AmountChip label="Tax"          amount={amounts.tax_amount}             currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      <AmountChip label="Withholding"  amount={amounts.withholding_tax_amount} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      <AmountChip label="Retention"    amount={amounts.retention_amount}       currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      <AmountChip label="Advance"      amount={amounts.advance_deduction_amount} currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
      <AmountChip label="Payable"      amount={amounts.payable_amount}         currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} emphasized intent="primary" />
      <AmountChip label="Outstanding"  amount={amounts.outstanding_amount}     currencyCode={currencyCode} baseCurrencyCode={baseCurrencyCode} exchangeRate={exchangeRate} />
    </div>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────

function ToolbarButton({
  action,
  onClick,
}: {
  action: PiHeaderAction;
  onClick: () => void;
}) {
  const variantClass = action.variant === "destructive"
    ? "bg-destructive text-destructive-foreground"
    : action.variant === "primary"
    ? "bg-foreground text-background"
    : "border border-border text-foreground hover:bg-muted/60";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={action.disabled}
      title={action.reason}
      className={cn(
        "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium",
        variantClass,
        action.disabled && "opacity-40 pointer-events-none",
      )}
    >
      {action.label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────

export function PiHeader({
  header,
  snapshotsFrozen,
  snapshotsFrozenAt,
  fxRevaluationCount,
  onOpenFxHistory,
  nettingBatchCode,
  onOpenNettingBatch,
  actions = [],
  onAction,
  onOpenPostingsPreview,
  paymentTermsSlot,
  snapshotCardSlot,
  onJumpToMatchExceptions,
  className,
}: PiHeaderProps) {
  const showFxBadge = header.currency_code !== header.base_currency_code
    && fxRevaluationCount != null
    && fxRevaluationCount > 0;

  return (
    <div className={cn("flex flex-col gap-4 p-4 rounded-md border border-border bg-card", className)}>
      {/* Identity row */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Purchase Invoice
              </div>
              <div className="text-lg font-semibold tabular-nums">{header.code}</div>
            </div>
            <StatusBadge status={header.status} />
          </div>

          <div className="text-sm">
            <span className="font-medium">{header.supplier_label}</span>
            <span className="text-muted-foreground"> · {header.supplier_invoice_number}</span>
            <span className="text-muted-foreground"> · {new Date(header.supplier_invoice_date).toLocaleDateString()}</span>
          </div>

          {/* Match summary */}
          <div className="flex items-center gap-3 mt-1">
            <MatchBadge
              status={header.match_status}
              onClick={header.match_status === "match_exception" ? onJumpToMatchExceptions : undefined}
            />
            <span className="text-xs text-muted-foreground">
              {header.match_type.replaceAll("_", " ")} match
            </span>
            {header.match_exception_count > 0 && (
              <span className="text-xs text-error">
                {header.match_exception_count} exception{header.match_exception_count === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {actions.map((a) => (
            <ToolbarButton key={a.action} action={a} onClick={() => onAction?.(a.action)} />
          ))}
          {onOpenPostingsPreview && (
            <button
              type="button"
              onClick={onOpenPostingsPreview}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              Postings Preview <ChevronRight className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Snapshot-state caption */}
      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        {snapshotsFrozen ? (
          <>
            <Lock className="h-3 w-3" aria-hidden />
            Snapshot{snapshotsFrozenAt ? ` · ${new Date(snapshotsFrozenAt).toLocaleString()}` : ""}
          </>
        ) : (
          <>
            <Calendar className="h-3 w-3" aria-hidden />
            Live from supplier master · freezes on submit
          </>
        )}
      </div>

      {/* Snapshot card slot (parent composes) */}
      {snapshotCardSlot}

      {/* AmountSummary strip */}
      <AmountSummaryStrip
        amounts={header.amounts}
        currencyCode={header.currency_code}
        baseCurrencyCode={header.base_currency_code}
        exchangeRate={header.exchange_rate}
      />

      {/* FX + Netting conditional chips */}
      {(showFxBadge || nettingBatchCode) && (
        <div className="flex flex-wrap gap-2">
          {showFxBadge && (
            <button
              type="button"
              onClick={onOpenFxHistory}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/60"
            >
              <History className="h-3 w-3" aria-hidden />
              Currency: {header.currency_code} · {fxRevaluationCount} revaluation event{fxRevaluationCount === 1 ? "" : "s"}
              <ChevronRight className="h-3 w-3" aria-hidden />
            </button>
          )}
          {nettingBatchCode && (
            <button
              type="button"
              onClick={onOpenNettingBatch}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/60"
            >
              <Banknote className="h-3 w-3" aria-hidden />
              Part of netting batch {nettingBatchCode}
              <ChevronRight className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* Payment terms card slot (parent passes composed card) */}
      {paymentTermsSlot}
    </div>
  );
}
