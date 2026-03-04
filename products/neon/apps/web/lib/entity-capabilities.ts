"use client";

/**
 * Entity Capabilities Client Hook
 *
 * Fetches capabilities for a single entity type from the BFF.
 * Module-level cache prevents redundant fetches across components.
 *
 * Usage:
 *   const { capabilities, loading, error } = useEntityCapabilities("purchase_order");
 */

import { useState, useEffect } from "react";

// ============================================================================
// Client-Side Capability Types (mirrors server-side types)
// ============================================================================

export type OperationSurface =
  | "LIST"
  | "DETAIL"
  | "BOTH"
  | "PALETTE_ONLY"
  | "HIDDEN";
export type OperationPlacement =
  | "PRIMARY"
  | "TOOLBAR"
  | "OVERFLOW"
  | "CONTEXT"
  | "COMMAND";
export type HandlerType = "NAVIGATE" | "API" | "MODAL" | "INLINE";

export interface EntityCapabilities {
  entityKey: string;
  entityName: string;
  entityShort: string | null;
  entityKind: string;
  governanceLevel: string;
  operations: EntityOperationDescriptor[];
  routes: EntityRoutes;
  permissions: Record<string, string>;
  tabs: TabHint[];
}

export interface EntityOperationDescriptor {
  code: string;
  categoryCode: string;
  label: string;
  icon: string | null;
  canonicalCode: string;
  aliases: string[];
  tcode: string | null;
  surface: OperationSurface;
  placement: OperationPlacement;
  handlerType: HandlerType;
  handlerTarget: string | null;
  requiresRecord: boolean;
  permissionKey: string;
  route: string | null;
  isTenantOverride: boolean;
}

export interface EntityRoutes {
  list: string;
  create: string;
  detail: string;
}

export interface TabHint {
  code: string;
  label: string;
  isEnabled: boolean;
}

// ============================================================================
// Module-Level Cache
// ============================================================================

const cache = new Map<string, EntityCapabilities>();
const inflight = new Map<string, Promise<EntityCapabilities | null>>();

async function fetchEntityCapabilities(
  entityKey: string,
): Promise<EntityCapabilities | null> {
  // Check module-level cache
  const cached = cache.get(entityKey);
  if (cached) return cached;

  // Deduplicate in-flight requests
  const existing = inflight.get(entityKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/entity-capabilities/${encodeURIComponent(entityKey)}`,
      );
      if (!res.ok) return null;

      const json = (await res.json()) as { data?: EntityCapabilities };
      const data = json.data ?? null;
      if (data) {
        cache.set(entityKey, data);
      }
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(entityKey);
    }
  })();

  inflight.set(entityKey, promise);
  return promise;
}

// ============================================================================
// Hook
// ============================================================================

export function useEntityCapabilities(entityKey: string): {
  capabilities: EntityCapabilities | null;
  loading: boolean;
  error: string | null;
} {
  const [capabilities, setCapabilities] = useState<EntityCapabilities | null>(
    () => cache.get(entityKey) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(entityKey));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityKey) return;

    // Sync read from cache
    const cached = cache.get(entityKey);
    if (cached) {
      setCapabilities(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchEntityCapabilities(entityKey).then((result) => {
      if (cancelled) return;
      setCapabilities(result);
      setLoading(false);
      if (!result) {
        setError(`Failed to load capabilities for ${entityKey}`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [entityKey]);

  return { capabilities, loading, error };
}

/**
 * Invalidate the module-level cache for an entity (or all entities).
 * Call this after admin changes to entity_operation rows.
 */
export function invalidateCapabilitiesCache(entityKey?: string): void {
  if (entityKey) {
    cache.delete(entityKey);
  } else {
    cache.clear();
  }
}
