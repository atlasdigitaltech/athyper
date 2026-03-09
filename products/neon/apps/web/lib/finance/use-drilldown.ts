"use client";

// lib/finance/use-drilldown.ts
//
// Data-fetching hook for dashboard drilldowns into cube dimensions.
//
// GET /api/fin/reporting/drilldown -> DrilldownResultDTO
//
// Supports progressive drilldown: the caller maintains a "breadcrumb" of
// parent filters and the hook fetches the next drill axis.

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";
import { cachedFetch, buildCacheKey } from "./reporting-cache";

import type {
  DrilldownRequest,
  DrilldownRowDTO,
  PnLGroupBy,
} from "./reporting-types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseDrilldownResult {
  rows: DrilldownRowDTO[];
  totals: {
    periodDebit: string;
    periodCredit: string;
    amountNet: string;
  } | null;
  axis: PnLGroupBy | null;
  parentFilters: Record<string, string>;
  truncated: boolean;
  loading: boolean;
  error: string | null;
  // Actions
  drillInto: (request: DrilldownRequest) => void;
  drillBack: () => void;
  breadcrumbs: DrilldownBreadcrumb[];
}

export interface DrilldownBreadcrumb {
  axis: PnLGroupBy;
  valueId: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDrilldown(): UseDrilldownResult {
  const [rows, setRows] = useState<DrilldownRowDTO[]>([]);
  const [totals, setTotals] = useState<UseDrilldownResult["totals"]>(null);
  const [axis, setAxis] = useState<PnLGroupBy | null>(null);
  const [parentFilters, setParentFilters] = useState<Record<string, string>>({});
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<DrilldownBreadcrumb[]>([]);
  const [currentRequest, setCurrentRequest] = useState<DrilldownRequest | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchDrilldown = useCallback(async (request: DrilldownRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("entityCode", request.entityCode);
      params.set("cubeCode", request.cubeCode);
      params.set("fiscalYear", String(request.fiscalYear));
      params.set("periodNumber", String(request.periodNumber));
      params.set("drillAxis", request.drillAxis);
      if (request.bookCode) params.set("bookCode", request.bookCode);

      // Add parent filters as query params
      for (const [key, val] of Object.entries(request.parentFilters)) {
        const paramName = key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()) + "ValueId";
        params.set(paramName, val);
      }

      const url = `/api/fin/reporting/drilldown?${params}`;
      const data = await cachedFetch(
        buildCacheKey(url),
        () => finGet<{
          axis: PnLGroupBy;
          parentFilters: Record<string, string>;
          rows: DrilldownRowDTO[];
          totals: { periodDebit: string; periodCredit: string; amountNet: string };
          truncated?: boolean;
        }>(url, controller.signal),
      );

      if (controller.signal.aborted) return;

      setRows(data.rows);
      setTotals(data.totals);
      setAxis(data.axis);
      setParentFilters(data.parentFilters);
      setTruncated(data.truncated ?? false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load drilldown data";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // When currentRequest changes, fetch
  useEffect(() => {
    if (currentRequest) {
      fetchDrilldown(currentRequest);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [currentRequest, fetchDrilldown]);

  const drillInto = useCallback((request: DrilldownRequest) => {
    setCurrentRequest(request);
  }, []);

  const drillBack = useCallback(() => {
    if (breadcrumbs.length > 0) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      // Rebuild parent filters from remaining breadcrumbs
      const newFilters: Record<string, string> = {};
      for (const bc of newBreadcrumbs) {
        newFilters[bc.axis] = bc.valueId;
      }
      setParentFilters(newFilters);
    }
  }, [breadcrumbs]);

  return {
    rows,
    totals,
    axis,
    parentFilters,
    truncated,
    loading,
    error,
    drillInto,
    drillBack,
    breadcrumbs,
  };
}
