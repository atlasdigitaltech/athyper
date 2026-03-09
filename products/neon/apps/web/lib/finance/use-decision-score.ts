"use client";

// lib/finance/use-decision-score.ts
//
// Data-fetching hook for the Decision Grid evaluation of a finance document.
// Fetches entity detail from /api/data/:entity/:id and extracts the
// decision_score and approval_route fields.
//
// Follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-entity-data.ts.

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type { DecisionEvaluationDTO } from "./types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseDecisionScoreResult {
  evaluation: DecisionEvaluationDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDecisionScore(
  docType: string | undefined,
  docId: string | undefined,
): UseDecisionScoreResult {
  const [evaluation, setEvaluation] = useState<DecisionEvaluationDTO | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!docType || !docId) {
      setEvaluation(null);
      setLoading(false);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // Fetch the entity detail from the generic data API
      const url = `/api/data/${encodeURIComponent(docType)}/${encodeURIComponent(docId)}`;
      const data = await finGet<Record<string, unknown>>(
        url,
        controller.signal,
      );

      if (controller.signal.aborted) return;

      // Extract decision fields from the raw entity record
      const decisionScore = data.decision_score;
      if (decisionScore == null) {
        // Entity doesn't have a decision_score field — not an error
        setEvaluation(null);
      } else {
        setEvaluation({
          compositeScore: Number(decisionScore),
          approvalRoute: (data.approval_route as string) ?? "standard",
          pipelineId: (data.id as string) ?? docId,
          exceptions: [],
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load decision score";
      setError(message);
      setEvaluation(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [docType, docId]);

  useEffect(() => {
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { evaluation, loading, error, refresh };
}
