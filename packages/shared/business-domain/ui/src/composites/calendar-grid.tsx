"use client";

/**
 * CalendarGrid — themed month grid with locale-aware day labels, weekend
 * tinting, first-day-of-week reordering, min/max + isDateDisabled guards,
 * and full keyboard navigation.
 *
 * Visual style is unchanged from v1: 6×7 fixed grid (no popover-height jumps),
 * monochrome theme, chevron pager («, ‹, ›, »).
 *
 * Stateful pieces owned here:
 *   • view month/year (defaults to selected, else today-in-zone)
 *   • year-picker overlay
 *   • focusedDate for keyboard navigation (separate from selectedDate)
 *
 * Pure value semantics: every IO crosses the boundary as "YYYY-MM-DD".
 * Internal `new Date(year, month, day)` is fine — it builds a Date from
 * numeric parts in local time, which is then immediately re-stringified
 * via `toLocalYMD`. No string parsing means no TZ shift.
 *
 * Calendar systems (Phase 5):
 *   When the locale carries a `-u-ca-…` extension (e.g. Hijri Umm al-Qura,
 *   Reiwa-era Japanese), cell day numbers, the header month/year, and the
 *   aria-label all render through Intl in the requested calendar. The grid
 *   itself is still bounded by Gregorian month boundaries — month navigation
 *   advances one Gregorian month at a time. This means a Hijri user may need
 *   to advance the Gregorian month twice to traverse a single Hijri month at
 *   month-boundary days. Storage stays Gregorian throughout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  firstDayOfWeekFor,
  formatDayNumber,
  isWeekendFor,
  localeUsesAlternativeCalendar,
  todayInZone,
  type WeekStart,
} from "@athyper/temporal";

export interface CalendarGridProps {
  value?: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
  /**
   * BCP-47 locale; drives day labels, month name, weekend tinting, and
   * default week-start. Defaults to undefined → browser locale (back-compat).
   */
  locale?: string;
  /**
   * IANA zone used by the "Today" button. Defaults to UTC if not set;
   * picker callers should pass the resolved business or user zone.
   */
  timeZone?: string;
  /** Override the locale-derived first day of week. 0=Sun, 1=Mon, 6=Sat. */
  weekStart?: WeekStart;
  /** Earliest selectable date (inclusive) — "YYYY-MM-DD". */
  min?: string | null;
  /** Latest selectable date (inclusive) — "YYYY-MM-DD". */
  max?: string | null;
  /** Custom per-cell guard; runs after min/max. Return true to disable. */
  isDateDisabled?: (iso: string) => boolean;
  /** Called when Esc is pressed — wired by the picker to close the popover. */
  onRequestClose?: () => void;

  // ─── Range mode (opt-in) ─────────────────────────────────────────────
  // When `onRangeClick` is provided, the grid operates in range mode:
  //   • `value` and `onChange` are ignored
  //   • cells display range highlighting for start/end/in-between
  //   • single click emits `onRangeClick(iso)` — parent runs the state machine
  //   • hover after first click shows an in-preview highlight
  /** Fixed range start (inclusive). */
  rangeStart?: string | null;
  /** Fixed range end (inclusive). null when the user has only picked start. */
  rangeEnd?: string | null;
  /** Fired on click while in range mode. Parent decides start-vs-end semantics. */
  onRangeClick?: (iso: string) => void;
  /** Whether to hide the "Clear" and "Today" footer (range picker owns them). */
  hideFooter?: boolean;
  /** Whether to render this grid without the year-picker overlay trigger. */
  hidePagerControls?: {
    prevYear?: boolean;
    nextYear?: boolean;
    prevMonth?: boolean;
    nextMonth?: boolean;
  };
  /**
   * When set, the grid renders in a fixed month/year (uncontrolled internal
   * state is ignored). Two-month view uses this to align each panel.
   */
  fixedView?: { year: number; month: number };
  /**
   * Density variant. `md` (default) uses 32px cells and a 300px-wide grid.
   * `sm` shaves ~40px of height for dense forms where a full-size popover
   * would clip against the viewport. Same layout, just tighter — 28px cells,
   * 24px labels, 264px total width.
   */
  size?: "sm" | "md";
}

// Density tokens — flat objects so branches stay static `size-N` literals
// that Tailwind can extract at build time.
interface SizeTokens {
  container: string;
  cell: string;
  cellText: string;
  dayLabelRow: string;
  dayLabelText: string;
  pagerButton: string;
  monthLabel: string;
}

const SIZE_TOKENS: Record<"sm" | "md", SizeTokens> = {
  md: {
    container: "w-[300px]",
    cell: "size-8",
    cellText: "text-sm",
    dayLabelRow: "h-7",
    dayLabelText: "text-xs",
    pagerButton: "size-7",
    monthLabel: "text-base",
  },
  sm: {
    container: "w-[264px]",
    cell: "size-7",
    cellText: "text-xs",
    dayLabelRow: "h-6",
    dayLabelText: "text-[10px]",
    pagerButton: "size-6",
    monthLabel: "text-sm",
  },
};

function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10) - 1;
  const d = parseInt(parts[2]!, 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { y, m, d };
}

function buildGrid(viewYear: number, viewMonth: number, weekStart: WeekStart): Array<{ date: string; inMonth: boolean }> {
  const firstDay = new Date(viewYear, viewMonth, 1);
  const rawOffset = firstDay.getDay();
  // Rotate so the first column is the locale's first weekday.
  const startOffset = (rawOffset - weekStart + 7) % 7;
  const cells: Array<{ date: string; inMonth: boolean }> = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ date: toLocalYMD(new Date(viewYear, viewMonth, -i)), inMonth: false });
  }
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: toLocalYMD(new Date(viewYear, viewMonth, i)), inMonth: true });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({ date: toLocalYMD(new Date(viewYear, viewMonth + 1, next++)), inMonth: false });
  }
  return cells;
}

function monthLabel(year: number, month: number, locale: string | undefined): string {
  return new Date(year, month, 1).toLocaleString(locale, { month: "long", year: "numeric" });
}

function buildYearGrid(centreYear: number): number[] {
  const start = Math.floor(centreYear / 12) * 12;
  return Array.from({ length: 12 }, (_, i) => start + i);
}

/**
 * Returns 7 narrow weekday labels (e.g. ["S","M","T","W","T","F","S"])
 * rotated to the locale's first day of week. Uses a reference week starting
 * at a known Sunday (2024-01-07) to anchor the Intl call.
 */
function buildDayLabels(locale: string | undefined, weekStart: WeekStart): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const labels: string[] = [];
  // 2024-01-07 is a Sunday; index 0=Sun, 6=Sat.
  for (let i = 0; i < 7; i++) {
    const dayIndex = (weekStart + i) % 7;
    const ref = new Date(2024, 0, 7 + dayIndex);
    labels.push(fmt.format(ref));
  }
  return labels;
}

function clampToBounds(iso: string, min?: string | null, max?: string | null): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export function CalendarGrid({
  value,
  onChange,
  disabled,
  locale,
  timeZone,
  weekStart: weekStartProp,
  min,
  max,
  isDateDisabled,
  onRequestClose,
  rangeStart,
  rangeEnd,
  onRangeClick,
  hideFooter,
  hidePagerControls,
  fixedView,
  size = "md",
}: CalendarGridProps): React.JSX.Element {
  const T = SIZE_TOKENS[size];
  const isRangeMode = !!onRangeClick;
  const resolvedWeekStart: WeekStart = weekStartProp ?? (locale ? firstDayOfWeekFor(locale) : 0);
  const todayISO = useMemo(() => (timeZone ? todayInZone(timeZone) : toLocalYMD(new Date())), [timeZone]);

  const initView = useCallback(() => {
    if (fixedView) return fixedView;
    if (value) {
      const p = parseYMD(value);
      if (p) return { year: p.y, month: p.m };
    }
    if (rangeStart) {
      const p = parseYMD(rangeStart);
      if (p) return { year: p.y, month: p.m };
    }
    const t = parseYMD(todayISO);
    if (t) return { year: t.y, month: t.m };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [fixedView, value, rangeStart, todayISO]);

  const [internalView, setInternalView] = useState(initView);
  const view = fixedView ?? internalView;
  const setView = useCallback((next: { year: number; month: number } | ((v: { year: number; month: number }) => { year: number; month: number })) => {
    if (fixedView) return;
    setInternalView(next);
  }, [fixedView]);
  const [yearPicker, setYearPicker] = useState(false);
  const [yearPage, setYearPage] = useState(() => Math.floor(initView().year / 12) * 12);
  const [focused, setFocused] = useState<string>(() => value ?? rangeStart ?? todayISO);
  const [hoverEnd, setHoverEnd] = useState<string | null>(null);

  // Range-mode preview: hover end only meaningful when the user has picked
  // start but not end yet. Reset when both endpoints are set or both null.
  const showRangePreview = isRangeMode && !!rangeStart && !rangeEnd && !!hoverEnd;

  const gridRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const cells = useMemo(
    () => buildGrid(view.year, view.month, resolvedWeekStart),
    [view.year, view.month, resolvedWeekStart],
  );
  const yearGrid = useMemo(() => buildYearGrid(yearPage), [yearPage]);
  const dayLabels = useMemo(() => buildDayLabels(locale, resolvedWeekStart), [locale, resolvedWeekStart]);
  const useAltCalendar = !!locale && localeUsesAlternativeCalendar(locale);

  const isCellDisabled = useCallback(
    (iso: string): boolean => {
      if (disabled) return true;
      if (min && iso < min) return true;
      if (max && iso > max) return true;
      if (isDateDisabled && isDateDisabled(iso)) return true;
      return false;
    },
    [disabled, min, max, isDateDisabled],
  );

  // Keep focused cell on screen when month changes via keyboard.
  useEffect(() => {
    if (!yearPicker) {
      const node = cellRefs.current.get(focused);
      if (node) node.focus();
    }
  }, [focused, yearPicker, view.year, view.month]);

  function shiftFocused(deltaDays: number): void {
    const p = parseYMD(focused);
    if (!p) return;
    const next = new Date(p.y, p.m, p.d + deltaDays);
    const iso = clampToBounds(toLocalYMD(next), min, max);
    setFocused(iso);
    const np = parseYMD(iso);
    if (np && (np.y !== view.year || np.m !== view.month)) {
      setView({ year: np.y, month: np.m });
    }
  }

  function shiftFocusedMonths(deltaMonths: number): void {
    const p = parseYMD(focused);
    if (!p) return;
    const next = new Date(p.y, p.m + deltaMonths, p.d);
    const iso = clampToBounds(toLocalYMD(next), min, max);
    setFocused(iso);
    const np = parseYMD(iso);
    if (np) setView({ year: np.y, month: np.m });
  }

  function shiftFocusedYears(deltaYears: number): void {
    const p = parseYMD(focused);
    if (!p) return;
    const next = new Date(p.y + deltaYears, p.m, p.d);
    const iso = clampToBounds(toLocalYMD(next), min, max);
    setFocused(iso);
    const np = parseYMD(iso);
    if (np) setView({ year: np.y, month: np.m });
  }

  function focusWeekStart(): void {
    const p = parseYMD(focused);
    if (!p) return;
    const cur = new Date(p.y, p.m, p.d).getDay();
    const back = (cur - resolvedWeekStart + 7) % 7;
    shiftFocused(-back);
  }

  function focusWeekEnd(): void {
    const p = parseYMD(focused);
    if (!p) return;
    const cur = new Date(p.y, p.m, p.d).getDay();
    const fwd = 6 - ((cur - resolvedWeekStart + 7) % 7);
    shiftFocused(fwd);
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (disabled) return;
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); shiftFocused(-1); break;
      case "ArrowRight": e.preventDefault(); shiftFocused(1); break;
      case "ArrowUp": e.preventDefault(); shiftFocused(-7); break;
      case "ArrowDown": e.preventDefault(); shiftFocused(7); break;
      case "PageUp":
        e.preventDefault();
        if (e.shiftKey) shiftFocusedYears(-1);
        else shiftFocusedMonths(-1);
        break;
      case "PageDown":
        e.preventDefault();
        if (e.shiftKey) shiftFocusedYears(1);
        else shiftFocusedMonths(1);
        break;
      case "Home": e.preventDefault(); focusWeekStart(); break;
      case "End": e.preventDefault(); focusWeekEnd(); break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (isCellDisabled(focused)) break;
        if (isRangeMode) onRangeClick(focused);
        else onChange(focused);
        break;
      case "Escape":
        e.preventDefault();
        if (onRequestClose) onRequestClose();
        break;
    }
  }

  function prevMonth(): void {
    setView(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  }
  function nextMonth(): void {
    setView(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );
  }
  function prevYear(): void {
    setView(({ year, month }) => ({ year: year - 1, month }));
  }
  function nextYear(): void {
    setView(({ year, month }) => ({ year: year + 1, month }));
  }

  function goToday(): void {
    const t = parseYMD(todayISO);
    if (!t) return;
    setView({ year: t.y, month: t.m });
    setFocused(todayISO);
    if (!isCellDisabled(todayISO)) onChange(todayISO);
  }

  function selectYear(y: number): void {
    setView((v) => ({ year: y, month: v.month }));
    setYearPicker(false);
  }

  if (yearPicker) {
    return (
      <div className={cn(T.container, "select-none")}>
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            onClick={() => setYearPage((p) => p - 12)}
            disabled={disabled}
            className={cn("flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40", T.pagerButton)}
            aria-label="Previous 12 years"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">
            {yearGrid[0]} - {yearGrid[yearGrid.length - 1]}
          </span>
          <button
            type="button"
            onClick={() => setYearPage((p) => p + 12)}
            disabled={disabled}
            className={cn("flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40", T.pagerButton)}
            aria-label="Next 12 years"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 pb-2">
          {yearGrid.map((y) => {
            const isCurrentView = y === view.year;
            const isThisYear = y === new Date().getFullYear();
            return (
              <button
                key={y}
                type="button"
                disabled={disabled}
                onClick={() => selectYear(y)}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrentView
                    ? "bg-primary text-primary-foreground font-medium"
                    : isThisYear
                      ? "border border-primary text-primary font-medium hover:bg-accent"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {y}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setYearPicker(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const longDateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className={cn(T.container, "select-none")}>
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          onClick={prevYear}
          disabled={disabled}
          className={cn("flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40", T.pagerButton)}
          aria-label="Previous year"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={prevMonth}
          disabled={disabled}
          className={cn("flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40", T.pagerButton)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            setYearPage(Math.floor(view.year / 12) * 12);
            setYearPicker(true);
          }}
          disabled={disabled}
          className={cn("flex-1 text-center font-semibold text-foreground transition-colors hover:text-primary disabled:pointer-events-none", T.monthLabel)}
          title="Pick a year"
        >
          {monthLabel(view.year, view.month, locale)}
        </button>

        <button
          type="button"
          onClick={nextMonth}
          disabled={disabled}
          className={cn("flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40", T.pagerButton)}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={nextYear}
          disabled={disabled}
          className={cn("flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40", T.pagerButton)}
          aria-label="Next year"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 pb-1" aria-hidden="true">
        {dayLabels.map((label, idx) => (
          <div key={`${label}-${idx}`} className={cn("flex items-center justify-center", T.dayLabelRow)}>
            <span className={cn("font-semibold text-muted-foreground", T.dayLabelText)}>{label}</span>
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        onKeyDown={handleGridKeyDown}
        className="grid grid-cols-7 justify-items-center"
      >
        {cells.map(({ date, inMonth }) => {
          const isSelected = !isRangeMode && date === value;
          const isRangeEndpoint = isRangeMode && (date === rangeStart || date === rangeEnd);
          // Committed in-range span: strictly between the endpoints.
          const committedRange = isRangeMode && rangeStart && rangeEnd
            ? date > rangeStart && date < rangeEnd
            : false;
          // Hover preview span while the user picks the second endpoint.
          let previewRange = false;
          if (showRangePreview && rangeStart && hoverEnd) {
            const lo = rangeStart < hoverEnd ? rangeStart : hoverEnd;
            const hi = rangeStart < hoverEnd ? hoverEnd : rangeStart;
            previewRange = date >= lo && date <= hi && date !== rangeStart;
          }
          const isToday = date === todayISO;
          const isFocused = date === focused;
          const isCellOff = isCellDisabled(date);
          const weekend = locale ? isWeekendFor(date, locale) : false;
          const aria = longDateFmt.format(new Date(parseYMD(date)!.y, parseYMD(date)!.m, parseYMD(date)!.d, 12));

          const handleClick = () => {
            if (isCellOff) return;
            if (isRangeMode) onRangeClick(date);
            else onChange(date);
          };
          const handleMouseEnter = () => {
            if (!isRangeMode) return;
            if (rangeStart && !rangeEnd) setHoverEnd(date);
          };

          return (
            <button
              key={date}
              ref={(el) => {
                if (el) cellRefs.current.set(date, el);
                else cellRefs.current.delete(date);
              }}
              type="button"
              role="gridcell"
              tabIndex={isFocused ? 0 : -1}
              disabled={isCellOff}
              onClick={handleClick}
              onMouseEnter={handleMouseEnter}
              onFocus={() => setFocused(date)}
              className={cn(
                "flex items-center justify-center rounded-lg transition-colors",
                T.cell,
                T.cellText,
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none",
                isSelected || isRangeEndpoint
                  ? "bg-primary text-primary-foreground font-medium"
                  : committedRange
                    ? "bg-primary/15 text-foreground rounded-none"
                    : previewRange
                      ? "bg-accent/40 text-foreground rounded-none border border-dashed border-primary/40"
                      : isToday
                        ? "border border-primary text-primary font-medium hover:bg-accent"
                        : inMonth
                          ? cn(
                              "text-foreground hover:bg-accent hover:text-accent-foreground",
                              weekend && !isCellOff && "text-muted-foreground",
                            )
                          : "text-muted-foreground/40 hover:bg-accent/50",
                isCellOff && "opacity-30 line-through",
              )}
              aria-label={aria}
              aria-pressed={isSelected || isRangeEndpoint}
              aria-disabled={isCellOff}
              aria-current={isToday ? "date" : undefined}
            >
              {useAltCalendar && locale ? formatDayNumber(date, locale) : parseInt(date.split("-")[2]!, 10)}
            </button>
          );
        })}
      </div>

      {!hideFooter && (
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled || !value}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={goToday}
          disabled={disabled || isCellDisabled(todayISO)}
          className="text-sm font-medium text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Today
        </button>
      </div>
      )}
    </div>
  );
}
