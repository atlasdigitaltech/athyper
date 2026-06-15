/**
 * @athyper/content-ui — TaxDrawer (Add / Replace)
 *
 * Spec v1.1 §5.1 + §5.2. Writes pricing_component rows of
 * `term_type='tax'` (or 'withholding').
 *
 * Tax-specific concerns surfaced inline:
 *   • Tax group + Place of supply (Inter-state vs Intra-state)
 *   • Price treatment (Added on top vs Included in price)
 *   • Recoverability % with explicit recoverable/cost-of-goods split
 *   • Per-line tax preview when "All items" + per-line computation
 *
 * Per design plan §B4: place-of-supply should default from
 * invoice_party_snapshot + invoice_address_snapshot. The drawer
 * accepts a derived value and an `onPlaceOfSupplyOverride` callback
 * so the parent can decide override-confirmation policy.
 */
"use client";

import { useMemo, useState } from "react";
import { cn } from "@athyper/theme/utils";
import { DrawerFormShell } from "@athyper/ui/surfaces/shells";
import { CurrencyTriad } from "../../money/CurrencyTriad";
import {
  validatePcDraft,
  resolveBaseForCalculation,
  previewComputedAmount,
  type PcDraft,
  type ComputesOnMode,
} from "./helpers";
import {
  SectionLabel,
  SegmentedToggle,
  LockedHint,
  ReplacingBlock,
  SupersedeModeBanner,
  MaterialChangeWarning,
  ErrorList,
} from "./_shared";
import type {
  PricingComponent,
  PurchaseInvoiceLine,
  PiStatus,
} from "../../../purchase-invoice/types";

// ── Public types ──────────────────────────────────────────────────

export type TaxDrawerMode = "add" | "replace";

export interface TaxGroupOption {
  id: string;
  code: string;
  label: string;
  /** Default rate (e.g. 18 for GST 18%). */
  default_rate: number;
  /** When intra-state, breakdown into constituents. */
  intra_state_constituents?: ReadonlyArray<{ label: string; rate: number }>;
  /** Recoverability default (0–100). */
  default_recoverable_pct?: number;
  /** Tax section code (e.g. "194C" for India TDS). */
  default_section_code?: string;
}

/**
 * Cleanup-plan v5 §5.10 — jurisdiction profile for the tax drawer.
 *
 * Captures the jurisdiction's tax UX shape so per-tenant or per-document
 * profiles can swap behavior without forking the drawer. Examples:
 *   - "in_gst_standard": has place-of-supply (inter/intra), has
 *     CGST+SGST grouping, has recoverability + section codes
 *   - "us_sales_tax":    no place-of-supply toggle, no recoverability
 *   - "vat_eu":          inclusive/exclusive only, no place-of-supply
 *   - "none":            generic; show rate + recoverability only
 *
 * Wiring the drawer body to consume these flags lands in P2c.2;
 * this commit ships the API surface so consumers can start passing it.
 */
export interface TaxProfile {
  /** Stable code (e.g. "in_gst_standard"). */
  code: string;
  /** Whether to render the inter/intra-state toggle. */
  hasPlaceOfSupply: boolean;
  /** UI labels when hasPlaceOfSupply is true. */
  placeOfSupplyToggle?: { interLabel: string; intraLabel: string };
  /** Whether recoverable_pct is meaningful for this jurisdiction. */
  hasRecoverability: boolean;
  /** Whether tax_section_code is captured. */
  hasSectionCode: boolean;
  /** Helper-text hints for known section codes (e.g. ["194C","194J"]). */
  sectionCodeHints?: ReadonlyArray<string>;
}

export interface TaxDrawerProps {
  mode: TaxDrawerMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;

  piCode: string;
  piSupplierLabel: string;
  piStatus: PiStatus;

  lines: ReadonlyArray<PurchaseInvoiceLine>;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  invoiceNetAmount: number;

  /** Tax-specific lookup of available groups. */
  taxGroups: ReadonlyArray<TaxGroupOption>;

  /**
   * v5 §5.10 — jurisdiction profile. Drawer body wires up consumption
   * of these flags in P2c.2; absent profile = today's in_gst_standard
   * defaults.
   */
  taxProfile?: TaxProfile;

  /** Auto-derived place of supply from snapshots. */
  derivedPlaceOfSupply: "inter_state" | "intra_state";
  /** Caption for the derivation (e.g. "supplier MH, buyer KA"). */
  derivedPlaceCaption?: string;

  /** Replace mode requires the original. */
  replacingComponent?: PricingComponent;

  /** When this line already has a prior PC sum (drives computes-on math). */
  priorRunningSum?: number;

  onSubmit: (input: {
    draft: PcDraft;
    placeOfSupply: "inter_state" | "intra_state";
    placeOfSupplyOverridden: boolean;
    reason?: string;
    replacingId?: string;
  }) => Promise<void> | void;

  /** Materiality threshold for "may reset workflow" warning. */
  materialChangeThreshold?: number;
}

// ── Main component ─────────────────────────────────────────────────

export function TaxDrawer({
  mode,
  open,
  onOpenChange,
  piCode,
  piSupplierLabel,
  piStatus,
  lines,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  invoiceNetAmount,
  taxGroups,
  taxProfile,
  derivedPlaceOfSupply,
  derivedPlaceCaption,
  replacingComponent,
  priorRunningSum = 0,
  onSubmit,
  materialChangeThreshold = 100,
}: TaxDrawerProps) {
  const sourceComponent = mode === "replace" ? replacingComponent : null;

  // ── Local state ──────────────────────────────────────────────────
  const [applyTo, setApplyTo] = useState<"one_item" | "all_items">(
    sourceComponent?.source_line_id ? "one_item" : "all_items",
  );

  // v5 §5.10 — jurisdiction-aware behaviour wires here in P2c.2.
  // Today the body uses today's in_gst_standard defaults.
  void taxProfile;

  const defaultTaxGroup = sourceComponent?.tax_group_label
    ? taxGroups.find((g) => g.label === sourceComponent.tax_group_label) ?? taxGroups[0]
    : taxGroups[0];

  const [taxGroupId, setTaxGroupId] = useState<string>(defaultTaxGroup?.id ?? "");

  const [placeOfSupply, setPlaceOfSupply] = useState<"inter_state" | "intra_state">(derivedPlaceOfSupply);
  const placeOfSupplyOverridden = placeOfSupply !== derivedPlaceOfSupply;

  const [computesOn, setComputesOn] = useState<ComputesOnMode>("net_before_adjustments");

  const [priceTreatment, setPriceTreatment] = useState<"exclusive" | "inclusive">(
    sourceComponent?.is_inclusive ? "inclusive" : "exclusive",
  );

  const [recoverablePct, setRecoverablePct] = useState<string>(
    sourceComponent?.recoverable_pct != null
      ? String(sourceComponent.recoverable_pct)
      : (defaultTaxGroup?.default_recoverable_pct != null
          ? String(defaultTaxGroup.default_recoverable_pct)
          : "100"),
  );

  const [lineId, setLineId] = useState<string>(
    sourceComponent?.source_line_id ?? lines[0]?.id ?? "",
  );

  const [rateValueOverride, setRateValueOverride] = useState<string | null>(null);

  const [reason, setReason] = useState<string>("");

  // ── Derived values ───────────────────────────────────────────────
  const selectedTaxGroup = taxGroups.find((g) => g.id === taxGroupId);
  const effectiveRate = rateValueOverride !== null && rateValueOverride !== ""
    ? Number(rateValueOverride)
    : selectedTaxGroup?.default_rate ?? 0;

  const recoverablePctNum = recoverablePct !== "" ? Number(recoverablePct) : null;

  const selectedLine = lines.find((l) => l.id === lineId);
  const selectedLineNet = selectedLine?.net_amount ?? 0;

  // ── Inclusive/exclusive math ─────────────────────────────────────
  // For exclusive: tax_amount = base × rate / 100
  // For inclusive: tax_amount = base × rate / (100 + rate); taxable_net = base - tax
  function computeTaxOnBase(base: number): { tax: number; taxable_net: number } {
    if (priceTreatment === "exclusive") {
      const tax = round2((base * effectiveRate) / 100);
      return { tax, taxable_net: base };
    }
    const tax = round2((base * effectiveRate) / (100 + effectiveRate));
    return { tax, taxable_net: round2(base - tax) };
  }

  // Per-line computation (load-bearing for "All items" preview)
  const perLineTax = useMemo(() => {
    if (applyTo !== "all_items") return null;
    return lines.map((l) => {
      const base = resolveBaseForCalculation({
        lineNet: l.net_amount,
        priorSum: 0,
        mode: computesOn,
      });
      const { tax, taxable_net } = computeTaxOnBase(base);
      return { line: l, base, tax, taxable_net };
    });
  }, [applyTo, lines, computesOn, effectiveRate, priceTreatment]);

  const totalTax = applyTo === "all_items"
    ? perLineTax?.reduce((acc, r) => acc + r.tax, 0) ?? 0
    : computeTaxOnBase(
        resolveBaseForCalculation({
          lineNet: selectedLineNet,
          priorSum: priorRunningSum,
          mode: computesOn,
        }),
      ).tax;

  const totalTaxableNet = applyTo === "all_items"
    ? perLineTax?.reduce((acc, r) => acc + r.taxable_net, 0) ?? 0
    : computeTaxOnBase(
        resolveBaseForCalculation({
          lineNet: selectedLineNet,
          priorSum: priorRunningSum,
          mode: computesOn,
        }),
      ).taxable_net;

  // ── Recoverability split ─────────────────────────────────────────
  const recoverableAmount = recoverablePctNum != null
    ? round2((totalTax * recoverablePctNum) / 100)
    : 0;
  const costOfGoodsAmount = round2(totalTax - recoverableAmount);

  // ── Resolves-to chips ────────────────────────────────────────────
  const intraConstituents = selectedTaxGroup?.intra_state_constituents ?? [];

  // ── Lock matrix ──────────────────────────────────────────────────
  const locked = useMemo(() => ({
    applyTo: mode === "replace",
    taxGroup: mode === "replace",
    placeOfSupply: mode === "replace",
    priceTreatment: mode === "replace",
  }), [mode]);

  // ── Validation ───────────────────────────────────────────────────
  const draft: PcDraft = {
    term_type: "tax",
    basis: "percent",
    rate_value: effectiveRate,
    amount_value: null,
    tax_group_id: taxGroupId || null,
    is_inclusive: priceTreatment === "inclusive",
    recoverable_pct: recoverablePctNum,
    tax_section_code: selectedTaxGroup?.default_section_code ?? null,
    entry_level: applyTo === "all_items" ? "header" : "line",
    source_line_id: applyTo === "one_item" ? lineId || null : null,
    apportion_basis: null, // tax doesn't apportion — per-line compute
    condition_type_id: taxGroupId || null,
    sequence: sourceComponent?.sequence ?? 20,
  };

  const errors = validatePcDraft(draft);
  const reasonRequired = mode === "replace";
  if (reasonRequired && reason.trim() === "") {
    errors.push({ code: "REQUIRED", field: "condition_type_id", message: "Reason is required" });
  }
  const canSubmit = errors.length === 0 && totalTax > 0;

  // Material change (replace)
  const isReplace = mode === "replace" && replacingComponent != null;
  const replaceDelta = isReplace ? totalTax - replacingComponent.computed_amount : 0;
  const isMaterial = isReplace && Math.abs(replaceDelta) > materialChangeThreshold;

  // ── Submit ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        draft,
        placeOfSupply,
        placeOfSupplyOverridden,
        reason: reasonRequired ? reason : undefined,
        replacingId: mode === "replace" ? replacingComponent?.id : undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  const title = mode === "replace" ? "Replace tax" : "Add tax";
  const subtitle = `${piCode} · ${piSupplierLabel} · ${piStatus.replaceAll("_", " ")}`;
  const ctaLabel = mode === "replace" ? "Replace as v2" : "Add tax";

  const grossDelta = priceTreatment === "exclusive" ? totalTax : 0;

  return (
    <DrawerFormShell
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      contextBadge="PRICING COMPONENT"
      title={title}
      subtitle={subtitle}
      secondaryAction={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          Cancel
        </button>
      }
      primaryAction={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={cn(
            "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium",
            "bg-foreground text-background hover:opacity-90",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {submitting ? "Saving…" : ctaLabel}
        </button>
      }
      liveStatus={
        <div className="text-xs flex items-center gap-3">
          <span className="font-medium">
            Tax{" "}
            <CurrencyTriad
              amount={totalTax}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              signed
            />
          </span>
          {applyTo === "all_items" && perLineTax != null && (
            <span className="text-muted-foreground">
              · {perLineTax.length} tax components created · one per line
            </span>
          )}
          {placeOfSupplyOverridden && (
            <span className="text-warning">place-of-supply overridden</span>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 overflow-y-auto">
        {/* Supersede-mode banner */}
        {mode === "replace" && <SupersedeModeBanner />}

        {/* Replacing block */}
        {mode === "replace" && replacingComponent && (
          <ReplacingBlock
            component={replacingComponent}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        )}

        {/* Apply to */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Apply to</SectionLabel>
            {locked.applyTo && <LockedHint>scope cannot change across versions</LockedHint>}
          </div>
          <SegmentedToggle
            value={applyTo}
            options={[
              { value: "one_item",  label: "One item",  sublabel: "single line" },
              { value: "all_items", label: "All items", sublabel: "computes per line at the rate" },
            ]}
            onChange={setApplyTo}
            disabled={locked.applyTo}
            ariaLabel="Apply tax to"
          />
        </div>

        {/* Tax group + Place of supply */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Tax group</SectionLabel>
              {locked.taxGroup && <LockedHint>locked</LockedHint>}
            </div>
            <select
              value={taxGroupId}
              onChange={(e) => setTaxGroupId(e.target.value)}
              disabled={locked.taxGroup}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
            >
              {taxGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
            <div className="text-[11px] text-muted-foreground">
              Manual · inserts at seq {draft.sequence} — after discounts
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Place of supply</SectionLabel>
              {locked.placeOfSupply && <LockedHint>locked</LockedHint>}
            </div>
            <SegmentedToggle
              value={placeOfSupply}
              options={[
                { value: "inter_state", label: "Inter-state", sublabel: "IGST" },
                { value: "intra_state", label: "Intra-state", sublabel: "CGST + SGST" },
              ]}
              onChange={setPlaceOfSupply}
              disabled={locked.placeOfSupply}
              ariaLabel="Place of supply"
            />
            <div className="text-[11px] text-muted-foreground">
              Derived: {derivedPlaceOfSupply === "inter_state" ? "Inter-state" : "Intra-state"}
              {derivedPlaceCaption && ` (${derivedPlaceCaption})`}
              {placeOfSupplyOverridden && <span className="text-warning"> · overridden</span>}
            </div>
          </div>
        </div>

        {/* Resolves to (chips) */}
        {selectedTaxGroup && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Resolves to</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {placeOfSupply === "intra_state" && intraConstituents.length > 0 ? (
                intraConstituents.map((c, idx) => {
                  const constituentTax = round2((totalTaxableNet * c.rate) / 100);
                  return (
                    <div
                      key={idx}
                      className="rounded-md border border-info/40 bg-info/5 px-3 py-2 text-sm"
                    >
                      <div className="font-medium">{c.label} {c.rate}%</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        <CurrencyTriad
                          amount={constituentTax}
                          currencyCode={currencyCode}
                          baseCurrencyCode={baseCurrencyCode}
                          exchangeRate={exchangeRate}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-md border border-info/40 bg-info/5 px-3 py-2 text-sm">
                  <div className="font-medium">
                    {selectedTaxGroup.label.replace(/^GST/, "IGST")} {effectiveRate}%
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    <CurrencyTriad
                      amount={totalTax}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                  </div>
                </div>
              )}
            </div>
            {placeOfSupply === "intra_state" && intraConstituents.length > 0 && (
              <div className="text-[11px] text-muted-foreground italic">
                Computed on each line's net base — not a split of one amount.
                {perLineTax != null && ` ${perLineTax.length} PC rows created (one per line); resolves to ${intraConstituents.map((c) => c.label).join(" + ")} GL accounts via tax_group at posting.`}
              </div>
            )}
          </div>
        )}

        {/* Computes on + Price treatment */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Computes on</SectionLabel>
            <select
              value={computesOn}
              onChange={(e) => setComputesOn(e.target.value as ComputesOnMode)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="net_before_adjustments">Net (before adjustments)</option>
              <option value="running_after_prior">Running net (after prior sequence)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Price treatment</SectionLabel>
              {locked.priceTreatment && <LockedHint>locked</LockedHint>}
            </div>
            <SegmentedToggle
              value={priceTreatment}
              options={[
                { value: "exclusive", label: "Added on top",    sublabel: "exclusive" },
                { value: "inclusive", label: "Included in price", sublabel: "inclusive" },
              ]}
              onChange={setPriceTreatment}
              disabled={locked.priceTreatment}
              ariaLabel="Price treatment"
            />
          </div>
        </div>

        {/* Inclusive callout */}
        {priceTreatment === "inclusive" && totalTax > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
            Tax is already inside the price.{" "}
            <CurrencyTriad
              amount={totalTax}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              className="not-italic"
            />{" "}
            is backed out as tax; taxable net is{" "}
            <CurrencyTriad
              amount={totalTaxableNet}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              className="not-italic"
            />. Gross is unchanged.
          </div>
        )}

        {priceTreatment === "exclusive" && totalTax > 0 && (
          <div className="rounded-md border border-info/40 bg-info/5 p-3 text-xs">
            Tax is added on top of the base — raises gross by{" "}
            <CurrencyTriad
              amount={grossDelta}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              className="not-italic"
            />.
          </div>
        )}

        {/* Recoverability */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>Recoverable (input credit)</SectionLabel>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="1"
              min="0"
              max="100"
              value={recoverablePct}
              onChange={(e) => setRecoverablePct(e.target.value)}
              className="w-32 rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
              aria-label="Recoverable percent"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          {totalTax > 0 && recoverablePctNum != null && (
            <div className="flex flex-col gap-1 text-xs">
              {recoverableAmount > 0 && (
                <div className="inline-flex items-center gap-2">
                  <span className="text-success">Recoverable</span>
                  <span className="text-muted-foreground">→ 1310 Input tax (recoverable)</span>
                  <span className="text-muted-foreground">{recoverablePctNum}%</span>
                  <span className="tabular-nums font-medium ml-auto">
                    <CurrencyTriad
                      amount={recoverableAmount}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                  </span>
                </div>
              )}
              {costOfGoodsAmount > 0 && (
                <div className="inline-flex items-center gap-2">
                  <span className="text-warning">Cost of goods</span>
                  <span className="text-muted-foreground">→ 6200 Tax (non-recoverable)</span>
                  <span className="text-muted-foreground">{100 - recoverablePctNum}%</span>
                  <span className="tabular-nums font-medium ml-auto">
                    <CurrencyTriad
                      amount={costOfGoodsAmount}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* One-item line picker */}
        {applyTo === "one_item" && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Line</SectionLabel>
            <select
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>Line {l.line_no} · {l.item_description}</option>
              ))}
            </select>
          </div>
        )}

        {/* All-items per-line table */}
        {applyTo === "all_items" && perLineTax != null && perLineTax.length > 0 && (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border bg-muted/40">
              Per-line tax
            </div>
            <div className="grid grid-cols-[3rem_1fr_auto_auto_auto] gap-3 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border/40">
              <div>Line</div>
              <div>Item</div>
              <div className="text-right">Base</div>
              <div className="text-right">Rate</div>
              <div className="text-right">Tax</div>
            </div>
            {perLineTax.map(({ line, base, tax }) => (
              <div key={line.id} className="grid grid-cols-[3rem_1fr_auto_auto_auto] gap-3 px-3 py-1.5 text-xs border-b border-border/40 last:border-b-0">
                <div className="tabular-nums">{line.line_no}</div>
                <div className="truncate">{line.item_description}</div>
                <div className="tabular-nums text-right">
                  <CurrencyTriad
                    amount={base}
                    currencyCode={currencyCode}
                    baseCurrencyCode={baseCurrencyCode}
                    exchangeRate={exchangeRate}
                  />
                </div>
                <div className="tabular-nums text-right">{effectiveRate}%</div>
                <div className="tabular-nums text-right text-success">
                  <CurrencyTriad
                    amount={tax}
                    currencyCode={currencyCode}
                    baseCurrencyCode={baseCurrencyCode}
                    exchangeRate={exchangeRate}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reason (replace) */}
        {mode === "replace" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Reason for replacement</SectionLabel>
              <span className="text-[11px] text-error">required</span>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Rate correction per supplier credit note"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm resize-y"
            />
            <div className="text-[11px] text-muted-foreground">
              Reason attaches to v2.metadata.replacement_reason
            </div>
          </div>
        )}

        {/* Changes diff (replace) */}
        {isReplace && replacingComponent && (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border bg-muted/40">
              Changes
            </div>
            <div className="px-3 py-2 grid grid-cols-3 gap-2 text-xs">
              <div className="text-muted-foreground">Amount</div>
              <div className="tabular-nums">
                <CurrencyTriad
                  amount={replacingComponent.computed_amount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
                {" → "}
                <CurrencyTriad
                  amount={totalTax}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
              </div>
              <div className="tabular-nums text-right">
                Δ <CurrencyTriad
                  amount={replaceDelta}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
              </div>
            </div>
            {isMaterial && <MaterialChangeWarning threshold={materialChangeThreshold} />}
          </div>
        )}

        {/* Errors */}
        <ErrorList messages={errors.map((e) => e.message)} />
      </div>
    </DrawerFormShell>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
