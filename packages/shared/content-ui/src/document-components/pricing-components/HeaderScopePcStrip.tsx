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

import { useState, type ReactNode } from "react";
import { ChevronRight, Plus, AlertTriangle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { CurrencyTriad } from "../money/CurrencyTriad";
import type {
  PricingComponent,
  PcApportionBasis,
  HeaderPcProjection,
  EditAffordance,
} from "../../purchase-invoice/types";

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
  /** Add a header-scope tax/withholding row (separate drawer). */
  onAddTax?: () => void;
  /** Edit / replace a header-scope component (status-dependent). */
  onEdit?: (componentId: string) => void;
  onReplace?: (componentId: string) => void;
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

// ── Compute totals + delta ─────────────────────────────────────────

interface ProjectionTotals {
  headerProjection: number;
  effectiveLineTotal: number;
  override_delta: number;
  hasOverrides: boolean;
}

function computeTotals(projection: HeaderPcProjection): ProjectionTotals {
  let headerProjection = 0;
  let effectiveLineTotal = 0;
  let hasOverrides = false;
  for (const a of projection.allocations) {
    headerProjection += a.allocated_amount;
    effectiveLineTotal += a.overridden && a.override_amount != null
      ? a.override_amount
      : a.allocated_amount;
    if (a.overridden) hasOverrides = true;
  }
  return {
    headerProjection,
    effectiveLineTotal,
    override_delta: effectiveLineTotal - headerProjection,
    hasOverrides,
  };
}

// ── Projection preview table ───────────────────────────────────────

function ProjectionPreview({
  projection,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  onJumpToLine,
}: {
  projection: HeaderPcProjection;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  onJumpToLine?: (lineId: string) => void;
}) {
  const totals = computeTotals(projection);
  const successColors = resolveSemanticColors("success");
  const warningColors = resolveSemanticColors("warning");

  return (
    <div className="border-t border-border bg-muted/20 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Header projection ·{" "}
        {projection.component.condition_type_label} ·{" "}
        <CurrencyTriad
          amount={projection.component.computed_amount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
        {projection.component.apportion_basis && (
          <span> · Basis: line {APPORTION_BASIS_LABEL[projection.component.apportion_basis]}</span>
        )}
      </div>

      {/* Per-line breakdown */}
      <div className="grid grid-cols-[3rem_1fr_auto_auto_auto_auto] gap-3 text-xs">
        <div className="font-medium text-muted-foreground">Line</div>
        <div className="font-medium text-muted-foreground">Item</div>
        <div className="font-medium text-muted-foreground text-right">Basis value</div>
        <div className="font-medium text-muted-foreground text-right">Share</div>
        <div className="font-medium text-muted-foreground text-right">Allocated</div>
        <div className="font-medium text-muted-foreground text-right">Override</div>

        {projection.allocations.map((a) => {
          const sharePct = a.share * 100;
          const interactiveClass = onJumpToLine ? "hover:bg-muted/60 cursor-pointer rounded-md" : "";
          const Row = ({ children }: { children: ReactNode }) => onJumpToLine ? (
            <button type="button" onClick={() => onJumpToLine(a.line_id)} className={cn("contents text-left", interactiveClass)}>
              {children}
            </button>
          ) : <>{children}</>;
          return (
            <Row key={a.line_id}>
              <div className="tabular-nums">{a.line_no}</div>
              <div className="truncate">{a.item_description}</div>
              <div className="tabular-nums text-right">{a.basis_value.toLocaleString()}</div>
              <div className="tabular-nums text-right">{sharePct.toFixed(2)}%</div>
              <div className="tabular-nums text-right">
                <CurrencyTriad
                  amount={a.allocated_amount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                />
              </div>
              <div className="tabular-nums text-right">
                {a.overridden && a.override_amount != null ? (
                  <span className={warningColors.text}>
                    <CurrencyTriad
                      amount={a.override_amount}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </Row>
          );
        })}
      </div>

      {/* Two-totals footer per §A4 */}
      <div className="mt-3 border-t border-border/40 pt-2 flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Header projection:</span>
          <span className="tabular-nums font-medium">
            <CurrencyTriad
              amount={totals.headerProjection}
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
            <span className={cn("ml-2", successColors.text)}>balanced</span>
          </span>
        </div>
        {totals.hasOverrides && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Effective line total:</span>
            <span className="tabular-nums font-medium">
              <CurrencyTriad
                amount={totals.effectiveLineTotal}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
              />
              <span className={cn("ml-2", warningColors.text)}>
                {totals.override_delta >= 0 ? "+" : ""}
                <CurrencyTriad
                  amount={totals.override_delta}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                />
                {" "}from manual overrides
              </span>
            </span>
          </div>
        )}
        {projection.rounding_adjustment !== 0 && (
          <div className="flex justify-between text-muted-foreground italic">
            <span>Rounding adjustment:</span>
            <span className="tabular-nums">
              <CurrencyTriad
                amount={projection.rounding_adjustment}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
              />
              {projection.rounding_absorbed_by_line_no != null && (
                <span> · absorbed by Line {projection.rounding_absorbed_by_line_no}</span>
              )}
            </span>
          </div>
        )}
        <div className="text-muted-foreground italic">
          {projection.last_computed_at
            ? `Last computed: ${new Date(projection.last_computed_at).toLocaleString()}`
            : "Pending submit · recomputes at submit"}
        </div>
      </div>
    </div>
  );
}

// ── One collapsed header row ───────────────────────────────────────

function CollapsedRow({
  projection,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  expanded,
  onToggle,
  affordance,
  onEdit,
  onReplace,
  onHoverProjectionLines,
}: {
  projection: HeaderPcProjection;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  expanded: boolean;
  onToggle: () => void;
  affordance: EditAffordance;
  onEdit?: (id: string) => void;
  onReplace?: (id: string) => void;
  onHoverProjectionLines?: (lineIds: string[] | null) => void;
}) {
  const totals = computeTotals(projection);
  const lineIds = projection.allocations.map((a) => a.line_id);
  const linesCount = projection.allocations.length;
  const overrideCount = projection.allocations.filter((a) => a.overridden).length;

  const showEdit    = affordance === "edit";
  const showReplace = affordance === "replace";

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 text-sm border-b border-border/40 last:border-b-0",
      "hover:bg-muted/40 transition-colors",
    )}
      onMouseEnter={() => onHoverProjectionLines?.(lineIds)}
      onMouseLeave={() => onHoverProjectionLines?.(null)}
    >
      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label="Toggle apportionment preview"
        className="flex items-center"
      >
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-90")} aria-hidden />
      </button>

      {/* Label + amount */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="font-medium truncate">{projection.component.condition_type_label}</span>
        <span className="tabular-nums">
          <CurrencyTriad
            amount={projection.component.computed_amount}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
            signed
          />
        </span>
      </div>

      {/* Apportion basis */}
      {projection.component.apportion_basis && (
        <div className="text-xs text-muted-foreground">
          apportions by {APPORTION_BASIS_LABEL[projection.component.apportion_basis]}
        </div>
      )}

      {/* Projection chip */}
      <div className="text-xs text-muted-foreground">
        → {linesCount} line{linesCount === 1 ? "" : "s"}
        {overrideCount > 0 && (
          <span> ({overrideCount} overridden)</span>
        )}
      </div>

      {/* Allocated chip */}
      <div className="text-xs">
        <span className="text-muted-foreground">allocated </span>
        <CurrencyTriad
          amount={totals.headerProjection}
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
        {totals.hasOverrides && (
          <span className="ml-2 inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden /> overrides
          </span>
        )}
      </div>

      {/* Inline actions */}
      <div className="flex items-center gap-1.5">
        {showEdit && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(projection.component.id)}
            className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            Edit
          </button>
        )}
        {showReplace && onReplace && (
          <button
            type="button"
            onClick={() => onReplace(projection.component.id)}
            className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            Replace
          </button>
        )}
      </div>
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
  onAdd,
  onAddTax,
  onEdit,
  onReplace,
  onJumpToLine,
  onHoverProjectionLines,
  className,
}: HeaderScopePcStripProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Per UI-P6: hide entire strip when empty.
  if (projections.length === 0 && affordance !== "edit") return null;

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border bg-muted/40">
        <div>
          Header-scope components{" "}
          <span className="text-foreground">({projections.length})</span>
        </div>
        {affordance === "edit" && (onAdd || onAddTax) && (
          <div className="flex items-center gap-1.5">
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5",
                  "hover:text-foreground hover:bg-muted/60",
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
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5",
                  "hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Plus className="h-3 w-3" aria-hidden /> Add tax
              </button>
            )}
          </div>
        )}
      </div>

      {projections.length === 0 ? (
        <div className="px-4 py-4 text-xs italic text-muted-foreground">
          No header-scope components yet. Use freight, header-level discount, or
          tax components that apportion across all lines.
        </div>
      ) : (
        <div>
          {projections.map((projection) => {
            const expanded = expandedIds.has(projection.component.id);
            return (
              <div key={projection.component.id}>
                <CollapsedRow
                  projection={projection}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  expanded={expanded}
                  onToggle={() => toggleExpanded(projection.component.id)}
                  affordance={affordance}
                  onEdit={onEdit}
                  onReplace={onReplace}
                  onHoverProjectionLines={onHoverProjectionLines}
                />
                {expanded && (
                  <ProjectionPreview
                    projection={projection}
                    currencyCode={currencyCode}
                    baseCurrencyCode={baseCurrencyCode}
                    exchangeRate={exchangeRate}
                    onJumpToLine={onJumpToLine}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
