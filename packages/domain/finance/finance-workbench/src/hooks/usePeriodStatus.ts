"use client";

import { useQuery } from "@tanstack/react-query";
import { scopeCacheKey, type FinanceScope } from "../lib/scope";
import type { FiscalPeriodStatus } from "../lib/period";
import type { PeriodGateDecision } from "@athyper/finance-rules";

export interface PeriodStatusData {
  companyCode: string;
  fiscalYear: number;
  periodNumber: number;
  fiscalPeriodStatus: FiscalPeriodStatus | null;
  bookPeriodStatus: FiscalPeriodStatus | null;
  bookPeriodStatusSource?: "row" | "missing_treated_as_future" | "not_requested";
  /** Combined effective status (most restrictive of the two) */
  effectiveStatus: FiscalPeriodStatus | null;
  periodGateDecision?: PeriodGateDecision;
  postability?: "postable" | "adjustment_only" | "read_only" | "locked";
  postabilityReasonCode?: PeriodGateDecision["reason"];
  openedAt: string | null;
  softClosedAt: string | null;
  hardClosedAt: string | null;
}

async function fetchPeriodStatus(scope: FinanceScope): Promise<PeriodStatusData[]> {
  if (!scope.scopeId) return [];
  const params = new URLSearchParams({
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    fiscalYear: String(scope.fiscalYear),
  });
  if (scope.period !== null && scope.period !== undefined) {
    params.set("period", String(scope.period));
  }
  if (scope.bookId) params.set("bookId", scope.bookId);
  const res = await fetch(`/api/finance/period-status?${params}`);
  if (!res.ok) throw new Error("Failed to load period status");
  return res.json() as Promise<PeriodStatusData[]>;
}

export function usePeriodStatus(scope: FinanceScope) {
  return useQuery({
    queryKey: ["finance", "period-status", ...scopeCacheKey(scope)],
    queryFn: () => fetchPeriodStatus(scope),
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}
