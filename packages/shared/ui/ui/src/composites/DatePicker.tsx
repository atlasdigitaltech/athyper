"use client";

/**
 * DatePicker — themed date/datetime picker with Radix Popover + CalendarGrid.
 *
 * Behaviour:
 *   date mode     — popover closes automatically after the user picks a day
 *                   (Today button also closes; Clear closes and resets)
 *   datetime mode — popover stays open after day pick so the user can also
 *                   set the time; a "Done" button closes it explicitly
 *
 * Navigation in CalendarGrid:
 *   « / » = prev/next year
 *   ‹ / › = prev/next month
 *   Click month+year header = year-picker grid (12 years at a time)
 */

import { useCallback, useId, useState } from "react";
import { CalendarDays, X, Check } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@athyper/theme/utils";
import { CalendarGrid } from "./CalendarGrid";

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
  formatDisplay?: (value: string | null | undefined, mode: DatePickerMode) => string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function datePartOf(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("T")[0] ?? null;
}

function timePart(value: string | null | undefined): string {
  if (!value) return "00:00";
  const t = value.split("T")[1];
  return t ? t.slice(0, 5) : "00:00";
}

function formatDisplay(value: string | null | undefined, mode: DatePickerMode): string {
  if (!value) return "";
  try {
    const d = new Date(mode === "date" ? value + "T00:00:00" : value);
    if (isNaN(d.getTime())) return value;
    if (mode === "datetime") {
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return value;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DatePicker({
  value,
  onChange,
  mode = "date",
  placeholder,
  disabled,
  error,
  className,
  id: externalId,
  formatDisplay: customFormatDisplay,
}: DatePickerProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const display = value
    ? customFormatDisplay ? customFormatDisplay(value, mode) : formatDisplay(value, mode)
    : "";

  // Controlled open state — required to programmatically close the popover
  const [open, setOpen] = useState(false);

  const handleDateChange = useCallback(
    (date: string | null) => {
      if (!date) {
        onChange?.(null);
        // "Clear" in CalendarGrid footer — close the popover
        setOpen(false);
        return;
      }
      if (mode === "datetime") {
        // In datetime mode stay open so user can also pick the time
        onChange?.(`${date}T${timePart(value)}`);
      } else {
        onChange?.(date);
        // Auto-close after date selection in date mode
        setOpen(false);
      }
    },
    [mode, onChange, value],
  );

  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const dp = datePartOf(value) ?? new Date().toISOString().slice(0, 10);
      onChange?.(`${dp}T${e.target.value}`);
    },
    [onChange, value],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(null);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1",
            "text-left text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            open && "ring-2 ring-ring",
            error && "border-destructive ring-1 ring-destructive",
            className,
          )}
        >
          <span className={cn("flex items-center gap-2", !display && "text-muted-foreground")}>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            {display || (placeholder ?? (mode === "datetime" ? "Pick date & time" : "Pick a date"))}
          </span>

          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="ml-1 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="Clear date"
            >
              <X className="size-3.5" />
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className={cn(
            "z-popover rounded-xl border border-border bg-card p-3 shadow-lg",
            "animate-in fade-in-0 zoom-in-95",
          )}
          side="top"
          align="start"
          sideOffset={6}
          avoidCollisions
          collisionBoundary={[]}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CalendarGrid
            value={datePartOf(value)}
            onChange={handleDateChange}
            disabled={disabled}
          />

          {mode === "datetime" && (
            <div className="mt-3 border-t border-border pt-3 space-y-3">
              <div>
                <label className="mb-1.5 block text-doc-support font-medium uppercase tracking-wide text-muted-foreground">
                  Time
                </label>
                <input
                  type="time"
                  value={timePart(value)}
                  onChange={handleTimeChange}
                  disabled={disabled}
                  className={cn(
                    "h-8 w-full rounded-md border border-input bg-background px-2 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/40",
                    "disabled:opacity-50",
                  )}
                />
              </div>

              {/* Done button — closes the popover in datetime mode */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-md h-8 text-sm font-medium",
                  "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Check className="size-3.5" />
                Done
              </button>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
