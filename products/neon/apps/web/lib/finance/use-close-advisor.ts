"use client";

// lib/finance/use-close-advisor.ts
//
// Phase 10: Autonomous Close Advisor hooks.
// Remediation campaigns, defect queue, completion forecast,
// override posture, entity heatmap, controller alerts.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost } from "./fetcher";

import type {
  AdvisorRemediationCampaignDTO,
  AdvisorDefectQueueItemDTO,
  AdvisorCompletionForecastDTO,
  AdvisorOverridePostureDTO,
  AdvisorEntityHeatmapDTO,
  AdvisorControllerAlertDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Shared params
// ---------------------------------------------------------------------------

export interface AdvisorParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface AdvisorCrossEntityParams {
  /** If omitted, returns all entities for the tenant */
  entityCode?: string;
}

// ---------------------------------------------------------------------------
// 1. Remediation Campaign Advisor
// ---------------------------------------------------------------------------

export interface UseAdvisorRemediationResult {
  campaigns: AdvisorRemediationCampaignDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdvisorRemediation(
  params: AdvisorParams | null,
): UseAdvisorRemediationResult {
  const [campaigns, setCampaigns] = useState<AdvisorRemediationCampaignDTO[] | null>(null);
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
    return `/api/fin/close-advisor/remediation-campaigns?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: AdvisorRemediationCampaignDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setCampaigns(res.data);
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

  return { campaigns, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// 2. Auto-Prioritized Defect Queue
// ---------------------------------------------------------------------------

export interface UseAdvisorDefectQueueResult {
  items: AdvisorDefectQueueItemDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  accept: (actionId: string) => Promise<void>;
  dismiss: (actionId: string, reason?: string) => Promise<void>;
}

export function useAdvisorDefectQueue(
  params: AdvisorParams | null,
): UseAdvisorDefectQueueResult {
  const [items, setItems] = useState<AdvisorDefectQueueItemDTO[] | null>(null);
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
    return `/api/fin/close-advisor/defect-queue?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: AdvisorDefectQueueItemDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setItems(res.data);
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

  const accept = useCallback(
    async (actionId: string) => {
      if (!params) throw new Error("params required");
      const qs = new URLSearchParams({
        entityCode: params.entityCode,
        fiscalYear: String(params.fiscalYear),
        periodNumber: String(params.periodNumber),
      });
      await finPost(`/api/fin/close-advisor/defect-queue?${qs}`, {
        actionId,
        action: "accept",
      });
      refresh();
    },
    [params?.entityCode, params?.fiscalYear, params?.periodNumber, refresh],
  );

  const dismiss = useCallback(
    async (actionId: string, reason?: string) => {
      if (!params) throw new Error("params required");
      const qs = new URLSearchParams({
        entityCode: params.entityCode,
        fiscalYear: String(params.fiscalYear),
        periodNumber: String(params.periodNumber),
      });
      await finPost(`/api/fin/close-advisor/defect-queue?${qs}`, {
        actionId,
        action: "dismiss",
        reason,
      });
      refresh();
    },
    [params?.entityCode, params?.fiscalYear, params?.periodNumber, refresh],
  );

  return { items, loading, error, refresh, accept, dismiss };
}

// ---------------------------------------------------------------------------
// 3. Completion Forecast
// ---------------------------------------------------------------------------

export interface UseAdvisorCompletionForecastResult {
  forecast: AdvisorCompletionForecastDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdvisorCompletionForecast(
  params: AdvisorParams | null,
): UseAdvisorCompletionForecastResult {
  const [forecast, setForecast] = useState<AdvisorCompletionForecastDTO | null>(null);
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
    return `/api/fin/close-advisor/completion-forecast?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: AdvisorCompletionForecastDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setForecast(res.data);
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

  return { forecast, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// 4. Override Risk Posture
// ---------------------------------------------------------------------------

export interface UseAdvisorOverridePostureResult {
  posture: AdvisorOverridePostureDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdvisorOverridePosture(
  params: AdvisorParams | null,
): UseAdvisorOverridePostureResult {
  const [posture, setPosture] = useState<AdvisorOverridePostureDTO | null>(null);
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
    return `/api/fin/close-advisor/override-posture?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: AdvisorOverridePostureDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setPosture(res.data);
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

  return { posture, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// 5. Entity Close Risk Heatmap
// ---------------------------------------------------------------------------

export interface UseAdvisorEntityHeatmapResult {
  entities: AdvisorEntityHeatmapDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdvisorEntityHeatmap(
  params: AdvisorCrossEntityParams | null,
): UseAdvisorEntityHeatmapResult {
  const [entities, setEntities] = useState<AdvisorEntityHeatmapDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    return `/api/fin/close-advisor/entity-heatmap?${qs}`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: AdvisorEntityHeatmapDTO[] }>(url, controller.signal)
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
// 6. Controller Alert Inbox
// ---------------------------------------------------------------------------

export interface UseAdvisorControllerAlertsResult {
  alerts: AdvisorControllerAlertDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdvisorControllerAlerts(
  params: AdvisorCrossEntityParams | null,
): UseAdvisorControllerAlertsResult {
  const [alerts, setAlerts] = useState<AdvisorControllerAlertDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    return `/api/fin/close-advisor/controller-alerts?${qs}`;
  }, [params?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: AdvisorControllerAlertDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setAlerts(res.data);
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

  return { alerts, loading, error, refresh };
}
