"use client";

// lib/finance/use-assurance-hub.ts
//
// Hooks for Phase 15: Finance Assurance Hub & External Audit Workspace.
// Evidence requests, PBC fulfillment, evidence bundles, external distribution.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { finGet, finPost, finPatch, finDelete } from "./fetcher";

// ---------------------------------------------------------------------------
// Evidence Request DTOs (reuses action_item with target_kind='evidence_request')
// ---------------------------------------------------------------------------

export interface EvidenceRequestDTO {
  id: string;
  entity_code: string;
  target_kind: string;
  target_id: string | null;
  title: string;
  detail: string | null;
  severity: string;
  priority: number | null;
  category: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  assigned_at: string | null;
  due_at: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  source: string;
  source_ref: string | null;
  fiscal_year: number | null;
  period_number: number | null;
  structured_data: {
    requested_by_org?: string;
    requested_by_name?: string;
    linked_artifacts?: { kind: string; id: string; label: string }[];
  } | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRequestCreateInput {
  entityCode: string;
  title: string;
  detail?: string;
  severity?: string;
  category?: string;
  requestedByOrg?: string;
  requestedByName?: string;
  dueAt?: string;
  linkedArtifacts?: { kind: string; id: string; label: string }[];
  fiscalYear: number;
  periodNumber: number;
  targetKind?: string;
}

export interface EvidenceRequestFilters {
  entityCode: string;
  fiscalYear?: number;
  periodNumber?: number;
  status?: string;
  severity?: string;
}

// ---------------------------------------------------------------------------
// Evidence Bundle DTOs
// ---------------------------------------------------------------------------

export interface EvidenceBundleDTO {
  id: string;
  entity_code: string;
  bundle_code: string;
  title: string;
  description: string | null;
  fiscal_year: number;
  period_number: number;
  bundle_type: string;
  status: string;
  requested_by_org: string | null;
  requested_by_name: string | null;
  requested_at: string | null;
  due_at: string | null;
  bundle_hash: string | null;
  item_count: number;
  sealed_by_name: string | null;
  sealed_at: string | null;
  access_window_start: string | null;
  access_window_end: string | null;
  review_snapshot_id: string | null;
  distribution_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceBundleItemDTO {
  id: string;
  artifact_kind: string;
  artifact_id: string | null;
  artifact_label: string;
  section_key: string | null;
  artifact_hash: string | null;
  custom_payload: any | null;
  sort_order: number;
  included_by_name: string | null;
  included_at: string;
  inclusion_note: string | null;
}

export interface EvidenceBundleDetailDTO extends EvidenceBundleDTO {
  items: EvidenceBundleItemDTO[];
}

export interface EvidenceBundleCreateInput {
  entityCode: string;
  title: string;
  description?: string;
  bundleType?: string;
  fiscalYear: number;
  periodNumber: number;
  requestedByOrg?: string;
  requestedByName?: string;
  dueAt?: string;
  accessWindowStart?: string;
  accessWindowEnd?: string;
  reviewSnapshotId?: string;
}

export interface BundleItemInput {
  artifactKind: string;
  artifactId?: string;
  artifactLabel: string;
  sectionKey?: string;
  artifactHash?: string;
  customPayload?: any;
  sortOrder?: number;
  inclusionNote?: string;
}

export interface BundleDistributeInput {
  name: string;
  description?: string;
  format?: string;
  recipientClass?: string;
  recipients: { name: string; email?: string; role?: string }[];
  accessWindowStart?: string;
  accessWindowEnd?: string;
}

// ---------------------------------------------------------------------------
// useEvidenceRequests — list evidence/PBC requests
// ---------------------------------------------------------------------------

export interface UseEvidenceRequestsResult {
  requests: EvidenceRequestDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEvidenceRequests(
  filters: EvidenceRequestFilters | null,
): UseEvidenceRequestsResult {
  const [requests, setRequests] = useState<EvidenceRequestDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({ entityCode: filters.entityCode });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber) qs.set("periodNumber", String(filters.periodNumber));
    if (filters.status) qs.set("status", filters.status);
    if (filters.severity) qs.set("severity", filters.severity);
    return `/api/fin/assurance/evidence-requests?${qs}`;
  }, [filters?.entityCode, filters?.fiscalYear, filters?.periodNumber, filters?.status, filters?.severity]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: EvidenceRequestDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setRequests(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load evidence requests");
        setRequests([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { requests, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useEvidenceRequestMutations — create, update, fulfill requests
// ---------------------------------------------------------------------------

export interface UseEvidenceRequestMutationsResult {
  create: (input: EvidenceRequestCreateInput) => Promise<string>;
  updateStatus: (id: string, action: string, notes?: string) => Promise<void>;
  assign: (id: string, assignedTo?: string, assignedRole?: string) => Promise<void>;
  loading: boolean;
}

export function useEvidenceRequestMutations(
  onSuccess?: () => void,
): UseEvidenceRequestMutationsResult {
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (input: EvidenceRequestCreateInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { id: string } }>(
          "/api/fin/assurance/evidence-requests",
          input,
        );
        onSuccess?.();
        return res.data.id;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const updateStatus = useCallback(
    async (id: string, action: string, notes?: string) => {
      setLoading(true);
      try {
        await finPatch(`/api/fin/assurance/evidence-requests/${id}`, {
          action,
          resolutionNote: notes,
        });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const assign = useCallback(
    async (id: string, assignedTo?: string, assignedRole?: string) => {
      setLoading(true);
      try {
        await finPatch(`/api/fin/assurance/evidence-requests/${id}`, {
          action: "assign",
          assignedTo,
          assignedRole,
        });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { create, updateStatus, assign, loading };
}

// ---------------------------------------------------------------------------
// useEvidenceBundles — list bundles
// ---------------------------------------------------------------------------

export interface UseEvidenceBundlesResult {
  bundles: EvidenceBundleDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEvidenceBundles(
  params: { entityCode: string; fiscalYear: number; periodNumber: number } | null,
): UseEvidenceBundlesResult {
  const [bundles, setBundles] = useState<EvidenceBundleDTO[]>([]);
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
    return `/api/fin/assurance/bundles?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: EvidenceBundleDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setBundles(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load evidence bundles");
        setBundles([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { bundles, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useEvidenceBundleDetail — get bundle with items
// ---------------------------------------------------------------------------

export interface UseEvidenceBundleDetailResult {
  bundle: EvidenceBundleDetailDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEvidenceBundleDetail(
  bundleId: string | null,
): UseEvidenceBundleDetailResult {
  const [bundle, setBundle] = useState<EvidenceBundleDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!bundleId) { setBundle(null); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: EvidenceBundleDetailDTO }>(`/api/fin/assurance/bundles/${bundleId}`, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setBundle(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load bundle detail");
        setBundle(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [bundleId, refreshKey]);

  return { bundle, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useEvidenceBundleMutations — create, seal, add items, distribute
// ---------------------------------------------------------------------------

export interface UseEvidenceBundleMutationsResult {
  createBundle: (input: EvidenceBundleCreateInput) => Promise<string>;
  addItems: (bundleId: string, items: BundleItemInput[]) => Promise<void>;
  removeItem: (bundleId: string, itemId: string) => Promise<void>;
  sealBundle: (bundleId: string) => Promise<{ bundleHash: string; itemCount: number }>;
  expireBundle: (bundleId: string) => Promise<void>;
  distribute: (bundleId: string, input: BundleDistributeInput) => Promise<{ distributionId: string; secureLinkToken: string }>;
  loading: boolean;
}

export function useEvidenceBundleMutations(
  onSuccess?: () => void,
): UseEvidenceBundleMutationsResult {
  const [loading, setLoading] = useState(false);

  const createBundle = useCallback(
    async (input: EvidenceBundleCreateInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { id: string; bundle_code: string } }>(
          "/api/fin/assurance/bundles",
          input,
        );
        onSuccess?.();
        return res.data.id;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const addItems = useCallback(
    async (bundleId: string, items: BundleItemInput[]) => {
      setLoading(true);
      try {
        await finPost(`/api/fin/assurance/bundles/${bundleId}/items`, { items });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const removeItem = useCallback(
    async (bundleId: string, itemId: string) => {
      setLoading(true);
      try {
        await finDelete(`/api/fin/assurance/bundles/${bundleId}/items?itemId=${encodeURIComponent(itemId)}`);
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const sealBundle = useCallback(
    async (bundleId: string) => {
      setLoading(true);
      try {
        const res = await finPatch<{ data: { bundleHash: string; itemCount: number } }>(
          `/api/fin/assurance/bundles/${bundleId}`,
          { action: "seal" },
        );
        onSuccess?.();
        return res.data;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const expireBundle = useCallback(
    async (bundleId: string) => {
      setLoading(true);
      try {
        await finPatch(`/api/fin/assurance/bundles/${bundleId}`, { action: "expire" });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const distribute = useCallback(
    async (bundleId: string, input: BundleDistributeInput) => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { distributionId: string; secureLinkToken: string } }>(
          `/api/fin/assurance/bundles/${bundleId}/distribute`,
          input,
        );
        onSuccess?.();
        return res.data;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { createBundle, addItems, removeItem, sealBundle, expireBundle, distribute, loading };
}
