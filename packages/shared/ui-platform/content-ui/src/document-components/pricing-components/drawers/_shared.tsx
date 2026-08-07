/**
 * @athyper/content-ui — Drawer shared sub-components
 *
 * Pure presentation pieces reused across PC-edit drawers
 * (DiscountDrawer, TaxDrawer, future RetentionDrawer etc.).
 */
"use client";

import type { ReactNode } from "react";
import type { EntityField } from "@athyper/api-contracts/metadata";
import { Lock, Info, AlertTriangle } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { CurrencyTriad } from "../../money/currency-triad";
import type { PricingComponent } from "../../../purchase-invoice/types";

// ── Section label ──────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

export function formatDrawerSubtitle({
  documentCode,
  counterpartyLabel,
  status,
}: {
  documentCode?: string | null;
  counterpartyLabel?: string | null;
  status?: string | null;
}) {
  const parts = [
    documentCode && !isUuidLike(documentCode) ? documentCode : null,
    counterpartyLabel,
    status ? status.replaceAll("_", " ") : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ── Locked hint ────────────────────────────────────────────────────

export function LockedHint({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
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
  /** Optional entity-field contract. Metadata wins over presentation defaults. */
  field?: Pick<EntityField, "name" | "label" | "ui_type" | "enum_config" | "ui_hint"> | null;
  /** Maps canonical metadata values to an existing domain value when they differ. */
  valueAliases?: Readonly<Record<string, T>>;
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className,
  field,
  valueAliases,
}: SegmentedToggleProps<T>) {
  const hint = field?.ui_hint ?? undefined;
  const metadataOptions = readSegmentedFieldOptions(field, valueAliases);
  const resolvedOptions = metadataOptions.length > 0 ? metadataOptions : options;
  const showDescriptions = hint?.show_option_descriptions ?? false;
  const contentLayout = hint?.layout === "content";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid h-9 overflow-hidden rounded-md border border-border bg-card text-sm font-medium",
        "focus-within:ring-2 focus-within:ring-ring/40",
        contentLayout && "inline-grid w-fit",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${resolvedOptions.length}, minmax(0, 1fr))` }}
    >
      {resolvedOptions.map((option) => {
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
              "flex min-w-20 items-center justify-center px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              selected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              optionDisabled && "pointer-events-none opacity-60",
            )}
          >
            <span>{option.label}</span>
            {showDescriptions && option.sublabel && (
              <span className="sr-only">{option.sublabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type SegmentedFieldContract = NonNullable<SegmentedToggleProps<string>["field"]>;

/**
 * Runtime fallback until the compiled surface supplies its `apply_to` field.
 * Kept in the same contract shape so presentation never forks from metadata.
 */
export const DEFAULT_APPLY_TO_FIELD: SegmentedFieldContract = {
  name: "apply_to",
  label: "Apply to",
  ui_type: "segmented",
  enum_config: {
    values: [
      { value: "all_items", label: "All lines" },
      { value: "one_item", label: "One line" },
    ],
  },
  ui_hint: {
    variant: "compact",
    size: "sm",
    layout: "content",
    show_option_descriptions: false,
  },
};

/** Resolve enum options without coupling a drawer to inline labels. */
export function readSegmentedFieldOptions<T extends string>(
  field: SegmentedFieldContract | null | undefined,
  valueAliases?: Readonly<Record<string, T>>,
): SegmentedToggleOption<T>[] {
  if (!field || field.ui_type !== "segmented") return [];
  const config = field.enum_config as { values?: unknown } | null | undefined;
  if (!Array.isArray(config?.values)) return [];

  return config.values.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const option = candidate as Record<string, unknown>;
    if (typeof option.value !== "string" || typeof option.label !== "string") return [];
    const mappedValue = valueAliases?.[option.value] ?? option.value as T;
    return [{
      value: mappedValue,
      label: option.label,
      sublabel: typeof option.description === "string" ? option.description : undefined,
      disabled: option.disabled === true,
    }];
  });
}

export function segmentedFieldLabel(field: SegmentedFieldContract | null | undefined, fallback: string): string {
  return field?.label?.trim() || fallback;
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="text-sm font-medium text-destructive">
      {children}
    </div>
  );
}

export function PricingScopeCard({
  lineNo,
  description,
  netAmount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  lockedLabel = "Locked to this line",
}: {
  lineNo?: number | string | null;
  description?: string | null;
  netAmount?: number | null;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  lockedLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionLabel>Applied to</SectionLabel>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">
            Line {lineNo ?? "—"} · {description || "(no description)"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Current net:{" "}
            <span className="font-medium text-foreground">
              <CurrencyTriad
                amount={netAmount ?? 0}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
              />
            </span>
          </div>
        </div>
        <LockedHint>{lockedLabel}</LockedHint>
      </div>
    </div>
  );
}

export function PricingDocumentScopeCard({
  lineCount,
  netAmount,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  lockedLabel = "Locked to all lines",
}: {
  lineCount?: number | null;
  netAmount?: number | null;
  currencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
  lockedLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionLabel>Applied to</SectionLabel>
          <div className="mt-1 text-sm font-semibold text-foreground">
            All lines
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {lineCount ?? 0} line{lineCount === 1 ? "" : "s"} · Current net:{" "}
            <span className="font-medium text-foreground">
              <CurrencyTriad
                amount={netAmount ?? 0}
                currencyCode={currencyCode}
                baseCurrencyCode={baseCurrencyCode}
                exchangeRate={exchangeRate}
              />
            </span>
          </div>
        </div>
        <LockedHint>{lockedLabel}</LockedHint>
      </div>
    </div>
  );
}

export function PricingImpactPreview({
  title = "Impact preview",
  children,
  note,
}: {
  title?: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2">
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">{children}</div>
      {note && <div className="mt-2 text-sm font-normal text-muted-foreground">{note}</div>}
    </div>
  );
}

export function PricingImpactRow({
  label,
  children,
  tone = "default",
}: {
  label: ReactNode;
  children: ReactNode;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          tone === "positive" && "text-success",
          tone === "warning" && "text-warning",
          tone === "negative" && "text-destructive",
        )}
      >
        {children}
      </span>
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
      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-info">
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
