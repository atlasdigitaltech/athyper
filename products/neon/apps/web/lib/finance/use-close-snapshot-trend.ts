"use client";

// lib/finance/use-close-snapshot-trend.ts
//
// Data-fetching hook for Close Orchestration Snapshot history (time series).
// Used by CloseProgressTrend to render snapshot-over-time charts.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

// ---------------------------------------------------------------------------
// Snapshot shape (matches close_orchestration_snapshot row)
// ---------------------------------------------------------------------------

export interface CloseSnapshotDTO {
  id: string;
  snapshot_at: string;
  snapshot_source: string;
  target_status: string;
  total_tasks: number;
  satisfied_count: number;
  ready_count: number;
  blocked_count: number;
  failed_count: number;
  not_ready_count: number;
  in_progress_count: number;
  critical_path_minutes: number;
  predicted_ready_at: string | null;
  confidence: string;
  triggered_by: string | null;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

interface UseCloseSnapshotTrendResult {
  snapshots: CloseSnapshotDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface CloseSnapshotTrendParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  targetStatus: "SOFT_CLOSE" | "HARD_CLOSE";
  limit?: number;
  since?: string; // ISO date string
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCloseSnapshotTrend(
  params: CloseSnapshotTrendParams | null,
): UseCloseSnapshotTrendResult {
  const [snapshots, setSnapshots] = useState<CloseSnapshotDTO[]>([]);
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
      targetStatus: params.targetStatus,
      view: "snapshots",
    });
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.since) qs.set("since", params.since);
    return `/api/fin/period-close/graph?${qs}`;
  }, [
    params?.entityCode,
    params?.fiscalYear,
    params?.periodNumber,
    params?.targetStatus,
    params?.limit,
    params?.since,
  ]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseSnapshotDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setSnapshots(res.data);
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
              : "Failed to load snapshot trend data";
        setError(message);
        setSnapshots([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { snapshots, loading, error, refresh };
}
