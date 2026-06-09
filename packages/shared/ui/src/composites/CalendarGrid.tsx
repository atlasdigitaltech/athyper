"use client";

/**
 * CalendarGrid: themed month calendar grid.
 *
 * Renders a fixed 6-row by 7-column grid so the popover height never jumps.
 * Navigation supports previous/next month and previous/next year.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface CalendarGridProps {
  value?: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
}

const DAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

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

// Build a year grid centered around the view year: 12 years, 3 columns.
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

  if (yearPicker) {
    return (
      <div className="w-[300px] select-none">
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            onClick={() => setYearPage((p) => p - 12)}
            disabled={disabled}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
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
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
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

  return (
    <div className="w-[300px] select-none">
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          onClick={prevYear}
          disabled={disabled}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Previous year"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={prevMonth}
          disabled={disabled}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
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
          className="flex-1 text-center text-base font-semibold text-foreground transition-colors hover:text-primary disabled:pointer-events-none"
          title="Pick a year"
        >
          {monthLabel(view.year, view.month)}
        </button>

        <button
          type="button"
          onClick={nextMonth}
          disabled={disabled}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={nextYear}
          disabled={disabled}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          aria-label="Next year"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 pb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="flex h-7 items-center justify-center">
            <span className="text-xs font-semibold text-muted-foreground">
              {d}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 justify-items-center">
        {cells.map(({ date, inMonth }) => {
          const isSelected = date === value;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onChange(date)}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-40",
                isSelected
                  ? "bg-primary text-primary-foreground font-medium"
                  : isToday
                    ? "border border-primary text-primary font-medium hover:bg-accent"
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
          disabled={disabled}
          className="text-sm font-medium text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          Today
        </button>
      </div>
    </div>
  );
}
