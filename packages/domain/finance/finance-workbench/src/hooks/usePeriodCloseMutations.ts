"use client";

/**
 * Mutation hooks for period close task and phase actions.
 *
 * Each hook invalidates only the queries it affects — tasks for the run,
 * and runs for the scope — so the UI stays fresh without a full refetch.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { scopeCacheKey, type FinanceScope } from "../lib/scope";

// ── Task action ───────────────────────────────────────────────────────────────

export interface TaskActionVars {
  taskId:   string;
  action:   "complete" | "reopen";
  remarks?: string;
}

export function useCompleteTask(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, action, remarks }: TaskActionVars) =>
      fetch(`/api/finance/period-close/runs/${runId}/tasks/${taskId}/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, remarks }),
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
      fetch(`/api/finance/period-close/runs/${runId}/sign-off`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
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

export function useStartCloseRun(scope: FinanceScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch("/api/finance/period-close/runs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          scopeType:    scope.scopeType,
          scopeId:      scope.scopeId,
          fiscalYear:   scope.fiscalYear,
          periodNumber: scope.period,
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
