"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Columns3 } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
} from "@athyper/platform-ui/primitives";
import { useScopeOptions } from "../hooks/useScopeOptions";
import { useFiscalPeriods } from "../hooks/useFiscalPeriods";
import { parseFinanceScope, scopeToParams, type FinanceScope } from "../lib/scope";
import { FinanceScopeChooser } from "./FinanceScopeChooser";
import { FiscalLensChooser, type FiscalLensUrlParams } from "./FiscalLensChooser";

const STORAGE_KEY = "finance_scope_v1";
const SCOPE_PARAM_KEYS = [
  "scopeType",
  "scopeId",
  "fiscalYear",
  "period",
  "bookId",
  "currency",
  "transactionCurrency",
  "comparative",
] as const;

const FISCAL_LENS_PARAM_KEYS = [
  "dateFrom",
  "dateTo",
  "datePreset",
  "relativeRange",
] as const;

const GROUP_BY_PARAM_KEY = "groupBy";
const ACCUMULATED_VALUES_PARAM_KEY = "accumulatedValues";

type StatementGroupBy = "none" | "fiscal_year" | "fiscal_quarter" | "fiscal_period";

const GROUP_BY_OPTIONS: Array<{
  value: StatementGroupBy;
  label: string;
  shortLabel: string;
}> = [
  { value: "none", label: "No grouping", shortLabel: "Group" },
  { value: "fiscal_year", label: "Year by year", shortLabel: "Year" },
  { value: "fiscal_quarter", label: "Quarter by quarter", shortLabel: "Quarter" },
  { value: "fiscal_period", label: "Fiscal period", shortLabel: "Period" },
];

interface FinanceContextBarProps {
  variant?: "bar" | "inline";
  className?: string;
  hideScope?: boolean;
  hideFiscalLens?: boolean;
  hideGrouping?: boolean;
  hideCompare?: boolean;
  showGraphViewToggle?: boolean;
  graphViewEnabled?: boolean;
  onGraphViewChange?: (enabled: boolean) => void;
}

function currentFiscalYear(): number {
  return new Date().getFullYear();
}

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
      scopeId: scope.scopeId,
      fiscalYear: scope.fiscalYear,
    }));
  } catch {
    // Best effort only.
  }
}

function parseStatementGroupBy(value: string | null): StatementGroupBy {
  switch ((value ?? "").trim().toLowerCase()) {
    case "fy":
    case "year":
    case "years":
    case "fiscal_year":
      return "fiscal_year";
    case "q":
    case "quarter":
    case "quarters":
    case "fiscal_quarter":
      return "fiscal_quarter";
    case "p":
    case "period":
    case "periods":
    case "month":
    case "months":
    case "fiscal_period":
      return "fiscal_period";
    default:
      return "none";
  }
}

function parseAccumulatedValues(value: string | null): boolean {
  switch ((value ?? "").trim().toLowerCase()) {
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return true;
  }
}

export function FinanceContextBar({
  variant = "bar",
  className,
  hideScope = false,
  hideFiscalLens = false,
  hideGrouping = false,
  hideCompare = false,
  showGraphViewToggle = false,
  graphViewEnabled = false,
  onGraphViewChange,
}: FinanceContextBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const rawFromUrl = useMemo(() => Object.fromEntries(new URLSearchParams(searchKey).entries()), [searchKey]);
  const hasUrlScope = !!rawFromUrl.scopeId;
  const { data: scopeOptions } = useScopeOptions();

  const [scope, setScope] = useState<FinanceScope>(() =>
    parseFinanceScope(rawFromUrl, {
      fiscalYear: currentFiscalYear(),
      period: null,
    }),
  );

  const pushScope = useCallback((
    next: FinanceScope,
    fiscalLensParams?: FiscalLensUrlParams,
    groupByOverride?: StatementGroupBy | null,
    accumulatedValuesOverride?: boolean | null,
  ) => {
    setScope(next);
    writeScopeToStorage(next);

    const params = new URLSearchParams(searchKey);
    for (const key of SCOPE_PARAM_KEYS) params.delete(key);
    scopeToParams(next).forEach((value, key) => params.set(key, value));

    if (fiscalLensParams) {
      for (const key of FISCAL_LENS_PARAM_KEYS) {
        const value = fiscalLensParams[key];
        if (value == null || value === "") params.delete(key);
        else params.set(key, value);
      }
    }

    if (groupByOverride !== undefined) {
      if (!groupByOverride || groupByOverride === "none") {
        params.delete(GROUP_BY_PARAM_KEY);
        params.delete(ACCUMULATED_VALUES_PARAM_KEY);
      } else {
        params.set(GROUP_BY_PARAM_KEY, groupByOverride);
      }
    }

    if (accumulatedValuesOverride !== undefined) {
      if (accumulatedValuesOverride === null) params.delete(ACCUMULATED_VALUES_PARAM_KEY);
      else params.set(ACCUMULATED_VALUES_PARAM_KEY, accumulatedValuesOverride ? "true" : "false");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchKey]);

  useEffect(() => {
    const raw = Object.fromEntries(new URLSearchParams(searchKey).entries());

    if (hasUrlScope) {
      setScope(parseFinanceScope(raw, {
        fiscalYear: currentFiscalYear(),
        period: null,
      }));
      return;
    }

    const saved = readScopeFromStorage();
    if (saved?.scopeId) {
      pushScope(parseFinanceScope(raw, {
        ...saved,
        fiscalYear: saved.fiscalYear ?? currentFiscalYear(),
        period: null,
      }));
      return;
    }

    if (scopeOptions?.companies[0]) {
      pushScope({
        scopeType: "company",
        scopeId: scopeOptions.companies[0].code,
        fiscalYear: currentFiscalYear(),
        period: null,
      });
    }
  }, [hasUrlScope, pushScope, scopeOptions, searchKey]);

  const activeCompany = useMemo(() => {
    const companies = scopeOptions?.companies ?? [];

    if (scope.scopeType === "company") {
      return companies.find((company) => company.code === scope.scopeId);
    }

    const entity = scopeOptions?.entities.find((item) => item.id === scope.scopeId);
    const firstCompanyCode = entity?.companyCodes?.find((code) =>
      companies.some((company) => company.code === code),
    );
    return firstCompanyCode
      ? companies.find((company) => company.code === firstCompanyCode)
      : undefined;
  }, [scope.scopeId, scope.scopeType, scopeOptions]);

  const fiscalYearStartMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const activeCompanyCode = scope.scopeType === "company" ? scope.scopeId : activeCompany?.code;
  const { data: livePeriods } = useFiscalPeriods(activeCompanyCode, scope.fiscalYear);

  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const datePreset = searchParams.get("datePreset");
  const relativeRange = searchParams.get("relativeRange");
  const groupBy = parseStatementGroupBy(searchParams.get(GROUP_BY_PARAM_KEY));
  const accumulatedValues = parseAccumulatedValues(searchParams.get(ACCUMULATED_VALUES_PARAM_KEY));
  const groupOption = GROUP_BY_OPTIONS.find((option) => option.value === groupBy) ?? GROUP_BY_OPTIONS[0]!;
  const inline = variant === "inline";
  const showScope = !hideScope;
  const showFiscalLens = !hideFiscalLens;
  const showGrouping = !hideGrouping;
  const showCompare = !hideCompare;
  const showGraphView = showGraphViewToggle && !!onGraphViewChange;

  const setGroupBy = useCallback((nextGroupBy: StatementGroupBy) => {
    pushScope(
      nextGroupBy === "none" ? scope : { ...scope, comparative: false },
      undefined,
      nextGroupBy,
      nextGroupBy === "none" ? null : accumulatedValues,
    );
  }, [accumulatedValues, pushScope, scope]);

  const setAccumulatedValues = useCallback((nextAccumulatedValues: boolean) => {
    pushScope(scope, undefined, undefined, nextAccumulatedValues);
  }, [pushScope, scope]);

  return (
    <div
      className={cn(
        inline
          ? "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm xl:flex-nowrap"
          : "flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-sm",
        className,
      )}
    >
      {showScope && (
        scopeOptions ? (
          <FinanceScopeChooser
            scope={scope}
            scopeOptions={scopeOptions}
            onChange={(next) => pushScope(next)}
            className={inline ? "w-full sm:w-auto sm:max-w-[320px] lg:max-w-[420px] xl:max-w-[520px]" : "max-w-[280px]"}
          />
        ) : (
          <span className="text-sm text-muted-foreground">Loading...</span>
        )
      )}

      {showScope && showFiscalLens && (
        <span className="hidden text-border/80 sm:inline">|</span>
      )}

      {showFiscalLens && (
        <FiscalLensChooser
          scope={scope}
          fiscalYearStartMonth={fiscalYearStartMonth}
          periods={livePeriods}
          dateFrom={dateFrom}
          dateTo={dateTo}
          datePreset={datePreset}
          relativeRange={relativeRange}
          onChange={pushScope}
          className={inline ? "max-w-[calc(100%-5rem)] sm:max-w-[260px]" : "max-w-[300px]"}
        />
      )}

      {(showScope || showFiscalLens) && (showGrouping || showCompare) && (
        <span className="hidden text-border/80 sm:inline">|</span>
      )}

      {showGrouping && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-2 text-sm font-normal transition-colors",
                  groupBy !== "none"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Columns3 className="h-4 w-4" />
                <span>{groupOption.shortLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[190px]">
              {GROUP_BY_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => setGroupBy(option.value)}
                  className="flex items-center justify-between gap-3"
                >
                  <span>{option.label}</span>
                  {groupBy === option.value && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {(groupBy !== "none" || showGraphView || showCompare) && (
            <span className="hidden text-border/80 sm:inline">|</span>
          )}

          {groupBy !== "none" && (
            <>
              <div className="inline-flex h-8 shrink-0 items-center gap-2 rounded px-2 text-sm text-muted-foreground">
                <span>Accumulated</span>
                <Switch
                  checked={accumulatedValues}
                  onCheckedChange={setAccumulatedValues}
                  aria-label="Accumulated values"
                />
                <span className="min-w-6 font-medium text-foreground">
                  {accumulatedValues ? "Yes" : "No"}
                </span>
              </div>

              {(showGraphView || showCompare) && (
                <span className="hidden text-border/80 sm:inline">|</span>
              )}
            </>
          )}
        </>
      )}

      {showGraphView && (
        <>
          <div className="inline-flex h-8 shrink-0 items-center gap-2 rounded px-2 text-sm text-muted-foreground">
            <span>Graph View</span>
            <Switch
              checked={graphViewEnabled}
              onCheckedChange={onGraphViewChange}
              aria-label="Graph view"
            />
            <span className="min-w-6 font-medium text-foreground">
              {graphViewEnabled ? "Yes" : "No"}
            </span>
          </div>

          {showCompare && (
            <span className="hidden text-border/80 sm:inline">|</span>
          )}
        </>
      )}

      {showCompare && (
        <button
          type="button"
          onClick={() => {
            const nextComparative = !scope.comparative;
            pushScope(
              { ...scope, comparative: nextComparative },
              undefined,
              nextComparative ? "none" : undefined,
              nextComparative ? null : undefined,
            );
          }}
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-sm font-normal transition-colors",
            scope.comparative
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          Compare
        </button>
      )}
    </div>
  );
}
