"use client";

// lib/governance/hooks.ts
//
// Data-fetching hooks for Governance Admin UI.
// Follows the same pattern as lib/finance/use-*.ts hooks.

import { useState, useEffect, useCallback, useRef } from "react";

import { finGet, finPost } from "@/lib/finance/fetcher";
import { FinanceHttpError } from "@/lib/finance/errors";

import type {
  LegalHoldDTO,
  ArchiveManifestDTO,
  PurgeCertificateDTO,
  RestoreRequestDTO,
  QuotaDTO,
  PiiFieldDTO,
  PiiSummaryDTO,
  RetentionExplainDTO,
  TieringExplainDTO,
} from "./types";

// ============================================================================
// Generic fetcher hook
// ============================================================================

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useFetch<T>(url: string | null): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ success: boolean; data: T }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setData(res.data);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        const message =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load data";
        setError(message);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { data, loading, error, refresh };
}

// ============================================================================
// Retention / Tiering Explain
// ============================================================================

export function useRetentionExplain(schema = "evt", table = "event") {
  return useFetch<RetentionExplainDTO>(
    `/api/admin/governance/explain?type=retention&schema=${schema}&table=${table}`,
  );
}

export function useTieringExplain(schema = "evt", table = "event") {
  return useFetch<TieringExplainDTO>(
    `/api/admin/governance/explain?type=tiering&schema=${schema}&table=${table}`,
  );
}

// ============================================================================
// Legal Holds
// ============================================================================

interface LegalHoldsResult extends UseFetchResult<LegalHoldDTO[]> {
  createHold: (input: {
    holdReference: string;
    holdSource: string;
    reason: string;
    scopeType?: string;
    targetSchema?: string;
    targetTable?: string;
    complianceFramework?: string;
  }) => Promise<{ holdId: string }>;
  releaseHold: (holdId: string, releaseReason: string) => Promise<void>;
}

export function useLegalHolds(): LegalHoldsResult {
  const result = useFetch<LegalHoldDTO[]>("/api/admin/governance/legal-holds");

  const createHold = useCallback(
    async (input: {
      holdReference: string;
      holdSource: string;
      reason: string;
      scopeType?: string;
      targetSchema?: string;
      targetTable?: string;
      complianceFramework?: string;
    }) => {
      const res = await finPost<{ success: boolean; data: { holdId: string } }>(
        "/api/admin/governance/legal-holds",
        input,
      );
      result.refresh();
      return res.data;
    },
    [result.refresh],
  );

  const releaseHold = useCallback(
    async (holdId: string, releaseReason: string) => {
      await finPost("/api/admin/governance/legal-holds?action=release", {
        holdId,
        releaseReason,
      });
      result.refresh();
    },
    [result.refresh],
  );

  return { ...result, createHold, releaseHold };
}

// ============================================================================
// Archive Lifecycle
// ============================================================================

interface ArchiveData {
  manifests: ArchiveManifestDTO[];
  purgeCertificates: PurgeCertificateDTO[];
  restoreRequests: RestoreRequestDTO[];
}

export function useArchiveLifecycle() {
  return useFetch<ArchiveData>("/api/admin/governance/archive");
}

// ============================================================================
// Quotas
// ============================================================================

export function useQuotas() {
  return useFetch<QuotaDTO[]>("/api/admin/governance/quotas");
}

// ============================================================================
// PII Inventory
// ============================================================================

interface PiiData {
  fields: PiiFieldDTO[];
  summary: PiiSummaryDTO;
}

export function usePiiInventory() {
  return useFetch<PiiData>("/api/admin/governance/pii-inventory");
}
