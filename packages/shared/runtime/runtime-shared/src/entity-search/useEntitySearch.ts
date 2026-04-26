"use client";

/**
 * useEntitySearch — headless hook for relay-backed entity search.
 *
 * Manages debounce (300ms), AbortController, options state, and loading state.
 * Calls GET /api/relay/api/records/{entityCode}?q=...&limit=...&{extraParams}
 *
 * Returns the search dispatcher and result state to wire into AsyncCombobox
 * or any other controlled combobox UI.
 */

import { useCallback, useRef, useState } from "react";
import type { EntityPickerOption } from "./EntityPicker";

export interface UseEntitySearchOptions {
  entityCode: string | null;
  /** Extra query params appended to every search request. */
  searchParams?: Record<string, string>;
  limit?: number;
}

export interface UseEntitySearchResult {
  options: EntityPickerOption[];
  loading: boolean;
  /** Call this when the query changes (pass to AsyncCombobox onQueryChange). */
  onQueryChange: (query: string) => void;
  /** Call this on popover open to pre-fetch (for loadOnOpen mode). */
  onOpen: () => void;
}

function rowToOption(row: Record<string, unknown>): EntityPickerOption {
  const keys = Object.keys(row);
  const nameKey = keys.find((k) => k !== "id" && k.endsWith("_name"));
  const label = nameKey && row[nameKey]
    ? String(row[nameKey])
    : row["name"]
      ? String(row["name"])
      : String(row["code"] ?? row["id"] ?? "").slice(0, 8);
  return {
    value: String(row["id"] ?? ""),
    label,
    description: row["code"] ? String(row["code"]) : undefined,
  };
}

export function useEntitySearch({
  entityCode,
  searchParams,
  limit = 20,
}: UseEntitySearchOptions): UseEntitySearchResult {
  const [options, setOptions] = useState<EntityPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const runSearch = useCallback(
    (query: string, immediate = false) => {
      if (!entityCode) {
        setOptions([]);
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);

      const delay = immediate ? 0 : 300;
      debounceRef.current = setTimeout(async () => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        try {
          const params = new URLSearchParams({ q: query, limit: String(limit) });
          if (searchParams) {
            Object.entries(searchParams).forEach(([k, v]) => params.set(k, v));
          }
          const res = await fetch(
            `/api/relay/api/records/${encodeURIComponent(entityCode)}?${params}`,
            { signal: abortRef.current.signal },
          );
          if (!res.ok) { setOptions([]); return; }
          const body = await res.json() as { data?: Record<string, unknown>[] };
          if (!abortRef.current.signal.aborted) {
            setOptions((body.data ?? []).map(rowToOption));
          }
        } catch (err) {
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            setOptions([]);
          }
        } finally {
          if (!abortRef.current?.signal.aborted) setLoading(false);
        }
      }, delay);
    },
    [entityCode, searchParams, limit],
  );

  const onQueryChange = useCallback(
    (query: string) => {
      if (!query) { setOptions([]); setLoading(false); return; }
      runSearch(query);
    },
    [runSearch],
  );

  const onOpen = useCallback(() => runSearch("", true), [runSearch]);

  return { options, loading, onQueryChange, onOpen };
}
