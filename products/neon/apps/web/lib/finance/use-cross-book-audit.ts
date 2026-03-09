"use client";

// lib/finance/use-cross-book-audit.ts
//
// Data-fetching hooks for cross-book integrity dashboard.
//   useCrossBookAudit()     -> CrossBookAuditIssueDTO[]
//   useBookCloseHistory()   -> BookCloseAuditEntryDTO[]
//   useCompareBooks()       -> CompareBookRowDTO[]

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  CrossBookAuditIssueDTO,
  BookCloseAuditEntryDTO,
  CompareBookRowDTO,
  ReversalChainStepDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Generic fetch hook
// ---------------------------------------------------------------------------

function useAsyncFetch<T>(url: string | null): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await finGet<T>(url, controller.signal);
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load data";
      setError(message);
      setData(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Cross-Book Integrity Audit
// ---------------------------------------------------------------------------

export interface AuditFilters {
  entityCode?: string;
  severity?: string;
}

export function useCrossBookAudit(
  filters: AuditFilters = {},
): UseAsyncResult<CrossBookAuditIssueDTO[]> {
  const params = new URLSearchParams();
  if (filters.entityCode) params.set("entityCode", filters.entityCode);
  if (filters.severity) params.set("severity", filters.severity);
  const qs = params.toString();
  const url = `/api/fin/admin/cross-book-audit${qs ? `?${qs}` : ""}`;

  return useAsyncFetch<CrossBookAuditIssueDTO[]>(url);
}

// ---------------------------------------------------------------------------
// Book-Close Audit History
// ---------------------------------------------------------------------------

export interface CloseHistoryFilters {
  entityCode?: string;
  bookCode?: string;
  fiscalYear?: number;
}

export function useBookCloseHistory(
  filters: CloseHistoryFilters = {},
): UseAsyncResult<BookCloseAuditEntryDTO[]> {
  const params = new URLSearchParams();
  if (filters.entityCode) params.set("entityCode", filters.entityCode);
  if (filters.bookCode) params.set("bookCode", filters.bookCode);
  if (filters.fiscalYear) params.set("fiscalYear", String(filters.fiscalYear));
  const qs = params.toString();
  const url = `/api/fin/admin/book-close-history${qs ? `?${qs}` : ""}`;

  return useAsyncFetch<BookCloseAuditEntryDTO[]>(url);
}

// ---------------------------------------------------------------------------
// Compare Books
// ---------------------------------------------------------------------------

export interface CompareFilters {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  accountId?: string;
}

export function useCompareBooks(
  filters: CompareFilters | null,
): UseAsyncResult<CompareBookRowDTO[]> {
  let url: string | null = null;
  if (filters) {
    const params = new URLSearchParams();
    params.set("entityCode", filters.entityCode);
    params.set("fiscalYear", String(filters.fiscalYear));
    params.set("periodNumber", String(filters.periodNumber));
    if (filters.accountId) params.set("accountId", filters.accountId);
    url = `/api/fin/admin/compare-books?${params.toString()}`;
  }

  return useAsyncFetch<CompareBookRowDTO[]>(url);
}

// ---------------------------------------------------------------------------
// Reversal Chain (cascade reversal drill-down)
// ---------------------------------------------------------------------------

export function useReversalChain(
  correlationId: string | null,
): UseAsyncResult<ReversalChainStepDTO[]> {
  const url = correlationId
    ? `/api/fin/admin/reversal-chain?correlationId=${encodeURIComponent(correlationId)}`
    : null;

  return useAsyncFetch<ReversalChainStepDTO[]>(url);
}
