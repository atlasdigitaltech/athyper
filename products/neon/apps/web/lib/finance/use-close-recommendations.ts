"use client";

// lib/finance/use-close-recommendations.ts
//
// Data-fetching hooks for close recommendations and bottleneck patterns.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost } from "./fetcher";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface CloseRecommendationDTO {
  id: string;
  policy_code: string;
  policy_name: string | null;
  trigger_type: string;
  action_type: string;
  action_params: Record<string, unknown>;
  trigger_context: Record<string, unknown>;
  status: string;
  severity: string | null;
  execution_mode: string | null;
  proposed_at: string;
  decided_at: string | null;
  decided_by: string | null;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  outcome_notes: string | null;
  was_effective: boolean | null;
  rationale?: string;
}

export interface CloseBottleneckDTO {
  tenant_id: string;
  entity_code: string;
  task_code: string;
  total_appearances: number;
  times_longest_task: number;
  times_top_3: number;
  times_blocked: number;
  avg_duration_minutes: number;
  max_duration_minutes: number;
  avg_block_minutes: number;
  p95_duration_minutes: number;
  total_closes: number;
  bottleneck_frequency_pct: number;
  pattern_classification: string;
  last_period_key: number;
}

// ---------------------------------------------------------------------------
// Recommendations Hook
// ---------------------------------------------------------------------------

export interface CloseRecommendationsParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  status?: string;
}

interface UseCloseRecommendationsResult {
  recommendations: CloseRecommendationDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  accept: (actionId: string) => Promise<void>;
  dismiss: (actionId: string, reason?: string) => Promise<void>;
}

export function useCloseRecommendations(
  params: CloseRecommendationsParams | null,
): UseCloseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<CloseRecommendationDTO[]>([]);
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
    if (params.status) qs.set("status", params.status);
    return `/api/fin/period-close/recommendations?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber, params?.status]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseRecommendationDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setRecommendations(res.data);
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
              : "Failed to load recommendations";
        setError(message);
        setRecommendations([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  const accept = useCallback(
    async (actionId: string) => {
      await finPost("/api/fin/period-close/recommendations", { actionId, action: "accept" });
      refresh();
    },
    [refresh],
  );

  const dismiss = useCallback(
    async (actionId: string, reason?: string) => {
      await finPost("/api/fin/period-close/recommendations", { actionId, action: "dismiss", reason });
      refresh();
    },
    [refresh],
  );

  return { recommendations, loading, error, refresh, accept, dismiss };
}

// ---------------------------------------------------------------------------
// Bottleneck Patterns Hook
// ---------------------------------------------------------------------------

export interface BottleneckParams {
  entityCode: string;
}

interface UseBottleneckPatternsResult {
  patterns: CloseBottleneckDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBottleneckPatterns(
  params: BottleneckParams | null,
): UseBottleneckPatternsResult {
  const [patterns, setPatterns] = useState<CloseBottleneckDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    return `/api/fin/period-close/recommendations?entityCode=${params.entityCode}&view=bottlenecks`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseBottleneckDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setPatterns(res.data);
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
              : "Failed to load bottleneck patterns";
        setError(message);
        setPatterns([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { patterns, loading, error, refresh };
}
