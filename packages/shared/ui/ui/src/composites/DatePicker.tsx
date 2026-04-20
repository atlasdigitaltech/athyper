"use client";

/**
 * DatePicker — date/datetime input with Radix Popover calendar overlay.
 *
 * Sprint 0: Controlled wrapper around native date inputs with popover chrome.
 * Sprint 6 enhancement: swap inner calendar for a full grid calendar.
 *
 * Extracted pattern from F1/field-renderers/DatePickerRenderer.tsx
 * but built as a standalone, data-agnostic composite.
 */

import { CalendarDays, X } from "lucide-react";
import { forwardRef, useCallback, useId } from "react";

import * as Popover from "@radix-ui/react-popover";

import { cn } from "@athyper/theme/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DatePickerMode = "date" | "datetime";

export interface DatePickerProps {
  /** ISO 8601 date string (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm). */
  value?: string | null;
  onChange?: (value: string | null) => void;
  mode?: DatePickerMode;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      mode = "date",
      placeholder,
      disabled,
      error,
      className,
      id: externalId,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;

    const displayValue = formatForDisplay(value, mode);
    const inputValue = formatForInput(value, mode);
    const inputType = mode === "datetime" ? "datetime-local" : "date";

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e.target.value || null);
      },
      [onChange],
    );

    const handleClear = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange?.(null);
      },
      [onChange],
    );

    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1",
              "text-left text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive ring-1 ring-destructive",
              className,
            )}
          >
            <span
              className={cn(
                "flex items-center gap-2",
                !displayValue && "text-muted-foreground",
              )}
            >
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              {displayValue || (placeholder ?? (mode === "datetime" ? "Pick date & time" : "Pick a date"))}
            </span>

            {value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="ml-1 rounded-sm text-muted-foreground hover:text-foreground"
                aria-label="Clear date"
              >
                <X className="size-3.5" />
              </button>
            )}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-auto rounded-md border bg-popover p-3 shadow-md animate-in fade-in-0 zoom-in-95"
            align="start"
            sideOffset={4}
          >
            <input
              ref={ref}
              type={inputType}
              value={inputValue}
              onChange={handleChange}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={mode === "datetime" ? "Select date and time" : "Select date"}
            />
            {error && (
              <p className="mt-1.5 text-xs text-destructive">{error}</p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);

DatePicker.displayName = "DatePicker";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatForInput(value: string | null | undefined, mode: DatePickerMode): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    if (mode === "datetime") return d.toISOString().slice(0, 16);
    return d.toISOString().split("T")[0]!;
  } catch {
    return "";
  }
}

function formatForDisplay(value: string | null | undefined, mode: DatePickerMode): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    if (mode === "datetime") {
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    }
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return value;
  }
}
