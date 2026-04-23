"use client";

import { useQuery } from "@tanstack/react-query";
import { scopeCacheKey, scopeToParams, type FinanceScope } from "../lib/scope";
import type { StatementLineItem } from "../components/StatementRow";

export interface StatementSection {
  code: string;
  label: string;
  rows: StatementLineItem[];
  total: number;
  priorTotal?: number;
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
}

async function fetchBalanceSheet(scope: FinanceScope): Promise<BalanceSheetData> {
  const res = await fetch(`/api/finance/statements/balance-sheet?${scopeToParams(scope)}`);
  if (!res.ok) throw new Error("Failed to load balance sheet");
  return res.json() as Promise<BalanceSheetData>;
}

async function fetchProfitLoss(scope: FinanceScope): Promise<ProfitLossData> {
  const res = await fetch(`/api/finance/statements/profit-loss?${scopeToParams(scope)}`);
  if (!res.ok) throw new Error("Failed to load profit & loss");
  return res.json() as Promise<ProfitLossData>;
}

export function useBalanceSheet(scope: FinanceScope) {
  return useQuery({
    queryKey: ["finance", "balance-sheet", ...scopeCacheKey(scope)],
    queryFn: () => fetchBalanceSheet(scope),
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}

export function useProfitLoss(scope: FinanceScope) {
  return useQuery({
    queryKey: ["finance", "profit-loss", ...scopeCacheKey(scope)],
    queryFn: () => fetchProfitLoss(scope),
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

async function fetchCashFlow(scope: FinanceScope): Promise<CashFlowData> {
  const res = await fetch(`/api/finance/statements/cash-flow?${scopeToParams(scope)}`);
  if (!res.ok) throw new Error("Failed to load cash flow statement");
  return res.json() as Promise<CashFlowData>;
}

export function useCashFlow(scope: FinanceScope) {
  return useQuery({
    queryKey: ["finance", "cash-flow", ...scopeCacheKey(scope)],
    queryFn: () => fetchCashFlow(scope),
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}
