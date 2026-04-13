"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";
import { scopeCacheKey } from "../lib/scope";
import type { FiscalPeriodStatus } from "../lib/period";

export interface PeriodStatusData {
  companyCode: string;
  fiscalYear: number;
  periodNumber: number;
  fiscalPeriodStatus: FiscalPeriodStatus | null;
  bookPeriodStatus: FiscalPeriodStatus | null;
  /** Combined effective status (most restrictive of the two) */
  effectiveStatus: FiscalPeriodStatus | null;
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
