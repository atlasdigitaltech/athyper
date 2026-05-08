"use client";

/**
 * CalendarGrid — themed month calendar grid.
 *
 * Fully CSS-token-aware: bg-card, text-foreground, bg-primary, etc.
 * No external date library — uses only the built-in JS Date API.
 * Renders a fixed 6-row × 7-col grid so the popover height never jumps.
 *
 * Navigation:
 *   ‹ / › buttons  — prev/next month
 *   « / » buttons  — prev/next year
 *   Month+Year header click — enter year-picker mode
 *
 * Props:
 *   value    — YYYY-MM-DD string or null
 *   onChange — called with YYYY-MM-DD string or null (Clear)
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface CalendarGridProps {
  value?: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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

function buildGrid(viewYear: number, viewMonth: number): Array<{ date: string; inMonth: boolean }> {
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = firstDay.getDay();
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

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

// Build a year grid centred around the view year, 12 years × 3 cols = 4 rows
function buildYearGrid(centreYear: number): number[] {
  const start = Math.floor(centreYear / 12) * 12;
  return Array.from({ length: 12 }, (_, i) => start + i);
}

export function CalendarGrid({ value, onChange, disabled }: CalendarGridProps) {
  const today = toLocalYMD(new Date());

  const initView = () => {
    if (value) {
      const p = parseYMD(value);
      if (p) return { year: p.y, month: p.m };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  };

  const [view, setView] = useState(initView);
  const [yearPicker, setYearPicker] = useState(false);
  const [yearPage, setYearPage] = useState(() => Math.floor(initView().year / 12) * 12);

  const cells = buildGrid(view.year, view.month);
  const yearGrid = buildYearGrid(yearPage);

  function prevMonth() {
    setView(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  }

  function nextMonth() {
    setView(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );
  }

  function prevYear() {
    setView(({ year, month }) => ({ year: year - 1, month }));
  }

  function nextYear() {
    setView(({ year, month }) => ({ year: year + 1, month }));
  }

  function goToday() {
    const now = new Date();
    setView({ year: now.getFullYear(), month: now.getMonth() });
    onChange(today);
  }

  function selectYear(y: number) {
    setView((v) => ({ year: y, month: v.month }));
    setYearPicker(false);
  }

  // ── Year picker view ──────────────────────────────────────────────────────────
  if (yearPicker) {
    return (
      <div className="w-[252px] select-none">
        {/* Year page nav */}
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            onClick={() => setYearPage((p) => p - 12)}
            disabled={disabled}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            aria-label="Previous 12 years"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">
            {yearGrid[0]} – {yearGrid[yearGrid.length - 1]}
          </span>
          <button
            type="button"
            onClick={() => setYearPage((p) => p + 12)}
            disabled={disabled}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            aria-label="Next 12 years"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* 4 × 3 year grid */}
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
                  "flex h-9 items-center justify-center rounded-md text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrentView
                    ? "bg-primary text-primary-foreground font-semibold"
                    : isThisYear
                    ? "border border-primary text-primary font-semibold hover:bg-accent"
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

  // ── Month grid view ───────────────────────────────────────────────────────────
  return (
    <div className="w-[252px] select-none">
      {/* Month nav with year jumps */}
      <div className="flex items-center justify-between px-1 pb-2">
        {/* Prev year */}
        <button
          type="button"
          onClick={prevYear}
          disabled={disabled}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Previous year"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        {/* Prev month */}
        <button
          type="button"
          onClick={prevMonth}
          disabled={disabled}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Month+Year — click to open year picker */}
        <button
          type="button"
          onClick={() => { setYearPage(Math.floor(view.year / 12) * 12); setYearPicker(true); }}
          disabled={disabled}
          className="flex-1 text-center text-sm font-semibold text-foreground hover:text-primary transition-colors disabled:pointer-events-none"
          title="Pick a year"
        >
          {monthLabel(view.year, view.month)}
        </button>

        {/* Next month */}
        <button
          type="button"
          onClick={nextMonth}
          disabled={disabled}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {/* Next year */}
        <button
          type="button"
          onClick={nextYear}
          disabled={disabled}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Next year"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 pb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="flex h-7 items-center justify-center">
            <span className="text-doc-support font-medium uppercase tracking-wide text-muted-foreground">
              {d}
            </span>
          </div>
        ))}
      </div>

      {/* Day grid — fixed 6 rows */}
      <div className="grid grid-cols-7">
        {cells.map(({ date, inMonth }) => {
          const isSelected = date === value;
          const isToday    = date === today;
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onChange(date)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-40",
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : isToday
                  ? "border border-primary text-primary font-semibold hover:bg-accent"
                  : inMonth
                  ? "text-foreground hover:bg-accent hover:text-accent-foreground"
                  : "text-muted-foreground/40 hover:bg-accent/50",
              )}
              aria-label={date}
              aria-pressed={isSelected}
            >
              {parseInt(date.split("-")[2]!, 10)}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled || !value}
          className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40 transition-colors"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={goToday}
          disabled={disabled}
          className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Today
        </button>
      </div>
    </div>
  );
}
