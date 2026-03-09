"use client";

// lib/finance/use-report-presets.ts
//
// Data-fetching + mutation hook for report presets (saved report configurations).
//
// GET    /api/fin/reporting/presets       — list visible presets
// POST   /api/fin/reporting/presets       — create
// PUT    /api/fin/reporting/presets/:id   — update
// DELETE /api/fin/reporting/presets/:id   — soft-delete

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost, finPut, finDelete } from "./fetcher";
import { cachedFetch, buildCacheKey, invalidateCachePrefix } from "./reporting-cache";

import type {
  ReportPresetDTO,
  ReportPresetCreateRequest,
  ReportPresetUpdateRequest,
  ReportPresetType,
} from "./reporting-types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseReportPresetsResult {
  presets: ReportPresetDTO[];
  loading: boolean;
  error: string | null;
  // Mutations
  createPreset: (req: ReportPresetCreateRequest) => Promise<ReportPresetDTO | null>;
  updatePreset: (id: string, req: ReportPresetUpdateRequest) => Promise<ReportPresetDTO | null>;
  deletePreset: (id: string) => Promise<boolean>;
  // Refresh list
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const PRESET_CACHE_PREFIX = "/api/fin/reporting/presets";

export function useReportPresets(
  reportType?: ReportPresetType,
): UseReportPresetsResult {
  const [presets, setPresets] = useState<ReportPresetDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchPresets = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (reportType) params.set("reportType", reportType);
      const url = `${PRESET_CACHE_PREFIX}?${params}`;

      const data = await cachedFetch(
        buildCacheKey(url),
        () => finGet<ReportPresetDTO[]>(url, controller.signal),
      );

      if (controller.signal.aborted) return;
      setPresets(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;

      const message =
        err instanceof FinanceHttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load presets";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [reportType]);

  useEffect(() => {
    fetchPresets();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPresets, refreshCounter.current]);

  const invalidateAndRefresh = useCallback(() => {
    invalidateCachePrefix(PRESET_CACHE_PREFIX);
    refreshCounter.current += 1;
    fetchPresets();
  }, [fetchPresets]);

  const createPreset = useCallback(
    async (req: ReportPresetCreateRequest): Promise<ReportPresetDTO | null> => {
      try {
        const created = await finPost<ReportPresetDTO>(
          PRESET_CACHE_PREFIX,
          req,
        );
        invalidateAndRefresh();
        return created;
      } catch (err) {
        const message =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to create preset";
        setError(message);
        return null;
      }
    },
    [invalidateAndRefresh],
  );

  const updatePreset = useCallback(
    async (
      id: string,
      req: ReportPresetUpdateRequest,
    ): Promise<ReportPresetDTO | null> => {
      try {
        const updated = await finPut<ReportPresetDTO>(
          `${PRESET_CACHE_PREFIX}/${id}`,
          req,
        );
        invalidateAndRefresh();
        return updated;
      } catch (err) {
        const message =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to update preset";
        setError(message);
        return null;
      }
    },
    [invalidateAndRefresh],
  );

  const deletePreset = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await finDelete(`${PRESET_CACHE_PREFIX}/${id}`);
        invalidateAndRefresh();
        return true;
      } catch (err) {
        const message =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to delete preset";
        setError(message);
        return false;
      }
    },
    [invalidateAndRefresh],
  );

  return {
    presets,
    loading,
    error,
    createPreset,
    updatePreset,
    deletePreset,
    refresh: invalidateAndRefresh,
  };
}
