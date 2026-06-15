/**
 * @athyper/content-ui — PricingComponentWaterfall (Band 2)
 *
 * Spec v1.1 §4.3 Band 2.
 *
 * Renders pricing_component rows scoped to one PIL, ordered by sequence
 * (load-bearing: pc_sequence_chk + ix_pc_source_active).
 *
 * Surfaces:
 *   • Sequence column (left-most, load-bearing for the waterfall math)
 *   • Origin badge (all 4 values: manual, inherited, vendor_default, system_resolved)
 *   • Basis hint (Δ column) per pc_basis_chk
 *   • Tax sub-row for is_inclusive + recoverable_pct split
 *   • Supersession chain nested under the active row (collapsed by default)
 *   • Inherited rows click → consumer jumps to header strip row
 *   • Affordance: edit (draft) / replace (approval) / read-only (terminal)
 */
"use client";

import { useState, type ReactNode } from "react";
import { Shield, Tag, CornerDownRight, History, ChevronRight, Plus } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { CurrencyTriad } from "../money/CurrencyTriad";
import type {
  PricingComponent,
  PcOrigin,
  PcTermType,
  PcBasis,
  EditAffordance,
} from "../../purchase-invoice/types";

export interface PricingComponentWaterfallProps {
  /** PC rows for this line — must be active (superseded_by_id IS NULL). */
  components: PricingComponent[];
  /** Line net amount (qty × price / price_unit). Anchors the band. */
  lineNetAmount: number;
  /** Line currency triad. */
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;

  /** Resolved edit gate. */
  affordance: EditAffordance;

  /** Add a new discount/charge/etc. component row. */
  onAdd?: () => void;
  /**
   * Add a tax/withholding row. Rendered alongside `onAdd` when provided.
   * Tax has enough distinct fields (tax_group, place_of_supply, recoverability)
   * to warrant a dedicated drawer.
   */
  onAddTax?: () => void;
  /** Edit a component row (draft only). */
  onEdit?: (componentId: string) => void;
  /** Replace via supersession (approval only). */
  onReplace?: (componentId: string) => void;
  /** Delete a component row (draft only). */
  onDelete?: (componentId: string) => void;
  /**
   * Jump to the owning header-scope PC row in the Header Strip.
   * Called when user clicks an inherited row.
   */
  onJumpToHeaderRow?: (sourceHeaderPcId: string) => void;
  /** Open the resolution-audit sheet for AD when navigating from this band. */
  onViewSupersessionEvent?: (componentId: string, supersededId: string) => void;

  className?: string;
}

const ORIGIN_DESCRIPTOR: Record<PcOrigin, {
  label: string;
  intent: SemanticIntent;
  Icon?: typeof Tag;
  /** True when the row should be non-removable even in draft (policy/inherited). */
  protected: boolean;
}> = {
  manual:          { label: "Manual",   intent: "neutral", protected: false },
  inherited:       { label: "← Header", intent: "info",    Icon: CornerDownRight, protected: true },
  vendor_default:  { label: "Supplier", intent: "accent",  Icon: Tag,             protected: false },
  system_resolved: { label: "Policy",   intent: "primary", Icon: Shield,          protected: true },
};

const TERM_SIGN: Record<PcTermType, 1 | -1 | 0> = {
  discount:           -1,
  charge:              1,
  tax:                 1,
  withholding:        -1,
  retention:          -1,
  principal_marker:    0,
};

function formatBasisHint(component: PricingComponent): string {
  const basis: PcBasis = component.basis;
  const rate = component.rate_value;
  const amt  = component.amount_value;
  switch (basis) {
    case "percent":  return rate != null ? `${rate}%` : "%";
    case "per_unit": return rate != null ? `${rate}/unit` : "per unit";
    case "amount":   return amt  != null ? `flat ${amt}` : "flat";
    case "flat":     return amt  != null ? `flat ${amt}` : "flat";
  }
}

// ── Origin badge ───────────────────────────────────────────────────

function OriginBadge({ origin }: { origin: PcOrigin }) {
  const descr = ORIGIN_DESCRIPTOR[origin];
  const colors = resolveSemanticColors(descr.intent);
  const Icon = descr.Icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
      colors.subtleBadge,
    )}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      <span>{descr.label}</span>
    </span>
  );
}

// ── Action button (inline per-row) ─────────────────────────────────

function RowAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium",
        "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        "disabled:opacity-40 disabled:pointer-events-none",
      )}
    >
      {label}
    </button>
  );
}

// ── Tax recoverability sub-row ─────────────────────────────────────

function TaxRecoverabilitySubRow({
  component,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  component: PricingComponent;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  if (component.term_type !== "tax" && component.term_type !== "withholding") return null;
  if (component.recoverable_pct == null) return null;

  const recoverable = (component.computed_amount * component.recoverable_pct) / 100;
  const cost = component.computed_amount - recoverable;
  const recoverablePct = component.recoverable_pct;
  const costPct = 100 - recoverablePct;

  return (
    <div className="pl-12 pr-3 py-1 text-[11px] text-muted-foreground italic flex items-center gap-4">
      <span>
        Recoverable {recoverablePct}%{" "}
        <CurrencyTriad
          amount={recoverable}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
          className="not-italic"
        />
      </span>
      {costPct > 0 && (
        <span>
          Cost-of-goods {costPct}%{" "}
          <CurrencyTriad
            amount={cost}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
            className="not-italic"
          />
        </span>
      )}
    </div>
  );
}

// ── One waterfall row (active or chain version) ────────────────────

function ComponentRow({
  component,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  affordance,
  onEdit,
  onReplace,
  onDelete,
  onJumpToHeaderRow,
  /** True when this row is a nested supersession version (not the active row). */
  isChainEntry = false,
}: {
  component: PricingComponent;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  affordance: EditAffordance;
  onEdit?: (id: string) => void;
  onReplace?: (id: string) => void;
  onDelete?: (id: string) => void;
  onJumpToHeaderRow?: (id: string) => void;
  isChainEntry?: boolean;
}) {
  const sign = TERM_SIGN[component.term_type];
  const signedAmount = sign === -1 ? -component.computed_amount : component.computed_amount;
  const isInherited = component.origin === "inherited";
  const protectedRow = ORIGIN_DESCRIPTOR[component.origin].protected;
  const showDelete = affordance === "edit" && !protectedRow && !isChainEntry;
  const showEdit   = affordance === "edit" && !isChainEntry;
  const showReplace = affordance === "replace" && !isChainEntry;

  // Inherited rows: clicking the origin label navigates to the header strip row.
  const inheritedClickable = isInherited
    && onJumpToHeaderRow
    && component.is_apportioned_from_id;

  return (
    <div className={cn(
      "grid grid-cols-[3rem_1fr_auto_auto_auto_auto] items-center gap-3 px-3 py-2 text-sm",
      "border-b border-border/40 last:border-b-0",
      isChainEntry && "bg-muted/30 text-muted-foreground",
    )}>
      {/* Seq */}
      <div className="text-xs tabular-nums text-muted-foreground">
        {isChainEntry
          ? <span className="italic">superseded</span>
          : component.sequence}
      </div>

      {/* Term + condition label */}
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="font-medium truncate">{component.condition_type_label}</div>
        {component.is_inclusive && (
          <div className="text-[11px] text-muted-foreground italic">inclusive</div>
        )}
        {component.tax_section_code && (
          <div className="text-[11px] text-muted-foreground">{component.tax_section_code}</div>
        )}
      </div>

      {/* Origin */}
      <div>
        {inheritedClickable ? (
          <button
            type="button"
            onClick={() => onJumpToHeaderRow!(component.is_apportioned_from_id!)}
            className="transition-opacity hover:opacity-85"
            aria-label="Jump to owning header component"
          >
            <OriginBadge origin={component.origin} />
          </button>
        ) : (
          <OriginBadge origin={component.origin} />
        )}
      </div>

      {/* Basis */}
      <div className="text-xs tabular-nums text-muted-foreground">
        {formatBasisHint(component)}
      </div>

      {/* Amount */}
      <div className="text-sm tabular-nums font-medium text-right">
        <CurrencyTriad
          amount={signedAmount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
          signed
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end">
        {showEdit  && <RowAction label="Edit"    onClick={() => onEdit?.(component.id)} />}
        {showReplace && <RowAction label="Replace" onClick={() => onReplace?.(component.id)} />}
        {showDelete && <RowAction label="Delete"  onClick={() => onDelete?.(component.id)} />}
      </div>
    </div>
  );
}

// ── Supersession chain expander ────────────────────────────────────

function SupersessionChain({
  chain,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  affordance,
}: {
  chain: PricingComponent[];
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  affordance: EditAffordance;
}) {
  const [expanded, setExpanded] = useState(false);
  if (chain.length === 0) return null;

  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground",
          "hover:bg-muted/40 w-full",
        )}
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} aria-hidden />
        <History className="h-3 w-3" aria-hidden />
        <span>
          {chain.length} prior version{chain.length === 1 ? "" : "s"} superseded
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/40">
          {chain.map((entry) => (
            <ComponentRow
              key={entry.id}
              component={entry}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              affordance={affordance}
              isChainEntry
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

/**
 * Renders the Component Waterfall band of a PI line drawer.
 *
 * Components are rendered in `sequence` order. Each row may have an
 * inline-nested supersession chain (collapsed by default). Tax rows
 * with `recoverable_pct` show a recoverable/cost split sub-row.
 *
 * Empty-state: when `components.length === 0`, the band omits its
 * own chrome and returns null per UI-P6 (caller renders "Net = Gross").
 */
export function PricingComponentWaterfall({
  components,
  lineNetAmount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  affordance,
  onAdd,
  onAddTax,
  onEdit,
  onReplace,
  onDelete,
  onJumpToHeaderRow,
  className,
}: PricingComponentWaterfallProps) {
  if (components.length === 0) return null;

  // Sort by sequence (load-bearing). Defensive — caller may already sort.
  const sorted = [...components].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      {/* Header row */}
      <div className="grid grid-cols-[3rem_1fr_auto_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border bg-muted/40">
        <div>Seq</div>
        <div>Term</div>
        <div>Origin</div>
        <div>Basis</div>
        <div className="text-right">Amount</div>
        <div className="text-right">{affordance !== "read_only" ? "Actions" : ""}</div>
      </div>

      {/* Rows */}
      <div>
        {sorted.map((component) => (
          <div key={component.id}>
            <ComponentRow
              component={component}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              affordance={affordance}
              onEdit={onEdit}
              onReplace={onReplace}
              onDelete={onDelete}
              onJumpToHeaderRow={onJumpToHeaderRow}
            />
            <TaxRecoverabilitySubRow
              component={component}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
            {component.chain && component.chain.length > 0 && (
              <SupersessionChain
                chain={component.chain}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
                affordance={affordance}
              />
            )}
          </div>
        ))}
      </div>

      {/* Footer: Net anchor + Add affordance */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/40">
        <div className="text-xs text-muted-foreground">
          Net <span className="ml-1 font-medium text-foreground">
            <CurrencyTriad
              amount={lineNetAmount}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </span>
        </div>
        {affordance === "edit" && (onAdd || onAddTax) && (
          <div className="flex items-center gap-1.5">
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Plus className="h-3 w-3" aria-hidden /> Add discount
              </button>
            )}
            {onAddTax && (
              <button
                type="button"
                onClick={onAddTax}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Plus className="h-3 w-3" aria-hidden /> Add tax
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export for granular consumers that want to render bits in isolation.
export { OriginBadge as PricingComponentOriginBadge };
export type { ReactNode };
