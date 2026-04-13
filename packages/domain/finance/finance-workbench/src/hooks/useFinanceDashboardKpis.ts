"use client";

import { useQuery } from "@tanstack/react-query";

export interface FinanceDashboardKpis {
  revenueMtd:   number | null;
  expensesMtd:  number | null;
  openAp:       number | null;
  openAr:       number | null;
  cashBalance:  number | null;
  journalCount: number | null;
  /** Period the KPIs are computed for, e.g. "2026-04" */
  period:       string | null;
  asAt:         string;
}

async function fetchDashboardKpis(): Promise<FinanceDashboardKpis> {
  const res = await fetch("/api/finance/dashboard/kpis");
  if (!res.ok) throw new Error("Failed to load dashboard KPIs");
  return res.json() as Promise<FinanceDashboardKpis>;
}

/**
 * Fetches top-level finance KPIs for the current user's default company
 * and the current accounting period. No scope parameter — the server
 * derives context from the session.
 */
export function useFinanceDashboardKpis() {
  return useQuery({
    queryKey: ["finance", "dashboard", "kpis"],
    queryFn:  fetchDashboardKpis,
    staleTime: 5 * 60 * 1000,   // 5 min — dashboard is a summary overview
    retry:     false,            // show "—" gracefully if API not yet wired
  });
}
