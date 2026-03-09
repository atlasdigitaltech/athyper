"use client";

// lib/finance/use-review-pack.ts
//
// Hooks for Phase 13: CFO Review Pack & Board Reporting Layer.
// Review pack assembly, snapshot capture/compare, and lifecycle management.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost, finPatch } from "./fetcher";

// ---------------------------------------------------------------------------
// Review Pack DTOs
// ---------------------------------------------------------------------------

export interface ReviewSectionDTO {
  sectionKey: string;
  title: string;
  body: string;
  sourceType: "generated" | "commentary" | "data";
  itemCount?: number;
}

export interface ReviewPackDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  assembledAt: string;
  readinessScore: number;
  phase: string;
  blockers: string[];
  closeState: any;
  pack: any;
  certification: any;
  release: any;
  cleanClose: any;
  distribution: any;
  overrides: { active_count: number; total_impact: number; details: any[] };
  actionItems: any[];
  decisions: any[];
  carryForward: any[];
  commentary: any[];
  topGlChanges: any[];
  overrideSummary: any;
  sections: ReviewSectionDTO[];
  openActionItemCount: number;
  decisionCount: number;
  carryForwardCount: number;
}

export interface ReviewPackParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface UseReviewPackResult {
  data: ReviewPackDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Review Snapshot DTOs
// ---------------------------------------------------------------------------

export interface ReviewSnapshotSummaryDTO {
  id: string;
  entity_code: string;
  fiscal_year: number;
  period_number: number;
  snapshot_code: string;
  review_type: string;
  title: string | null;
  description: string | null;
  status: "DRAFT" | "REVIEWED" | "SIGNED_OFF" | "DISTRIBUTED" | "SUPERSEDED";
  pack_instance_id: string | null;
  certification_id: string | null;
  close_run_id: string | null;
  snapshot_hash: string | null;
  readiness_score: number | null;
  phase: string | null;
  blocker_count: number;
  open_action_items: number;
  decision_count: number;
  carryforward_count: number;
  signed_off_by_name: string | null;
  signed_off_at: string | null;
  signoff_notes: string | null;
  supersedes_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewSnapshotDetailDTO extends ReviewSnapshotSummaryDTO {
  workspace_state: ReviewPackDTO;
  sections: ReviewSectionDTO[];
}

export interface UseReviewSnapshotsResult {
  snapshots: ReviewSnapshotSummaryDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface UseReviewSnapshotDetailResult {
  snapshot: ReviewSnapshotDetailDTO | null;
  loading: boolean;
  error: string | null;
}

export interface SnapshotCaptureInput {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  reviewType?: string;
  title?: string;
  description?: string;
  workspaceState: ReviewPackDTO;
  sections: ReviewSectionDTO[];
  readinessScore: number;
  phase: string;
  blockerCount: number;
  openActionItems: number;
  decisionCount: number;
  carryForwardCount: number;
  packInstanceId?: string;
  certificationId?: string;
  closeRunId?: string;
}

export interface UseReviewSnapshotMutationsResult {
  capture: (input: SnapshotCaptureInput) => Promise<string>;
  advanceStatus: (id: string, action: string, notes?: string) => Promise<void>;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// useReviewPack — assemble live review pack
// ---------------------------------------------------------------------------

export function useReviewPack(
  params: ReviewPackParams | null,
): UseReviewPackResult {
  const [data, setData] = useState<ReviewPackDTO | null>(null);
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
    return `/api/fin/review-pack?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ReviewPackDTO }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setData(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to assemble review pack");
        setData(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReviewSnapshots — list snapshots for comparison
// ---------------------------------------------------------------------------

export function useReviewSnapshots(
  params: ReviewPackParams | null,
): UseReviewSnapshotsResult {
  const [snapshots, setSnapshots] = useState<ReviewSnapshotSummaryDTO[]>([]);
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
    return `/api/fin/review-pack/snapshot?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ReviewSnapshotSummaryDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setSnapshots(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load snapshots");
        setSnapshots([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { snapshots, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReviewSnapshotDetail — retrieve a specific snapshot
// ---------------------------------------------------------------------------

export function useReviewSnapshotDetail(
  snapshotId: string | null,
): UseReviewSnapshotDetailResult {
  const [snapshot, setSnapshot] = useState<ReviewSnapshotDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!snapshotId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ReviewSnapshotDetailDTO }>(`/api/fin/review-pack/snapshot/${snapshotId}`, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setSnapshot(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load snapshot");
        setSnapshot(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [snapshotId]);

  return { snapshot, loading, error };
}

// ---------------------------------------------------------------------------
// useReviewSnapshotMutations — capture, advance status
// ---------------------------------------------------------------------------

export function useReviewSnapshotMutations(
  onSuccess?: () => void,
): UseReviewSnapshotMutationsResult {
  const [loading, setLoading] = useState(false);

  const capture = useCallback(
    async (input: SnapshotCaptureInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { id: string; snapshot_code: string } }>(
          "/api/fin/review-pack/snapshot",
          input,
        );
        onSuccess?.();
        return res.data.snapshot_code;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const advanceStatus = useCallback(
    async (id: string, action: string, notes?: string) => {
      setLoading(true);
      try {
        await finPatch(`/api/fin/review-pack/snapshot/${id}`, { action, notes });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { capture, advanceStatus, loading };
}
