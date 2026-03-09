"use client";

// lib/finance/use-assurance-analytics.ts
//
// Hooks for Phase 16: Continuous Controls Monitoring & Assurance Analytics.
// Control effectiveness, workload, chronic issues, scorecard.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { finGet } from "./fetcher";

// ---------------------------------------------------------------------------
// Control Effectiveness DTO
// ---------------------------------------------------------------------------

export interface ControlEffectivenessDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  totalTasks: number;
  completedTasks: number;
  waivedTasks: number;
  blockedTasks: number;
  completionPct: string;
  isCleanClose: boolean;
  totalOverrides: number;
  approvedOverrides: number;
  approvedImpact: string;
  overrideDensityPct: string;
  evidenceTotalRequests: number;
  evidenceFulfilled: number;
  evidenceOpen: number;
  evidenceOverdue: number;
  evidenceAvgTurnaroundDays: string;
  totalAttestations: number;
  uniqueAttestors: number;
  attestationTypesCovered: number;
  avgAttestationLagDays: string;
  totalBundles: number;
  distributedBundles: number;
  bundleDistributionPct: string;
  readinessScore: string | null;
  readinessCompletionPct: string | null;
}

// ---------------------------------------------------------------------------
// Workload DTOs
// ---------------------------------------------------------------------------

export interface WorkloadItemDTO {
  requestId: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  category: string | null;
  assignedRole: string | null;
  assignedTo: string | null;
  requestedByOrg: string | null;
  createdAt: string;
  dueAt: string | null;
  resolvedAt: string | null;
  ageDays: number;
  overdueDays: number;
  fulfillmentDays: number | null;
  isOverdue: boolean;
  isOpen: boolean;
}

export interface WorkloadSummaryDTO {
  totalItems: number;
  openCount: number;
  overdueCount: number;
  bySeverity: Record<string, number>;
  byOrg: Record<string, number>;
  avgAgeDays: number;
  avgOverdueDays: number;
}

export interface WorkloadResultDTO {
  items: WorkloadItemDTO[];
  summary: WorkloadSummaryDTO;
}

// ---------------------------------------------------------------------------
// Chronic Issues DTO
// ---------------------------------------------------------------------------

export interface ChronicIssueDTO {
  issueType: string;
  issueKey: string;
  description: string;
  occurrenceCount: number;
  affectedPeriods: string[];
  latestPeriod: number;
  impactAmount: string | null;
}

// ---------------------------------------------------------------------------
// Scorecard DTO
// ---------------------------------------------------------------------------

export interface AssuranceScorecardDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  closeControlScore: number;
  evidenceFulfillmentScore: number;
  attestationComplianceScore: number;
  distributionGovernanceScore: number;
  overallAssuranceScore: number;
  assuranceRating: string;
  chronicLateTasks: number;
  chronicOverridePeriods: number;
  chronicEvidenceDomains: number;
  nonCleanPeriodCount: number;
  readinessScore: string | null;
  totalOverrides: number;
  approvedImpact: string;
  evidenceTotalRequests: number;
  evidenceOverdue: number;
  totalAttestations: number;
  totalBundles: number;
  isCleanClose: boolean;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface AssuranceAnalyticsFilters {
  entityCode: string;
  fiscalYear?: number;
  periodNumber?: number;
}

// ---------------------------------------------------------------------------
// useControlEffectiveness
// ---------------------------------------------------------------------------

export interface UseControlEffectivenessResult {
  periods: ControlEffectivenessDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useControlEffectiveness(
  filters: AssuranceAnalyticsFilters | null,
): UseControlEffectivenessResult {
  const [periods, setPeriods] = useState<ControlEffectivenessDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({
      view: "effectiveness",
      entityCode: filters.entityCode,
    });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber) qs.set("periodNumber", String(filters.periodNumber));
    return `/api/fin/assurance/analytics?${qs}`;
  }, [filters?.entityCode, filters?.fiscalYear, filters?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ControlEffectivenessDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setPeriods(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load control effectiveness");
        setPeriods([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { periods, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useAssuranceWorkload
// ---------------------------------------------------------------------------

export interface UseAssuranceWorkloadResult {
  items: WorkloadItemDTO[];
  summary: WorkloadSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAssuranceWorkload(
  filters: AssuranceAnalyticsFilters & { status?: string; severity?: string } | null,
): UseAssuranceWorkloadResult {
  const [items, setItems] = useState<WorkloadItemDTO[]>([]);
  const [summary, setSummary] = useState<WorkloadSummaryDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({
      view: "workload",
      entityCode: filters.entityCode,
    });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber) qs.set("periodNumber", String(filters.periodNumber));
    if (filters.status) qs.set("status", filters.status);
    if (filters.severity) qs.set("severity", filters.severity);
    return `/api/fin/assurance/analytics?${qs}`;
  }, [filters?.entityCode, filters?.fiscalYear, filters?.periodNumber,
      (filters as any)?.status, (filters as any)?.severity]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: WorkloadResultDTO }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setItems(res.data.items);
          setSummary(res.data.summary);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load assurance workload");
        setItems([]);
        setSummary(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { items, summary, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useChronicIssues
// ---------------------------------------------------------------------------

export interface UseChronicIssuesResult {
  issues: ChronicIssueDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useChronicIssues(
  entityCode: string | null,
): UseChronicIssuesResult {
  const [issues, setIssues] = useState<ChronicIssueDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!entityCode) return null;
    return `/api/fin/assurance/analytics?view=chronic&entityCode=${entityCode}`;
  }, [entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ChronicIssueDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setIssues(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load chronic issues");
        setIssues([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { issues, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useAssuranceScorecard
// ---------------------------------------------------------------------------

export interface UseAssuranceScorecardResult {
  scorecards: AssuranceScorecardDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAssuranceScorecard(
  filters: AssuranceAnalyticsFilters | null,
): UseAssuranceScorecardResult {
  const [scorecards, setScorecards] = useState<AssuranceScorecardDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({
      view: "scorecard",
      entityCode: filters.entityCode,
    });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber) qs.set("periodNumber", String(filters.periodNumber));
    return `/api/fin/assurance/analytics?${qs}`;
  }, [filters?.entityCode, filters?.fiscalYear, filters?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: AssuranceScorecardDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setScorecards(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load assurance scorecard");
        setScorecards([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { scorecards, loading, error, refresh };
}
