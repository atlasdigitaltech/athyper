"use client";

/**
 * Mutation hooks for period close task and phase actions.
 *
 * Each hook invalidates only the queries it affects — tasks for the run,
 * and runs for the scope — so the UI stays fresh without a full refetch.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfToken } from "@athyper/runtime-shared/client";
import { scopeCacheKey, type FinanceScope } from "../lib/scope";

const FINANCE_WORKBENCH_API = "/api/workbench/finance";

// ── Task action ───────────────────────────────────────────────────────────────

export interface TaskActionVars {
  taskId:   string;
  action:   "complete" | "reopen" | "evaluate";
  remarks?: string;
  evidencePayload?: Record<string, unknown>;
}

export function useCompleteTask(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, action, remarks, evidencePayload }: TaskActionVars) =>
      fetch(`${FINANCE_WORKBENCH_API}/period-close/runs/${runId}/tasks/${taskId}/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ action, remarks, evidencePayload }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Task action failed (${res.status})`);
        }
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance", "period-close", "tasks", runId] });
      void qc.invalidateQueries({ queryKey: ["finance", "period-close", "runs"] });
    },
  });
}

// ── Phase sign-off ────────────────────────────────────────────────────────────

export interface SignOffVars {
  phaseCode: string;
  remarks?:  string;
}

export function useSignOffPhase(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phaseCode, remarks }: SignOffVars) =>
      fetch(`${FINANCE_WORKBENCH_API}/period-close/runs/${runId}/sign-off`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({ phaseCode, remarks }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Sign-off failed (${res.status})`);
        }
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance", "period-close", "tasks", runId] });
      void qc.invalidateQueries({ queryKey: ["finance", "period-close", "runs"] });
    },
  });
}

// ── Start new run ─────────────────────────────────────────────────────────────

export interface StartGovernanceRunOptions {
  cycleTypeCode?: string;
  periodNumber?: number;
  runData?: Record<string, unknown>;
}

export function useStartCloseRun(scope: FinanceScope, options: StartGovernanceRunOptions = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch(`${FINANCE_WORKBENCH_API}/period-close/runs`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body:    JSON.stringify({
          scopeType:    scope.scopeType,
          scopeId:      scope.scopeId,
          fiscalYear:   scope.fiscalYear,
          periodNumber: options.periodNumber ?? scope.period,
          cycleTypeCode: options.cycleTypeCode ?? "MONTHLY_CLOSE",
          runData: options.runData ?? {},
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Failed to start run (${res.status})`);
        }
        return res.json() as Promise<{ id: string }>;
      }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["finance", "period-close", "runs", ...scopeCacheKey(scope)],
      });
    },
  });
}

export function useCertificationCommand(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { certCode: string; action: "certify" | "attest"; notes?: string }) =>
      fetch(`${FINANCE_WORKBENCH_API}/period-close/runs/${runId}/certifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify(input),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({})) as { error?: string; status?: string };
        if (!res.ok) throw new Error(body.error ?? `Certification command failed (${res.status})`);
        return body;
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance", "period-close", "governance", runId] });
      void qc.invalidateQueries({ queryKey: ["finance", "period-close", "runs"] });
    },
  });
}

export function usePeriodCommand(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { targetStatus: "open" | "soft_close" | "hard_close"; bookIds?: string[]; reason?: string }) =>
      fetch(`${FINANCE_WORKBENCH_API}/period-close/runs/${runId}/period-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
        body: JSON.stringify(input),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Period command failed (${res.status})`);
        return body;
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance", "period-close"] });
    },
  });
}

export function useGenerateEvidencePack(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetch(`${FINANCE_WORKBENCH_API}/governance/report-packs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
      body: JSON.stringify({ cycleRunId: runId, reportType: "cycle_summary", format: "html" }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Evidence pack request failed (${res.status})`);
      return body;
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance", "period-close", "governance", runId] });
    },
  });
}
