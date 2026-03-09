"use client";

// lib/finance/use-close-graph.ts
//
// Data-fetching hook for the Close Orchestration Graph.
// Returns full graph, ready-now queue, critical path, and forecast.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  CloseGraphDTO,
  ReadyTaskDTO,
  CriticalPathDTO,
  ClosePredictionDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Full graph result
// ---------------------------------------------------------------------------

interface CloseGraphFullResult {
  graph: CloseGraphDTO;
  ready: ReadyTaskDTO[];
  criticalPath: CriticalPathDTO;
  prediction: ClosePredictionDTO;
}

interface UseCloseGraphResult {
  data: CloseGraphFullResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface CloseGraphParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  targetStatus?: "SOFT_CLOSE" | "HARD_CLOSE";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCloseGraph(params: CloseGraphParams | null): UseCloseGraphResult {
  const [data, setData] = useState<CloseGraphFullResult | null>(null);
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
    if (params.targetStatus) qs.set("targetStatus", params.targetStatus);
    return `/api/fin/period-close/graph?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber, params?.targetStatus]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseGraphFullResult }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setData(res.data);
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
              : "Failed to load close graph data";
        setError(message);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { data, loading, error, refresh };
}
