/**
 * @athyper/content-ui — PiLineDrawer
 *
 * Spec v1.1 §4.3 — composite of the four bands plus optional right
 * rail. Wires PIL + PC + AD for one purchase_invoice_line.
 *
 *   Band 1: Line Recap (item, qty, rate, net, gross, match, status)
 *   Band 2: Component Waterfall  (PricingComponentWaterfall)
 *   Band 3: Gross (locked bridge — explicit boundary between PC and AD)
 *   Band 4: Distribution         (AccountingDistributionPanel)
 *
 * Optional `RightRail` slot at wider viewports holds validation /
 * supersession / audit / inheritance digests per §4.3.
 */
"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, ShieldCheck, History, CornerDownRight, Plus } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { resolveSemanticColors } from "@athyper/platform-theme/semantic-colors";
import { CurrencyTriad } from "../money/currency-triad";
import { MatchBadge } from "../match/match-badge";
import { PricingComponentWaterfall } from "../pricing-components/pricing-component-waterfall";
import { AccountingDistributionPanel } from "../distributions/accounting-distribution-panel";
import { deriveDistributableCost } from "../distributions/distributable-cost";
import type {
  PurchaseInvoiceLine,
  PricingComponent,
  AccountingDistribution,
  EditAffordance,
} from "../../purchase-invoice/types";

export interface PiLineDrawerProps {
  line: PurchaseInvoiceLine;
  /**
   * Read-only per-line impact projected from document-level pricing
   * components. These are not persisted/edited as line-owned components.
   */
  appliedHeaderComponents?: PricingComponent[];
  components: PricingComponent[];
  distributions: AccountingDistribution[];

  /** Edit affordance for the component band. */
  componentsAffordance: EditAffordance;
  /** Edit affordance for the distribution band (may differ from PC). */
  distributionsAffordance: EditAffordance;

  // PC actions
  onAddComponent?: () => void;
  /** Optional charge-specific add affordance. */
  onAddChargeComponent?: () => void;
  /** Optional tax-specific add affordance (renders alongside `onAddComponent`). */
  onAddTaxComponent?: () => void;
  /**
   * Optional withholding-specific add affordance (WS-D). Caller threads
   * only when WHT lookups are populated; absent → CTA hidden.
   */
  onAddWhtComponent?: () => void;
  onEditComponent?: (componentId: string) => void;
  onReplaceComponent?: (componentId: string) => void;
  onDeleteComponent?: (componentId: string) => void;
  /**
   * Jump to the owning header-scope PC row in the Header Strip. Required
   * (v3.1 Phase 3): every PI page that renders this drawer must thread
   * this from the runtime context so apportioned ↗ chips work. Pass a
   * no-op only when the page genuinely has no header strip surface.
   */
  onJumpToHeaderRow: (sourceHeaderPcId: string) => void;

  // AD actions
  onAddDistribution?: () => void;
  onEditDistribution?: (adId: string) => void;
  onDeleteDistribution?: (adId: string) => void;

  // Match exception jump (consumer navigates to the open match_exception row).
  onJumpToMatchException?: () => void;

  className?: string;
}

// ── Persisted collapse toggle ──────────────────────────────────────

/**
 * `useState`-shaped wrapper that backs the boolean by `localStorage`
 * under `key` while falling back to `smartDefault` when no value is
 * persisted.
 *
 * Why this exists:
 *   The drawer's collapsibles benefit from BOTH a smart per-row
 *   default (Components open when the line has rows, Distribution
 *   collapsed when it doesn't) AND a sticky user preference (if the
 *   user collapses Components on one line, every other line should
 *   respect that until they re-expand). One naked `useState` per
 *   section can't do both — we need: stored choice > smart default.
 *
 *   The key is shared across ALL line drawer instances ("pi-line-
 *   drawer:components" / "pi-line-drawer:distribution") so a toggle on
 *   one row applies to every other row on the page + survives reload.
 *
 * Storage encoding:
 *   "1" → user-set open
 *   "0" → user-set closed
 *   absent / unparseable → fall through to smartDefault
 *
 * SSR safety:
 *   The drawer only mounts after the user expands a row, so it never
 *   renders during SSR; the lazy init in `useState` is still
 *   `typeof window` guarded as defense in depth.
 */
function usePersistedToggle(
  key: string,
  smartDefault: boolean,
): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return smartDefault;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {
      // Private-mode + storage-disabled browsers throw on getItem;
      // fall through to the smart default.
    }
    return smartDefault;
  });

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(key, next ? "1" : "0");
        } catch {
          // Storage quota / disabled — silently no-op. Worst case the
          // preference doesn't survive reload.
        }
      }
      return next;
    });
  }, [key]);

  return [open, toggle];
}

const STORAGE_KEY_COMPONENTS    = "pi-line-drawer:components";
const STORAGE_KEY_DISTRIBUTIONS = "pi-line-drawer:distributions";

// ── Component + Distribution summaries ─────────────────────────────

interface ComponentSummary {
  /** Per-term-type counts. Used in the section header chip strip. */
  counts: { discount: number; charge: number; tax: number; withholding: number; retention: number };
  /** How many rows came in via header-scope inheritance. */
  inheritedCount: number;
  /** Sum of discount-row computed amounts (already negative; render as -X). */
  lineDiscountTotal: number;
  /** Sum of exclusive tax + withholding rows that change gross. */
  lineTaxTotal: number;
  /** Whether ANY tax row carried is_inclusive (drives the parent-row note). */
  hasInclusiveTax: boolean;
  appliedTotal: number;
  lineOwnedTotal: number;
  appliedCount: number;
  lineOwnedCount: number;
}

function summarizeComponents(
  components: ReadonlyArray<PricingComponent>,
  groups?: { applied: ReadonlyArray<PricingComponent>; own: ReadonlyArray<PricingComponent> },
): ComponentSummary {
  const counts = { discount: 0, charge: 0, tax: 0, withholding: 0, retention: 0 };
  let inheritedCount = 0;
  let lineDiscountTotal = 0;
  let lineTaxTotal = 0;
  let hasInclusiveTax = false;
  for (const c of components) {
    if (c.term_type === "discount") {
      counts.discount += 1;
      lineDiscountTotal += c.computed_amount;
    } else if (c.term_type === "charge") {
      counts.charge += 1;
    } else if (c.term_type === "tax") {
      counts.tax += 1;
      if (c.is_inclusive) hasInclusiveTax = true;
      else                lineTaxTotal += c.computed_amount;
    } else if (c.term_type === "withholding") {
      counts.withholding += 1;
      lineTaxTotal += c.computed_amount;
    } else if (c.term_type === "retention") {
      counts.retention += 1;
    }
    if (c.origin === "inherited") inheritedCount += 1;
  }
  return {
    counts,
    inheritedCount,
    lineDiscountTotal,
    lineTaxTotal,
    hasInclusiveTax,
    appliedTotal: groups ? signedComponentTotal(groups.applied) : 0,
    lineOwnedTotal: groups ? signedComponentTotal(groups.own) : signedComponentTotal(components),
    appliedCount: groups?.applied.length ?? 0,
    lineOwnedCount: groups?.own.length ?? components.length,
  };
}

function signedComponentTotal(components: ReadonlyArray<PricingComponent>): number {
  return components.reduce((sum, component) => {
    const sign = COMPONENT_TERM_SIGN[component.term_type];
    return sum + (sign === -1 ? -component.computed_amount : component.computed_amount);
  }, 0);
}

const COMPONENT_TERM_SIGN: Record<PricingComponent["term_type"], 1 | -1 | 0> = {
  discount: -1,
  charge: 1,
  tax: 1,
  withholding: -1,
  retention: -1,
  principal_marker: 0,
};

function splitLineComponents(
  lineComponents: ReadonlyArray<PricingComponent>,
  appliedHeaderComponents: ReadonlyArray<PricingComponent>,
): { applied: PricingComponent[]; own: PricingComponent[] } {
  const own: PricingComponent[] = [];
  const applied: PricingComponent[] = [];
  const seenAppliedKeys = new Set<string>();
  const seenAppliedSignatures = new Set<string>();

  for (const component of appliedHeaderComponents) {
    const parentId = component.is_apportioned_from_id ?? component.id;
    const key = `${parentId}:${component.source_line_id ?? ""}`;
    if (seenAppliedKeys.has(key)) continue;
    seenAppliedKeys.add(key);
    seenAppliedSignatures.add(componentLineSignature(component));
    applied.push(component);
  }

  for (const component of lineComponents) {
    if (component.is_apportioned_from_id) {
      const key = `${component.is_apportioned_from_id}:${component.source_line_id ?? ""}`;
      if (!seenAppliedKeys.has(key)) {
        seenAppliedKeys.add(key);
        seenAppliedSignatures.add(componentLineSignature(component));
        applied.push(component);
      }
      continue;
    }
    if (seenAppliedSignatures.has(componentLineSignature(component))) {
      continue;
    }
    own.push(component);
  }

  return {
    applied: applied.sort((a, b) => a.sequence - b.sequence),
    own: own.sort((a, b) => a.sequence - b.sequence),
  };
}

function componentLineSignature(component: PricingComponent): string {
  return [
    component.source_line_id ?? "",
    component.term_type,
    component.condition_type_id || component.condition_type_code,
    component.sequence,
    component.basis,
    roundSignatureNumber(component.rate_value),
    roundSignatureNumber(component.base_for_calculation),
    roundSignatureNumber(component.computed_amount),
  ].join("|");
}

function roundSignatureNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return (Math.round(value * 100) / 100).toFixed(2);
}

interface DistributionSummary {
  total: number;
  balance: number;
  isBalanced: boolean;
  rowCount: number;
}

function summarizeDistributions(
  distributions: ReadonlyArray<AccountingDistribution>,
  lineGrossAmount: number,
): DistributionSummary {
  const total = distributions.reduce((sum, d) => sum + d.distributed_amount, 0);
  const balance = lineGrossAmount - total;
  return {
    total,
    balance,
    // Half-cent tolerance — matches the AD balance check elsewhere in
    // the v1.1 spec (PricingComponentWaterfall right-rail uses 0.005).
    isBalanced: distributions.length > 0 && Math.abs(balance) <= 0.005,
    rowCount: distributions.length,
  };
}

// ── Collapsible section wrapper ────────────────────────────────────

/**
 * Accordion-style section that the row drawer uses for Components and
 * Distribution. The closed state shows the section title on the left
 * plus a `summary` slot on the right that previews what's inside —
 * counts, badges, totals — so a user scanning many lines doesn't have
 * to expand each row to see whether anything's worth attention.
 *
 * Caller owns the open/closed state so it can be persisted at the
 * surface level (Sprint follow-up: session-scoped persistence).
 */
function CollapsibleSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div data-pi-line-drawer-section={title.toLowerCase()}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
          "border-b border-border bg-muted/30 hover:bg-muted/60",
        )}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
        {/* Title carries the section anchor — `font-semibold` so it
            wins against the summary chip strip which is intentionally
            muted (item 11 from the mockup polish list). */}
        <span className="font-semibold text-foreground">{title}</span>
        <div className="ml-auto flex items-center gap-3 text-muted-foreground">{summary}</div>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Band 1: Line Recap (legacy, retained for back-compat) ──────────

function LineRecapBand({
  line,
  onJumpToMatchException,
}: {
  line: PurchaseInvoiceLine;
  onJumpToMatchException?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-b border-border bg-muted/40">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-xs text-muted-foreground">
          Line {line.line_no} · {line.uom_code}
        </div>
        <div className="text-sm font-medium truncate">{line.item_description}</div>
      </div>

      <div className="text-xs flex items-center gap-4">
        <div>
          <span className="text-muted-foreground">Qty</span>{" "}
          <span className="tabular-nums">{line.quantity}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Rate</span>{" "}
          <CurrencyTriad
            amount={line.unit_price}
            currencyCode={line.currency_code}
            baseCurrencyCode={line.base_currency_code}
            exchangeRate={line.exchange_rate}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <MatchBadge
          status={line.match_status}
          matchedQuantity={line.matched_quantity}
          totalQuantity={line.quantity}
          onClick={line.match_status === "match_exception" ? onJumpToMatchException : undefined}
        />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {line.status}
        </span>
      </div>
    </div>
  );
}

// ── Right rail digest ──────────────────────────────────────────────

interface RightRailItem {
  Icon: typeof ShieldCheck;
  label: string;
  /** Optional badge text (count or status). */
  count?: number | string;
  intent?: "success" | "warning" | "error" | "info" | "neutral";
  onClick?: () => void;
}

function railIntentText(intent: RightRailItem["intent"]): string {
  switch (intent) {
    case "success": return "text-emerald-700 dark:text-emerald-400";
    case "warning": return "text-amber-700 dark:text-amber-400";
    case "error": return "text-red-700 dark:text-red-400";
    case "info": return "text-sky-700 dark:text-sky-400";
    default: return "text-foreground/70";
  }
}

function RightRail({
  items,
}: {
  items: RightRailItem[];
}) {
  if (items.length === 0) return null;
  return (
    <aside className="hidden xl:flex flex-col gap-2 w-56 shrink-0 border-l border-border bg-card px-3 py-3 text-foreground">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
        Digest
      </div>
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => {
          const content = (
            <div className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/85",
              item.onClick && "hover:bg-muted/60 cursor-pointer",
            )}>
              <item.Icon className={cn("h-3.5 w-3.5", railIntentText(item.intent))} aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {item.count != null && (
                <span className="tabular-nums text-foreground/70">{item.count}</span>
              )}
            </div>
          );
          return item.onClick ? (
            <button key={idx} type="button" onClick={item.onClick} className="text-left">
              {content}
            </button>
          ) : (
            <div key={idx}>{content}</div>
          );
        })}
      </div>
    </aside>
  );
}

// ── Build digest items from the line state ─────────────────────────

function buildRightRailItems({
  line,
  components,
  distributions,
  lineGrossAmount,
  onJumpToMatchException,
}: {
  line: PurchaseInvoiceLine;
  components: PricingComponent[];
  distributions: AccountingDistribution[];
  lineGrossAmount: number;
  onJumpToMatchException?: () => void;
}): RightRailItem[] {
  const items: RightRailItem[] = [];

  // AD balance summary
  const adSum = distributions.reduce((acc, d) => acc + d.distributed_amount, 0);
  const adBalanced = Math.abs(adSum - lineGrossAmount) <= 0.005;
  items.push({
    Icon: ShieldCheck,
    label: "AD balanced",
    count: adBalanced ? "ok" : "off",
    intent: adBalanced ? "success" : "error",
  });

  // Match exception
  if (line.match_status === "match_exception") {
    items.push({
      Icon: ShieldCheck,
      label: "Match exception open",
      intent: "error",
      onClick: onJumpToMatchException,
    });
  }

  // Supersession counts
  const supersededCount = components.reduce((acc, c) => acc + (c.chain?.length ?? 0), 0);
  if (supersededCount > 0) {
    items.push({
      Icon: History,
      label: "Components superseded",
      count: supersededCount,
      intent: "info",
    });
  }

  // Inheritance counts
  const inheritedCount = components.filter((c) => c.origin === "inherited").length;
  if (inheritedCount > 0) {
    items.push({
      Icon: CornerDownRight,
      label: "From header",
      count: inheritedCount,
      intent: "info",
    });
  }

  return items;
}

// ── Main composite ────────────────────────────────────────────────

export function PiLineDrawer({
  line,
  appliedHeaderComponents = [],
  components,
  distributions,
  componentsAffordance,
  distributionsAffordance,
  onAddComponent,
  onAddChargeComponent,
  onAddTaxComponent,
  onAddWhtComponent,
  onEditComponent,
  onReplaceComponent,
  onDeleteComponent,
  onJumpToHeaderRow,
  onAddDistribution,
  onEditDistribution,
  onDeleteDistribution,
  onJumpToMatchException,
  className,
}: PiLineDrawerProps) {
  const componentGroups = splitLineComponents(components, appliedHeaderComponents);
  const allVisibleComponents = [...componentGroups.applied, ...componentGroups.own];
  const distributionTargetAmount = deriveDistributableCost(line.net_amount, allVisibleComponents);
  const rightRailItems = buildRightRailItems({
    line,
    components: allVisibleComponents,
    distributions,
    lineGrossAmount: distributionTargetAmount,
    onJumpToMatchException,
  });

  // Collapse state is persisted globally per-section via localStorage:
  // toggling Components closed on any one line keeps it closed on every
  // other line + survives reload. When no preference exists, fall back
  // to the smart per-row default (open when the section has rows).
  const [componentsOpen,    toggleComponents]    = usePersistedToggle(STORAGE_KEY_COMPONENTS,    allVisibleComponents.length > 0);
  const [distributionsOpen, toggleDistributions] = usePersistedToggle(STORAGE_KEY_DISTRIBUTIONS, distributions.length > 0);

  const componentSummary = summarizeComponents(allVisibleComponents, componentGroups);
  const distributionSummary = summarizeDistributions(distributions, distributionTargetAmount);

  return (
    <div className={cn("flex border border-border rounded-md bg-card overflow-hidden", className)}>
      <div className="flex-1 min-w-0">
        {/* Components — collapsible with rich summary chip strip on the right. */}
        <CollapsibleSection
          title="Components"
          open={componentsOpen}
          onToggle={toggleComponents}
          summary={
            <ComponentSectionSummary
              summary={componentSummary}
              currencyCode={line.currency_code}
              baseCurrencyCode={line.base_currency_code}
              exchangeRate={line.exchange_rate}
              lineGrossAmount={line.gross_amount}
              hasRows={allVisibleComponents.length > 0}
            />
          }
        >
          <div className="px-3 py-3">
            {allVisibleComponents.length === 0 ? (
              <EmptyComponentsBlock
                line={line}
                affordance={componentsAffordance}
                onAddComponent={onAddComponent}
                onAddChargeComponent={onAddChargeComponent}
                onAddTaxComponent={onAddTaxComponent}
                onAddWhtComponent={onAddWhtComponent}
              />
            ) : (
              <div className="space-y-3">
                {componentGroups.applied.length > 0 && (
                  <AppliedHeaderComponentsPanel
                    components={componentGroups.applied}
                    currencyCode={line.currency_code}
                    baseCurrencyCode={line.base_currency_code}
                    exchangeRate={line.exchange_rate}
                    onJumpToHeaderRow={onJumpToHeaderRow}
                  />
                )}
                {componentGroups.own.length > 0 ? (
                  <div>
                    <SectionEyebrow label="Line components" />
                    <PricingComponentWaterfall
                      components={componentGroups.own}
                      lineNetAmount={line.net_amount}
                      currencyCode={line.currency_code}
                      baseCurrencyCode={line.base_currency_code}
                      exchangeRate={line.exchange_rate}
                      affordance={componentsAffordance}
                      onAdd={onAddComponent}
                      onAddCharge={onAddChargeComponent}
                      onAddTax={onAddTaxComponent}
                      onAddWithholding={onAddWhtComponent}
                      onEdit={onEditComponent}
                      onReplace={onReplaceComponent}
                      onDelete={onDeleteComponent}
                      onJumpToHeaderRow={onJumpToHeaderRow}
                    />
                  </div>
                ) : (
                  <LineComponentsEmptyBlock
                    affordance={componentsAffordance}
                    onAddComponent={onAddComponent}
                    onAddChargeComponent={onAddChargeComponent}
                    onAddTaxComponent={onAddTaxComponent}
                    onAddWhtComponent={onAddWhtComponent}
                  />
                )}
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Distribution — collapsible with balance status summary.
            The explicit Gross bridge between Components and Distribution
            (per the original v1.1 spec §4.3 Band 3) was removed because
            the Components header chip strip already surfaces "Gross ₹X"
            and the Distribution header surfaces "Balance to ₹X". Showing
            a third dedicated Gross row was just visual noise. */}
        <CollapsibleSection
          title="Distribution"
          open={distributionsOpen}
          onToggle={toggleDistributions}
          summary={
            <DistributionSectionSummary
              summary={distributionSummary}
              currencyCode={line.currency_code}
              baseCurrencyCode={line.base_currency_code}
              exchangeRate={line.exchange_rate}
            />
          }
        >
          <div className="px-3 py-3">
            <AccountingDistributionPanel
              distributions={distributions}
              lineGrossAmount={distributionTargetAmount}
              currencyCode={line.currency_code}
              baseCurrencyCode={line.base_currency_code}
              exchangeRate={line.exchange_rate}
              affordance={distributionsAffordance}
              onAdd={onAddDistribution}
              onEdit={onEditDistribution}
              onDelete={onDeleteDistribution}
            />
          </div>
        </CollapsibleSection>
      </div>

      {/* Right rail (xl+ viewports only) */}
      <RightRail items={rightRailItems} />
    </div>
  );
}

// ── Collapsed-section summary chip strips ──────────────────────────

function ComponentSectionSummary({
  summary,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  lineGrossAmount,
  hasRows,
}: {
  summary: ComponentSummary;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  lineGrossAmount: number;
  hasRows: boolean;
}) {
  if (!hasRows) return <span className="italic">none yet</span>;
  return (
    <>
      {summary.appliedCount > 0 && (
        <span className="text-foreground">
          Document applied{" "}
          <span className="font-medium tabular-nums">
            <CurrencyTriad
              amount={summary.appliedTotal}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              signed
            />
          </span>
        </span>
      )}
      {summary.lineOwnedCount > 0 ? (
        <span className="text-foreground">
          Line components{" "}
          <span className="font-medium tabular-nums">
            <CurrencyTriad
              amount={summary.lineOwnedTotal}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              signed
            />
          </span>
        </span>
      ) : (
        <span className="italic">line components none</span>
      )}
      <span className="text-foreground">
        Gross{" "}
        <span className="font-medium tabular-nums">
          <CurrencyTriad
            amount={lineGrossAmount}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        </span>
      </span>
    </>
  );
}

function DistributionSectionSummary({
  summary,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  summary: DistributionSummary;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  if (summary.rowCount === 0) {
    return (
      <>
        <span className="text-foreground">
          Balance to{" "}
          <span className="font-medium tabular-nums">
            <CurrencyTriad
              amount={summary.balance}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </span>
        </span>
        <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          No rows · resolves at posting
        </span>
      </>
    );
  }
  if (summary.isBalanced) {
    return (
      <>
        <span>{summary.rowCount} GL row{summary.rowCount === 1 ? "" : "s"}</span>
        <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          Balanced
        </span>
      </>
    );
  }
  return (
    <>
      <span>{summary.rowCount} GL row{summary.rowCount === 1 ? "" : "s"}</span>
      <span className="text-foreground">
        Out of balance by{" "}
        <span className="font-medium tabular-nums">
          <CurrencyTriad
            amount={summary.balance}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        </span>
      </span>
    </>
  );
}

// ── Empty-state component block (extracted to keep the body lean) ──

// -- Applied document projection ----------------------------------------------

const APPLIED_TERM_SIGN: Record<PricingComponent["term_type"], 1 | -1 | 0> = {
  discount: -1,
  charge: 1,
  tax: 1,
  withholding: -1,
  retention: -1,
  principal_marker: 0,
};

function SectionEyebrow({ label }: { label: string }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
  );
}

function AppliedHeaderComponentsPanel({
  components,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  onJumpToHeaderRow,
}: {
  components: PricingComponent[];
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  onJumpToHeaderRow: (sourceHeaderPcId: string) => void;
}) {
  const total = components.reduce((sum, component) => {
    const sign = APPLIED_TERM_SIGN[component.term_type];
    return sum + (sign === -1 ? -component.computed_amount : component.computed_amount);
  }, 0);

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2">
        <SectionEyebrow label="Applied from document" />
        <div className="text-sm font-semibold tabular-nums">
          <CurrencyTriad
            amount={total}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
            signed
          />
        </div>
      </div>
      <div>
        {components.map((component) => {
          const parentId = component.is_apportioned_from_id ?? component.id;
          const sign = APPLIED_TERM_SIGN[component.term_type];
          const amount = sign === -1 ? -component.computed_amount : component.computed_amount;
          return (
            <div
              key={`${parentId}:${component.source_line_id ?? component.id}`}
              className="grid grid-cols-[minmax(0,1fr)_9rem_6.5rem_6rem] items-center gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {component.condition_type_label
                    || component.condition_type_code
                    || <span className="italic text-muted-foreground">unnamed</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {formatAppliedBasis(component)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onJumpToHeaderRow(parentId)}
                className={cn(
                  "inline-flex w-fit items-center gap-1 justify-self-start rounded-md border px-1.5 py-0.5",
                  "border-sky-500/30 bg-sky-500/10 text-[11px] font-medium text-sky-700",
                  "hover:bg-sky-500/15 dark:text-sky-400",
                )}
                title="Jump to owning header component"
                aria-label="Jump to owning header component"
              >
                <ArrowUpRight className="h-3 w-3" aria-hidden />
                from document
              </button>
              <div className="text-right text-sm font-medium tabular-nums">
                <CurrencyTriad
                  amount={amount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
              </div>
              <div className="text-right text-xs text-muted-foreground">read-only</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatAppliedBasis(component: PricingComponent): string {
  const rate = component.rate_value;
  const amount = component.amount_value;
  const base = component.base_for_calculation;
  if (component.basis === "percent" && rate != null) {
    return base != null
      ? `${rate}% on ${formatAppliedMoney(base, component.currency_code)}`
      : `${rate}%`;
  }
  if ((component.basis === "amount" || component.basis === "flat") && amount != null) {
    return `Flat ${formatAppliedMoney(amount, component.currency_code)}`;
  }
  if (component.basis === "per_unit" && rate != null) {
    return `${rate}/unit`;
  }
  return component.term_type;
}

function formatAppliedMoney(amount: number, currencyCode: string): string {
  return `${currencyCode} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function EmptyComponentsBlock({
  line,
  affordance,
  onAddComponent,
  onAddChargeComponent,
  onAddTaxComponent,
  onAddWhtComponent,
}: {
  line: PurchaseInvoiceLine;
  affordance: EditAffordance;
  onAddComponent?: () => void;
  onAddChargeComponent?: () => void;
  onAddTaxComponent?: () => void;
  onAddWhtComponent?: () => void;
}) {
  const showAdd = affordance === "edit" && (
    onAddComponent || onAddChargeComponent || onAddTaxComponent || onAddWhtComponent
  );
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
      <div className="italic text-muted-foreground">
        No components. Net = Gross{" "}
        <CurrencyTriad
          amount={line.net_amount}
          currencyCode={line.currency_code}
          baseCurrencyCode={line.base_currency_code}
          exchangeRate={line.exchange_rate}
          className="not-italic"
        />
      </div>
      {showAdd && (
        <div className="flex items-center gap-1.5">
          {onAddComponent && (
            <button
              type="button"
              onClick={onAddComponent}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Plus className="h-3 w-3" aria-hidden /> Discount
            </button>
          )}
          {onAddChargeComponent && (
            <button
              type="button"
              onClick={onAddChargeComponent}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Plus className="h-3 w-3" aria-hidden /> Charge
            </button>
          )}
          {onAddTaxComponent && (
            <button
              type="button"
              onClick={onAddTaxComponent}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Plus className="h-3 w-3" aria-hidden /> Tax
            </button>
          )}
          {onAddWhtComponent && (
            <button
              type="button"
              onClick={onAddWhtComponent}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Plus className="h-3 w-3" aria-hidden /> Withholding
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LineComponentsEmptyBlock({
  affordance,
  onAddComponent,
  onAddChargeComponent,
  onAddTaxComponent,
  onAddWhtComponent,
}: {
  affordance: EditAffordance;
  onAddComponent?: () => void;
  onAddChargeComponent?: () => void;
  onAddTaxComponent?: () => void;
  onAddWhtComponent?: () => void;
}) {
  const showAdd = affordance === "edit" && (
    onAddComponent || onAddChargeComponent || onAddTaxComponent || onAddWhtComponent
  );
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionEyebrow label="Line components" />
          <div className="italic text-muted-foreground">none yet</div>
        </div>
        {showAdd && (
          <div className="flex items-center gap-1.5">
            {onAddComponent && (
              <button
                type="button"
                onClick={onAddComponent}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Plus className="h-3 w-3" aria-hidden /> Discount
              </button>
            )}
            {onAddChargeComponent && (
              <button
                type="button"
                onClick={onAddChargeComponent}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Plus className="h-3 w-3" aria-hidden /> Charge
              </button>
            )}
            {onAddTaxComponent && (
              <button
                type="button"
                onClick={onAddTaxComponent}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Plus className="h-3 w-3" aria-hidden /> Tax
              </button>
            )}
            {onAddWhtComponent && (
              <button
                type="button"
                onClick={onAddWhtComponent}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Plus className="h-3 w-3" aria-hidden /> Withholding
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
