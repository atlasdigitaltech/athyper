"use client";

/**
 * QuantityInput / QuantityView — precision-aware quantity input with interactive UOM selector.
 *
 * QuantityInput:
 *   - type="text" + inputMode for full formatting control (mirrors MoneyInput)
 *   - Blurred state: locale-formatted at displayScale dp with thousand separators
 *   - Focused state: raw number string at commit precision
 *   - onPaste: strips commas, clamps via Decimal.js (same Excel paste handling as MoneyInput)
 *   - onBlur:  rounds via roundingRule (UNIT_QUANTITY / LINE_QUANTITY / WEIGHT / VOLUME slots)
 *   - allowedSign: defaults to "positive" — quantities are non-negative in most contexts
 *   - UOM suffix: static label when read-only; interactive Popover dropdown when onUomChange is set
 *   - uomDisplay: "code" → "KG" | "symbol" → "kg" | "none" → no suffix
 *
 * QuantityView:
 *   - Formatted number at displayScale + muted UOM code/symbol suffix
 */

import Decimal from "decimal.js";
import { forwardRef, useCallback, useId, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import type { ResolvedRoundingRule, RoundingMethod } from "./money-input";

export type { ResolvedRoundingRule, RoundingMethod };

// ── Decimal utilities (mirrors money-input — kept local to avoid coupling) ────

const DRM: Record<RoundingMethod, Decimal.Rounding> = {
  ROUND_HALF_UP:   Decimal.ROUND_HALF_UP,
  ROUND_HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  ROUND_DOWN:      Decimal.ROUND_DOWN,
  ROUND_UP:        Decimal.ROUND_UP,
};

function roundDecimal(raw: string, rule: ResolvedRoundingRule): Decimal | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s || s === "-" || s === ".") return null;
  try {
    const d = new Decimal(s);
    if (rule.increment) {
      const inc = new Decimal(rule.increment);
      return d.div(inc).toDecimalPlaces(0, DRM[rule.method]).mul(inc);
    }
    return d.toDecimalPlaces(rule.scale, DRM[rule.method]);
  } catch {
    return null;
  }
}

function clampDecimal(d: Decimal, min?: number, max?: number): Decimal {
  if (min != null && d.lt(min)) return new Decimal(min);
  if (max != null && d.gt(max)) return new Decimal(max);
  return d;
}

function formatNumber(value: number, scale: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "decimal",
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
    useGrouping: true,
  }).format(value);
}

function buildPlaceholder(scale: number): string {
  return scale > 0 ? `0.${"0".repeat(scale)}` : "0";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UomOption {
  /** Selection key — typically the UOM code ("KG", "EA", "L"). */
  value: string;
  /** Human-readable name: "Kilogram", "Each", "Litre". */
  label: string;
  /** Short code shown in suffix: "KG", "EA", "L". */
  code: string;
  /** Optional symbol: "kg", "℃". Used when uomDisplay="symbol". */
  symbol?: string;
}

export interface QuantityInputProps {
  value?: number | null;
  onChange?: (value: number | null) => void;

  /** Current UOM code — drives the suffix label. */
  uomCode?: string | null;
  /**
   * When provided, the UOM suffix becomes an interactive dropdown.
   * Receives the selected option's `value` (usually its code).
   */
  onUomChange?: (uomCode: string) => void;
  /** Options for the UOM dropdown. Caller fetches and filters by quantity_type. */
  uomOptions?: UomOption[];
  /** Shows a spinner inside the UOM dropdown while options are loading. */
  uomLoading?: boolean;
  /**
   * What to render in the UOM suffix box.
   *   "code"   → "KG"           (default)
   *   "symbol" → "kg"           (falls back to code when symbol absent)
   *   "none"   → suffix hidden
   */
  uomDisplay?: "code" | "symbol" | "none";

  /**
   * Display precision — drives blurred formatting and placeholder.
   * Defaults to 3 (quantities need more dp than money).
   */
  displayScale?: number;
  /**
   * Commit rounding rule from rounding_context slot resolution.
   * Relevant slots: UNIT_QUANTITY, LINE_QUANTITY, WEIGHT, VOLUME, PERCENTAGE.
   * Defaults to { method: "ROUND_HALF_UP", scale: displayScale }.
   */
  roundingRule?: ResolvedRoundingRule;

  /**
   * Sign constraint.
   *   "positive" — receipts, stock movements, order quantities (default)
   *   "negative" — reversals
   *   "both"     — inventory adjustments, shrinkage
   */
  allowedSign?: "positive" | "negative" | "both";
  /** Explicit floor. Overrides allowedSign lower bound when set. */
  min?: number;
  /** Explicit ceiling. */
  max?: number;

  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  /** BCP-47 locale for grouping separators and decimal mark. */
  locale?: string;
  className?: string;
  id?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

export interface QuantityViewProps {
  value?: number | null;
  uomCode?: string | null;
  uomSymbol?: string | null;
  uomDisplay?: "code" | "symbol" | "none";
  displayScale?: number;
  locale?: string;
  className?: string;
}

// ── QuantityInput ─────────────────────────────────────────────────────────────

export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  (
    {
      value,
      onChange,
      uomCode,
      onUomChange,
      uomOptions = [],
      uomLoading = false,
      uomDisplay = "code",
      displayScale = 3,
      roundingRule,
      allowedSign = "positive",
      min,
      max,
      placeholder: placeholderProp,
      disabled,
      readOnly,
      error,
      locale,
      className,
      id: externalId,
      onBlur: externalBlur,
      onFocus: externalFocus,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = error ? `${id}-error` : undefined;

    const effectiveRule: ResolvedRoundingRule = roundingRule ?? {
      method: "ROUND_HALF_UP",
      scale: displayScale,
    };

    const signMin = allowedSign === "positive" ? (min ?? 0) : min;
    const signMax = allowedSign === "negative" ? (max ?? 0) : max;

    const [focused, setFocused] = useState(false);
    const [editStr, setEditStr] = useState("");
    const [uomOpen, setUomOpen] = useState(false);

    // ── UOM suffix label ────────────────────────────────────────────────────
    const selectedUom = uomOptions.find((o) => o.value === uomCode);
    const uomLabel: string | null =
      uomDisplay === "none" ? null :
      uomDisplay === "symbol" ? (selectedUom?.symbol ?? selectedUom?.code ?? uomCode ?? null) :
      (selectedUom?.code ?? uomCode ?? null);

    const isUomInteractive = !!onUomChange && !disabled && !readOnly;

    // ── Input display value ─────────────────────────────────────────────────
    const inputValue = focused
      ? editStr
      : (value != null ? formatNumber(value, displayScale, locale) : "");

    const placeholder = placeholderProp ?? buildPlaceholder(displayScale);

    // ── Commit helper ───────────────────────────────────────────────────────
    const commit = useCallback(
      (raw: string): number | null => {
        const d = roundDecimal(raw, effectiveRule);
        if (d == null) return null;
        return clampDecimal(d, signMin, signMax).toNumber();
      },
      [effectiveRule, signMin, signMax],
    );

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setEditStr(value != null ? String(value) : "");
        setFocused(true);
        externalFocus?.(e);
      },
      [value, externalFocus],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const str = e.target.value;
        setEditStr(str);
        const s = str.replace(/\s/g, "");
        if (!s || s === "-" || s === ".") {
          onChange?.(null);
          return;
        }
        try {
          onChange?.(new Decimal(s).toNumber());
        } catch {
          // invalid partial input — do not emit
        }
      },
      [onChange],
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        const committed = commit(editStr);
        setFocused(false);
        setEditStr("");
        onChange?.(committed);
        externalBlur?.(e);
      },
      [editStr, commit, onChange, externalBlur],
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLInputElement>) => {
        const raw = e.clipboardData.getData("text");
        const cleaned = raw.trim().replace(/,/g, "");
        if (!/^-?\d*\.?\d*$/.test(cleaned)) return;
        e.preventDefault();
        const d = roundDecimal(cleaned, effectiveRule);
        if (!d) return;
        const clamped = clampDecimal(d, signMin, signMax);
        setEditStr(clamped.toString());
        onChange?.(clamped.toNumber());
      },
      [effectiveRule, signMin, signMax, onChange],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length > 1) return;
        if (/^\d$/.test(e.key)) return;
        if (e.key === "." && !editStr.includes(".")) return;
        if (
          e.key === "-" &&
          allowedSign !== "positive" &&
          e.currentTarget.selectionStart === 0 &&
          !editStr.includes("-")
        ) return;
        e.preventDefault();
      },
      [editStr, allowedSign],
    );

    // ── Render ──────────────────────────────────────────────────────────────

    return (
      <div className={className}>
        <div
          className={cn(
            "flex h-9 w-full items-stretch overflow-hidden rounded-md border border-input bg-background",
            "focus-within:ring-2 focus-within:ring-ring",
            disabled && "cursor-not-allowed opacity-50",
            readOnly && "bg-muted",
            error && "border-destructive ring-1 ring-destructive focus-within:ring-destructive",
          )}
        >
          <input
            ref={ref}
            id={id}
            type="text"
            inputMode={allowedSign === "positive" ? "numeric" : "decimal"}
            value={inputValue}
            placeholder={placeholder}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            readOnly={readOnly}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className={cn(
              "min-w-0 flex-1 bg-transparent py-1 pl-3 text-right text-sm tabular-nums outline-none",
              "placeholder:text-muted-foreground",
              uomLabel ? "pr-2" : "pr-3",
              disabled && "cursor-not-allowed",
            )}
          />

          {uomLabel && (
            isUomInteractive ? (
              <Popover.Root open={uomOpen} onOpenChange={setUomOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    aria-label={`Unit: ${uomLabel}. Click to change.`}
                    className={cn(
                      "flex shrink-0 select-none items-center gap-0.5 border-l border-input/60 bg-muted/50 px-2 text-xs font-medium tabular-nums",
                      "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                  >
                    {uomLabel}
                    <ChevronDown
                      className={cn(
                        "size-3 shrink-0 transition-transform",
                        uomOpen && "rotate-180",
                      )}
                    />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-popover min-w-[140px] rounded-md border bg-popover shadow-md animate-in fade-in-0 zoom-in-95"
                    align="end"
                    sideOffset={4}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    {uomLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      </div>
                    ) : uomOptions.length === 0 ? (
                      <p className="px-3 py-2.5 text-xs text-muted-foreground">No options</p>
                    ) : (
                      <div className="p-1">
                        {uomOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onUomChange?.(opt.value);
                              setUomOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                              "hover:bg-accent hover:text-accent-foreground",
                              uomCode === opt.value && "bg-accent/50 font-medium",
                            )}
                          >
                            <span className="w-8 shrink-0 tabular-nums">{opt.code}</span>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            ) : (
              <span
                aria-hidden
                className="flex shrink-0 select-none items-center border-l border-input/60 bg-muted/50 px-2.5 text-xs font-medium tabular-nums text-muted-foreground"
              >
                {uomLabel}
              </span>
            )
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  },
);

QuantityInput.displayName = "QuantityInput";

// ── QuantityView ──────────────────────────────────────────────────────────────

export function QuantityView({
  value,
  uomCode,
  uomSymbol,
  uomDisplay = "code",
  displayScale = 3,
  locale,
  className,
}: QuantityViewProps) {
  if (value == null) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>—</span>
    );
  }

  const numStr = formatNumber(value, displayScale, locale);
  const uomLabel: string | null =
    uomDisplay === "none" ? null :
    uomDisplay === "symbol" ? (uomSymbol ?? uomCode ?? null) :
    (uomCode ?? null);

  return (
    <span className={cn("inline-flex items-baseline gap-1 tabular-nums text-sm", className)}>
      <span>{numStr}</span>
      {uomLabel && (
        <span className="text-xs text-muted-foreground">{uomLabel}</span>
      )}
    </span>
  );
}
