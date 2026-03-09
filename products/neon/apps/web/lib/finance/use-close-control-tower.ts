"use client";

// lib/finance/use-close-control-tower.ts
//
// Phase 9A: Close Control Tower hooks.
// Executive summary, SLA posture, and override/waiver posture.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  CloseExecutiveSummaryDTO,
  OverridePostureDTO,
  OverridePostureSummaryDTO,
  SlaPerformanceTrendDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Executive Summary Hook
// ---------------------------------------------------------------------------

export interface CloseControlTowerParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface UseCloseExecutiveSummaryResult {
  summary: CloseExecutiveSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCloseExecutiveSummary(
  params: CloseControlTowerParams | null,
): UseCloseExecutiveSummaryResult {
  const [summary, setSummary] = useState<CloseExecutiveSummaryDTO | null>(null);
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
    return `/api/fin/close-control-tower/executive-summary?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseExecutiveSummaryDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setSummary(res.data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof FinanceHttpError
              ? err.message
              : String(err),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { summary, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Override Posture Hook
// ---------------------------------------------------------------------------

export interface UseOverridePostureResult {
  overrides: OverridePostureDTO[] | null;
  summary: OverridePostureSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOverridePosture(
  params: CloseControlTowerParams | null,
): UseOverridePostureResult {
  const [overrides, setOverrides] = useState<OverridePostureDTO[] | null>(null);
  const [summary, setSummary] = useState<OverridePostureSummaryDTO | null>(null);
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
    return `/api/fin/close-control-tower/override-posture?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{
      data: {
        overrides: OverridePostureDTO[];
        summary: OverridePostureSummaryDTO;
      };
    }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setOverrides(res.data.overrides);
          setSummary(res.data.summary);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof FinanceHttpError
              ? err.message
              : String(err),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { overrides, summary, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// SLA Performance Trend Hook
// ---------------------------------------------------------------------------

export interface SlaPerformanceTrendParams {
  entityCode: string;
  /** Number of recent periods to include (default 12) */
  limit?: number;
}

export interface UseSlaPerformanceTrendResult {
  periods: SlaPerformanceTrendDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSlaPerformanceTrend(
  params: SlaPerformanceTrendParams | null,
): UseSlaPerformanceTrendResult {
  const [periods, setPeriods] = useState<SlaPerformanceTrendDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams({
      entityCode: params.entityCode,
      limit: String(params.limit ?? 12),
    });
    return `/api/fin/close-control-tower/sla-trend?${qs}`;
  }, [params?.entityCode, params?.limit]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: { periods: SlaPerformanceTrendDTO[] } }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setPeriods(res.data.periods);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof FinanceHttpError
              ? err.message
              : String(err),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { periods, loading, error, refresh };
}
