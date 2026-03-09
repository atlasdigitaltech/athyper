"use client";

// lib/finance/use-review-governance.ts
//
// Hooks for Phase 14: Review Diff, Assurance Traceability, and Attestation.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { finGet, finPost } from "./fetcher";

// ---------------------------------------------------------------------------
// Snapshot Diff DTOs
// ---------------------------------------------------------------------------

export interface SnapshotDiffSummary {
  readinessChange: number;
  phaseChanged: boolean;
  blockersDelta: number;
  actionItemsDelta: number;
  decisionsDelta: number;
  carryForwardDelta: number;
  sectionsChanged: number;
  totalChanges: number;
}

export interface SectionDiffDTO {
  sectionKey: string;
  title: string;
  status: "added" | "removed" | "changed" | "unchanged";
  baseBody?: string;
  compareBody?: string;
}

export interface ItemDiffDTO {
  added: { id: string; title: string }[];
  removed: { id: string; title: string }[];
  changed: { id: string; title: string; changes: string[] }[];
  baseCount: number;
  compareCount: number;
}

export interface SnapshotDiffDTO {
  base: { id: string; code: string; createdAt: string; status: string };
  compare: { id: string; code: string; createdAt: string; status: string };
  summary: SnapshotDiffSummary;
  readiness: {
    base: number; compare: number; delta: number;
    basePhase: string; comparePhase: string;
  };
  blockers: { added: string[]; removed: string[]; unchanged: string[] };
  sections: SectionDiffDTO[];
  actionItems: ItemDiffDTO;
  decisions: ItemDiffDTO;
  carryForward: ItemDiffDTO;
  overrides: {
    baseCount: number; compareCount: number;
    baseImpact: number; compareImpact: number;
  };
}

// ---------------------------------------------------------------------------
// Traceability DTOs
// ---------------------------------------------------------------------------

export interface EvidenceLinkDTO {
  sourceType: string;
  sourceId: string | null;
  label: string;
  detail: string;
  timestamp: string | null;
  integrity?: string;
}

export interface SectionProvenanceDTO {
  sectionKey: string;
  title: string;
  evidence: EvidenceLinkDTO[];
}

// ---------------------------------------------------------------------------
// Attestation DTOs
// ---------------------------------------------------------------------------

export interface AttestationDTO {
  id: string;
  entity_code: string;
  target_kind: string;
  target_id: string;
  attestation_type: string;
  attested_by: string;
  attested_by_name: string | null;
  attested_by_role: string | null;
  attested_at: string;
  notes: string | null;
  status: string;
  fiscal_year: number | null;
  period_number: number | null;
  created_at: string;
}

export interface AttestationInput {
  entityCode: string;
  targetKind: string;
  targetId: string;
  attestationType: string;
  attestedByRole?: string;
  notes?: string;
  fiscalYear?: number;
  periodNumber?: number;
}

// ---------------------------------------------------------------------------
// useSnapshotDiff — compare two snapshots
// ---------------------------------------------------------------------------

export interface UseSnapshotDiffResult {
  diff: SnapshotDiffDTO | null;
  loading: boolean;
  error: string | null;
}

export function useSnapshotDiff(
  baseId: string | null,
  compareId: string | null,
): UseSnapshotDiffResult {
  const [diff, setDiff] = useState<SnapshotDiffDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const url = useMemo(() => {
    if (!baseId || !compareId) return null;
    const qs = new URLSearchParams({ baseId, compareId });
    return `/api/fin/review-pack/diff?${qs}`;
  }, [baseId, compareId]);

  useEffect(() => {
    if (!url) { setDiff(null); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: SnapshotDiffDTO }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setDiff(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to compute diff");
        setDiff(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url]);

  return { diff, loading, error };
}

// ---------------------------------------------------------------------------
// useTraceability — assurance traceability for a period
// ---------------------------------------------------------------------------

export interface UseTraceabilityResult {
  provenance: SectionProvenanceDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTraceability(
  entityCode: string | null,
  fiscalYear: number | null,
  periodNumber: number | null,
): UseTraceabilityResult {
  const [provenance, setProvenance] = useState<SectionProvenanceDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!entityCode || !fiscalYear || !periodNumber) return null;
    const qs = new URLSearchParams({
      entityCode,
      fiscalYear: String(fiscalYear),
      periodNumber: String(periodNumber),
    });
    return `/api/fin/review-pack/traceability?${qs}`;
  }, [entityCode, fiscalYear, periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: SectionProvenanceDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setProvenance(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load traceability");
        setProvenance([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { provenance, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useAttestations — list attestations for a target or period
// ---------------------------------------------------------------------------

export interface UseAttestationsResult {
  attestations: AttestationDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAttestations(
  params: {
    targetKind?: string;
    targetId?: string;
    entityCode?: string;
    fiscalYear?: number;
    periodNumber?: number;
  } | null,
): UseAttestationsResult {
  const [attestations, setAttestations] = useState<AttestationDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams();
    if (params.targetKind) qs.set("targetKind", params.targetKind);
    if (params.targetId) qs.set("targetId", params.targetId);
    if (params.entityCode) qs.set("entityCode", params.entityCode);
    if (params.fiscalYear) qs.set("fiscalYear", String(params.fiscalYear));
    if (params.periodNumber) qs.set("periodNumber", String(params.periodNumber));
    if (!qs.has("targetKind") && !qs.has("entityCode")) return null;
    return `/api/fin/review-pack/attestation?${qs}`;
  }, [params?.targetKind, params?.targetId, params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: AttestationDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setAttestations(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load attestations");
        setAttestations([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { attestations, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useRecordAttestation — record an attestation
// ---------------------------------------------------------------------------

export interface UseRecordAttestationResult {
  record: (input: AttestationInput) => Promise<void>;
  loading: boolean;
}

export function useRecordAttestation(
  onSuccess?: () => void,
): UseRecordAttestationResult {
  const [loading, setLoading] = useState(false);

  const record = useCallback(
    async (input: AttestationInput) => {
      setLoading(true);
      try {
        await finPost("/api/fin/review-pack/attestation", input);
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { record, loading };
}
