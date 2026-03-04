"use client";

// lib/finance/use-decision-score.ts
//
// Data-fetching hook for the Decision Grid evaluation of a finance document.
// The decision score is typically embedded in the entity detail response
// under a `decisionEvaluation` key. This hook fetches the entity detail
// and parses out the evaluation.
//
// GET /api/fin/:docType/:docId -> { ..., decisionEvaluation?: DecisionEvaluationDTO }
//
// Follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-entity-data.ts.

import { useState, useEffect, useCallback, useRef } from "react";
import { finGet } from "./fetcher";
import { FinanceHttpError } from "./errors";
import type { DecisionEvaluationDTO } from "./types";

// ---------------------------------------------------------------------------
// The entity detail response shape (only the decision fields we need)
// ---------------------------------------------------------------------------

interface EntityDetailWithDecision {
    decisionEvaluation?: DecisionEvaluationDTO | null;
}

// ---------------------------------------------------------------------------
// Mapping from docType to the API path segment
// ---------------------------------------------------------------------------

const DOC_TYPE_PATH: Record<string, string> = {
    "purchase-invoice": "purchase-invoices",
    "payment-entry": "payments",
    "journal-entry": "journal-entries",
};

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
    const [evaluation, setEvaluation] = useState<DecisionEvaluationDTO | null>(null);
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
            const pathSegment = DOC_TYPE_PATH[docType] ?? docType;
            const url = `/api/fin/${encodeURIComponent(pathSegment)}/${encodeURIComponent(docId)}`;
            const data = await finGet<EntityDetailWithDecision>(url, controller.signal);

            if (controller.signal.aborted) return;

            setEvaluation(data.decisionEvaluation ?? null);
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
