"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ModelCatalogSchema,
  type ModelCatalog,
} from "@athyper/atlas-agent-runtime";

const CATALOG_ENDPOINT = "/api/relay/ai/agent/models";
export const ATLAS_CATALOG_REFRESH_INTERVAL_MS = 60_000;

export interface UseAtlasCatalogResult {
  catalog: ModelCatalog | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface CatalogSnapshot {
  scopeHash: string;
  catalog: ModelCatalog | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Catalog state is tagged with the session scope that produced it. A render
 * for a new tenant/principal/plane/auth epoch can therefore never observe a
 * previous scope's catalog, even before the refetch effect runs.
 */
export function useAtlasCatalog(scopeHash: string): UseAtlasCatalogResult {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>(() => ({
    scopeHash,
    catalog: null,
    loading: true,
    error: null,
  }));
  const requestRef = useRef<AbortController | null>(null);

  const fetchCatalog = useCallback(async (background = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSnapshot((current) => (
      background && current.scopeHash === scopeHash
        ? { ...current, error: null }
        : {
            scopeHash,
            catalog: null,
            loading: true,
            error: null,
          }
    ));

    try {
      const response = await fetch(CATALOG_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Atlas catalog request failed (${response.status})`);
      }
      const parsed = ModelCatalogSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Atlas catalog response did not match the supported contract");
      }
      if (!controller.signal.aborted) {
        setSnapshot({
          scopeHash,
          catalog: parsed.data,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSnapshot({
          scopeHash,
          catalog: null,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [scopeHash]);
  const refetch = useCallback(() => fetchCatalog(), [fetchCatalog]);

  useEffect(() => {
    void fetchCatalog();
    const refreshTimer = window.setInterval(() => {
      void fetchCatalog(true);
    }, ATLAS_CATALOG_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(refreshTimer);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [fetchCatalog]);

  if (snapshot.scopeHash !== scopeHash) {
    return {
      catalog: null,
      loading: true,
      error: null,
      refetch,
    };
  }

  return {
    catalog: snapshot.catalog,
    loading: snapshot.loading,
    error: snapshot.error,
    refetch,
  };
}
