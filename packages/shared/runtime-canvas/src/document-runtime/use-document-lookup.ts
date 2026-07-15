"use client";

/**
 * @athyper/runtime-canvas — useDocumentLookup
 *
 * Cleanup Plan v5 §4.6 + §5.6 + amendment 5.
 *
 * Fetches an allow-listed lookup by code. The server-side route
 * (`/api/runtime/v1/lookups/<lookup_code>`) resolves the code
 * against `control.document_lookup` and applies authoritative
 * `base_filters` that the caller cannot bypass.
 *
 * Typical consumers:
 *   - Discount drawer's condition-type picker  (lookup_code = "pi_discount_condition_types")
 *   - Tax drawer's tax-group picker             (lookup_code = "pi_tax_groups")
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";

// ─── Public types ────────────────────────────────────────────────────

export interface UseDocumentLookupOptions {
  /** Allow-listed code from `control.document_lookup`. */
  lookupCode: string;
  /**
   * Optional caller filters merged into the request. Server-side
   * `base_filters` always wins on key conflict.
   */
  filters?: Readonly<Record<string, string>>;
  /** Tanstack Query enable flag. Default `true`. */
  enabled?: boolean;
  /** Per-query stale time. Default 5 minutes (lookups change rarely). */
  staleTimeMs?: number;
}

export interface DocumentLookupResult {
  records:   ReadonlyArray<RuntimeRecordRow>;
  isLoading: boolean;
  isError:   boolean;
  error:     Error | null;
  onRefresh: () => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useDocumentLookup(opts: UseDocumentLookupOptions): DocumentLookupResult {
  const { lookupCode, filters, enabled = true, staleTimeMs = 5 * 60_000 } = opts;

  // Serialize filters into a deterministic key so identical-shape calls
  // share the cache.
  const filterKey = filters ? Object.entries(filters).sort().map(([k, v]) => `${k}=${v}`).join("&") : "";

  const query: UseQueryResult<ReadonlyArray<RuntimeRecordRow>, Error> = useQuery({
    queryKey: ["doc-lookup", lookupCode, filterKey],
    queryFn:  async () => {
      const params = new URLSearchParams(filters);
      const base = runtimePath.lookup(lookupCode);
      const url = params.toString().length > 0 ? `${base}?${params.toString()}` : base;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `${lookupCode}: ${res.status}`);
      }
      const body = await res.json() as { records?: ReadonlyArray<RuntimeRecordRow> };
      return Array.isArray(body.records) ? body.records : [];
    },
    enabled,
    staleTime: staleTimeMs,
  });

  return {
    records:   query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error ?? null,
    onRefresh: async () => { await query.refetch(); },
  };
}
