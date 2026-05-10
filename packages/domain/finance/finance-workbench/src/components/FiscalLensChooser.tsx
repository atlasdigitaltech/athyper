"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import type { FinanceScope } from "../lib/scope";
import {
  periodLabel,
  periodStatusLabel,
  type FiscalPeriodStatus,
} from "../lib/period";
import type { FiscalPeriodRow } from "../hooks/useFiscalPeriods";

export interface FiscalLensUrlParams {
  dateFrom?: string | null;
  dateTo?: string | null;
  datePreset?: string | null;
  relativeRange?: string | null;
}

interface FiscalLensChooserProps {
  scope: FinanceScope;
  fiscalYearStartMonth: number;
  periods?: FiscalPeriodRow[];
  dateFrom?: string | null;
  dateTo?: string | null;
  datePreset?: string | null;
  relativeRange?: string | null;
  onChange: (scope: FinanceScope, params?: FiscalLensUrlParams) => void;
  className?: string;
}

type LensMode = "fiscal" | "date-range" | "relative";

const CLEAR_DATE_LENS: FiscalLensUrlParams = {
  dateFrom: null,
  dateTo: null,
  datePreset: null,
  relativeRange: null,
};

const RELATIVE_OPTIONS = [
  { id: "last_7_days", label: "Last 7 days", description: "Rolling one-week activity" },
  { id: "last_30_days", label: "Last 30 days", description: "Recent month activity" },
  { id: "last_90_days", label: "Last 90 days", description: "Quarter lookback" },
  { id: "rolling_12_months", label: "Rolling 12 months", description: "Trailing annual view" },
] as const;

const DATE_PRESETS = [
  { id: "this_month", label: "This month", resolve: getThisMonthRange },
  { id: "this_quarter", label: "This quarter", resolve: getThisQuarterRange },
  { id: "fiscal_ytd", label: "Fiscal YTD", resolve: getFiscalYtdRange },
  { id: "last_month", label: "Last month", resolve: getLastMonthRange },
] as const;

const PERIOD_RAIL_SIZE = 3;
const PERIOD_RAIL_CENTER_OFFSET = Math.floor(PERIOD_RAIL_SIZE / 2);

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getThisMonthRange(): { from: string; to: string } {
  const now = new Date();
  return { from: formatDateInput(firstDayOfMonth(now)), to: formatDateInput(lastDayOfMonth(now)) };
}

function getLastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from: formatDateInput(firstDayOfMonth(lastMonth)), to: formatDateInput(lastDayOfMonth(lastMonth)) };
}

function getThisQuarterRange(): { from: string; to: string } {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(now.getFullYear(), quarterStartMonth, 1);
  const end = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
  return { from: formatDateInput(start), to: formatDateInput(end) };
}

function getFiscalYtdRange(fiscalYearStartMonth = 1): { from: string; to: string } {
  const now = new Date();
  const startMonthIndex = fiscalYearStartMonth - 1;
  const fiscalStartYear = now.getMonth() < startMonthIndex
    ? now.getFullYear() - 1
    : now.getFullYear();
  return {
    from: formatDateInput(new Date(fiscalStartYear, startMonthIndex, 1)),
    to: formatDateInput(now),
  };
}

function currentFiscalPeriod(fiscalYearStartMonth: number): { fiscalYear: number; period: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const period = ((month - fiscalYearStartMonth + 12) % 12) + 1;
  const fiscalYear = month < fiscalYearStartMonth ? now.getFullYear() - 1 : now.getFullYear();
  return { fiscalYear, period };
}

function previousFiscalPeriod(scope: FinanceScope, fiscalYearStartMonth: number): { fiscalYear: number; period: number } {
  const base = typeof scope.period === "number"
    ? { fiscalYear: scope.fiscalYear, period: scope.period }
    : currentFiscalPeriod(fiscalYearStartMonth);

  if (base.period > 1) {
    return { fiscalYear: base.fiscalYear, period: base.period - 1 };
  }

  return { fiscalYear: base.fiscalYear - 1, period: 12 };
}

function triggerLabel(
  scope: FinanceScope,
  fiscalYearStartMonth: number,
  dateFrom?: string | null,
  dateTo?: string | null,
  relativeRange?: string | null,
): string {
  if (relativeRange) {
    return RELATIVE_OPTIONS.find((option) => option.id === relativeRange)?.label ?? "Relative range";
  }
  if (dateFrom || dateTo) {
    return `${dateFrom ?? "Start"} to ${dateTo ?? "Today"}`;
  }
  const label = scope.period == null
    ? "Full Year"
    : periodLabel(scope.fiscalYear, scope.period, fiscalYearStartMonth);
  return `FY ${scope.fiscalYear} - ${label}`;
}

function periodNumbers(periods?: FiscalPeriodRow[]): number[] {
  if (periods?.length) {
    return [...new Set(periods.map((period) => period.periodNumber))].sort((a, b) => a - b);
  }
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function FiscalLensChooser({
  scope,
  fiscalYearStartMonth,
  periods,
  dateFrom,
  dateTo,
  datePreset,
  relativeRange,
  onChange,
  className,
}: FiscalLensChooserProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LensMode>(dateFrom || dateTo ? "date-range" : relativeRange ? "relative" : "fiscal");
  const [draftYear, setDraftYear] = useState(scope.fiscalYear);
  const [draftFrom, setDraftFrom] = useState(dateFrom ?? "");
  const [draftTo, setDraftTo] = useState(dateTo ?? "");
  const [periodRailCenter, setPeriodRailCenter] = useState(
    typeof scope.period === "number" && scope.period > 0
      ? scope.period
      : currentFiscalPeriod(fiscalYearStartMonth).period,
  );

  useEffect(() => {
    if (!open) return;
    setDraftYear(scope.fiscalYear);
    setDraftFrom(dateFrom ?? "");
    setDraftTo(dateTo ?? "");
    setMode(dateFrom || dateTo ? "date-range" : relativeRange ? "relative" : "fiscal");
    setPeriodRailCenter(
      typeof scope.period === "number" && scope.period > 0
        ? scope.period
        : currentFiscalPeriod(fiscalYearStartMonth).period,
    );
  }, [dateFrom, dateTo, fiscalYearStartMonth, open, relativeRange, scope.fiscalYear, scope.period]);

  const statusByPeriod = useMemo(() => {
    return new Map((periods ?? []).map((period) => [period.periodNumber, period.status]));
  }, [periods]);

  const periodsToShow = useMemo(() => periodNumbers(periods), [periods]);
  const railPeriods = useMemo(() => periodsToShow.filter((period) => period > 0), [periodsToShow]);
  const railWindow = useMemo(() => {
    if (railPeriods.length <= PERIOD_RAIL_SIZE) return railPeriods;

    const centerIndex = railPeriods.includes(periodRailCenter)
      ? railPeriods.indexOf(periodRailCenter)
      : railPeriods.findIndex((period) => period > periodRailCenter);
    const safeCenterIndex = centerIndex === -1 ? railPeriods.length - 1 : centerIndex;
    const start = clamp(safeCenterIndex - PERIOD_RAIL_CENTER_OFFSET, 0, railPeriods.length - PERIOD_RAIL_SIZE);
    return railPeriods.slice(start, start + PERIOD_RAIL_SIZE);
  }, [periodRailCenter, railPeriods]);
  const canMoveRailLeft = railPeriods.length > 0 && periodRailCenter > railPeriods[0]!;
  const canMoveRailRight = railPeriods.length > 0 && periodRailCenter < railPeriods[railPeriods.length - 1]!;
  const label = triggerLabel(scope, fiscalYearStartMonth, dateFrom, dateTo, relativeRange);

  function chooseFiscalPeriod(period: number | null) {
    onChange({ ...scope, fiscalYear: draftYear, period }, CLEAR_DATE_LENS);
    setOpen(false);
  }

  function chooseCurrentPeriod() {
    const current = currentFiscalPeriod(fiscalYearStartMonth);
    onChange({ ...scope, fiscalYear: current.fiscalYear, period: current.period }, CLEAR_DATE_LENS);
    setOpen(false);
  }

  function choosePreviousPeriod() {
    const previous = previousFiscalPeriod(scope, fiscalYearStartMonth);
    onChange({ ...scope, fiscalYear: previous.fiscalYear, period: previous.period }, CLEAR_DATE_LENS);
    setOpen(false);
  }

  function movePeriodRail(direction: -1 | 1) {
    if (railPeriods.length === 0) return;
    const currentIndex = railPeriods.includes(periodRailCenter)
      ? railPeriods.indexOf(periodRailCenter)
      : railPeriods.findIndex((period) => period > periodRailCenter);
    const safeIndex = currentIndex === -1 ? railPeriods.length - 1 : currentIndex;
    const nextIndex = clamp(safeIndex + direction, 0, railPeriods.length - 1);
    setPeriodRailCenter(railPeriods[nextIndex]!);
  }

  function chooseDatePreset(preset: (typeof DATE_PRESETS)[number]) {
    const range = preset.resolve(fiscalYearStartMonth);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    onChange(
      { ...scope, period: null },
      {
        dateFrom: range.from,
        dateTo: range.to,
        datePreset: preset.id,
        relativeRange: null,
      },
    );
    setOpen(false);
  }

  function applyDateRange() {
    onChange(
      { ...scope, period: null },
      {
        dateFrom: draftFrom || null,
        dateTo: draftTo || null,
        datePreset: draftFrom || draftTo ? "custom" : null,
        relativeRange: null,
      },
    );
    setOpen(false);
  }

  function chooseRelativeRange(id: string) {
    onChange(
      { ...scope, period: null },
      {
        dateFrom: null,
        dateTo: null,
        datePreset: null,
        relativeRange: id,
      },
    );
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 items-center gap-2 rounded-md px-0 py-1 text-sm font-normal text-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          title={label}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        collisionPadding={12}
        side="bottom"
        sideOffset={6}
        className="overflow-hidden p-0"
        style={{
          width: "min(430px, calc(100vw - 32px))",
          maxHeight: "min(320px, var(--radix-dropdown-menu-content-available-height))",
          maxWidth: "min(430px, calc(100vw - 32px))",
        }}
      >
        <div
          className="flex max-h-[inherit] min-h-0 flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
            <div>
              <div className="text-sm font-semibold text-foreground">Fiscal lens</div>
            </div>
            <div className="rounded-full border bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              FY {scope.fiscalYear}
            </div>
          </div>

          <div className="flex shrink-0 gap-1 border-b bg-muted/20 px-2 py-1">
            {([
              ["fiscal", "Fiscal Period"],
              ["date-range", "Date Range"],
              ["relative", "Relative"],
            ] as const).map(([id, modeLabel]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  mode === id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {modeLabel}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {mode === "fiscal" && (
              <div className="p-2">
              <div className="mb-1.5 flex h-8 items-center justify-between rounded-md border bg-background px-2">
                <button
                  type="button"
                  onClick={() => setDraftYear((year) => year - 1)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Previous fiscal year"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-medium text-foreground">FY {draftYear}</div>
                <button
                  type="button"
                  onClick={() => setDraftYear((year) => year + 1)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Next fiscal year"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-1.5 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={chooseCurrentPeriod}
                  className="rounded-full border bg-background px-2 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Current period
                </button>
                <button
                  type="button"
                  onClick={choosePreviousPeriod}
                  className="rounded-full border bg-background px-2 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Previous period
                </button>
                <button
                  type="button"
                  onClick={() => chooseFiscalPeriod(null)}
                  className="rounded-full border bg-background px-2 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Full year
                </button>
                <button
                  type="button"
                  onClick={() => chooseFiscalPeriod(0)}
                  className="rounded-full border bg-background px-2 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Opening
                </button>
              </div>

              <div className="grid grid-cols-[22px_1fr_1fr_1fr_22px] items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => movePeriodRail(-1)}
                  disabled={!canMoveRailLeft}
                  className="flex h-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-35"
                  aria-label="Previous periods"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {railWindow.map((period) => {
                  const status = statusByPeriod.get(period);
                  const selected = scope.fiscalYear === draftYear && scope.period === period;
                  return (
                    <button
                      key={period}
                      type="button"
                      onClick={() => chooseFiscalPeriod(period)}
                      className={cn(
                        "h-9 rounded-md border px-1.5 py-0.5 text-left transition-colors hover:bg-muted/40",
                        selected && "border-foreground bg-muted/50",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-foreground">
                          {period === 0 ? "Opening" : `P${period}`}
                        </span>
                        {selected && <Check className="h-3 w-3 text-primary" />}
                      </span>
                      <span className="flex items-center text-[10px] text-muted-foreground">
                        <span className="truncate">
                          {periodLabel(draftYear, period, fiscalYearStartMonth)}
                          {" "}
                          <span className="text-muted-foreground/80">
                            {periodStatusLabel(status ?? null)}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => movePeriodRail(1)}
                  disabled={!canMoveRailRight}
                  className="flex h-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-35"
                  aria-label="Next periods"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              </div>
            )}

            {mode === "date-range" && (
              <div className="space-y-3 p-3">
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => chooseDatePreset(preset)}
                    className={cn(
                      "rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground",
                      datePreset === preset.id && "border-foreground text-foreground",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  From
                  <input
                    type="date"
                    value={draftFrom}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  To
                  <input
                    type="date"
                    value={draftTo}
                    onChange={(event) => setDraftTo(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftFrom("");
                    setDraftTo("");
                    onChange({ ...scope, period: null }, CLEAR_DATE_LENS);
                    setOpen(false);
                  }}
                  className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={applyDateRange}
                  className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
                >
                  Apply range
                </button>
              </div>
              </div>
            )}

            {mode === "relative" && (
              <div className="grid gap-2 p-3">
              {RELATIVE_OPTIONS.map((option) => {
                const selected = relativeRange === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseRelativeRange(option.id)}
                    className={cn(
                      "rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/40",
                      selected && "border-foreground bg-muted/50",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{option.label}</span>
                      {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                  </button>
                );
              })}
              </div>
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
