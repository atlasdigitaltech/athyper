"use client";

/**
 * DatePicker — themed date/datetime picker with Radix Popover + CalendarGrid.
 *
 * For "date" mode: opens CalendarGrid (fully themed, no browser native picker).
 * For "datetime" mode: CalendarGrid + a compact time input below.
 */

import { useCallback, useId } from "react";
import { CalendarDays, X } from "lucide-react";
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
}: DatePickerProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const display = formatDisplay(value, mode);

  const handleDateChange = useCallback(
    (date: string | null) => {
      if (!date) { onChange?.(null); return; }
      if (mode === "datetime") {
        onChange?.(`${date}T${timePart(value)}`);
      } else {
        onChange?.(date);
      }
    },
    [mode, onChange, value],
  );

  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const dp = datePartOf(value) ?? datePartOf(new Date().toISOString().slice(0, 10));
      onChange?.(`${dp}T${e.target.value}`);
    },
    [onChange, value],
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
            "z-50 rounded-xl border border-border bg-card p-3 shadow-lg",
            "animate-in fade-in-0 zoom-in-95",
          )}
          align="start"
          sideOffset={4}
        >
          <CalendarGrid
            value={datePartOf(value)}
            onChange={handleDateChange}
            disabled={disabled}
          />

          {mode === "datetime" && (
            <div className="mt-3 border-t border-border pt-3">
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
          )}

          {error && (
            <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
