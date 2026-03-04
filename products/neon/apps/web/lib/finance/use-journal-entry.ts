"use client";

// lib/finance/use-journal-entry.ts
//
// Data-fetching hook for a single journal entry with embedded lines.
// GET /api/fin/journal-entries/:id -> JournalEntryDTO (lines embedded)
//
// Follows the same useState + useEffect + useCallback + AbortController
// pattern established in use-entity-data.ts.

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type { JournalEntryDTO } from "./types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseJournalEntryResult {
  entry: JournalEntryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useJournalEntry(
  jeId: string | undefined,
): UseJournalEntryResult {
  const [entry, setEntry] = useState<JournalEntryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!jeId) {
      setEntry(null);
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
      const url = `/api/fin/journal-entries/${encodeURIComponent(jeId)}`;
      const data = await finGet<JournalEntryDTO>(url, controller.signal);

      if (controller.signal.aborted) return;

      setEntry(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load journal entry";
      setError(message);
      setEntry(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [jeId]);

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

  return { entry, loading, error, refresh };
}
