"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChartOfAccount } from "../data/types";

export function useCharts() {
  return useQuery<ChartOfAccount[]>({
    queryKey: ["finance", "master", "charts"],
    queryFn: async () => {
      const res = await fetch("/api/finance/master/charts");
      if (!res.ok) throw new Error("Failed to load charts");
      return res.json() as Promise<ChartOfAccount[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCompanyList() {
  return useQuery<Array<{ id: string; code: string; name: string; functionalCurrency: string }>>({
    queryKey: ["finance", "master", "companies"],
    queryFn: async () => {
      const res = await fetch("/api/finance/master/companies");
      if (!res.ok) throw new Error("Failed to load companies");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
