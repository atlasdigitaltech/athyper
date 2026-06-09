"use client";

/**
 * DatePicker: themed date/datetime picker with Radix Popover + CalendarGrid.
 *
 * Date mode closes after selecting a day. Datetime mode stays open so the user
 * can set the time before pressing Done.
 */

import { useCallback, useId, useState } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@athyper/theme/utils";
import { CalendarGrid } from "./CalendarGrid";

export type DatePickerMode = "date" | "datetime";

export interface DatePickerProps {
  /** ISO 8601 date string (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm). */
  value?: string | null;
  onChange?: (value: string | null) => void;
  mode?: DatePickerMode;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  clearable?: boolean;
  popoverAlign?: "start" | "center" | "end";
  className?: string;
  id?: string;
  formatDisplay?: (value: string | null | undefined, mode: DatePickerMode) => string;
}

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

export function DatePicker({
  value,
  onChange,
  mode = "date",
  placeholder,
  disabled,
  error,
  clearable = true,
  popoverAlign = "start",
  className,
  id: externalId,
  formatDisplay: customFormatDisplay,
}: DatePickerProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const display = value
    ? customFormatDisplay ? customFormatDisplay(value, mode) : formatDisplay(value, mode)
    : "";

  // Controlled open state is needed so selections can close the popover.
  const [open, setOpen] = useState(false);

  const handleDateChange = useCallback(
    (date: string | null) => {
      if (!date) {
        onChange?.(null);
        setOpen(false);
        return;
      }
      if (mode === "datetime") {
        onChange?.(`${date}T${timePart(value)}`);
      } else {
        onChange?.(date);
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
      e.preventDefault();
      e.stopPropagation();
      onChange?.(null);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <div className="relative">
        <Popover.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-expanded={open}
            aria-invalid={!!error}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1",
              "text-left text-sm font-normal",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              open && "border-ring ring-1 ring-ring",
              error && "border-destructive ring-1 ring-destructive",
              value && !disabled && clearable && "pr-8",
              className,
            )}
          >
            <span className={cn("flex min-w-0 items-center gap-2", !display && "text-muted-foreground")}>
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">
                {display || (placeholder ?? (mode === "datetime" ? "Pick date & time" : "Pick a date"))}
              </span>
            </span>
          </button>
        </Popover.Trigger>

        {value && !disabled && clearable && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear date"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          className={cn(
            "z-popover rounded-xl border border-border bg-background p-3 shadow-xl",
            "animate-in fade-in-0 zoom-in-95",
          )}
          side="top"
          align={popoverAlign}
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
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
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

              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium",
                  "bg-primary text-primary-foreground transition-opacity hover:opacity-90",
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
