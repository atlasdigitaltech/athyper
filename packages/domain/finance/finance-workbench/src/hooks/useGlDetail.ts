"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";
import { scopeCacheKey, scopeToParams } from "../lib/scope";

export interface GlDetailLine {
  journalEntryId: string;
  journalLineId: string;
  companyCode: string;
  postingDate: string;
  /** Journal entry reference number (e.g. "JE-2026-00042") */
  entryNumber: string;
  narration: string | null;
  sourceDocType: string | null;
  sourceDocRef: string | null;
  /** dimension1 value */
  costCenter: string | null;
  /** dimension2 value */
  project: string | null;
  debitAmount: number;
  creditAmount: number;
  /** Running balance after this line (debit positive, credit negative) */
  runningBalance: number;
  postedAt: string;
  postedBy: string | null;
}

export interface GlDetailData {
  accountCode: string;
  accountName: string;
  accountClass: string;
  openingBalance: number;
  closingBalance: number;
  lines: GlDetailLine[];
  asAt: string;
  isLive: boolean;
}

export interface GlDetailParams {
  scope: FinanceScope;
  accountCode: string;
}

async function fetchGlDetail(params: GlDetailParams): Promise<GlDetailData> {
  const urlParams = scopeToParams(params.scope);
  urlParams.set("accountCode", params.accountCode);
  const res = await fetch(`/api/finance/gl-detail?${urlParams}`);
  if (!res.ok) throw new Error("Failed to load GL detail");
  return res.json() as Promise<GlDetailData>;
}

export function useGlDetail(params: GlDetailParams) {
  return useQuery({
    queryKey: [
      "finance",
      "gl-detail",
      params.accountCode,
      ...scopeCacheKey(params.scope),
    ],
    queryFn: () => fetchGlDetail(params),
    enabled: !!params.scope.scopeId && !!params.accountCode,
    staleTime: 60 * 1000,
  });
}
