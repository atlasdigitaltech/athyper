/**
 * @athyper/content-ui — WhtDrawer (Add / Replace)
 *
 * WS-C — captures `pricing_component` rows of `term_type='withholding'`.
 *
 * Forked from TaxDrawer.tsx but trimmed to WHT-relevant fields:
 *   • No place-of-supply toggle (WHT is jurisdiction-implicit via tax_group).
 *   • No inclusive/exclusive toggle (WHT is always exclusive).
 *   • No recoverable% input (WHT is not an input credit; server enforces 0).
 *   • No CGST/SGST constituents (WHT groups have one component).
 *
 * Adds:
 *   • Section-code input (TDS 194C, BIR ATC, etc.). Required when the
 *     selected group's jurisdiction has wht_section_required=true.
 *   • Read-only `wht_basis` chip ("Calculated on: Gross / Net of GST /
 *     Payment-time") — derived from the rate schedule; not user-editable.
 *   • Metadata snapshot (D8) built at submit-time from the chosen group's
 *     rate schedule so server pc_wht_metadata_snapshot_chk passes.
 *
 * Server is authoritative: WhtDrawer fails fast on local invariants but the
 * authoritative gate is pricing-component.service.ts validateWhtInput().
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
  type ComputesOnMode,
} from "./helpers";
import {
  SectionLabel,
  SegmentedToggle,
  LockedHint,
  ReplacingBlock,
  SupersedeModeBanner,
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

export type WhtDrawerMode = "add" | "edit" | "replace";
type WithholdingBaseMode =
  | "line_net"
  | "after_discounts"
  | "charges_only"
  | "after_discounts_plus_charges"
  | "manual_amount";

/**
 * Option shape for the WHT group selector. A "WHT group" is a tax_group
 * whose components reference rate schedules with non-null wht_basis. The
 * resolver lives server-side; the drawer just renders what it's given.
 */
export interface WhtGroupOption {
  id:                       string;
  code:                     string;
  label:                    string;
  jurisdiction_id:          string | null;
  jurisdiction_label?:      string;
  /** Default rate (e.g. 2.0 for IN-TDS 194C 2%). */
  default_rate:             number;
  /** Per the rate-schedule wht_basis enum. */
  wht_basis:                "GROSS" | "NET_OF_INDIRECT_TAX" | "PAYMENT_ONLY";
  /**
   * Authoritative rate-schedule identifier captured into the PC metadata
   * snapshot so historical determinations stay stable (D8).
   */
  rate_schedule_id:         string;
  /** Default section code (e.g. "194C" for TDS); used as form default. */
  default_section_code?:    string;
  /** If true, drawer rejects submit when section_code is blank. */
  section_code_required:    boolean;
  /** Optional hints — autocomplete suggestions for the section-code input. */
  section_code_hints?:      ReadonlyArray<string>;
}

export interface WhtDrawerProps {
  mode:               WhtDrawerMode;
  open:               boolean;
  onOpenChange:       (open: boolean) => void;

  piCode:             string;
  piSupplierLabel:    string;
  piStatus:           PiStatus;

  lines:              ReadonlyArray<PurchaseInvoiceLine>;
  currencyCode:       string;
  baseCurrencyCode:   string;
  exchangeRate:       number;
  invoiceNetAmount:   number;

  /** WHT-only tax-group lookup; caller filters by wht_basis IS NOT NULL. */
  whtGroups:          ReadonlyArray<WhtGroupOption>;
  /** Pricing-component condition type written to condition_type_id. */
  conditionTypeId?:   string;
  /** Default sequence for new WHT rows (defaults to 400 — see pc-precedence). */
  conditionTypeSequence?: number;

  /** Replace mode requires the original. */
  replacingComponent?: PricingComponent;
  /** Active pricing components for the relevant document/line scope. */
  components?: ReadonlyArray<PricingComponent>;

  /** Optional prior running sum on the target line (e.g. when running_after_prior). */
  priorRunningSum?:   number;
  /** Default apply-to choice when opening from a line/header affordance. */
  initialApplyTo?:    "one_item" | "all_items";
  initialLineId?:     string;
  /** Metadata contract for the Apply-to segmented control. */
  applyToField?:      SegmentedFieldContract;

  onSubmit: (input: {
    draft: PcDraft;
    reason?: string;
    replacingId?: string;
  }) => Promise<void> | void;
}

const WHT_BASIS_LABEL: Record<WhtGroupOption["wht_basis"], string> = {
  GROSS:                "Gross (pre-tax)",
  NET_OF_INDIRECT_TAX:  "Net of indirect tax",
  PAYMENT_ONLY:         "Withhold at payment time",
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Main component ─────────────────────────────────────────────────

export function WhtDrawer({
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
  whtGroups,
  conditionTypeId,
  conditionTypeSequence,
  replacingComponent,
  components = [],
  priorRunningSum = 0,
  initialApplyTo,
  initialLineId,
  applyToField = DEFAULT_APPLY_TO_FIELD,
  onSubmit,
}: WhtDrawerProps) {
  void priorRunningSum;
  const isEditingExisting = mode === "edit" || mode === "replace";
  const sourceComponent = isEditingExisting ? replacingComponent : null;

  // ── Local state ──────────────────────────────────────────────────
  const [applyTo, setApplyTo] = useState<"one_item" | "all_items">(
    sourceComponent?.source_line_id ? "one_item" : initialApplyTo ?? "one_item",
  );

  const defaultGroup = sourceComponent?.tax_group_label
    ? whtGroups.find((g) => g.label === sourceComponent.tax_group_label) ?? whtGroups[0]
    : whtGroups[0];

  const [groupId, setGroupId]                 = useState<string>(defaultGroup?.id ?? "");
  const [rateOverride, setRateOverride]       = useState<string | null>(null);
  const [sectionCode, setSectionCode]         = useState<string>(
    sourceComponent?.tax_section_code
      ?? defaultGroup?.default_section_code
      ?? "",
  );
  const [computesOn, setComputesOn]           = useState<ComputesOnMode>(
    // Default to running_after_prior — WHT typically applies to the taxed
    // net. The wht_basis chip below clarifies what "after prior" means
    // per the rate schedule.
    "running_after_prior",
  );
  const [lineId, setLineId] = useState<string>(
    sourceComponent?.source_line_id ?? initialLineId ?? lines[0]?.id ?? "",
  );
  void computesOn;
  const [withholdingBaseMode, setWithholdingBaseMode] = useState<WithholdingBaseMode>(() =>
    readWithholdingBaseMode(sourceComponent) ?? "line_net",
  );
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(() =>
    new Set(readWithholdingBaseChargeIds(sourceComponent)),
  );
  const [manualWithholdingAmount, setManualWithholdingAmount] = useState<string>(() =>
    readManualWithholdingAmount(sourceComponent),
  );
  const [reason, setReason] = useState<string>("");
  useEffect(() => {
    if (!open) return;
    const nextGroup = sourceComponent?.tax_group_label
      ? whtGroups.find((g) => g.label === sourceComponent.tax_group_label) ?? whtGroups[0]
      : whtGroups[0];

    setApplyTo(sourceComponent?.source_line_id ? "one_item" : initialApplyTo ?? "one_item");
    setGroupId(nextGroup?.id ?? "");
    setRateOverride(null);
    setSectionCode(
      sourceComponent?.tax_section_code
        ?? nextGroup?.default_section_code
        ?? "",
    );
    setComputesOn("running_after_prior");
    setLineId(sourceComponent?.source_line_id ?? initialLineId ?? lines[0]?.id ?? "");
    setWithholdingBaseMode(readWithholdingBaseMode(sourceComponent) ?? "line_net");
    setSelectedChargeIds(new Set(readWithholdingBaseChargeIds(sourceComponent)));
    setManualWithholdingAmount(readManualWithholdingAmount(sourceComponent));
    setReason("");
  }, [
    initialApplyTo,
    initialLineId,
    lines,
    open,
    sourceComponent,
    whtGroups,
  ]);

  // ── Derived values ───────────────────────────────────────────────
  const selectedGroup   = whtGroups.find((g) => g.id === groupId);
  const effectiveRate   = rateOverride !== null && rateOverride !== ""
    ? Number(rateOverride)
    : selectedGroup?.default_rate ?? 0;
  const sectionRequired = selectedGroup?.section_code_required ?? false;

  const selectedLine    = lines.find((l) => l.id === lineId);
  const selectedLineNet = selectedLine?.net_amount ?? 0;
  const withholdingSequence = sourceComponent?.sequence ?? conditionTypeSequence ?? 400;

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
      if (component.sequence >= withholdingSequence) continue;
      if (!component.source_line_id) continue;
      map.set(
        component.source_line_id,
        round2((map.get(component.source_line_id) ?? 0) + component.computed_amount),
      );
    }
    return map;
  }, [components, withholdingSequence]);

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
  const usesChargesInWithholdingBase =
    withholdingBaseMode === "charges_only" || withholdingBaseMode === "after_discounts_plus_charges";

  useEffect(() => {
    if (!open) return;
    if (readWithholdingBaseMode(sourceComponent)) return;
    setWithholdingBaseMode(hasPriorDiscounts ? "after_discounts" : "line_net");
  }, [hasPriorDiscounts, open, sourceComponent]);

  useEffect(() => {
    if (!open) return;
    if (!usesChargesInWithholdingBase) return;
    if (selectedChargeIds.size > 0) return;
    setSelectedChargeIds(new Set(chargeCandidates.map((component) => component.id)));
  }, [chargeCandidates, open, selectedChargeIds.size, usesChargesInWithholdingBase]);

  function withholdingBaseForLine(line: PurchaseInvoiceLine): number {
    const priorDiscount = discountByLineId.get(line.id) ?? 0;
    const chargeAmount = chargeByLineId.get(line.id) ?? 0;
    const manualAmount = parseOptionalPositiveNumber(manualWithholdingAmount) ?? 0;
    switch (withholdingBaseMode) {
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

  // Per-line WHT preview when "All items"
  const perLineWht = useMemo(() => {
    if (applyTo !== "all_items") return null;
    return lines.map((l) => {
      const base = withholdingBaseForLine(l);
      const wht = round4((base * effectiveRate) / 100);
      return { line: l, base, wht };
    });
  }, [applyTo, lines, effectiveRate, withholdingBaseMode, discountByLineId, chargeByLineId, manualWithholdingAmount]);

  const selectedWithholdingBase = selectedLine ? withholdingBaseForLine(selectedLine) : 0;

  const totalWht = applyTo === "all_items"
    ? perLineWht?.reduce((acc, r) => acc + r.wht, 0) ?? 0
    : round4((selectedWithholdingBase * effectiveRate) / 100);
  const whtBaseAmount = applyTo === "all_items"
    ? perLineWht?.reduce((acc, r) => acc + r.base, 0) ?? 0
    : selectedWithholdingBase;
  const lineNetWithholdingBase = applyTo === "all_items" ? invoiceNetAmount : selectedLineNet;
  const afterDiscountWithholdingBase = Math.max(
    0,
    round2(lineNetWithholdingBase - (applyTo === "all_items" ? totalPriorDiscounts : selectedLinePriorDiscount)),
  );
  const chargesOnlyWithholdingBase = applyTo === "all_items" ? totalSelectedCharges : selectedLineCharges;
  const afterDiscountPlusChargesWithholdingBase = Math.max(0, round2(afterDiscountWithholdingBase + chargesOnlyWithholdingBase));
  const manualWithholdingAmountNum = parseOptionalPositiveNumber(manualWithholdingAmount);
  const manualBaseSourceAmount = afterDiscountPlusChargesWithholdingBase > 0
    ? afterDiscountPlusChargesWithholdingBase
    : lineNetWithholdingBase;
  const manualWithholdingPct = manualWithholdingAmountNum != null && manualBaseSourceAmount > 0
    ? round2((manualWithholdingAmountNum / manualBaseSourceAmount) * 100)
    : null;
  const scopeNetAmount = applyTo === "all_items" ? invoiceNetAmount : selectedLineNet;
  const supplierPayableAmount = scopeNetAmount - totalWht;
  const rateError = effectiveRate <= 0 ? "Rate must be greater than 0." : null;
  const sectionError = sectionRequired && sectionCode.trim() === "" ? "Section code is required." : null;
  const locksAddToInitialLine = mode === "add" && initialApplyTo === "one_item" && Boolean(initialLineId);
  const locksExistingLineScope = mode === "edit" && sourceComponent?.entry_level === "line";
  const locksExistingHeaderScope = mode === "edit" && sourceComponent?.entry_level === "header";
  const showLockedLineScope = locksAddToInitialLine || locksExistingLineScope;
  const showLockedHeaderScope = locksExistingHeaderScope;
  const showScopeSelector = !showLockedLineScope && !showLockedHeaderScope;

  // ── Lock matrix ──────────────────────────────────────────────────
  const locked = useMemo(() => ({
    applyTo:  mode === "replace" || showLockedLineScope || showLockedHeaderScope,
    group:    mode === "replace",
    linePicker: showLockedLineScope,
  }), [mode, showLockedHeaderScope, showLockedLineScope]);

  // ── Metadata snapshot (D8) — built at every render so submit captures
  // the latest selection. Server re-validates.
  const metadata = selectedGroup
    ? {
        rate_schedule_id: selectedGroup.rate_schedule_id,
        wht_basis:        selectedGroup.wht_basis,
        resolved_rate:    effectiveRate,
        jurisdiction_id:  selectedGroup.jurisdiction_id,
        withholding_base_mode: withholdingBaseMode,
        withholding_base_amount: whtBaseAmount,
        withholding_base_charge_ids: Array.from(selectedChargeIds),
        withholding_base_source_amount: withholdingBaseMode === "manual_amount" ? manualBaseSourceAmount : undefined,
        withholding_base_manual_pct: withholdingBaseMode === "manual_amount" ? manualWithholdingPct : undefined,
        captured_at:      new Date().toISOString(),
      }
    : null;

  // ── Validation ───────────────────────────────────────────────────
  const draft: PcDraft = {
    term_type:         "withholding",
    basis:             "percent",
    rate_value:        effectiveRate,
    amount_value:      null,
    base_for_calculation: whtBaseAmount,
    tax_group_id:      groupId || null,
    is_inclusive:      false,                 // WHT is always exclusive
    recoverable_pct:   0,                     // WHT is not an input credit
    tax_section_code:  sectionCode.trim() || null,
    metadata:          metadata ?? undefined,
    entry_level:       applyTo === "all_items" ? "header" : "line",
    source_line_id:    applyTo === "one_item" ? lineId || null : null,
    apportion_basis:   applyTo === "all_items" ? "value" : null,
    condition_type_id: conditionTypeId || null,
    sequence:          withholdingSequence,
  };

  const errors = validatePcDraft(draft, {
    wht_section_required: sectionRequired,
  });
  const reasonRequired = mode === "replace";
  if (reasonRequired && reason.trim() === "") {
    errors.push({ code: "REQUIRED", field: "condition_type_id", message: "Reason is required" });
  }
  const canSubmit = errors.length === 0 && totalWht > 0;

  // ── Submit ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        draft,
        reason:      reasonRequired ? reason : undefined,
        replacingId: isEditingExisting ? replacingComponent?.id : undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  const title    = mode === "replace" ? "Replace withholding"
                 : mode === "edit" ? "Edit withholding"
                 : locksAddToInitialLine ? "Add withholding to line"
                 : "Add withholding";
  const subtitle = formatDrawerSubtitle({
    documentCode: piCode,
    counterpartyLabel: piSupplierLabel,
    status: piStatus,
  });
  const ctaLabel = mode === "replace" ? "Replace as v2"
                 : mode === "edit" ? "Save changes"
                 : "Add withholding";

  return (
    <DrawerFormShell
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      defaultWidth="70vw"
      contextBadge="Pricing component · WHT"
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
            { label: "Withholding", amount: -totalWht, currencyCode },
            { label: "Withholding Base", amount: whtBaseAmount, currencyCode },
            { label: "Net Payable", amount: whtBaseAmount - totalWht, currencyCode, emphasized: true },
          ]} />
          {applyTo === "all_items" && perLineWht != null && (
            <span className="text-muted-foreground">
              · {perLineWht.length} WHT components created · one per line
            </span>
          )}
          {selectedGroup && (
            <span className="text-muted-foreground">
              · base: {WHT_BASIS_LABEL[selectedGroup.wht_basis]}
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
                { value: "all_items", label: "All lines", sublabel: "One deduction per line" },
                { value: "one_item",  label: "One line",  sublabel: "Apply to one selected line" },
              ]}
              onChange={setApplyTo}
              disabled={locked.applyTo}
              ariaLabel="Apply withholding to"
              field={applyToField}
            />
          </div>
        )}

        {/* WHT group + section code */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Withholding group</SectionLabel>
              {locked.group && <LockedHint>locked</LockedHint>}
            </div>
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                // Reset section code default whenever group changes.
                const next = whtGroups.find((g) => g.id === e.target.value);
                if (next?.default_section_code) setSectionCode(next.default_section_code);
              }}
              disabled={locked.group}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
            >
              {whtGroups.length === 0 && <option value="">No WHT groups available</option>}
              {whtGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}{g.jurisdiction_label ? ` · ${g.jurisdiction_label}` : ""}
                </option>
              ))}
            </select>
            <div className="text-sm font-normal text-muted-foreground">
              Manual withholding component
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>
                Section code
                {sectionRequired && <span className="ml-0.5 text-destructive">*</span>}
              </SectionLabel>
            </div>
            <input
              type="text"
              value={sectionCode}
              onChange={(e) => setSectionCode(e.target.value)}
              placeholder={selectedGroup?.default_section_code ?? "e.g. 194C"}
              list={selectedGroup?.section_code_hints?.length ? "wht-section-hints" : undefined}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            {selectedGroup?.section_code_hints?.length ? (
              <datalist id="wht-section-hints">
                {selectedGroup.section_code_hints.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            ) : null}
            <div className="text-sm font-normal text-muted-foreground">
              {sectionRequired ? "Required by jurisdiction." : "Optional."}
            </div>
            <FieldError>{sectionError}</FieldError>
          </div>
        </div>

        {/* Rate */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Rate</SectionLabel>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={rateOverride ?? String(selectedGroup?.default_rate ?? 0)}
              onChange={(e) => setRateOverride(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
            />
            <div className="text-sm font-normal text-muted-foreground">
              Default {selectedGroup?.default_rate ?? 0}%
            </div>
            <FieldError>{rateError}</FieldError>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Schedule base</SectionLabel>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              {selectedGroup ? WHT_BASIS_LABEL[selectedGroup.wht_basis] : "No schedule selected"}
            </div>
            {selectedGroup && (
              <div className="text-sm font-normal text-muted-foreground">
                Informational rate-schedule basis; choose the working base below.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <SectionLabel>Withholding base</SectionLabel>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-1">
            <WithholdingBaseOption
              selected={withholdingBaseMode === "line_net"}
              label="Line net"
              amount={lineNetWithholdingBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              onClick={() => setWithholdingBaseMode("line_net")}
            />
            <WithholdingBaseOption
              selected={withholdingBaseMode === "after_discounts"}
              label={applyTo === "all_items" ? "After line discounts" : "After discounts"}
              amount={afterDiscountWithholdingBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              disabled={!hasPriorDiscounts}
              onClick={() => setWithholdingBaseMode("after_discounts")}
            />
            <WithholdingBaseOption
              selected={withholdingBaseMode === "charges_only"}
              label="Charges only"
              amount={chargesOnlyWithholdingBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              disabled={!hasChargeCandidates}
              onClick={() => setWithholdingBaseMode("charges_only")}
            />
            <WithholdingBaseOption
              selected={withholdingBaseMode === "after_discounts_plus_charges"}
              label="After discounts and charges"
              amount={afterDiscountPlusChargesWithholdingBase}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              disabled={!hasPriorDiscounts && !hasChargeCandidates}
              onClick={() => setWithholdingBaseMode("after_discounts_plus_charges")}
            />
            <WithholdingBaseOption
              selected={withholdingBaseMode === "manual_amount"}
              label="Custom amount"
              amount={manualWithholdingAmountNum ?? 0}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              onClick={() => {
                setWithholdingBaseMode("manual_amount");
                if (manualWithholdingAmount.trim() === "") {
                  setManualWithholdingAmount(String(round2(manualBaseSourceAmount)));
                }
              }}
            />
          </div>
          {withholdingBaseMode === "manual_amount" && (
            <div className="rounded-md border border-border bg-card p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>Withholding amount</SectionLabel>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={manualWithholdingAmount}
                    onChange={(event) => setManualWithholdingAmount(event.target.value)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                    aria-label="Withholding base amount"
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
                    onClick={() => setManualWithholdingAmount(String(round2((manualBaseSourceAmount * pct) / 100)))}
                    className={cn(
                      "rounded-md border border-border px-2.5 py-1 text-xs font-medium",
                      "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {pct === 100 ? "Full" : `${pct}%`}
                  </button>
                ))}
                {manualWithholdingPct != null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {manualWithholdingPct}% of current base
                  </span>
                )}
              </div>
            </div>
          )}
          {usesChargesInWithholdingBase && (
            <div className="rounded-md border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-semibold text-muted-foreground">Included charges</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <CurrencyTriad
                    amount={chargesOnlyWithholdingBase}
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

        <PricingImpactPreview note="Withholding reduces the supplier payable amount; it does not increase line cost.">
          <PricingImpactRow label="Withholding base">
            <CurrencyTriad
              amount={whtBaseAmount}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </PricingImpactRow>
          <PricingImpactRow label="Withholding" tone="negative">
            <CurrencyTriad
              amount={-totalWht}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
              signed
            />
          </PricingImpactRow>
          <PricingImpactRow label="Supplier payable">
            <CurrencyTriad
              amount={supplierPayableAmount}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </PricingImpactRow>
        </PricingImpactPreview>

        {/* Target line (one_item only) */}
        {applyTo === "one_item" && !showLockedLineScope && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Target line</SectionLabel>
              {locked.linePicker && <LockedHint>locked to opened line</LockedHint>}
            </div>
            <select
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              disabled={locked.linePicker}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.line_no} · {l.item_description?.slice(0, 60) ?? "(no description)"} · {l.net_amount.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Per-line preview */}
        {applyTo === "all_items" && perLineWht && (
          <div className="border border-border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[32rem] w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Line</th>
                  <th className="text-right px-2 py-1.5 font-medium">Base</th>
                  <th className="text-right px-2 py-1.5 font-medium">WHT</th>
                </tr>
              </thead>
              <tbody>
                {perLineWht.map(({ line, base, wht }) => (
                  <tr key={line.id} className="border-t border-border/60">
                    <td className="px-2 py-1.5">{line.line_no} · {line.item_description?.slice(0, 40) ?? ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{base.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-destructive">−{wht.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t border-border/60 bg-muted/30 font-medium">
                  <td className="px-2 py-1.5">Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {perLineWht.reduce((s, r) => s + r.base, 0).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-destructive">
                    −{totalWht.toLocaleString()}
                  </td>
                </tr>
              </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Replace reason */}
        {mode === "replace" && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel>
              Reason <span className="text-destructive">*</span>
            </SectionLabel>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this WHT being replaced?"
              rows={2}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </div>
        )}

        {/* Errors */}
        <ErrorList messages={errors.map((e) => e.message)} />
      </div>
    </DrawerFormShell>
  );
}

function readWithholdingBaseMode(component: PricingComponent | null | undefined): WithholdingBaseMode | null {
  const withholdingValue = component?.metadata?.["withholding_base_mode"];
  const taxableValue = component?.metadata?.["taxable_base_mode"];
  const value = typeof withholdingValue === "string" ? withholdingValue : taxableValue;
  return value === "line_net" ||
    value === "after_discounts" ||
    value === "charges_only" ||
    value === "after_discounts_plus_charges" ||
    value === "manual_amount"
    ? value
    : null;
}

function readWithholdingBaseChargeIds(component: PricingComponent | null | undefined): string[] {
  const value = component?.metadata?.["withholding_base_charge_ids"] ?? component?.metadata?.["taxable_base_charge_ids"];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readManualWithholdingAmount(component: PricingComponent | null | undefined): string {
  const metadataAmount = component?.metadata?.["withholding_base_amount"] ?? component?.metadata?.["taxable_base_amount"];
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

function WithholdingBaseOption({
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
