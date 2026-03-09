"use client";

// lib/finance/use-atlas-feedback.ts
//
// Data-fetching + mutation hooks for the Atlas Feedback API (Phase 6).
// Provides effectiveness metrics, feedback submission, and calibration governance.

import { useState, useEffect, useCallback, useRef } from "react";

import { finGet, finPost } from "./fetcher";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import { FinanceHttpError } from "./errors";

// ---------------------------------------------------------------------------
// Types (mirrors API response shapes)
// ---------------------------------------------------------------------------

export interface FeedbackEffectiveness {
  anomalyEffectiveness: {
    totalFeedback: number;
    confirmedCount: number;
    falsePositiveCount: number;
    confirmedRate: string;
    falsePositiveRate: string;
    byType: Record<string, { confirmed: number; falsePositive: number; total: number }>;
  };
  recommendationEffectiveness: {
    totalFeedback: number;
    acceptedCount: number;
    dismissedCount: number;
    deferredCount: number;
    acceptanceRate: string;
    byType: Record<string, { accepted: number; dismissed: number; total: number }>;
  };
  calibrationSuggestions: CalibrationSuggestion[];
}

export interface CalibrationSuggestion {
  anomalyType: string;
  accountCode: string | null;
  currentWarningThreshold: string;
  currentCriticalThreshold: string;
  suggestedWarningThreshold: string;
  suggestedCriticalThreshold: string;
  falsePositiveRate: string;
  sampleSize: number;
  confidence: string;
  rationale: string;
}

export interface ActiveCalibration {
  id: string;
  entityCode: string;
  accountCode: string | null;
  anomalyType: string;
  warningZThreshold: string;
  criticalZThreshold: string;
  status: "SUGGESTED" | "APPROVED";
  source: string;
  falsePositiveRate: string | null;
  sampleSize: number | null;
  confidence: string | null;
  suggestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface FeedbackData {
  effectiveness: FeedbackEffectiveness;
  activeCalibrations: ActiveCalibration[];
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Feedback submission types
// ---------------------------------------------------------------------------

export type FeedbackTarget = "ANOMALY" | "RECOMMENDATION";
export type FeedbackVerdict = "CONFIRMED" | "FALSE_POSITIVE" | "ACCEPTED" | "DISMISSED" | "DEFERRED";
export type FeedbackReasonCode =
  | "SEASONAL_PATTERN" | "ONE_TIME_EVENT" | "KNOWN_ADJUSTMENT"
  | "DATA_QUALITY" | "THRESHOLD_TOO_SENSITIVE" | "THRESHOLD_TOO_LOOSE"
  | "NOT_ACTIONABLE" | "ALREADY_ADDRESSED" | "INCORRECT_OWNER"
  | "IMMATERIAL" | "OTHER";

export interface SubmitFeedbackInput {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  feedbackTarget: FeedbackTarget;
  targetId: string;
  anomalyType?: string;
  anomalySeverity?: string;
  accountCode?: string;
  verdict: FeedbackVerdict;
  reasonCode?: FeedbackReasonCode;
  reasonDetail?: string;
  evidenceSnapshot?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Hook: useAtlasFeedback — effectiveness metrics
// ---------------------------------------------------------------------------

export interface UseAtlasFeedbackParams {
  entityCode: string;
  fiscalYear?: number;
  periodNumber?: number;
}

export interface UseAtlasFeedbackResult {
  data: FeedbackData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  submitFeedback: (input: SubmitFeedbackInput) => Promise<boolean>;
  approveCalibration: (calibrationId: string) => Promise<boolean>;
  rejectCalibration: (calibrationId: string, reason: string) => Promise<boolean>;
}

export function useAtlasFeedback(
  params: UseAtlasFeedbackParams | null,
): UseAtlasFeedbackResult {
  const [data, setData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const paramKey = params
    ? `${params.entityCode}:${params.fiscalYear ?? ""}:${params.periodNumber ?? ""}`
    : "";

  const fetchData = useCallback(async () => {
    if (!params) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams({ entityCode: params.entityCode });
      if (params.fiscalYear) qs.set("fiscalYear", String(params.fiscalYear));
      if (params.periodNumber) qs.set("periodNumber", String(params.periodNumber));

      const result = await finGet<FeedbackData>(
        `/api/fin/atlas/feedback?${qs.toString()}`,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setData(result);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err?.message ?? "Failed to load feedback data");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [paramKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  const submitFeedback = useCallback(async (input: SubmitFeedbackInput): Promise<boolean> => {
    try {
      await finPost("/api/fin/atlas/feedback", input);
      fetchData(); // refresh after submission
      return true;
    } catch {
      return false;
    }
  }, [fetchData]);

  const approveCalibration = useCallback(async (calibrationId: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/fin/atlas/feedback/calibrations", {
        method: "PATCH",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ calibrationId, action: "APPROVE" }),
      });
      if (!res.ok) throw new FinanceHttpError(res.status, { code: "APPROVE_FAILED", message: "Calibration approval failed" });
      fetchData();
      return true;
    } catch {
      return false;
    }
  }, [fetchData]);

  const rejectCalibration = useCallback(async (calibrationId: string, reason: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/fin/atlas/feedback/calibrations", {
        method: "PATCH",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ calibrationId, action: "REJECT", rejectionReason: reason }),
      });
      if (!res.ok) throw new FinanceHttpError(res.status, { code: "REJECT_FAILED", message: "Calibration rejection failed" });
      fetchData();
      return true;
    } catch {
      return false;
    }
  }, [fetchData]);

  return { data, loading, error, refresh, submitFeedback, approveCalibration, rejectCalibration };
}
