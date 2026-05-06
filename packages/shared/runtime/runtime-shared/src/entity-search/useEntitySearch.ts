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
import type { EntityPickerOption, EntityPickerOptionConfig } from "./EntityPicker";

export interface UseEntitySearchOptions {
  entityCode: string | null;
  /** Extra query params appended to every search request. */
  searchParams?: Record<string, string>;
  optionConfig?: EntityPickerOptionConfig;
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

function textValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function firstText(row: Record<string, unknown>, keys: Array<string | undefined>): string | undefined {
  for (const key of keys) {
    if (!key) continue;
    const value = textValue(row[key]);
    if (value) return value;
  }
  return undefined;
}

function sameText(left: string | undefined, right: string | undefined): boolean {
  return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

export function entityRowToPickerOption(
  row: Record<string, unknown>,
  entityCode: string | null,
  optionConfig?: EntityPickerOptionConfig,
): EntityPickerOption {
  const keys = Object.keys(row);
  const normalizedEntityCode = entityCode?.replace(/-/g, "_");
  const nameKey = keys.find((k) => k !== "id" && k.endsWith("_name"));
  const entityNameKey = normalizedEntityCode ? `${normalizedEntityCode}_name` : undefined;
  const codeKey = normalizedEntityCode ? `${normalizedEntityCode}_code` : undefined;
  const rawCode = firstText(row, [
    optionConfig?.codeField ?? undefined,
    codeKey,
    "code",
    "document_no",
    "document_number",
    "number",
  ]);
  const label = firstText(row, [
    optionConfig?.labelField ?? undefined,
    entityNameKey,
    "name",
    "display_name",
    "title",
    nameKey,
  ])
    ?? rawCode
    ?? textValue(row["id"])?.slice(0, 8)
    ?? "";
  const description = firstText(row, [
    optionConfig?.descriptionField ?? undefined,
    "description",
    "display_description",
    "short_description",
    "long_description",
    "summary",
  ]);
  const code = optionConfig?.showCode === false || sameText(rawCode, label) ? undefined : rawCode;
  const normalizedDescription = optionConfig?.showDescription === false
    || sameText(description, label)
    || sameText(description, rawCode)
    ? undefined
    : description;
  const recordId = firstText(row, [
    optionConfig?.recordIdField ?? undefined,
    optionConfig?.codeField ?? undefined,
    codeKey,
    "code",
    "document_no",
    "document_number",
    "number",
  ]);

  return {
    value: String(row["id"] ?? ""),
    label,
    code,
    description: normalizedDescription,
    recordId,
  };
}

export function useEntitySearch({
  entityCode,
  searchParams,
  optionConfig,
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
            setOptions((body.data ?? []).map((row) => entityRowToPickerOption(row, entityCode, optionConfig)));
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
    [entityCode, searchParams, optionConfig, limit],
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
