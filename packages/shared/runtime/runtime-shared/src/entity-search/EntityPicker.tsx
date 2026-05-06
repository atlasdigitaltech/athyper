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
  useRef,
  useState,
} from "react";
import { AsyncCombobox } from "@athyper/ui/composites";
import { useEntitySearch } from "./useEntitySearch";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EntityPickerOption {
  value: string;
  label: string;
  code?: string;
  description?: string;
  /** URL-safe record identifier when it differs from the stored reference value. */
  recordId?: string;
}

export interface EntityPickerOptionConfig {
  labelField?: string | null;
  codeField?: string | null;
  descriptionField?: string | null;
  recordIdField?: string | null;
  showCode?: boolean;
  showDescription?: boolean;
  showViewAction?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textConfig(value: unknown): string | null | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolConfig(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function resolveEntityPickerOptionConfig(referenceConfig: unknown): EntityPickerOptionConfig | undefined {
  const config = asRecord(referenceConfig);
  if (!config) return undefined;
  const picker = asRecord(config["picker"]);

  return {
    labelField:       textConfig(picker?.["label_field"] ?? config["label_field"] ?? config["display_field"]),
    codeField:        textConfig(picker?.["code_field"] ?? config["code_field"]),
    descriptionField: textConfig(picker?.["description_field"] ?? config["description_field"]),
    recordIdField:    textConfig(
      picker?.["navigation_field"]
        ?? picker?.["record_id_field"]
        ?? config["navigation_field"]
        ?? config["record_id_field"],
    ),
    showCode:         boolConfig(picker?.["show_code"] ?? config["show_code"]),
    showDescription:  boolConfig(picker?.["show_description"] ?? config["show_description"]),
    showViewAction:   boolConfig(picker?.["show_view_action"] ?? config["show_view_action"]),
  };
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
  /** Metadata-driven mapping for labels, code/description subtitles, and action visibility. */
  optionConfig?: EntityPickerOptionConfig;

  // ── Mode B: custom search override ───────────────────────────────────────
  /** Custom async search. When provided, entityCode/searchParams are ignored. */
  search?: (query: string) => Promise<EntityPickerOption[]>;

  /** Load options immediately on open without waiting for user input. */
  loadOnOpen?: boolean;
  /** Optional per-option action link. Standard entity mode supplies one automatically. */
  getOptionHref?: (option: EntityPickerOption) => string | null | undefined;
  optionActionLabel?: string;
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
      optionConfig,
      search,
      loadOnOpen = false,
      getOptionHref,
      optionActionLabel,
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
    } = useEntitySearch({
      entityCode: isCustomMode ? null : (entityCode ?? null),
      searchParams,
      optionConfig,
    });

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
    const defaultOptionHref = !isCustomMode && entityCode && optionConfig?.showViewAction !== false
      ? (option: EntityPickerOption) => {
          const recordId = option.recordId ?? option.value;
          return `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`;
        }
      : undefined;

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
        getOptionHref={getOptionHref ?? defaultOptionHref}
        optionActionLabel={optionActionLabel ?? "View record"}
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
