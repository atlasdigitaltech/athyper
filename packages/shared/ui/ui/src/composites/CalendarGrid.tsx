"use client";

/**
 * CalendarGrid — themed month calendar grid.
 *
 * Fully CSS-token-aware: bg-card, text-foreground, bg-primary, etc.
 * No external date library — uses only the built-in JS Date API.
 * Renders a fixed 6-row × 7-col grid so the popover height never jumps.
 *
 * Props:
 *   value    — YYYY-MM-DD string or null
 *   onChange — called with YYYY-MM-DD string or null (Clear)
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

/** Build the 6×7 day grid for a given year/month view. */
function buildGrid(viewYear: number, viewMonth: number): Array<{ date: string; inMonth: boolean }> {
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const cells: Array<{ date: string; inMonth: boolean }> = [];

  // Fill from previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(viewYear, viewMonth, -i);
    cells.push({ date: toLocalYMD(d), inMonth: false });
  }
  // Current month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(viewYear, viewMonth, i);
    cells.push({ date: toLocalYMD(d), inMonth: true });
  }
  // Fill to 42 cells (6 rows × 7)
  let next = 1;
  while (cells.length < 42) {
    const d = new Date(viewYear, viewMonth + 1, next++);
    cells.push({ date: toLocalYMD(d), inMonth: false });
  }
  return cells;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function CalendarGrid({ value, onChange, disabled }: CalendarGridProps) {
  const today = toLocalYMD(new Date());

  // Initialise view to the selected month, or today's month
  const initView = () => {
    if (value) {
      const p = parseYMD(value);
      if (p) return { year: p.y, month: p.m };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  };

  const [view, setView] = useState(initView);
  const cells = buildGrid(view.year, view.month);

  function prevMonth() {
    setView(({ year, month }) => {
      if (month === 0) return { year: year - 1, month: 11 };
      return { year, month: month - 1 };
    });
  }

  function nextMonth() {
    setView(({ year, month }) => {
      if (month === 11) return { year: year + 1, month: 0 };
      return { year, month: month + 1 };
    });
  }

  function goToday() {
    const now = new Date();
    setView({ year: now.getFullYear(), month: now.getMonth() });
    onChange(today);
  }

  return (
    <div className="w-[252px] select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          onClick={prevMonth}
          disabled={disabled}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-semibold text-foreground">
          {monthLabel(view.year, view.month)}
        </span>

        <button
          type="button"
          onClick={nextMonth}
          disabled={disabled}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 pb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="flex h-7 items-center justify-center">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
          className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
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
