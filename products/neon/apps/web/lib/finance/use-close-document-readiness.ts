"use client";

// lib/finance/use-close-document-readiness.ts
//
// Data-fetching hook for the Close Command Center document readiness.
// Queries the document registry bridge views to provide:
//   - Aggregate readiness summary per period
//   - Defect list (actionable work queue)
//   - Accrual reversal gaps
//   - Posting gaps

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  CloseDocumentSummaryDTO,
  CloseDocumentDefectDTO,
  AccrualReversalGapDTO,
  PostingGapDTO,
  BookPostingSummaryDTO,
  ReversedStillCountedDTO,
  ApprovalEvidenceGapDTO,
  DefectAgingDTO,
  DocumentReadinessTrendDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface CloseDocumentReadinessParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Optional book filter for multi-book close operations */
  bookCode?: string;
  /** Include defect aging data (default: true) */
  includeAging?: boolean;
  /** Include trend data across periods (default: false) */
  includeTrend?: boolean;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface UseCloseDocumentReadinessResult {
  summary: CloseDocumentSummaryDTO | null;
  defects: CloseDocumentDefectDTO[] | null;
  accrualGaps: AccrualReversalGapDTO[] | null;
  postingGaps: PostingGapDTO[] | null;
  bookSummary: BookPostingSummaryDTO[] | null;
  reversedMisaligned: ReversedStillCountedDTO[] | null;
  approvalGaps: ApprovalEvidenceGapDTO[] | null;
  defectAging: DefectAgingDTO[] | null;
  trend: DocumentReadinessTrendDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCloseDocumentReadiness(
  params: CloseDocumentReadinessParams | null,
): UseCloseDocumentReadinessResult {
  const [summary, setSummary] = useState<CloseDocumentSummaryDTO | null>(null);
  const [defects, setDefects] = useState<CloseDocumentDefectDTO[] | null>(null);
  const [accrualGaps, setAccrualGaps] = useState<AccrualReversalGapDTO[] | null>(null);
  const [postingGaps, setPostingGaps] = useState<PostingGapDTO[] | null>(null);
  const [bookSummary, setBookSummary] = useState<BookPostingSummaryDTO[] | null>(null);
  const [reversedMisaligned, setReversedMisaligned] = useState<ReversedStillCountedDTO[] | null>(null);
  const [approvalGaps, setApprovalGaps] = useState<ApprovalEvidenceGapDTO[] | null>(null);
  const [defectAging, setDefectAging] = useState<DefectAgingDTO[] | null>(null);
  const [trend, setTrend] = useState<DocumentReadinessTrendDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams({
      entityCode: params.entityCode,
      fiscalYear: String(params.fiscalYear),
      periodNumber: String(params.periodNumber),
    });
    if (params.bookCode) qs.set("bookCode", params.bookCode);
    if (params.includeAging !== false) qs.set("includeAging", "true");
    if (params.includeTrend) qs.set("includeTrend", "true");
    return `/api/fin/close-command-center/document-readiness?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber, params?.bookCode, params?.includeAging, params?.includeTrend]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{
      data: {
        summary: CloseDocumentSummaryDTO;
        defects: CloseDocumentDefectDTO[];
        accrualGaps: AccrualReversalGapDTO[];
        postingGaps: PostingGapDTO[];
        bookSummary?: BookPostingSummaryDTO[];
        reversedMisaligned?: ReversedStillCountedDTO[];
        approvalGaps?: ApprovalEvidenceGapDTO[];
        defectAging?: DefectAgingDTO[];
        trend?: DocumentReadinessTrendDTO[];
      };
    }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setSummary(res.data.summary);
          setDefects(res.data.defects);
          setAccrualGaps(res.data.accrualGaps);
          setPostingGaps(res.data.postingGaps);
          setBookSummary(res.data.bookSummary ?? null);
          setReversedMisaligned(res.data.reversedMisaligned ?? null);
          setApprovalGaps(res.data.approvalGaps ?? null);
          setDefectAging(res.data.defectAging ?? null);
          setTrend(res.data.trend ?? null);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof FinanceHttpError
              ? err.message
              : String(err),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return {
    summary, defects, accrualGaps, postingGaps,
    bookSummary, reversedMisaligned, approvalGaps, defectAging, trend,
    loading, error, refresh,
  };
}
