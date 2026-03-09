"use client";

// lib/finance/use-statement-compare.ts
//
// Data-fetching hook for statement comparison mode.
// GET /api/fin/reporting/statement/compare -> StatementCompareDTO

import { useState, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  StatementCompareDTO,
  StatementCompareFilters,
} from "./reporting-types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseStatementCompareResult {
  data: StatementCompareDTO | null;
  loading: boolean;
  error: string | null;
  filters: StatementCompareFilters | null;
  compare: (filters: StatementCompareFilters) => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStatementCompare(): UseStatementCompareResult {
  const [data, setData] = useState<StatementCompareDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StatementCompareFilters | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const compare = useCallback(async (f: StatementCompareFilters) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFilters(f);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const params = new URLSearchParams();
      params.set("entityCode", f.entityCode);
      params.set("statementCode", f.statementCode);
      params.set("fiscalYear", String(f.fiscalYear));
      if (f.periodFrom != null) params.set("periodFrom", String(f.periodFrom));
      if (f.periodTo != null) params.set("periodTo", String(f.periodTo));
      if (f.bookCode) params.set("bookCode", f.bookCode);
      if (f.cubeCode) params.set("cubeCode", f.cubeCode);
      params.set("baseSource", f.baseSource);
      params.set("compareSource", f.compareSource);

      const url = `/api/fin/reporting/statement/compare?${params}`;
      const result = await finGet<StatementCompareDTO>(url, controller.signal);

      if (controller.signal.aborted) return;
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Comparison failed";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setData(null);
    setFilters(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, filters, compare, clear };
}
