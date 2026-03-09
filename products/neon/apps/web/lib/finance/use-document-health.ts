"use client";

// lib/finance/use-document-health.ts
//
// Phase 8C: Document health score, posting reconciliation, and remediation hooks.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost } from "./fetcher";

import type {
  DocumentHealthScoreDTO,
  PostingReconciliationSummaryDTO,
  PostingReconciliationFindingDTO,
  RemediationActionDTO,
  RemediationSummaryDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Health Score Hook
// ---------------------------------------------------------------------------

export interface DocumentHealthParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface UseDocumentHealthResult {
  healthScore: DocumentHealthScoreDTO | null;
  reconSummary: PostingReconciliationSummaryDTO | null;
  reconFindings: PostingReconciliationFindingDTO[] | null;
  remediationSummary: RemediationSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDocumentHealth(
  params: DocumentHealthParams | null,
): UseDocumentHealthResult {
  const [healthScore, setHealthScore] = useState<DocumentHealthScoreDTO | null>(null);
  const [reconSummary, setReconSummary] = useState<PostingReconciliationSummaryDTO | null>(null);
  const [reconFindings, setReconFindings] = useState<PostingReconciliationFindingDTO[] | null>(null);
  const [remediationSummary, setRemediationSummary] = useState<RemediationSummaryDTO | null>(null);
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
    return `/api/fin/close-command-center/document-health?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

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
        healthScore: DocumentHealthScoreDTO;
        reconSummary: PostingReconciliationSummaryDTO;
        reconFindings: PostingReconciliationFindingDTO[];
        remediationSummary: RemediationSummaryDTO;
      };
    }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setHealthScore(res.data.healthScore);
          setReconSummary(res.data.reconSummary);
          setReconFindings(res.data.reconFindings);
          setRemediationSummary(res.data.remediationSummary);
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

  return { healthScore, reconSummary, reconFindings, remediationSummary, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Remediation Actions Hook
// ---------------------------------------------------------------------------

export interface UseRemediationActionsResult {
  actions: RemediationActionDTO[] | null;
  summary: RemediationSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  approve: (actionId: string) => Promise<void>;
  reject: (actionId: string, reason: string) => Promise<void>;
  bulkApprove: (actionIds: string[]) => Promise<void>;
}

export function useRemediationActions(
  params: DocumentHealthParams | null,
): UseRemediationActionsResult {
  const [actions, setActions] = useState<RemediationActionDTO[] | null>(null);
  const [summary, setSummary] = useState<RemediationSummaryDTO | null>(null);
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
    return `/api/fin/close-command-center/remediation?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

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
        actions: RemediationActionDTO[];
        summary: RemediationSummaryDTO;
      };
    }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setActions(res.data.actions);
          setSummary(res.data.summary);
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

  const approve = useCallback(async (actionId: string) => {
    await finPost(`/api/fin/close-command-center/remediation/${actionId}/approve`, {});
    refresh();
  }, [refresh]);

  const reject = useCallback(async (actionId: string, reason: string) => {
    await finPost(`/api/fin/close-command-center/remediation/${actionId}/reject`, { reason });
    refresh();
  }, [refresh]);

  const bulkApprove = useCallback(async (actionIds: string[]) => {
    await finPost(`/api/fin/close-command-center/remediation/bulk-approve`, { actionIds });
    refresh();
  }, [refresh]);

  return { actions, summary, loading, error, refresh, approve, reject, bulkApprove };
}
