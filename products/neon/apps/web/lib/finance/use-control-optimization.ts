"use client";

// lib/finance/use-control-optimization.ts
//
// Hooks for Phase 19: Autonomous Control Optimization.
// Program proposals, effectiveness learning, optimization summary.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { finGet, finPost } from "./fetcher";

// ---------------------------------------------------------------------------
// Proposal DTO
// ---------------------------------------------------------------------------

export interface ProgramProposalDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  proposalSource: string;
  suggestedProgramType: string;
  suggestedPriority: string;
  suggestedTitle: string;
  rationale: string;
  proposalData: Record<string, any>;
  fingerprint: string;
}

// ---------------------------------------------------------------------------
// Learning DTO
// ---------------------------------------------------------------------------

export interface EffectivenessLearningDTO {
  entityCode: string;
  policyCode: string;
  policyName: string | null;
  triggerType: string | null;
  actionType: string | null;
  severity: string | null;
  executionMode: string | null;
  totalRecommendations: number;
  acceptedCount: number;
  dismissedCount: number;
  executedCount: number;
  expiredCount: number;
  periodsActive: number;
  acceptanceRate: string;
  effectiveCount: number;
  ineffectiveCount: number;
  ratedCount: number;
  effectivenessRate: string;
  actionTypeTotal: number;
  actionTypeEffectiveness: string;
  effectivenessClass: string;
  tuningSuggestion: string;
  firstProposedAt: string;
  lastProposedAt: string;
}

// ---------------------------------------------------------------------------
// Summary DTO
// ---------------------------------------------------------------------------

export interface OptimizationSummaryDTO {
  proposals: {
    total: number;
    urgent: number;
    bySource: {
      benchmarkRedLight: number;
      chronicIssue: number;
      policyRecommendation: number;
    };
  };
  learning: {
    totalPolicies: number;
    policiesWithData: number;
    avgEffectiveness: string;
    avgAcceptance: string;
    tuning: {
      considerDisabling: number;
      promoteToAuto: number;
      frequentlyRejected: number;
      timingIssue: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface OptimizationFilters {
  entityCode: string;
}

// ---------------------------------------------------------------------------
// useProgramProposals — auto-generated proposals
// ---------------------------------------------------------------------------

export interface UseProgramProposalsResult {
  proposals: ProgramProposalDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProgramProposals(
  filters: OptimizationFilters | null,
): UseProgramProposalsResult {
  const [proposals, setProposals] = useState<ProgramProposalDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    return `/api/fin/assurance/optimization?entityCode=${filters.entityCode}&view=proposals`;
  }, [filters?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ProgramProposalDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setProposals(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load proposals");
        setProposals([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { proposals, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useEffectivenessLearning — policy effectiveness insights
// ---------------------------------------------------------------------------

export interface UseEffectivenessLearningResult {
  insights: EffectivenessLearningDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEffectivenessLearning(
  filters: OptimizationFilters | null,
): UseEffectivenessLearningResult {
  const [insights, setInsights] = useState<EffectivenessLearningDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    return `/api/fin/assurance/optimization?entityCode=${filters.entityCode}&view=learning`;
  }, [filters?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: EffectivenessLearningDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setInsights(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load learning data");
        setInsights([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { insights, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useOptimizationSummary — combined summary
// ---------------------------------------------------------------------------

export interface UseOptimizationSummaryResult {
  summary: OptimizationSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOptimizationSummary(
  filters: OptimizationFilters | null,
): UseOptimizationSummaryResult {
  const [summary, setSummary] = useState<OptimizationSummaryDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    return `/api/fin/assurance/optimization?entityCode=${filters.entityCode}&view=summary`;
  }, [filters?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: OptimizationSummaryDTO }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setSummary(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load summary");
        setSummary(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { summary, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useProposalActions — accept / dismiss / materialize
// ---------------------------------------------------------------------------

export interface UseProposalActionsResult {
  acceptProposal: (entityCode: string, fingerprint: string) => Promise<{ programId: string; programCode: string }>;
  dismissProposal: (entityCode: string, fingerprint: string, reason?: string) => Promise<void>;
  materializeProposals: (entityCode: string) => Promise<{ totalProposals: number; materialized: number }>;
  loading: boolean;
}

export function useProposalActions(
  onSuccess?: () => void,
): UseProposalActionsResult {
  const [loading, setLoading] = useState(false);

  const acceptProposal = useCallback(
    async (entityCode: string, fingerprint: string) => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { programId: string; programCode: string } }>(
          "/api/fin/assurance/optimization",
          { action: "accept_proposal", entityCode, fingerprint },
        );
        onSuccess?.();
        return res.data;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const dismissProposal = useCallback(
    async (entityCode: string, fingerprint: string, reason?: string) => {
      setLoading(true);
      try {
        await finPost("/api/fin/assurance/optimization", {
          action: "dismiss_proposal",
          entityCode,
          fingerprint,
          reason,
        });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const materializeProposals = useCallback(
    async (entityCode: string) => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { totalProposals: number; materialized: number } }>(
          "/api/fin/assurance/optimization",
          { action: "materialize", entityCode },
        );
        onSuccess?.();
        return res.data;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { acceptProposal, dismissProposal, materializeProposals, loading };
}
