"use client";

// lib/finance/use-dimensions.ts
//
// Data-fetching hooks for the Universal Ledger Dimension Engine.
//   useDimensionTypes()   -> DimensionTypeDTO[]
//   useDimensionValues()  -> DimensionValueDTO[]
//   useDimensionSet()     -> DimensionSetDTO

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  DimensionTypeDTO,
  DimensionValueDTO,
  DimensionSetDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Shared result type (same pattern as use-cross-book-audit)
// ---------------------------------------------------------------------------

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

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
// Dimension Types (registry of dimension kinds for an entity)
// ---------------------------------------------------------------------------

export function useDimensionTypes(
  entityCode: string | null,
): UseAsyncResult<DimensionTypeDTO[]> {
  const url = entityCode
    ? `/api/fin/dimensions/types?entityCode=${encodeURIComponent(entityCode)}`
    : null;
  return useAsyncFetch<DimensionTypeDTO[]>(url);
}

// ---------------------------------------------------------------------------
// Dimension Values (master data for a specific dimension type)
// ---------------------------------------------------------------------------

export interface DimensionValueFilters {
  entityCode: string;
  typeCode: string;
  activeOnly?: boolean;
  postableOnly?: boolean;
  search?: string;
}

export function useDimensionValues(
  filters: DimensionValueFilters | null,
): UseAsyncResult<DimensionValueDTO[]> {
  let url: string | null = null;
  if (filters) {
    const params = new URLSearchParams();
    params.set("entityCode", filters.entityCode);
    params.set("typeCode", filters.typeCode);
    if (filters.activeOnly !== false) params.set("activeOnly", "true");
    if (filters.postableOnly) params.set("postableOnly", "true");
    if (filters.search) params.set("q", filters.search);
    url = `/api/fin/dimensions/values?${params.toString()}`;
  }
  return useAsyncFetch<DimensionValueDTO[]>(url);
}

// ---------------------------------------------------------------------------
// Dimension Set (resolved canonical combination)
// ---------------------------------------------------------------------------

export function useDimensionSet(
  dimensionSetId: string | null,
): UseAsyncResult<DimensionSetDTO> {
  const url = dimensionSetId
    ? `/api/fin/dimensions/sets/${encodeURIComponent(dimensionSetId)}`
    : null;
  return useAsyncFetch<DimensionSetDTO>(url);
}
