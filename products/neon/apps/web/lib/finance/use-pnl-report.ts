"use client";

// lib/finance/use-pnl-report.ts
//
// Data-fetching hook for multi-dimensional P&L reports from the cube engine.
//
// GET /api/fin/reporting/pnl -> PnLReportDTO
//
// Follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-gl-report.ts.

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";
import { cachedFetch, buildCacheKey, invalidateCache } from "./reporting-cache";

import type {
  PnLReportFilters,
  PnLReportRowDTO,
  PnLGroupBy,
  DimensionValueLabel,
  CubeDefinitionDTO,
} from "./reporting-types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UsePnLReportResult {
  rows: PnLReportRowDTO[];
  totals: {
    revenue: string;
    expense: string;
    netIncome: string;
    priorRevenue: string | null;
    priorExpense: string | null;
    priorNetIncome: string | null;
  } | null;
  dimensionLabels: Record<string, DimensionValueLabel>;
  lastRefreshAt: string | null;
  truncated: boolean;
  loading: boolean;
  error: string | null;
  filters: PnLReportFilters;
  setFilters: (filters: PnLReportFilters) => void;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPnLParams(filters: PnLReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("entityCode", filters.entityCode);
  params.set("fiscalYear", String(filters.fiscalYear));
  if (filters.cubeCode) params.set("cubeCode", filters.cubeCode);
  if (filters.bookCode) params.set("bookCode", filters.bookCode);
  if (filters.periodFrom != null) params.set("periodFrom", String(filters.periodFrom));
  if (filters.periodTo != null) params.set("periodTo", String(filters.periodTo));
  if (filters.groupBy) params.set("groupBy", filters.groupBy);
  if (filters.costCenterValueId) params.set("costCenterValueId", filters.costCenterValueId);
  if (filters.profitCenterValueId) params.set("profitCenterValueId", filters.profitCenterValueId);
  if (filters.projectValueId) params.set("projectValueId", filters.projectValueId);
  if (filters.regionValueId) params.set("regionValueId", filters.regionValueId);
  if (filters.segmentValueId) params.set("segmentValueId", filters.segmentValueId);
  return params;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePnLReport(initialFilters: PnLReportFilters): UsePnLReportResult {
  const [filters, setFilters] = useState<PnLReportFilters>(initialFilters);
  const [rows, setRows] = useState<PnLReportRowDTO[]>([]);
  const [totals, setTotals] = useState<UsePnLReportResult["totals"]>(null);
  const [dimensionLabels, setDimensionLabels] = useState<Record<string, DimensionValueLabel>>({});
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
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
      const params = buildPnLParams(filters);
      const url = `/api/fin/reporting/pnl?${params}`;
      const data = await cachedFetch(
        buildCacheKey(url),
        () => finGet<{
          rows: PnLReportRowDTO[];
          totals: UsePnLReportResult["totals"];
          dimensionLabels: Record<string, DimensionValueLabel>;
          lastRefreshAt: string | null;
          truncated?: boolean;
        }>(url, controller.signal),
      );

      if (controller.signal.aborted) return;

      setRows(data.rows);
      setTotals(data.totals);
      setDimensionLabels(data.dimensionLabels);
      setLastRefreshAt(data.lastRefreshAt);
      setTruncated(data.truncated ?? false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load P&L report";
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
    // Invalidate cache so next fetch hits the server
    invalidateCache(buildCacheKey(`/api/fin/reporting/pnl?${buildPnLParams(filters)}`));
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData, filters]);

  return {
    rows,
    totals,
    dimensionLabels,
    lastRefreshAt,
    truncated,
    loading,
    error,
    filters,
    setFilters,
    refresh,
  };
}
