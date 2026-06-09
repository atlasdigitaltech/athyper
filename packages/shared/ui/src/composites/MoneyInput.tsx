"use client";

/**
 * MoneyInput — numeric amount input with currency display.
 *
 * Edit mode: masked number input with correct decimal scale.
 * View mode: locale-formatted currency string.
 *
 * Extracted and genericised from F1/field-renderers/MoneyRenderer.tsx.
 * Does NOT depend on entity metadata — all config passed via props.
 */

import { forwardRef, useCallback, useId } from "react";

import { cn } from "@athyper/theme/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MoneyInputProps {
  value?: number | null;
  onChange?: (value: number | null) => void;
  /** ISO 4217 currency code (e.g. "USD", "MYR"). Display only. */
  currencyCode?: string;
  /** Number of decimal places (default: 2). */
  scale?: number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

export interface MoneyViewProps {
  value?: number | null;
  currencyCode?: string;
  scale?: number;
  className?: string;
}

// ── MoneyInput (edit mode) ─────────────────────────────────────────────────

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      value,
      onChange,
      currencyCode,
      scale = 2,
      placeholder = "0.00",
      disabled,
      readOnly,
      error,
      className,
      id: externalId,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;

    const step = (10 ** -scale).toString();

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === "" || raw === "-") {
          onChange?.(null);
          return;
        }
        const num = parseFloat(raw);
        onChange?.(isNaN(num) ? null : num);
      },
      [onChange],
    );

    return (
      <div className={className}>
        <div className="relative flex items-center">
          {currencyCode && (
            <span
              className="pointer-events-none absolute left-3 text-xs font-medium text-muted-foreground"
              aria-hidden
            >
              {currencyCode}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            type="number"
            value={value ?? ""}
            onChange={handleChange}
            step={step}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            aria-invalid={!!error}
            className={cn(
              "h-9 w-full rounded-md border border-input bg-background py-1 pr-3 text-right text-sm tabular-nums",
              currencyCode ? "pl-12" : "pl-3",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "read-only:bg-muted",
              error && "border-destructive ring-1 ring-destructive",
            )}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

MoneyInput.displayName = "MoneyInput";

// ── MoneyView (read-only display) ─────────────────────────────────────────────

export function MoneyView({ value, currencyCode, scale = 2, className }: MoneyViewProps) {
  if (value == null) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>—</span>
    );
  }

  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });

  return (
    <span className={cn("tabular-nums text-sm", className)}>
      {currencyCode && (
        <span className="mr-1 text-xs text-muted-foreground">{currencyCode}</span>
      )}
      {formatted}
    </span>
  );
}
