"use client";

// lib/finance/use-related-documents.ts
//
// Data-fetching hook for related financial documents.
// GET /api/fin/documents/related?docId=&docType=&entityCode=

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type { RelatedDocumentDTO } from "./types";

export interface UseRelatedDocumentsResult {
  documents: RelatedDocumentDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRelatedDocuments(
  docId: string | undefined,
  docType: string | undefined,
  entityCode: string | undefined,
): UseRelatedDocumentsResult {
  const [documents, setDocuments] = useState<RelatedDocumentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!docId || !docType || !entityCode) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ docId, docType, entityCode });
      const data = await finGet<{ items: RelatedDocumentDTO[]; total: number }>(
        `/api/fin/documents/related?${params}`,
        controller.signal,
      );

      if (controller.signal.aborted) return;
      setDocuments(data.items);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load related documents";
      setError(message);
      setDocuments([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [docId, docType, entityCode]);

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

  return { documents, loading, error, refresh };
}
