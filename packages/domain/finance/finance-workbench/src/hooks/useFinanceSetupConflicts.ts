"use client";

/**
 * useFinanceSetupConflicts — loads the full conflict list for a scope.
 *
 * Endpoint: GET /api/finance/setup/conflicts?scopeType=company&scopeCode=<code>
 *
 * This is the SINGLE SOURCE for finance-setup conflicts. Every UI badge, count,
 * and inbox derives from this hook (Hub renders top-N from CompanyHubPayload.inbox,
 * but the "show all" surface calls here).
 */

import { useQuery } from "@tanstack/react-query";
import type {
  FinanceSetupConflict,
  FinanceSetupScopeType,
} from "../lib/finance-setup.types";

export interface UseFinanceSetupConflictsOptions {
  scopeType: FinanceSetupScopeType;
  scopeCode: string;
}

async function fetchConflicts(
  opts: UseFinanceSetupConflictsOptions,
): Promise<FinanceSetupConflict[]> {
  const params = new URLSearchParams({
    scopeType: opts.scopeType,
    scopeCode: opts.scopeCode,
  });
  const res = await fetch(`/api/finance/setup/conflicts?${params}`, {
    credentials: "include",
    cache:       "no-store",
  });
  if (!res.ok) throw new Error(`Conflicts fetch failed: ${res.status}`);
  return res.json() as Promise<FinanceSetupConflict[]>;
}

export function useFinanceSetupConflicts(opts: UseFinanceSetupConflictsOptions) {
  return useQuery({
    queryKey: ["finance", "setup", "conflicts", opts.scopeType, opts.scopeCode],
    queryFn:  () => fetchConflicts(opts),
    enabled:  !!opts.scopeCode,
    staleTime: 60 * 1000,
  });
}
