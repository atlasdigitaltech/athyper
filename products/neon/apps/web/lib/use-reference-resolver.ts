"use client";

/**
 * Reference Resolver Hook
 *
 * Resolves FK UUID values to human-readable display names.
 *
 * Supports two resolution modes:
 *   1. Pre-resolved refs cache (from list API response) — no API call needed
 *   2. On-demand batch resolution via POST /api/lookup/resolve
 *
 * Module-level cache prevents redundant API calls for the same UUIDs.
 */

import { useEffect, useState } from "react";

import type { RefsCache, ResolvedRef } from "@/lib/entity-projection";
import type { SessionBootstrap } from "@/lib/session-bootstrap";
import type { FieldMeta } from "@/lib/use-entity-fields";

// ============================================================================
// Types
// ============================================================================

interface RefGroup {
  schema: string;
  table: string;
  ids: string[];
}

interface LookupConfig {
  refSchema?: string;
  refTable?: string;
}

// ============================================================================
// Module-Level Cache: "schema.table:uuid" → displayName
// ============================================================================

const resolvedCache = new Map<string, string>();

// ============================================================================
// CSRF Helper
// ============================================================================

function getCsrfToken(): string {
  if (typeof window === "undefined") return "";
  const bootstrap = (window as any).__SESSION_BOOTSTRAP__ as
    | SessionBootstrap
    | undefined;
  return bootstrap?.csrfToken ?? "";
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Resolves FK references for a single record.
 *
 * @param fields - Field metadata with lookupConfig
 * @param record - The data record containing FK UUIDs
 * @param preResolvedRefs - Optional pre-resolved refs cache from list API response
 */
export function useReferenceResolver(
  fields: FieldMeta[] | null,
  record: Record<string, unknown> | null,
  preResolvedRefs?: RefsCache,
): {
  resolvedRefs: Map<string, string>;
  loading: boolean;
} {
  const [resolvedRefs, setResolvedRefs] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fields || !record) return;

    // If pre-resolved refs are provided (from list API), extract labels directly
    if (preResolvedRefs && Object.keys(preResolvedRefs).length > 0) {
      const result = extractFromRefsCache(fields, record, preResolvedRefs);
      if (result.size > 0) {
        setResolvedRefs(result);
        return;
      }
    }

    // Collect FK fields that need resolution
    const refGroups = new Map<
      string,
      { schema: string; table: string; ids: string[]; columns: string[] }
    >();
    const immediateResolved = new Map<string, string>();

    for (const field of fields) {
      const lc = field.lookupConfig as LookupConfig | null;
      if (!lc?.refSchema || !lc?.refTable) continue;

      const val = record[field.columnName];
      if (!val || typeof val !== "string") continue;

      // Check module cache first
      const cacheKey = `${lc.refSchema}.${lc.refTable}:${val}`;
      const cached = resolvedCache.get(cacheKey);
      if (cached) {
        immediateResolved.set(field.columnName, cached);
        continue;
      }

      // Group by target table for batched resolution
      const groupKey = `${lc.refSchema}.${lc.refTable}`;
      const existing = refGroups.get(groupKey);
      if (existing) {
        if (!existing.ids.includes(val)) existing.ids.push(val);
        existing.columns.push(field.columnName);
      } else {
        refGroups.set(groupKey, {
          schema: lc.refSchema,
          table: lc.refTable,
          ids: [val],
          columns: [field.columnName],
        });
      }
    }

    // If everything was in cache, set immediately
    if (refGroups.size === 0) {
      if (immediateResolved.size > 0) {
        setResolvedRefs(immediateResolved);
      }
      return;
    }

    // Build refs array for the batch API
    const refs: RefGroup[] = [];
    for (const [, group] of refGroups) {
      refs.push({ schema: group.schema, table: group.table, ids: group.ids });
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const csrfToken = getCsrfToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (csrfToken) headers["x-csrf-token"] = csrfToken;

        const res = await fetch("/api/lookup/resolve", {
          method: "POST",
          headers,
          credentials: "same-origin",
          body: JSON.stringify({ refs }),
        });

        if (!res.ok || cancelled) return;

        const json = (await res.json()) as {
          data?: Record<string, Record<string, ResolvedRef | string>>;
        };
        const data = json.data;
        if (!data || cancelled) return;

        // Build the resolved map (start with cached entries)
        const result = new Map<string, string>(immediateResolved);

        for (const [, group] of refGroups) {
          const tableKey = `${group.schema}.${group.table}`;
          const tableMap = data[tableKey];
          if (!tableMap) continue;

          for (const col of group.columns) {
            const val = record[col] as string;
            const entry = tableMap[val];
            if (!entry) continue;

            // Support both ResolvedRef { id, label } and legacy string format
            const displayName = typeof entry === "string" ? entry : entry.label;
            if (displayName) {
              result.set(col, displayName);
              resolvedCache.set(`${tableKey}:${val}`, displayName);
            }
          }
        }

        if (!cancelled) {
          setResolvedRefs(result);
        }
      } catch {
        // Best-effort: UUIDs still shown if resolution fails
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fields, record, preResolvedRefs]);

  return { resolvedRefs, loading };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract resolved labels from a pre-resolved RefsCache (from list API response).
 * Also populates the module-level cache for future lookups.
 */
function extractFromRefsCache(
  fields: FieldMeta[],
  record: Record<string, unknown>,
  refsCache: RefsCache,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const field of fields) {
    const lc = field.lookupConfig as LookupConfig | null;
    if (!lc?.refSchema || !lc?.refTable) continue;

    const val = record[field.columnName];
    if (!val || typeof val !== "string") continue;

    const tableKey = `${lc.refSchema}.${lc.refTable}`;
    const tableRefs = refsCache[tableKey];
    if (!tableRefs) continue;

    const resolved = tableRefs[val];
    if (resolved) {
      result.set(field.columnName, resolved.label);
      // Populate module cache
      resolvedCache.set(`${tableKey}:${val}`, resolved.label);
    }
  }

  return result;
}
