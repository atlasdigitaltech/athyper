"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";
import { scopeCacheKey, scopeToParams } from "../lib/scope";

export interface TrialBalanceRow {
  companyCode: string;
  accountCode: string;
  accountName: string;
  accountClass: string;
  /** Opening debit balance for the period */
  openingDebit: number;
  /** Opening credit balance for the period */
  openingCredit: number;
  /** Period movement — debit */
  movementDebit: number;
  /** Period movement — credit */
  movementCredit: number;
  /** Closing debit balance */
  closingDebit: number;
  /** Closing credit balance */
  closingCredit: number;
  /** Net closing balance (debit positive, credit negative) */
  closingBalance: number;
}

export interface TrialBalanceData {
  rows: TrialBalanceRow[];
  /** ISO timestamp of when the data was computed */
  asAt: string;
  /** True when the underlying period is still open (not hard-closed) */
  isLive: boolean;
}

async function fetchTrialBalance(scope: FinanceScope): Promise<TrialBalanceData> {
  const res = await fetch(`/api/finance/trial-balance?${scopeToParams(scope)}`);
  if (!res.ok) throw new Error("Failed to load trial balance");
  return res.json() as Promise<TrialBalanceData>;
}

export function useTrialBalance(scope: FinanceScope) {
  return useQuery({
    queryKey: ["finance", "trial-balance", ...scopeCacheKey(scope)],
    queryFn: () => fetchTrialBalance(scope),
    enabled: !!scope.scopeId,
    staleTime: 60 * 1000,
  });
}
