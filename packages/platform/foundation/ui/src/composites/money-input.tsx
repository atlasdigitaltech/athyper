"use client";

/**
 * MoneyInput / MoneyView — precision-aware currency input.
 *
 * MoneyInput:
 *   - type="text" + inputMode for full control over formatting
 *   - Blurred state: locale-formatted with thousand separators (displayScale dp)
 *   - Focused state: raw number string at commitScale dp (what will be committed)
 *   - onPaste: strips Excel thousand separators, clamps to commitScale via Decimal.js
 *   - onBlur:  rounds to roundingRule using Decimal.js (exact arithmetic, no IEEE 754 drift)
 *   - allowedSign: "positive" | "negative" | "both" — for invoices, credit memos, journals
 *   - currencyDisplay: "symbol" | "code" | "both" | "none"
 *
 * MoneyView:
 *   - Intl.NumberFormat with style:"currency" or "decimal" depending on currencyDisplay
 *   - symbol prefix, number, code suffix — each styled separately
 */

import Decimal from "decimal.js";
import { forwardRef, useCallback, useId, useState } from "react";
import { cn } from "@athyper/platform-theme/utils";

// ── Rounding ──────────────────────────────────────────────────────────────────

export type RoundingMethod =
  | "ROUND_HALF_UP"
  | "ROUND_HALF_EVEN"
  | "ROUND_DOWN"
  | "ROUND_UP";

export interface ResolvedRoundingRule {
  /** Rounding algorithm — maps to Decimal.js rounding mode. */
  method: RoundingMethod;
  /** Decimal places for commit precision — from rounding_context slot resolution. */
  scale: number;
  /** Non-decimal step — CHF=0.05, COP=50. When set, overrides scale-based rounding. */
  increment?: number;
}

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

// ── Currency label resolution ─────────────────────────────────────────────────

function resolveSymbol(
  code: string | undefined,
  explicit: string | undefined,
  locale: string | undefined,
): string | null {
  if (explicit) return explicit;
  if (!code) return null;
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? null;
  } catch {
    return code;
  }
}

function formatNumber(value: number, scale: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "decimal",
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
    useGrouping: true,
  }).format(value);
}

function buildPlaceholder(scale: number, sign: "positive" | "negative" | "both"): string {
  const digits = scale > 0 ? `0.${"0".repeat(scale)}` : "0";
  return sign === "negative" ? `-${digits}` : digits;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MoneyInputProps {
  value?: number | null;
  onChange?: (value: number | null) => void;

  /** ISO 4217 code — "USD", "MYR", "INR". */
  currencyCode?: string;
  /** Explicit glyph — "$", "RM", "₹". Auto-resolved from currencyCode when absent. */
  currencySymbol?: string;
  /**
   * What currency indicator(s) to show.
   *   "symbol" → ₹ prefix only
   *   "code"   → INR prefix only  (default)
   *   "both"   → ₹ prefix + INR suffix
   *   "none"   → no indicator
   */
  currencyDisplay?: "symbol" | "code" | "both" | "none";

  /**
   * Display precision from currency.minor_units.
   * Drives blurred view formatting and placeholder. Default 2.
   */
  displayScale?: number;

  /**
   * Commit rounding rule from rounding_context slot resolution.
   * Drives onPaste clamp and onBlur Decimal.js rounding.
   * Falls back to { method: "ROUND_HALF_UP", scale: displayScale } when absent.
   */
  roundingRule?: ResolvedRoundingRule;

  /**
   * Sign constraint.
   *   "positive" — vendor invoices, receipts (blocks minus key, clamps to >= 0)
   *   "negative" — credit memos, reversals (clamps to <= 0)
   *   "both"     — journal entries, adjustments (default)
   */
  allowedSign?: "positive" | "negative" | "both";

  /** Explicit numeric floor. Overrides allowedSign lower bound when set. */
  min?: number;
  /** Explicit numeric ceiling. Overrides allowedSign upper bound when set. */
  max?: number;

  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  /** BCP-47 locale. Drives grouping separators and decimal mark. Default: browser. */
  locale?: string;
  className?: string;
  id?: string;

  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

export interface MoneyViewProps {
  value?: number | null;
  currencyCode?: string;
  currencySymbol?: string;
  currencyDisplay?: "symbol" | "code" | "both" | "none";
  displayScale?: number;
  locale?: string;
  className?: string;
}

// ── MoneyInput ────────────────────────────────────────────────────────────────

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      value,
      onChange,
      currencyCode,
      currencySymbol,
      currencyDisplay = "code",
      displayScale = 2,
      roundingRule,
      allowedSign = "both",
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

    // Resolve sign bounds — allowedSign sets the default, explicit min/max override
    const signMin = allowedSign === "positive" ? (min ?? 0) : min;
    const signMax = allowedSign === "negative" ? (max ?? 0) : max;

    const [focused, setFocused] = useState(false);
    const [editStr, setEditStr] = useState("");

    // ── Currency label resolution ───────────────────────────────────────────
    const symbol = resolveSymbol(currencyCode, currencySymbol, locale);

    const prefix: string | null =
      currencyDisplay === "symbol" ? symbol :
      currencyDisplay === "code"   ? (currencyCode ?? null) :
      currencyDisplay === "both"   ? symbol :
      null;

    const suffix: string | null =
      currencyDisplay === "both" ? (currencyCode ?? null) : null;

    // ── Input display value ─────────────────────────────────────────────────
    // Focused: raw number string (commit scale visible, no thousand separators)
    // Blurred: locale-formatted at displayScale with grouping
    const inputValue = focused
      ? editStr
      : (value != null ? formatNumber(value, displayScale, locale) : "");

    const placeholder =
      placeholderProp ?? buildPlaceholder(displayScale, allowedSign);

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
        // Enter edit mode — show raw number at full commit precision
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
        // Emit live intermediate values for server preview — partial inputs emit null
        const s = str.replace(/\s/g, "");
        if (!s || s === "-" || s === ".") {
          onChange?.(null);
          return;
        }
        try {
          onChange?.(new Decimal(s).toNumber());
        } catch {
          // Invalid partial input — do not emit
        }
      },
      [onChange],
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        // Authoritative client-side round using Decimal.js — matches server arithmetic
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
        // Strip Excel locale thousand separators (commas/spaces) before parsing
        const cleaned = raw.trim().replace(/,/g, "");
        if (!/^-?\d*\.?\d*$/.test(cleaned)) return; // non-numeric — let browser handle
        e.preventDefault();
        const d = roundDecimal(cleaned, effectiveRule);
        if (!d) return;
        const clamped = clampDecimal(d, signMin, signMax);
        const str = clamped.toString();
        setEditStr(str);
        onChange?.(clamped.toNumber());
      },
      [effectiveRule, signMin, signMax, onChange],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Pass through: modifier combos, multi-char keys (Backspace, ArrowLeft, Tab…)
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length > 1) return;
        // Allow digits
        if (/^\d$/.test(e.key)) return;
        // Allow decimal point (once only)
        if (e.key === "." && !editStr.includes(".")) return;
        // Allow minus at position 0 when sign permits
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
          {prefix && (
            <span
              aria-hidden
              className="flex shrink-0 select-none items-center border-r border-input/60 bg-muted/50 px-2.5 text-xs font-medium tabular-nums text-muted-foreground"
            >
              {prefix}
            </span>
          )}

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
              "min-w-0 flex-1 bg-transparent py-1 text-right text-sm tabular-nums outline-none",
              "placeholder:text-muted-foreground",
              prefix ? "pl-2" : "pl-3",
              suffix ? "pr-2" : "pr-3",
              disabled && "cursor-not-allowed",
            )}
          />

          {suffix && (
            <span
              aria-hidden
              className="flex shrink-0 select-none items-center border-l border-input/60 bg-muted/50 px-2.5 text-xs font-medium text-muted-foreground"
            >
              {suffix}
            </span>
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

MoneyInput.displayName = "MoneyInput";

// ── MoneyView ─────────────────────────────────────────────────────────────────

export function MoneyView({
  value,
  currencyCode,
  currencySymbol,
  currencyDisplay = "code",
  displayScale = 2,
  locale,
  className,
}: MoneyViewProps) {
  if (value == null) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>—</span>
    );
  }

  const symbol = resolveSymbol(currencyCode, currencySymbol, locale);
  const numStr = formatNumber(value, displayScale, locale);

  const showSymbol = currencyDisplay === "symbol" || currencyDisplay === "both";
  const showCode   = currencyDisplay === "code"   || currencyDisplay === "both";

  return (
    <span className={cn("inline-flex items-baseline gap-0.5 tabular-nums text-sm", className)}>
      {showSymbol && symbol && (
        <span className="text-muted-foreground">{symbol}</span>
      )}
      <span>{numStr}</span>
      {showCode && currencyCode && (
        <span className="ml-1 text-xs text-muted-foreground">{currencyCode}</span>
      )}
    </span>
  );
}
