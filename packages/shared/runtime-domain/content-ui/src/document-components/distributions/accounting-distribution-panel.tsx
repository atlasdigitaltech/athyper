/**
 * @athyper/content-ui — AccountingDistributionPanel (Band 4)
 *
 * Spec v1.1 §4.3 Band 4 + §6.5 (balance reconciler) + acceptance §A6.
 *
 * Renders accounting_distribution rows scoped to one PIL. Each row
 * surfaces account_source as a "resolved via X" tag.
 *
 * Empty state (per §A6): when no AD rows in draft, this panel
 * displays "Will resolve at posting". Per UI-P6, the panel stays
 * VISIBLE because AD is required for posting — not hidden.
 *
 * Balance reconciler footer compares sum(distributed_amount) to
 * the authoritative distributable cost supplied by the caller.
 */
"use client";

import type { ComponentType } from "react";
import { CheckCircle2, AlertCircle, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { resolveSemanticColors } from "@athyper/platform-theme/semantic-colors";
import { CurrencyTriad } from "../money/currency-triad";
import type {
  AccountingDistribution,
  AdAccountSource,
  EditAffordance,
} from "../../purchase-invoice/types";

export interface AccountingDistributionPanelProps {
  /** AD rows for this line. */
  distributions: AccountingDistribution[];
  /** Line gross — the balance target. */
  lineGrossAmount: number;
  /** Line currency triad. */
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;

  /** Resolved edit gate. */
  affordance: EditAffordance;

  /** Add a new split. */
  onAdd?: () => void;
  /** Edit a split (draft + approval pre-post). */
  onEdit?: (adId: string) => void;
  /** Delete a split (draft only). */
  onDelete?: (adId: string) => void;

  className?: string;
}

const SOURCE_LABEL: Record<AdAccountSource, string> = {
  PENDING:  "Pending",
  OVERRIDE: "Manual",
  PROFILE:  "Profile",
  FALLBACK: "Fallback",
};

const AD_GRID =
  "grid grid-cols-[2.5rem_minmax(12rem,1fr)_5.5rem_5rem_8rem_4.5rem] items-center gap-3";

// ── Balance state derivation ───────────────────────────────────────

type BalanceState =
  | { kind: "balanced"; sum: number }
  | { kind: "short"; sum: number; delta: number }
  | { kind: "over"; sum: number; delta: number };

function computeBalance(
  distributions: AccountingDistribution[],
  lineGrossAmount: number,
  tolerance: number = 0.005,
): BalanceState {
  const sum = distributions.reduce((acc, d) => acc + d.distributed_amount, 0);
  const delta = sum - lineGrossAmount;
  if (Math.abs(delta) <= tolerance) return { kind: "balanced", sum };
  if (delta < 0) return { kind: "short", sum, delta: -delta };
  return { kind: "over", sum, delta };
}

// ── Balance footer ─────────────────────────────────────────────────

function BalanceFooter({
  balance,
  lineGrossAmount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  balance: BalanceState;
  lineGrossAmount: number;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  if (balance.kind === "balanced") {
    const percentage = lineGrossAmount === 0 ? 100 : (balance.sum / lineGrossAmount) * 100;
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/30">
        <div className="text-xs text-foreground/80">
          AD TOTAL <span className="ml-1 font-medium text-foreground">
            <CurrencyTriad
              amount={balance.sum}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </span>
          <span className="ml-2 tabular-nums">· {percentage.toFixed(2)}%</span>
        </div>
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" aria-hidden /> balanced to distributable cost
        </div>
      </div>
    );
  }

  const label = balance.kind === "short" ? "short by" : "over by";

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/30">
      <div className="text-xs text-foreground/80">
        AD TOTAL <span className="ml-1 font-medium text-foreground">
          <CurrencyTriad
            amount={balance.sum}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        </span>
      </div>
      <div className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
        <AlertCircle className="h-3 w-3" aria-hidden />
        {label}{" "}
        <CurrencyTriad
          amount={balance.delta}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
        <span className="ml-1">· cannot submit</span>
      </div>
    </div>
  );
}

// ── Resolution source chip ─────────────────────────────────────────

function ResolutionChip({ source }: { source: AdAccountSource }) {
  const colors = resolveSemanticColors("info");

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
      colors.subtleBadge,
    )}>
      <span className="font-medium">{SOURCE_LABEL[source]}</span>
    </span>
  );
}

// ── One AD row ─────────────────────────────────────────────────────

function DistributionRow({
  distribution,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  lineGrossAmount,
  affordance,
  onEdit,
  onDelete,
}: {
  distribution: AccountingDistribution;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  lineGrossAmount: number;
  affordance: EditAffordance;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const showEdit = affordance === "edit" || affordance === "replace";
  const showDelete = affordance === "edit";

  // Derive % from distributed_amount if PERCENT basis is set, else compute.
  const pct = distribution.split_pct
    ?? (lineGrossAmount === 0 ? 0 : (distribution.distributed_amount / lineGrossAmount) * 100);

  return (
    <div className={cn(AD_GRID, "px-3 py-2 text-sm border-b border-border/40 last:border-b-0")}>
      <div className="text-xs tabular-nums text-foreground/70">#{distribution.distribution_no}</div>

      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="font-semibold text-foreground truncate">
          {distribution.gl_account_label ?? <span className="italic font-medium text-foreground/70">unresolved</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-foreground/70">
          {distribution.cost_center_label && <span>CC: {distribution.cost_center_label}</span>}
          {distribution.profit_center_label && <span>PC: {distribution.profit_center_label}</span>}
          {distribution.project_label && <span>Proj: {distribution.project_label}</span>}
          {distribution.asset_id && <span className="font-medium">Asset</span>}
        </div>
      </div>

      {/* Resolution source */}
      <div>
        <ResolutionChip
          source={distribution.account_source}
        />
      </div>

      {/* % */}
      <div className="text-right text-xs tabular-nums text-foreground/80">{pct.toFixed(2)}%</div>

      {/* Amount */}
      <div className="text-right text-sm tabular-nums font-semibold text-foreground">
        <CurrencyTriad
          amount={distribution.distributed_amount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
      </div>

      {/* Row actions — icon buttons matching the PC waterfall RowAction style. */}
      <div className="flex items-center gap-1 justify-end">
        {showEdit && onEdit && (
          <RowAction
            Icon={Pencil}
            label="Edit distribution"
            onClick={() => onEdit(distribution.id)}
          />
        )}
        {showDelete && onDelete && (
          <RowAction
            Icon={Trash2}
            label="Delete distribution"
            onClick={() => onDelete(distribution.id)}
          />
        )}
      </div>
    </div>
  );
}

// ── Row action icon button ─────────────────────────────────────────
// Mirrors PricingComponentWaterfall's RowAction so AD rows and PC rows
// share the same compact icon affordance (h-6 w-6 button + h-3 w-3 icon).

function RowAction({
  Icon,
  label,
  onClick,
  disabled,
}: {
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border",
        "bg-card text-foreground/70 hover:text-foreground hover:bg-muted/60",
        "disabled:opacity-40 disabled:pointer-events-none",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </button>
  );
}

// ── Empty-state placeholder ────────────────────────────────────────

/**
 * Empty-state body inside the AD panel. AD is auto-created from the
 * source line, so the empty state only renders if the auto-create
 * path didn't fire — typically a draft with no lines yet.
 */
function EmptyPlaceholder({
  affordance,
  onAdd,
}: {
  affordance: EditAffordance;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm">
      <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="text-muted-foreground">
          No distribution rows yet — will resolve at posting.
        </div>
      </div>
      {affordance === "edit" && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs font-medium",
            "text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-solid",
          )}
        >
          <Plus className="h-3 w-3" aria-hidden /> Add split manually
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export function AccountingDistributionPanel({
  distributions,
  lineGrossAmount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  affordance,
  onAdd,
  onEdit,
  onDelete,
  className,
}: AccountingDistributionPanelProps) {
  // Per §A6: keep band visible when AD is required-but-unresolved.
  if (distributions.length === 0) {
    return (
      <div className={cn("rounded-md border border-border bg-card", className)}>
        <div className={cn(AD_GRID, "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/70 border-b border-border bg-muted/30")}>
          <div>#</div>
          <div>GL Account</div>
          <div>Source</div>
          <div className="text-right">%</div>
          <div className="text-right">Amount</div>
          <div aria-hidden />
        </div>
        <EmptyPlaceholder
          affordance={affordance}
          onAdd={onAdd}
        />
      </div>
    );
  }

  const sorted = [...distributions].sort((a, b) => a.distribution_no - b.distribution_no);
  const balance = computeBalance(distributions, lineGrossAmount);

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      {/* Header row */}
      <div className={cn(AD_GRID, "px-3 py-2 text-xs font-semibold text-foreground/70 border-b border-border bg-muted/30")}>
        <div>#</div>
        <div>GL Account</div>
        <div>Source</div>
        <div className="text-right">%</div>
        <div className="text-right">Amount</div>
        <div aria-hidden />
      </div>

      {/* Rows */}
      <div>
        {sorted.map((distribution) => (
          <DistributionRow
            key={distribution.id}
            distribution={distribution}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
            lineGrossAmount={lineGrossAmount}
            affordance={affordance}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Add split affordance */}
      {affordance === "edit" && onAdd && (
        <div className="px-3 py-2 border-t border-border/40">
          <button
            type="button"
            onClick={onAdd}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium",
              "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            <Plus className="h-3 w-3" aria-hidden /> Add split
          </button>
        </div>
      )}

      {/* Balance reconciler footer */}
      <BalanceFooter
        balance={balance}
        lineGrossAmount={lineGrossAmount}
        currencyCode={currencyCode}
        baseCurrencyCode={baseCurrencyCode}
        exchangeRate={exchangeRate}
      />
    </div>
  );
}
