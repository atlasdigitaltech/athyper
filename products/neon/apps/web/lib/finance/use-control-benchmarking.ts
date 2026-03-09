"use client";

// lib/finance/use-control-benchmarking.ts
//
// Hooks for Phase 17: Control Benchmarking, Targets & Adaptive Policy Tuning.
// Targets, benchmark variance, policy recommendations.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { finGet, finPost } from "./fetcher";

// ---------------------------------------------------------------------------
// Control Target DTO
// ---------------------------------------------------------------------------

export interface ControlTargetDTO {
  id: string;
  metricCode: string;
  metricLabel: string;
  metricGroup: string;
  targetValue: string;
  direction: string;
  greenThreshold: string;
  amberThreshold: string;
  fiscalYear: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  setBy: string | null;
  rationale: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Benchmark DTO
// ---------------------------------------------------------------------------

export interface BenchmarkDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  metricCode: string;
  metricLabel: string;
  metricGroup: string;
  direction: string;
  targetValue: string;
  greenThreshold: string;
  amberThreshold: string;
  actualValue: string | null;
  variance: string | null;
  variancePct: string | null;
  trafficLight: string;
  priorValue: string | null;
  periodDelta: string | null;
  trend: string;
  setBy: string | null;
  rationale: string | null;
}

// ---------------------------------------------------------------------------
// Policy Recommendation DTO
// ---------------------------------------------------------------------------

export interface PolicyRecommendationDTO {
  recommendationType: string;
  policyArea: string;
  title: string;
  detail: string;
  priority: string;
  recommendationData: Record<string, any>;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Target upsert input
// ---------------------------------------------------------------------------

export interface ControlTargetInput {
  entityCode: string;
  metricCode: string;
  metricLabel?: string;
  metricGroup?: string;
  targetValue: number;
  direction?: string;
  greenThreshold: number;
  amberThreshold: number;
  fiscalYear?: number | null;
  rationale?: string;
}

// ---------------------------------------------------------------------------
// useControlTargets — list active targets
// ---------------------------------------------------------------------------

export interface UseControlTargetsResult {
  targets: ControlTargetDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useControlTargets(
  entityCode: string | null,
): UseControlTargetsResult {
  const [targets, setTargets] = useState<ControlTargetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!entityCode) return null;
    return `/api/fin/assurance/benchmarking?view=targets&entityCode=${entityCode}`;
  }, [entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ControlTargetDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setTargets(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load targets");
        setTargets([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { targets, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useControlBenchmark — targets vs actuals
// ---------------------------------------------------------------------------

export interface UseControlBenchmarkResult {
  benchmarks: BenchmarkDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useControlBenchmark(
  filters: { entityCode: string; fiscalYear?: number; periodNumber?: number } | null,
): UseControlBenchmarkResult {
  const [benchmarks, setBenchmarks] = useState<BenchmarkDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({
      view: "benchmark",
      entityCode: filters.entityCode,
    });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber) qs.set("periodNumber", String(filters.periodNumber));
    return `/api/fin/assurance/benchmarking?${qs}`;
  }, [filters?.entityCode, filters?.fiscalYear, filters?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: BenchmarkDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setBenchmarks(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load benchmark");
        setBenchmarks([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { benchmarks, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// usePolicyRecommendations — adaptive tuning suggestions
// ---------------------------------------------------------------------------

export interface UsePolicyRecommendationsResult {
  recommendations: PolicyRecommendationDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePolicyRecommendations(
  filters: { entityCode: string; fiscalYear?: number } | null,
): UsePolicyRecommendationsResult {
  const [recommendations, setRecommendations] = useState<PolicyRecommendationDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({
      view: "recommendations",
      entityCode: filters.entityCode,
    });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    return `/api/fin/assurance/benchmarking?${qs}`;
  }, [filters?.entityCode, filters?.fiscalYear]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: PolicyRecommendationDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setRecommendations(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load recommendations");
        setRecommendations([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { recommendations, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useTargetMutations — upsert targets, seed defaults
// ---------------------------------------------------------------------------

export interface UseTargetMutationsResult {
  upsertTarget: (input: ControlTargetInput) => Promise<string>;
  seedDefaults: (entityCode: string) => Promise<{ seeded: number; total: number }>;
  loading: boolean;
}

export function useTargetMutations(
  onSuccess?: () => void,
): UseTargetMutationsResult {
  const [loading, setLoading] = useState(false);

  const upsertTarget = useCallback(
    async (input: ControlTargetInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { id: string } }>(
          "/api/fin/assurance/benchmarking",
          input,
        );
        onSuccess?.();
        return res.data.id;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const seedDefaults = useCallback(
    async (entityCode: string) => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { seeded: number; total: number } }>(
          "/api/fin/assurance/benchmarking",
          { action: "seed_defaults", entityCode },
        );
        onSuccess?.();
        return res.data;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { upsertTarget, seedDefaults, loading };
}
