"use client";

// lib/finance/use-month-end.ts
//
// Data-fetching hook for month-end comparative analysis.
//
// GET /api/fin/reporting/month-end -> MonthEndComparisonDTO[]

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";
import { cachedFetch, buildCacheKey, invalidateCache } from "./reporting-cache";

import type {
  MonthEndAnalysisFilters,
  MonthEndComparisonDTO,
} from "./reporting-types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseMonthEndResult {
  accounts: MonthEndComparisonDTO[];
  periodNumbers: number[];
  loading: boolean;
  error: string | null;
  filters: MonthEndAnalysisFilters;
  setFilters: (filters: MonthEndAnalysisFilters) => void;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMonthEnd(
  initialFilters: MonthEndAnalysisFilters,
): UseMonthEndResult {
  const [filters, setFilters] = useState<MonthEndAnalysisFilters>(initialFilters);
  const [accounts, setAccounts] = useState<MonthEndComparisonDTO[]>([]);
  const [periodNumbers, setPeriodNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("entityCode", filters.entityCode);
      params.set("fiscalYear", String(filters.fiscalYear));
      if (filters.cubeCode) params.set("cubeCode", filters.cubeCode);
      if (filters.bookCode) params.set("bookCode", filters.bookCode);
      if (filters.periodsToCompare != null)
        params.set("periodsToCompare", String(filters.periodsToCompare));
      if (filters.accountTypes?.length)
        params.set("accountTypes", filters.accountTypes.join(","));
      if (filters.costCenterValueId)
        params.set("costCenterValueId", filters.costCenterValueId);
      if (filters.profitCenterValueId)
        params.set("profitCenterValueId", filters.profitCenterValueId);
      if (filters.projectValueId)
        params.set("projectValueId", filters.projectValueId);
      if (filters.regionValueId)
        params.set("regionValueId", filters.regionValueId);

      const url = `/api/fin/reporting/month-end?${params}`;
      const data = await cachedFetch(
        buildCacheKey(url),
        () => finGet<{
          accounts: MonthEndComparisonDTO[];
          periodNumbers: number[];
        }>(url, controller.signal),
      );

      if (controller.signal.aborted) return;

      setAccounts(data.accounts);
      setPeriodNumbers(data.periodNumbers);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load month-end analysis";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    invalidateCache(buildCacheKey("/api/fin/reporting/month-end"));
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return {
    accounts,
    periodNumbers,
    loading,
    error,
    filters,
    setFilters,
    refresh,
  };
}
