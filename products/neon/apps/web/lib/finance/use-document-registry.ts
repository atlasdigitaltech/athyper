// lib/finance/use-document-registry.ts
//
// Data fetching hooks for the financial document registry workbench.
// Follows the established useXxxList() pattern with AbortController + finGet.

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { finGet } from "./fetcher";

import type {
  FinancialDocumentSummary,
  FinancialDocumentDTO,
  FinancialDocumentFilters,
  FinancialDocumentPostingDTO,
  PostingInconsistencyDTO,
  RegistryStatsDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// useDocumentRegistryList
// ---------------------------------------------------------------------------

export interface DocumentRegistryListOptions extends FinancialDocumentFilters {
  limit?: number;
  offset?: number;
  sort?: string;
  dir?: "asc" | "desc";
}

interface DocumentRegistryListResult {
  items: FinancialDocumentSummary[];
  total: number;
  hasMore: boolean;
}

export function useDocumentRegistryList(
  options: DocumentRegistryListOptions,
): UseQueryResult<DocumentRegistryListResult> {
  const [data, setData] = useState<DocumentRegistryListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const optionsKey = JSON.stringify(options);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.limit) params.set("limit", String(options.limit));
      if (options.offset) params.set("offset", String(options.offset));
      if (options.sort) params.set("sort", options.sort);
      if (options.dir) params.set("dir", options.dir);
      if (options.entityCode) params.set("entityCode", options.entityCode);
      if (options.search) params.set("search", options.search);
      if (options.txnId) params.set("txnId", options.txnId);
      if (options.bookCode) params.set("bookCode", options.bookCode);
      if (options.counterpartyId) params.set("counterpartyId", options.counterpartyId);
      if (options.createdBy) params.set("createdBy", options.createdBy);
      if (options.hasJeId !== undefined) params.set("hasJeId", String(options.hasJeId));
      if (options.hasApprovalEvidence !== undefined)
        params.set("hasApprovalEvidence", String(options.hasApprovalEvidence));
      if (options.postingDateFrom) params.set("postingDateFrom", options.postingDateFrom);
      if (options.postingDateTo) params.set("postingDateTo", options.postingDateTo);
      if (options.docDateFrom) params.set("docDateFrom", options.docDateFrom);
      if (options.docDateTo) params.set("docDateTo", options.docDateTo);

      // Array filters
      if (options.docType) {
        const types = Array.isArray(options.docType) ? options.docType : [options.docType];
        types.forEach((t) => params.append("docType", t));
      }
      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        statuses.forEach((s) => params.append("status", s));
      }
      if (options.counterpartyType) params.set("counterpartyType", options.counterpartyType);
      if (options.approvalRoute) params.set("approvalRoute", options.approvalRoute);

      const qs = params.toString();
      const url = `/api/fin/document-registry${qs ? `?${qs}` : ""}`;
      const result = await finGet<DocumentRegistryListResult>(url, controller.signal);
      if (controller.signal.aborted) return;
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (abortRef.current?.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to fetch document registry");
      setData(null);
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useDocumentRegistryDetail
// ---------------------------------------------------------------------------

export function useDocumentRegistryDetail(
  id: string | null,
): UseQueryResult<FinancialDocumentDTO> {
  const [data, setData] = useState<FinancialDocumentDTO | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!id) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await finGet<FinancialDocumentDTO>(
        `/api/fin/document-registry/${id}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (abortRef.current?.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to fetch document");
      setData(null);
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useDocumentPostings — multi-book posting bridge
// ---------------------------------------------------------------------------

export function useDocumentPostings(
  docId: string | null,
): UseQueryResult<FinancialDocumentPostingDTO[]> {
  const [data, setData] = useState<FinancialDocumentPostingDTO[] | null>(null);
  const [loading, setLoading] = useState(!!docId);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!docId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await finGet<{ data: FinancialDocumentPostingDTO[] }>(
        `/api/fin/document-registry/${docId}/postings`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData(result.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (abortRef.current?.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to fetch postings");
      setData(null);
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useRegistryStats
// ---------------------------------------------------------------------------

export function useRegistryStats(
  entityCode: string,
): UseQueryResult<RegistryStatsDTO> {
  const [data, setData] = useState<RegistryStatsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await finGet<RegistryStatsDTO>(
        `/api/fin/document-registry/stats?entityCode=${encodeURIComponent(entityCode)}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (abortRef.current?.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
      setData(null);
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, [entityCode]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useRegistryCompliance — posting inconsistencies
// ---------------------------------------------------------------------------

export function useRegistryCompliance(
  entityCode: string,
): UseQueryResult<PostingInconsistencyDTO[]> {
  const [data, setData] = useState<PostingInconsistencyDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await finGet<{ data: PostingInconsistencyDTO[] }>(
        `/api/fin/document-registry/compliance?entityCode=${encodeURIComponent(entityCode)}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setData(result.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (abortRef.current?.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to fetch compliance data");
      setData(null);
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, [entityCode]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}
