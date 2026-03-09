"use client";

// lib/finance/use-control-programs.ts
//
// Hooks for Phase 18: Control Program Management & Remediation Portfolio.
// Programs, milestones, impact tracking.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { finGet, finPost, finPatch } from "./fetcher";

// ---------------------------------------------------------------------------
// Program DTO
// ---------------------------------------------------------------------------

export interface ProgramMilestoneDTO {
  id: string;
  title: string;
  detail: string | null;
  severity: string;
  priority: number;
  assignedRole: string | null;
  assignedTo: string | null;
  dueAt: string | null;
  status: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface ControlProgramDTO {
  id: string;
  entityCode: string;
  programCode: string;
  title: string;
  description: string | null;
  programType: string;
  priority: string;
  sponsorName: string | null;
  sponsorRole: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  fiscalYear: number | null;
  totalMilestones: number;
  completedMilestones: number;
  overdueMilestones: number;
  activeMilestones: number;
  milestoneCompletionPct: string;
  nextMilestoneDue: string | null;
  linkedGapCount: number;
  benchmarkGapCount: number;
  chronicGapCount: number;
  recommendationGapCount: number;
  totalDecisions: number;
  lastDecisionAt: string | null;
  elapsedDays: number | null;
  plannedDays: number | null;
  isOverdue: boolean;
  health: string;
  linkedGaps: { type: string; key: string; label: string; metricCode?: string; severity?: string }[];
  baselineMetrics: Record<string, { value: string | null; trafficLight: string; capturedAt: string }>;
  targetOutcomes: Record<string, { currentValue: string; targetValue: string; targetTrafficLight: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramDetailDTO extends ControlProgramDTO {
  milestones: ProgramMilestoneDTO[];
}

// ---------------------------------------------------------------------------
// Impact DTO
// ---------------------------------------------------------------------------

export interface ImpactMetricDTO {
  metricCode: string;
  metricLabel: string;
  baselineValue: string | null;
  baselineTrafficLight: string | null;
  baselineCapturedAt: string | null;
  currentValue: string | null;
  currentTrafficLight: string | null;
  currentTrend: string | null;
  targetValue: string | null;
  improvement: string | null;
  trafficLightChanged: boolean;
}

export interface ProgramImpactDTO {
  programId: string;
  status: string;
  impact: ImpactMetricDTO[];
}

// ---------------------------------------------------------------------------
// Create input
// ---------------------------------------------------------------------------

export interface ProgramCreateInput {
  entityCode: string;
  title: string;
  description?: string;
  programType?: string;
  priority?: string;
  sponsorName?: string;
  sponsorRole?: string;
  ownerName?: string;
  ownerRole?: string;
  plannedStart?: string;
  plannedEnd?: string;
  fiscalYear?: number;
  linkedGaps?: { type: string; key: string; label: string; metricCode?: string }[];
  targetOutcomes?: Record<string, { currentValue: string; targetValue: string; targetTrafficLight: string }>;
}

export interface MilestoneCreateInput {
  title: string;
  detail?: string;
  severity?: string;
  priority?: number;
  assignedRole?: string;
  dueAt?: string;
}

// ---------------------------------------------------------------------------
// useControlPrograms — portfolio list
// ---------------------------------------------------------------------------

export interface UseControlProgramsResult {
  programs: ControlProgramDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useControlPrograms(
  filters: { entityCode: string; status?: string; fiscalYear?: number } | null,
): UseControlProgramsResult {
  const [programs, setPrograms] = useState<ControlProgramDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({ entityCode: filters.entityCode });
    if (filters.status) qs.set("status", filters.status);
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    return `/api/fin/assurance/programs?${qs}`;
  }, [filters?.entityCode, filters?.status, filters?.fiscalYear]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ControlProgramDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setPrograms(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load programs");
        setPrograms([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { programs, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useProgramDetail — single program with milestones
// ---------------------------------------------------------------------------

export interface UseProgramDetailResult {
  program: ProgramDetailDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProgramDetail(
  programId: string | null,
): UseProgramDetailResult {
  const [program, setProgram] = useState<ProgramDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!programId) { setProgram(null); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ProgramDetailDTO }>(`/api/fin/assurance/programs?programId=${programId}`, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setProgram(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load program");
        setProgram(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [programId, refreshKey]);

  return { program, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useProgramImpact — benefit realization
// ---------------------------------------------------------------------------

export interface UseProgramImpactResult {
  impact: ProgramImpactDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProgramImpact(
  programId: string | null,
): UseProgramImpactResult {
  const [impact, setImpact] = useState<ProgramImpactDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!programId) { setImpact(null); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ProgramImpactDTO }>(
      `/api/fin/assurance/programs?programId=${programId}&view=impact`,
      controller.signal,
    )
      .then((res) => { if (!controller.signal.aborted) setImpact(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load impact");
        setImpact(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [programId, refreshKey]);

  return { impact, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useProgramMutations — create, update status, add milestones
// ---------------------------------------------------------------------------

export interface UseProgramMutationsResult {
  createProgram: (input: ProgramCreateInput) => Promise<string>;
  updateStatus: (programId: string, action: string, extra?: Record<string, any>) => Promise<void>;
  addMilestone: (programId: string, input: MilestoneCreateInput) => Promise<string>;
  updateGaps: (programId: string, gaps: { type: string; key: string; label: string }[]) => Promise<void>;
  loading: boolean;
}

export function useProgramMutations(
  onSuccess?: () => void,
): UseProgramMutationsResult {
  const [loading, setLoading] = useState(false);

  const createProgram = useCallback(
    async (input: ProgramCreateInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { id: string } }>(
          "/api/fin/assurance/programs",
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

  const updateStatus = useCallback(
    async (programId: string, action: string, extra?: Record<string, any>) => {
      setLoading(true);
      try {
        await finPatch("/api/fin/assurance/programs", {
          programId,
          action,
          ...extra,
        });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const addMilestone = useCallback(
    async (programId: string, input: MilestoneCreateInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPatch<{ data: { milestoneId: string } }>(
          "/api/fin/assurance/programs",
          { programId, action: "add_milestone", ...input },
        );
        onSuccess?.();
        return res.data.milestoneId;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const updateGaps = useCallback(
    async (programId: string, gaps: { type: string; key: string; label: string }[]) => {
      setLoading(true);
      try {
        await finPatch("/api/fin/assurance/programs", {
          programId,
          action: "update_gaps",
          linkedGaps: gaps,
        });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { createProgram, updateStatus, addMilestone, updateGaps, loading };
}
