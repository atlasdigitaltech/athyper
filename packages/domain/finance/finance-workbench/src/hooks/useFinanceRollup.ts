"use client";

/**
 * useFinanceRollup — loads the tenant / legal-entity rollup payload.
 *
 * Endpoint: GET /api/finance/setup/readiness?scopeType=tenant|legal_entity&scopeCode=<code>
 *
 * Response is a RollupPayload:
 *   • scope + scopeName
 *   • companies[] — each with 5-step journey and coverage KPIs
 *   • aggregate  — completeCompanies / totalCompanies / avgCoveragePct / conflictsByCategory
 *   • inbox      — deduped, severity-sorted list of top conflicts across the scope
 */

import { useQuery } from "@tanstack/react-query";
import type { JourneyStep, FinanceSetupConflict } from "../lib/finance-setup.types";

export type RollupScopeType = "tenant" | "legal_entity";

export interface RollupCompanyRow {
  companyCode:        string;
  companyName:        string;
  legalEntityCode:    string | null;
  legalEntityName:    string | null;
  journey:            JourneyStep[];
  conflictCount:      number;
  isReady:            boolean;
  overallCoveragePct: number;
}

export interface FinanceRollupPayload {
  scope: {
    type:  "tenant" | "legal_entity" | "company";
    code:  string;
    label?: string;
  };
  scopeName: string;
  companies: RollupCompanyRow[];
  aggregate: {
    completeCompanies:   number;
    totalCompanies:      number;
    conflictCount:       number;
    conflictsByCategory: Record<string, number>;
    avgCoveragePct:      number;
  };
  inbox:      FinanceSetupConflict[];
  computedAt: string;
}

export interface UseFinanceRollupOptions {
  scopeType: RollupScopeType;
  scopeCode: string;
}

async function fetchRollup(opts: UseFinanceRollupOptions): Promise<FinanceRollupPayload> {
  const params = new URLSearchParams({
    scopeType: opts.scopeType,
    scopeCode: opts.scopeCode,
  });
  const res = await fetch(`/api/finance/setup/readiness?${params}`, {
    credentials: "include",
    cache:       "no-store",
  });
  if (!res.ok) throw new Error(`Rollup fetch failed: ${res.status}`);
  return res.json() as Promise<FinanceRollupPayload>;
}

export function useFinanceRollup(opts: UseFinanceRollupOptions) {
  return useQuery({
    queryKey: ["finance", "setup", "rollup", opts.scopeType, opts.scopeCode],
    queryFn:  () => fetchRollup(opts),
    enabled:  !!opts.scopeCode,
    staleTime: 60 * 1000,
  });
}
