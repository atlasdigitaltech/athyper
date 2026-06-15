/**
 * @athyper/content-ui — PaymentTermsCard
 *
 * Spec v1.1 §4.1 (PI Header) + Table Wiring #14, #15.
 *
 * Wires document.payment_term_application (PTA) +
 * document.payment_term_discount_result (PTDR).
 *
 * PTA carries clause-level evaluations for ADVANCE / ADVANCE_RECOVERY /
 * RETENTION / RETENTION_RELEASE / DUE_DATE clauses. PTDR is settlement-
 * time discount realization (append-only, present only after payments).
 *
 * Per R1 in the design plan: early-payment / settlement does NOT live
 * in the Add Discount drawer — it lives here.
 */
"use client";

import { Pencil, Calendar, TrendingDown, Lock, AlertTriangle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { CurrencyTriad } from "../document-components/money/CurrencyTriad";
import type {
  PaymentTermApplication,
  PaymentTermDiscountResult,
  PtaApplicationStatus,
  PtaClauseType,
  PtdrApplicationStatus,
  EditAffordance,
} from "./types";

export interface PaymentTermsCardProps {
  /** Display label of the applied master.payment_term (e.g. "2/10 Net 30"). */
  termLabel: string | null;
  /** Baseline date (purchase_invoice.baseline_date or received_date). */
  baselineDate: string | null;
  /** All applicable PTA rows (effective + superseded — UI filters). */
  applications: PaymentTermApplication[];
  /** Settlement-time PTDR realizations. Empty pre-payment. */
  discountResults: PaymentTermDiscountResult[];

  /** Document currency triad. */
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;

  affordance: EditAffordance;
  /** Open the payment-terms edit drawer. */
  onEdit?: () => void;
  /** Drill into PTA evaluation history. */
  onViewHistory?: () => void;

  className?: string;
}

const PTA_STATUS_INTENT: Record<PtaApplicationStatus, SemanticIntent> = {
  APPLIED:           "success",
  SKIPPED:           "muted",
  CLAMPED:           "warning",
  EXHAUSTED:         "muted",
  NOT_YET_ELIGIBLE:  "info",
};

const PTDR_STATUS_INTENT: Record<PtdrApplicationStatus, SemanticIntent> = {
  QUALIFIED:      "success",
  NOT_QUALIFIED:  "muted",
  PARTIAL:        "warning",
  WAIVED:         "info",
  EXPIRED:        "error",
  REVERSED:       "error",
};

const CLAUSE_TYPE_LABEL: Record<PtaClauseType, string> = {
  ADVANCE:           "Advance",
  ADVANCE_RECOVERY:  "Advance recovery",
  RETENTION:         "Retention",
  RETENTION_RELEASE: "Retention release",
  DUE_DATE:          "Due date",
};

// ── PTA row ────────────────────────────────────────────────────────

function ApplicationRow({
  application,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  application: PaymentTermApplication;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  const statusColors = resolveSemanticColors(PTA_STATUS_INTENT[application.application_status]);
  const isOverride =
    (application.applied_pct != null && application.default_pct != null && application.applied_pct !== application.default_pct)
    || application.applied_amount !== application.default_amount;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3 py-2 text-sm border-b border-border/40 last:border-b-0">
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {CLAUSE_TYPE_LABEL[application.clause_type]}
          </span>
          {application.clause_code !== "DUE_DATE" && (
            <span className="text-[11px] text-muted-foreground">{application.clause_code}</span>
          )}
        </div>
        {application.system_reason_code && (
          <div className="text-[11px] italic text-muted-foreground">
            {application.system_reason_code.replaceAll("_", " ").toLowerCase()}
          </div>
        )}
        {application.manual_override_reason && (
          <div className="text-[11px] italic text-muted-foreground">
            override: {application.manual_override_reason}
          </div>
        )}
      </div>

      {/* Percentage */}
      <div className="text-xs tabular-nums text-right">
        {application.applied_pct != null ? (
          <>
            {application.applied_pct}%
            {isOverride && application.default_pct != null && (
              <span className="ml-1 text-muted-foreground line-through">
                {application.default_pct}%
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Amount */}
      <div className="text-sm tabular-nums font-medium text-right">
        {application.clause_type === "DUE_DATE" ? (
          application.resolved_due_date ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden />
              {new Date(application.resolved_due_date).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-muted-foreground italic">unresolved</span>
          )
        ) : (
          <CurrencyTriad
            amount={application.applied_amount}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        )}
      </div>

      {/* Status */}
      <div>
        <span className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          statusColors.subtleBadge,
        )}>
          {application.application_status === "CLAMPED" && (
            <AlertTriangle className="h-3 w-3" aria-hidden />
          )}
          {application.application_status.replaceAll("_", " ").toLowerCase()}
        </span>
      </div>
    </div>
  );
}

// ── PTDR row ───────────────────────────────────────────────────────

function DiscountResultRow({
  result,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  result: PaymentTermDiscountResult;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  const statusColors = resolveSemanticColors(PTDR_STATUS_INTENT[result.application_status]);

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3 py-2 text-sm border-b border-border/40 last:border-b-0">
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            Tier {result.qualified_tier_no ?? "—"}
          </span>
          {result.is_reversal && (
            <span className="text-[11px] italic text-warning">reversal</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Paid at day {result.qualified_days_actual}
          {result.qualification_date && (
            <span> · {new Date(result.qualification_date).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      <div className="text-xs tabular-nums text-right">
        {result.discount_pct != null ? `${result.discount_pct}%` : "—"}
      </div>

      <div className="text-sm tabular-nums font-medium text-right">
        <CurrencyTriad
          amount={result.discount_amount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
          signed
        />
      </div>

      <div>
        <span className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
          statusColors.subtleBadge,
        )}>
          {result.application_status.replaceAll("_", " ").toLowerCase()}
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export function PaymentTermsCard({
  termLabel,
  baselineDate,
  applications,
  discountResults,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  affordance,
  onEdit,
  onViewHistory,
  className,
}: PaymentTermsCardProps) {
  // Filter to effective PTA rows for the card body; superseded/reversed
  // history is accessible via onViewHistory.
  const effectiveApplications = applications.filter((a) => a.is_effective);

  // Pick the resolved due date from any DUE_DATE clause.
  const dueDateApp = effectiveApplications.find((a) => a.clause_type === "DUE_DATE");

  // Group non-due-date PTA rows.
  const clauseApplications = effectiveApplications
    .filter((a) => a.clause_type !== "DUE_DATE")
    .sort((a, b) => a.evaluation_sequence_no - b.evaluation_sequence_no);

  // Active (non-reversal) discount realizations first; reversals after.
  const activeDiscounts = discountResults.filter((d) => !d.is_reversal);

  const isReadOnly = affordance === "read_only";

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Payment Terms</span>
          {isReadOnly && <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />}
        </div>
        <div className="flex items-center gap-1.5">
          {onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              History
            </button>
          )}
          {affordance === "edit" && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              <Pencil className="h-3 w-3" aria-hidden /> Edit
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-3 flex flex-col gap-2">
        <div className="text-sm">
          <span className="text-xs text-muted-foreground">Applied term: </span>
          <span className="font-medium">{termLabel ?? <span className="italic text-muted-foreground">none</span>}</span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          {baselineDate && (
            <span>Baseline: {new Date(baselineDate).toLocaleDateString()}</span>
          )}
          {dueDateApp?.resolved_due_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden />
              Due: {new Date(dueDateApp.resolved_due_date).toLocaleDateString()}
              {dueDateApp.days_applied != null && (
                <span> ({dueDateApp.days_applied}d)</span>
              )}
            </span>
          )}
        </div>
      </div>

      {clauseApplications.length > 0 && (
        <div>
          <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground border-y border-border/40 bg-muted/20">
            Clauses
          </div>
          {clauseApplications.map((a) => (
            <ApplicationRow
              key={a.id}
              application={a}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          ))}
        </div>
      )}

      {activeDiscounts.length > 0 && (
        <div>
          <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground border-y border-border/40 bg-muted/20 inline-flex items-center gap-1">
            <TrendingDown className="h-3 w-3" aria-hidden /> Settlement discounts
          </div>
          {activeDiscounts.map((d) => (
            <DiscountResultRow
              key={d.id}
              result={d}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          ))}
        </div>
      )}

      {clauseApplications.length === 0 && activeDiscounts.length === 0 && (
        <div className="px-3 py-3 text-xs italic text-muted-foreground">
          No clause evaluations yet. They will compute at submit.
        </div>
      )}
    </div>
  );
}
