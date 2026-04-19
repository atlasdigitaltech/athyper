"use client";

/**
 * Global cross-entity search hook.
 *
 * Wraps the /api/search BFF route (Meilisearch-backed). Tenant isolation
 * is enforced server-side by a JWT tenant token minted per request —
 * the client cannot widen scope.
 *
 * Usage:
 *   const { data, isLoading } = useGlobalSearch(query, { entityType: "invoice" });
 *
 * Empty or short queries (< 2 chars) short-circuit to a disabled query,
 * avoiding useless round-trips while the user is still typing.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { bffFetch } from "@/lib/bff-fetch";

// ─── Response types ─────────────────────────────────────────────────────────

export interface SearchHit {
  id:          string;   // format: "<entity_type>:<uuid>"
  entity_type: string;
  entity_id:   string;
  title:       string;
  summary?:    string;
  status?:     string;
  tags?:       string[];
  updated_at:  number;
  [key: string]: unknown;
}

export interface SearchResponse {
  hits:          SearchHit[];
  total:         number;
  page:          number;
  page_size:     number;
  processing_ms: number;
}

export interface UseGlobalSearchOptions {
  entityType?: string | string[];
  page?:       number;
  pageSize?:   number;
  sort?:       "relevance" | "updated_desc" | "title_asc";
  /** Override the default 2-char minimum before firing the query. */
  minChars?:   number;
  /** Stale time in ms. Default: 30 s. */
  staleTimeMs?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGlobalSearch(
  q:       string,
  options: UseGlobalSearchOptions = {},
): ReturnType<typeof useQuery<SearchResponse>> {
  const {
    entityType,
    page      = 1,
    pageSize  = 20,
    sort      = "relevance",
    minChars  = 2,
    staleTimeMs = 30_000,
  } = options;

  const trimmed = q.trim();
  const enabled = trimmed.length >= minChars;

  const entityTypeParam = Array.isArray(entityType)
    ? entityType.join(",")
    : entityType;

  const queryOptions: UseQueryOptions<SearchResponse> = {
    queryKey: queryKeys.search.global({
      q:           trimmed,
      entity_type: entityTypeParam,
      page,
      page_size:   pageSize,
      sort,
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        q:          trimmed,
        page:       String(page),
        page_size:  String(pageSize),
        sort,
      });
      if (entityTypeParam) params.set("entity_type", entityTypeParam);
      return bffFetch<SearchResponse>(`/api/search?${params.toString()}`);
    },
    enabled,
    staleTime: staleTimeMs,
  };

  return useQuery(queryOptions);
}
