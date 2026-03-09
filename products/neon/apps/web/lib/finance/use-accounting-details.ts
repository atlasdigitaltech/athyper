"use client";

// lib/finance/use-accounting-details.ts
//
// Data-fetching hook for accounting details of a source document.
// GET /api/fin/documents/accounting?docId=&entityCode=

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type { AccountingDetailsDTO } from "./types";

export interface UseAccountingDetailsResult {
  data: AccountingDetailsDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAccountingDetails(
  docId: string | undefined,
  entityCode: string | undefined,
): UseAccountingDetailsResult {
  const [data, setData] = useState<AccountingDetailsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!docId || !entityCode) {
      setData(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ docId, entityCode });
      const result = await finGet<AccountingDetailsDTO>(
        `/api/fin/documents/accounting?${params}`,
        controller.signal,
      );

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
            : "Failed to load accounting details";
      setError(message);
      setData(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [docId, entityCode]);

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
