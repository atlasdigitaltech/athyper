"use client";

// lib/finance/use-risk-signals.ts
//
// Phase 6.3b — Data-fetching hooks for Risk Signal Inbox UI.
//   useRiskSignals()     → active/all signals with refresh
//   useRiskSummary()     → badge counts (critical, high, unacknowledged, etc.)
//   useRiskSignalActions() → acknowledge, resolve, suppress, evaluate

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost } from "./fetcher";

import type {
  CloseRiskSignalDTO,
  RiskSignalSummaryDTO,
  RiskEvaluationResultDTO,
  RiskSignalState,
} from "./types";

// ---------------------------------------------------------------------------
// Shared params
// ---------------------------------------------------------------------------

export interface RiskSignalParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// useRiskSignals — list signals (active or all)
// ---------------------------------------------------------------------------

type SignalView = "active" | "all";

interface UseRiskSignalsResult {
  signals: CloseRiskSignalDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRiskSignals(
  params: RiskSignalParams | null,
  view: SignalView = "active",
): UseRiskSignalsResult {
  const [signals, setSignals] = useState<CloseRiskSignalDTO[] | null>(null);
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
      view,
    });
    return `/api/fin/period-close/risk-signals?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber, view]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseRiskSignalDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setSignals(res.data);
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
              : "Failed to load risk signals";
        setError(message);
        setSignals(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { signals, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useRiskSummary — badge counts
// ---------------------------------------------------------------------------

interface UseRiskSummaryResult {
  summary: RiskSignalSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRiskSummary(
  params: RiskSignalParams | null,
): UseRiskSummaryResult {
  const [summary, setSummary] = useState<RiskSignalSummaryDTO | null>(null);
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
      view: "summary",
    });
    return `/api/fin/period-close/risk-signals?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: RiskSignalSummaryDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setSummary(res.data);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(
          err instanceof FinanceHttpError
            ? err.message
            : "Failed to load risk summary",
        );
        setSummary(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { summary, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useRiskSignalActions — mutating actions
// ---------------------------------------------------------------------------

interface UseRiskSignalActionsResult {
  acknowledge: (signalId: string) => Promise<void>;
  resolve: (signalId: string, resolutionNotes: string) => Promise<void>;
  suppress: (signalId: string) => Promise<void>;
  evaluate: (targetStatus: "SOFT_CLOSE" | "HARD_CLOSE") => Promise<RiskEvaluationResultDTO>;
  acting: boolean;
  actionError: string | null;
}

export function useRiskSignalActions(
  params: RiskSignalParams | null,
  onSuccess?: () => void,
): UseRiskSignalActionsResult {
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const buildUrl = useCallback(
    (action: string, extra?: Record<string, string>) => {
      if (!params) throw new Error("params required");
      const qs = new URLSearchParams({
        entityCode: params.entityCode,
        fiscalYear: String(params.fiscalYear),
        periodNumber: String(params.periodNumber),
        action,
        ...extra,
      });
      return `/api/fin/period-close/risk-signals?${qs}`;
    },
    [params?.entityCode, params?.fiscalYear, params?.periodNumber],
  );

  const acknowledge = useCallback(
    async (signalId: string) => {
      setActing(true);
      setActionError(null);
      try {
        await finPost(buildUrl("acknowledge", { signalId }), {});
        onSuccess?.();
      } catch (err) {
        const msg = err instanceof FinanceHttpError ? err.message : "Acknowledge failed";
        setActionError(msg);
        throw err;
      } finally {
        setActing(false);
      }
    },
    [buildUrl, onSuccess],
  );

  const resolve = useCallback(
    async (signalId: string, resolutionNotes: string) => {
      setActing(true);
      setActionError(null);
      try {
        await finPost(buildUrl("resolve", { signalId }), { resolutionNotes });
        onSuccess?.();
      } catch (err) {
        const msg = err instanceof FinanceHttpError ? err.message : "Resolve failed";
        setActionError(msg);
        throw err;
      } finally {
        setActing(false);
      }
    },
    [buildUrl, onSuccess],
  );

  const suppress = useCallback(
    async (signalId: string) => {
      setActing(true);
      setActionError(null);
      try {
        await finPost(buildUrl("suppress", { signalId }), {});
        onSuccess?.();
      } catch (err) {
        const msg = err instanceof FinanceHttpError ? err.message : "Suppress failed";
        setActionError(msg);
        throw err;
      } finally {
        setActing(false);
      }
    },
    [buildUrl, onSuccess],
  );

  const evaluate = useCallback(
    async (targetStatus: "SOFT_CLOSE" | "HARD_CLOSE") => {
      setActing(true);
      setActionError(null);
      try {
        const res = await finPost<{ data: RiskEvaluationResultDTO }>(
          buildUrl("evaluate", { targetStatus }),
          {},
        );
        onSuccess?.();
        return res.data;
      } catch (err) {
        const msg = err instanceof FinanceHttpError ? err.message : "Evaluate failed";
        setActionError(msg);
        throw err;
      } finally {
        setActing(false);
      }
    },
    [buildUrl, onSuccess],
  );

  return { acknowledge, resolve, suppress, evaluate, acting, actionError };
}
