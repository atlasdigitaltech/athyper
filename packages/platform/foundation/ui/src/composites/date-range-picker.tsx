"use client";

/**
 * DateRangePicker — anchored popover with two-month calendar, presets sidebar,
 * and endpoint-swap semantics. Visual style mirrors DatePicker.
 *
 * Value shape:
 *   { from: "YYYY-MM-DD" | null, to: "YYYY-MM-DD" | null, preset?: key | null }
 *
 * The `preset` field is the mechanism that keeps "Last 30 days" always meaning
 * *the last 30 days from now*: consumers persist the preset key rather than the
 * resolved dates, and the server re-resolves at query time. See
 * @athyper/finance-rules::resolveDateRangePreset for the shared predicate.
 *
 * Two-month view is shown on `md:` viewports and above (768px+) when `months`
 * is `2`; narrower viewports get one calendar. Consumers such as filter
 * workspaces can request a compact one-month layout at every viewport. Because
 * the popover renders in a portal, the viewport breakpoint is the right lens —
 * the trigger's own width doesn't constrain the popover.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@athyper/platform-theme/utils";
import {
  formatBusinessDate,
  todayInZone,
  type WeekStart,
} from "@athyper/platform-temporal";
import {
  presetLabel as resolvePresetLabel,
  resolveDateRangePreset,
  type DateRangePresetKey,
  type PresetResolutionContext,
} from "@athyper/finance-rules";
import { CalendarGrid } from "./calendar-grid";

const MODAL_PORTAL_ROOT_SELECTOR = [
  "[data-advanced-picker-portal-root='true']",
  "[data-drawer-shell-content='true']",
  "[role='dialog']",
].join(", ");

export interface DateRangeValue {
  from: string | null;
  to: string | null;
  /** Non-null when a preset chip was picked. Persist this instead of the dates. */
  preset?: DateRangePresetKey | null;
}

export interface DateRangePickerPreset {
  key: DateRangePresetKey;
  /** Optional override — when omitted, presetLabel(key, locale) supplies the text. */
  label?: string;
  /**
   * Optional grouping key. When adjacent presets carry different `section`
   * values, a subtle horizontal divider is rendered between them so users
   * can visually distinguish (e.g.) "This year" (calendar) from
   * "This fiscal year" (fiscal). Purely presentational — no wire-format
   * or preset-resolution impact.
   */
  section?: string;
}

export interface DateRangePickerProps {
  value?: DateRangeValue | null;
  onChange?: (value: DateRangeValue | null) => void;
  /** BCP-47 locale — day labels, month name, weekend tinting, calendar system. */
  locale?: string;
  /** IANA zone — drives todayInZone anchor for the picker and presets. */
  timeZone?: string;
  /** Locale-driven default; override to force. */
  weekStart?: WeekStart;
  /**
   * Fiscal year start month (1-12). Used to resolve fiscal-aware presets
   * (this_quarter, this_fiscal_year, ytd, …). Default 1 (calendar year).
   */
  fiscalYearStartMonth?: number;
  /**
   * Ordered list of preset chips shown in the sidebar. Pass an empty array to
   * hide the sidebar entirely. Default = a sensible 8-item mix; when the parent
   * knows the entity is finance-scoped, supply the fiscal-aware list.
   */
  presets?: ReadonlyArray<DateRangePickerPreset>;
  /** Earliest selectable date (inclusive) — "YYYY-MM-DD". */
  min?: string | null;
  /** Latest selectable date (inclusive) — "YYYY-MM-DD". */
  max?: string | null;
  /** Custom per-cell guard on top of min/max. Return true to disable. */
  isDateDisabled?: (iso: string) => boolean;
  /** sprintf template for the trigger label (e.g. "%d %b %Y"). */
  dateFormat?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  clearable?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  /** Density variant, forwarded to both CalendarGrid panels. See DatePicker. */
  size?: "sm" | "md";
  /** Number of calendar months shown in the popover. Filter editors use one. */
  months?: 1 | 2;
  className?: string;
  id?: string;
}

/**
 * Sensible default preset list. Labels resolve via presetLabel(key, locale)
 * when omitted here — pass explicit labels only for one-off overrides.
 * Consumers can pass their own — for finance filters, use FISCAL_PRESETS.
 */
export const DEFAULT_PRESETS: ReadonlyArray<DateRangePickerPreset> = [
  { key: "today", section: "recent" },
  { key: "yesterday", section: "recent" },
  { key: "last_7_days", section: "recent" },
  { key: "last_30_days", section: "recent" },
  { key: "this_week", section: "calendar" },
  { key: "last_week", section: "calendar" },
  { key: "this_month", section: "calendar" },
  { key: "last_month", section: "calendar" },
];

/**
 * Finance filter preset list. Groups presets into three sections separated by
 * visual dividers:
 *
 *   recent   — today, yesterday, last N days (calendar math, always)
 *   calendar — this/last month, this/last year (Jan-Dec calendar, always)
 *   fiscal   — this/last quarter, this/last fiscal year, YTD/QTD/MTD, this/last period
 *              (respect the company code's fiscal_year_start_month)
 *
 * The calendar-vs-fiscal separation is deliberate: a user with a non-January
 * fiscal-year-start needs to visually distinguish "This year" (Jan-Dec) from
 * "This fiscal year" (their org's fiscal calendar) so they can pick the right
 * one at a glance. See docs/guides/calendar-vs-fiscal-year-in-filters.md.
 */
export const FISCAL_PRESETS: ReadonlyArray<DateRangePickerPreset> = [
  { key: "today", section: "recent" },
  { key: "yesterday", section: "recent" },
  { key: "last_7_days", section: "recent" },
  { key: "last_30_days", section: "recent" },
  { key: "this_month", section: "calendar" },
  { key: "last_month", section: "calendar" },
  { key: "this_year", section: "calendar" },
  { key: "last_year", section: "calendar" },
  { key: "this_quarter", section: "fiscal" },
  { key: "last_quarter", section: "fiscal" },
  { key: "this_fiscal_year", section: "fiscal" },
  { key: "last_fiscal_year", section: "fiscal" },
  { key: "ytd", section: "fiscal" },
  { key: "mtd", section: "fiscal" },
  { key: "qtd", section: "fiscal" },
];

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parseYM(iso: string | null | undefined): { year: number; month: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

function addMonth(view: { year: number; month: number }, delta: number): { year: number; month: number } {
  const t = view.year * 12 + view.month + delta;
  return { year: Math.floor(t / 12), month: t % 12 };
}

function formatRange(
  value: DateRangeValue,
  locale: string | undefined,
  template: string | undefined,
): string {
  const { from, to } = value;
  const resolvedLocale = locale ?? "en";
  const fmt = (v: string): string => {
    try {
      return formatBusinessDate(v, { locale: resolvedLocale, template });
    } catch {
      return v;
    }
  };
  if (from && to) {
    if (from === to) return fmt(from);
    return `${fmt(from)} – ${fmt(to)}`;
  }
  if (from) return `${fmt(from)} – …`;
  if (to)   return `… – ${fmt(to)}`;
  return "";
}

export function DateRangePicker(props: DateRangePickerProps): React.JSX.Element {
  const {
    value,
    onChange,
    locale,
    timeZone: timeZoneProp,
    weekStart,
    fiscalYearStartMonth = 1,
    presets = DEFAULT_PRESETS,
    min,
    max,
    isDateDisabled,
    dateFormat,
    placeholder,
    disabled,
    error,
    clearable = true,
    popoverSide = "bottom",
    popoverAlign = "start",
    size = "md",
    months = 2,
    className,
    id: externalId,
  } = props;

  const generatedId = useId();
  const id = externalId ?? generatedId;
  const errorId = `${id}-error`;
  const timeZone = timeZoneProp ?? browserTimeZone();

  const current: DateRangeValue = value ?? { from: null, to: null, preset: null };
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Radix Dialog's scroll lock permits wheel/touch scrolling only inside its
  // content shard. Keep nested date pickers inside the enclosing drawer/dialog
  // instead of portalling them to document.body, while retaining body as the
  // fallback for standalone consumers.
  useEffect(() => {
    if (!open) {
      setPortalContainer(null);
      return;
    }
    setPortalContainer(
      triggerRef.current?.closest<HTMLElement>(MODAL_PORTAL_ROOT_SELECTOR) ?? null,
    );
  }, [open]);

  // View month for the LEFT calendar. Right calendar always shows leftView + 1.
  const [leftView, setLeftView] = useState(() =>
    parseYM(current.from) ?? parseYM(todayInZone(timeZone)) ?? { year: new Date().getFullYear(), month: new Date().getMonth() },
  );
  const rightView = useMemo(() => addMonth(leftView, 1), [leftView]);

  const resolvedWeekStart: WeekStart | undefined = weekStart;

  const handleRangeClick = useCallback(
    (iso: string) => {
      // State machine:
      //   from=null, to=null  →  clicking sets from
      //   from!=null, to=null →  clicking sets to (swap if before from)
      //   from!=null, to!=null →  clicking resets: new from
      let next: DateRangeValue;
      if (current.from && !current.to) {
        if (iso < current.from) next = { from: iso, to: current.from, preset: null };
        else next = { from: current.from, to: iso, preset: null };
      } else {
        next = { from: iso, to: null, preset: null };
      }
      onChange?.(next);
    },
    [current.from, current.to, onChange],
  );

  const applyPreset = useCallback(
    (key: DateRangePresetKey) => {
      const ctx: PresetResolutionContext = {
        today: todayInZone(timeZone),
        weekStart: resolvedWeekStart ?? 1,
        fiscalYearStartMonth,
      };
      const range = resolveDateRangePreset(key, ctx);
      onChange?.({ from: range.from, to: range.to, preset: key });
      // Auto-close popover on preset selection (fast common case).
      setOpen(false);
    },
    [timeZone, resolvedWeekStart, fiscalYearStartMonth, onChange],
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

  const display = formatRange(current, locale, dateFormat);
  const hasValue = !!(current.from || current.to);

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <div ref={triggerRef} className="relative">
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
                {current.preset
                  ? (presets.find((p) => p.key === current.preset)?.label
                      ?? resolvePresetLabel(current.preset, locale ?? "en"))
                  : display || placeholder || "Pick a date range"}
              </span>
            </span>
          </button>
        </Popover.Trigger>

        {hasValue && !disabled && clearable && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear date range"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <Popover.Portal container={portalContainer ?? undefined}>
        <Popover.Content
          className={cn(
            "z-popover flex w-[calc(100vw-1rem)] max-w-[22rem] max-h-[var(--radix-popover-content-available-height)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl",
            "md:w-auto md:max-w-none",
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-3 md:flex-row">
            {presets.length > 0 && (
              <aside
                role="listbox"
                aria-label="Date range presets"
                className="flex max-h-36 flex-row flex-nowrap gap-1 overflow-x-auto overflow-y-hidden pb-1 md:max-h-none md:w-36 md:flex-col md:flex-nowrap md:overflow-x-visible md:overflow-y-auto md:border-r md:border-border md:pb-0 md:pr-3"
              >
                {presets.map((p, i) => {
                  const isActive = current.preset === p.key;
                  const label = p.label ?? resolvePresetLabel(p.key, locale ?? "en");
                  // Render a subtle divider whenever the section changes vs the
                  // previous preset. Only visible on the md:column layout —
                  // the wrap-row layout on narrow viewports uses gap-based
                  // separation instead of hairline rules.
                  const prevSection = i > 0 ? presets[i - 1]?.section : undefined;
                  const showDivider = i > 0 && !!p.section && p.section !== prevSection;
                  return (
                    <div key={p.key} className="contents">
                      {showDivider && (
                        <hr
                          data-section-divider={p.section}
                          aria-hidden="true"
                          className="hidden md:block my-1 border-t border-border/60"
                        />
                      )}
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        disabled={disabled}
                        onClick={() => applyPreset(p.key)}
                        className={cn(
                          "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    </div>
                  );
                })}
              </aside>
            )}

            <div className="flex flex-col gap-3 md:flex-row">
              {/* Left calendar — pager here advances both months. */}
              <div>
                <CalendarGrid
                  value={null}
                  onChange={() => { /* range mode */ }}
                  disabled={disabled}
                  locale={locale}
                  timeZone={timeZone}
                  weekStart={resolvedWeekStart}
                  min={min}
                  max={max}
                  isDateDisabled={isDateDisabled}
                  onRequestClose={() => setOpen(false)}
                  rangeStart={current.from}
                  rangeEnd={current.to}
                  onRangeClick={handleRangeClick}
                  hideFooter
                  fixedView={leftView}
                  onViewChange={setLeftView}
                  size={size}
                />
              </div>
              {/* Right calendar — hidden below the container-query breakpoint. */}
              {months === 2 && <div className="hidden md:block">
                <CalendarGrid
                  value={null}
                  onChange={() => { /* range mode */ }}
                  disabled={disabled}
                  locale={locale}
                  timeZone={timeZone}
                  weekStart={resolvedWeekStart}
                  min={min}
                  max={max}
                  isDateDisabled={isDateDisabled}
                  onRequestClose={() => setOpen(false)}
                  rangeStart={current.from}
                  rangeEnd={current.to}
                  onRangeClick={handleRangeClick}
                  hideFooter
                  fixedView={rightView}
                  hidePagerControls={{
                    prevYear: true,
                    nextYear: true,
                    prevMonth: true,
                    nextMonth: true,
                    yearPicker: true,
                  }}
                  size={size}
                />
              </div>}
            </div>
          </div>
          </div>

          {/* Footer actions: navigation lives in the calendar header. */}
          <div className="sticky bottom-0 z-10 mt-3 flex min-h-9 shrink-0 items-center justify-end border-t border-border bg-background pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange?.(null)}
                disabled={disabled || !hasValue}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium",
                  "bg-primary text-primary-foreground transition-opacity hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Check className="size-3.5" />
                Done
              </button>
            </div>
          </div>

          {error && (
            <p id={errorId} className="mt-2 text-xs text-destructive" role="alert">{error}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export type { DateRangePresetKey };
