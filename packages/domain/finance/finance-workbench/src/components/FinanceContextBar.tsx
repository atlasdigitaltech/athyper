"use client";

/**
 * FinanceContextBar
 *
 * Sticky sub-header rendered inside (workbench)/finance/layout.tsx.
 * Owns the shared scope state for all finance workbench pages by reading
 * and writing URL query params — no prop drilling required.
 *
 * Hydration safety: initial state is derived from URL only (no localStorage
 * on first render). After mount, localStorage is checked as a fallback only
 * when the URL carries no scope params, avoiding SSR/client mismatch.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Building2, ChevronDown, CalendarDays } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { useScopeOptions } from "../hooks/useScopeOptions";
import { parseFinanceScope, scopeToParams } from "../lib/scope";
import type { FinanceScope } from "../lib/scope";

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
      scopeType: scope.scopeType,
      scopeId:   scope.scopeId,
      fiscalYear: scope.fiscalYear,
    }));
  } catch { /* ignore */ }
}

// ── Period label helpers ──────────────────────────────────────────────────────

const MONTH_LABELS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  "Adj-1", "Adj-2", "Adj-3", "Adj-4",
];

function periodLabel(p: number | null): string {
  if (p === null) return "Full Year";
  if (p === 0) return "Opening";
  return MONTH_LABELS[p] ?? `P${p}`;
}

function currentPeriod(): number {
  return new Date().getMonth() + 1; // 1-based
}

function currentFiscalYear(): number {
  return new Date().getFullYear();
}

// ── Dropdown primitive ────────────────────────────────────────────────────────

interface SelectProps<T extends string | number | null> {
  value:    T;
  options:  { value: T; label: string }[];
  onChange: (v: T) => void;
  prefix?:  React.ReactNode;
  className?: string;
}

function InlineSelect<T extends string | number | null>({
  value, options, onChange, prefix, className,
}: SelectProps<T>) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className={cn("relative", className)}>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          const opt = options.find((o) => String(o.value) === raw);
          if (opt) onChange(opt.value);
        }}
        className="appearance-none cursor-pointer bg-transparent pl-0 pr-5 py-0 text-xs font-medium text-foreground border-0 outline-none focus:ring-0"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value ?? "")}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      {/* Accessible visible label */}
      <span className="sr-only">{selected?.label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinanceContextBar() {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const { data: scopeOptions } = useScopeOptions();

  // Build scope from URL — server-safe, no localStorage
  const rawFromUrl = Object.fromEntries(searchParams.entries());
  const hasUrlScope = !!(rawFromUrl.scopeId);

  const [scope, setScope] = useState<FinanceScope>(() =>
    parseFinanceScope(rawFromUrl, {
      fiscalYear:  currentFiscalYear(),
      period:      currentPeriod(),
    }),
  );

  // After mount: restore from localStorage only when URL has no scope
  useEffect(() => {
    if (!hasUrlScope) {
      const saved = readScopeFromStorage();
      if (saved?.scopeId) {
        setScope((prev) => parseFinanceScope(rawFromUrl, {
          ...saved,
          fiscalYear: prev.fiscalYear,
          period:     prev.period,
        }));
      } else if (scopeOptions?.companies[0]) {
        // Default to first company
        setScope((prev) => ({
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

  // ── Company options ────────────────────────────────────────────────────────
  const companyOptions = (scopeOptions?.companies ?? []).map((c) => ({
    value: c.code,
    label: `${c.code} — ${c.name}`,
  }));

  // ── Fiscal year options: current year ± 2 ─────────────────────────────────
  const thisYear = currentFiscalYear();
  const yearOptions = [-2, -1, 0, 1, 2].map((d) => ({
    value: thisYear + d,
    label: String(thisYear + d),
  }));

  // ── Period options ─────────────────────────────────────────────────────────
  const periodOptions: { value: number | null; label: string }[] = [
    { value: null, label: "Full Year" },
    { value: 0,    label: "Opening" },
    ...Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: MONTH_LABELS[i + 1]!,
    })),
  ];

  return (
    <div className="flex items-center gap-1 px-4 py-2 text-xs border-b bg-muted/30">

      {/* Company selector */}
      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-1" />
      {companyOptions.length > 0 ? (
        <InlineSelect
          value={scope.scopeId}
          options={companyOptions.length > 0 ? companyOptions : [{ value: scope.scopeId, label: scope.scopeId }]}
          onChange={(v) => pushScope({ ...scope, scopeType: "company", scopeId: v })}
          className="max-w-[220px]"
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

      {/* Period */}
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-1" />
      <InlineSelect
        value={scope.period}
        options={periodOptions}
        onChange={(v) => pushScope({ ...scope, period: v })}
        className="w-24"
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
    </div>
  );
}
