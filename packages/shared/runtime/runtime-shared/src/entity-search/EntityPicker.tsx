"use client";

/**
 * EntityPicker — Layer-2 entity-aware search picker.
 *
 * Two modes:
 *   Standard  — pass `entityCode`. Fetches from relay automatically.
 *               Uses GET /api/relay/api/records/{entityCode}?q=...
 *   Custom    — pass `search` callback. Caller owns fetch/debounce logic.
 *
 * Renders AsyncCombobox from @athyper/ui/composites.
 * Layer boundary: this is Layer 2 (runtime-shared). Do NOT import from
 * Layer 3 (entity-runtime) or Layer 4 (document-runtime).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AsyncCombobox } from "@athyper/ui/composites";
import { useEntitySearch } from "./useEntitySearch";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EntityPickerOption {
  value: string;
  label: string;
  description?: string;
}

export interface EntityPickerProps {
  value?: string | null;
  /** Resolved display label for the current value (resolved by caller). */
  displayLabel?: string | null;
  onChange?: (value: string | null) => void;

  // ── Mode A: standard relay-backed search ──────────────────────────────────
  entityCode?: string | null;
  /** Extra query params appended to every search request (Mode A only). */
  searchParams?: Record<string, string>;

  // ── Mode B: custom search override ───────────────────────────────────────
  /** Custom async search. When provided, entityCode/searchParams are ignored. */
  search?: (query: string) => Promise<EntityPickerOption[]>;

  /** Load options immediately on open without waiting for user input. */
  loadOnOpen?: boolean;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const EntityPicker = forwardRef<HTMLDivElement, EntityPickerProps>(
  (
    {
      value,
      displayLabel,
      onChange,
      entityCode,
      searchParams,
      search,
      loadOnOpen = false,
      placeholder = "Search records…",
      disabled,
      clearable = true,
      error,
      className,
      id,
    },
    ref,
  ) => {
    const isCustomMode = typeof search === "function";

    // ── Standard mode (entityCode) ─────────────────────────────────────────
    const {
      options: relayOptions,
      loading: relayLoading,
      onQueryChange: relayQueryChange,
      onOpen: relayOnOpen,
    } = useEntitySearch({ entityCode: isCustomMode ? null : (entityCode ?? null), searchParams });

    // ── Custom mode (search callback) ──────────────────────────────────────
    const [customOptions, setCustomOptions] = useState<EntityPickerOption[]>([]);
    const [customLoading, setCustomLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const abortRef = useRef<AbortController | null>(null);

    const runCustomSearch = useCallback(
      (query: string, immediate = false) => {
        if (!search) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setCustomLoading(true);
        const delay = immediate ? 0 : 300;
        debounceRef.current = setTimeout(async () => {
          abortRef.current?.abort();
          abortRef.current = new AbortController();
          try {
            const results = await search(query);
            if (!abortRef.current.signal.aborted) setCustomOptions(results);
          } catch (err) {
            if (!(err instanceof DOMException && err.name === "AbortError")) {
              setCustomOptions([]);
            }
          } finally {
            if (!abortRef.current?.signal.aborted) setCustomLoading(false);
          }
        }, delay);
      },
      [search],
    );

    const customQueryChange = useCallback(
      (query: string) => {
        if (!query) { setCustomOptions([]); setCustomLoading(false); return; }
        runCustomSearch(query);
      },
      [runCustomSearch],
    );

    const customOnOpen = useCallback(
      () => runCustomSearch("", true),
      [runCustomSearch],
    );

    // ── Unified handlers ───────────────────────────────────────────────────
    const options = isCustomMode ? customOptions : relayOptions;
    const loading = isCustomMode ? customLoading : relayLoading;
    const handleQueryChange = isCustomMode ? customQueryChange : relayQueryChange;
    const handleOpen = isCustomMode ? customOnOpen : relayOnOpen;

    return (
      <AsyncCombobox
        ref={ref}
        id={id}
        value={value}
        displayLabel={displayLabel}
        onChange={onChange}
        options={options}
        loading={loading}
        onQueryChange={handleQueryChange}
        onOpen={loadOnOpen ? handleOpen : undefined}
        placeholder={placeholder}
        disabled={disabled}
        clearable={clearable}
        error={error}
        className={className}
      />
    );
  },
);

EntityPicker.displayName = "EntityPicker";
