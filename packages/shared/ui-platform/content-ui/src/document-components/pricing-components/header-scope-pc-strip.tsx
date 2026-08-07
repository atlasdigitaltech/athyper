/**
 * @athyper/content-ui — HeaderScopePcStrip
 *
 * Spec v1.1 §4.4 + acceptance §A4.
 *
 * Slim strip below the lines grid showing header-scope pricing_component
 * rows (entry_level='header') and their apportionment projection to lines.
 *
 * Per §A4, when overrides exist the strip surfaces TWO totals:
 *   • Header projection — what the header row produces (must balance to itself)
 *   • Effective line total — what actually appears across lines after overrides
 *
 * Hidden entirely when there are no header-scope rows (UI-P6).
 */
"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  CornerDownRight,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Sigma,
  Trash2,
} from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { SearchInput } from "@athyper/platform-ui/composites";
import { CurrencyTriad } from "../money/currency-triad";
import { PricingComponentOriginBadge as OriginBadge } from "./pricing-component-waterfall";
import type {
  PricingComponent,
  PcApportionBasis,
  PcTermType,
  HeaderPcProjection,
  EditAffordance,
} from "../../purchase-invoice/types";

/**
 * Per-header-PC aggregate (v3.1 Phase 6). Source: the server-side
 * `apportionment-summary` endpoint. The strip falls back to client-
 * computed totals when this is absent.
 */
export interface ApportionmentSummary {
  header_pc_id:    string;
  line_count:      number;
  override_count:  number;
  /** Numeric string. `parent.computed_amount − Σ child.computed_amount`. */
  balance_gap:     string;
  /** Numeric string. `Σ child.computed_amount`. */
  allocated_sum:   string;
  /** ISO timestamp of GREATEST(parent, child) updated_at. */
  computed_at:     string | null;
}

/**
 * Line-scope component rollup (v3.1 Phase 6b). Source: the server-side
 * `line-rollup` endpoint. Each entry groups all user-entered line-scope
 * PCs (origin='manual', not apportioned from a header) by
 * `condition_type_id`, so the strip can render a single read-only row
 * summarising "VAT — Zero Rated · ← from 3 lines · MYR 351.00" beside
 * editable header-scope entries.
 *
 * `rate_value` is null when contributing lines use different rates —
 * the strip renders "varies" in that case.
 */
export interface LineRollupGroup {
  condition_type_id:    string;
  condition_type_label: string | null;
  condition_type_code:  string | null;
  term_type:            PcTermType;
  line_count:           number;
  /** Numeric string when uniform across lines, null when rates vary. */
  rate_value:           string | null;
  /** Numeric string. `Σ child.computed_amount` (non-negative magnitude). */
  amount:               string;
  /** UUIDs of contributing PIL rows, for drill-back. */
  line_ids:             string[];
}

export interface HeaderScopePcStripProps {
  /** Header-scope projections with apportionment data. */
  projections: HeaderPcProjection[];
  /** Document currency triad (for headline amounts). */
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;

  /** Resolved edit gate. */
  affordance: EditAffordance;

  /** Add a new header-scope component (discount / charge / freight etc.). */
  onAdd?: () => void;
  /** Add a new positive header-scope charge/freight row. */
  onAddCharge?: () => void;
  /** Add a header-scope tax row (separate drawer). */
  onAddTax?: () => void;
  /**
   * Add a header-scope withholding row. WS-D — separate from tax so the
   * WhtDrawer can capture WHT-specific fields. Caller threads this only
   * when apFeatureFlags.whtPcEnabled is true; absent prop → CTA hidden.
   */
  onAddWithholding?: () => void;
  /**
   * Server-computed aggregates keyed by header_pc_id (v3.1 Phase 6).
   * When provided, each row's badges (count, overrides, balance gap)
   * read from this map; when absent the row falls back to the
   * client-computed totals derived from `projection.allocations`.
   */
  summariesByPcId?: Map<string, ApportionmentSummary>;

  /**
   * Line-scope component rollups (v3.1 Phase 6b). Rendered as read-only
   * summary rows AFTER editable header-scope entries. When omitted the
   * unified table shows header-scope rows only — backward compatible
   * with consumers that haven't wired the line-rollup endpoint yet.
   */
  lineRollups?: LineRollupGroup[];

  /** Edit / replace a header-scope component (status-dependent). */
  onEdit?: (componentId: string) => void;
  onReplace?: (componentId: string) => void;
  /**
   * Delete a header-scope component (draft / rejected / proforma only).
   * The strip surface implements this via deletePricingComponent which
   * cascade-unlinks the supersession chain + the line-scope children
   * (DDL-level FK delete). Same icon-only Trash2 affordance as the line
   * waterfall so users have one mental model across both surfaces.
   */
  onDelete?: (componentId: string) => void;
  /**
   * Open the apportionment breakup drawer for this component (v3.1 Phase 4).
   * Triggers `ApportionmentBreakupDrawer` in the consumer's surface.
   * Wired in by the strip surface renderer when running inside the PI
   * page; omit from standalone tests / storybook to keep the row inline-
   * expansion as the audit path.
   */
  onViewBreakup?: (componentId: string) => void;
  /** Open the target line's drawer scrolled to the inherited row. */
  onJumpToLine?: (lineId: string) => void;
  /** Hovering a header row highlights affected lines (consumer wires). */
  onHoverProjectionLines?: (lineIds: string[] | null) => void;

  className?: string;
}

const APPORTION_BASIS_LABEL: Record<PcApportionBasis, string> = {
  value:    "value",
  quantity: "quantity",
  weight:   "weight",
  equal:    "equal share",
};

/**
 * Full description used in the popover. The short form above feeds the
 * per-row "by value → 2 lines" pill; the long form here gives the
 * explanatory subtitle inside the Apportionment summary popover.
 */
const APPORTION_BASIS_DETAIL: Record<PcApportionBasis, string> = {
  value:    "proportional to each line's net amount",
  quantity: "proportional to each line's quantity",
  weight:   "proportional to weight (Phase 2 — not yet supported)",
  equal:    "1/N per line — equal share regardless of line size",
};

/**
 * Sign of a term's contribution to the document's signed total. Mirrors
 * the line-scope TERM_SIGN map in PricingComponentWaterfall. Discount /
 * withholding / retention subtract; charge / tax add; principal_marker
 * is audit-only and neutral.
 */
const TERM_SIGN: Record<PcTermType, 1 | -1 | 0> = {
  discount:           -1,
  charge:              1,
  tax:                 1,
  withholding:        -1,
  retention:          -1,
  principal_marker:    0,
};

/**
 * Header-scope BASIS column copy. The line-scope helper combines basis
 * with "on net + charges" suffix, but at header level the suffix doesn't
 * apply (apportionment is what links the row to lines). Keep it terse.
 */
function formatHeaderBasisHint(component: PricingComponent): string {
  const { basis, rate_value, amount_value } = component;
  if (basis === "percent")  return rate_value   != null ? `${rate_value}%` : "%";
  if (basis === "per_unit") return rate_value   != null ? `${rate_value}/unit` : "per unit";
  if (basis === "amount" || basis === "flat") {
    return amount_value != null ? `Flat ${amount_value}` : "flat";
  }
  return "";
}

/**
 * Renders a short relative-time label ("2 min ago", "just now", "1 hr
 * ago"). Falls back to absolute formatting for anything older than a
 * day. Tolerant of bad/missing input — returns null when the timestamp
 * can't be parsed so the caller can suppress the line entirely.
 */
function formatRelativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // eslint-disable-next-line no-direct-date-parse -- reason: relative-age display; bad input is short-circuited via Number.isFinite below.
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const elapsedMs  = Date.now() - then;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  if (elapsedSec < 30)              return "just now";
  if (elapsedSec < 90)              return "1 min ago";
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 60)              return `${elapsedMin} min ago`;
  const elapsedHr = Math.floor(elapsedMin / 60);
  if (elapsedHr < 24)               return `${elapsedHr} hr ago`;
  const elapsedDay = Math.floor(elapsedHr / 24);
  if (elapsedDay < 7)               return `${elapsedDay} day${elapsedDay === 1 ? "" : "s"} ago`;
  return new Date(then).toLocaleDateString();
}

/**
 * Icon-only row action button. Duplicated locally rather than reaching
 * into PricingComponentWaterfall so neither file needs to know about
 * the other's render shape; both should eventually extract this to
 * @athyper/ui but that's a bigger touch.
 */
function RowAction({
  Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  Icon:     ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label:    string;
  onClick:  () => void;
  disabled?: boolean;
  /** Visually emphasised when the affordance is "on" (e.g. popover open). */
  active?:  boolean;
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
        "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        "disabled:opacity-40 disabled:pointer-events-none",
        active && "bg-muted/60 text-foreground border-foreground/30",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </button>
  );
}

// ── Apportionment summary popover (v3.1 Phase 7) ───────────────────────
//
// Replaces the inline expand-chevron + SummaryExpansion pattern. Click
// the (i) button → small card pops below the icon with Reach / Coverage
// / Balance / Last-computed. Dismisses on outside-click or ESC. No new
// dependency: ~30 lines of hooks beats pulling Radix Popover into a
// package that currently has zero Radix usage.

function ApportionmentSummaryPopover({
  projection,
  summary,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  projection:       HeaderPcProjection;
  summary:          ApportionmentSummary | null;
  currencyCode:     string;
  baseCurrencyCode: string;
  exchangeRate:     number;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Prefer server aggregates; fall back to projection-derived values
  // for first paint and summary-endpoint failure. Both sources agree.
  const allocatedSum = summary?.allocated_sum != null
    ? parseFloat(summary.allocated_sum)
    : projection.allocations.reduce((s, a) => s + a.allocated_amount, 0);
  const balanceGap   = summary?.balance_gap != null
    ? parseFloat(summary.balance_gap)
    : projection.rounding_adjustment;
  const lineCount     = summary?.line_count     ?? projection.allocations.length;
  const overrideCount = summary?.override_count ?? projection.allocations.filter((a) => a.overridden).length;
  const computedAtAge = formatRelativeAge(summary?.computed_at);
  const isBalanced    = Math.abs(balanceGap) <= 0.0001;
  const basisDetail   = projection.component.apportion_basis
    ? APPORTION_BASIS_DETAIL[projection.component.apportion_basis]
    : null;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <RowAction
        Icon={Info}
        label="Show apportionment summary"
        onClick={() => setOpen((p) => !p)}
        active={open}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Apportionment summary"
          className={cn(
            "absolute right-0 top-7 z-20 w-80 rounded-md border border-border bg-card",
            "shadow-lg p-3 text-xs",
          )}
        >
          <div className="font-medium text-muted-foreground mb-2">
            Apportionment summary
          </div>

          <div className="space-y-1">
            {/* Reach */}
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Reach</span>
              <span>
                {lineCount} line{lineCount === 1 ? "" : "s"}
                {overrideCount > 0 && (
                  <span className="text-muted-foreground italic">
                    {" "}({overrideCount} manually overridden)
                  </span>
                )}
              </span>
            </div>

            {/* Coverage / basis */}
            {projection.component.apportion_basis && basisDetail && (
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground w-24 shrink-0">Coverage</span>
                <span>
                  by {APPORTION_BASIS_LABEL[projection.component.apportion_basis]}{" "}
                  <span className="text-muted-foreground italic">· {basisDetail}</span>
                </span>
              </div>
            )}

            {/* Balance.
                Regular wrapping inline content (NOT inline-flex) so the
                CurrencyTriads + label text wrap cleanly inside the 320px
                popover. The status icon is inline-block + align-text-bottom
                so it sits on the same baseline as the surrounding text
                rather than getting stranded on its own line when the
                content wraps. */}
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Balance</span>
              <span className={cn(
                "min-w-0",
                isBalanced ? "text-emerald-700 dark:text-emerald-400" : "text-warning",
              )}>
                {isBalanced ? (
                  <>
                    <CheckCircle2 className="inline-block h-3 w-3 mr-1 align-text-bottom" aria-hidden />
                    allocated{" "}
                    <CurrencyTriad
                      amount={allocatedSum}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                    {" / "}
                    <CurrencyTriad
                      amount={projection.component.computed_amount}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                    <span className="text-muted-foreground italic"> · zero rounding gap</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="inline-block h-3 w-3 mr-1 align-text-bottom" aria-hidden />
                    {balanceGap > 0 ? "short" : "over"}{" "}
                    <CurrencyTriad
                      amount={Math.abs(balanceGap)}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                    <span className="text-muted-foreground italic">
                      {" "}· allocated{" "}
                      <CurrencyTriad
                        amount={allocatedSum}
                        currencyCode={currencyCode}
                        baseCurrencyCode={baseCurrencyCode}
                        exchangeRate={exchangeRate}
                        className="not-italic"
                      />
                      {" / "}
                      <CurrencyTriad
                        amount={projection.component.computed_amount}
                        currencyCode={currencyCode}
                        baseCurrencyCode={baseCurrencyCode}
                        exchangeRate={exchangeRate}
                        className="not-italic"
                      />
                    </span>
                  </>
                )}
              </span>
            </div>

            {/* Last computed (server timestamp). */}
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Last computed</span>
              <span className="text-muted-foreground italic">
                {computedAtAge
                  ? `${computedAtAge} · re-runs on submit`
                  : "Pending submit · recomputes at submit"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── One header row ─────────────────────────────────────────────────

/**
 * Grid template — shared by header and data rows so cells align
 * vertically across every row. Mirrors the line-scope
 * PricingComponentWaterfall column set (SEQ · TERM · ORIGIN · BASIS ·
 * AMOUNT · APPORTIONMENT · ACTIONS).
 */
const ROW_GRID = "grid grid-cols-[5rem_minmax(0,1fr)_6rem_7rem_7rem_minmax(15rem,auto)_6rem] items-center gap-3 px-3 py-2";

/**
 * One header-scope PC row. The APPORTIONMENT cell carries the at-a-
 * glance status (balance pill + override chip) plus two icon-only
 * affordances: (i) a popover with the full Reach/Coverage/Balance/
 * Last-computed audit summary, and (↗) the per-line breakup drawer.
 */
function HeaderPcRow({
  projection,
  summary,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  affordance,
  onEdit,
  onReplace,
  onDelete,
  onViewBreakup,
  onHoverProjectionLines,
}: {
  projection: HeaderPcProjection;
  /** Server aggregate when available; null = fall back to client-derived values. */
  summary: ApportionmentSummary | null;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  affordance: EditAffordance;
  onEdit?: (id: string) => void;
  onReplace?: (id: string) => void;
  onDelete?: (id: string) => void;
  onViewBreakup?: (id: string) => void;
  onHoverProjectionLines?: (lineIds: string[] | null) => void;
}) {
  const c = projection.component;
  const sign = TERM_SIGN[c.term_type];
  const signedAmount = sign === -1 ? -c.computed_amount : c.computed_amount;

  // Prefer server aggregates; fall back to projection-derived values for
  // first-paint and summary-endpoint failure. Same math both sides.
  const lineCount     = summary?.line_count     ?? projection.allocations.length;
  const overrideCount = summary?.override_count ?? projection.allocations.filter((a) => a.overridden).length;
  const balanceGap    = summary?.balance_gap != null
    ? parseFloat(summary.balance_gap)
    : projection.rounding_adjustment;
  const isBalanced    = Math.abs(balanceGap) <= 0.0001;
  const lineIds       = projection.allocations.map((a) => a.line_id);

  const showEdit    = affordance === "edit";
  const showReplace = affordance === "replace";

  return (
    <div
      className={cn(
        ROW_GRID,
        "text-sm border-b border-border/40 last:border-b-0 hover:bg-muted/40 transition-colors",
      )}
      onMouseEnter={() => onHoverProjectionLines?.(lineIds)}
      onMouseLeave={() => onHoverProjectionLines?.(null)}
    >
      {/* SEQ */}
      <div className="text-xs tabular-nums text-muted-foreground">
        {c.sequence}
      </div>

      {/* TERM. Label → code → italic "unnamed" fallback matches the line
          scope. INCL + tax_section_code chips when present. */}
      <div className="min-w-0 flex flex-wrap items-center gap-1.5">
        <span className="font-medium truncate">
          {c.condition_type_label
            || c.condition_type_code
            || <span className="italic text-muted-foreground">unnamed</span>}
        </span>
        {c.is_inclusive && (
          <span
            className={cn(
              "inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10",
              "px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              "text-sky-700 dark:text-sky-400",
            )}
            title="Tax already included in the unit price; does not move gross."
          >
            INCL
          </span>
        )}
        {c.recoverable_pct != null
          && c.recoverable_pct < 100
          && (c.term_type === "tax" || c.term_type === "withholding") && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md border border-amber-500/30 bg-amber-500/10",
              "px-1.5 py-0.5 text-[10px] font-medium",
              "text-amber-700 dark:text-amber-400",
            )}
            title={`${100 - c.recoverable_pct}% of this tax is a non-recoverable cost (no input credit).`}
          >
            <RefreshCw className="h-2.5 w-2.5" aria-hidden />
            {c.recoverable_pct}% recoverable
          </span>
        )}
        {c.tax_section_code && (
          <span
            className={cn(
              "inline-flex items-center rounded-md border border-border bg-muted/60",
              "px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              "text-muted-foreground",
            )}
            title={
              c.term_type === "withholding"
                ? `TDS section ${c.tax_section_code}.`
                : `Tax section ${c.tax_section_code}.`
            }
          >
            §{c.tax_section_code}
          </span>
        )}
      </div>

      {/* ORIGIN */}
      <div>
        <OriginBadge origin={c.origin} />
      </div>

      {/* BASIS — header-specific format (no "on net + charges" suffix). */}
      <div className="text-xs tabular-nums text-muted-foreground">
        {formatHeaderBasisHint(c)}
      </div>

      {/* AMOUNT — signed CurrencyTriad. Right-aligned to match header. */}
      <div className="text-right text-sm tabular-nums font-medium">
        <CurrencyTriad
          amount={signedAmount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
          signed
        />
      </div>

      {/* APPORTIONMENT — single line: status pill + override chip + two
          icon affordances ((i) popover · (↗) drawer). The MYR/MYR
          allocation totals + Reach / Coverage / Last-computed details
          live inside the popover and the breakup drawer; the row keeps
          only the at-a-glance audit signals. */}
      <div className="flex items-center gap-2 text-[11px]">
        {/* Status pill — balance OR mismatch */}
        {c.apportion_basis ? (
          isBalanced ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10",
                "px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400",
              )}
              title={`Allocated cleanly across ${lineCount} line${lineCount === 1 ? "" : "s"}.`}
            >
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {lineCount} line{lineCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10",
                "px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400",
              )}
              title={`Allocation imbalance — open the summary or full breakup for detail.`}
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {balanceGap > 0 ? "short" : "over"}
            </span>
          )
        ) : (
          <span className="text-muted-foreground italic">not apportioned</span>
        )}

        {/* Override chip */}
        {overrideCount > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10",
              "px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400",
            )}
            title={`${overrideCount} line${overrideCount === 1 ? "" : "s"} manually overridden.`}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {overrideCount} override{overrideCount === 1 ? "" : "s"}
          </span>
        )}

        {/* Spacer pushes icons to the right edge of the cell */}
        <div className="flex-1" />

        {/* Affordances — (i) popover summary · (↗) full breakup drawer */}
        <ApportionmentSummaryPopover
          projection={projection}
          summary={summary}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
        {onViewBreakup && (
          <RowAction
            Icon={ArrowUpRight}
            label="Open the per-line apportionment drawer"
            onClick={() => onViewBreakup(c.id)}
          />
        )}
      </div>

      {/* ACTIONS — edit / replace / delete only. The drawer affordance
          moved into the APPORTIONMENT cell where it lives next to its
          audit signals. */}
      <div className="flex items-center gap-1 justify-end">
        {showEdit && onEdit && (
          <RowAction Icon={Pencil}    label="Edit"    onClick={() => onEdit(c.id)} />
        )}
        {showReplace && onReplace && (
          <RowAction Icon={RefreshCw} label="Replace" onClick={() => onReplace(c.id)} />
        )}
        {/* Delete only when the parent invoice is in a mutable status
            (canDelete via the affordance matrix → resolves to
            affordance="edit" here for PC surfaces). Same affordance gate
            as the line waterfall's Trash2 — keeps the two surfaces
            symmetric. */}
        {showEdit && onDelete && (
          <RowAction Icon={Trash2}    label="Delete"  onClick={() => onDelete(c.id)} />
        )}
      </div>
    </div>
  );
}

// ── RolledUpRow (v3.1 Phase 6b) ─────────────────────────────────────
//
// Read-only summary row representing all user-entered line-scope PCs
// of a single condition_type. Renders inside the same canonical grid
// as HeaderPcRow but with three visual signals that flag "this is
// derived, not editable":
//
//   1. SEQ cell shows a Σ glyph (no real sequence — derived row)
//   2. ORIGIN chip reads "← from lines" with sky tint (mirrors the
//      line drawer's ↗ from Header chip, same grammar applied in
//      reverse so users see the bidirectional link)
//   3. Background is slightly muted (bg-muted/20) to differentiate
//      the "summary zone" from the editable zone above
//
// ACTIONS column intentionally renders nothing in v1. A future
// affordance (e.g. ↗ to open a drawer listing the contributing lines)
// would go here. For now users navigate to per-line drawers via the
// Lines tab.

function RolledUpRow({
  rollup,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  rollup: LineRollupGroup;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  const sign         = TERM_SIGN[rollup.term_type] ?? 0;
  const amount       = parseFloat(rollup.amount);
  const signedAmount = sign === -1 ? -amount : amount;
  // rate_value comes back as numeric(20,10) text — "45.0000000000".
  // parseFloat → 45 → template-literal → "45%". Preserves real decimals
  // ("5.25%") while dropping cosmetic trailing zeros.
  const rateLabel    = rollup.rate_value != null
    ? `${parseFloat(rollup.rate_value)}%`
    : "varies";

  return (
    <div className={cn(
      ROW_GRID,
      "items-center gap-3 px-3 py-2 text-sm",
      "border-b border-border/40 last:border-b-0",
      "bg-muted/20",  // visual signal — read-only summary zone
    )}>
      {/* SEQ — Σ glyph for the rolled-up row. */}
      <div className="text-xs tabular-nums text-muted-foreground pt-0.5">
        <Sigma className="h-3 w-3" aria-hidden />
      </div>

      {/* TERM — condition_type_label with code fallback. */}
      <div className="min-w-0 flex flex-wrap items-center gap-1.5">
        <span className="font-medium truncate">
          {rollup.condition_type_label
            || rollup.condition_type_code
            || <span className="italic text-muted-foreground">unnamed</span>}
        </span>
      </div>

      {/* ORIGIN — "← from lines" sky-tinted chip. */}
      <div className="pt-0.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
            "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
          )}
          title="Sum of user-entered line-scope components for this condition type"
        >
          <CornerDownRight className="h-3 w-3" aria-hidden />
          <span>from lines</span>
        </span>
      </div>

      {/* BASIS — uniform rate or "varies". */}
      <div className="text-xs tabular-nums text-muted-foreground pt-0.5">
        {rateLabel}
      </div>

      {/* AMOUNT — signed by term_type. */}
      <div className="text-right">
        <div className="text-sm tabular-nums font-medium">
          <CurrencyTriad
            amount={signedAmount}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
            signed
          />
        </div>
      </div>

      {/* APPORTIONMENT — "← from N lines" caption. */}
      <div className="text-[11px] text-muted-foreground">
        <CornerDownRight className="inline-block h-3 w-3 mr-1 align-text-bottom" aria-hidden />
        from {rollup.line_count} line{rollup.line_count === 1 ? "" : "s"}
      </div>

      {/* ACTIONS — intentionally empty in v1. */}
      <div aria-hidden />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export function HeaderScopePcStrip({
  projections,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  affordance,
  summariesByPcId,
  lineRollups,
  onAdd,
  onAddCharge,
  onAddTax,
  onAddWithholding,
  onEdit,
  onReplace,
  onDelete,
  onViewBreakup,
  onHoverProjectionLines,
  className,
}: HeaderScopePcStripProps) {
  const [search, setSearch] = useState("");
  const rollups = lineRollups ?? [];
  // Per UI-P6: hide entire strip when empty AND nothing rolled up AND
  // the user can't add new entries. Note: rollups can exist even when
  // projections is empty (PI with only line-scope components) — show
  // them in that case.
  if (projections.length === 0 && rollups.length === 0 && affordance !== "edit") return null;

  const hasAddCtas  = affordance === "edit" && (onAdd || onAddCharge || onAddTax || onAddWithholding);
  const totalRowCount = projections.length + rollups.length;
  const query = search.trim().toLowerCase();
  const visibleProjections = query
    ? projections.filter(({ component }) => componentSearchText(component).includes(query))
    : projections;
  const visibleRollups = query
    ? rollups.filter((rollup) => rollupSearchText(rollup).includes(query))
    : rollups;
  const visibleRowCount = visibleProjections.length + visibleRollups.length;

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      {/* Section title (compact). Add CTAs moved to the footer per
          Plan v3.1 Phase 2 — parity with the line-scope footer. */}
      <div className="flex min-h-10 flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-1">
        <div className="text-base font-semibold text-foreground">
          Components ({totalRowCount})
        </div>
        <SearchInput
          value={search}
          onSearch={setSearch}
          debounceMs={150}
          placeholder="Search components..."
          aria-label="Search components"
          className="ml-auto w-72 min-w-[14rem] shrink-0"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearch("");
          }}
        />
      </div>

      {/* Column header row. Same grid template as the body so cells
          align vertically across every row. */}
      {totalRowCount > 0 && (
        <div className={cn(
          ROW_GRID,
          "text-sm font-medium text-muted-foreground",
          "border-b border-border bg-muted/30",
        )}>
          <div>Sequence</div>
          <div>Component</div>
          <div>Origin</div>
          <div>Basis</div>
          <div className="text-right">Amount</div>
          <div>Apportionment</div>
          <div className="text-right">Actions</div>
        </div>
      )}

      {totalRowCount === 0 ? (
        <div className="px-4 py-4 text-xs italic text-muted-foreground">
          No components yet. Use freight, header-level discount, or
          tax components that apportion across all lines.
        </div>
      ) : (
        <div>
          {/* Editable header-scope rows first. */}
          {visibleProjections.map((projection) => {
            const summary = summariesByPcId?.get(projection.component.id) ?? null;
            return (
              // data-pc-id is the hook used by the runtime context's
              // registerHeaderRowJumpHandler — line drawers calling
              // jumpToHeaderRow(parentPcId) scroll into this node and
              // flash it. Stable id lookup, no React refs needed.
              <div key={projection.component.id} data-pc-id={projection.component.id}>
                <HeaderPcRow
                  projection={projection}
                  summary={summary}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  affordance={affordance}
                  onEdit={onEdit}
                  onReplace={onReplace}
                  onDelete={onDelete}
                  onViewBreakup={onViewBreakup}
                  onHoverProjectionLines={onHoverProjectionLines}
                />
              </div>
            );
          })}

          {/* Read-only line-scope rollups below the editable rows. */}
          {visibleRollups.map((rollup) => (
            <RolledUpRow
              key={`rollup-${rollup.condition_type_id}`}
              rollup={rollup}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          ))}
          {visibleRowCount === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No components match your search.
            </div>
          ) : null}
        </div>
      )}

      {/* Footer is action-only; row data already communicates amounts and origins. */}
      {hasAddCtas && (
        <div className="flex items-center justify-end gap-1.5 border-t border-border bg-muted/40 px-3 py-2">
          {onAdd            && <FooterCta label="Discount"    onClick={onAdd} />}
          {onAddCharge      && <FooterCta label="Charge"      onClick={onAddCharge} />}
          {onAddTax         && <FooterCta label="Tax"         onClick={onAddTax} />}
          {onAddWithholding && <FooterCta label="Withholding" onClick={onAddWithholding} />}
        </div>
      )}
    </div>
  );
}

function componentSearchText(component: PricingComponent): string {
  return [
    component.sequence,
    component.condition_type_label,
    component.condition_type_code,
    component.term_type,
    component.origin,
    component.basis,
    component.apportion_basis,
    component.rate_value,
    component.amount_value,
    component.computed_amount,
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");
}

function rollupSearchText(rollup: LineRollupGroup): string {
  return [
    rollup.condition_type_label,
    rollup.condition_type_code,
    rollup.term_type,
    "from lines",
    rollup.rate_value,
    rollup.amount,
    rollup.line_count,
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");
}

/**
 * Ghost-button add CTA in the footer. Same visual as the line-scope
 * footer CTAs so the two strips share one mental model.
 */
function FooterCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs font-medium",
        "text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-solid",
      )}
    >
      <Plus className="h-3 w-3" aria-hidden /> {label}
    </button>
  );
}
