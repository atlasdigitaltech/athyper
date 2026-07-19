"use client";

import { useQuery } from "@tanstack/react-query";
import { scopeCacheKey, scopeToParams, type FinanceScope } from "../lib/scope";

const FINANCE_WORKBENCH_API = "/api/workbench/finance";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface CycleRunTaskSummary {
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  inProgress: number;
  pending: number;
  completionPct: number;
}

export interface CycleRun {
  id: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runNumber: number;
  status: string;
  periodEndDate: string | null;
  cycleStartDate: string | null;
  cycleTargetDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  certifiedAt: string | null;
  cycleTypeCode: string;
  cycleTypeName: string;
  frequency: string;
  currentPhaseCode: string | null;
  currentPhaseName: string | null;
  taskSummary: CycleRunTaskSummary;
}

export interface CycleTask {
  id: string;
  taskCode: string;
  status: string;
  isMandatory: boolean;
  assignedTo: string | null;
  assignedRole: string | null;
  dueAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  evidencePayload: Record<string, unknown>;
  failureReason: string | null;
  taskName: string;
  description: string | null;
  completionMode: string;
  systemCheckHandler: string | null;
  severity: string;
  slaHours: number | null;
  sortOrder: number;
  phaseCode: string;
  phaseName: string;
  phaseOrder: number;
  categoryCode: string;
  categoryName: string;
}

export interface CyclePhase {
  phaseCode: string;
  phaseName: string;
  phaseOrder: number;
  tasks: CycleTask[];
}

export interface CycleRunTasksData {
  run: {
    id: string;
    entityCode: string;
    status: string;
    fiscalYear: number;
    periodNumber: number;
  };
  phases: CyclePhase[];
  totalTasks: number;
}

export interface ChecklistSummary {
  total: number;
  completed: number;
  completionPct: number;
  open: number;
  blocked: number;
  failed: number;
}

export interface ChecklistData {
  runId: string;
  runStatus: string;
  tasks: CycleTask[];
  summary: ChecklistSummary;
}

export interface GovernanceEvidenceData {
  run: Record<string, unknown>;
  certifications: Array<{ id: string; cert_code: string; status: string; content_hash: string | null }>;
  deviations: Array<Record<string, unknown>>;
  reportPacks: Array<Record<string, unknown>>;
  importRequests: Array<Record<string, unknown>>;
  journals: Array<Record<string, unknown>>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function usePeriodCloseRuns(scope: FinanceScope, cycleTypeCode?: string) {
  return useQuery<CycleRun[]>({
    queryKey: ["finance", "period-close", "runs", cycleTypeCode ?? "all", ...scopeCacheKey(scope)],
    queryFn: async () => {
      const params = scopeToParams(scope);
      if (cycleTypeCode) params.set("cycleTypeCode", cycleTypeCode);
      const res = await fetch(`${FINANCE_WORKBENCH_API}/period-close/runs?${params}`);
      if (!res.ok) throw new Error("Failed to load period close runs");
      return res.json() as Promise<CycleRun[]>;
    },
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}

export function usePeriodCloseTasks(runId: string | null) {
  return useQuery<CycleRunTasksData>({
    queryKey: ["finance", "period-close", "tasks", runId],
    queryFn: async () => {
      const res = await fetch(`${FINANCE_WORKBENCH_API}/period-close/runs/${runId}/tasks`);
      if (!res.ok) throw new Error("Failed to load period close tasks");
      return res.json() as Promise<CycleRunTasksData>;
    },
    enabled: !!runId,
    staleTime: 20 * 1000,
  });
}

export function useGovernanceEvidence(runId: string | null) {
  return useQuery<GovernanceEvidenceData>({
    queryKey: ["finance", "period-close", "governance", runId],
    queryFn: async () => {
      const res = await fetch(`${FINANCE_WORKBENCH_API}/period-close/runs/${runId}/governance`);
      if (!res.ok) throw new Error("Failed to load governance evidence");
      return res.json() as Promise<GovernanceEvidenceData>;
    },
    enabled: Boolean(runId),
    staleTime: 10_000,
  });
}

export function usePeriodCloseChecklist(scope: FinanceScope) {
  return useQuery<ChecklistData>({
    queryKey: ["finance", "period-close", "checklist", ...scopeCacheKey(scope)],
    queryFn: async () => {
      const res = await fetch(`${FINANCE_WORKBENCH_API}/period-close/checklist?${scopeToParams(scope)}`);
      if (!res.ok) throw new Error("Failed to load period close checklist");
      return res.json() as Promise<ChecklistData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}
