"use client";

/**
 * All Entity Capabilities Hook (Lazy-Loaded)
 *
 * Fetches capabilities for ALL active entities from the BFF.
 * Designed for the command palette: lazy-loads on first Ctrl+K,
 * not on mount. Caches after first fetch.
 *
 * Usage:
 *   const { all, loading, load } = useAllEntityCapabilities();
 *   // In command palette open handler:
 *   useEffect(() => { if (paletteOpen) load(); }, [paletteOpen]);
 */

import { useState, useCallback, useRef } from "react";

import type { EntityCapabilities } from "./entity-capabilities";

// ============================================================================
// Module-Level Cache
// ============================================================================

let allCache: EntityCapabilities[] | null = null;
let allInflight: Promise<EntityCapabilities[]> | null = null;

async function fetchAllCapabilities(): Promise<EntityCapabilities[]> {
  if (allCache) return allCache;
  if (allInflight) return allInflight;

  const promise = (async () => {
    try {
      const res = await fetch("/api/entity-capabilities");
      if (!res.ok) return [];

      const json = (await res.json()) as { data?: EntityCapabilities[] };
      const data = json.data ?? [];
      allCache = data;
      return data;
    } catch {
      return [];
    } finally {
      allInflight = null;
    }
  })();

  allInflight = promise;
  return promise;
}

// ============================================================================
// Hook
// ============================================================================

export function useAllEntityCapabilities(): {
  all: EntityCapabilities[];
  loading: boolean;
  load: () => void;
} {
  const [all, setAll] = useState<EntityCapabilities[]>(() => allCache ?? []);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(allCache !== null);

  const load = useCallback(() => {
    // Skip if already loaded or loading
    if (loadedRef.current || loading) return;

    setLoading(true);
    fetchAllCapabilities().then((result) => {
      setAll(result);
      setLoading(false);
      loadedRef.current = true;
    });
  }, [loading]);

  return { all, loading, load };
}

/**
 * Invalidate the all-entities cache.
 * Call this after admin changes to entity_operation rows.
 */
export function invalidateAllCapabilitiesCache(): void {
  allCache = null;
}
