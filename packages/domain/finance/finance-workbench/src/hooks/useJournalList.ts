"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinanceScope } from "../lib/scope";
import { scopeCacheKey, scopeToParams } from "../lib/scope";

export interface JournalEntry {
  id: string;
  jeNumber: string;
  description: string | null;
  status: string;
  sourceDocType: string | null;
  sourceDocRef: string | null;
  postingDate: string | null;
  fiscalYear: number;
  periodNumber: number;
  currencyCode: string;
  totalDebit: number;
  totalCredit: number;
  postedAt: string | null;
  lineCount: number;
}

export interface JournalListData {
  items: JournalEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface JournalListOpts {
  status?: string;
  sourceDocType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useJournalList(scope: FinanceScope, opts?: JournalListOpts) {
  const limit  = opts?.limit ?? 50;
  const page   = opts?.page  ?? 1;
  const offset = (page - 1) * limit;

  return useQuery<JournalListData>({
    queryKey: [
      "finance", "journals",
      ...scopeCacheKey(scope),
      opts?.status ?? "all",
      opts?.sourceDocType ?? "all",
      opts?.search ?? "",
      page,
    ],
    queryFn: async () => {
      const params = scopeToParams(scope);
      params.set("limit",  String(limit));
      params.set("offset", String(offset));
      if (opts?.status)        params.set("status",          opts.status);
      if (opts?.sourceDocType) params.set("source_doc_type", opts.sourceDocType);
      if (opts?.search)        params.set("search",          opts.search);
      const res = await fetch(`/api/finance/journals?${params}`);
      if (!res.ok) throw new Error("Failed to load journals");
      return res.json() as Promise<JournalListData>;
    },
    enabled: !!scope.scopeId,
    staleTime: 30 * 1000,
  });
}
