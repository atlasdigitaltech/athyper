"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";
import { scopeCacheKey, scopeToParams } from "../lib/scope";

export interface AccountAnalysisPeriod {
  period:         number | string;   // 1–12 for regular, "adj1"–"adj4" for adjustment
  periodLabel:    string;            // "Jan", "Feb", … or "Adj 1"
  openingBalance: number;
  totalDebits:    number;
  totalCredits:   number;
  netMovement:    number;
  closingBalance: number;
  entryCount:     number;
}

export interface AccountAnalysisData {
  accountCode:        string;
  accountName:        string;
  accountClass:       string;
  normalBalance:      "debit" | "credit";
  periods:            AccountAnalysisPeriod[];
  yearOpeningBalance: number;
  yearTotalDebits:    number;
  yearTotalCredits:   number;
  yearClosingBalance: number;
  isLive:             boolean;
  asAt:               string;
}

export interface AccountAnalysisParams {
  scope:       FinanceScope;
  accountCode: string;
}

async function fetchAccountAnalysis(params: AccountAnalysisParams): Promise<AccountAnalysisData> {
  const urlParams = scopeToParams(params.scope);
  urlParams.set("accountCode", params.accountCode);
  const res = await fetch(`/api/finance/account-analysis?${urlParams}`);
  if (!res.ok) throw new Error("Failed to load account analysis");
  return res.json() as Promise<AccountAnalysisData>;
}

export function useAccountAnalysis(params: AccountAnalysisParams) {
  return useQuery({
    queryKey: [
      "finance",
      "account-analysis",
      params.accountCode,
      ...scopeCacheKey(params.scope),
    ],
    queryFn: () => fetchAccountAnalysis(params),
    enabled: !!params.scope.scopeId && !!params.accountCode,
    staleTime: 60 * 1000,
  });
}
