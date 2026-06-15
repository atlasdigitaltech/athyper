/**
 * @athyper/content-ui — Drawer shared sub-components
 *
 * Pure presentation pieces reused across PC-edit drawers
 * (DiscountDrawer, TaxDrawer, future RetentionDrawer etc.).
 */
"use client";

import type { ReactNode } from "react";
import { Lock, Info, AlertTriangle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { CurrencyTriad } from "../../money/CurrencyTriad";
import type { PricingComponent } from "../../../purchase-invoice/types";

// ── Section label ──────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

// ── Locked hint ────────────────────────────────────────────────────

export function LockedHint({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Lock className="h-3 w-3" aria-hidden /> {children}
    </div>
  );
}

// ── Segmented toggle ───────────────────────────────────────────────

export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface SegmentedToggleProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedToggleOption<T>>;
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("grid gap-1 rounded-md border border-border p-1 bg-muted/30", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const optionDisabled = disabled || option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => !optionDisabled && onChange(option.value)}
            aria-pressed={selected}
            disabled={optionDisabled}
            className={cn(
              "flex flex-col items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              optionDisabled && "opacity-60 pointer-events-none",
            )}
          >
            <span>{option.label}</span>
            {option.sublabel && (
              <span className="text-[10px] text-muted-foreground">{option.sublabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Replacing block (v1 read-only summary) ─────────────────────────

export function ReplacingBlock({
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
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 flex flex-col gap-1.5">
      <SectionLabel>Replacing — v1 (currently active)</SectionLabel>
      <div className="text-sm font-medium">{component.condition_type_label}</div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>Basis: {component.basis}</span>
        {component.rate_value != null && <span>{component.rate_value}%</span>}
        <span>
          Amount:{" "}
          <CurrencyTriad
            amount={component.computed_amount}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        </span>
        <span>Sequence: {component.sequence}</span>
      </div>
    </div>
  );
}

// ── Inherited block (override mode) ────────────────────────────────

export function InheritedBlock({
  component,
  inheritedAllocation,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
}: {
  component: PricingComponent;
  inheritedAllocation?: number;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
}) {
  return (
    <div className="rounded-md border border-border bg-info/5 p-3 flex flex-col gap-1.5">
      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-info">
        <Info className="h-3 w-3" aria-hidden /> Line override
      </div>
      <div className="text-sm">
        {component.condition_type_label} was inherited from a header-scope row.
        Overriding here supersedes the inherited share for this line only; other
        lines keep their projection.
      </div>
      {inheritedAllocation != null && (
        <div className="text-xs text-muted-foreground">
          Inherited share:{" "}
          <CurrencyTriad
            amount={inheritedAllocation}
            currencyCode={currencyCode}
            baseCurrencyCode={baseCurrencyCode}
            exchangeRate={exchangeRate}
          />
        </div>
      )}
    </div>
  );
}

// ── Supersede-mode banner ──────────────────────────────────────────

export function SupersedeModeBanner() {
  return (
    <div className="rounded-md border border-border bg-info/5 p-3 text-sm flex items-start gap-2">
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-info" aria-hidden />
      <div>
        <div className="font-medium">Supersede mode</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          v1 is preserved for audit. Writing v2 creates a new PC row and marks
          v1 superseded. Existing approvals may need re-confirmation per
          workflow policy.
        </div>
      </div>
    </div>
  );
}

// ── Material-change warning ────────────────────────────────────────

export function MaterialChangeWarning({
  threshold,
}: {
  threshold: number;
}) {
  return (
    <div className="px-3 py-2 border-t border-border bg-warning/10 text-xs text-warning inline-flex items-center gap-1">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Material change (Δ exceeds {threshold} threshold) — workflow may reset to step 1
    </div>
  );
}

// ── Error list ─────────────────────────────────────────────────────

export function ErrorList({ messages }: { messages: ReadonlyArray<string> }) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-md border border-error/40 bg-error/5 p-3 text-xs flex flex-col gap-1">
      {messages.map((msg, idx) => (
        <div key={idx} className="text-error">{msg}</div>
      ))}
    </div>
  );
}
