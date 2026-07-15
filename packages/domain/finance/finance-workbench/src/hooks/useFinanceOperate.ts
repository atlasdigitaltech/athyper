"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceSetupConflict, ConflictCategory } from "../lib/finance-setup.types";

export interface OperateBlockerGroup {
  category:      ConflictCategory;
  categoryLabel: string;
  count:         number;
  topReasonCode: string | null;
  conflicts:     FinanceSetupConflict[];
}

export interface OperateReconciliationSignal {
  bankAccountId:      string;
  bankAccountLabel:   string;
  openCases:          number;
  unmatchedLines:     number;
  lastStatementDate:  string | null;
  glAccountCode:      string | null;
  linkStatus:         "effective" | "expired" | "future";
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function url(kind: string, companyCode: string): string {
  const params = new URLSearchParams({ scopeType: "company", scopeCode: companyCode });
  return `/api/finance/setup/operate/${kind}?${params}`;
}

export function useOperateBlockers(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "operate", "blockers", companyCode],
    queryFn:  () => fetchJson<OperateBlockerGroup[]>(url("blockers", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}

export function useOperateReconciliationSignals(companyCode: string) {
  return useQuery({
    queryKey: ["finance", "setup", "operate", "reconciliation-signals", companyCode],
    queryFn:  () => fetchJson<OperateReconciliationSignal[]>(url("reconciliation-signals", companyCode)),
    enabled:  !!companyCode,
    staleTime: 60 * 1000,
  });
}
