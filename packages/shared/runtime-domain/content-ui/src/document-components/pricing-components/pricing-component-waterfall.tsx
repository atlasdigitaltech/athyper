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

import { useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowUpRight,
  Shield,
  Tag,
  CornerDownRight,
  History,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/platform-theme/semantic-colors";
import { CurrencyTriad } from "../money/currency-triad";
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
  /** Add a new positive charge/freight component row. */
  onAddCharge?: () => void;
  /**
   * Add a tax/withholding row. Rendered alongside `onAdd` when provided.
   * Tax has enough distinct fields (tax_group, place_of_supply, recoverability)
   * to warrant a dedicated drawer.
   */
  onAddTax?: () => void;
  /**
   * Add a withholding (WHT) row. WS-D — separate affordance from tax so the
   * WhtDrawer can capture WHT-specific fields (section code, wht_basis,
   * jurisdiction-required metadata). Caller threads this only when
   * apFeatureFlags.whtPcEnabled is true; absent prop → CTA hidden.
   */
  onAddWithholding?: () => void;
  /** Edit a component row (draft only). */
  onEdit?: (componentId: string) => void;
  /** Replace via supersession (approval only). */
  onReplace?: (componentId: string) => void;
  /** Delete a component row (draft only). */
  onDelete?: (componentId: string) => void;
  /**
   * Jump to the owning header-scope PC row in the Header Strip.
   * Called when the user clicks the ↗ chip on an apportioned row.
   *
   * Required (v3.1 Phase 3 acceptance gate): every line surface that
   * renders this waterfall must thread this from the runtime context
   * (DocumentRuntimeContext.jumpToHeaderRow). Without it, apportioned
   * rows become dead-ends — the user sees they came from somewhere but
   * can't navigate back. Make it a no-op if the page genuinely has no
   * header strip surface; do not omit the prop.
   */
  onJumpToHeaderRow: (sourceHeaderPcId: string) => void;
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

/**
 * Renders the BASIS column text. The mockups want richer copy than
 * "10%" — e.g. "5% on net + charges", "Flat ₹100 · on net" — so we
 * decorate the raw basis with the implicit "what it computes on"
 * suffix. The suffix is term-type-driven today (a fuller `computes_on`
 * descriptor lands when the PC contract carries one).
 *
 * When `component.is_inclusive` is true, the suffix flips to
 * "inclusive of price" so the user can tell from the BASIS cell alone
 * that this row doesn't move gross.
 */
function formatBasisHint(component: PricingComponent): string {
  const basis: PcBasis = component.basis;
  const rate = component.rate_value;
  const amt  = component.amount_value;
  const head =
    basis === "percent"  ? (rate != null ? `${rate}%` : "%") :
    basis === "per_unit" ? (rate != null ? `${rate}/unit` : "per unit") :
    /* amount | flat */    (amt  != null ? `Flat ${amt}` : "flat");

  if (component.is_inclusive) {
    return `${head} inclusive of price`;
  }

  if (component.term_type === "tax" && component.base_for_calculation != null) {
    return `${head} on ${formatMoneyInline(component.base_for_calculation, component.currency_code)}`;
  }

  // Suffix: what this percent / flat computes on. Defaults sensible
  // for each term family until the PC contract exposes `computes_on`.
  let suffix: string;
  switch (component.term_type) {
    case "tax":
    case "withholding":
      // Most jurisdictions tax net + charges; some tax only net. The
      // PC contract will eventually carry `computes_on` ('net' /
      // 'net+charges' / 'net+charges+discounts') — until then the
      // copy is the conservative net+charges default.
      suffix = "on net + charges";
      break;
    case "retention":
      suffix = "on net + charges + tax";
      break;
    case "discount":
    case "charge":
    default:
      suffix = "on net";
      break;
  }
  return `${head} ${suffix}`;
}

function taxBasisHelpText(component: PricingComponent): string | null {
  if (component.term_type !== "tax") return null;
  const base = component.base_for_calculation;
  if (base == null) return null;

  const mode = component.metadata?.["taxable_base_mode"];
  const sourceAmount = readMetadataNumber(component.metadata, "taxable_base_source_amount");
  const manualPct = readMetadataNumber(component.metadata, "taxable_base_manual_pct");
  const chargeIds = readMetadataStringArray(component.metadata, "taxable_base_charge_ids");
  const rate = component.rate_value ?? 0;
  const tax = component.computed_amount;
  const lines = ["Taxable base"];

  switch (mode) {
    case "after_discounts":
      lines.push(`Base after discounts: ${formatMoneyInline(base, component.currency_code)}`);
      break;
    case "charges_only":
      lines.push(`Selected charges: ${formatMoneyInline(base, component.currency_code)}`);
      if (chargeIds.length > 0) lines.push(`${chargeIds.length} charge component${chargeIds.length === 1 ? "" : "s"} included`);
      break;
    case "after_discounts_plus_charges":
      lines.push(`After discounts + selected charges: ${formatMoneyInline(base, component.currency_code)}`);
      if (chargeIds.length > 0) lines.push(`${chargeIds.length} charge component${chargeIds.length === 1 ? "" : "s"} included`);
      break;
    case "manual_amount":
      lines.push(`Custom taxable amount: ${formatMoneyInline(base, component.currency_code)}`);
      if (sourceAmount != null) lines.push(`Source base: ${formatMoneyInline(sourceAmount, component.currency_code)}`);
      if (manualPct != null) lines.push(`Taxable portion: ${manualPct}%`);
      break;
    case "line_net":
    default:
      lines.push(`Line net: ${formatMoneyInline(base, component.currency_code)}`);
      break;
  }

  lines.push("");
  lines.push("Tax");
  lines.push(`${rate}% x ${formatMoneyInline(base, component.currency_code)} = ${formatMoneyInline(tax, component.currency_code)}`);
  return lines.join("\n");
}

function readMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | null {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readMetadataStringArray(metadata: Record<string, unknown> | undefined, key: string): string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function formatMoneyInline(amount: number, currencyCode: string): string {
  return `${currencyCode} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Per-component inclusive-tax amount (sum of inclusive tax rows).
 * Drives the footer's "excludes ₹X inclusive tax (already in price)"
 * caption + the per-row "in price · no gross change" annotation.
 */
function computeInclusiveTaxAmount(components: ReadonlyArray<PricingComponent>): number {
  let sum = 0;
  for (const c of components) {
    if (c.term_type !== "tax") continue;
    if (!c.is_inclusive) continue;
    sum += c.computed_amount;
  }
  return sum;
}

// ── Origin badge ───────────────────────────────────────────────────

/**
 * Origin badge — visual hierarchy is:
 *   manual          → ghost (no border, soft bg)             → recedes
 *   inherited /
 *   vendor_default /
 *   system_resolved → tinted subtleBadge with icon           → flags attention
 *
 * Per the mockup polish list (item 10): every row in a typical PI is
 * `manual`, so giving them all the same tinted pill creates noise. The
 * tinted treatment is reserved for rows that came in via inheritance
 * or were resolved by a policy — exactly the rows a reviewer should
 * pause on.
 */
function OriginBadge({ origin }: { origin: PcOrigin }) {
  const descr = ORIGIN_DESCRIPTOR[origin];

  if (origin === "manual") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5",
          "text-[11px] font-medium text-muted-foreground",
        )}
      >
        {descr.label}
      </span>
    );
  }

  const colors = resolveSemanticColors(descr.intent);
  const Icon = descr.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        colors.subtleBadge,
      )}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      <span>{descr.label}</span>
    </span>
  );
}

// ── Action button (inline per-row, icon-only) ──────────────────────

/**
 * Icon-only row action. Renders a 1.5-rem square button with the
 * passed Lucide icon. `label` is preserved on `title` + `aria-label`
 * so the action stays accessible without showing text.
 *
 * Icon-only keeps the actions column narrow (the previous text
 * variant was ~3.5rem wide per button, ~6.5rem per row — wide enough
 * to push the AMOUNT column out of alignment with the header).
 */
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
        "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        "disabled:opacity-40 disabled:pointer-events-none",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </button>
  );
}

// ── Tax recoverability sub-row ─────────────────────────────────────

/**
 * Indented sub-row beneath a tax/withholding row showing the GL split.
 *
 * Mockup format (single line, L-bend prefix):
 *   L  Recoverable 100% · ₹21.00 input credit
 *   L  Recoverable 60% · ₹12.60 input credit · 40% cost · ₹8.40
 *
 * The L glyph hints "this is a child of the row above" without needing
 * a connector line. Sub-row stays muted to keep the parent row's
 * AMOUNT the primary number.
 */
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
    <div className="pl-12 pr-3 py-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
      <span aria-hidden className="text-muted-foreground/60">L</span>
      <span>
        Recoverable {recoverablePct}%{" "}
        <CurrencyTriad
          amount={recoverable}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
        {" "}input credit
      </span>
      {costPct > 0 && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span>
            {costPct}% cost{" "}
            <CurrencyTriad
              amount={cost}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </span>
        </>
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
  onJumpToHeaderRow: (id: string) => void;
  isChainEntry?: boolean;
}) {
  const sign = TERM_SIGN[component.term_type];
  const signedAmount = sign === -1 ? -component.computed_amount : component.computed_amount;
  const basisHelpText = taxBasisHelpText(component);

  // Apportioned children are detected by the lineage column, NOT by `origin`.
  // After the Phase 0 apportionment refactor, bulk-inserted line PCs carry
  // `origin = 'system_resolved'` (per pricing-component.service.ts), so the
  // earlier `origin === 'inherited'` check fired on zero rows in practice.
  // `is_apportioned_from_id IS NOT NULL` is the contractual lineage signal —
  // see 01u_tables_pricing_component.sql §"Entry & apportionment".
  const isApportioned     = component.is_apportioned_from_id != null;
  const parentHeaderPcId  = component.is_apportioned_from_id ?? null;
  const protectedRow      = ORIGIN_DESCRIPTOR[component.origin].protected;

  // Edit affordance for apportioned rows is "override only" — the drawer
  // still opens (same UI surface), but the user can only override the
  // allocated amount. Delete is DISABLED with a tooltip pointing back to
  // the header strip (you remove apportionment there, not here).
  const showEdit    = affordance === "edit" && !isChainEntry;
  const showReplace = affordance === "replace" && !isChainEntry;
  const showDelete  = affordance === "edit" && !protectedRow && !isApportioned && !isChainEntry;
  // When an apportioned row would otherwise show Delete, render it
  // disabled-with-tooltip instead so the user understands why.
  const showApportionedDeleteHint =
    affordance === "edit" && isApportioned && !isChainEntry;

  return (
    <div className={cn(
      // Body grid mirrors the header grid (same template + gap) so
      // every cell aligns vertically across rows. AMOUNT pinned to
      // `min-w-[6rem]` via the column template — see header below.
      "grid grid-cols-[3rem_minmax(0,1fr)_6rem_8rem_6rem_4.5rem] items-start gap-3 px-3 py-2 text-sm",
      "border-b border-border/40 last:border-b-0",
      isChainEntry && "bg-muted/30 text-muted-foreground",
    )}>
      {/* Seq */}
      <div className="text-xs tabular-nums text-muted-foreground pt-0.5">
        {isChainEntry
          ? <span className="italic">superseded</span>
          : component.sequence}
      </div>

      {/* Term + condition label. INCL marker is a chip alongside the
          label (NOT a separate subtitle line) so the row stays single-
          height when inclusive. Falls back to the code (then "—") when
          the label is missing — otherwise the cell renders empty and
          the user can't tell what term family the row belongs to. */}
      <div className="min-w-0 flex flex-wrap items-center gap-1.5">
        <span className="font-medium truncate">
          {component.condition_type_label
            || component.condition_type_code
            || <span className="italic text-muted-foreground">unnamed</span>}
        </span>
        {component.is_inclusive && (
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
        {component.cost_effect && component.cost_effect !== "NO_COST_EFFECT" && (
          <span
            className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
            title={component.cost_effect === "ADD_TO_COST" ? "Included in distributable cost and budget basis." : "Reduces distributable cost and budget basis."}
          >
            {component.cost_effect === "ADD_TO_COST" ? "Adds to cost" : "Reduces cost"}
          </span>
        )}
        {component.posting_pattern === "TAX_RECOVERABLE" && (
          <span className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
            Input tax
          </span>
        )}
        {component.posting_pattern === "LIABILITY_SPLIT" && (
          <span className="inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
            Liability split
          </span>
        )}
        {component.recoverable_pct != null
          && component.recoverable_pct < 100
          && (component.term_type === "tax" || component.term_type === "withholding") && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md border border-amber-500/30 bg-amber-500/10",
              "px-1.5 py-0.5 text-[10px] font-medium",
              "text-amber-700 dark:text-amber-400",
            )}
            title={`${100 - component.recoverable_pct}% of this tax is a non-recoverable cost (no input credit).`}
          >
            <RefreshCw className="h-2.5 w-2.5" aria-hidden />
            {component.recoverable_pct}% recoverable
          </span>
        )}
        {component.tax_section_code && (
          <span
            className={cn(
              "inline-flex items-center rounded-md border border-border bg-muted/60",
              "px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              "text-muted-foreground",
            )}
            title={
              component.term_type === "withholding"
                ? `TDS section ${component.tax_section_code}.`
                : `Tax section ${component.tax_section_code}.`
            }
          >
            §{component.tax_section_code}
          </span>
        )}
      </div>

      {/* Origin — for apportioned rows we replace the raw origin badge
          with a "↗ from Header" chip pointing back to the parent PC. The
          stored `origin` is `system_resolved` (the row was minted by the
          apportionment service, not entered by the user) but that's an
          implementation detail; what the reviewer needs to see is "this
          slice came down from a header charge, not entered here". */}
      <div className="pt-0.5">
        {isApportioned && parentHeaderPcId ? (
          <button
            type="button"
            onClick={() => onJumpToHeaderRow(parentHeaderPcId)}
            title="Jump to the owning header-scope component"
            aria-label="Jump to owning header component"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
              "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
              "hover:bg-sky-500/15 transition-colors",
            )}
          >
            <ArrowUpRight className="h-3 w-3" aria-hidden />
            <span>from Header</span>
          </button>
        ) : (
          <OriginBadge origin={component.origin} />
        )}
      </div>

      {/* Basis. Inclusive rows get a highlighted background tint so the
          eye lands on the "not changing gross" fact without reading. */}
      <div
        className={cn(
          "text-xs tabular-nums text-muted-foreground pt-0.5",
          component.is_inclusive && cn(
            "rounded-md px-1.5 py-0.5",
            "bg-sky-500/10 text-sky-700 dark:text-sky-400 font-medium",
          ),
        )}
      >
        <span className="inline-flex max-w-full items-center gap-1">
          <span className="truncate">{formatBasisHint(component)}</span>
          {basisHelpText && (
            <span
              className="inline-flex shrink-0 text-muted-foreground/80"
              title={basisHelpText}
              aria-label={basisHelpText}
            >
              <Info className="h-3 w-3" aria-hidden />
            </span>
          )}
        </span>
      </div>

      {/* Amount + optional sub-caption.
          - Normal: signed amount, bold.
          - Inclusive: amount muted (since it doesn't move gross) plus a
            "in price · no gross change" caption directly below the
            number so the user can tell at a glance. */}
      <div className="text-right">
        <div className={cn(
          "text-sm tabular-nums font-medium",
          component.is_inclusive && "text-muted-foreground font-normal",
        )}>
          <CurrencyTriad
            amount={signedAmount}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
            signed={!component.is_inclusive}
          />
        </div>
        {component.is_inclusive && (
          <div className="text-[10px] text-muted-foreground italic mt-0.5 leading-tight">
            in price · no gross change
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 justify-end pt-0.5">
        {showEdit && (
          <RowAction
            Icon={Pencil}
            label={isApportioned ? "Override allocated amount" : "Edit"}
            onClick={() => onEdit?.(component.id)}
          />
        )}
        {showReplace && <RowAction Icon={RefreshCw} label="Replace" onClick={() => onReplace?.(component.id)} />}
        {showDelete  && <RowAction Icon={Trash2}    label="Delete"  onClick={() => onDelete?.(component.id)} />}
        {/* Apportioned rows: render Delete in DISABLED state with the
            actionable hint as tooltip. Hiding it entirely (the previous
            behavior via `protected: true`) made the column look mis-
            aligned and gave the user no clue why they couldn't delete. */}
        {showApportionedDeleteHint && (
          <RowAction
            Icon={Trash2}
            label="Inherited from a header-scope component. Remove it from the Header strip, or override the amount here."
            onClick={() => { /* disabled — no-op */ }}
            disabled
          />
        )}
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
  onJumpToHeaderRow,
}: {
  chain: PricingComponent[];
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  affordance: EditAffordance;
  onJumpToHeaderRow: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (chain.length === 0) return null;

  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide supersession history" : "Show supersession history"}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground",
          "hover:bg-muted/40 w-full",
        )}
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} aria-hidden />
        <History className="h-3 w-3" aria-hidden />
        <span>
          {expanded ? "Hide history" : "Show history"} · {chain.length} prior version{chain.length === 1 ? "" : "s"}
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
              onJumpToHeaderRow={onJumpToHeaderRow}
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
  onAddCharge,
  onAddTax,
  onAddWithholding,
  onEdit,
  onReplace,
  onDelete,
  onJumpToHeaderRow,
  className,
}: PricingComponentWaterfallProps) {
  if (components.length === 0) return null;

  // Sort by sequence (load-bearing). Defensive — caller may already sort.
  const sorted = [...components].sort((a, b) => a.sequence - b.sequence);

  // Inclusive-tax sum — drives the footer "excludes ₹X inclusive tax"
  // caption when present. When zero the caption is suppressed.
  const inclusiveTaxAmount = computeInclusiveTaxAmount(sorted);
  const hasInclusiveTax = inclusiveTaxAmount > 0;

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      {/* Header row. Same column template as the body so cells align
          vertically across the table. Column widths (item 9):
            SEQ     3rem            — sequence number
            TERM    flex            — condition type label + chips
            ORIGIN  6rem            — Manual / Inherited / etc.
            BASIS   8rem            — "5% on net + charges" etc.
            AMOUNT  6rem right      — currency triad, right-aligned
            ⋯       auto            — row actions (unlabeled)            */}
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_6rem_8rem_6rem_4.5rem] items-center gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/40">
        <div>Seq</div>
        <div>Term</div>
        <div>Origin</div>
        <div>Basis</div>
        <div className="text-right">Amount</div>
        <div aria-hidden />
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
                onJumpToHeaderRow={onJumpToHeaderRow}
              />
            )}
          </div>
        ))}
      </div>

      {/* Footer:
            Left  — NET anchor with explanatory caption when ANY tax row
                    was inclusive ("excludes ₹X inclusive tax (already in
                    price)"). Without that caption a user looking at NET
                    might think we dropped tax from the math.
            Right — ghost-button CTAs to add a new component, grouped by
                    family. Hidden in non-edit affordances. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/40">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="text-muted-foreground">NET</span>
          <span className="font-medium tabular-nums text-foreground">
            <CurrencyTriad
              amount={lineNetAmount}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </span>
          {hasInclusiveTax && (
            <span className="text-muted-foreground italic">
              excludes{" "}
              <CurrencyTriad
                amount={inclusiveTaxAmount}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
                className="not-italic"
              />
              {" "}inclusive tax (already in price)
            </span>
          )}
        </div>
        {affordance === "edit" && (onAdd || onAddCharge || onAddTax || onAddWithholding) && (
          <div className="flex items-center gap-1.5">
            {onAdd && (
              <FooterCta label="Discount" onClick={onAdd} />
            )}
            {onAddCharge && (
              <FooterCta label="Charge" onClick={onAddCharge} />
            )}
            {onAddTax && (
              <FooterCta label="Tax" onClick={onAddTax} />
            )}
            {onAddWithholding && (
              <FooterCta label="Withholding" onClick={onAddWithholding} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Right-aligned add-something ghost button used in the footer. */
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

// Re-export for granular consumers that want to render bits in isolation.
export { OriginBadge as PricingComponentOriginBadge };
export type { ReactNode };
