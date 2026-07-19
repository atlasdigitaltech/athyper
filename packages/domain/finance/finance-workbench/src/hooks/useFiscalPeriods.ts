"use client";

import { useQuery } from "@tanstack/react-query";
import type { FiscalPeriodStatus } from "../lib/period";

/** Raw row returned by GET /api/finance/master/periods */
export interface FiscalPeriodRow {
  periodNumber: number;
  periodType: "opening" | "normal" | "adjustment" | "closing";
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;
  status: FiscalPeriodStatus;
}

async function fetchFiscalPeriods(
  companyCode: string,
  fiscalYear: number,
): Promise<FiscalPeriodRow[]> {
  const params = new URLSearchParams({ companyCode, fiscalYear: String(fiscalYear) });
  const res = await fetch(`/api/finance/master/periods?${params.toString()}`);
  if (!res.ok) return [];
  return res.json() as Promise<FiscalPeriodRow[]>;
}

/**
 * Returns fiscal periods for a given company code + fiscal year with
 * lifecycle status (future | open | soft_close | hard_close).
 *
 * Returns an empty array when no period rows exist yet (new company / new year),
 * in which case the caller should fall back to a static 1–12 month list.
 */
export function useFiscalPeriods(
  companyCode: string | null | undefined,
  fiscalYear: number,
) {
  return useQuery({
    queryKey: ["finance", "master", "periods", companyCode, fiscalYear],
    queryFn: () => fetchFiscalPeriods(companyCode!, fiscalYear),
    enabled: !!companyCode && fiscalYear >= 2000,
    staleTime: 2 * 60 * 1000,   // 2 min — period statuses change infrequently
  });
}
