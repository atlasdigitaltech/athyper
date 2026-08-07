"use client";

/**
 * DatePicker v2 — kind-aware date/time picker (string-valued kinds only).
 *
 *   businessDate — calendar date, no TZ.   value: "YYYY-MM-DD" | null
 *   instant      — absolute UTC moment.    value: "...Z" ISO   | null
 *
 * The `kind` prop defaults to "businessDate" so existing callers (which
 * pass YYYY-MM-DD strings) keep working without change. The legacy
 * `mode` prop is preserved: mode="date" → businessDate, mode="datetime" → instant.
 *
 * For `zonedDateTime` fields (object-valued), use the dedicated
 * `ZonedDateTimePicker` component shipping in Phase 4.
 *
 * Visual style unchanged from v1: Radix popover + themed CalendarGrid. Date
 * mode auto-closes on select; instant mode stays open so the user can adjust
 * the time before pressing Done.
 */

import { useCallback, useId, useState } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@athyper/platform-theme/utils";
import {
  parseBusinessDate,
  parseInstant,
  formatBusinessDate,
  formatInstant,
  todayInZone,
  utcFromZoneWallClock,
  type TemporalKind,
  type WeekStart,
} from "@athyper/platform-temporal";
import { CalendarGrid } from "./calendar-grid";

// ─── Legacy shape (kept for back-compat) ───────────────────────────────────
/** @deprecated use `kind` instead. */
export type DatePickerMode = "date" | "datetime";

// ─── Props ─────────────────────────────────────────────────────────────────
/**
 * `DatePicker` handles the string-valued kinds (businessDate + instant).
 * The object-valued `zonedDateTime` kind ships in a sibling component
 * (`ZonedDateTimePicker`) in Phase 4 so legacy string-only callers do not
 * need to narrow the value type at every call site.
 */
export type DatePickerKind = Exclude<TemporalKind, "zonedDateTime">;
export type DatePickerValue = string | null;

export interface DatePickerProps {
  /**
   * Temporal kind. Defaults to "businessDate" so existing string-valued
   * callers continue to work. Pass "instant" explicitly for UTC moments.
   * For "zonedDateTime", use the dedicated ZonedDateTimePicker component (Phase 4).
   */
  kind?: DatePickerKind;
  value?: DatePickerValue;
  onChange?: (value: DatePickerValue) => void;
  /** @deprecated use `kind`. mode="date" → "businessDate", mode="datetime" → "instant". */
  mode?: DatePickerMode;
  /** BCP-47 locale for display. Falls back to browser locale when omitted. */
  locale?: string;
  /**
   * IANA zone. For kind="instant" — drives display + edit wall clock.
   * For kind="businessDate" — only affects the "Today" button.
   * For kind="zonedDateTime" — the zone that the picker writes into the value.
   */
  timeZone?: string;
  /** Override the locale-derived first day of week. */
  weekStart?: WeekStart;
  /** sprintf template (%d, %m, %Y, %b, %B) for businessDate display. */
  dateFormat?: string;
  /** Earliest selectable businessDate (inclusive) — "YYYY-MM-DD". */
  min?: string | null;
  /** Latest selectable businessDate (inclusive) — "YYYY-MM-DD". */
  max?: string | null;
  /** Custom per-cell guard for businessDate. Return true to disable. */
  isDateDisabled?: (iso: string) => boolean;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  clearable?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  /**
   * Density variant. `md` (default) uses 32px cells. `sm` shaves ~40px of
   * height so the popover fits in dense forms without clipping against the
   * viewport top. See CalendarGrid `size` prop.
   */
  size?: "sm" | "md";
  className?: string;
  id?: string;
  /** Optional override of the rendered string. Receives the raw value + resolved kind. */
  formatDisplay?: (value: string | null | undefined, kind: DatePickerKind) => string;
}

// ─── Internal shape ───────────────────────────────────────────────────────

interface InternalParts {
  ymd: string | null;        // "YYYY-MM-DD" or null
  hour: number;              // 0-23 (wall-clock in the display zone for instant)
  minute: number;            // 0-59
}

function resolveKind(kind: DatePickerKind | undefined, mode: DatePickerMode | undefined): DatePickerKind {
  if (kind) return kind;
  if (mode === "datetime") return "instant";
  return "businessDate";
}

function decompose(value: DatePickerValue, kind: DatePickerKind, timeZone: string): InternalParts {
  if (value == null) return { ymd: null, hour: 0, minute: 0 };

  if (kind === "businessDate") {
    try {
      const ymd = value.length === 10 ? parseBusinessDate(value) : value.slice(0, 10);
      return { ymd, hour: 0, minute: 0 };
    } catch {
      return { ymd: null, hour: 0, minute: 0 };
    }
  }

  // instant
  try {
    parseInstant(value);
  } catch {
    // Tolerate legacy "YYYY-MM-DDTHH:mm" without Z (mode="datetime" used to emit this).
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
    if (m) return { ymd: m[1]!, hour: Number(m[2]), minute: Number(m[3]) };
    return { ymd: null, hour: 0, minute: 0 };
  }
  // Project the UTC moment into the display zone.
  // eslint-disable-next-line no-direct-date-parse -- reason: parseInstant already validated canonical UTC ISO
  const ms = Date.parse(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ms);
  const get = (t: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? 0 : Number(get("hour"));
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute: Number(get("minute")),
  };
}

function compose(
  parts: InternalParts,
  kind: DatePickerKind,
  timeZone: string,
): DatePickerValue {
  if (!parts.ymd) return null;
  if (kind === "businessDate") return parts.ymd;
  // instant
  const [y, mo, d] = parts.ymd.split("-").map(Number) as [number, number, number];
  return utcFromZoneWallClock(y, mo, d, parts.hour, parts.minute, timeZone);
}

function defaultFormatDisplay(
  value: DatePickerValue,
  kind: DatePickerKind,
  locale: string | undefined,
  timeZone: string,
  dateFormat: string | undefined,
): string {
  if (value == null) return "";
  const resolvedLocale = locale ?? "en";
  try {
    if (kind === "businessDate") {
      const ymd = value.length === 10 ? value : value.slice(0, 10);
      return formatBusinessDate(ymd, { locale: resolvedLocale, template: dateFormat });
    }
    // instant
    return formatInstant(value, { locale: resolvedLocale, timeZone });
  } catch {
    return value;
  }
}

// Some legacy callers pass the time component back via the timeZone offset of
// the *browser*. Used as the fall-back display zone for `kind="instant"` when
// no explicit timeZone prop is provided.
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function DatePicker(props: DatePickerProps): React.JSX.Element {
  const {
    kind: kindProp,
    mode,
    value,
    onChange,
    locale,
    timeZone: timeZoneProp,
    weekStart,
    dateFormat,
    min,
    max,
    isDateDisabled,
    placeholder,
    disabled,
    error,
    clearable = true,
    popoverSide = "bottom",
    popoverAlign = "start",
    size = "md",
    className,
    id: externalId,
    formatDisplay: customFormatDisplay,
  } = props;

  const generatedId = useId();
  const id = externalId ?? generatedId;
  const errorId = `${id}-error`;
  const kind = resolveKind(kindProp, mode);
  const timeZone = timeZoneProp ?? (kind === "businessDate" ? "UTC" : browserTimeZone());

  const parts = decompose(value ?? null, kind, timeZone);
  const display = customFormatDisplay
    ? customFormatDisplay(value ?? null, kind)
    : defaultFormatDisplay(value ?? null, kind, locale, timeZone, dateFormat);

  const [open, setOpen] = useState(false);

  const handleDateChange = useCallback(
    (date: string | null) => {
      if (!date) {
        onChange?.(null);
        setOpen(false);
        return;
      }
      const next = compose({ ymd: date, hour: parts.hour, minute: parts.minute }, kind, timeZone);
      onChange?.(next);
      if (kind === "businessDate") setOpen(false);
    },
    [kind, onChange, parts.hour, parts.minute, timeZone],
  );

  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const [hStr, mStr] = e.target.value.split(":") as [string, string];
      const h = Number(hStr);
      const m = Number(mStr);
      if (Number.isNaN(h) || Number.isNaN(m)) return;
      const ymd = parts.ymd ?? todayInZone(timeZone);
      const next = compose({ ymd, hour: h, minute: m }, kind, timeZone);
      onChange?.(next);
    },
    [kind, onChange, parts.ymd, timeZone],
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

  const showTime = kind !== "businessDate";
  const hasValue = value != null;

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
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1",
              "text-left text-sm font-normal",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              open && "border-ring ring-1 ring-ring",
              error && "border-destructive ring-1 ring-destructive",
              hasValue && !disabled && clearable && "pr-8",
              className,
            )}
          >
            <span className={cn("flex min-w-0 items-center gap-2", !display && "text-muted-foreground")}>
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">
                {display || (placeholder ?? (showTime ? "Pick date & time" : "Pick a date"))}
              </span>
            </span>
          </button>
        </Popover.Trigger>

        {hasValue && !disabled && clearable && (
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
            "z-popover rounded-xl border border-border bg-background shadow-xl",
            "animate-in fade-in-0 zoom-in-95",
            size === "sm" ? "p-2" : "p-3",
          )}
          side={popoverSide}
          align={popoverAlign}
          sideOffset={6}
          avoidCollisions
          // Generous top padding reserves headroom for the browser chrome —
          // without it, the pager row can end up behind the tab bar when
          // Radix flips the popover above a trigger positioned high in the
          // viewport. See the fix that shipped with the size prop.
          collisionPadding={{ top: 80, bottom: 12, left: 12, right: 12 }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CalendarGrid
            value={parts.ymd}
            onChange={handleDateChange}
            disabled={disabled}
            locale={locale}
            timeZone={timeZone}
            weekStart={weekStart}
            min={min}
            max={max}
            isDateDisabled={kind === "businessDate" ? isDateDisabled : undefined}
            onRequestClose={() => setOpen(false)}
            size={size}
          />

          {showTime && (
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <div>
                <label htmlFor={`${id}-time`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Time{kind === "instant" && timeZone !== "UTC" ? ` (${timeZone})` : ""}
                </label>
                <input
                  id={`${id}-time`}
                  type="time"
                  value={`${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`}
                  onChange={handleTimeChange}
                  disabled={disabled}
                  className={cn(
                    "h-8 w-full rounded-md border border-input bg-background px-2 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
            <p id={errorId} className="mt-2 text-xs text-destructive" role="alert">{error}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Re-export for convenience.
export type { TemporalKind, WeekStart };

