"use client";

/**
 * FinanceContextBar
 *
 * Sticky sub-header rendered inside (workbench)/finance/layout.tsx.
 * Owns the shared scope state for all finance workbench pages by reading
 * and writing URL query params — no prop drilling required.
 *
 * Improvements (vs original):
 *  • Company dropdown is access-filtered by the runtime: only companies the
 *    signed-in user is permitted to see are returned by /finance/master/companies.
 *  • Legal entity scope is available via a grouped scope selector — entities
 *    whose child companies overlap the user's accessible set are shown.
 *  • Period labels adapt to the selected company's fiscal_year_start_month
 *    (e.g. period 1 = "Apr" for an April-start UK company).
 *  • Live fiscal periods are fetched from the DB; each option shows a status
 *    indicator and hard-closed periods are disabled.
 *  • A small "FY starts <Month>" hint appears when start month ≠ January.
 *
 * Hydration safety: initial state is derived from URL only (no localStorage
 * on first render). After mount, localStorage is used as a fallback only when
 * the URL carries no scope params, avoiding SSR/client mismatch.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown, CalendarDays } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { useScopeOptions } from "../hooks/useScopeOptions";
import { useFiscalPeriods } from "../hooks/useFiscalPeriods";
import { parseFinanceScope, scopeToParams } from "../lib/scope";
import { periodLabel } from "../lib/period";
import type { FinanceScope, ScopeType } from "../lib/scope";
import type { FiscalPeriodStatus } from "../lib/period";

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY = "finance_scope_v1";

function readScopeFromStorage(): Partial<FinanceScope> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<FinanceScope>) : null;
  } catch {
    return null;
  }
}

function writeScopeToStorage(scope: FinanceScope) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scopeType:  scope.scopeType,
      scopeId:    scope.scopeId,
      fiscalYear: scope.fiscalYear,
    }));
  } catch { /* ignore */ }
}

// ── Period status indicator (text-mode, works in native <option>) ─────────────

function periodStatusSuffix(status: FiscalPeriodStatus | "unknown"): string {
  switch (status) {
    case "open":       return " ●";
    case "soft_close": return " ◑";
    case "hard_close": return " ✕";
    default:           return "";
  }
}

function currentPeriod(): number { return new Date().getMonth() + 1; }
function currentFiscalYear(): number { return new Date().getFullYear(); }

// ── Compact inline select ─────────────────────────────────────────────────────

interface InlineSelectProps<T extends string | number | null> {
  value:    T;
  options:  { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  className?: string;
}

function InlineSelect<T extends string | number | null>({
  value, options, onChange, className,
}: InlineSelectProps<T>) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          const opt = options.find((o) => String(o.value) === raw);
          if (opt && !opt.disabled) onChange(opt.value);
        }}
        className="appearance-none cursor-pointer bg-transparent pl-0 pr-5 py-0 text-xs font-medium text-foreground border-0 outline-none focus:ring-0"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value ?? "")} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinanceContextBar() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const { data: scopeOptions } = useScopeOptions();

  // ── Scope state ────────────────────────────────────────────────────────────
  const rawFromUrl  = Object.fromEntries(searchParams.entries());
  const hasUrlScope = !!(rawFromUrl["scopeId"]);

  const [scope, setScope] = useState<FinanceScope>(() =>
    parseFinanceScope(rawFromUrl, {
      fiscalYear: currentFiscalYear(),
      period:     currentPeriod(),
    }),
  );

  // After mount: restore from localStorage only when URL has no scope
  useEffect(() => {
    if (!hasUrlScope) {
      const saved = readScopeFromStorage();
      if (saved?.scopeId) {
        setScope((prev: FinanceScope) => parseFinanceScope(rawFromUrl, {
          ...saved,
          fiscalYear: prev.fiscalYear,
          period:     prev.period,
        }));
      } else if (scopeOptions?.companies[0]) {
        setScope((prev: FinanceScope) => ({
          ...prev,
          scopeType: "company",
          scopeId:   scopeOptions.companies[0]!.code,
        }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUrlScope, scopeOptions]);

  const pushScope = useCallback((next: FinanceScope) => {
    setScope(next);
    writeScopeToStorage(next);
    const params = scopeToParams(next);
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname]);

  // ── Resolve the active company (drives fiscal calendar + period labels) ────
  // In company scope: direct lookup.
  // In legal_entity scope: pick the first child company to derive the calendar.
  const activeCompany = (() => {
    const companies = scopeOptions?.companies ?? [];
    if (scope.scopeType === "company") {
      return companies.find((c) => c.code === scope.scopeId);
    }
    const entity = scopeOptions?.entities.find((e) => e.id === scope.scopeId);
    const firstCode = (entity as unknown as { companyCodes?: string[] })?.companyCodes?.[0];
    return firstCode ? companies.find((c) => c.code === firstCode) : undefined;
  })();

  const fiscalYearStartMonth: number = activeCompany?.fiscalYearStartMonth ?? 1;

  // ── Live fiscal periods (access-filtered by server already) ───────────────
  const activeCompanyCode =
    scope.scopeType === "company" ? scope.scopeId : activeCompany?.code;
  const { data: livePeriods } = useFiscalPeriods(activeCompanyCode, scope.fiscalYear);

  const periodStatusMap = new Map<number, FiscalPeriodStatus>(
    (livePeriods ?? []).map((p) => [p.periodNumber, p.status]),
  );

  // ── Scope selector: single grouped dropdown (entities then companies) ─────
  // Entities are only shown when at least one of their child companies is in
  // the user's accessible set (server already restricts the companies list).
  const accessibleCodes = new Set((scopeOptions?.companies ?? []).map((c) => c.code));

  const scopeOptions2: { value: string; label: string }[] = [
    // Legal entity group
    ...(scopeOptions?.entities ?? [])
      .filter((e) => {
        const codes = (e as unknown as { companyCodes?: string[] }).companyCodes ?? [];
        return codes.some((code) => accessibleCodes.has(code));
      })
      .map((e) => ({ value: `legal_entity:${e.id}`, label: `[LE] ${e.code} — ${e.name}` })),
    // Company group
    ...(scopeOptions?.companies ?? []).map((c) => ({
      value: `company:${c.code}`,
      label: `${c.code} — ${c.name}`,
    })),
  ];

  const scopeSelectValue =
    scope.scopeType === "legal_entity"
      ? `legal_entity:${scope.scopeId}`
      : `company:${scope.scopeId}`;

  function handleScopeSelect(raw: string) {
    const idx  = raw.indexOf(":");
    const type = raw.slice(0, idx) as ScopeType;
    const id   = raw.slice(idx + 1);
    pushScope({ ...scope, scopeType: type, scopeId: id });
  }

  // ── Fiscal year options ────────────────────────────────────────────────────
  const thisYear   = currentFiscalYear();
  const yearOptions = [-2, -1, 0, 1, 2].map((d) => ({
    value: thisYear + d,
    label: String(thisYear + d),
  }));

  // ── Period options: live DB rows when available, else static 1–12 ─────────
  const availablePeriodNums: number[] = livePeriods && livePeriods.length > 0
    ? livePeriods.map((p) => p.periodNumber)
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const periodOpts: { value: number | null; label: string; disabled?: boolean }[] = [
    { value: null, label: "Full Year" },
    ...availablePeriodNums.map((n) => {
      const status = periodStatusMap.get(n) ?? "unknown";
      return {
        value:    n,
        label:    periodLabel(scope.fiscalYear, n, fiscalYearStartMonth) + periodStatusSuffix(status),
        disabled: status === "hard_close",
      };
    }),
  ];

  // ── Fiscal calendar hint (only when non-January start) ────────────────────
  const MONTH_NAMES = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return (
    <div className="flex items-center gap-1 px-4 py-2 text-xs border-b bg-muted/30 flex-wrap">

      {/* Scope selector: legal entities + companies in one dropdown */}
      {scopeOptions2.length > 0 ? (
        <InlineSelect
          value={scopeSelectValue}
          options={
            scopeOptions2.length > 0
              ? scopeOptions2
              : [{ value: scopeSelectValue, label: scope.scopeId }]
          }
          onChange={handleScopeSelect}
          className="max-w-[240px]"
        />
      ) : (
        <span className="text-muted-foreground text-xs">Loading…</span>
      )}

      <span className="mx-2 text-border">|</span>

      {/* Fiscal year */}
      <span className="text-muted-foreground mr-1">FY</span>
      <InlineSelect
        value={scope.fiscalYear}
        options={yearOptions}
        onChange={(v) => pushScope({ ...scope, fiscalYear: v })}
        className="w-16"
      />

      <span className="mx-2 text-border">|</span>

      {/* Period — fiscal-calendar-aware labels + live status */}
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-1" />
      <InlineSelect
        value={scope.period}
        options={periodOpts}
        onChange={(v) => pushScope({ ...scope, period: v })}
        className="w-28"
      />

      {/* Comparative toggle */}
      <span className="mx-2 text-border">|</span>
      <button
        onClick={() => pushScope({ ...scope, comparative: !scope.comparative })}
        className={cn(
          "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
          scope.comparative
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        Compare
      </button>

      {/* Non-January fiscal start hint */}
      {fiscalYearStartMonth !== 1 && (
        <>
          <span className="mx-2 text-border">|</span>
          <span className="text-[10px] text-muted-foreground">
            FY starts {MONTH_NAMES[fiscalYearStartMonth]}
          </span>
        </>
      )}
    </div>
  );
}
