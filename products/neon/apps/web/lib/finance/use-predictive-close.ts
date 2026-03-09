"use client";

// lib/finance/use-predictive-close.ts
//
// Phase 9B: Predictive Close Intelligence hooks.
// SLA breach forecast, cross-entity risk ranking, defect-delay correlation,
// remediation completion forecast, override-failure patterns, action effectiveness.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  SlaBreachForecastDTO,
  CrossEntityRiskDTO,
  DefectDelayCorrelationDTO,
  RemediationCompletionForecastDTO,
  OverrideFailureCorrelationDTO,
  ActionEffectivenessDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Shared params
// ---------------------------------------------------------------------------

export interface PredictiveCloseParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface CrossEntityParams {
  /** If omitted, returns all entities for the tenant */
  entityCode?: string;
}

// ---------------------------------------------------------------------------
// SLA Breach Forecast
// ---------------------------------------------------------------------------

export interface UseSlaBreachForecastResult {
  forecasts: SlaBreachForecastDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSlaBreachForecast(
  params: CrossEntityParams | null,
): UseSlaBreachForecastResult {
  const [forecasts, setForecasts] = useState<SlaBreachForecastDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    return `/api/fin/predictive-close/breach-forecast?${qs}`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: SlaBreachForecastDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setForecasts(res.data);
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

  return { forecasts, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Cross-Entity Risk Ranking
// ---------------------------------------------------------------------------

export interface UseCrossEntityRiskResult {
  entities: CrossEntityRiskDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCrossEntityRisk(
  params: CrossEntityParams | null,
): UseCrossEntityRiskResult {
  const [entities, setEntities] = useState<CrossEntityRiskDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    return `/api/fin/predictive-close/entity-risk?${qs}`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CrossEntityRiskDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setEntities(res.data);
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

  return { entities, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Defect-Delay Correlation
// ---------------------------------------------------------------------------

export interface UseDefectDelayCorrelationResult {
  correlations: DefectDelayCorrelationDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDefectDelayCorrelation(
  params: CrossEntityParams | null,
): UseDefectDelayCorrelationResult {
  const [correlations, setCorrelations] = useState<DefectDelayCorrelationDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    return `/api/fin/predictive-close/defect-correlation?${qs}`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: DefectDelayCorrelationDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setCorrelations(res.data);
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

  return { correlations, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Remediation Completion Forecast
// ---------------------------------------------------------------------------

export interface UseRemediationForecastResult {
  forecasts: RemediationCompletionForecastDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRemediationForecast(
  params: PredictiveCloseParams | null,
): UseRemediationForecastResult {
  const [forecasts, setForecasts] = useState<RemediationCompletionForecastDTO[] | null>(null);
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
    return `/api/fin/predictive-close/remediation-forecast?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: RemediationCompletionForecastDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setForecasts(res.data);
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

  return { forecasts, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Override-Failure Correlation
// ---------------------------------------------------------------------------

export interface UseOverrideFailureCorrelationResult {
  patterns: OverrideFailureCorrelationDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOverrideFailureCorrelation(
  params: CrossEntityParams | null,
): UseOverrideFailureCorrelationResult {
  const [patterns, setPatterns] = useState<OverrideFailureCorrelationDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    return `/api/fin/predictive-close/override-patterns?${qs}`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: OverrideFailureCorrelationDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setPatterns(res.data);
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

  return { patterns, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Action Effectiveness
// ---------------------------------------------------------------------------

export interface UseActionEffectivenessResult {
  actions: ActionEffectivenessDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useActionEffectiveness(
  params: CrossEntityParams | null,
): UseActionEffectivenessResult {
  const [actions, setActions] = useState<ActionEffectivenessDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    return `/api/fin/predictive-close/action-effectiveness?${qs}`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: ActionEffectivenessDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setActions(res.data);
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

  return { actions, loading, error, refresh };
}
