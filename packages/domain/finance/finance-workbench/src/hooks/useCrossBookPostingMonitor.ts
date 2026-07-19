"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";

export type CrossBookDerivationStatus = "pending" | "processing" | "completed" | "suppressed" | "failed";

export interface CrossBookDerivationRow {
  id: string;
  status: CrossBookDerivationStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sourceJournalId: string;
  sourceJournalNumber: string;
  targetJournalId: string | null;
  targetJournalNumber: string | null;
  targetJournalStatus: string | null;
  fiscalYear: number;
  periodNumber: number;
  postingDate: string;
  sourceBookCode: string;
  targetBookCode: string | null;
  postingRuleCode: string;
  postingRuleName: string;
  executedRuleVersion: number;
  currentRuleVersion: number;
  outboxStatus: string | null;
  outboxAttempts: number | null;
  outboxLastError: string | null;
  evidencePayload: Record<string, unknown> | null;
}

export interface CrossBookMonitorPayload {
  summary: Record<CrossBookDerivationStatus, number> & { total: number };
  items: CrossBookDerivationRow[];
}

export function useCrossBookPostingMonitor(scope: FinanceScope, status?: CrossBookDerivationStatus) {
  const params = new URLSearchParams({
    scopeType: scope.scopeType,
    scopeCode: scope.scopeId,
    limit: "200",
  });
  if (status) params.set("status", status);

  return useQuery({
    queryKey: ["finance", "cross-book", "monitor", scope.scopeType, scope.scopeId, status ?? "all"],
    queryFn: async () => {
      const response = await fetch(`/api/workbench/finance/cross-book/monitor?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as (CrossBookMonitorPayload & { message?: string }) | null;
      if (!response.ok) throw new Error(body?.message ?? `Cross-book monitor returned ${response.status}`);
      return body as CrossBookMonitorPayload;
    },
    enabled: Boolean(scope.scopeId),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
