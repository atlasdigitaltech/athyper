"use client";

/**
 * ZonedDateTimePicker — editor for the `zonedDateTime` temporal kind.
 *
 * Why a separate component (not just a `kind="zonedDateTime"` mode on
 * DatePicker)? Value shape: this picker holds and emits an object
 * `{ localDateTime: "YYYY-MM-DDTHH:mm:ss", timeZone: "Asia/Riyadh" } | null`,
 * not a string. Forcing every legacy string-only caller to narrow at every
 * call site would have broken back-compat. The two pickers therefore live
 * as siblings.
 *
 * Semantic contract: a zonedDateTime is a *wall-clock in a fixed zone*. The
 * picker never silently converts to the viewer's TZ — even a Tokyo user sees
 * 18:00 Asia/Riyadh as 18:00 Asia/Riyadh, with the zone label visible. That's
 * the whole point of the kind: 18:00 in Riyadh means 18:00 in Riyadh, full stop.
 *
 * Visual style mirrors DatePicker: Radix popover + themed CalendarGrid + a
 * time editor + a zone dropdown defaulting to the prop-supplied zone.
 */

import { useCallback, useId, useState, useMemo } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@athyper/theme/utils";
import {
  parseZonedDateTime,
  formatZonedDateTime,
  todayInZone,
  type ZonedDateTimeValue,
  type WeekStart,
} from "@athyper/temporal";
import { CalendarGrid } from "./calendar-grid";

export interface ZonedDateTimePickerProps {
  value?: ZonedDateTimeValue | null;
  onChange?: (value: ZonedDateTimeValue | null) => void;
  /** BCP-47 locale for the date trigger display. */
  locale?: string;
  /**
   * Default zone applied when the picker first emits a value. If the value
   * already has a zone, that wins.
   */
  defaultTimeZone?: string;
  weekStart?: WeekStart;
  min?: string | null;
  max?: string | null;
  isDateDisabled?: (iso: string) => boolean;
  /**
   * Optional curated list of zones to show in the dropdown. Defaults to the
   * full IANA list from Intl.supportedValuesOf("timeZone").
   */
  timeZoneOptions?: ReadonlyArray<string>;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  clearable?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  /** Density variant, forwarded to CalendarGrid. See DatePicker. */
  size?: "sm" | "md";
  className?: string;
  id?: string;
}

interface InternalParts {
  ymd: string | null;
  hour: number;
  minute: number;
  timeZone: string;
}

function decompose(value: ZonedDateTimeValue | null, fallbackZone: string): InternalParts {
  if (!value) return { ymd: null, hour: 0, minute: 0, timeZone: fallbackZone };
  try {
    const parsed = parseZonedDateTime(value);
    const [date, time] = parsed.localDateTime.split("T") as [string, string];
    const [h, mi] = time.split(":") as [string, string];
    return { ymd: date, hour: Number(h), minute: Number(mi), timeZone: parsed.timeZone };
  } catch {
    return { ymd: null, hour: 0, minute: 0, timeZone: fallbackZone };
  }
}

function compose(parts: InternalParts): ZonedDateTimeValue | null {
  if (!parts.ymd) return null;
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return { localDateTime: `${parts.ymd}T${hh}:${mm}:00`, timeZone: parts.timeZone };
}

function defaultFormatDisplay(value: ZonedDateTimeValue | null, locale: string | undefined): string {
  if (!value) return "";
  try {
    return formatZonedDateTime(value, { locale: locale ?? "en", showZone: true });
  } catch {
    return `${value.localDateTime} [${value.timeZone}]`;
  }
}

function loadSupportedZones(): ReadonlyArray<string> {
  // Intl.supportedValuesOf is ES2022; the type lib lists it. Fall back to a
  // small curated list if a runtime gap shows up.
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.("timeZone");
    if (list && list.length > 0) return list;
  } catch {
    // ignore
  }
  return FALLBACK_ZONES;
}

const FALLBACK_ZONES: ReadonlyArray<string> = [
  "UTC",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
];

export function ZonedDateTimePicker(props: ZonedDateTimePickerProps): React.JSX.Element {
  const {
    value,
    onChange,
    locale,
    defaultTimeZone,
    weekStart,
    min,
    max,
    isDateDisabled,
    timeZoneOptions,
    placeholder,
    disabled,
    error,
    clearable = true,
    popoverSide = "bottom",
    popoverAlign = "start",
    size = "md",
    className,
    id: externalId,
  } = props;

  const generatedId = useId();
  const id = externalId ?? generatedId;
  const errorId = `${id}-error`;
  const fallbackZone = defaultTimeZone || "UTC";

  const parts = decompose(value ?? null, fallbackZone);
  const display = defaultFormatDisplay(value ?? null, locale);

  const allZones = useMemo(
    () => timeZoneOptions ?? loadSupportedZones(),
    [timeZoneOptions],
  );

  const [open, setOpen] = useState(false);

  const handleDateChange = useCallback(
    (date: string | null) => {
      if (!date) {
        onChange?.(null);
        setOpen(false);
        return;
      }
      const next = compose({ ymd: date, hour: parts.hour, minute: parts.minute, timeZone: parts.timeZone });
      onChange?.(next);
    },
    [onChange, parts.hour, parts.minute, parts.timeZone],
  );

  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const [hStr, mStr] = e.target.value.split(":") as [string, string];
      const h = Number(hStr);
      const m = Number(mStr);
      if (Number.isNaN(h) || Number.isNaN(m)) return;
      const ymd = parts.ymd ?? todayInZone(parts.timeZone);
      const next = compose({ ymd, hour: h, minute: m, timeZone: parts.timeZone });
      onChange?.(next);
    },
    [onChange, parts.ymd, parts.timeZone],
  );

  const handleZoneChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const tz = e.target.value;
      const next = compose({ ymd: parts.ymd, hour: parts.hour, minute: parts.minute, timeZone: tz });
      onChange?.(next);
    },
    [onChange, parts.hour, parts.minute, parts.ymd],
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
                {display || (placeholder ?? "Pick date, time & zone")}
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
          collisionPadding={{ top: 80, bottom: 12, left: 12, right: 12 }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CalendarGrid
            value={parts.ymd}
            onChange={handleDateChange}
            disabled={disabled}
            locale={locale}
            timeZone={parts.timeZone}
            weekStart={weekStart}
            min={min}
            max={max}
            isDateDisabled={isDateDisabled}
            onRequestClose={() => setOpen(false)}
            size={size}
          />

          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <div>
              <label htmlFor={`${id}-time`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Time
              </label>
              <input
                id={`${id}-time`}
                type="time"
                value={`${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`}
                onChange={handleTimeChange}
                disabled={disabled}
                className={cn(
                  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-primary/40",
                  "disabled:opacity-50",
                )}
              />
            </div>

            <div>
              <label htmlFor={`${id}-zone`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Timezone
              </label>
              <select
                id={`${id}-zone`}
                value={parts.timeZone}
                onChange={handleZoneChange}
                disabled={disabled}
                className={cn(
                  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-primary/40",
                  "disabled:opacity-50",
                )}
              >
                {!allZones.includes(parts.timeZone) && (
                  <option value={parts.timeZone}>{parts.timeZone}</option>
                )}
                {allZones.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
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

          {error && (
            <p id={errorId} className="mt-2 text-xs text-destructive" role="alert">{error}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export type { ZonedDateTimeValue, WeekStart };

