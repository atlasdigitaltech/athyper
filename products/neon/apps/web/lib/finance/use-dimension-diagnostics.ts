"use client";

// lib/finance/use-dimension-diagnostics.ts
//
// Data-fetching hooks for dimension engine admin diagnostics.
//   useDimensionResolutionMeta()  -> resolution audit trail for a target
//   useDimensionPolicyTrace()     -> policy match trace for a context
//   useDimensionOrphanScan()      -> orphaned/inactive dimension usage
//   useDimensionHashCompare()     -> compare two dimension set hashes

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type { DimensionResolutionMetaDTO } from "./types";

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useAsyncFetch<T>(url: string | null): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await finGet<T>(url, controller.signal);
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
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
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

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

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Resolution Meta — audit trail for a specific target
// ---------------------------------------------------------------------------

export function useDimensionResolutionMeta(
  targetKind: string | null,
  targetId: string | null,
): UseAsyncResult<DimensionResolutionMetaDTO> {
  const url =
    targetKind && targetId
      ? `/api/fin/admin/dimensions/resolution-meta?targetKind=${encodeURIComponent(targetKind)}&targetId=${encodeURIComponent(targetId)}`
      : null;

  return useAsyncFetch<DimensionResolutionMetaDTO>(url);
}

// ---------------------------------------------------------------------------
// Policy Trace — simulate policy evaluation for a posting context
// ---------------------------------------------------------------------------

export interface PolicyTraceContext {
  entityCode: string;
  accountCode?: string;
  accountType?: string;
  docType?: string;
  bookCode?: string;
  ouId?: string;
}

export interface PolicyTraceResult {
  matches: Array<{
    policyCode: string;
    policyVersion: number;
    dimensionTypeCode: string;
    behavior: string;
    fixedValueCode: string | null;
    deriveSource: string | null;
    scopeTier: number;
    priority: number;
  }>;
  effectiveBehaviors: Array<{
    dimensionTypeCode: string;
    effectiveBehavior: string;
    resolvedByPolicy: string;
    conflictsDetected: boolean;
  }>;
}

export function useDimensionPolicyTrace(
  ctx: PolicyTraceContext | null,
): UseAsyncResult<PolicyTraceResult> {
  let url: string | null = null;
  if (ctx) {
    const params = new URLSearchParams();
    params.set("entityCode", ctx.entityCode);
    if (ctx.accountCode) params.set("accountCode", ctx.accountCode);
    if (ctx.accountType) params.set("accountType", ctx.accountType);
    if (ctx.docType) params.set("docType", ctx.docType);
    if (ctx.bookCode) params.set("bookCode", ctx.bookCode);
    if (ctx.ouId) params.set("ouId", ctx.ouId);
    url = `/api/fin/admin/dimensions/policy-trace?${params.toString()}`;
  }

  return useAsyncFetch<PolicyTraceResult>(url);
}

// ---------------------------------------------------------------------------
// Orphan Scan — find dimension values referenced in sets but no longer active
// ---------------------------------------------------------------------------

export interface DimensionOrphanDTO {
  dimensionSetId: string;
  dimensionSetLabel: string;
  dimensionTypeCode: string;
  dimensionValueCode: string;
  dimensionValueName: string;
  valueStatus: string;
  referencedInBalances: number;
  referencedInJournalLines: number;
}

export function useDimensionOrphanScan(
  entityCode: string | null,
): UseAsyncResult<DimensionOrphanDTO[]> {
  const url = entityCode
    ? `/api/fin/admin/dimensions/orphan-scan?entityCode=${encodeURIComponent(entityCode)}`
    : null;

  return useAsyncFetch<DimensionOrphanDTO[]>(url);
}

// ---------------------------------------------------------------------------
// Hash Compare — compare two dimension sets side-by-side
// ---------------------------------------------------------------------------

export interface DimensionHashCompareDTO {
  setA: {
    id: string;
    displayLabel: string;
    hash: string;
    items: Array<{ typeCode: string; valueCode: string }>;
  };
  setB: {
    id: string;
    displayLabel: string;
    hash: string;
    items: Array<{ typeCode: string; valueCode: string }>;
  };
  added: Array<{ typeCode: string; valueCode: string }>;
  removed: Array<{ typeCode: string; valueCode: string }>;
  unchanged: Array<{ typeCode: string; valueCode: string }>;
}

export function useDimensionHashCompare(
  setIdA: string | null,
  setIdB: string | null,
): UseAsyncResult<DimensionHashCompareDTO> {
  const url =
    setIdA && setIdB
      ? `/api/fin/admin/dimensions/hash-compare?setA=${encodeURIComponent(setIdA)}&setB=${encodeURIComponent(setIdB)}`
      : null;

  return useAsyncFetch<DimensionHashCompareDTO>(url);
}
