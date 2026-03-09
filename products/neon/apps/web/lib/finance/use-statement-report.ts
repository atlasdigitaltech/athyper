"use client";

// lib/finance/use-statement-report.ts
//
// Data-fetching hook for rendered financial statements.
// GET /api/fin/reporting/statement -> StatementReportDTO

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";
import { cachedFetch, buildCacheKey, invalidateCache } from "./reporting-cache";

import type {
  StatementReportDTO,
  StatementReportFilters,
  StatementDefinitionDTO,
  StatementRowDTO,
  StatementDiagnostic,
  DiagnosticSummary,
} from "./reporting-types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseStatementReportResult {
  definition: StatementDefinitionDTO | null;
  rows: StatementRowDTO[];
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  loading: boolean;
  error: string | null;
  diagnosticCount: number;
  diagnosticSummary: DiagnosticSummary | null;
  filters: StatementReportFilters;
  setFilters: (filters: StatementReportFilters) => void;
  refresh: () => void;
  /** Fetch full diagnostics (calls API with ?debug=1). */
  fetchDiagnostics: () => Promise<StatementDiagnostic[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStatementParams(filters: StatementReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("entityCode", filters.entityCode);
  params.set("statementCode", filters.statementCode);
  params.set("fiscalYear", String(filters.fiscalYear));
  if (filters.periodFrom != null) params.set("periodFrom", String(filters.periodFrom));
  if (filters.periodTo != null) params.set("periodTo", String(filters.periodTo));
  if (filters.bookCode) params.set("bookCode", filters.bookCode);
  if (filters.cubeCode) params.set("cubeCode", filters.cubeCode);
  return params;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStatementReport(
  initialFilters: StatementReportFilters,
): UseStatementReportResult {
  const [filters, setFilters] = useState(initialFilters);
  const [definition, setDefinition] = useState<StatementDefinitionDTO | null>(null);
  const [rows, setRows] = useState<StatementRowDTO[]>([]);
  const [fiscalYear, setFiscalYear] = useState(initialFilters.fiscalYear);
  const [periodFrom, setPeriodFrom] = useState(initialFilters.periodFrom ?? 1);
  const [periodTo, setPeriodTo] = useState(initialFilters.periodTo ?? 12);
  const [bookCode, setBookCode] = useState("STAT");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticCount, setDiagnosticCount] = useState(0);
  const [diagnosticSummary, setDiagnosticSummary] = useState<DiagnosticSummary | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!filters.statementCode) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = buildStatementParams(filters);
      const url = `/api/fin/reporting/statement?${params}`;
      const data = await cachedFetch(
        buildCacheKey(url),
        () => finGet<StatementReportDTO>(url, controller.signal),
      );

      if (controller.signal.aborted) return;

      setDefinition(data.definition);
      setRows(data.rows);
      setFiscalYear(data.fiscalYear);
      setPeriodFrom(data.periodFrom);
      setPeriodTo(data.periodTo);
      setBookCode(data.bookCode);
      setDiagnosticCount(data.diagnosticCount ?? 0);
      setDiagnosticSummary(data.diagnosticSummary ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load statement";
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
    invalidateCache(
      buildCacheKey(`/api/fin/reporting/statement?${buildStatementParams(filters)}`),
    );
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData, filters]);

  const fetchDiagnostics = useCallback(async (): Promise<StatementDiagnostic[]> => {
    if (!filters.statementCode) return [];
    const params = buildStatementParams(filters);
    params.set("debug", "1");
    const url = `/api/fin/reporting/statement?${params}`;
    const data = await finGet<StatementReportDTO>(url);
    return data.diagnostics ?? [];
  }, [filters]);

  return {
    definition,
    rows,
    fiscalYear,
    periodFrom,
    periodTo,
    bookCode,
    loading,
    error,
    diagnosticCount,
    diagnosticSummary,
    filters,
    setFilters,
    refresh,
    fetchDiagnostics,
  };
}
