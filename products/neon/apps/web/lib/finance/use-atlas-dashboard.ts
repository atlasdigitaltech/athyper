"use client";

// lib/finance/use-atlas-dashboard.ts
//
// Data-fetching hook for the Atlas Intelligence Dashboard API.
// Returns anomaly summary, risk score, predictions, narratives,
// and recommended actions for a given entity/period.

import { useState, useEffect, useCallback, useRef } from "react";

import { finGet } from "./fetcher";

// ---------------------------------------------------------------------------
// Types (mirrors the dashboard API response shape)
// ---------------------------------------------------------------------------

export interface AtlasAnomalySummary {
  activeCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  resolvedCount: number;
  totalCount: number;
}

export interface AtlasTopAnomaly {
  id?: string;
  anomalyType: string;
  severity: string;
  title: string;
  zScore: string | null;
  observedValue: string | null;
  expectedValue: string | null;
  accountCode: string | null;
  status: string;
  detectedAt: string;
}

export interface AtlasPredictions {
  closeDuration: {
    expectedCloseDays: string;
    confidencePercent: number;
    historicalAvgDays: string;
  } | null;
  releaseReadiness: {
    probability: number;
    confidencePercent: number;
    blockers: string[];
  } | null;
  reconCompletion: {
    sessionsRemaining: number;
    totalSessions: number;
    completedSessions: number;
  } | null;
  computedAt: string;
}

export interface AtlasNarratives {
  dashboardSummary: string;
  cfoBrief: string;
  generatedAt: string;
  provider: string;
  provenance: {
    deterministic: boolean;
    completeness: string;
    sourceCounts: Record<string, number>;
  };
}

export interface AtlasRecommendation {
  key: string;
  type: string;
  priority: string;
  title: string;
  rationale: string;
  suggestedOwnerRole: string;
  linkedEvidence: Array<{
    evidenceType: string;
    label: string;
    referenceId: string | null;
    detail: string | null;
  }>;
  estimatedImpact: string | null;
}

export interface AtlasRecommendationProvenance {
  generator: string;
  generatorVersion: string;
  deterministic: boolean;
  evidenceCount: number;
  evidenceKeys: string[];
  recommendationHash: string;
  generatedAt: string;
}

export interface AtlasCompositeRiskDriver {
  source: string;
  label: string;
  points: number;
  count: number;
}

export interface AtlasCompositeRisk {
  score: number;
  level: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  drivers: AtlasCompositeRiskDriver[];
  maxPossible: number;
}

export interface AtlasDashboardData {
  summary: AtlasAnomalySummary;
  riskScore: string;
  compositeRisk: AtlasCompositeRisk;
  topAnomalies: AtlasTopAnomaly[];
  baselineHealth: {
    accountsWithBaseline: number;
    totalAccounts: number;
  };
  atlasSignals: Array<Record<string, unknown>>;
  predictions: AtlasPredictions;
  narratives: AtlasNarratives;
  recommendations: {
    items: AtlasRecommendation[];
    provenance: AtlasRecommendationProvenance;
    computedAt: string;
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseAtlasDashboardParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface UseAtlasDashboardResult {
  data: AtlasDashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAtlasDashboard(
  params: UseAtlasDashboardParams | null,
): UseAtlasDashboardResult {
  const [data, setData] = useState<AtlasDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const paramKey = params ? `${params.entityCode}:${params.fiscalYear}:${params.periodNumber}` : "";

  const fetchData = useCallback(async () => {
    if (!params) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const url = `/api/fin/atlas/dashboard?entityCode=${encodeURIComponent(params.entityCode)}&fiscalYear=${params.fiscalYear}&periodNumber=${params.periodNumber}`;
      const result = await finGet<{ data: AtlasDashboardData }>(url, controller.signal);
      if (!controller.signal.aborted) {
        setData(result.data);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err?.message ?? "Failed to load Atlas dashboard");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [paramKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}
