"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { scopeCacheKey, scopeToParams, type FinanceScope } from "../lib/scope";
import type { StatementLineItem } from "../components/StatementRow";

const STATEMENT_LENS_PARAM_KEYS = [
  "dateFrom",
  "dateTo",
  "datePreset",
  "relativeRange",
  "groupBy",
  "accumulatedValues",
] as const;

type StatementSearchParams = {
  get(name: string): string | null;
};

export interface StatementBucket {
  key: string;
  label: string;
  fiscalYear: number;
  period: number | null;
  quarter?: number | null;
  startDate: string;
  endDate: string;
}

export interface StatementDateRange {
  dateFrom: string;
  dateTo: string;
  datePreset: string | null;
}

export interface StatementSection {
  code: string;
  label: string;
  rows: StatementLineItem[];
  total: number;
  priorTotal?: number;
  bucketTotals?: Record<string, number>;
}

export interface BalanceSheetData {
  assets: StatementSection[];
  liabilities: StatementSection[];
  equity: StatementSection[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  asAt: string;
  isLive: boolean;
  priorTotalAssets?: number;
  priorTotalLiabilities?: number;
  priorTotalEquity?: number;
  buckets?: StatementBucket[];
  bucketMode?: "fiscal_year" | "fiscal_quarter" | "fiscal_period";
  accumulatedValues?: boolean;
  dateRange?: StatementDateRange;
}

export interface ProfitLossData {
  revenue: StatementSection[];
  costOfSales: StatementSection[];
  grossProfit: number;
  operatingExpenses: StatementSection[];
  operatingProfit: number;
  otherIncome: StatementSection[];
  otherExpenses: StatementSection[];
  netProfit: number;
  asAt: string;
  isLive: boolean;
  priorGrossProfit?: number;
  priorOperatingProfit?: number;
  priorNetProfit?: number;
  buckets?: StatementBucket[];
  bucketMode?: "fiscal_year" | "fiscal_quarter" | "fiscal_period";
  accumulatedValues?: boolean;
  dateRange?: StatementDateRange;
}

function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function resolveRelativeRange(relativeRange: string | null): { dateFrom: string; dateTo: string } | null {
  if (!relativeRange) return null;

  const today = new Date();
  switch (relativeRange) {
    case "last_7_days":
      return { dateFrom: formatDateParam(addDays(today, -6)), dateTo: formatDateParam(today) };
    case "last_30_days":
      return { dateFrom: formatDateParam(addDays(today, -29)), dateTo: formatDateParam(today) };
    case "last_90_days":
      return { dateFrom: formatDateParam(addDays(today, -89)), dateTo: formatDateParam(today) };
    case "rolling_12_months":
      return { dateFrom: formatDateParam(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1)), dateTo: formatDateParam(today) };
    default:
      return null;
  }
}

function statementParams(scope: FinanceScope, searchParams: StatementSearchParams): URLSearchParams {
  const params = scopeToParams(scope);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const relativeRange = searchParams.get("relativeRange");

  if ((!dateFrom || !dateTo) && relativeRange) {
    const resolvedRange = resolveRelativeRange(relativeRange);
    if (resolvedRange) {
      params.set("dateFrom", resolvedRange.dateFrom);
      params.set("dateTo", resolvedRange.dateTo);
      params.set("datePreset", relativeRange);
      params.set("relativeRange", relativeRange);
    }
  }

  for (const key of STATEMENT_LENS_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }
  return params;
}

function statementLensKey(searchParams: StatementSearchParams): readonly unknown[] {
  return STATEMENT_LENS_PARAM_KEYS.map((key) => searchParams.get(key) ?? null);
}

async function fetchBalanceSheet(scope: FinanceScope, searchParams: StatementSearchParams): Promise<BalanceSheetData> {
  const res = await fetch(`/api/finance/statements/balance-sheet?${statementParams(scope, searchParams)}`);
  if (!res.ok) throw new Error("Failed to load balance sheet");
  return res.json() as Promise<BalanceSheetData>;
}

async function fetchProfitLoss(scope: FinanceScope, searchParams: StatementSearchParams): Promise<ProfitLossData> {
  const res = await fetch(`/api/finance/statements/profit-loss?${statementParams(scope, searchParams)}`);
  if (!res.ok) throw new Error("Failed to load profit & loss");
  return res.json() as Promise<ProfitLossData>;
}

export function useBalanceSheet(scope: FinanceScope) {
  const searchParams = useSearchParams();
  return useQuery({
    queryKey: ["finance", "balance-sheet", ...scopeCacheKey(scope), ...statementLensKey(searchParams)],
    queryFn: () => fetchBalanceSheet(scope, searchParams),
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}

export function useProfitLoss(scope: FinanceScope) {
  const searchParams = useSearchParams();
  return useQuery({
    queryKey: ["finance", "profit-loss", ...scopeCacheKey(scope), ...statementLensKey(searchParams)],
    queryFn: () => fetchProfitLoss(scope, searchParams),
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────

export interface CashFlowData {
  operating:        StatementSection[];
  investing:        StatementSection[];
  financing:        StatementSection[];
  netOperating:     number;
  netInvesting:     number;
  netFinancing:     number;
  netChange:        number;
  openingCash:      number;
  closingCash:      number;
  asAt:             string;
  isLive:           boolean;
  priorNetOperating?: number;
  priorNetInvesting?: number;
  priorNetFinancing?: number;
  priorNetChange?:  number;
}

async function fetchCashFlow(scope: FinanceScope, searchParams: StatementSearchParams): Promise<CashFlowData> {
  const res = await fetch(`/api/finance/statements/cash-flow?${statementParams(scope, searchParams)}`);
  if (!res.ok) throw new Error("Failed to load cash flow statement");
  return res.json() as Promise<CashFlowData>;
}

export function useCashFlow(scope: FinanceScope) {
  const searchParams = useSearchParams();
  return useQuery({
    queryKey: ["finance", "cash-flow", ...scopeCacheKey(scope), ...statementLensKey(searchParams)],
    queryFn: () => fetchCashFlow(scope, searchParams),
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}
