"use client";

// lib/finance/use-pack-readiness.ts
//
// Data-fetching hooks for the CFO Workspace — pack readiness and delta analysis.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface PackReadinessPhase {
  status: string;
  pct?: number;
  step?: string;
  count?: number;
}

export interface PackReadinessDTO {
  score: number;
  phase: string;
  blockers: string[];
  nextAction: string;
  phases: {
    close: { status: string; pct: number };
    packGeneration: { status: string; pct: number };
    certification: { status: string; step: string };
    distribution: { status: string; count: number };
  };
}

export interface CloseStateDTO {
  close_run_id: string | null;
  close_status: string;
  run_number: number | null;
  total_tasks: number;
  completed_tasks: number;
  waived_tasks: number;
  blocked_or_failed_tasks: number;
  readiness_score: number | null;
}

export interface PackSummaryDTO {
  id: string;
  status: string;
  total_items: number;
  items_completed: number;
  pack_code: string;
  pack_name: string;
  generated_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  finalized_at: string | null;
  published_at: string | null;
  items_generated: number;
  items_failed: number;
  items_pending: number;
}

export interface CertificationSummaryDTO {
  id: string;
  certification_status: string;
  prepared_by: string | null;
  prepared_at: string | null;
  prepared_by_name: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  certified_by: string | null;
  certified_at: string | null;
  certified_by_name: string | null;
  readiness_score_at_cert: number | null;
  active_override_count: number;
  override_impact_total: number | null;
}

export interface ReleaseSummaryDTO {
  id: string;
  release_code: string;
  release_name: string;
  status: string;
  release_type: string;
  is_clean_close: boolean | null;
  override_count: number;
  readiness_score: number | null;
  requires_exception_signoff: boolean;
  has_exception_signoff: boolean;
  assembled_at: string | null;
  ready_at: string | null;
  released_at: string | null;
}

export interface DistributionSummaryDTO {
  total_distributions: number;
  sent_count: number;
  draft_count: number;
  total_recipients: number;
  total_delivered: number;
  total_viewed: number;
  total_downloaded: number;
  last_distributed_at: string | null;
}

export interface CleanCloseDTO {
  is_clean: boolean | null;
  evaluated: boolean;
  requires_exception_signoff: boolean;
  override_count: number;
  override_impact: number;
  readiness_score: number;
  waived_task_count: number;
  policy: {
    max_overrides: number;
    min_readiness: number;
    max_impact: number | null;
  };
  disqualification_reasons: string[];
}

export interface PackReadinessFullDTO {
  readiness: PackReadinessDTO;
  closeState: CloseStateDTO | null;
  pack: PackSummaryDTO | null;
  certification: CertificationSummaryDTO | null;
  release: ReleaseSummaryDTO | null;
  cleanClose: CleanCloseDTO | null;
  distribution: DistributionSummaryDTO | null;
  overrides: { active_count: number; total_impact: number };
  pendingRecommendations: number;
}

export interface MaterialityInsightDTO {
  hasMaterialChanges: boolean;
  materialPnLChanges: number;
  materialBSChanges: number;
  largestChange: { accountCode: string; accountName: string; accountType: string; balance: number } | null;
  riskLevel: "none" | "low" | "medium" | "high";
  insights: string[];
}

export interface GLChangeDTO {
  changed_accounts: number;
  distinct_accounts: number;
  total_abs_balance: number;
  pnl_changes: number;
  bs_changes: number;
  max_single_balance: number;
  topChanges: { account_code: string; account_name: string; account_type: string; balance: number }[];
}

export interface PackDeltaDTO {
  hasPriorPack: boolean;
  packId?: string;
  packStatus?: string;
  packGeneratedAt?: string;
  hasChanges?: boolean;
  glChanges?: GLChangeDTO;
  overrideChanges?: { new_overrides: number; new_override_impact: number };
  taskChanges?: { tasks_completed_since: number; newly_completed: number; newly_waived: number; newly_failed: number };
  certificationEvents?: { activity_type: string; event_count: number }[];
  materiality?: MaterialityInsightDTO;
  summary: string;
}

// ---------------------------------------------------------------------------
// Executive Briefing DTOs
// ---------------------------------------------------------------------------

export interface AttentionItemDTO {
  priority: number;
  severity: "critical" | "high" | "medium" | "info";
  title: string;
  detail: string;
}

export interface ExecutiveBriefDTO {
  paragraphs: string[];
  attentionItems: AttentionItemDTO[];
  readinessScore: number;
  phase: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Readiness Trend DTOs
// ---------------------------------------------------------------------------

export interface PeriodTrendDTO {
  period_number: number;
  close_type: string | null;
  close_status: string | null;
  readiness_score: number | null;
  completion_pct: number | null;
  sla_status: string | null;
  open_exceptions: number | null;
  critical_exceptions: number | null;
  pack_status: string | null;
  certification_status: string | null;
  override_count: number;
  is_clean_close: string | null;
  soft_close_target: string | null;
  hard_close_target: string | null;
  soft_close_actual: string | null;
  hard_close_actual: string | null;
  target_working_days: number | null;
  actual_working_days: number | null;
}

export interface TrendSummaryDTO {
  totalPeriods: number;
  closedPeriods: number;
  averageReadinessScore: number | null;
  cleanCloseCount: number;
  cleanCloseRate: number | null;
  slaBreaches: number;
  slaMet: number;
  avgWorkingDays: number | null;
}

export interface ReadinessTrendDTO {
  fiscalYear: number;
  entityCode: string;
  periods: PeriodTrendDTO[];
  summary: TrendSummaryDTO;
  workingDaysTrend: { period: number; target: number; actual: number; variance: number }[];
}

// ---------------------------------------------------------------------------
// usePackReadiness
// ---------------------------------------------------------------------------

export interface PackReadinessParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

interface UsePackReadinessResult {
  data: PackReadinessFullDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePackReadiness(
  params: PackReadinessParams | null,
): UsePackReadinessResult {
  const [data, setData] = useState<PackReadinessFullDTO | null>(null);
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
    return `/api/fin/packs/readiness?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: PackReadinessFullDTO }>(url, controller.signal)
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
              : "Failed to load pack readiness";
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

// ---------------------------------------------------------------------------
// usePackDelta
// ---------------------------------------------------------------------------

interface UsePackDeltaResult {
  delta: PackDeltaDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePackDelta(
  params: PackReadinessParams | null,
): UsePackDeltaResult {
  const [delta, setDelta] = useState<PackDeltaDTO | null>(null);
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
      view: "delta",
    });
    return `/api/fin/packs/readiness?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: PackDeltaDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setDelta(res.data);
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
              : "Failed to load pack delta";
        setError(message);
        setDelta(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { delta, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useExecutiveBrief
// ---------------------------------------------------------------------------

interface UseExecutiveBriefResult {
  brief: ExecutiveBriefDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useExecutiveBrief(
  params: PackReadinessParams | null,
): UseExecutiveBriefResult {
  const [brief, setBrief] = useState<ExecutiveBriefDTO | null>(null);
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
      view: "brief",
    });
    return `/api/fin/packs/readiness?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: ExecutiveBriefDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setBrief(res.data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load briefing");
        setBrief(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { brief, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReadinessTrend
// ---------------------------------------------------------------------------

export interface ReadinessTrendParams {
  entityCode: string;
  fiscalYear: number;
}

interface UseReadinessTrendResult {
  trend: ReadinessTrendDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReadinessTrend(
  params: ReadinessTrendParams | null,
): UseReadinessTrendResult {
  const [trend, setTrend] = useState<ReadinessTrendDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams({
      entityCode: params.entityCode,
      fiscalYear: String(params.fiscalYear),
      periodNumber: "1", // Required by route but not used by trends view
      view: "trends",
    });
    return `/api/fin/packs/readiness?${qs}`;
  }, [params?.entityCode, params?.fiscalYear]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: ReadinessTrendDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setTrend(res.data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load readiness trends");
        setTrend(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { trend, loading, error, refresh };
}
