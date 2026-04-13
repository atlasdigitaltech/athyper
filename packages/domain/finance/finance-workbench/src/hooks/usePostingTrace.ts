"use client";

import { useQuery } from "@tanstack/react-query";

export interface PostingTraceLine {
  id: string;
  lineNumber: number;
  accountCode: string;
  accountName: string;
  accountClass: string;
  debitAmount: number;
  creditAmount: number;
  txnDebit: number | null;
  txnCredit: number | null;
  txnCurrency: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  profitCenterCode: string | null;
  profitCenterName: string | null;
  projectCode: string | null;
  projectName: string | null;
  assignment: string | null;
  itemText: string | null;
}

export interface PostingTraceJe {
  id: string;
  jeNumber: string;
  description: string | null;
  narration: string | null;
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
  reversedBy: string | null;
  reversalOf: string | null;
}

export interface PostingTraceData {
  je: PostingTraceJe;
  lines: PostingTraceLine[];
}

export function usePostingTrace(jeId: string | null) {
  return useQuery<PostingTraceData>({
    queryKey: ["finance", "posting-trace", jeId],
    queryFn: async () => {
      const res = await fetch(`/api/finance/journals/${encodeURIComponent(jeId!)}/posting-trace`);
      if (!res.ok) throw new Error("Failed to load posting trace");
      return res.json() as Promise<PostingTraceData>;
    },
    enabled: !!jeId,
    staleTime: 60 * 1000,
  });
}
