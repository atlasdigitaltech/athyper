"use client";

// lib/finance/use-period-close.ts
//
// Data-fetching hooks for Period Close Governance UI.
//   usePeriodClose()  -> checklist items + progress summary

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  PeriodCloseChecklistDTO,
  CloseProgressDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

interface UsePeriodCloseResult {
  items: PeriodCloseChecklistDTO[] | null;
  progress: CloseProgressDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface PeriodCloseParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePeriodClose(params: PeriodCloseParams | null): UsePeriodCloseResult {
  const [items, setItems] = useState<PeriodCloseChecklistDTO[] | null>(null);
  const [progress, setProgress] = useState<CloseProgressDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams({
      entityCode: params.entityCode,
      fiscalYear: String(params.fiscalYear),
      periodNumber: String(params.periodNumber),
    });
    return `/api/fin/period-close?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: { items: PeriodCloseChecklistDTO[]; progress: CloseProgressDTO } }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setItems(res.data.items);
          setProgress(res.data.progress);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        const message =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load period close data";
        setError(message);
        setItems(null);
        setProgress(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { items, progress, loading, error, refresh };
}
