/**
 * @athyper/content-ui — DiscountDrawer (Add / Replace / Override)
 *
 * Spec v1.1 §5.1 (Add), §5.2 (Replace), §5.3 (Override-inherited).
 *
 * Writes pricing_component rows of `term_type='discount'`.
 *
 * Modes:
 *   • add       — fresh component; entry_level is user-chosen
 *   • replace   — supersedes an existing PC row (lock: scope/condition/seq)
 *   • override  — writes a manual line-scope row that supersedes an
 *                 inherited share at the line level
 *
 * Per R1: "Early-payment / settlement" does NOT live here. Pass
 * conditionTypes filtered to manual/promotional/volume/trade kinds only.
 */
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { DrawerFormShell } from "@athyper/ui/surfaces/shells";
import { CurrencyTriad } from "../../money/CurrencyTriad";
import {
  computeApportionment,
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
  InheritedBlock,
  SupersedeModeBanner,
  MaterialChangeWarning,
  ErrorList,
} from "./_shared";
import type {
  PricingComponent,
  PcApportionBasis,
  PurchaseInvoiceLine,
  PiStatus,
} from "../../../purchase-invoice/types";

// ── Public types ──────────────────────────────────────────────────

export type DiscountDrawerMode = "add" | "replace" | "override";

export interface ConditionTypeOption {
  id: string;
  code: string;
  label: string;
  default_sequence: number;
  /** Caption next to "inserts at seq N — <position_hint>". */
  position_hint?: string;
}

/**
 * Cleanup-plan v5 §5.10 — capability hints for the discount drawer.
 *
 * The drawer respects basis-availability flags when rendering the
 * Percentage / Fixed amount / Per-unit toggle. Per-document profiles
 * pass these so tenants on unusual jurisdictions (cess per-unit,
 * non-percent freight) get accurate UX.
 *
 * When omitted, defaults match today's behaviour:
 *   allowsPerUnit = false, allowsFlat = true.
 *
 * Wiring the drawer body to consume these flags lands alongside the
 * UI generalization in P2c.2; this commit ships the API surface.
 */
export interface ConditionTypeCapabilities {
  allowsPerUnit?: boolean;
  allowsFlat?:    boolean;
  defaultSequence?: number;
  /** Optional UI label override for the kind picker (e.g. "Charge kind"). */
  kindLabel?:     string;
}

/** Discount drawer doesn't accept early-payment kind (R1). */
export interface DiscountDrawerProps {
  mode: DiscountDrawerMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Document context
  piCode: string;
  piSupplierLabel: string;
  piStatus: PiStatus;

  // Lines + currency triad
  lines: ReadonlyArray<PurchaseInvoiceLine>;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  /** Sum of line.net_amount — drives invoice-net delta display. */
  invoiceNetAmount: number;

  /** Available condition types (filtered: no early-payment / settlement). */
  conditionTypes: ReadonlyArray<ConditionTypeOption>;

  /**
   * v5 §5.10 — capability hints from the parent's surface config.
   * Drawer falls back to today's defaults when omitted (P2c.2 wires
   * the body to actually consume these flags).
   */
  conditionTypeCapabilities?: ConditionTypeCapabilities;

  /** For mode='replace' — required. */
  replacingComponent?: PricingComponent;
  /** For mode='override' — the inherited row being overridden. */
  inheritedComponent?: PricingComponent;
  /** When inherited row carries an apportioned share for the line. */
  inheritedAllocation?: number;
  /** When this line already has a prior PC sum (drives computes-on math). */
  priorRunningSum?: number;

  /** Submit handler — receives draft + optional reason + replacing/inherited refs. */
  onSubmit: (input: {
    draft: PcDraft;
    reason?: string;
    replacingId?: string;
    inheritedFromId?: string;
  }) => Promise<void> | void;

  /** Materiality threshold (for the "may reset workflow" warning). */
  materialChangeThreshold?: number;
}

// ── Main component ─────────────────────────────────────────────────

export function DiscountDrawer({
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
  conditionTypes,
  conditionTypeCapabilities,
  replacingComponent,
  inheritedComponent,
  inheritedAllocation,
  priorRunningSum = 0,
  onSubmit,
  materialChangeThreshold = 100,
}: DiscountDrawerProps) {
  // ── Initial state derivation ─────────────────────────────────────
  // Replace mode starts from replacingComponent values.
  // v5 §5.10 — capability flags consumed in P2c.2 when basis toggle wires
  // per-unit support. For now the body uses today's static fallback.
  void conditionTypeCapabilities;

  // Override mode starts from inheritedComponent values but scoped to its line.
  const sourceComponent = mode === "replace" ? replacingComponent
                        : mode === "override" ? inheritedComponent
                        : null;

  const defaultConditionType = sourceComponent?.condition_type_code
    ? conditionTypes.find((ct) => ct.code === sourceComponent.condition_type_code) ?? conditionTypes[0]
    : conditionTypes[0];

  const [conditionTypeId, setConditionTypeId] = useState<string>(defaultConditionType?.id ?? "");

  const [applyTo, setApplyTo] = useState<"whole_invoice" | "one_item">(
    sourceComponent?.entry_level === "header" ? "whole_invoice" : "one_item",
  );

  const [basis, setBasis] = useState<"percent" | "fixed">(
    sourceComponent?.basis === "amount" || sourceComponent?.basis === "flat" ? "fixed" : "percent",
  );

  const [percentValue, setPercentValue] = useState<string>(
    sourceComponent?.rate_value != null ? String(sourceComponent.rate_value) : "5",
  );
  const [amountValue, setAmountValue] = useState<string>(
    sourceComponent?.amount_value != null ? String(sourceComponent.amount_value) : "",
  );

  const [spreadBasis, setSpreadBasis] = useState<PcApportionBasis>(
    (sourceComponent?.apportion_basis as PcApportionBasis | undefined) ?? "value",
  );

  const [lineId, setLineId] = useState<string>(
    sourceComponent?.entry_level === "line" && sourceComponent.is_apportioned_from_id == null
      ? ""
      : (mode === "override" && inheritedComponent?.is_apportioned_from_id ? lines[0]?.id ?? "" : lines[0]?.id ?? ""),
  );

  const [computesOn, setComputesOn] = useState<ComputesOnMode>("net_before_adjustments");

  const [reason, setReason] = useState<string>("");

  // Lock matrix per mode (§5.2)
  const locked = useMemo(() => ({
    applyTo:        mode !== "add",
    conditionType:  mode !== "add",
    sequence:       mode !== "add",
    linePicker:     mode === "override",
  }), [mode]);

  // ── Derived values ───────────────────────────────────────────────
  const selectedConditionType = conditionTypes.find((c) => c.id === conditionTypeId);
  const sequenceForRow = sourceComponent?.sequence ?? selectedConditionType?.default_sequence ?? 10;

  const rateValueNum = basis === "percent" && percentValue !== "" ? Number(percentValue) : null;
  const amountValueNum = basis === "fixed" && amountValue !== "" ? Number(amountValue) : null;

  // For one-item mode, compute base + preview amount.
  const selectedLine = lines.find((l) => l.id === lineId);
  const selectedLineNet = selectedLine?.net_amount ?? 0;

  const baseForCalc = applyTo === "one_item"
    ? resolveBaseForCalculation({
        lineNet: selectedLineNet,
        priorSum: priorRunningSum,
        mode: computesOn,
      })
    : invoiceNetAmount;

  const previewAmount = previewComputedAmount({
    base: baseForCalc,
    draft: { basis: basis === "percent" ? "percent" : "amount", rate_value: rateValueNum, amount_value: amountValueNum },
  });

  // Sign for display (discount is negative)
  const displayPreviewAmount = -previewAmount;

  // For whole-invoice mode, compute live apportionment.
  const apportionmentResult = useMemo(() => {
    if (applyTo !== "whole_invoice" || previewAmount === 0) return null;
    return computeApportionment({
      amount: previewAmount,
      basis: spreadBasis,
      lines: lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        item_description: l.item_description,
        net_amount: l.net_amount,
        quantity: l.quantity,
      })),
    });
  }, [applyTo, previewAmount, spreadBasis, lines]);

  // Material change preview (replace mode)
  const isReplace = mode === "replace" && replacingComponent != null;
  const replaceDelta = isReplace ? previewAmount - replacingComponent.computed_amount : 0;
  const isMaterial = isReplace && Math.abs(replaceDelta) > materialChangeThreshold;

  // ── Validation ───────────────────────────────────────────────────
  const draft: PcDraft = {
    term_type: "discount",
    basis: basis === "percent" ? "percent" : "amount",
    rate_value: rateValueNum,
    amount_value: amountValueNum,
    tax_group_id: null,
    is_inclusive: null,
    recoverable_pct: null,
    tax_section_code: null,
    entry_level: applyTo === "whole_invoice" ? "header" : "line",
    source_line_id: applyTo === "one_item" ? lineId || null : null,
    apportion_basis: applyTo === "whole_invoice" ? spreadBasis : null,
    condition_type_id: conditionTypeId || null,
    sequence: sequenceForRow,
  };

  const errors = validatePcDraft(draft);
  const reasonRequired = mode !== "add";
  if (reasonRequired && reason.trim() === "") {
    errors.push({ code: "REQUIRED", field: "condition_type_id", message: "Reason is required" });
  }
  const canSubmit = errors.length === 0 && previewAmount > 0;

  // ── Submit ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        draft,
        reason: reasonRequired ? reason : undefined,
        replacingId: mode === "replace" ? replacingComponent?.id : undefined,
        inheritedFromId: mode === "override" ? inheritedComponent?.id : undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  const title = mode === "replace" ? "Replace discount"
              : mode === "override" ? "Override inherited component"
              : "Add discount";

  const subtitle = `${piCode} · ${piSupplierLabel} · ${piStatus.replaceAll("_", " ")}`;

  const ctaLabel = mode === "replace" ? "Replace as v2"
                 : mode === "override" ? `Override for Line ${selectedLine?.line_no ?? ""}`
                 : "Add discount";

  const successColors = resolveSemanticColors("success");

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
          {mode === "replace" && replacingComponent ? (
            <>
              <span className="text-muted-foreground">
                v1 <CurrencyTriad
                  amount={-replacingComponent.computed_amount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                /> →
              </span>
              <span className="font-medium">
                v2 <CurrencyTriad
                  amount={displayPreviewAmount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
              </span>
              <span className={cn(replaceDelta < 0 ? "text-success" : "text-warning")}>
                Δ <CurrencyTriad
                  amount={replaceDelta}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">
                Discount{" "}
                <CurrencyTriad
                  amount={displayPreviewAmount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
              </span>
              <span>
                {applyTo === "whole_invoice" ? "Invoice net" : `Line ${selectedLine?.line_no ?? "—"} net`}{" "}
                <CurrencyTriad
                  amount={applyTo === "whole_invoice" ? invoiceNetAmount : selectedLineNet}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                />
                {" → "}
                <CurrencyTriad
                  amount={(applyTo === "whole_invoice" ? invoiceNetAmount : selectedLineNet) - previewAmount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                />
              </span>
            </>
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

        {/* Inherited block */}
        {mode === "override" && inheritedComponent && (
          <InheritedBlock
            component={inheritedComponent}
            inheritedAllocation={inheritedAllocation}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        )}

        {/* Apply To */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Apply to</SectionLabel>
            {locked.applyTo && <LockedHint>scope cannot change across versions</LockedHint>}
          </div>
          <SegmentedToggle
            value={applyTo}
            options={[
              { value: "whole_invoice", label: "Whole invoice", sublabel: "spreads across all lines" },
              { value: "one_item",      label: "One item",      sublabel: "single line only" },
            ]}
            onChange={setApplyTo}
            disabled={locked.applyTo}
            ariaLabel="Apply discount to"
          />
        </div>

        {/* Discount kind + basis */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Discount kind</SectionLabel>
              {locked.conditionType && <LockedHint>locked</LockedHint>}
            </div>
            <select
              value={conditionTypeId}
              onChange={(e) => setConditionTypeId(e.target.value)}
              disabled={locked.conditionType}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60"
            >
              {conditionTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.label}</option>
              ))}
            </select>
            <div className="text-[11px] text-muted-foreground">
              Manual · inserts at seq {sequenceForRow}
              {selectedConditionType?.position_hint && ` — ${selectedConditionType.position_hint}`}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionLabel>Basis</SectionLabel>
            <SegmentedToggle
              value={basis}
              options={[
                { value: "percent", label: "Percentage" },
                { value: "fixed",   label: "Fixed amount" },
              ]}
              onChange={setBasis}
              ariaLabel="Discount basis"
            />
            <div className="flex items-center gap-2">
              {basis === "percent" ? (
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={percentValue}
                  onChange={(e) => setPercentValue(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                  aria-label="Discount percentage"
                />
              ) : (
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amountValue}
                  onChange={(e) => setAmountValue(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums"
                  aria-label="Discount fixed amount"
                />
              )}
              <span className="text-xs text-muted-foreground">{basis === "percent" ? "%" : currencyCode}</span>
            </div>
          </div>
        </div>

        {/* Mode-specific: whole-invoice spread + projection */}
        {applyTo === "whole_invoice" && (
          <>
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Spread across lines by</SectionLabel>
              <SegmentedToggle
                value={spreadBasis}
                options={[
                  { value: "value",    label: "Value" },
                  { value: "quantity", label: "Quantity" },
                  { value: "equal",    label: "Equal" },
                  { value: "weight",   label: "Weight" },
                ]}
                onChange={setSpreadBasis}
                ariaLabel="Apportionment basis"
              />
              {apportionmentResult?.incompatibility?.kind === "missing_weights" && (
                <div className="inline-flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  Weight data missing on {apportionmentResult.incompatibility.line_nos.length} lines —
                  choose a different basis or fill weights.
                </div>
              )}
            </div>

            {apportionmentResult && apportionmentResult.incompatibility == null && (
              <div className="rounded-md border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-[2.5rem_1fr_auto_auto_auto] gap-3 px-3 py-2 text-[11px] font-medium text-muted-foreground bg-muted/40 border-b border-border">
                  <div>Line</div>
                  <div>Item</div>
                  <div className="text-right">Base</div>
                  <div className="text-right">Share</div>
                  <div className="text-right">Allocated</div>
                </div>
                {apportionmentResult.rows.map((row) => (
                  <div key={row.line_id} className="grid grid-cols-[2.5rem_1fr_auto_auto_auto] gap-3 px-3 py-1.5 text-xs border-b border-border/40 last:border-b-0">
                    <div className="tabular-nums">{row.line_no}</div>
                    <div className="truncate">{row.item_description}</div>
                    <div className="tabular-nums text-right">{row.basis_value.toLocaleString()}</div>
                    <div className="tabular-nums text-right">{(row.share * 100).toFixed(1)}%</div>
                    <div className="tabular-nums text-right">
                      <CurrencyTriad
                        amount={-row.allocated_amount}
                        currencyCode={currencyCode}
                        baseCurrencyCode={baseCurrencyCode}
                        exchangeRate={exchangeRate}
                        signed
                      />
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-[2.5rem_1fr_auto_auto_auto] gap-3 px-3 py-2 text-xs font-medium border-t border-border bg-muted/40">
                  <div />
                  <div>Total</div>
                  <div className="text-right" />
                  <div className={cn("text-right", successColors.text)}>balanced</div>
                  <div className="tabular-nums text-right">
                    <CurrencyTriad
                      amount={-apportionmentResult.total_allocated}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                      signed
                    />
                  </div>
                </div>
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground italic">
                  {apportionmentResult.rounding_adjustment !== 0
                    ? <>{apportionmentResult.rounding_adjustment > 0 ? "+" : ""}{apportionmentResult.rounding_adjustment} rounding adjustment{apportionmentResult.rounding_absorbed_by_line_no != null && ` · absorbed by Line ${apportionmentResult.rounding_absorbed_by_line_no}`}</>
                    : "No rounding adjustment"}
                  {" · recomputes at submit"}
                </div>
              </div>
            )}
          </>
        )}

        {/* Mode-specific: one-item line + computes-on */}
        {applyTo === "one_item" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <SectionLabel>Line</SectionLabel>
                {locked.linePicker && <LockedHint>locked (override)</LockedHint>}
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
              <div className="text-[11px] text-muted-foreground">
                Base:{" "}
                <CurrencyTriad
                  amount={baseForCalc}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                />
                {" "}(auto)
              </div>
            </div>
          </div>
        )}

        {/* Reason (replace + override) */}
        {(mode === "replace" || mode === "override") && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Reason for {mode === "replace" ? "replacement" : "override"}</SectionLabel>
              <span className="text-[11px] text-error">required</span>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                mode === "replace"
                  ? "e.g. Supplier confirmed additional discount via email"
                  : "e.g. Receiving costs higher than apportioned share"
              }
              className="rounded-md border border-border bg-card px-3 py-2 text-sm resize-y"
            />
            <div className="text-[11px] text-muted-foreground">
              Reason attaches to {mode === "replace" ? "v2" : "override"}.metadata.{mode}_reason
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
                  amount={-replacingComponent.computed_amount}
                  currencyCode={currencyCode}
                  baseCurrencyCode={baseCurrencyCode}
                  exchangeRate={exchangeRate}
                  signed
                />
                {" → "}
                <CurrencyTriad
                  amount={displayPreviewAmount}
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

        {/* Errors list */}
        <ErrorList messages={errors.map((e) => e.message)} />
      </div>
    </DrawerFormShell>
  );
}
