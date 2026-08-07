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
 * Per design plan B4: place-of-supply defaults from document header fields
 * and live master address joins. The drawer accepts a derived value and an
 * `onPlaceOfSupplyOverride` callback so the parent can decide
 * override-confirmation policy.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { DrawerFormShell } from "@athyper/platform-ui/surfaces/shells";
import { CurrencyTriad } from "../../money/currency-triad";
import { MoneySummaryStrip } from "../money-summary-strip";
import {
  validatePcDraft,
  type PcDraft,
} from "./helpers";
import {
  SectionLabel,
  SegmentedToggle,
  LockedHint,
  ReplacingBlock,
  SupersedeModeBanner,
  MaterialChangeWarning,
  ErrorList,
  FieldError,
  PricingImpactPreview,
  PricingImpactRow,
  PricingDocumentScopeCard,
  PricingScopeCard,
  formatDrawerSubtitle,
  segmentedFieldLabel,
  DEFAULT_APPLY_TO_FIELD,
  type SegmentedFieldContract,
} from "./_shared";
import type {
  PricingComponent,
  PurchaseInvoiceLine,
  PiStatus,
} from "../../../purchase-invoice/types";

// ── Public types ──────────────────────────────────────────────────

export type TaxDrawerMode = "add" | "edit" | "replace";
type TaxableBaseMode =
  | "line_net"
  | "after_discounts"
  | "charges_only"
  | "after_discounts_plus_charges"
  | "manual_amount";

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
  /** Pricing-component condition type written to condition_type_id. */
  conditionTypeId?: string;
  /** Default sequence for new tax rows. */
  conditionTypeSequence?: number;

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
  /** Active pricing components for the relevant document/line scope. */
  components?: ReadonlyArray<PricingComponent>;

  /** When this line already has a prior PC sum (drives computes-on math). */
  priorRunningSum?: number;
  /** Add-mode defaults, used when opening from a line/header affordance. */
  initialApplyTo?: "one_item" | "all_items";
  initialLineId?: string;
  /** Metadata contract for the Apply-to segmented control. */
  applyToField?: SegmentedFieldContract;

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
  conditionTypeId,
  conditionTypeSequence,
  taxProfile,
  derivedPlaceOfSupply,
  replacingComponent,
  components = [],
  priorRunningSum = 0,
  initialApplyTo,
  initialLineId,
  applyToField = DEFAULT_APPLY_TO_FIELD,
  onSubmit,
  materialChangeThreshold = 100,
}: TaxDrawerProps) {
  const isEditingExisting = mode === "edit" || mode === "replace";
  const sourceComponent = isEditingExisting ? replacingComponent : null;

  // ── Local state ──────────────────────────────────────────────────
  const [applyTo, setApplyTo] = useState<"one_item" | "all_items">(
    sourceComponent?.source_line_id ? "one_item" : initialApplyTo ?? "all_items",
  );

  // v5 §5.10 — jurisdiction-aware behaviour wires here in P2c.2.
  // Today the body uses today's in_gst_standard defaults.
  void taxProfile;

  const defaultTaxGroup = sourceComponent?.tax_group_label
    ? taxGroups.find((g) => g.label === sourceComponent.tax_group_label) ?? taxGroups[0]
    : taxGroups[0];

  const [taxGroupId, setTaxGroupId] = useState<string>(defaultTaxGroup?.id ?? "");

  const placeOfSupply = derivedPlaceOfSupply;
  const placeOfSupplyOverridden = false;
  void priorRunningSum;

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
    sourceComponent?.source_line_id ?? initialLineId ?? lines[0]?.id ?? "",
  );

  const [rateValueOverride, setRateValueOverride] = useState<string | null>(
    sourceComponent?.rate_value != null ? String(sourceComponent.rate_value) : null,
  );
  const [taxableBaseMode, setTaxableBaseMode] = useState<TaxableBaseMode>(() =>
    readTaxableBaseMode(sourceComponent) ?? "line_net",
  );
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(() =>
    new Set(readTaxableBaseChargeIds(sourceComponent)),
  );
  const [manualTaxableAmount, setManualTaxableAmount] = useState<string>(() =>
    readManualTaxableAmount(sourceComponent),
  );

  const [reason, setReason] = useState<string>("");
  useEffect(() => {
    if (!open) return;
    const nextApplyTo: "one_item" | "all_items" =
      sourceComponent?.source_line_id ? "one_item" : initialApplyTo ?? "all_items";
    const nextTaxGroup = sourceComponent?.tax_group_label
      ? taxGroups.find((g) => g.label === sourceComponent.tax_group_label) ?? taxGroups[0]
      : taxGroups[0];

    setApplyTo(nextApplyTo);
    setTaxGroupId(nextTaxGroup?.id ?? "");
    setPriceTreatment(sourceComponent?.is_inclusive ? "inclusive" : "exclusive");
    setRecoverablePct(
      sourceComponent?.recoverable_pct != null
        ? String(sourceComponent.recoverable_pct)
        : nextTaxGroup?.default_recoverable_pct != null
          ? String(nextTaxGroup.default_recoverable_pct)
          : "100",
    );
    setLineId(sourceComponent?.source_line_id ?? initialLineId ?? lines[0]?.id ?? "");
    setRateValueOverride(sourceComponent?.rate_value != null ? String(sourceComponent.rate_value) : null);
    setTaxableBaseMode(readTaxableBaseMode(sourceComponent) ?? "line_net");
    setSelectedChargeIds(new Set(readTaxableBaseChargeIds(sourceComponent)));
    setManualTaxableAmount(readManualTaxableAmount(sourceComponent));
    setReason("");
  }, [
    derivedPlaceOfSupply,
    initialApplyTo,
    initialLineId,
    lines,
    open,
    sourceComponent,
    taxGroups,
  ]);

  // ── Derived values ───────────────────────────────────────────────
  const selectedTaxGroup = taxGroups.find((g) => g.id === taxGroupId);
  const effectiveRate = rateValueOverride !== null && rateValueOverride !== ""
    ? Number(rateValueOverride)
    : sourceComponent?.rate_value ?? selectedTaxGroup?.default_rate ?? 0;

  const recoverablePctNum = recoverablePct !== "" ? Number(recoverablePct) : null;

  const selectedLine = lines.find((l) => l.id === lineId);
  const selectedLineNet = selectedLine?.net_amount ?? 0;
  const taxSequence = sourceComponent?.sequence ?? conditionTypeSequence ?? 20;

  const chargeCandidates = useMemo(() => {
    return components
      .filter((component) =>
        component.term_type === "charge" &&
        component.superseded_by_id == null &&
        component.source_line_id != null &&
        component.id !== sourceComponent?.id
      )
      .sort((a, b) => a.sequence - b.sequence || a.condition_type_label.localeCompare(b.condition_type_label));
  }, [components, sourceComponent?.id]);

  const discountByLineId = useMemo(() => {
    const map = new Map<string, number>();
    for (const component of components) {
      if (component.term_type !== "discount") continue;
      if (component.superseded_by_id != null) continue;
      if (component.sequence >= taxSequence) continue;
      if (!component.source_line_id) continue;
      map.set(
        component.source_line_id,
        round2((map.get(component.source_line_id) ?? 0) + component.computed_amount),
      );
    }
    return map;
  }, [components, taxSequence]);

  const totalPriorDiscounts = useMemo(
    () => Array.from(discountByLineId.values()).reduce((sum, amount) => round2(sum + amount), 0),
    [discountByLineId],
  );
  const selectedLinePriorDiscount = lineId ? discountByLineId.get(lineId) ?? 0 : 0;
  const selectedCharges = useMemo(
    () => chargeCandidates.filter((component) => selectedChargeIds.has(component.id)),
    [chargeCandidates, selectedChargeIds],
  );
  const chargeByLineId = useMemo(() => {
    const map = new Map<string, number>();
    for (const component of selectedCharges) {
      if (!component.source_line_id) continue;
      map.set(
        component.source_line_id,
        round2((map.get(component.source_line_id) ?? 0) + component.computed_amount),
      );
    }
    return map;
  }, [selectedCharges]);
  const totalSelectedCharges = useMemo(
    () => selectedCharges.reduce((sum, component) => round2(sum + component.computed_amount), 0),
    [selectedCharges],
  );
  const selectedLineCharges = lineId ? chargeByLineId.get(lineId) ?? 0 : 0;
  const hasPriorDiscounts = applyTo === "all_items"
    ? totalPriorDiscounts > 0
    : selectedLinePriorDiscount > 0;
  const hasChargeCandidates = chargeCandidates.length > 0;
  const hasSelectedCharges = applyTo === "all_items"
    ? totalSelectedCharges > 0
    : selectedLineCharges > 0;
  const usesChargesInTaxableBase =
    taxableBaseMode === "charges_only" || taxableBaseMode === "after_discounts_plus_charges";

  useEffect(() => {
    if (!open) return;
    if (readTaxableBaseMode(sourceComponent)) return;
    setTaxableBaseMode(hasPriorDiscounts ? "after_discounts" : "line_net");
  }, [hasPriorDiscounts, open, sourceComponent]);

  useEffect(() => {
    if (!open) return;
    if (!usesChargesInTaxableBase) return;
    if (selectedChargeIds.size > 0) return;
    setSelectedChargeIds(new Set(chargeCandidates.map((component) => component.id)));
  }, [chargeCandidates, open, selectedChargeIds.size, usesChargesInTaxableBase]);

  function taxableBaseForLine(line: PurchaseInvoiceLine): number {
    const priorDiscount = discountByLineId.get(line.id) ?? 0;
    const chargeAmount = chargeByLineId.get(line.id) ?? 0;
    const manualAmount = parseOptionalPositiveNumber(manualTaxableAmount) ?? 0;
    switch (taxableBaseMode) {
      case "line_net":
        return line.net_amount;
      case "after_discounts":
        return Math.max(0, round2(line.net_amount - priorDiscount));
      case "charges_only":
        return Math.max(0, round2(chargeAmount));
      case "after_discounts_plus_charges":
        return Math.max(0, round2(line.net_amount - priorDiscount + chargeAmount));
      case "manual_amount":
        return Math.max(0, round2(manualAmount));
    }
  }

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
      const base = taxableBaseForLine(l);
      const { tax, taxable_net } = computeTaxOnBase(base);
      return { line: l, base, tax, taxable_net };
    });
  }, [applyTo, lines, effectiveRate, priceTreatment, taxableBaseMode, discountByLineId]);

  const selectedTaxableBase = selectedLine ? taxableBaseForLine(selectedLine) : 0;

  const totalTax = applyTo === "all_items"
    ? perLineTax?.reduce((acc, r) => acc + r.tax, 0) ?? 0
    : computeTaxOnBase(selectedTaxableBase).tax;

  const totalTaxableNet = applyTo === "all_items"
    ? perLineTax?.reduce((acc, r) => acc + r.taxable_net, 0) ?? 0
    : computeTaxOnBase(selectedTaxableBase).taxable_net;

  // ── Recoverability split ─────────────────────────────────────────
  const recoverableAmount = recoverablePctNum != null
    ? round2((totalTax * recoverablePctNum) / 100)
    : 0;
  const costOfGoodsAmount = round2(totalTax - recoverableAmount);
  const taxBaseAmount = applyTo === "all_items"
    ? perLineTax?.reduce((acc, r) => round2(acc + r.base), 0) ?? 0
    : selectedTaxableBase;
  const lineNetTaxBase = applyTo === "all_items" ? invoiceNetAmount : selectedLineNet;
  const afterDiscountTaxBase = Math.max(
    0,
    round2(lineNetTaxBase - (applyTo === "all_items" ? totalPriorDiscounts : selectedLinePriorDiscount)),
  );
  const chargesOnlyTaxBase = applyTo === "all_items" ? totalSelectedCharges : selectedLineCharges;
  const afterDiscountPlusChargesTaxBase = Math.max(0, round2(afterDiscountTaxBase + chargesOnlyTaxBase));
  const manualTaxableAmountNum = parseOptionalPositiveNumber(manualTaxableAmount);
  const manualBaseSourceAmount = afterDiscountPlusChargesTaxBase > 0
    ? afterDiscountPlusChargesTaxBase
    : lineNetTaxBase;
  const manualTaxablePct = manualTaxableAmountNum != null && manualBaseSourceAmount > 0
    ? round2((manualTaxableAmountNum / manualBaseSourceAmount) * 100)
    : null;
  const scopeNetAmount = applyTo === "all_items" ? invoiceNetAmount : selectedLineNet;
  const projectedGrossAmount = scopeNetAmount + (priceTreatment === "exclusive" ? totalTax : 0);
  const rateError = effectiveRate <= 0 ? "Rate must be greater than 0." : null;
  const intraConstituents = selectedTaxGroup?.intra_state_constituents ?? [];

  const locksAddToInitialLine = mode === "add" && initialApplyTo === "one_item" && Boolean(initialLineId);
  const locksExistingLineScope = mode === "edit" && sourceComponent?.entry_level === "line";
  const locksExistingHeaderScope = mode === "edit" && sourceComponent?.entry_level === "header";
  const showLockedLineScope = locksAddToInitialLine || locksExistingLineScope;
  const showLockedHeaderScope = locksExistingHeaderScope;
  const showScopeSelector = !showLockedLineScope && !showLockedHeaderScope;

  // ── Lock matrix ──────────────────────────────────────────────────
  const locked = useMemo(() => ({
    applyTo: mode === "replace" || showLockedLineScope || showLockedHeaderScope,
    taxGroup: mode === "replace",
    priceTreatment: mode === "replace",
    linePicker: showLockedLineScope,
  }), [mode, showLockedHeaderScope, showLockedLineScope]);

  // ── Validation ───────────────────────────────────────────────────
  const draft: PcDraft = {
    term_type: "tax",
    basis: "percent",
    rate_value: effectiveRate,
    amount_value: null,
    base_for_calculation: taxBaseAmount,
    tax_group_id: taxGroupId || null,
    is_inclusive: priceTreatment === "inclusive",
    recoverable_pct: recoverablePctNum,
    tax_section_code: selectedTaxGroup?.default_section_code ?? null,
    entry_level: applyTo === "all_items" ? "header" : "line",
    source_line_id: applyTo === "one_item" ? lineId || null : null,
    apportion_basis: applyTo === "all_items" ? "value" : null,
    condition_type_id: conditionTypeId || taxGroupId || null,
    sequence: taxSequence,
    metadata: {
      ...(sourceComponent?.metadata ?? {}),
      taxable_base_mode: taxableBaseMode,
      taxable_base_amount: taxBaseAmount,
      taxable_base_charge_ids: Array.from(selectedChargeIds),
      taxable_base_source_amount: taxableBaseMode === "manual_amount" ? manualBaseSourceAmount : undefined,
      taxable_base_manual_pct: taxableBaseMode === "manual_amount" ? manualTaxablePct : undefined,
    },
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
        replacingId: isEditingExisting ? replacingComponent?.id : undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  const title = mode === "replace" ? "Replace tax"
              : mode === "edit" ? "Edit tax"
              : locksAddToInitialLine ? "Add tax to line"
              : "Add tax";
  const subtitle = formatDrawerSubtitle({
    documentCode: piCode,
    counterpartyLabel: piSupplierLabel,
    status: piStatus,
  });
  const ctaLabel = mode === "replace" ? "Replace as v2"
                 : mode === "edit" ? "Save changes"
                 : "Add tax";

  const grossDelta = priceTreatment === "exclusive" ? totalTax : 0;

  return (
    <DrawerFormShell
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      defaultWidth="70vw"
      contextBadge="Pricing component"
      title={title}
      subtitle={subtitle}
      secondaryAction={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex items-center rounded-md border border-border px-4 text-sm font-normal text-foreground hover:bg-muted/60"
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
            "inline-flex items-center rounded-md px-4 text-sm font-semibold",
            "bg-foreground text-background hover:opacity-90",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {submitting ? "Saving…" : ctaLabel}
        </button>
      }
      liveStatus={
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-normal text-muted-foreground">
          <MoneySummaryStrip metrics={[
            { label: "Tax", amount: totalTax, currencyCode },
            { label: "Taxable Base", amount: totalTaxableNet, currencyCode },
            { label: "Gross Amount", amount: totalTaxableNet + grossDelta, currencyCode, emphasized: true },
          ]} />
          {applyTo === "all_items" && perLineTax != null && (
            <span className="text-muted-foreground">
              · {perLineTax.length} tax components created · one per line
            </span>
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

        {showLockedLineScope && (
          <PricingScopeCard
            lineNo={selectedLine?.line_no}
            description={selectedLine?.item_description}
            netAmount={selectedLineNet}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        )}

        {showLockedHeaderScope && (
          <PricingDocumentScopeCard
            lineCount={lines.length}
            netAmount={invoiceNetAmount}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        )}

        {/* Apply to */}
        {showScopeSelector && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>{segmentedFieldLabel(applyToField, "Apply to")}</SectionLabel>
              {locked.applyTo && <LockedHint>scope cannot change across versions</LockedHint>}
            </div>
            <SegmentedToggle
              value={applyTo}
              options={[
                { value: "all_items", label: "All lines", sublabel: "One tax per line" },
                { value: "one_item",  label: "One line",  sublabel: "Apply to one selected line" },
              ]}
              onChange={setApplyTo}
              disabled={locked.applyTo}
              ariaLabel="Apply tax to"
              field={applyToField}
            />
          </div>
        )}

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
            <div className="text-sm font-normal text-muted-foreground">
              Manual tax component
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="hidden">
              <SectionLabel>{null}</SectionLabel>
              {false && <LockedHint>locked</LockedHint>}
            </div>
            <SegmentedToggle
              value={placeOfSupply}
              options={[
                { value: "inter_state", label: "Inter-state", sublabel: "IGST" },
                { value: "intra_state", label: "Intra-state", sublabel: "CGST + SGST" },
              ]}
              onChange={() => undefined}
              disabled
              ariaLabel="Place of supply"
              className="hidden"
            />
            <div className="hidden">
              Derived: {derivedPlaceOfSupply === "inter_state" ? "Inter-state" : "Intra-state"}
              {placeOfSupplyOverridden && <span className="text-warning"> · overridden</span>}
            </div>
            <SectionLabel>Rate</SectionLabel>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={rateValueOverride ?? ""}
                onChange={(e) => setRateValueOverride(e.target.value)}
                placeholder={String(selectedTaxGroup?.default_rate ?? 0)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                aria-label="Tax rate"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <FieldError>{rateError}</FieldError>
          </div>
        </div>

        {/* Resolves to (chips) */}
        {false && selectedTaxGroup && (
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
                    {selectedTaxGroup?.label.replace(/^GST/, "IGST")} {effectiveRate}%
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
              <div className="text-sm font-normal text-muted-foreground italic">
                Computed on each line's net base — not a split of one amount.
                {perLineTax != null ? ` ${(perLineTax ?? []).length} PC rows created (one per line); resolves to ${intraConstituents.map((c) => c.label).join(" + ")} GL accounts via tax_group at posting.` : null}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="hidden">
            <SectionLabel>Rate</SectionLabel>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={rateValueOverride ?? ""}
                onChange={(e) => setRateValueOverride(e.target.value)}
                placeholder={String(selectedTaxGroup?.default_rate ?? 0)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                aria-label="Tax rate"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <FieldError>{rateError}</FieldError>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <SectionLabel>Taxable base</SectionLabel>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-1">
            <TaxableBaseOption
              selected={taxableBaseMode === "line_net"}
              label="Line net"
              amount={lineNetTaxBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              onClick={() => setTaxableBaseMode("line_net")}
            />
            <TaxableBaseOption
              selected={taxableBaseMode === "after_discounts"}
              label={applyTo === "all_items" ? "After line discounts" : "After discounts"}
              amount={afterDiscountTaxBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              disabled={!hasPriorDiscounts}
              onClick={() => setTaxableBaseMode("after_discounts")}
            />
            <TaxableBaseOption
              selected={taxableBaseMode === "charges_only"}
              label="Charges only"
              amount={chargesOnlyTaxBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              disabled={!hasChargeCandidates}
              onClick={() => setTaxableBaseMode("charges_only")}
            />
            <TaxableBaseOption
              selected={taxableBaseMode === "after_discounts_plus_charges"}
              label="After discounts and charges"
              amount={afterDiscountPlusChargesTaxBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              disabled={!hasPriorDiscounts && !hasChargeCandidates}
              onClick={() => setTaxableBaseMode("after_discounts_plus_charges")}
            />
            <TaxableBaseOption
              selected={taxableBaseMode === "manual_amount"}
              label="Custom amount"
              amount={manualTaxableAmountNum ?? 0}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              onClick={() => {
                setTaxableBaseMode("manual_amount");
                if (manualTaxableAmount.trim() === "") {
                  setManualTaxableAmount(String(round2(manualBaseSourceAmount)));
                }
              }}
            />
          </div>
          {taxableBaseMode === "manual_amount" && (
            <div className="rounded-md border border-border bg-card p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>Taxable amount</SectionLabel>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={manualTaxableAmount}
                    onChange={(event) => setManualTaxableAmount(event.target.value)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                    aria-label="Taxable amount"
                  />
                </div>
                <div className="flex items-end pb-2 text-xs text-muted-foreground">
                  {currencyCode}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">Quick set</span>
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setManualTaxableAmount(String(round2((manualBaseSourceAmount * pct) / 100)))}
                    className={cn(
                      "rounded-md border border-border px-2.5 py-1 text-xs font-medium",
                      "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {pct === 100 ? "Full" : `${pct}%`}
                  </button>
                ))}
                {manualTaxablePct != null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {manualTaxablePct}% of current base
                  </span>
                )}
              </div>
            </div>
          )}
          {usesChargesInTaxableBase && (
            <div className="rounded-md border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-semibold text-muted-foreground">Included charges</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <CurrencyTriad
                    amount={chargesOnlyTaxBase}
                    currencyCode={currencyCode}
                    baseCurrencyCode={baseCurrencyCode}
                    exchangeRate={exchangeRate}
                  />
                </span>
              </div>
              {chargeCandidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No charge components are available for this scope.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {chargeCandidates.map((component) => {
                    const checked = selectedChargeIds.has(component.id);
                    return (
                      <label
                        key={component.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm",
                          "hover:bg-muted/50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = new Set(selectedChargeIds);
                            if (event.target.checked) next.add(component.id);
                            else next.delete(component.id);
                            setSelectedChargeIds(next);
                          }}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="min-w-10 text-xs tabular-nums text-muted-foreground">
                          {component.sequence}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {component.condition_type_label || component.condition_type_code || "Charge"}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          <CurrencyTriad
                            amount={component.computed_amount}
                            currencyCode={currencyCode}
                            baseCurrencyCode={baseCurrencyCode}
                            exchangeRate={exchangeRate}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Tax treatment</SectionLabel>
              {locked.priceTreatment && <LockedHint>locked</LockedHint>}
            </div>
            <SegmentedToggle
              value={priceTreatment}
              options={[
                { value: "exclusive", label: "Added on top", sublabel: "Increases the gross amount" },
                { value: "inclusive", label: "Included in price", sublabel: "Already included in the amount" },
              ]}
              onChange={setPriceTreatment}
              disabled={locked.priceTreatment}
              ariaLabel="Tax treatment"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Input credit recoverable</SectionLabel>
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
        <div className="hidden">
          <SectionLabel>Input credit recoverable</SectionLabel>
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

        <PricingImpactPreview
          note={
            priceTreatment === "inclusive"
              ? "Tax is backed out of the price, so gross is unchanged."
              : "Tax is added on top of the selected scope."
          }
        >
          <PricingImpactRow label="Taxable base">
            <CurrencyTriad
              amount={taxBaseAmount}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </PricingImpactRow>
          <PricingImpactRow label="Tax" tone="warning">
            <CurrencyTriad
              amount={totalTax}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              signed
            />
          </PricingImpactRow>
          <PricingImpactRow label={priceTreatment === "inclusive" ? "Gross" : "Projected gross"}>
            <CurrencyTriad
              amount={projectedGrossAmount}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </PricingImpactRow>
        </PricingImpactPreview>

        {/* One-item line picker */}
        {applyTo === "one_item" && !showLockedLineScope && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Line</SectionLabel>
              {locked.linePicker && <LockedHint>locked to opened line</LockedHint>}
            </div>
            <select
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              disabled={locked.linePicker}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
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
            <div className="px-3 py-1.5 text-sm font-semibold text-muted-foreground border-b border-border bg-muted/40">
              Per-line tax
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[38rem] grid-cols-[3rem_minmax(10rem,1fr)_8rem_4rem_8rem] gap-2 px-3 py-1.5 text-sm font-semibold text-muted-foreground border-b border-border/40">
                <div>Line</div>
                <div>Item</div>
                <div className="text-right">Base</div>
                <div className="text-right">Rate</div>
                <div className="text-right">Tax</div>
              </div>
              {perLineTax.map(({ line, base, tax }) => (
                <div key={line.id} className="grid min-w-[38rem] grid-cols-[3rem_minmax(10rem,1fr)_8rem_4rem_8rem] gap-2 px-3 py-1.5 text-xs border-b border-border/40 last:border-b-0">
                  <div className="tabular-nums">{line.line_no}</div>
                  <div className="min-w-0 truncate">{line.item_description}</div>
                  <div className="whitespace-nowrap tabular-nums text-right">
                    <CurrencyTriad
                      amount={base}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                    />
                  </div>
                  <div className="whitespace-nowrap tabular-nums text-right">{effectiveRate}%</div>
                  <div className="whitespace-nowrap tabular-nums text-right text-success">
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
          </div>
        )}

        {/* Reason (replace) */}
        {mode === "replace" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Reason for replacement</SectionLabel>
              <span className="text-sm font-medium text-destructive">required</span>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Rate correction per supplier credit note"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm resize-y"
            />
            <div className="text-sm font-normal text-muted-foreground">
              Reason attaches to v2.metadata.replacement_reason
            </div>
          </div>
        )}

        {/* Changes diff (replace) */}
        {isReplace && replacingComponent && (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="px-3 py-1.5 text-sm font-semibold text-muted-foreground border-b border-border bg-muted/40">
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

function readTaxableBaseMode(component: PricingComponent | null | undefined): TaxableBaseMode | null {
  const value = component?.metadata?.["taxable_base_mode"];
  return value === "line_net" ||
    value === "after_discounts" ||
    value === "charges_only" ||
    value === "after_discounts_plus_charges" ||
    value === "manual_amount"
    ? value
    : null;
}

function readTaxableBaseChargeIds(component: PricingComponent | null | undefined): string[] {
  const value = component?.metadata?.["taxable_base_charge_ids"];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readManualTaxableAmount(component: PricingComponent | null | undefined): string {
  const metadataAmount = component?.metadata?.["taxable_base_amount"];
  if (typeof metadataAmount === "number" && Number.isFinite(metadataAmount)) {
    return String(metadataAmount);
  }
  if (typeof metadataAmount === "string" && metadataAmount.trim().length > 0) {
    return metadataAmount;
  }
  return component?.base_for_calculation != null ? String(component.base_for_calculation) : "";
}

function parseOptionalPositiveNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function TaxableBaseOption({
  selected,
  label,
  amount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  disabled = false,
  onClick,
}: {
  selected: boolean;
  label: string;
  amount: number;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-14 rounded-md border px-3 py-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-border bg-card shadow-sm"
          : "border-transparent bg-transparent hover:bg-card/70",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
      aria-pressed={selected}
    >
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
        <CurrencyTriad
          amount={amount}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
      </span>
    </button>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
